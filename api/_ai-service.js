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

export const VERSAO_RUBRICA = 'enem-v4-2026';

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
• 200 pts → Excelente: sem desvios ou com no máximo 1 desvio leve e isolado que não compromete a leitura.
• 160 pts → Bom: poucos desvios (2 a 4), nenhum grave, não afetam a compreensão do texto.
• 120 pts → Médio: desvios presentes com alguma frequência, não dominantes. O texto é compreensível, mas a norma culta não é plenamente dominada.
• 80 pts → Insuficiente: muitos desvios, frequentes, que dificultam a leitura em alguns momentos.
• 40 pts → Precário: desvios graves e sistemáticos que prejudicam seriamente a compreensão.
• 0 pts → Apenas marcas de escrita (texto incompreensível) ou extensão mínima inadequada.

IMPORTANTE:
- Não penalize pelo estilo ou pelo fato de uma frase "poder ser mais bonita".
- A nota deve ser proporcional à quantidade, frequência e gravidade dos desvios encontrados.
- Cite cada desvio real com o trecho exato onde ocorre.
- Se não encontrar desvios, diga isso explicitamente e atribua nota alta.
- Sugestão estilística ≠ erro gramatical. NÃO confundir.`;

const RUBRICA_C2 = `
COMPETÊNCIA 2 — Compreensão da Proposta e Aplicação de Repertório
Avalie DOIS aspectos separados:

ASPECTO A — Compreensão e resposta ao tema:
- O candidato respondeu ao tema proposto? (verificar: não ao título genérico, ao RECORTE TEMÁTICO da proposta)
- O texto apresenta fuga total ao tema? (se sim → 0 pts nesta competência)
- O texto tangencia o tema? (aborda perifericamente sem responder ao recorte) → limita a nota

ASPECTO B — Repertório sociocultural:
- Há referência a autor, obra, dado estatístico, lei, teoria, evento histórico ou conceito de área de conhecimento?
- O repertório é pertinente ao tema? (fora do tema = não conta)
- O repertório é utilizado de forma produtiva na argumentação? (citação decorativa pesa menos)
- O repertório é cópia direta dos textos motivadores da proposta? (não conta como repertório próprio)

ESCALA OFICIAL INEP:
• 200 pts → Compreende e desenvolve o tema com repertório legitimado, pertinente e produtivo.
• 160 pts → Compreende o tema com repertório adequado, mas com uso parcialmente produtivo ou repertório menos diversificado.
• 120 pts → Compreende o tema de forma básica. Repertório limitado ou de pertinência questionável.
• 80 pts → Tangencia o tema ou tem compreensão superficial. Repertório fraco ou ausente.
• 40 pts → Tangenciamento grave ou compreensão muito limitada do tema.
• 0 pts → Fuga total ao tema.

IMPORTANTE:
- Um único repertório pertinente e bem utilizado pode justificar nota 160.
- NÃO reduza a nota simplesmente porque o repertório poderia ser mais sofisticado.
- Se o candidato cita a Lei 10.639/03 de forma pertinente ao tema, isso é repertório legitimado.
- Verifique SEMPRE o recorte específico da proposta antes de avaliar, não apenas o título.`;

const RUBRICA_C3 = `
COMPETÊNCIA 3 — Seleção, Organização e Interpretação de Argumentos
Avalie a qualidade, coerência e organização da argumentação.

O QUE ANALISAR:
- Existe tese clara (ponto de vista defendido)?
- Os argumentos sustentam a tese?
- Há progressão argumentativa (os argumentos avançam, não repetem)?
- Os parágrafos de desenvolvimento apresentam causas, consequências, dados, exemplos ou comparações?
- Há contradições entre argumentos?
- O texto é organizado em introdução, desenvolvimento e conclusão?

ESCALA OFICIAL INEP:
• 200 pts → Argumentação consistente, bem articulada e em defesa de ponto de vista. Argumentos variados e progressivos.
• 160 pts → Argumentação satisfatória com poucas inadequações. Desenvolvimento suficiente com boa organização.
• 120 pts → Argumentação mediana. Apresenta argumentos, mas com limitações no desenvolvimento ou na articulação.
• 80 pts → Argumentação fraca. Argumentos insuficientes ou mal desenvolvidos.
• 40 pts → Argumentação precária. Ausência de estrutura argumentativa reconhecível.
• 0 pts → Não há argumentação ou fuga total ao tema.

IMPORTANTE:
- NÃO confundir "texto simples" com "texto ruim".
- Um argumento simples mas coerente e desenvolvido não merece penalização exagerada.
- Avalie a FUNÇÃO do argumento, não o nível de sofisticação.
- Se os argumentos são claros, pertinentes e progressivos, reconheça isso mesmo que não sejam complexos.`;

const RUBRICA_C4 = `
COMPETÊNCIA 4 — Conhecimento dos Mecanismos Linguísticos de Coesão
Avalie os recursos coesivos utilizados para construir a argumentação.

O QUE ANALISAR:
- Uso de conectivos e operadores argumentativos (portanto, entretanto, ademais, visto que, logo, além disso, etc.)
- Coesão entre frases e entre parágrafos
- Retomadas (pronomes, sinônimos, elipses) adequadas
- Progressão temática (cada parágrafo avança sobre o anterior)
- Conectivos usados de forma artificial ou mecanicamente repetida

ESCALA OFICIAL INEP:
• 200 pts → Usa de forma diversificada e adequada os mecanismos coesivos. Progressão textual clara.
• 160 pts → Usa adequadamente a maioria dos recursos. Poucos problemas de coesão isolados.
• 120 pts → Usa mecanismos coesivos, mas com alguma repetição ou inadequação não dominante.
• 80 pts → Uso limitado ou inadequado dos mecanismos de coesão, prejudicando a progressão.
• 40 pts → Coesão precária. Mecanismos ausentes ou usados incorretamente na maior parte do texto.
• 0 pts → Ausência de coesão.

IMPORTANTE:
- Conectivos simples bem usados NÃO devem receber nota baixa.
- Avalie a FUNÇÃO dos conectivos no texto, não a sofisticação do vocabulário.
- Se o texto flui logicamente entre parágrafos, mesmo com conectivos básicos, reconheça a coesão.`;

const RUBRICA_C5 = `
COMPETÊNCIA 5 — Proposta de Intervenção Respeitando os Direitos Humanos
Avalie a qualidade da proposta de solução/intervenção apresentada pelo candidato.

OS 5 ELEMENTOS DA PROPOSTA (análise individual):
1. AGENTE: quem executa a ação? (ex: governo federal, escolas, ONGs, mídia)
2. AÇÃO: o que será feito concretamente? (não pode ser vago como "conscientizar")
3. MEIO/MODO: como será executado? (canais, instrumentos, métodos)
4. FINALIDADE/EFEITO: qual o resultado esperado? qual problema resolve?
5. DETALHAMENTO: há desdobramento explicativo ou especificação de ao menos UM dos elementos anteriores (ex: exemplificação da ação, especificação do meio/modo, esclarecimento sobre o agente ou efeito)?
   ATENÇÃO: O INEP NÃO exige prazo, cronograma ou dotação orçamentária como requisito obrigatório de detalhamento. Qualquer elemento que agregue informação concreta suplementar é considerado detalhamento válido.

ESCALA OFICIAL INEP:
• 200 pts → Proposta completa com os 5 elementos (agente, ação, meio, finalidade e 1 detalhamento válido), articulada à discussão.
• 160 pts → Proposta com 4 elementos válidos, ou 5 elementos com detalhamento muito tênue.
• 120 pts → Proposta com 3 elementos válidos.
• 80 pts → Proposta com 2 elementos válidos.
• 40 pts → Proposta com apenas 1 elemento ou intervenção extremamente vaga/genérica.
• 0 pts → Ausência de proposta de intervenção ou proposta que desrespeita os direitos humanos de forma categórica.

IMPORTANTE:
- Analise literalmente o trecho da proposta no texto.
- NÃO presuma elementos que não estão escritos.
- NÃO exija cronograma, prazos ou orçamento financeiro para validar o detalhamento na C5, pois a cartilha do INEP não os exige.
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

8. ANTI-CONTRADIÇÃO OBRIGATÓRIA:
   - Se a nota for máxima, a justificativa NÃO pode conter frases como:
     "há problemas", "faltam elementos", "poderia ser melhor", "insuficiente",
     "parcialmente", "limitado", "fraco", "desenvolvimento inadequado".
   - Se encontrar conflito, revise a nota para baixo OU revise a justificativa.

9. NOTAS MÁXIMAS EXIGEM JUSTIFICATIVA FORTE com base no texto.
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

async function chamarGroq(apiKey, prompt) {
  const modelo = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = {
      model: modelo,
      temperature: 0,
      reasoning_effort: 'medium',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Você é um avaliador especialista em redações de vestibulares. Sua resposta DEVE ser estritamente um único objeto JSON válido, iniciando imediatamente com { e terminando com }, sem texto introdutório, sem conclusões e sem markdown.'
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
    clearTimeout(timeoutId);

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
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) throw new Error('A Groq retornou uma resposta vazia.');
    return { rawText, modelo: `groq/${modelo}` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const erroTimeout = new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 28s).');
      erroTimeout.statusCode = 504;
      erroTimeout.tipo = 'TIMEOUT_IA';
      throw erroTimeout;
    }
    throw err;
  }
}

async function chamarGemini(apiKey, prompt) {
  const modelo = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, topP: 1.0, responseMimeType: 'application/json' }
      })
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `Erro no serviço Gemini (${response.status})`;
      try { const p = JSON.parse(errBody); if (p.error?.message) msg += `: ${p.error.message}`; } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('O Gemini retornou uma resposta vazia.');
    return { rawText, modelo: `google/${modelo}` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 28s).');
    throw err;
  }
}

async function chamarOpenAI(apiKey, prompt) {
  const modelo = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelo,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Você é um avaliador especialista em redações do ENEM. Avalie SOMENTE o texto fornecido. Responda estritamente em JSON válido.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `Erro no serviço OpenAI (${response.status})`;
      try { const p = JSON.parse(errBody); if (p.error?.message) msg += `: ${p.error.message}`; } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) throw new Error('A OpenAI retornou uma resposta vazia.');
    return { rawText, modelo: `openai/${modelo}` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 28s).');
    throw err;
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
  'pouco detalhamento', 'ausência de', 'ausente', 'não atende', 'precário'
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
  // Se for ENEM ou se houver matriz com competências definidas, todas devem estar presentes
  const qtdEsperada = competenciasOficiais.length > 0 ? competenciasOficiais.length : (isEnem ? 5 : 0);
  if (qtdEsperada > 0 && parsed.competencias.length !== qtdEsperada) {
    throw new Error(
      `A avaliação está incompleta: esperadas ${qtdEsperada} competências (${isEnem ? 'C1 a C5' : 'oficiais'}), mas a IA retornou apenas ${parsed.competencias.length}. Nenhuma nota parcial será atribuída.`
    );
  }

  // Verifica se todos os números de competência esperados estão presentes
  if (qtdEsperada > 0) {
    const numerosPresentes = new Set(parsed.competencias.map((c, i) => Number(c.numero) || (i + 1)));
    for (let cNum = 1; cNum <= qtdEsperada; cNum++) {
      if (!numerosPresentes.has(cNum)) {
        throw new Error(
          `A avaliação está incompleta: a competência C${cNum} não foi retornada pela IA. Nenhuma nota parcial será atribuída.`
        );
      }
    }
  }

  const competenciasNormalizadas = parsed.competencias.map((comp, idx) => {
    const oficial = competenciasOficiais[idx] || {};
    const pesoMax = Number(oficial.peso) || Number(comp.nota_maxima) || 200;
    const notaBruta = Number(comp.nota);
    const numeroComp = Number(comp.numero) || oficial.numero || (idx + 1);

    if (isNaN(notaBruta)) {
      throw new Error(`Competência ${idx + 1} retornou nota não-numérica: "${comp.nota}".`);
    }

    let notaClamped = Math.max(0, Math.min(pesoMax, Math.round(notaBruta)));

    // Quantização ENEM: somente múltiplos de 40
    if (isEnem && pesoMax === 200) {
      notaClamped = Math.round(notaClamped / 40) * 40;
      notaClamped = Math.max(0, Math.min(200, notaClamped));
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
    // Nota 200 com justificativa contendo termos negativos indica possível superestimação.
    let notaSuspeita = false;
    let avisoContradicao = null;

    if (notaClamped >= 160) {
      const justLower = justificativa.toLowerCase();
      const conflito = FRASES_NEGATIVAS.find(f => justLower.includes(f));
      if (conflito && notaClamped === 200) {
        notaSuspeita = true;
        avisoContradicao = `Nota 200 com justificativa que menciona "${conflito}". Nota pode estar superestimada.`;
        console.warn(`[_ai-service] Contradição C${numeroComp}: nota 200 mas justificativa menciona "${conflito}"`);
      }
    }

    const resultado = {
      numero: numeroComp,
      nome: String(comp.nome || oficial.nome || `Competência ${idx + 1}`),
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

  if (!groqKey && !geminiKey && !openaiKey) {
    const erroConfig = new Error(
      'Nenhum provedor de IA está configurado no servidor. Configure a variável GROQ_API_KEY (ou GEMINI_API_KEY) nas variáveis de ambiente da Vercel.'
    );
    erroConfig.statusCode = 503;
    erroConfig.isConfigError = true;
    throw erroConfig;
  }

  const prompt = construirPromptCorrecao({ tema, vestibular, matriz, texto, proposta });

  let resultadoBruto = null;

  if (groqKey) {
    resultadoBruto = await chamarGroq(groqKey, prompt);
  } else if (geminiKey) {
    resultadoBruto = await chamarGemini(geminiKey, prompt);
  } else if (openaiKey) {
    resultadoBruto = await chamarOpenAI(openaiKey, prompt);
  }

  const resultado = validarENormalizarResposta(resultadoBruto.rawText, matriz, resultadoBruto.modelo, texto);
  resultado.fingerprint = gerarFingerprintRedacao(texto, propostaId, vestibularId);
  return resultado;
}
