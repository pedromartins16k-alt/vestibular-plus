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
 * Não expõe chaves ou segredos ao cliente.
 */

const TIMEOUT_MS = 25000; // 25s timeout para respeitar limits serverless

/**
 * Constrói o prompt pedagógico baseado na matriz oficial da banca
 */
function construirPromptCorrecao({ tema, vestibular, matriz, texto }) {
  const nomeBanca = matriz?.nome || vestibular?.toUpperCase() || 'Vestibular';
  const pontuacaoMax = matriz?.pontuacao_maxima || 1000;
  const genero = matriz?.tipo_genero || 'Dissertativo-argumentativo';
  
  const competenciasDesc = (matriz?.competencias || []).map(c => 
    `- Competência ${c.numero} (${c.nome}): peso máximo de ${c.peso} pontos. Critério oficial: ${c.descricao}`
  ).join('\n');

  return `Você é um avaliador e corretor oficial sênior de redações para bancas de vestibulares brasileiros (especialista na banca ${nomeBanca}).

Sua missão é corrigir e avaliar a redação de um estudante com rigor técnico, empatia pedagógica e critérios objetivos.

INFORMAÇÕES DA PROPOSTA:
- Vestibular / Banca: ${nomeBanca}
- Gênero textual exigido: ${genero}
- Pontuação máxima total: ${pontuacaoMax} pontos
- Tema da proposta: "${tema}"

MATRIZ OFICIAL DE COMPETÊNCIAS / CRITÉRIOS:
${competenciasDesc || '- Avaliação geral de domínio da norma padrão, repertório, coesão, coerência e proposta de intervenção/conclusão.'}

TEXTO REDIGIDO PELO ESTUDANTE:
"""
${texto}
"""

DIRETRIZES E REGRAS ABSOLUTAS DA AVALIAÇÃO:
1. Avalie EXCLUSIVAMENTE o texto real acima redigido. NUNCA invente trechos, repertórios, citações ou erros que o aluno não escreveu.
2. Seja justo e condizente com a régua e matriz de correção da banca ${nomeBanca}.
3. A soma das notas das competências DEVE ser exatamente igual ao campo "nota_total".
4. Cada competência deve ter sua nota atribuída entre 0 e o peso máximo estipulado para ela na matriz.
5. Se for ENEM: as notas de cada competência devem ser múltiplos de 40 (0, 40, 80, 120, 160, 200) conforme a cartilha oficial do INEP. A nota total deve ser entre 0 e 1000.
6. Se for FUVEST: notas graduadas de 0 a 20 na C1, 0 a 15 na C2 e 0 a 15 na C3 (total máx 50).
7. Se for UNICAMP: notas graduadas de 0 a 16 por critério (total máx 48).
8. Se for UNESP: notas graduadas conforme sua matriz (total máx 28).
9. Para CADA competência, forneça uma análise detalhada e justificada, citando trechos específicos da redação para ilustrar o acerto ou desvio.
10. Aponte entre 2 e 4 pontos fortes genuínos demonstrados no texto.
11. Aponte problemas identificados no texto (aspectos estruturais, gramaticais ou argumentativos) acompanhados de trechos que precisam de revisão quando aplicável.
12. Forneça entre 2 e 3 sugestões práticas e acionáveis de reescrita e aprimoramento.
13. Conclua com as prioridades claras de estudo recomendadas para a evolução do estudante.

RESPONDA OBRIGATORIAMENTE EM JSON VÁLIDO no seguinte formato exato (sem markdown em volta, apenas o JSON puro):
{
  "nota_total": number,
  "nota_maxima": ${pontuacaoMax},
  "competencias": [
    {
      "numero": number,
      "nome": "string",
      "nota": number,
      "nota_maxima": number,
      "justificativa": "string com justificativa analítica fundamentada, referenciando aspectos do texto"
    }
  ],
  "pontos_fortes": [
    "string"
  ],
  "pontos_melhoria": [
    "string apontando o problema e como corrigir"
  ],
  "exemplos_trechos": [
    "string com exemplo de trecho do texto e como reescrever melhor"
  ],
  "sugestoes": [
    "string com orientação prática de estudo"
  ],
  "prioridades_estudo": [
    "string indicando prioridade de estudo para o próximo texto"
  ],
  "feedback_geral": "string com análise holística do texto e conclusão pedagógica",
  "aviso_educacional": "Esta avaliação é uma estimativa pedagógica gerada por inteligência artificial para fins de treino e autoavaliação, não substituindo a correção oficial da banca examinadora."
}`;
}

/**
 * Chama a API oficial do Groq (compatível com OpenAI API v1/chat/completions)
 */
async function chamarGroq(apiKey, prompt) {
  const modelo = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const url = 'https://api.groq.com/openai/v1/chat/completions';

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
        temperature: 0.2,
        reasoning_effort: 'medium',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Você é um avaliador especialista em bancas de vestibulares brasileiros. Responda estritamente em JSON válido conforme solicitado.'
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
      throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 25s).');
    }
    throw err;
  }
}

/**
 * Chama o Google Gemini via API REST oficial
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
          temperature: 0.2,
          topP: 0.8,
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
      throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 25s).');
    }
    throw err;
  }
}

/**
 * Chama a OpenAI via API REST oficial
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
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Você é um avaliador de bancas de vestibulares. Responda estritamente em JSON válido conforme solicitado.'
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
      throw new Error('Tempo limite excedido ao aguardar resposta da IA (timeout de 25s).');
    }
    throw err;
  }
}

/**
 * Limpa e valida o JSON retornado pela IA
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

  // Normaliza competências
  const competenciasNormalizadas = (Array.isArray(parsed.competencias) ? parsed.competencias : []).map((comp, idx) => {
    const oficial = competenciasOficiais[idx] || {};
    const pesoMax = Number(oficial.peso) || Number(comp.nota_maxima) || 200;
    const notaBruta = Number(comp.nota) || 0;
    const notaClamped = Math.max(0, Math.min(pesoMax, Math.round(notaBruta)));

    return {
      numero: Number(comp.numero) || oficial.numero || (idx + 1),
      nome: String(comp.nome || oficial.nome || `Competência ${idx + 1}`),
      nota: notaClamped,
      nota_maxima: pesoMax,
      justificativa: String(comp.justificativa || 'Avaliação pedagógica realizada com base nos critérios da banca.')
    };
  });

  // Calcula soma das competências se houver lista
  let notaCalculada = competenciasNormalizadas.reduce((acc, c) => acc + c.nota, 0);
  if (competenciasNormalizadas.length === 0) {
    notaCalculada = Math.max(0, Math.min(pontuacaoMaximaOficial, Number(parsed.nota_total) || 0));
  }

  return {
    nota_total: notaCalculada,
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
 * Função principal exportada: avalia a redação utilizando o provedor configurado
 * Prioriza Groq (GROQ_API_KEY) conforme diretrizes da Etapa atual.
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
