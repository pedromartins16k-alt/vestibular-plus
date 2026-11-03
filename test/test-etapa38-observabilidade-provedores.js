/**
 * test/test-etapa38-observabilidade-provedores.js — Observabilidade dos Provedores de IA (Etapa 38)
 *
 * Casos cobertos com mocks determinísticos (sem dependência de chaves de API nem chamadas externas):
 *  1. Gemini HTTP 400  → categoria FORMATO_OU_VALIDACAO_JSON  (não mais ERRO_INTERNO_PROVEDOR).
 *  2. Gemini HTTP 401  → categoria AUTENTICACAO_INVALIDA.
 *  3. Gemini HTTP 403  → categoria AUTENTICACAO_INVALIDA.
 *  4. Gemini HTTP 404  → categoria MODELO_NAO_ENCONTRADO.
 *  5. Gemini HTTP 429  → categoria TAXA_LIMITE_IA.
 *  6. Gemini HTTP 500  → categoria ERRO_INTERNO_PROVEDOR.
 *  7. Groq   HTTP 404  → categoria MODELO_NAO_ENCONTRADO.
 *  8. Groq   HTTP 422  → categoria PARAMETRO_INVALIDO.
 *  9. Falha do 1º (Groq) + sucesso do 2º (Gemini) via fallback.
 * 10. Falha dos 2 primeiros + sucesso do 3º (OpenAI mock).
 * 11. Logs e mensagens de erro não expõem chaves de API nem texto integral da redação.
 * 12. Avaliação com menos de 5 competências continua sendo rejeitada.
 */

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { validarENormalizarResposta, avaliarRedacaoComIA } from '../api/_ai-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const aiServiceSrc = readFileSync(join(__dirname, '../api/_ai-service.js'), 'utf8');

let total = 0;
let passados = 0;

function pass(nome) { passados++; console.log(`  ✅ [PASS] ${nome}`); }
function fail(nome, err) { console.error(`  ❌ [FAIL] ${nome}:`, err?.message || err); }

const matrizEnem = {
  nome: 'ENEM — Exame Nacional do Ensino Médio',
  pontuacao_maxima: 1000,
  competencias: [
    { numero: 1, nome: 'C1', peso: 200 },
    { numero: 2, nome: 'C2', peso: 200 },
    { numero: 3, nome: 'C3', peso: 200 },
    { numero: 4, nome: 'C4', peso: 200 },
    { numero: 5, nome: 'C5', peso: 200 }
  ]
};

const TEXTO_TESTE = 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.';
const MOCK_GROQ_KEY = 'sk-groq-mock-key-etapa38';
const MOCK_GEMINI_KEY = 'sk-gemini-mock-key-etapa38';
const MOCK_OPENAI_KEY = 'sk-openai-mock-key-etapa38';

const comp5Json = (notas = [160, 160, 160, 160, 160]) => JSON.stringify({
  nota_total: notas.reduce((a, b) => a + b, 0),
  competencias: notas.map((nota, i) => ({
    numero: i + 1,
    nota,
    justificativa: `Justificativa formal com extensão adequada para a competência ${i + 1}.`
  }))
});

// Helper: resposta Gemini bem-sucedida
const geminiOkResponse = () => ({
  ok: true,
  json: async () => ({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: comp5Json() }] } }],
    usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 850 }
  })
});

// Helper: resposta Groq bem-sucedida
const groqOkResponse = () => ({
  ok: true,
  json: async () => ({
    choices: [{ finish_reason: 'stop', message: { content: comp5Json() } }],
    usage: { prompt_tokens: 1000, completion_tokens: 800 }
  })
});

// Helper: resposta OpenAI bem-sucedida
const openaiOkResponse = () => ({
  ok: true,
  json: async () => ({
    choices: [{ finish_reason: 'stop', message: { content: comp5Json() } }],
    usage: { prompt_tokens: 1000, completion_tokens: 800 }
  })
});

// Helper: extrair categoria do erroAgregado
function getCategorias(erroAgregado) {
  return (erroAgregado?.erros || []).map(e => e.categoria);
}

/**
 * Helper reutilizável para isolamento estrito de testes:
 * - Salva snapshot completo de process.env antes da execução.
 * - Restaura globalThis.fetch, console.warn e console.error no finally.
 * - Restaura exatamente cada variável de ambiente para seu estado original (definida ou ausente).
 */
async function executarCenarioComIsolamento(fn) {
  const envSnapshot = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;

  try {
    await fn({ originalFetch, originalWarn, originalError });
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
    for (const [k, v] of Object.entries(envSnapshot)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

console.log('🧪 ETAPA 38 — Testes de Observabilidade dos Provedores de IA (com isolamento estrito)\n');

// ─── 1. Gemini HTTP 400 → FORMATO_OU_VALIDACAO_JSON (não ERRO_INTERNO_PROVEDOR) ───
total++;
try {
  await executarCenarioComIsolamento(async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('api.groq.com')) {
        throw new Error('Groq não configurado neste teste');
      }
      if (url.includes('googleapis.com')) {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: { message: 'Invalid JSON in request body', status: 'INVALID_ARGUMENT' } })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('1', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const categorias = getCategorias(e);
      assert.ok(
        categorias.includes('FORMATO_OU_VALIDACAO_JSON'),
        `Esperava FORMATO_OU_VALIDACAO_JSON, obteve: ${JSON.stringify(categorias)}`
      );
      assert.ok(!categorias.includes('ERRO_INTERNO_PROVEDOR'), 'Não deve categorizar 400 como ERRO_INTERNO_PROVEDOR');
      pass('1 — Gemini HTTP 400 → FORMATO_OU_VALIDACAO_JSON (statusCode preservado corretamente)');
    }
  });
} catch (e) { fail('1', e); }

// ─── 2. Gemini HTTP 401 → AUTENTICACAO_INVALIDA ─────────────────────────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('googleapis.com')) {
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ error: { message: 'API key not valid', status: 'UNAUTHENTICATED' } })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('2', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const categorias = getCategorias(e);
      assert.ok(
        categorias.includes('AUTENTICACAO_INVALIDA'),
        `Esperava AUTENTICACAO_INVALIDA, obteve: ${JSON.stringify(categorias)}`
      );
      pass('2 — Gemini HTTP 401 → AUTENTICACAO_INVALIDA');
    }
  });
} catch (e) { fail('2', e); }

// ─── 3. Gemini HTTP 403 → AUTENTICACAO_INVALIDA ─────────────────────────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('googleapis.com')) {
        return {
          ok: false,
          status: 403,
          text: async () => JSON.stringify({ error: { message: 'Permission denied', status: 'PERMISSION_DENIED' } })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('3', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const categorias = getCategorias(e);
      assert.ok(
        categorias.includes('AUTENTICACAO_INVALIDA'),
        `Esperava AUTENTICACAO_INVALIDA, obteve: ${JSON.stringify(categorias)}`
      );
      pass('3 — Gemini HTTP 403 → AUTENTICACAO_INVALIDA');
    }
  });
} catch (e) { fail('3', e); }

// ─── 4. Gemini HTTP 404 → MODELO_NAO_ENCONTRADO ─────────────────────────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('googleapis.com')) {
        return {
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ error: { message: 'Model not found', status: 'NOT_FOUND' } })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('4', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const categorias = getCategorias(e);
      assert.ok(
        categorias.includes('MODELO_NAO_ENCONTRADO'),
        `Esperava MODELO_NAO_ENCONTRADO, obteve: ${JSON.stringify(categorias)}`
      );
      pass('4 — Gemini HTTP 404 → MODELO_NAO_ENCONTRADO');
    }
  });
} catch (e) { fail('4', e); }

// ─── 5. Gemini HTTP 429 → TAXA_LIMITE_IA ────────────────────────────────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('googleapis.com')) {
        return {
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: { message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('5', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const categorias = getCategorias(e);
      assert.ok(
        categorias.includes('TAXA_LIMITE_IA'),
        `Esperava TAXA_LIMITE_IA, obteve: ${JSON.stringify(categorias)}`
      );
      pass('5 — Gemini HTTP 429 → TAXA_LIMITE_IA');
    }
  });
} catch (e) { fail('5', e); }

// ─── 6. Gemini HTTP 500 → ERRO_INTERNO_PROVEDOR ──────────────────────────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('googleapis.com')) {
        return {
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { message: 'Internal error', status: 'INTERNAL' } })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('6', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const categorias = getCategorias(e);
      assert.ok(
        categorias.includes('ERRO_INTERNO_PROVEDOR'),
        `Esperava ERRO_INTERNO_PROVEDOR, obteve: ${JSON.stringify(categorias)}`
      );
      pass('6 — Gemini HTTP 500 → ERRO_INTERNO_PROVEDOR');
    }
  });
} catch (e) { fail('6', e); }

// ─── 7. Groq HTTP 404 → MODELO_NAO_ENCONTRADO ───────────────────────────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('api.groq.com')) {
        return {
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ error: { message: 'Model not found', type: 'invalid_request_error' } })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GROQ_API_KEY = MOCK_GROQ_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('7', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const categorias = getCategorias(e);
      assert.ok(
        categorias.includes('MODELO_NAO_ENCONTRADO'),
        `Esperava MODELO_NAO_ENCONTRADO, obteve: ${JSON.stringify(categorias)}`
      );
      pass('7 — Groq HTTP 404 → MODELO_NAO_ENCONTRADO');
    }
  });
} catch (e) { fail('7', e); }

// ─── 8. Groq HTTP 422 → PARAMETRO_INVALIDO ──────────────────────────────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('api.groq.com')) {
        return {
          ok: false,
          status: 422,
          text: async () => JSON.stringify({ error: { message: 'Unprocessable entity', type: 'invalid_request_error' } })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GROQ_API_KEY = MOCK_GROQ_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('8', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const categorias = getCategorias(e);
      assert.ok(
        categorias.includes('PARAMETRO_INVALIDO'),
        `Esperava PARAMETRO_INVALIDO, obteve: ${JSON.stringify(categorias)}`
      );
      pass('8 — Groq HTTP 422 → PARAMETRO_INVALIDO');
    }
  });
} catch (e) { fail('8', e); }

// ─── 9. Falha do 1º (Groq 404) + sucesso do 2º (Gemini) via fallback ────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    let chamadaGroq = 0;
    let chamadaGemini = 0;

    globalThis.fetch = async (url) => {
      if (url.includes('api.groq.com')) {
        chamadaGroq++;
        return {
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ error: { message: 'Model not found' } })
        };
      }
      if (url.includes('googleapis.com')) {
        chamadaGemini++;
        return geminiOkResponse();
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GROQ_API_KEY = MOCK_GROQ_KEY;
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const res = await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      assert.equal(chamadaGroq, 1, 'Groq deve ser chamado 1 vez');
      assert.equal(chamadaGemini, 1, 'Gemini deve ser chamado via fallback');
      assert.equal(res.competencias.length, 5, 'Deve retornar 5 competências');
      pass('9 — Groq falha (404) → fallback acionado para Gemini com sucesso');
    } catch (e) { fail('9', e); }
  });
} catch (e) { fail('9', e); }

// ─── 10. Falha dos 2 primeiros + sucesso do 3º (OpenAI mock) ─────────────────
total++;
try {
  await executarCenarioComIsolamento(async () => {
    let chamadaGroq = 0;
    let chamadaGemini = 0;
    let chamadaOpenAI = 0;

    globalThis.fetch = async (url) => {
      if (url.includes('api.groq.com')) {
        chamadaGroq++;
        return { ok: false, status: 422, text: async () => JSON.stringify({ error: { message: 'Unprocessable' } }) };
      }
      if (url.includes('googleapis.com')) {
        chamadaGemini++;
        return { ok: false, status: 500, text: async () => JSON.stringify({ error: { message: 'Internal error' } }) };
      }
      if (url.includes('api.openai.com')) {
        chamadaOpenAI++;
        return openaiOkResponse();
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GROQ_API_KEY = MOCK_GROQ_KEY;
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    process.env.OPENAI_API_KEY = MOCK_OPENAI_KEY;

    try {
      const res = await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      assert.equal(chamadaGroq, 1, 'Groq deve ser chamado 1 vez');
      assert.equal(chamadaGemini, 1, 'Gemini deve ser chamado via fallback');
      assert.equal(chamadaOpenAI, 1, 'OpenAI deve ser chamado como 3º fallback');
      assert.equal(res.competencias.length, 5, 'Deve retornar 5 competências');
      pass('10 — Groq (422) e Gemini (500) falham → 3º fallback OpenAI bem-sucedido');
    } catch (e) { fail('10', e); }
  });
} catch (e) { fail('10', e); }

// ─── 11. Mensagens de erro e logs não expõem chaves de API nem texto da redação ──
total++;
try {
  await executarCenarioComIsolamento(async () => {
    const logsCapturados = [];
    console.warn = (...args) => {
      logsCapturados.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };
    console.error = (...args) => {
      logsCapturados.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.groq.com')) {
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({
            error: { message: `Invalid API key: ${MOCK_GROQ_KEY}`, type: 'authentication_error' }
          })
        };
      }
      if (url.includes('googleapis.com')) {
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({
            error: { message: `API key not valid: ${MOCK_GEMINI_KEY}`, status: 'UNAUTHENTICATED' }
          })
        };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    process.env.GROQ_API_KEY = MOCK_GROQ_KEY;
    process.env.GEMINI_API_KEY = MOCK_GEMINI_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await avaliarRedacaoComIA({ tema: 'Tema', vestibular: 'enem', matriz: matrizEnem, texto: TEXTO_TESTE });
      fail('11', new Error('Deveria ter lançado erro'));
    } catch (e) {
      const msgAgregada = e.message || '';
      const errosStr = JSON.stringify(e.erros || []);
      const logsTexto = logsCapturados.join('\n');

      const exposiGroqMsg = msgAgregada.includes(MOCK_GROQ_KEY) || errosStr.includes(MOCK_GROQ_KEY);
      const exposiGeminiMsg = msgAgregada.includes(MOCK_GEMINI_KEY) || errosStr.includes(MOCK_GEMINI_KEY);
      const exposiGroqLogs = logsTexto.includes(MOCK_GROQ_KEY);
      const exposiGeminiLogs = logsTexto.includes(MOCK_GEMINI_KEY);
      const exposiRedacaoLogs = logsTexto.includes(TEXTO_TESTE);

      assert.ok(!exposiGroqMsg, 'Mensagem de erro NÃO deve expor a chave Groq');
      assert.ok(!exposiGeminiMsg, 'Mensagem de erro NÃO deve expor a chave Gemini');
      assert.ok(!exposiGroqLogs, 'Logs do console NÃO devem expor a chave Groq');
      assert.ok(!exposiGeminiLogs, 'Logs do console NÃO devem expor a chave Gemini');
      assert.ok(!exposiRedacaoLogs, 'Logs do console NÃO devem conter o texto integral da redação');

      pass('11 — Chaves de API e texto integral da redação não aparecem nas mensagens nem nos logs');
    }
  });
} catch (e) { fail('11', e); }

// ─── 12. Menos de 5 competências continua sendo rejeitado ────────────────────
total++;
try {
  const payload4comps = JSON.stringify({
    nota_total: 640,
    competencias: [1, 2, 3, 4].map(i => ({
      numero: i,
      nota: 160,
      justificativa: `Justificativa formal para a competência ${i} com conteúdo adequado.`
    }))
  });

  assert.throws(
    () => validarENormalizarResposta(payload4comps, matrizEnem, 'mock'),
    /competência C5|5 competências|competências/i
  );
  pass('12 — Avaliação com 4 competências (sem C5) continua sendo rejeitada pelo validador');
} catch (e) { fail('12', e); }

// ─── Resultado Final ──────────────────────────────────────────────────────────
console.log(`\n📊 RESULTADO: ${passados}/${total} testes passaram\n`);
if (passados === total) {
  console.log('✅ ETAPA 38 — TODOS OS TESTES PASSARAM COM ISOLAMENTO E LOGS PROTEGIDOS\n');
  process.exit(0);
} else {
  console.error(`❌ ETAPA 38 — ${total - passados} TESTE(S) FALHARAM\n`);
  process.exit(1);
}
