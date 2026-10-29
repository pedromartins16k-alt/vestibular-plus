/**
 * _ai-service.js — Camada desacoplada de IA para Correção de Redações
 * ETAPA 22 — Análise em Duas Fases + Anti-Contradição + Fingerprint
 *
 * Suporta múltiplos provedores:
 * 1. Groq (GROQ_API_KEY) — modelo padrão: openai/gpt-oss-120b
 * 2. Google Gemini (GEMINI_API_KEY) — fallback
 * 3. OpenAI (OPENAI_API_KEY) — fallback
 *
 * Princípios de calibração:
 * - Temperatura 0 para máximo determinismo.
 * - Prompt com rubrica por NÍVEL OFICIAL INEP (não por contagem mecânica de erros).
 * - Separação explícita entre ERRO, PONTO DE ATENÇÃO e SUGESTÃO.
 * - A IA nunca inventa erros — se não há evidência, não penaliza.
 * - Contexto completo da proposta incluído no prompt (textos motivadores, instruções, exigências).
 * - nota_total SEMPRE calculada no backend (soma das competências).
 * - Validação estrutural da resposta antes de retornar.
 * - Detecção de inconsistência entre avaliações da mesma redação.
 * - Avaliação em DUAS FASES: análise por critério → nota como consequência.
 * - Detecção de contradição nota/justificativa (nota 200 com termos negativos).
 * - Fingerprint determinístico para identificar reavaliações da mesma redação.
 */

const TIMEOUT_MS = 28000;

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE DISCREPÂNCIA — Limites de consistência entre reavaliações
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITE_DISCREPANCIA_CRITICA      = 100; // >100 pts total → inconsistente
export const LIMITE_DISCREPANCIA_SIGNIFICATIVA = 80;  // 81-100 pts → alta
export const LIMITE_DISCREPANCIA_MODERADA      = 40;  // 41-80 pts → moderada
export const LIMITE_DISCREPANCIA_COMPETENCIA   = 80;  // >80 pts em UMA competência → crítica

// ─────────────────────────────────────────────────────────────────────────────
// VERSÃO DA RUBRICA — fingerprint de versão para rastreabilidade
// ─────────────────────────────────────────────────────────────────────────────

export const VERSAO_RUBRICA = 'enem-v5-2026';

// ─────────────────────────────────────────────────────────────────────────────
// classificarDiscrepancia — 4 níveis + verificação por competência individual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifica a discrepância entre duas avaliações da mesma redação.
 *
 * @param {number} notaAnterior - Nota total da avaliação anterior
 * @param {number} notaNova - Nota total da nova avaliação
 * @param {Array}  [competenciasAnteriores] - Array de competências da avaliação anterior
 * @param {Array}  [competenciasNovas] - Array de competências da nova avaliação
 * @returns {{ diferenca: number, classificacao: string, label: string, discrepanciaCompetencia: object|null }}
 */
export function classificarDiscrepancia(notaAnterior, notaNova, competenciasAnteriores, competenciasNovas) {
  const diferenca = notaNova - notaAnterior;
  const abs = Math.abs(diferenca);
  let classificacao, label;

  if (abs > LIMITE_DISCREPANCIA_CRITICA) {
    classificacao = 'inconsistente';
    label = `⚠️ Variação crítica (+${Math.abs(diferenca)} pts): diferença acima de ${LIMITE_DISCREPANCIA_CRITICA} pts. Ambas as avaliações preservadas para diagnóstico.`;
  } else if (abs > LIMITE_DISCREPANCIA_SIGNIFICATIVA) {
    classificacao = 'alta';
    label = `⚠️ Variação alta (${diferenca > 0 ? '+' : ''}${diferenca} pts): diferença entre 81 e 100 pts.`;
  } else if (abs > LIMITE_DISCREPANCIA_MODERADA) {
    classificacao = 'moderada';
    label = `Variação moderada (${diferenca > 0 ? '+' : ''}${diferenca} pts): diferença entre 41 e 80 pts.`;
  } else {
    classificacao = 'normal';
    label = `Variação pequena (${diferenca > 0 ? '+' : ''}${diferenca} pts): dentro do intervalo esperado.`;
  }

  // Verificar discrepância por competência individual
  let discrepanciaCompetencia = null;
  if (Array.isArray(competenciasAnteriores) && Array.isArray(competenciasNovas)) {
    for (let i = 0; i < Math.min(competenciasAnteriores.length, competenciasNovas.length); i++) {
      const diffC = Math.abs((competenciasNovas[i]?.nota || 0) - (competenciasAnteriores[i]?.nota || 0));
      if (diffC > LIMITE_DISCREPANCIA_COMPETENCIA) {
        discrepanciaCompetencia = {
          competencia: i + 1,
          nome: competenciasNovas[i]?.nome || `C${i + 1}`,
          nota_anterior: competenciasAnteriores[i]?.nota,
          nota_nova: competenciasNovas[i]?.nota,
          diferenca: diffC
        };
        if (classificacao === 'normal' || classificacao === 'moderada') {
          classificacao = 'alta'; // eleva a classificação
          label += ` Atenção: C${i + 1} variou ${diffC} pts.`;
        }
        break;
      }
    }
  }

  return { diferenca, classificacao, label, discrepanciaCompetencia };
}

// ─────────────────────────────────────────────────────────────────────────────
// gerarFingerprintRedacao — identificação determinística de reavaliações
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera um fingerprint determinístico para identificar reavaliações da mesma redação.
 * Baseado no conteúdo normalizado + proposta_id + vestibular_id + versão da rubrica.
 * Permite detectar se o texto já foi avaliado sem precisar de campo no banco.
 * @param {string} texto - Conteúdo da redação
 * @param {string} [propostaId] - ID da proposta
 * @param {string} [vestibularId] - ID do vestibular
 * @returns {string} fingerprint hexadecimal de 8 chars
 */
export function gerarFingerprintRedacao(texto, propostaId = '', vestibularId = '') {
  // Normaliza o texto: minúsculas, remove múltiplos espaços e quebras de linha
  const textoNorm = String(texto || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const chave = `${textoNorm}|${propostaId}|${vestibularId}|${VERSAO_RUBRICA}`;
  // Hash djb2 simples — determinístico sem dependência de crypto
  let hash = 5381;
  for (let i = 0; i < chave.length; i++) {
    hash = ((hash << 5) + hash) ^ chave.charCodeAt(i);
    hash = hash >>> 0; // mantém unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// RUBRICAS POR NÍVEL INEP — usadas na construção do prompt
// Cada nível descreve CONCRETAMENTE o que o texto deve apresentar/ausente.
// Isso reduz a subjetividade da IA e aumenta a consistência entre chamadas.
// ─────────────────────────────────────────────────────────────────────────────

const RUBRICA_C1 = `
COMPETÊNCIA 1 — Domínio da Modalidade Escrita Formal
Avalie: ortografia, acentuação, pontuação, concordância verbal e nominal,
regência, crase, colocação pronominal, estrutura sintática e adequação vocabular ao registro formal.

ESCALA OFICIAL INEP — use SOMENTE estes valores:
• 200 pts → Excelente: estrutura sintática exemplar e no máximo dois desvios gramaticais/leves e isolados que não comprometam a leitura. Vocabulário preciso e adequado.
  ATENÇÃO: Se o texto apresentar truncamentos recorrentes, desvios repetidos de pontuação/concordância ou vocabulário impreciso/repetitivo que demande recomendação substancial de revisão lexical, a nota DEVE ser 160 pts ou inferior. Nota 200 é INCOMPATÍVEL com críticas a desvios vocabulares ou repetições excessivas no feedback.
• 160 pts → Bom: poucos desvios gramaticais e de convenções da escrita (2 a 4), ou estrutura sintática boa com pequenos deslizes locais. Vocabulário satisfatório com pontuais repetições.
• 120 pts → Médio: desvios presentes com alguma frequência, não dominantes. O texto é compreensível, mas a norma culta não é plenamente dominada.
• 80 pts → Insuficiente: muitos desvios, frequentes, que dificultam a leitura em alguns momentos. Estrutura sintática deficitária.
• 40 pts → Precário: desvios graves e sistemáticos que prejudicam seriamente a compreensão.
• 0 pts → Apenas marcas de escrita (texto incompreensível) ou extensão mínima inadequada.

IMPORTANTE:
- Não penalize pelo estilo ou pelo fato de uma frase "poder ser mais bonita".
- O INEP não proíbe qualquer repetição lexical natural ou termos essenciais ao tema; apenas repetições monótonas excessivas sem recurso anafórico justificam penalização.
- A nota deve ser proporcional à quantidade, frequência e gravidade dos desvios encontrados.
- Cite cada desvio real com o trecho exato onde ocorre.
- Se atribuir 200 pts, a justificativa deve atestar formalmente excelência e não apontar falhas lexicais.
- Sugestão pedagógica de refinamento estilístico opcional NÃO é erro gramatical nem impede nota 200 se a estrutura sintática for exemplar.`;

const RUBRICA_C2 = `
COMPETÊNCIA 2 — Compreensão da Proposta e Aplicação de Repertório Sociocultural
Avalie DOIS aspectos inseparáveis:

ASPECTO A — Compreensão e resposta ao tema e ao tipo textual:
- O candidato respondeu ao recorte temático completo da proposta (e não apenas ao assunto amplo)?
- Fuga total ao tema → 0 pts nesta competência e anulação do texto no ENEM.
- Tangenciamento do tema → nota limitada a 80 pts.
- Estrutura dissertativo-argumentativa em prosa com introdução, desenvolvimento e conclusão.

ASPECTO B — Repertório sociocultural (critério de produtividade):
- Legitimado: respaldado por áreas do conhecimento formal (leis, autores, dados, história, filosofia, sociologia, arte, ciência).
- Pertinente: tem relação direta com o tema em discussão.
- Produtivo: o repertório é articulado ativamente à defesa do ponto de vista do candidato, gerando desdobramento argumentativo.

ESCALA OFICIAL INEP:
• 200 pts → Desenvolve o tema por meio de argumentação consistente a partir de um repertório sociocultural LEGITIMADO, PERTINENTE e com USO EFETIVAMENTE PRODUTIVO vinculado à tese.
  FRONTEIRA 160 vs 200:
  - Se o texto apenas menciona ou cita um dado/lei (ex: Lei 10.639/03) mas NÃO aprofunda sua relação crítica com a argumentação, ou se o repertório é restrito/apenas pontual sem demonstrar pleno domínio produtivo nos desenvolvimentos, a nota DEVE SER 160 PTS.
  - Repertório legitimado e pertinente, mas com uso decorativo, parcial ou pouco articulado ao ponto de vista = 160 pts.
  - Para 200 pts, é indispensável que o repertório esteja plenamente integrado à cadeia argumentativa.
  - DIRETRIZ OFICIAL: O INEP não exige repertório famoso, clássico ou um número mínimo de referências; um único repertório legitimado, pertinente e com uso produtivo na defesa da tese é suficiente para atingir o nível máximo (200 pts).
• 160 pts → Compreende a proposta, aplica conceitos das várias áreas do conhecimento e desenvolve o tema com repertório pertinente, porém com USO PARCIALMENTE PRODUTIVO ou sem desdobramento analítico aprofundado.
• 120 pts → Desenvolve o tema recorrendo à cópia de trechos dos textos motivadores ou apresentando repertório baseado unicamente no senso comum, sem legitimação por áreas do saber.
• 80 pts → Tangencia o tema ou desenvolve o tema com traços constantes de outros tipos textuais. Repertório frágil/ausente.
• 40 pts → Desenvolve o tema de forma muito precária ou tangencia gravemente a proposta.
• 0 pts → Fuga total ao tema ou não atendimento ao tipo dissertativo-argumentativo.`;

const RUBRICA_C3 = `
COMPETÊNCIA 3 — Seleção, Relação, Organização e Interpretação de Informações (Projeto de Texto)
Avalie a coerência, a consistência do projeto de texto e a defesa do ponto de vista.

O QUE ANALISAR:
- Projeto de texto estratégico: introdução contextualizada com tese explícita; desenvolvimentos planejados; conclusão articulada.
- Desenvolvimento dos argumentos: cada argumento apresenta causas, consequências, dados explicativos ou desdobramentos lógicos?
- Lacunas argumentativas: se o autor afirma algo relevante mas deixa sem explicação ("por que isso acontece?", "como isso se manifesta?"), há falha de desenvolvimento.

ESCALA OFICIAL INEP:
• 200 pts → Projeto de texto estratégico, sem falhas de desenvolvimento, com argumentos consistentes e progressão temática autônoma. Tese plenamente defendida em todas as partes.
  FRONTEIRA 160 vs 200:
  - Se a argumentação for clara e organizada, mas apresentar desenvolvimento sucinto, lacunas pontuais de aprofundamento ou argumentos que se sustentem de forma breve sem explorar detalhadamente causas/efeitos, a nota É 160 PTS.
  - Para 200 pts, a argumentação deve ser consistente e sem lacunas em nenhum dos desenvolvimentos.
  - DIRETRIZ OFICIAL: O INEP não exige aprofundamento ilimitado ou enciclopédico em cada argumento; a consistência argumentativa com defesa estratégica do ponto de vista, encadeamento lógico e sem lacunas substanciais atende ao nível 5 (200 pts).
• 160 pts → Projeto de texto claro com poucos deslizes de organização ou com desenvolvimento satisfatório, mas apresentando pequenas lacunas argumentativas ou desdobramento sucinto de ideias.
• 120 pts → Argumentação previsível, com projeto de texto com falhas visíveis (apenas expõe ideias sem aprofundar a relação com a tese, ou argumentos repetitivos).
• 80 pts → Argumentação desorganizada, contraditória ou com muitas lacunas; projeto de texto muito embrionário.
• 40 pts → Ideias desconexas, sem projeto de texto estruturado.
• 0 pts → Ausência de argumentação ou defesa de ponto de vista.`;

const RUBRICA_C4 = `
COMPETÊNCIA 4 — Conhecimento dos Mecanismos Linguísticos (Coesão)
Avalie a coesão interparágrafos (entre parágrafos) e intraparágrafos (dentro dos parágrafos).

O QUE ANALISAR:
- Diversidade de conectivos e operadores argumentativos (conjunções, preposições, advérbios relacionais).
- Coesão interparágrafos: pelo menos 2 parágrafos com conectivo interparágrafo expressivo no início (ex: "Em primeiro lugar/plano", "Ademais", "Outrossim", "Portanto").
- Coesão intraparágrafos: articulação fluida entre períodos no interior de cada parágrafo.
- Repetição mecânica ou vocabulário coesivo restrito.

ESCALA OFICIAL INEP:
• 200 pts → Emprega de forma expressiva e diversificada os mecanismos coesivos inter e intraparágrafos, com raras ou nenhuma repetição monótona e sem inadequação coesiva.
  FRONTEIRA 160 vs 200:
  - Se houver uso de conectivos adequados, mas com repertório coesivo restrito, ligeiramente mecânico ou com falta de variedade intraparágrafos, a nota É 160 PTS.
  - DIRETRIZ OFICIAL: O INEP não proíbe qualquer repetição lexical natural nem exige variedade máxima em todos os períodos; exige recursos coesivos inter e intraparágrafos diversificados sem repetições mecânicas recorrentes.
• 160 pts → Estrutura coesiva adequada com poucas inadequações ou pontuais repetições de recursos coesivos; conectores interparágrafos presentes.
• 120 pts → Uso de mecanismos coesivos regular, mas com repetições visíveis ou inadequações não dominantes.
• 80 pts → Conectivos insuficientes ou empregados de forma equivocada em trechos importantes do texto.
• 40 pts → Coesão precária; frases justapostas sem articulação lógica.
• 0 pts → Ausência de conectivos ou coesão totalmente caótica.`;

const RUBRICA_C5 = `
COMPETÊNCIA 5 — Proposta de Intervenção Social
Avalie a solução proposta para o problema abordado, em conformidade com os direitos humanos.

OS 5 ELEMENTOS OBRIGATÓRIOS DO INEP:
1. AGENTE: quem executará a medida proposta? (órgão público, ministério, escola, sociedade, etc.)
2. AÇÃO: o que será realizado concretamente? (verbo de ação claro, não intenções genéricas)
3. MEIO / MODO: de que maneira / por quais instrumentos a ação será viabilizada? (por meio de..., mediante..., com recursos...)
4. EFEITO / FINALIDADE: com qual objetivo ou resultado prático? (a fim de..., para que...)
5. DETALHAMENTO: acréscimo de uma informação explicativa, desdobramento específico ou justificativa sobre um dos outros 4 elementos.

ESCALA OFICIAL INEP:
• 200 pts → Proposta completa contendo os CINCO elementos (agente, ação, meio, finalidade e 1 detalhamento claro e específico), plenamente articulada à discussão do texto.
  FRONTEIRA 160 vs 200:
  - Proposta com os 5 elementos em que o detalhamento seja vago, embrionário ou confunda-se superficialmente com o próprio meio sem adicionar informação substantiva clara DEVE RECEBER 160 PTS.
  - Proposta com apenas 4 elementos válidos (faltando o detalhamento ou outro elemento) = 160 PTS.
  - Para 200 pts, os 5 elementos devem ser identificáveis de forma autônoma e inequívoca no texto.
• 160 pts → Elabora proposta com 4 elementos válidos OU com 5 elementos cujo detalhamento seja frágil/tênue.
• 120 pts → Proposta com 3 elementos válidos.
• 80 pts → Proposta com 2 elementos válidos.
• 40 pts → Proposta com 1 elemento válido ou apenas esboço vago de intervenção.
• 0 pts → Ausência de proposta de intervenção OU proposta que viola manifestamente os direitos humanos.

IMPORTANTE:
- Analise estritamente o que está escrito no parágrafo conclusivo/propositivo.
- NÃO invente elementos que o estudante não escreveu.
- O INEP exige exatamente 5 elementos (agente, ação, meio, finalidade e 1 detalhamento). NÃO exija cronograma, prazos ou orçamento financeiro para validar o detalhamento na C5, nem monitoramento contínuo, pois a matriz oficial do INEP não os exige.
- NÃO zere a competência por pequena imperfeição num texto que claramente tentou apresentar proposta.
- Respeitando direitos humanos: verifique se a proposta não viola direitos fundamentais (ex: tortura, linchamento, censura prévia). Se violar, zere apenas a C5 (critério INEP).`;

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUÇÃO DO PROMPT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constrói o prompt completo com rubrica oficial por nível INEP.
 * Implementa avaliação em DUAS FASES obrigatórias:
 *   FASE A — Análise por critério (preenchimento de analise_c{N})
 *   FASE B — Nota como consequência da análise
 *
 * @param {object} params
 * @param {string} params.tema - Título/tema da proposta
 * @param {string} params.vestibular - Identificador da banca (ex: 'enem')
 * @param {object} params.matriz - Matriz de critérios da banca
 * @param {string} params.texto - Texto da redação (vem sempre do banco)
 * @param {object} [params.proposta] - Dados completos da proposta (textos motivadores, instruções, etc.)
 */
function construirPromptCorrecao({ tema, vestibular, matriz, texto, proposta }) {
  const nomeBanca = matriz?.nome || vestibular?.toUpperCase() || 'Vestibular';
  const pontuacaoMax = matriz?.pontuacao_maxima || 1000;
  const genero = matriz?.tipo_genero || proposta?.genero || 'Dissertativo-argumentativo em prosa';
  const isEnem = (vestibular || '').toLowerCase() === 'enem' || nomeBanca.toUpperCase().includes('ENEM');
  const competenciasOficiais = matriz?.competencias || [];
  const qtdCompetencias = competenciasOficiais.length > 0 ? competenciasOficiais.length : (isEnem ? 5 : 3);

  // Seção da proposta — inclui textos motivadores e instruções se disponíveis
  let secaoProposta = `- Tema: "${tema}"
- Banca: ${nomeBanca}
- Gênero exigido: ${genero}`;

  if (proposta) {
    if (proposta.instrucoes) {
      secaoProposta += `\n- Instruções da proposta: ${proposta.instrucoes}`;
    }
    if (proposta.enunciado) {
      secaoProposta += `\n- Enunciado: ${proposta.enunciado}`;
    }
    if (proposta.textos_motivadores && proposta.textos_motivadores.length > 0) {
      secaoProposta += `\n- Textos motivadores fornecidos aos candidatos:\n`;
      proposta.textos_motivadores.forEach((t, i) => {
        secaoProposta += `  [Texto ${i + 1}]: "${String(t).substring(0, 600)}${String(t).length > 600 ? '...' : ''}"\n`;
      });
    }
    if (proposta.exigencias) {
      secaoProposta += `\n- Exigências específicas: ${proposta.exigencias}`;
    }
    if (proposta.limite_palavras) {
      secaoProposta += `\n- Limite de palavras/linhas: ${proposta.limite_palavras}`;
    }
  }

  // Rubricas por competência
  let rubricaSecao = '';
  if (isEnem) {
    rubricaSecao = `${RUBRICA_C1}\n\n${RUBRICA_C2}\n\n${RUBRICA_C3}\n\n${RUBRICA_C4}\n\n${RUBRICA_C5}`;
  } else {
    const diretrizesBanca = `ATENÇÃO CRÍTICA PARA A BANCA ${nomeBanca.toUpperCase()}:
- NÃO exija "proposta de intervenção" como critério obrigatório na conclusão (a proposta de intervenção com 5 elementos é exclusiva do ENEM).
- Conclusões analíticas, reflexivas, de síntese ou que abram novas perspectivas filosóficas/sociais são plenamente válidas e esperadas.
- Respeite o perfil de gênero discursivo exigido (${genero}).`;

    rubricaSecao = `${diretrizesBanca}\n\n` + competenciasOficiais.map(c =>
      `--- CRITÉRIO ${c.numero}: ${c.nome} ---\nDescrição: ${c.descricao}\nPeso máximo oficial: ${c.peso} pts.\nNíveis de desempenho de 0 a ${c.peso}:
• Excelente (${Math.round(c.peso * 0.9)} a ${c.peso} pts): Domínio pleno e autônomo do critério, sem falhas perceptíveis.
• Bom (${Math.round(c.peso * 0.7)} a ${Math.round(c.peso * 0.89)} pts): Atendimento satisfatório com pequenas imperfeições isoladas.
• Médio (${Math.round(c.peso * 0.5)} a ${Math.round(c.peso * 0.69)} pts): Atendimento regular com oscilações visíveis na aplicação do critério.
• Insuficiente (${Math.round(c.peso * 0.25)} a ${Math.round(c.peso * 0.49)} pts): Domínio frágil e desenvolvimento precário do critério.
• Ausente / Nulo (0 a ${Math.round(c.peso * 0.24)} pts): Não atendimento do critério ou desvio grave.`
    ).join('\n\n');
  }

  // Bloco de exemplo estruturado de competências conforme a banca ativa
  const competenciasExemploJson = isEnem
    ? `    {
      "numero": 1,
      "nome": "Domínio da modalidade escrita formal",
      "nota": <0|40|80|120|160|200>,
      "nota_maxima": 200,
      "nivel": "<Excelente|Bom|Médio|Insuficiente|Precário|Ausente>",
      "tipo_apontamento": "<ERRO|PONTO_DE_ATENCAO|SUGESTAO>",
      "prioridade": "<alta|media|baixa>",
      "justificativa": "<análise clara de 2-4 frases>",
      "analise": {
        "criterios_atendidos": ["<critério atendido>"],
        "criterios_parciais": ["<critério parcial>"],
        "criterios_ausentes": ["<critério ausente>"]
      },
      "pontos_positivos": ["<aspecto positivo>"],
      "problemas": [],
      "evidencias_textuais": ["<trecho real>"]
    },
    {
      "numero": 2,
      "nome": "Compreensão da Proposta e Aplicação das Áreas do Conhecimento",
      "nota": <0|40|80|120|160|200>,
      "nota_maxima": 200,
      "nivel": "<Excelente|Bom|Médio|Insuficiente|Precário|Ausente>",
      "tipo_apontamento": "<ERRO|PONTO_DE_ATENCAO|SUGESTAO>",
      "prioridade": "<alta|media|baixa>",
      "justificativa": "<análise clara de 2-4 frases>",
      "analise": {
        "criterios_atendidos": ["<critério atendido>"],
        "criterios_parciais": ["<critério parcial>"],
        "criterios_ausentes": ["<critério ausente>"]
      },
      "pontos_positivos": ["<aspecto positivo>"],
      "problemas": [],
      "evidencias_textuais": ["<trecho ou repertório>"]
    },
    {
      "numero": 3,
      "nome": "Seleção, Relação, Organização e Interpretação de Informações",
      "nota": <0|40|80|120|160|200>,
      "nota_maxima": 200,
      "nivel": "<Excelente|Bom|Médio|Insuficiente|Precário|Ausente>",
      "tipo_apontamento": "<ERRO|PONTO_DE_ATENCAO|SUGESTAO>",
      "prioridade": "<alta|media|baixa>",
      "justificativa": "<análise clara de 2-4 frases>",
      "analise": {
        "criterios_atendidos": ["<critério atendido>"],
        "criterios_parciais": ["<critério parcial>"],
        "criterios_ausentes": ["<critério ausente>"]
      },
      "pontos_positivos": ["<aspecto positivo>"],
      "problemas": [],
      "evidencias_textuais": ["<trecho ou argumento>"]
    },
    {
      "numero": 4,
      "nome": "Demonstração de Conhecimento dos Mecanismos Linguísticos",
      "nota": <0|40|80|120|160|200>,
      "nota_maxima": 200,
      "nivel": "<Excelente|Bom|Médio|Insuficiente|Precário|Ausente>",
      "tipo_apontamento": "<ERRO|PONTO_DE_ATENCAO|SUGESTAO>",
      "prioridade": "<alta|media|baixa>",
      "justificativa": "<análise clara de 2-4 frases>",
      "analise": {
        "criterios_atendidos": ["<critério atendido>"],
        "criterios_parciais": ["<critério parcial>"],
        "criterios_ausentes": ["<critério ausente>"]
      },
      "pontos_positivos": ["<aspecto positivo>"],
      "problemas": [],
      "evidencias_textuais": ["<trecho ou conectivo>"]
    },
    {
      "numero": 5,
      "nome": "Proposta de Intervenção",
      "nota": <0|40|80|120|160|200>,
      "nota_maxima": 200,
      "nivel": "<Excelente|Bom|Médio|Insuficiente|Precário|Ausente>",
      "tipo_apontamento": "<ERRO|PONTO_DE_ATENCAO|SUGESTAO>",
      "prioridade": "<alta|media|baixa>",
      "justificativa": "<análise clara de 2-4 frases>",
      "analise": {
        "criterios_atendidos": ["<critério atendido>"],
        "criterios_parciais": ["<critério parcial>"],
        "criterios_ausentes": ["<critério ausente>"],
        "elementos_proposta": {
          "agente": "presente|ausente|insuficiente",
          "acao": "presente|ausente|insuficiente",
          "meio": "presente|ausente|insuficiente",
          "finalidade": "presente|ausente|insuficiente",
          "detalhamento": "presente|ausente|insuficiente",
          "relacao_com_problema": "forte|media|fraca"
        }
      },
      "pontos_positivos": ["<aspecto positivo>"],
      "problemas": [],
      "evidencias_textuais": ["<trecho da proposta>"]
    }`
    : competenciasOficiais.map(c => `    {
      "numero": ${c.numero},
      "nome": "${c.nome}",
      "nota": <0 a ${c.peso}>,
      "nota_maxima": ${c.peso},
      "nivel": "<Excelente|Bom|Médio|Insuficiente|Precário|Ausente>",
      "tipo_apontamento": "<ERRO|PONTO_DE_ATENCAO|SUGESTAO>",
      "prioridade": "<alta|media|baixa>",
      "justificativa": "<análise de 2-4 frases>",
      "analise": {
        "criterios_atendidos": ["<critério atendido>"],
        "criterios_parciais": ["<critério parcial>"],
        "criterios_ausentes": ["<critério ausente>"]
      },
      "pontos_positivos": ["<aspecto positivo>"],
      "problemas": [],
      "evidencias_textuais": ["<trecho real>"]
    }`).join(',\n');

  const regraEscala = isEnem
    ? `3. ESCALA OBRIGATÓRIA DO ENEM: use SOMENTE 0, 40, 80, 120, 160 ou 200 para cada competência. Valores como 70, 90, 110, 130, 150, 170 ou 190 são PROIBIDOS.`
    : `3. ESCALA DA BANCA ${nomeBanca}: a nota de cada competência deve ser um número inteiro entre 0 e seu peso máximo oficial especificado na matriz.`;

  return `Você é um avaliador especialista em redações de vestibulares brasileiros, com domínio da matriz de avaliação da banca ${nomeBanca}.

Sua função é avaliar a redação abaixo seguindo ESTRITAMENTE as rubricas oficiais por nível. Não atribua notas por impressão geral.

Retorne EXCLUSIVAMENTE um único objeto JSON válido, iniciando imediatamente com { e terminando com }, sem texto antes ou depois, sem explicações fora do JSON e sem blocos markdown.

A análise pedagógica de cada competência (critérios atendidos, parciais e ausentes) deve ser registrada internamente no campo "analise" do JSON, garantindo que a nota atribuída seja consequência direta dessa análise.

═══════════════════════════════════════════════════
PROPOSTA DE REDAÇÃO:
${secaoProposta}
═══════════════════════════════════════════════════

TEXTO DO CANDIDATO:
"""
${texto}
"""

═══════════════════════════════════════════════════
REGRAS FUNDAMENTAIS (obrigatórias):

1. AVALIAR SOMENTE O QUE ESTÁ ESCRITO.
   É PROIBIDO:
   - Inventar erros gramaticais, fuga ao tema, falta de repertório, falta de argumento ou ausência de proposta que não estejam evidenciados no texto.
   - Afirmar que o candidato escreveu algo que não está no texto.
   - Presumir intenção sem evidência textual.
   - Penalizar por coisas que poderiam ser "mais bonitas" mas não são erros.

2. SEPARAR OBRIGATORIAMENTE:
   - ERRO: algo que realmente prejudica a competência avaliada.
   - PONTO_DE_ATENCAO: algo que pode ser melhorado, mas não reduz muito a nota.
   - SUGESTAO: maneira de deixar o texto ainda melhor (não penaliza).

${regraEscala}

4. FUGA AO TEMA: somente se o texto aborda assunto completamente diferente do tema proposto.
   Tangenciamento ≠ fuga. Tangenciamento limita os critérios temáticos mas não os zera automaticamente.

5. EXTENSÃO MÍNIMA: texto com menos de 7 linhas completas → todas as competências recebem 0.

6. NOTA TOTAL: NÃO declare uma "nota geral" por impressão. O campo nota_total deve ser a SOMA EXATA das competências da banca.

7. EVIDÊNCIA OBRIGATÓRIA: cada nota deve ter ao menos 1 evidência textual (trecho real ou paráfrase do texto avaliado).
   Se não encontrar problema, diga explicitamente "nenhum desvio identificado nesta competência".

8. ANTI-CONTRADIÇÃO E COERÊNCIA OBRIGATÓRIAS:
   - Se a nota de uma competência for máxima (200 no ENEM), a justificativa e os feedbacks NÃO podem conter críticas ou apontamentos de deficiência, tais como:
     "há problemas", "faltam elementos", "poderia ser melhor", "insuficiente", "parcialmente", "limitado", "fraco",
     "desenvolvimento inadequado", "pouco detalhamento", "detalhamento frágil", "detalhamento tênue", "repetições",
     "ampliar vocabulário", "repetição excessiva", "truncamento", "repertório pouco aprofundado", "ausência de".
   - Se houver recomendação pedagógica de melhoria substantiva para a competência (como enriquecer vocabulário na C1, aprofundar repertório na C2, expandir argumentos na C3, variar conectivos na C4 ou enriquecer detalhamento na C5), a pontuação DEVE SER 160 PTS ou inferior, e JAMAIS 200 PTS.
   - Uma nota 200 PTS exige excelência demonstrada e justificativa que comprove o atendimento integral de todos os requisitos do nível máximo.

9. NOTAS MÁXIMAS EXIGEM JUSTIFICATIVA FORTE com base no texto, sem elogios vazios ou clichês.
═══════════════════════════════════════════════════

RUBRICAS OFICIAIS POR COMPETÊNCIA:
${rubricaSecao}

═══════════════════════════════════════════════════
FORMATO DE RESPOSTA — Retorne SOMENTE este JSON (sem markdown):
{
  "nota_total": <SOMA_EXATA_DAS_COMPETENCIAS>,
  "nota_maxima": ${pontuacaoMax},
  "competencias": [
${competenciasExemploJson}
  ],
  "pontos_fortes": ["<ponto forte global do texto, com base em evidência>"],
  "pontos_melhoria": ["<melhoria prioritária global, objetiva e aplicável>"],
  "exemplos_trechos": ["<trecho original do texto> → <reescrita sugerida>"],
  "sugestoes": ["<sugestão prática de estudo para o próximo texto>"],
  "prioridades_estudo": ["<prioridade identificada com base nos problemas reais encontrados>"],
  "feedback_geral": "<parecer pedagógico de 3-5 frases: o que o texto faz bem, o que precisa melhorar, como evoluir>",
  "aviso_educacional": "Esta avaliação é uma estimativa pedagógica gerada por inteligência artificial para fins de treino. Não substitui a correção oficial da banca examinadora."
}

REGRA ABSOLUTA DE INTEGRIDADE:
- O array "competencias" DEVE conter EXATAMENTE as ${qtdCompetencias} competências oficiais da banca.
- Nunca omita, resuma ou deixe de fora nenhuma competência da matriz.
- Responda estritamente com o objeto JSON.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAMADAS AOS PROVEDORES
// ─────────────────────────────────────────────────────────────────────────────

async function chamarGroq(apiKey, prompt, timeoutMs = TIMEOUT_MS) {
  const modelo = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const timeoutEfetivo = Math.max(1000, Number(timeoutMs) || TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutEfetivo);

  try {
    const body = {
      model: modelo,
      temperature: 0,
      // Aumentado de 4096 para 16384: o modelo gpt-oss-120b (reasoning) usa tokens de raciocínio
      // interno que compartilham este orçamento com o JSON de saída visível. Com 4096, o budget
      // se esgotava antes de completar as 5 competências ENEM (~1800-2500 tokens de JSON visível).
      // O modelo suporta até 65536 tokens de saída (documentação Groq, 2025).
      max_tokens: 16384,
      reasoning_effort: 'medium',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Você é um avaliador especialista em redações de vestibulares. Sua resposta DEVE ser estritamente um único objeto JSON válido, iniciando imediatamente com { e terminando com }, sem texto introdutório, sem conclusões e sem markdown. O array \"competencias\" DEVE conter obrigatoriamente todas as competências oficiais solicitadas (no ENEM: exatamente 5 competências, C1 a C5), sem omitir nenhuma.'
        },
        { role: 'user', content: prompt }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `Erro no serviço Groq (${response.status})`;
      let erroCode = null;
      let erroTipo = 'ERRO_PROVEDOR_IA';
      let amostraFailedGen = null;

      try {
        const p = JSON.parse(errBody);
        if (p.error?.message) msg += `: ${p.error.message}`;
        if (p.error?.code) erroCode = p.error.code;
        if (p.error?.type) erroTipo = p.error.type;
        if (p.error?.failed_generation) {
          // Sanitização estrita: captura no máximo 120 caracteres sem dados pessoais
          amostraFailedGen = String(p.error.failed_generation).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120);
        }
      } catch (_) {}

      // Log estruturado e seguro no servidor (sem tokens, sem redação completa)
      console.warn('[chamarGroq] Falha na API Groq:', {
        status: response.status,
        code: erroCode,
        tipo: erroTipo,
        modelo,
        amostraFailedGen: amostraFailedGen ? `[amostra sanitizada: "${amostraFailedGen}..."]` : null
      });

      const erroIA = new Error(msg);
      erroIA.statusCode = response.status;
      erroIA.errorCode = erroCode;
      erroIA.tipo = erroTipo;
      throw erroIA;
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const rawText = choice?.message?.content;

    // ── Ação D: Log seguro de metadados de uso (sem PII, sem conteúdo da redação) ──
    // reasoning_tokens só existe em respostas de modelos com raciocínio interno.
    const logUso = {
      provedor: 'groq',
      modelo,
      finish_reason: choice?.finish_reason ?? 'ausente',
      prompt_tokens: data.usage?.prompt_tokens ?? null,
      completion_tokens: data.usage?.completion_tokens ?? null,
      reasoning_tokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? null
    };
    console.log('[chamarGroq] Metadados de uso (sem dados sensíveis):', logUso);

    if (!rawText) throw new Error('A Groq retornou uma resposta vazia.');

    if (choice?.finish_reason === 'length') {
      const erroTruncado = new Error('A resposta da IA atingiu o limite de tokens antes de concluir todas as competências.');
      erroTruncado.statusCode = 502;
      erroTruncado.tipo = 'RESPOSTA_TRUNCADA_IA';
      throw erroTruncado;
    }

    // finish_reason inesperado ou ausente: logar mas não bloquear —
    // a validação estrutural downstream (validarENormalizarResposta) garante
    // que respostas incompletas nunca sejam aceitas, independentemente do finish_reason.
    if (choice?.finish_reason && choice.finish_reason !== 'stop') {
      console.warn('[chamarGroq] finish_reason inesperado:', {
        finish_reason: choice.finish_reason,
        modelo
      });
    }

    return { rawText, modelo: `groq/${modelo}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      const erroTimeout = new Error(`Tempo limite excedido ao aguardar resposta da IA (timeout de ${timeoutEfetivo}ms).`);
      erroTimeout.statusCode = 504;
      erroTimeout.tipo = 'TIMEOUT_IA';
      throw erroTimeout;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function chamarGemini(apiKey, prompt, timeoutMs = TIMEOUT_MS) {
  const modelo = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
  const timeoutEfetivo = Math.max(1000, Number(timeoutMs) || TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutEfetivo);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // maxOutputTokens aumentado de 4096 para 8192 (teto oficial do gemini-1.5-flash, Google AI docs).
        // gemini-1.5-flash não suporta valores acima de 8192 via generationConfig.
        generationConfig: { temperature: 0, topP: 1.0, maxOutputTokens: 8192, responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `Erro no serviço Gemini (${response.status})`;
      try { const p = JSON.parse(errBody); if (p.error?.message) msg += `: ${p.error.message}`; } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();

    // ── Ação D: Log seguro de metadados de uso Gemini (sem PII) ──
    const candidate = data.candidates?.[0];
    console.log('[chamarGemini] Metadados de uso (sem dados sensíveis):', {
      provedor: 'gemini',
      modelo,
      finishReason: candidate?.finishReason ?? 'ausente',
      prompt_tokens: data.usageMetadata?.promptTokenCount ?? null,
      completion_tokens: data.usageMetadata?.candidatesTokenCount ?? null
    });

    const rawText = candidate?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('O Gemini retornou uma resposta vazia.');
    return { rawText, modelo: `google/${modelo}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      const erroTimeout = new Error(`Tempo limite excedido ao aguardar resposta da IA (timeout de ${timeoutEfetivo}ms).`);
      erroTimeout.statusCode = 504;
      erroTimeout.tipo = 'TIMEOUT_IA';
      throw erroTimeout;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function chamarOpenAI(apiKey, prompt, timeoutMs = TIMEOUT_MS) {
  const modelo = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';
  const timeoutEfetivo = Math.max(1000, Number(timeoutMs) || TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutEfetivo);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelo,
        temperature: 0,
        // Aumentado de 4096 para 16384 (teto oficial do gpt-4o-mini, OpenAI docs 2025).
        max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Você é um avaliador especialista em redações do ENEM. Avalie SOMENTE o texto fornecido. Responda estritamente em JSON válido.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `Erro no serviço OpenAI (${response.status})`;
      try { const p = JSON.parse(errBody); if (p.error?.message) msg += `: ${p.error.message}`; } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();

    // ── Ação D: Log seguro de metadados de uso OpenAI (sem PII) ──
    const choiceOAI = data.choices?.[0];
    console.log('[chamarOpenAI] Metadados de uso (sem dados sensíveis):', {
      provedor: 'openai',
      modelo,
      finish_reason: choiceOAI?.finish_reason ?? 'ausente',
      prompt_tokens: data.usage?.prompt_tokens ?? null,
      completion_tokens: data.usage?.completion_tokens ?? null
    });

    const rawText = choiceOAI?.message?.content;
    if (!rawText) throw new Error('A OpenAI retornou uma resposta vazia.');
    return { rawText, modelo: `openai/${modelo}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      const erroTimeout = new Error(`Tempo limite excedido ao aguardar resposta da IA (timeout de ${timeoutEfetivo}ms).`);
      erroTimeout.statusCode = 504;
      erroTimeout.tipo = 'TIMEOUT_IA';
      throw erroTimeout;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAÇÃO E NORMALIZAÇÃO DA RESPOSTA
// ─────────────────────────────────────────────────────────────────────────────

const NIVEIS_VALIDOS = ['Excelente', 'Bom', 'Médio', 'Insuficiente', 'Precário', 'Ausente'];
const TIPOS_APONTAMENTO_VALIDOS = ['ERRO', 'PONTO_DE_ATENCAO', 'SUGESTAO'];

// Frases negativas incompatíveis com nota máxima (200)
const FRASES_NEGATIVAS = [
  'há problemas', 'faltam elementos', 'poderia ser melhor', 'insuficiente',
  'parcialmente', 'limitado', 'fraco', 'desenvolvimento inadequado',
  'pouco detalhamento', 'detalhamento frágil', 'detalhamento tênue', 'detalhamento muito tênue',
  'repetição excessiva', 'repetições excessivas', 'ampliar vocabulário', 'enriquecer vocabulário',
  'repertório pouco aprofundado', 'ausência de', 'ausente', 'não atende', 'precário'
];

/**
 * Valida e normaliza a resposta da IA.
 *
 * Regras críticas:
 * 1. JSON válido obrigatório.
 * 2. Nota de cada competência deve ser múltipla de 40 (para o ENEM).
 * 3. nota_total é SEMPRE a soma das competências calculada no backend — valor da IA descartado.
 * 4. Normaliza os campos: nivel, pontos_positivos, problemas (com tipo), evidencias_textuais, analise.
 * 5. Mantém compatibilidade com campos legados (evidencias, problemas como strings).
 * 6. Detecta contradição nota 200 / justificativa negativa (nota_suspeita + aviso_contradicao).
 * 7. Normaliza o campo analise por competência, incluindo elementos_proposta para C5.
 * 8. Adiciona rubrica_versao ao objeto final.
 *
 * @param {string} rawText - Texto bruto retornado pela IA
 * @param {object} matriz - Matriz de critérios da banca
 * @param {string} modeloUsado - Identificador do modelo utilizado
 * @param {string} [texto] - Texto original da redação (usado para verificação de evidências)
 * @returns {object} Resultado normalizado e validado
 */
export function validarENormalizarResposta(rawText, matriz, modeloUsado, texto) {
  let cleaned = (rawText || '').trim();

  // Remove markdown codeblock ```json ... ``` se presente
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Falha ao interpretar resposta estruturada da IA. Formato JSON inválido.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('A resposta da IA não corresponde a um objeto estruturado.');
  }

  const pontuacaoMaximaOficial = Number(matriz?.pontuacao_maxima) || 1000;
  const competenciasOficiais = matriz?.competencias || [];
  const isEnem = (matriz?.nome || '').toUpperCase().includes('ENEM');

  if (!Array.isArray(parsed.competencias) || parsed.competencias.length === 0) {
    throw new Error('A resposta da IA não contém a lista de competências obrigatória.');
  }

  // ETAPA 25.3: Validação estrita de integridade das competências
  // Constrói o conjunto oficial de identificadores esperados a partir da matriz da banca
  const identificadoresOficiais = competenciasOficiais.map(c => Number(c.numero)).filter(n => Number.isInteger(n) && n > 0);
  const qtdEsperada = identificadoresOficiais.length > 0 ? identificadoresOficiais.length : (isEnem ? 5 : 0);

  if (qtdEsperada > 0 && parsed.competencias.length !== qtdEsperada) {
    throw new Error(
      `A avaliação está incompleta: esperadas ${qtdEsperada} competências (${isEnem ? 'C1 a C5' : 'oficiais da banca'}), mas a IA retornou apenas ${parsed.competencias.length}. Nenhuma nota parcial será atribuída.`
    );
  }

  // Validação estrita dos identificadores retornados pela IA (sem fallbacks silenciosos como `|| (i + 1)`)
  if (qtdEsperada > 0) {
    const conjuntoEsperado = new Set(identificadoresOficiais.length > 0 ? identificadoresOficiais : [1, 2, 3, 4, 5]);
    const identificadoresRecebidos = [];

    for (let i = 0; i < parsed.competencias.length; i++) {
      const c = parsed.competencias[i];
      if (c === null || typeof c !== 'object') {
        throw new Error(`A competência na posição ${i + 1} é inválida ou não é um objeto.`);
      }

      // Rejeita identificador ausente, nulo, booleano, string vazia ou não inteira
      if (c.numero === undefined || c.numero === null || c.numero === '' || typeof c.numero === 'boolean') {
        throw new Error(
          `Identificador de competência ausente ou inválido na posição ${i + 1}. Valores nulos ou vazios não são aceitos.`
        );
      }

      const numParsed = Number(c.numero);
      if (!Number.isInteger(numParsed) || numParsed <= 0) {
        throw new Error(
          `Identificador de competência inválido na posição ${i + 1}: "${c.numero}". Deve ser um número inteiro positivo pertencente à matriz oficial.`
        );
      }

      if (!conjuntoEsperado.has(numParsed)) {
        throw new Error(
          `Competência inesperada identificada: ${numParsed}. A matriz da banca reconhece apenas as competências: [${Array.from(conjuntoEsperado).join(', ')}].`
        );
      }

      identificadoresRecebidos.push(numParsed);
    }

    // Rejeita duplicatas antes de validar faltantes
    const conjuntoRecebidos = new Set(identificadoresRecebidos);
    if (identificadoresRecebidos.length !== conjuntoRecebidos.size) {
      throw new Error(
        `A avaliação contém competências duplicadas: esperadas ${qtdEsperada} competências distintas. Nenhuma nota parcial será atribuída.`
      );
    }

    // Confirma que todas as competências da matriz estão presentes
    for (const esperado of conjuntoEsperado) {
      if (!conjuntoRecebidos.has(esperado)) {
        throw new Error(
          `A avaliação está incompleta: a competência C${esperado} da matriz oficial não foi retornada pela IA. Nenhuma nota parcial será atribuída.`
        );
      }
    }

    // Ordena as competências estritamente pelo número oficial da matriz após a validação
    parsed.competencias.sort((a, b) => Number(a.numero) - Number(b.numero));
  }

  const competenciasNormalizadas = parsed.competencias.map((comp, idx) => {
    const numeroComp = Number(comp.numero);
    // Pareia estritamente pelo número oficial na matriz
    const oficial = competenciasOficiais.find(c => Number(c.numero) === numeroComp) || competenciasOficiais[idx] || {};
    const pesoMax = Number(oficial.peso) || Number(comp.nota_maxima) || 200;
    if (comp.nota === undefined || comp.nota === null || comp.nota === '' || typeof comp.nota === 'boolean') {
      throw new Error(`Competência ${numeroComp} retornou nota não-numérica: ausente ou tipo inválido.`);
    }

    const notaBruta = Number(comp.nota);

    if (isNaN(notaBruta) || !Number.isFinite(notaBruta)) {
      throw new Error(`Competência ${numeroComp} retornou nota não-numérica: "${comp.nota}".`);
    }

    let notaClamped;

    // Regra ENEM: estrita, sem clamp ou quantização silenciosa de notas inválidas
    if (isEnem && pesoMax === 200) {
      if (notaBruta < 0 || notaBruta > 200) {
        throw new Error(
          `Competência C${numeroComp} retornou nota fora da escala oficial do ENEM (0 a 200): ${comp.nota}. Valores fora da escala devem ser rejeitados.`
        );
      }
      const INCREMENTOS_ENEM = [0, 40, 80, 120, 160, 200];
      if (!INCREMENTOS_ENEM.includes(notaBruta)) {
        throw new Error(
          `Competência C${numeroComp} retornou nota fora dos incrementos válidos de 40 pontos do ENEM (0, 40, 80, 120, 160, 200): ${comp.nota}. Valores fora dos incrementos devem ser rejeitados.`
        );
      }
      notaClamped = notaBruta;
    } else {
      // Demais bancas: comportamento existente preservado (clamp dentro do intervalo válido)
      notaClamped = Math.max(0, Math.min(pesoMax, Math.round(notaBruta)));
    }

    const justificativa = String(comp.justificativa || '').trim();
    if (justificativa.length < 20) {
      console.warn(`[_ai-service] Competência ${idx + 1} sem justificativa adequada (${justificativa.length} chars).`);
    }

    // Normaliza nivel
    const nivelRaw = String(comp.nivel || '').trim();
    const nivel = NIVEIS_VALIDOS.includes(nivelRaw) ? nivelRaw : _inferirNivel(notaClamped, pesoMax);

    // Normaliza pontos_positivos (novo campo)
    const pontosPositivos = Array.isArray(comp.pontos_positivos)
      ? comp.pontos_positivos.map(String)
      : [];

    // Normaliza problemas — aceita array de strings (legado) ou array de objetos (novo formato)
    let problemasNormalizados = [];
    if (Array.isArray(comp.problemas)) {
      problemasNormalizados = comp.problemas.map(p => {
        if (typeof p === 'string') {
          return { tipo: 'ERRO', descricao: p, trecho_original: '', sugestao_reescrita: '' };
        }
        const tipo = TIPOS_APONTAMENTO_VALIDOS.includes(p.tipo) ? p.tipo : 'PONTO_DE_ATENCAO';
        return {
          tipo,
          descricao: String(p.descricao || p.description || ''),
          trecho_original: String(p.trecho_original || p.trecho || ''),
          sugestao_reescrita: String(p.sugestao_reescrita || p.sugestao || '')
        };
      });
    }

    // Normaliza evidencias_textuais (novo campo) com fallback para evidencias (legado)
    const evidenciasTextuais = Array.isArray(comp.evidencias_textuais)
      ? comp.evidencias_textuais.map(String)
      : Array.isArray(comp.evidencias)
        ? comp.evidencias.map(String)
        : [];

    // tipo_apontamento: derivado do pior tipo de problema nesta competência.
    // Prioridade: ERRO > PONTO_DE_ATENCAO > SUGESTAO.
    // Se a IA retornar explicitamente, valida. Caso contrário, inferimos dos problemas.
    const tipoApontamentoExplicito = String(comp.tipo_apontamento || '').trim().toUpperCase();
    const tipoApontamento = TIPOS_APONTAMENTO_VALIDOS.includes(tipoApontamentoExplicito)
      ? tipoApontamentoExplicito
      : _inferirTipoApontamento(problemasNormalizados);

    // prioridade: alta (nota < 120), media (= 120), baixa (> 120)
    const prioridadeExplicita = String(comp.prioridade || '').trim().toLowerCase();
    const prioridade = ['alta', 'media', 'baixa'].includes(prioridadeExplicita)
      ? prioridadeExplicita
      : _inferirPrioridade(notaClamped, pesoMax);

    // ── Normaliza campo analise por competência ──────────────────────────────
    const analise = comp.analise && typeof comp.analise === 'object' ? {
      criterios_atendidos: Array.isArray(comp.analise.criterios_atendidos)
        ? comp.analise.criterios_atendidos.map(String)
        : [],
      criterios_parciais: Array.isArray(comp.analise.criterios_parciais)
        ? comp.analise.criterios_parciais.map(String)
        : [],
      criterios_ausentes: Array.isArray(comp.analise.criterios_ausentes)
        ? comp.analise.criterios_ausentes.map(String)
        : [],
      // elementos_proposta apenas para C5
      elementos_proposta: (numeroComp === 5 && comp.analise.elementos_proposta)
        ? comp.analise.elementos_proposta
        : undefined
    } : {
      criterios_atendidos: [],
      criterios_parciais: [],
      criterios_ausentes: []
    };

    // ── Detecção de contradição nota/justificativa ───────────────────────────
    // Considera a competência relacionada, a gravidade da limitação e a rubrica oficial.
    // Sugestão pedagógica leve de refinamento estilístico NÃO gera contradição na nota 200.
    // Fragilidades estruturais relevantes apontadas na justificativa geram nota_suspeita.
    let notaSuspeita = false;
    let avisoContradicao = null;

    if (notaClamped === 200) {
      const justLower = justificativa.toLowerCase();

      // Verifica se é puramente uma sugestão pedagógica leve de estilo ou vocabulário futuro
      const isSugestaoEstilisticaLeve =
        (justLower.includes('como sugestão') || justLower.includes('sugestão pedagógica') ||
         justLower.includes('refinamento futuro') || justLower.includes('como aprimoramento') ||
         justLower.includes('sugestão estilística') || justLower.includes('aperfeiçoamento futuro') ||
         justLower.includes('sugestão de aperfeiçoamento')) &&
        !justLower.includes('excessiv') &&
        !justLower.includes('recorrente') &&
        !justLower.includes('grave') &&
        !justLower.includes('inadequado') &&
        !justLower.includes('inadequada') &&
        !justLower.includes('insuficiente') &&
        !justLower.includes('falha');

      if (!isSugestaoEstilisticaLeve) {
        // 1. Fragilidades estruturais gerais graves (incompatíveis com nível 5 em qualquer competência)
        const termosGeraisGraves = [
          'insuficiente', 'precário', 'desenvolvimento inadequado', 'não atende',
          'muito fraco', 'ausência completa', 'compromete a leitura', 'incoerente',
          'parcialmente', 'há problemas'
        ];
        const conflitoGeral = termosGeraisGraves.find(t => justLower.includes(t));

        if (conflitoGeral) {
          notaSuspeita = true;
          avisoContradicao = `Nota 200 com justificativa que aponta fragilidade estrutural grave ("${conflitoGeral}"). Nota pode estar superestimada.`;
          console.warn(`[_ai-service] Contradição geral C${numeroComp}: nota 200 mas menciona "${conflitoGeral}"`);
        } else {
          // 2. Fragilidades estruturais específicas por competência oficial do INEP
          const limitacoesPorComp = {
            1: [
              'desvios frequentes', 'desvios recorrentes', 'desvios gramaticais recorrentes',
              'problemas sintáticos', 'truncamento sintático recorrente', 'falhas gramaticais',
              'repetições excessivas', 'repetição excessiva', 'vocabulário impreciso',
              'enriquecer vocabulário', 'ampliar vocabulário'
            ],
            2: [
              'repertório pouco produtivo', 'repertório não legitimado', 'repertório ausente',
              'repertório pouco aprofundado', 'pouco aprofundado',
              'tangenciamento', 'tangencial', 'fuga parcial', 'repertório desconectado', 'repertório frágil'
            ],
            3: [
              'lacuna argumentativa', 'lacunas argumentativas', 'argumentação superficial',
              'projeto de texto com falhas', 'argumentos contraditórios', 'incoerência argumentativa',
              'falta de autoria', 'projeto falho'
            ],
            4: [
              'repetições excessivas', 'repetição excessiva', 'ausência de conectivos',
              'conectivos inadequados', 'problemas de coesão', 'problemas de articulação',
              'falta de encadeamento', 'coesão precária'
            ],
            5: [
              'proposta incompleta', 'detalhamento frágil', 'detalhamento tênue', 'detalhamento muito tênue',
              'detalhamento ausente', 'pouco detalhamento', 'faltam elementos', 'menos de 5 elementos',
              'ausência de agente', 'ausência de ação', 'ausência de meio', 'ausência de efeito'
            ]
          };

          const listaComp = limitacoesPorComp[numeroComp] || [];
          const conflitoComp = listaComp.find(t => justLower.includes(t));
          if (conflitoComp) {
            notaSuspeita = true;
            avisoContradicao = `Nota 200 em C${numeroComp} com justificativa que menciona "${conflitoComp}". Nota pode estar superestimada.`;
            console.warn(`[_ai-service] Contradição C${numeroComp}: nota 200 mas menciona "${conflitoComp}"`);
          }
        }
      }
    }

    const resultado = {
      numero: numeroComp,
      nome: String(comp.nome || oficial.nome || `Competência ${numeroComp}`),
      nota: notaClamped,
      nota_maxima: pesoMax,
      nivel,
      tipo_apontamento: tipoApontamento,
      prioridade,
      justificativa: justificativa || 'Avaliação pedagógica fundamentada nos critérios oficiais da banca.',
      analise,
      pontos_positivos: pontosPositivos,
      problemas: problemasNormalizados,
      evidencias_textuais: evidenciasTextuais,
      // Campos legados mantidos para compatibilidade com frontend e testes existentes
      evidencias: evidenciasTextuais,
    };

    // Adiciona campos de contradição somente quando detectados
    if (notaSuspeita) {
      resultado.nota_suspeita = true;
      resultado.aviso_contradicao = avisoContradicao;
    }

    return resultado;
  });

  // REGRA CRÍTICA: nota_total = soma das competências normalizadas (valor da IA descartado)
  const notaCalculadaBackend = competenciasNormalizadas.reduce((acc, c) => acc + c.nota, 0);

  if (notaCalculadaBackend > pontuacaoMaximaOficial) {
    throw new Error(
      `Soma das competências (${notaCalculadaBackend}) excede o máximo oficial (${pontuacaoMaximaOficial}). Resposta inválida.`
    );
  }

  let pontosFortes = Array.isArray(parsed.pontos_fortes) ? parsed.pontos_fortes.map(String).filter(s => s.trim().length > 0) : [];
  let pontosMelhoria = Array.isArray(parsed.pontos_melhoria) ? parsed.pontos_melhoria.map(String).filter(s => s.trim().length > 0) : [];

  // ETAPA 26.1: Síntese rigorosa — se a IA omitir os arrays globais, extrai estritamente de apontamentos concretos
  // NUNCA inventa falha ou elogio genérico apenas pela nota numérica.
  if (pontosFortes.length === 0) {
    competenciasNormalizadas.forEach(c => {
      if (Array.isArray(c.pontos_positivos) && c.pontos_positivos.length > 0) {
        c.pontos_positivos.forEach(pp => {
          const ppStr = String(pp || '').trim();
          if (ppStr && !pontosFortes.includes(ppStr)) pontosFortes.push(`[${c.nome}] ${ppStr}`);
        });
      }
    });
  }

  if (pontosMelhoria.length === 0) {
    competenciasNormalizadas.forEach(c => {
      if (Array.isArray(c.problemas) && c.problemas.length > 0) {
        c.problemas.forEach(prob => {
          const desc = (typeof prob === 'object' && prob !== null) ? String(prob.descricao || '').trim() : String(prob || '').trim();
          if (desc && !pontosMelhoria.includes(desc)) pontosMelhoria.push(`[${c.nome}] ${desc}`);
        });
      }
    });
  }

  return {
    nota_total: notaCalculadaBackend,
    nota_maxima: pontuacaoMaximaOficial,
    competencias: competenciasNormalizadas,
    pontos_fortes: pontosFortes,
    pontos_melhoria: pontosMelhoria,
    exemplos_trechos: Array.isArray(parsed.exemplos_trechos) ? parsed.exemplos_trechos.map(String) : [],
    sugestoes: Array.isArray(parsed.sugestoes) ? parsed.sugestoes.map(String) : [],
    prioridades_estudo: Array.isArray(parsed.prioridades_estudo) ? parsed.prioridades_estudo.map(String) : [],
    feedback_geral: String(parsed.feedback_geral || 'Redação corrigida e analisada com sucesso.'),
    aviso_educacional: String(
      parsed.aviso_educacional ||
      'Esta avaliação é uma estimativa pedagógica gerada por inteligência artificial para fins de treino. Não substitui a correção oficial da banca examinadora.'
    ),
    modelo_utilizado: modeloUsado || 'ia',
    rubrica_versao: VERSAO_RUBRICA,
    corrigido_em: new Date().toISOString()
  };
}

/**
 * Infere o nível textual a partir da nota, para manter consistência quando a IA não informa.
 */
function _inferirNivel(nota, pesoMax) {
  const pct = nota / pesoMax;
  if (nota === 0) return 'Ausente';
  if (pct <= 0.2) return 'Precário';
  if (pct <= 0.4) return 'Insuficiente';
  if (pct <= 0.6) return 'Médio';
  if (pct <= 0.8) return 'Bom';
  return 'Excelente';
}

/**
 * Infere o tipo_apontamento da competência a partir dos problemas listados.
 * Hierarquia: ERRO > PONTO_DE_ATENCAO > SUGESTAO.
 * Se não há problemas, retorna 'SUGESTAO' (sem problemas reais).
 */
function _inferirTipoApontamento(problemas) {
  if (!Array.isArray(problemas) || problemas.length === 0) return 'SUGESTAO';
  if (problemas.some(p => p.tipo === 'ERRO')) return 'ERRO';
  if (problemas.some(p => p.tipo === 'PONTO_DE_ATENCAO')) return 'PONTO_DE_ATENCAO';
  return 'SUGESTAO';
}

/**
 * Infere a prioridade de estudo da competência a partir da nota percentual.
 * alta: nota < 60% do peso (precisa de atenção urgente)
 * media: nota = 60% (mediano, pode melhorar)
 * baixa: nota > 60% (satisfatório)
 */
function _inferirPrioridade(nota, pesoMax) {
  const pct = nota / pesoMax;
  if (pct < 0.6) return 'alta';
  if (pct <= 0.6) return 'media';
  return 'baixa';
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL EXPORTADA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Avalia a redação utilizando o provedor de IA configurado.
 * Prioridade: Groq → Gemini → OpenAI.
 *
 * @param {object} params
 * @param {string} params.tema - Título/tema da proposta
 * @param {string} params.vestibular - Identificador da banca
 * @param {object} params.matriz - Matriz de critérios
 * @param {string} params.texto - Texto da redação (sempre do banco)
 * @param {object} [params.proposta] - Dados da proposta (textos motivadores, instruções, etc.)
 * @param {string} [params.propostaId] - ID da proposta (para fingerprint)
 * @param {string} [params.vestibularId] - ID do vestibular (para fingerprint)
 * @returns {Promise<object>}
 */
export async function avaliarRedacaoComIA({ tema, vestibular, matriz, texto, proposta, propostaId, vestibularId }) {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const provedoresElegiveis = [];
  if (groqKey) provedoresElegiveis.push({ nome: 'groq', key: groqKey, fn: chamarGroq });
  if (geminiKey) provedoresElegiveis.push({ nome: 'gemini', key: geminiKey, fn: chamarGemini });
  if (openaiKey) provedoresElegiveis.push({ nome: 'openai', key: openaiKey, fn: chamarOpenAI });

  if (provedoresElegiveis.length === 0) {
    const erroConfig = new Error(
      'Nenhum provedor de IA está configurado no servidor. Configure a variável GROQ_API_KEY (ou GEMINI_API_KEY) nas variáveis de ambiente da Vercel.'
    );
    erroConfig.statusCode = 503;
    erroConfig.isConfigError = true;
    throw erroConfig;
  }

  const prompt = construirPromptCorrecao({ tema, vestibular, matriz, texto, proposta });

  const tempoInicio = Date.now();
  const TETO_GLOBAL_MS = TIMEOUT_MS; // 28000ms
  const MARGEM_MINIMA_MS = 4000;      // precisa de pelo menos 4s úteis para tentar outro provedor

  const errosAcumulados = [];

  for (let i = 0; i < provedoresElegiveis.length; i++) {
    const { nome, key, fn } = provedoresElegiveis[i];
    const decorrido = Date.now() - tempoInicio;
    const tempoRestante = TETO_GLOBAL_MS - decorrido;

    if (tempoRestante < MARGEM_MINIMA_MS) {
      console.warn(`[avaliarRedacaoComIA] Orçamento global de tempo esgotado (${decorrido}ms decorridos). Abortando tentativa no provedor "${nome}".`);
      errosAcumulados.push({
        provedor: nome,
        categoria: 'ORCAMENTO_TEMPO_ESGOTADO',
        mensagem: `Tempo restante insuficiente (${tempoRestante}ms < ${MARGEM_MINIMA_MS}ms).`
      });
      break;
    }

    console.info(`[avaliarRedacaoComIA] Tentativa ${i + 1}/${provedoresElegiveis.length}: acionando provedor "${nome}" (tempo restante: ${tempoRestante}ms)...`);

    const timeoutChamada = Math.min(TIMEOUT_MS, tempoRestante);

    try {
      const resultadoBruto = await fn(key, prompt, timeoutChamada);
      const resultado = validarENormalizarResposta(resultadoBruto.rawText, matriz, resultadoBruto.modelo, texto);
      resultado.fingerprint = gerarFingerprintRedacao(texto, propostaId, vestibularId);

      if (i > 0) {
        console.info(`[avaliarRedacaoComIA] Sucesso via fallback no provedor "${nome}" após ${i} falha(s) anterior(es).`);
      }

      return resultado;
    } catch (errProv) {
      const duracao = Date.now() - tempoInicio;
      const status = errProv?.statusCode || 500;
      const tipo = errProv?.tipo || 'ERRO_DESCONHECIDO';

      // Categorização do erro para fins de log seguro e decisão de fallback
      let categoria = 'FALHA_GENERICA';
      let elegivelFallback = true;

      if (status === 401 || status === 403) {
        categoria = 'AUTENTICACAO_INVALIDA';
        elegivelFallback = true; // Chave inválida em um provedor deve permitir tentar o próximo configurado
      } else if (errProv?.tipo === 'RESPOSTA_TRUNCADA_IA' || errProv?.message?.includes('limite de tokens')) {
        categoria = 'RESPOSTA_TRUNCADA';
        elegivelFallback = true;
      } else if (status === 400 || errProv?.message?.includes('JSON') || errProv?.message?.includes('competências')) {
        categoria = 'FORMATO_OU_VALIDACAO_JSON';
        elegivelFallback = true;
      } else if (status === 429) {
        categoria = 'TAXA_LIMITE_IA';
        elegivelFallback = true;
      } else if (status === 504 || errProv?.tipo === 'TIMEOUT_IA' || errProv?.name === 'AbortError') {
        categoria = 'TIMEOUT_PROVEDOR';
        elegivelFallback = true;
      } else if (status >= 500) {
        categoria = 'ERRO_INTERNO_PROVEDOR';
        elegivelFallback = true;
      }

      console.warn(`[avaliarRedacaoComIA] Falha no provedor "${nome}" (status: ${status}, categoria: ${categoria}, decorrido: ${duracao}ms):`, {
        provedor: nome,
        categoria,
        statusCode: status,
        tipo
      });

      errosAcumulados.push({
        provedor: nome,
        categoria,
        statusCode: status,
        mensagem: errProv?.message || 'Erro sem mensagem'
      });

      // Se for o último provedor elegível ou não for elegível a fallback, interrompe
      if (!elegivelFallback || i === provedoresElegiveis.length - 1) {
        break;
      }

      console.info(`[avaliarRedacaoComIA] Acionando fallback para o próximo provedor...`);
    }
  }

  // Se chegou aqui, todos os provedores elegíveis falharam ou o tempo acabou
  const resumoErros = errosAcumulados.map(e => `${e.provedor} (${e.categoria})`).join('; ');
  console.error('[avaliarRedacaoComIA] Todos os provedores de IA falharam:', resumoErros);

  const erroAgregado = new Error(
    `Todos os provedores de IA falharam ou não puderam validar a avaliação completa: ${resumoErros}. Tente novamente em instantes.`
  );
  erroAgregado.statusCode = 502;
  erroAgregado.tipo = 'FALHA_TODOS_PROVEDORES_IA';
  erroAgregado.erros = errosAcumulados;
  throw erroAgregado;
}
