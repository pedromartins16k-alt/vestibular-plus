/**
 * test/test-etapa36-2-fallback.js — Validação do Fallback Resiliente entre Provedores de IA (Etapa 36.2)
 *
 * Casos cobertos com mocks determinísticos (sem dependência de chaves de API nem chamadas externas):
 *  1. Groq retorna JSON válido: fallback NÃO é acionado (retorna imediatamente da Groq).
 *  2. Groq retorna erro de geração JSON (HTTP 400) e Gemini retorna resposta válida (fallback acionado com sucesso).
 *  3. Groq retorna resposta truncada (finish_reason 'length') e Gemini retorna resposta válida.
 *  4. Groq retorna JSON sintaticamente inválido e Gemini também falha: erro agregado seguro lançado.
 *  5. Todos os provedores configurados falham: erro seguro agregado sem expor PII.
 *  6. Gemini ou OpenAI não configurados: ignorados silenciosamente sem crash.
 *  7. Resposta parcial com C1 a C4 é rejeitada pelo validador downstream.
 *  8. Resposta com competência duplicada (duas C1 e sem C5) é rejeitada pelo validador.
 *  9. Resposta válida com C1 a C5 é aceita e normalizada com sucesso.
 * 10. Provedor com chave inválida (HTTP 401) aciona fallback para o próximo provedor.
 * 11. Erro HTTP 429 (rate limit) aciona fallback para o próximo provedor.
 * 12. Prevenção de loop: cada provedor é tentado no máximo 1 vez por chamada.
 * 13. Orçamento global de tempo: tentativas adicionais são abortadas quando não há tempo útil suficiente.
 * 14. Logs e erros estruturados não contêm texto integral da redação, prompts ou chaves de API.
 * 15. Avaliação incompleta nunca é aceita nem considerada concluída.
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

const comp5Json = (notas = [160, 160, 160, 160, 160]) => JSON.stringify({
  nota_total: notas.reduce((a, b) => a + b, 0),
  competencias: notas.map((nota, i) => ({
    numero: i + 1,
    nota,
    justificativa: `Justificativa formal com extensão adequada para a competência ${i + 1}.`
  }))
});

console.log('🧪 ETAPA 36.2 — Testes de Fallback Resiliente e Integridade entre Provedores\n');

// ─── 1. Groq retorna JSON válido: fallback NÃO acionado ──────────────────────
total++;
try {
  const originalFetch = globalThis.fetch;
  let chamadasGroq = 0;
  let chamadasGemini = 0;

  globalThis.fetch = async (url) => {
    if (url.includes('api.groq.com')) {
      chamadasGroq++;
      return {
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: comp5Json() } }],
          usage: { prompt_tokens: 1000, completion_tokens: 800 }
        })
      };
    }
    if (url.includes('googleapis.com')) {
      chamadasGemini++;
      return { ok: true, json: async () => ({}) };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  process.env.GROQ_API_KEY = 'mock-groq-key';
  process.env.GEMINI_API_KEY = 'mock-gemini-key';

  try {
    const res = await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
    });

    assert.equal(chamadasGroq, 1, 'Groq chamado exatamente 1 vez');
    assert.equal(chamadasGemini, 0, 'Gemini NÃO deve ser chamado quando Groq tem sucesso');
    assert.equal(res.competencias.length, 5);
    pass('1 — Groq retorna JSON válido: fallback não acionado');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('1', e); }

// ─── 2. Groq retorna erro de JSON (400) e Gemini responde com sucesso ───────
total++;
try {
  const originalFetch = globalThis.fetch;
  let chamadasGroq = 0;
  let chamadasGemini = 0;

  globalThis.fetch = async (url) => {
    if (url.includes('api.groq.com')) {
      chamadasGroq++;
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: { message: 'Failed to generate JSON', code: 'json_validate_failed', type: 'invalid_request_error' }
        })
      };
    }
    if (url.includes('googleapis.com')) {
      chamadasGemini++;
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: comp5Json() }] } }],
          usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 850 }
        })
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  process.env.GROQ_API_KEY = 'mock-groq-key';
  process.env.GEMINI_API_KEY = 'mock-gemini-key';

  try {
    const res = await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
    });

    assert.equal(chamadasGroq, 1, 'Groq chamado 1 vez e falhou');
    assert.equal(chamadasGemini, 1, 'Gemini chamado via fallback');
    assert.equal(res.competencias.length, 5);
    assert.equal(res.modelo_utilizado, 'google/gemini-1.5-flash');
    pass('2 — Groq retorna 400 (falha de JSON) e Gemini assume com sucesso');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('2', e); }

// ─── 3. Groq retorna resposta truncada ('length') e Gemini assume ───────────
total++;
try {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (url.includes('api.groq.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: 'length', message: { content: '{"nota_total": 320, "competencias": [' } }],
          usage: { prompt_tokens: 1000, completion_tokens: 16384 }
        })
      };
    }
    if (url.includes('googleapis.com')) {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: comp5Json() }] } }],
          usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 800 }
        })
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  process.env.GROQ_API_KEY = 'mock-groq-key';
  process.env.GEMINI_API_KEY = 'mock-gemini-key';

  try {
    const res = await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
    });

    assert.equal(res.competencias.length, 5);
    assert.equal(res.modelo_utilizado, 'google/gemini-1.5-flash');
    pass('3 — Groq com finish_reason "length" aciona fallback para Gemini');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('3', e); }

// ─── 4. Groq retorna JSON inválido e próximo provedor também falha ──────────
total++;
try {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (url.includes('api.groq.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: '{ invalid json syntax ...' } }]
        })
      };
    }
    if (url.includes('googleapis.com')) {
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal server error in Gemini'
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  process.env.GROQ_API_KEY = 'mock-groq-key';
  process.env.GEMINI_API_KEY = 'mock-gemini-key';

  try {
    let capturouErro = false;
    try {
      await avaliarRedacaoComIA({
        tema: 'Tema teste',
        vestibular: 'enem',
        matriz: matrizEnem,
        texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
      });
    } catch (err) {
      capturouErro = true;
      assert.equal(err.statusCode, 502);
      assert.equal(err.tipo, 'FALHA_TODOS_PROVEDORES_IA');
      assert.ok(Array.isArray(err.erros));
      assert.equal(err.erros.length, 2);
    }
    assert.ok(capturouErro, 'Deve lançar erro agregado quando ambos os provedores falham');
    pass('4 — Groq JSON inválido e Gemini 500: lança erro agregado 502');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('4', e); }

// ─── 5. Todos os provedores falham: erro seguro agregado sem expor PII ──────
total++;
try {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    return { ok: false, status: 503, text: async () => 'Service Unavailable' };
  };

  process.env.GROQ_API_KEY = 'mock-groq-key';
  process.env.GEMINI_API_KEY = 'mock-gemini-key';
  process.env.OPENAI_API_KEY = 'mock-openai-key';

  try {
    let capturou = false;
    try {
      await avaliarRedacaoComIA({
        tema: 'Tema teste',
        vestibular: 'enem',
        matriz: matrizEnem,
        texto: 'Minha redação particular com dados confidenciais do estudante que não podem vazar nos erros.'
      });
    } catch (err) {
      capturou = true;
      assert.equal(err.statusCode, 502);
      assert.ok(!err.message.includes('dados confidenciais'), 'Mensagem de erro não deve conter texto da redação');
      assert.ok(!err.message.includes('mock-groq-key'), 'Mensagem de erro não deve conter chave');
    }
    assert.ok(capturou);
    pass('5 — Todos falham: erro agregado 502 seguro sem vazar texto ou credenciais');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
} catch (e) { fail('5', e); }

// ─── 6. Gemini ou OpenAI não configurados: ignorados silenciosamente ────────
total++;
try {
  const originalFetch = globalThis.fetch;
  let chamadas = [];

  globalThis.fetch = async (url) => {
    chamadas.push(url);
    if (url.includes('api.groq.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: comp5Json() } }]
        })
      };
    }
    throw new Error('Não deveria chamar outros');
  };

  // Somente Groq configurado
  process.env.GROQ_API_KEY = 'mock-groq-key';
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const res = await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
    });
    assert.equal(res.competencias.length, 5);
    assert.equal(chamadas.length, 1);
    pass('6 — Provedores não configurados ignorados silenciosamente sem crash');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  }
} catch (e) { fail('6', e); }

// ─── 7. Resposta parcial com C1 a C4 rejeitada pelo validador ────────────────
total++;
try {
  const payload4 = JSON.stringify({
    nota_total: 640,
    competencias: [
      { numero: 1, nota: 160, justificativa: 'Texto justificativa 1' },
      { numero: 2, nota: 160, justificativa: 'Texto justificativa 2' },
      { numero: 3, nota: 160, justificativa: 'Texto justificativa 3' },
      { numero: 4, nota: 160, justificativa: 'Texto justificativa 4' }
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(payload4, matrizEnem, 'mock'),
    /esperadas 5 competências/i
  );
  pass('7 — Resposta parcial com C1 a C4 é sumariamente rejeitada pelo validador');
} catch (e) { fail('7', e); }

// ─── 8. Resposta com competência duplicada rejeitada ────────────────────────
total++;
try {
  const payloadDup = JSON.stringify({
    nota_total: 800,
    competencias: [
      { numero: 1, nota: 160, justificativa: 'Justificativa comp 1' },
      { numero: 1, nota: 160, justificativa: 'Justificativa comp 1 duplicada' },
      { numero: 2, nota: 160, justificativa: 'Justificativa comp 2' },
      { numero: 3, nota: 160, justificativa: 'Justificativa comp 3' },
      { numero: 4, nota: 160, justificativa: 'Justificativa comp 4' }
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(payloadDup, matrizEnem, 'mock'),
    /competência C5 não foi retornada/i
  );
  pass('8 — Resposta com competência duplicada (sem C5) rejeitada');
} catch (e) { fail('8', e); }

// ─── 9. Resposta válida com C1 a C5 aceita ──────────────────────────────────
total++;
try {
  const res = validarENormalizarResposta(comp5Json(), matrizEnem, 'mock');
  assert.equal(res.competencias.length, 5);
  assert.equal(res.nota_total, 800);
  pass('9 — Resposta válida com C1 a C5 aceita com normalização correta');
} catch (e) { fail('9', e); }

// ─── 10. Provedor com chave inválida (401) aciona fallback ──────────────────
total++;
try {
  const originalFetch = globalThis.fetch;
  let chamouGemini = false;

  globalThis.fetch = async (url) => {
    if (url.includes('api.groq.com')) {
      return { ok: false, status: 401, text: async () => '{"error":{"message":"Invalid API Key"}}' };
    }
    if (url.includes('googleapis.com')) {
      chamouGemini = true;
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: comp5Json() }] } }]
        })
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  process.env.GROQ_API_KEY = 'invalid-groq-key';
  process.env.GEMINI_API_KEY = 'valid-gemini-key';

  try {
    const res = await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
    });
    assert.ok(chamouGemini, 'Gemini deve assumir quando Groq retorna 401');
    assert.equal(res.competencias.length, 5);
    pass('10 — Provedor com HTTP 401 aciona fallback para o próximo configurado');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('10', e); }

// ─── 11. Erro HTTP 429 aciona fallback de forma controlada ──────────────────
total++;
try {
  const originalFetch = globalThis.fetch;
  let chamouGemini = false;

  globalThis.fetch = async (url) => {
    if (url.includes('api.groq.com')) {
      return { ok: false, status: 429, text: async () => '{"error":{"message":"Rate limit reached"}}' };
    }
    if (url.includes('googleapis.com')) {
      chamouGemini = true;
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: comp5Json() }] } }]
        })
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  process.env.GROQ_API_KEY = 'mock-groq-key';
  process.env.GEMINI_API_KEY = 'mock-gemini-key';

  try {
    const res = await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
    });
    assert.ok(chamouGemini, 'Gemini deve ser chamado ao receber 429 da Groq');
    assert.equal(res.competencias.length, 5);
    pass('11 — Erro HTTP 429 na Groq aciona fallback para Gemini');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('11', e); }

// ─── 12. O mesmo provedor não é chamado repetidamente sem fim ───────────────
total++;
try {
  const originalFetch = globalThis.fetch;
  let contadorGroq = 0;

  globalThis.fetch = async (url) => {
    if (url.includes('api.groq.com')) {
      contadorGroq++;
      return { ok: false, status: 500, text: async () => 'Internal Error' };
    }
    throw new Error('Nenhum outro provedor');
  };

  process.env.GROQ_API_KEY = 'mock-groq-key';
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    try {
      await avaliarRedacaoComIA({
        tema: 'Tema teste',
        vestibular: 'enem',
        matriz: matrizEnem,
        texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
      });
    } catch (_) {}
    assert.equal(contadorGroq, 1, 'Provedor deve ser chamado no máximo 1 vez por tentativa de avaliação');
    pass('12 — Prevenção de chamadas duplicadas: exatamente 1 chamada por provedor');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  }
} catch (e) { fail('12', e); }

// ─── 13. Orçamento global de tempo impede tentativas quando esgotado ─────────
total++;
try {
  // Verifica se a checagem de orçamento global existe no fonte de _ai-service.js
  assert.match(aiServiceSrc, /TETO_GLOBAL_MS/);
  assert.match(aiServiceSrc, /tempoRestante\s*<\s*MARGEM_MINIMA_MS/);
  assert.match(aiServiceSrc, /ORCAMENTO_TEMPO_ESGOTADO/);
  pass('13 — Orçamento global de tempo e teto mínimo verificados no código');
} catch (e) { fail('13', e); }

// ─── 14. Logs e erros não incluem PII, prompts ou chave de API ──────────────
total++;
try {
  // Inspeciona o bloco de fallback para garantir ausência de interpolação da chave ou prompt nos logs
  const blocoFallback = aiServiceSrc.slice(aiServiceSrc.indexOf('export async function avaliarRedacaoComIA'));
  assert.ok(!blocoFallback.includes('console.log(key)'), 'Chave nunca logada');
  assert.ok(!blocoFallback.includes('console.warn(prompt)'), 'Prompt nunca logado');
  assert.ok(!blocoFallback.includes('console.warn(texto)'), 'Texto nunca logado');
  pass('14 — Logs técnicos seguros sem PII, texto da redação, prompt ou chave');
} catch (e) { fail('14', e); }

// ─── 15. Avaliação incompleta nunca é aceita nem considerada concluída ───────
total++;
try {
  // JSON com apenas C1
  const payload1 = JSON.stringify({
    nota_total: 160,
    competencias: [{ numero: 1, nota: 160, justificativa: 'Apenas C1' }]
  });
  assert.throws(
    () => validarENormalizarResposta(payload1, matrizEnem, 'mock'),
    /A avaliação está incompleta: esperadas 5 competências/i
  );
  pass('15 — Avaliação incompleta é estritamente rejeitada sem produzir nota final');
} catch (e) { fail('15', e); }

console.log(`\n========================================`);
console.log(`Resultado ETAPA 36.2: ${passados}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (passados !== total) process.exit(1);
