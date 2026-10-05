/**
 * _ai-service.js — Camada desacoplada de IA para Correção de Redações
 * ETAPA 21 — Calibração Profissional
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
 */

const TIMEOUT_MS = 28000;

// Limites de consistência entre reavaliações
export const LIMITE_DISCREPANCIA_CRITICA = 100;       // > 100 pts → "avaliação inconsistente"
export const LIMITE_DISCREPANCIA_SIGNIFICATIVA = 50;  // 50–100 pts → "variação significativa"

/**
 * Classifica a discrepância entre duas avaliações da mesma redação.
 */
export function classificarDiscrepancia(notaAnterior, notaNova) {
  const diferenca = notaNova - notaAnterior;
  const abs = Math.abs(diferenca);
  let classificacao, label;

  if (abs > LIMITE_DISCREPANCIA_CRITICA) {
    classificacao = 'inconsistente';
    label = `⚠️ Variação crítica (${diferenca > 0 ? '+' : ''}${diferenca} pts): diferença acima de ${LIMITE_DISCREPANCIA_CRITICA} pts. Ambas as avaliações foram preservadas para diagnóstico.`;
  } else if (abs >= LIMITE_DISCREPANCIA_SIGNIFICATIVA) {
    classificacao = 'significativa';
    label = `⚠️ Variação significativa (${diferenca > 0 ? '+' : ''}${diferenca} pts): diferença entre ${LIMITE_DISCREPANCIA_SIGNIFICATIVA} e ${LIMITE_DISCREPANCIA_CRITICA} pts.`;
  } else {
    classificacao = 'normal';
    label = `Variação normal (${diferenca > 0 ? '+' : ''}${diferenca} pts): dentro do intervalo esperado.`;
  }

  return { diferenca, classificacao, label };
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
5. DETALHAMENTO: há especificidade? (lei, programa, prazo, recurso, órgão responsável)

ESCALA OFICIAL INEP:
• 200 pts → Proposta completa com os 5 elementos, bem articulada com o problema discutido.
• 160 pts → Proposta com 4 elementos ou com os 5 elementos mas detalhamento parcial.
• 120 pts → Proposta com 3 elementos ou estrutura parcialmente incompleta.
• 80 pts → Proposta com 2 elementos. Intervenção pouco desenvolvida.
• 40 pts → Proposta com apenas 1 elemento ou extremamente vaga/genérica.
• 0 pts → Ausência de proposta de intervenção.

IMPORTANTE:
- Analise literalmente o trecho da proposta no texto.
- NÃO presuma elementos que não estão escritos.
- NÃO zere a competência por pequena imperfeição num texto que claramente tentou apresentar proposta.
- Respeitando direitos humanos: verifique se a proposta não viola direitos fundamentais.
  Se violar (ex: proposta punitiva sem garantias), reduza a nota.`;

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUÇÃO DO PROMPT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constrói o prompt completo com rubrica oficial por nível INEP.
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
    // Para outras bancas, usa descrições da matriz
    const competencias = matriz?.competencias || [];
    rubricaSecao = competencias.map(c =>
      `--- COMPETÊNCIA ${c.numero}: ${c.nome} ---\nCritério: ${c.descricao}\nPeso máximo: ${c.peso} pts.`
    ).join('\n\n');
  }

  return `Você é um avaliador especialista em redações de vestibulares brasileiros, com domínio da matriz de avaliação do ENEM (INEP).

Sua função é avaliar a redação abaixo seguindo ESTRITAMENTE as rubricas por nível. Não atribua notas por impressão geral.

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

3. ESCALA OBRIGATÓRIA DO ENEM: use SOMENTE 0, 40, 80, 120, 160 ou 200 para cada competência.
   Valores como 70, 90, 110, 130, 150, 170 ou 190 são PROIBIDOS.

4. FUGA AO TEMA: somente se o texto aborda assunto completamente diferente do tema proposto.
   Tangenciamento ≠ fuga. Tangenciamento limita C2 e C3 mas não as zera automaticamente.

5. EXTENSÃO MÍNIMA: texto com menos de 7 linhas completas → todas as competências recebem 0.

6. NOTA TOTAL: NÃO declare uma "nota geral" por impressão. O campo nota_total deve ser a SOMA EXATA das 5 competências.

7. EVIDÊNCIA OBRIGATÓRIA: cada nota deve ter ao menos 1 evidência textual (trecho real ou paráfrase do texto avaliado).
   Se não encontrar problema, diga explicitamente "nenhum desvio identificado nesta competência".
═══════════════════════════════════════════════════

RUBRICAS OFICIAIS POR COMPETÊNCIA:
${rubricaSecao}

═══════════════════════════════════════════════════
FORMATO DE RESPOSTA — JSON válido (sem markdown):
{
  "nota_total": <SOMA_EXATA_DAS_5_COMPETENCIAS>,
  "nota_maxima": ${pontuacaoMax},
  "competencias": [
    {
      "numero": 1,
      "nome": "<nome oficial>",
      "nota": <0|40|80|120|160|200>,
      "nota_maxima": 200,
      "nivel": "<Excelente|Bom|Médio|Insuficiente|Precário|Ausente>",
      "tipo_apontamento": "<ERRO|PONTO_DE_ATENCAO|SUGESTAO> (pior tipo encontrado nesta competência, ou SUGESTAO se não há erros)",
      "prioridade": "<alta|media|baixa> (alta = nota abaixo de 120; media = nota 120; baixa = nota acima de 120)",
      "justificativa": "<análise clara e objetiva de 2-4 frases com referência ao texto>",
      "pontos_positivos": ["<aspecto positivo real identificado no texto>"],
      "problemas": [
        {
          "tipo": "<ERRO|PONTO_DE_ATENCAO|SUGESTAO>",
          "descricao": "<descrição objetiva>",
          "trecho_original": "<trecho real do texto, se aplicável>",
          "sugestao_reescrita": "<reescrita sugerida, se aplicável>"
        }
      ],
      "evidencias_textuais": ["<trecho ou elemento real do texto que fundamenta a nota>"]
    }
  ],
  "pontos_fortes": ["<ponto forte global do texto, com base em evidência>"],
  "pontos_melhoria": ["<melhoria prioritária global, objetiva e aplicável>"],
  "exemplos_trechos": ["<trecho original do texto> → <reescrita sugerida>"],
  "sugestoes": ["<sugestão prática de estudo para o próximo texto>"],
  "prioridades_estudo": ["<prioridade identificada com base nos problemas reais encontrados>"],
  "feedback_geral": "<parecer pedagógico de 3-5 frases: o que o texto faz bem, o que precisa melhorar, como evoluir>",
  "aviso_educacional": "Esta avaliação é uma estimativa pedagógica gerada por inteligência artificial para fins de treino. Não substitui a correção oficial da banca examinadora."
}`;
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
          content: 'Você é um avaliador especialista em redações do ENEM. Avalie SOMENTE o texto fornecido. Nunca invente erros ou evidências. Responda estritamente em JSON válido conforme o formato solicitado.'
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
      try { const p = JSON.parse(errBody); if (p.error?.message) msg += `: ${p.error.message}`; } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) throw new Error('A Groq retornou uma resposta vazia.');
    return { rawText, modelo: `groq/${modelo}` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 28s).');
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

/**
 * Valida e normaliza a resposta da IA.
 *
 * Regras críticas:
 * 1. JSON válido obrigatório.
 * 2. Nota de cada competência deve ser múltipla de 40 (para o ENEM).
 * 3. nota_total é SEMPRE a soma das competências calculada no backend — valor da IA descartado.
 * 4. Normaliza os novos campos: nivel, pontos_positivos, problemas (com tipo), evidencias_textuais.
 * 5. Mantém compatibilidade com campos legados (evidencias, problemas como array de strings).
 */
export function validarENormalizarResposta(rawText, matriz, modeloUsado) {
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

  const competenciasNormalizadas = parsed.competencias.map((comp, idx) => {
    const oficial = competenciasOficiais[idx] || {};
    const pesoMax = Number(oficial.peso) || Number(comp.nota_maxima) || 200;
    const notaBruta = Number(comp.nota);

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

    return {
      numero: Number(comp.numero) || oficial.numero || (idx + 1),
      nome: String(comp.nome || oficial.nome || `Competência ${idx + 1}`),
      nota: notaClamped,
      nota_maxima: pesoMax,
      nivel,
      tipo_apontamento: tipoApontamento,
      prioridade,
      justificativa: justificativa || 'Avaliação pedagógica fundamentada nos critérios oficiais da banca.',
      pontos_positivos: pontosPositivos,
      problemas: problemasNormalizados,
      evidencias_textuais: evidenciasTextuais,
      // Campos legados mantidos para compatibilidade com frontend e testes existentes
      evidencias: evidenciasTextuais,
    };
  });

  // REGRA CRÍTICA: nota_total = soma das competências normalizadas (valor da IA descartado)
  const notaCalculadaBackend = competenciasNormalizadas.reduce((acc, c) => acc + c.nota, 0);

  if (notaCalculadaBackend > pontuacaoMaximaOficial) {
    throw new Error(
      `Soma das competências (${notaCalculadaBackend}) excede o máximo oficial (${pontuacaoMaximaOficial}). Resposta inválida.`
    );
  }

  return {
    nota_total: notaCalculadaBackend,
    nota_maxima: pontuacaoMaximaOficial,
    competencias: competenciasNormalizadas,
    pontos_fortes: Array.isArray(parsed.pontos_fortes) ? parsed.pontos_fortes.map(String) : [],
    pontos_melhoria: Array.isArray(parsed.pontos_melhoria) ? parsed.pontos_melhoria.map(String) : [],
    exemplos_trechos: Array.isArray(parsed.exemplos_trechos) ? parsed.exemplos_trechos.map(String) : [],
    sugestoes: Array.isArray(parsed.sugestoes) ? parsed.sugestoes.map(String) : [],
    prioridades_estudo: Array.isArray(parsed.prioridades_estudo) ? parsed.prioridades_estudo.map(String) : [],
    feedback_geral: String(parsed.feedback_geral || 'Redação corrigida e analisada com sucesso.'),
    aviso_educacional: String(
      parsed.aviso_educacional ||
      'Esta avaliação é uma estimativa pedagógica gerada por inteligência artificial para fins de treino. Não substitui a correção oficial da banca examinadora.'
    ),
    modelo_utilizado: modeloUsado || 'ia',
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
 * @returns {Promise<object>}
 */
export async function avaliarRedacaoComIA({ tema, vestibular, matriz, texto, proposta }) {
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

  return validarENormalizarResposta(resultadoBruto.rawText, matriz, resultadoBruto.modelo);
}
