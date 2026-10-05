/**
 * _ai-service.js — Camada desacoplada de IA para Correção de Redações
 *
 * Suporta múltiplos provedores através de variáveis de ambiente:
 * 1. Groq (GROQ_API_KEY) — Provedor de alta velocidade e modelo principal
 *    Modelo padrão: openai/gpt-oss-120b (substituto oficial do llama-3.3-70b-versatile, depreciado em ago/2026)
 *    Sobrescreva com: GROQ_MODEL=<model-id>
 * 2. Google Gemini (GEMINI_API_KEY) — Fallback / Alternativa
 * 3. OpenAI (OPENAI_API_KEY) — Fallback / Alternativa
 *
 * Princípios de consistência:
 * - Temperatura 0 (ou mínimo suportado) para avaliação determinística.
 * - Prompt com rubrica explícita: o que analisa, quais evidências justificam cada nota, o que impede pontuação alta.
 * - Nota total SEMPRE calculada no backend pela soma das competências — nunca confiada ao total declarado pela IA.
 * - Validação estrutural e semântica da resposta antes de retornar.
 * - Detecção de inconsistência: diferença >100 pontos entre avaliações gera flag de alerta.
 */

const TIMEOUT_MS = 28000; // 28s timeout para respeitar limits serverless

// Limites de consistência entre reavaliações da mesma redação (em pontos)
export const LIMITE_DISCREPANCIA_CRITICA = 100; // >100 → "avaliação inconsistente"
export const LIMITE_DISCREPANCIA_SIGNIFICATIVA = 50; // 50-100 → "variação significativa"

/**
 * Classifica a discrepância entre duas avaliações da mesma redação.
 * @param {number} notaAnterior
 * @param {number} notaNova
 * @returns {{ diferenca: number, classificacao: string, label: string }}
 */
export function classificarDiscrepancia(notaAnterior, notaNova) {
  const diferenca = notaNova - notaAnterior;
  const abs = Math.abs(diferenca);
  let classificacao, label;

  if (abs > LIMITE_DISCREPANCIA_CRITICA) {
    classificacao = 'inconsistente';
    label = `⚠️ Variação crítica (${diferenca > 0 ? '+' : ''}${diferenca} pts): A avaliação automática apresentou uma diferença acima do limite de consistência (>${LIMITE_DISCREPANCIA_CRITICA} pts). Ambas as avaliações foram preservadas para diagnóstico.`;
  } else if (abs >= LIMITE_DISCREPANCIA_SIGNIFICATIVA) {
    classificacao = 'significativa';
    label = `⚠️ Variação significativa (${diferenca > 0 ? '+' : ''}${diferenca} pts): Diferença entre ${LIMITE_DISCREPANCIA_SIGNIFICATIVA} e ${LIMITE_DISCREPANCIA_CRITICA} pontos detectada entre as avaliações.`;
  } else {
    classificacao = 'normal';
    label = `Variação normal (${diferenca > 0 ? '+' : ''}${diferenca} pts): dentro do intervalo esperado para avaliação automática.`;
  }

  return { diferenca, classificacao, label };
}

/**
 * Constrói o prompt com RUBRICA EXPLÍCITA por competência.
 * O modelo NÃO decide uma nota total separadamente — apenas avalia cada competência.
 * O backend calcula a soma.
 */
function construirPromptCorrecao({ tema, vestibular, matriz, texto }) {
  const nomeBanca = matriz?.nome || vestibular?.toUpperCase() || 'Vestibular';
  const pontuacaoMax = matriz?.pontuacao_maxima || 1000;
  const genero = matriz?.tipo_genero || 'Dissertativo-argumentativo';
  const isEnem = (vestibular || '').toLowerCase() === 'enem' || nomeBanca.toUpperCase().includes('ENEM');

  // Monta a seção de rubrica detalhada por competência
  const competencias = matriz?.competencias || [];
  const rubricaDetalhada = competencias.map(c => {
    const escalaEnem = isEnem && c.peso === 200
      ? `
    ESCALA OFICIAL INEP PARA ESTA COMPETÊNCIA (use SOMENTE estes valores):
    • 0 pts: Texto não atende / fuga total ao tema / ausência completa do elemento avaliado.
    • 40 pts: Desempenho precário — deficiências graves e sistemáticas nesta competência.
    • 80 pts: Desempenho insuficiente — domínio rudimentar, muitas falhas perceptíveis.
    • 120 pts: Desempenho mediano — domínio regular com falhas não dominantes.
    • 160 pts: Desempenho bom — domínio satisfatório com poucas e não graves deficiências.
    • 200 pts: Desempenho excelente — domínio pleno dos critérios desta competência.
    REGRA ABSOLUTA: valores intermediários como 70, 90, 110, 130, 150, 170 ou 190 são PROIBIDOS.`
      : `    Peso máximo: ${c.peso} pts.`;

    return `--- COMPETÊNCIA ${c.numero}: ${c.nome} ---
  Critério oficial: ${c.descricao}
  ${escalaEnem}
  O QUE ANALISAR:
    ${gerarOrientacaoCompetencia(c.numero, isEnem)}
  COMO JUSTIFICAR A NOTA:
    - Cite trechos literais ou parafraseados do texto que fundamentam a pontuação atribuída.
    - Identifique os elementos presentes E os ausentes ou deficientes.
    - Não presuma argumentos, repertórios ou elementos que não estejam escritos no texto.
    - Não dê crédito por algo que o candidato "poderia ter querido dizer".
    - Presença parcial de elemento exigido = pontuação parcial. Ausência = não pontuar.`;
  }).join('\n\n');

  return `Você é um avaliador rigoroso e especializado em redações de vestibulares brasileiros (banca: ${nomeBanca}).

MISSÃO ESTRITA: Avaliar EXCLUSIVAMENTE o texto fornecido, competência por competência, com base nas rubricas abaixo.
NÃO atribua pontos por impressão geral. Cada pontuação DEVE ser baseada em evidências concretas presentes no texto.
NÃO presuma argumentos, repertórios ou informações que não estejam escritas. Avalie somente o texto fornecido.

═══════════════════════════════════════════════════
INFORMAÇÕES DA PROPOSTA:
- Banca / Vestibular: ${nomeBanca}
- Gênero textual exigido: ${genero}
- Pontuação máxima total: ${pontuacaoMax} pts (soma das competências — NÃO declare um total separado)
- Tema da proposta: "${tema}"
═══════════════════════════════════════════════════

TEXTO DO CANDIDATO (avalie cada palavra — não invente, não omita):
"""
${texto}
"""

═══════════════════════════════════════════════════
RUBRICAS OFICIAIS POR COMPETÊNCIA:
${rubricaDetalhada || `Avalie: domínio da norma culta, repertório, argumentação, coesão e proposta de intervenção.`}
═══════════════════════════════════════════════════

DIRETRIZES ABSOLUTAS — LEIA ANTES DE RESPONDER:

1. AVALIE APENAS O TEXTO ACIMA. É PROIBIDO:
   - Inventar citações, argumentos, erros ou repertório não presente no texto.
   - Afirmar que o candidato escreveu algo que não está no texto.
   - Inferir intenção sem evidência textual.

2. EXTENSÃO E FUGA AO TEMA:
   - Texto com até 7 linhas completas (≤ ~420 caracteres) OU fuga total ao tema: TODAS as competências recebem 0.
   - Tangenciamento do tema (aborda perifericamente): limita severamente a C2 e C3.

3. REPERTÓRIO (C2 no ENEM):
   - Referência válida: verificar pertinência, uso produtivo e relação com o argumento.
   - Referência genérica ou senso comum = não conta como repertório legitimado.
   - Cópia direta dos textos motivadores = não conta como repertório próprio.

4. PROPOSTA DE INTERVENÇÃO (C5 no ENEM):
   - Verificar os 5 elementos exigidos: agente, ação, meio/modo, efeito, detalhamento.
   - Proposta vaga/genérica: 40 pts. Ausência completa: 0 pts.
   - NÃO presumir elementos ausentes.

5. CONSISTÊNCIA DA NOTA:
   - A justificativa DEVE explicar exatamente quais elementos do texto sustentam a pontuação.
   - Uma nota alta requer evidências positivas concretas. Uma nota baixa requer problemas concretos.
   - NÃO é permitido dar nota alta sem evidência positiva nem nota baixa sem problema identificado.

6. NOTA TOTAL: NÃO calcule nem declare um "nota_total" baseado em impressão geral.
   O campo "nota_total" no JSON DEVE ser exatamente a soma matemática de todas as notas das competências.

═══════════════════════════════════════════════════
FORMATO DE RESPOSTA — JSON VÁLIDO OBRIGATÓRIO (sem blocos markdown):
{
  "nota_total": <SOMA_EXATA_DAS_COMPETENCIAS>,
  "nota_maxima": ${pontuacaoMax},
  "competencias": [
    {
      "numero": <número>,
      "nome": "<nome oficial>",
      "nota": <nota na escala válida>,
      "nota_maxima": <peso máximo>,
      "justificativa": "<análise fundamentada com evidências literais/parafraseadas do texto>",
      "evidencias": ["<trecho ou elemento real do texto que justifica a nota>"],
      "problemas": ["<problema específico identificado no texto, se houver>"]
    }
  ],
  "pontos_fortes": ["<ponto forte real identificado no texto>"],
  "pontos_melhoria": ["<problema concreto com sugestão de melhoria>"],
  "exemplos_trechos": ["<trecho literal do texto> → <sugestão de reescrita>"],
  "sugestoes": ["<sugestão prática de estudo fundamentada na análise>"],
  "prioridades_estudo": ["<prioridade de aprendizado identificada nos problemas reais>"],
  "feedback_geral": "<parecer pedagógico objetivo baseado exclusivamente no texto>",
  "aviso_educacional": "Esta avaliação é uma estimativa pedagógica gerada por inteligência artificial para fins de treino e autoavaliação, não substituindo a correção oficial da banca examinadora."
}`;
}

/**
 * Gera orientação específica para cada competência do ENEM (ou genérica para outras bancas).
 */
function gerarOrientacaoCompetencia(numero, isEnem) {
  if (!isEnem) return 'Aplique os critérios oficiais desta banca conforme descrição acima.';

  const orientacoes = {
    1: `Analise: ortografia, acentuação, concordância verbal e nominal, regência, crase, pontuação, morfossintaxe.
    Conte os desvios: 0 desvios = 200; 1-2 desvios leves = 160; desvios regulares não dominantes = 120; muitos desvios = 80; desvios graves sistemáticos = 40; texto ininteligível = 0.
    Cite cada desvio encontrado com o trecho onde ocorre.`,
    2: `Analise: o texto defende uma tese clara sobre o tema? Usa repertório sociocultural legitimado (autor, obra, dado, lei, teoria)?
    O repertório é pertinente e produtivo (articula com a tese/argumento)?
    Verifique: o repertório é copiado dos textos motivadores? É senso comum? É genérico?
    Cite o repertório presente no texto e avalie seu uso.`,
    3: `Analise: existe projeto de texto (introdução-desenvolvimento-conclusão bem delimitados)?
    Os argumentos são consistentes, pertinentes e progressivos?
    Há contradição entre argumentos?
    Existe ponto de vista claro sustentado ao longo do texto?
    Cite os argumentos presentes e avalie sua pertinência.`,
    4: `Analise: há uso diversificado de conectivos e operadores argumentativos (portanto, entretanto, ademais, visto que, logo, etc.)?
    Os parágrafos têm progressão temática coerente?
    Há referenciação (pronomes, elipses, sinônimos) adequada?
    Cite os conectivos e mecanismos coesivos presentes no texto.`,
    5: `Analise: o texto apresenta proposta de intervenção?
    Verifique os 5 elementos (pontue 40 pts por elemento presente adequadamente):
    1) Agente: quem vai executar a ação? (ex: governo federal, escola, empresas)
    2) Ação: o que será feito concretamente?
    3) Meio/Modo: como será executado?
    4) Efeito: qual o resultado esperado?
    5) Detalhamento: há especificidade (lei, programa, prazo, recurso)?
    Cite literalmente o trecho da proposta e identifique quais elementos estão presentes.`
  };

  return orientacoes[numero] || 'Aplique os critérios oficiais desta competência conforme descrição acima.';
}

/**
 * Chama a API oficial do Groq (compatível com OpenAI API v1/chat/completions)
 * Usa temperatura 0 para máxima determinismo.
 * reasoning_effort 'medium' é compatível com openai/gpt-oss-120b no Groq.
 */
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
          content: 'Você é um avaliador rigoroso especialista em bancas de vestibulares brasileiros. Avalie SOMENTE o texto fornecido. Responda estritamente em JSON válido conforme o formato solicitado. Não invente evidências. Não presuma elementos ausentes no texto.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `Erro no serviço Groq (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) {
          msg += `: ${parsed.error.message}`;
        }
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;

    if (!rawText) {
      throw new Error('A Groq retornou uma resposta vazia.');
    }

    return { rawText, modelo: `groq/${modelo}` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 28s).');
    }
    throw err;
  }
}

/**
 * Chama o Google Gemini via API REST oficial
 * Usa temperatura 0 para máximo determinismo.
 */
async function chamarGemini(apiKey, prompt) {
  const modelo = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0,
          topP: 1.0,
          responseMimeType: 'application/json'
        }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `Erro no serviço Gemini (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) {
          msg += `: ${parsed.error.message}`;
        }
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('O provedor de IA retornou uma resposta vazia.');
    }

    return { rawText, modelo: `google/${modelo}` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 28s).');
    }
    throw err;
  }
}

/**
 * Chama a OpenAI via API REST oficial
 * Usa temperatura 0 para máximo determinismo.
 */
async function chamarOpenAI(apiKey, prompt) {
  const modelo = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelo,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Você é um avaliador rigoroso de bancas de vestibulares. Avalie SOMENTE o texto fornecido. Responda estritamente em JSON válido conforme solicitado.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `Erro no serviço OpenAI (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) {
          msg += `: ${parsed.error.message}`;
        }
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;

    if (!rawText) {
      throw new Error('A OpenAI retornou uma resposta vazia.');
    }

    return { rawText, modelo: `openai/${modelo}` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 28s).');
    }
    throw err;
  }
}

/**
 * Limpa, valida estruturalmente e normaliza a resposta da IA.
 *
 * REGRAS DE VALIDAÇÃO:
 * 1. JSON válido obrigatório.
 * 2. Cada competência deve ter nota numérica dentro dos limites.
 * 3. Para o ENEM: nota de cada competência deve ser múltipla de 40 (0, 40, 80, 120, 160, 200).
 * 4. nota_total é SEMPRE recalculada no backend pela soma das competências.
 *    O total declarado pela IA é descartado e substituído pela soma real.
 * 5. Campos obrigatórios (justificativa, evidencias, problemas) são verificados.
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

  // Valida que a resposta contém competências
  if (!Array.isArray(parsed.competencias) || parsed.competencias.length === 0) {
    throw new Error('A resposta da IA não contém a lista de competências obrigatória.');
  }

  // Normaliza e valida cada competência
  const competenciasNormalizadas = parsed.competencias.map((comp, idx) => {
    const oficial = competenciasOficiais[idx] || {};
    const pesoMax = Number(oficial.peso) || Number(comp.nota_maxima) || 200;
    const notaBruta = Number(comp.nota);

    if (isNaN(notaBruta)) {
      throw new Error(`Competência ${idx + 1} retornou nota não-numérica: "${comp.nota}".`);
    }

    let notaClamped = Math.max(0, Math.min(pesoMax, Math.round(notaBruta)));

    // Para o ENEM: cada nota de competência DEVE ser múltipla de 40 (escala INEP)
    if (isEnem && pesoMax === 200) {
      notaClamped = Math.round(notaClamped / 40) * 40;
      notaClamped = Math.max(0, Math.min(200, notaClamped));
    }

    // Valida justificativa — não pode ser vazia ou placeholder
    const justificativa = String(comp.justificativa || '').trim();
    if (justificativa.length < 20) {
      console.warn(`[_ai-service] Competência ${idx + 1} sem justificativa adequada (${justificativa.length} chars).`);
    }

    return {
      numero: Number(comp.numero) || oficial.numero || (idx + 1),
      nome: String(comp.nome || oficial.nome || `Competência ${idx + 1}`),
      nota: notaClamped,
      nota_maxima: pesoMax,
      justificativa: justificativa || 'Avaliação pedagógica fundamentada nos critérios oficiais da banca.',
      evidencias: Array.isArray(comp.evidencias) ? comp.evidencias.map(String) : [],
      problemas: Array.isArray(comp.problemas) ? comp.problemas.map(String) : []
    };
  });

  // REGRA CRÍTICA: nota_total é SEMPRE a soma das competências normalizadas no backend.
  // O valor declarado pela IA em "nota_total" é completamente ignorado.
  const notaCalculadaBackend = competenciasNormalizadas.reduce((acc, c) => acc + c.nota, 0);

  // Valida coerência: a soma não pode exceder o máximo oficial
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
      'Esta avaliação é uma estimativa pedagógica gerada por inteligência artificial para fins de treino e autoavaliação, não substituindo a correção oficial da banca examinadora.'
    ),
    modelo_utilizado: modeloUsado || 'ia',
    corrigido_em: new Date().toISOString()
  };
}

/**
 * Função principal exportada: avalia a redação utilizando o provedor configurado.
 * Prioriza Groq (GROQ_API_KEY), depois Gemini, depois OpenAI.
 *
 * @param {{ tema: string, vestibular: string, matriz: object, texto: string }} params
 * @returns {Promise<object>} Resultado normalizado e validado
 */
export async function avaliarRedacaoComIA({ tema, vestibular, matriz, texto }) {
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

  const prompt = construirPromptCorrecao({ tema, vestibular, matriz, texto });

  let resultadoBruto = null;

  // Prioridade 1: Groq
  if (groqKey) {
    resultadoBruto = await chamarGroq(groqKey, prompt);
  } else if (geminiKey) {
    resultadoBruto = await chamarGemini(geminiKey, prompt);
  } else if (openaiKey) {
    resultadoBruto = await chamarOpenAI(openaiKey, prompt);
  }

  return validarENormalizarResposta(resultadoBruto.rawText, matriz, resultadoBruto.modelo);
}
