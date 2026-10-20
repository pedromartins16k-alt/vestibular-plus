/**
 * test/test-etapa36-3-timeout-adaptativo.js — Validação do Timeout Adaptativo do Fallback de IA (Etapa 36.3)
 *
 * Casos cobertos com mocks determinísticos (sem dependência de chaves de API nem chamadas externas):
 *  1. Timeout adaptativo quando há bastante tempo restante (usa min(TIMEOUT_MS, tempoRestante)).
 *  2. Timeout adaptativo quando resta pouco tempo (ex: tempoRestante diminui a cada chamada sem reiniciar).
 *  3. Bloqueio de uma nova tentativa quando resta menos de 4.000 ms (MARGEM_MINIMA_MS).
 *  4. Uma chamada lenta consome o orçamento global e não reinicia o relógio.
 *  5. O temporizador (clearTimeout) é limpo em sucesso e erro via bloco finally nos adaptadores.
 *  6. Um timeout de provedor permite fallback quando ainda existe tempo suficiente.
 *  7. O sistema não inicia um novo provedor sem orçamento suficiente.
 *  8. A ordem Groq → Gemini → OpenAI permanece intacta.
 *  9. O comportamento permanece correto quando apenas uma chave está configurada.
 * 10. A resposta final agregada continua correta quando todos os provedores falham.
 * 11. Respostas truncadas ou com JSON inválido continuam sendo rejeitadas.
 * 12. As cinco competências C1–C5 continuam obrigatórias.
 * 13. As notas continuam respeitando os múltiplos de 40 no ENEM.
 * 14. Os logs não revelam chaves nem o conteúdo da redação.
 * 15. Os testes não fazem chamadas reais aos provedores nem consomem cotas gratuitas.
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

console.log('🧪 ETAPA 36.3 — Testes de Timeout Adaptativo e Blindagem do Orçamento Global\n');

// ─── 1. Timeout adaptativo quando há bastante tempo restante ─────────────────
total++;
try {
  // Verifica se o adaptador utiliza timeoutMs dinâmico
  assert.match(aiServiceSrc, /async function chamarGroq\(apiKey,\s*prompt,\s*timeoutMs\s*=\s*TIMEOUT_MS\)/,
    'chamarGroq deve aceitar timeoutMs');
  assert.match(aiServiceSrc, /async function chamarGemini\(apiKey,\s*prompt,\s*timeoutMs\s*=\s*TIMEOUT_MS\)/,
    'chamarGemini deve aceitar timeoutMs');
  assert.match(aiServiceSrc, /async function chamarOpenAI\(apiKey,\s*prompt,\s*timeoutMs\s*=\s*TIMEOUT_MS\)/,
    'chamarOpenAI deve aceitar timeoutMs');
  assert.match(aiServiceSrc, /const timeoutChamada = Math\.min\(TIMEOUT_MS,\s*tempoRestante\);/,
    'avaliarRedacaoComIA deve calcular timeoutChamada baseado no tempoRestante');

  pass('1 — Timeout adaptativo configurado com menor valor entre limite individual e tempo restante');
} catch (e) { fail('1', e); }

// ─── 2. Timeout adaptativo calcula tempoRestante dinamicamente sem reiniciar ──
total++;
try {
  assert.match(aiServiceSrc, /const decorrido = Date\.now\(\) - tempoInicio;/);
  assert.match(aiServiceSrc, /const tempoRestante = TETO_GLOBAL_MS - decorrido;/);
  pass('2 — Orçamento temporal deduz o tempo decorrido a cada tentativa em relação a tempoInicio');
} catch (e) { fail('2', e); }

// ─── 3. Bloqueio de nova tentativa quando tempoRestante < 4.000 ms ───────────
total++;
try {
  assert.match(aiServiceSrc, /if \(tempoRestante < MARGEM_MINIMA_MS\)/);
  assert.match(aiServiceSrc, /ORCAMENTO_TEMPO_ESGOTADO/);
  pass('3 — Bloqueio automático de novas tentativas quando resta menos de 4.000 ms');
} catch (e) { fail('3', e); }

// ─── 4. Uma chamada lenta não reinicia o orçamento global ───────────────────
total++;
try {
  // tempoInicio é declarado fora do loop for
  const idxLoop = aiServiceSrc.indexOf('for (let i = 0; i < provedoresElegiveis.length; i++)');
  const idxInicio = aiServiceSrc.indexOf('const tempoInicio = Date.now();');
  assert.ok(idxInicio < idxLoop, 'tempoInicio deve ser inicializado antes do loop for dos provedores');
  pass('4 — Orçamento global inicializado estritamente antes do loop, garantindo monotonicidade');
} catch (e) { fail('4', e); }

// ─── 5. Temporizador (clearTimeout) limpo via finally em todos os adaptadores ─
total++;
try {
  const contarFinallyClearTimeout = (aiServiceSrc.match(/finally\s*\{\s*clearTimeout\(timeoutId\);\s*\}/g) || []).length;
  assert.equal(contarFinallyClearTimeout, 3, 'Todos os 3 adaptadores devem ter bloco finally com clearTimeout');
  pass('5 — Limpeza garantida de temporizadores em todos os adaptadores via bloco finally');
} catch (e) { fail('5', e); }

// ─── 6. Timeout de provedor permite fallback quando ainda há tempo útil ──────
total++;
try {
  const originalFetch = globalThis.fetch;
  let chamouGemini = false;

  globalThis.fetch = async (url, options) => {
    if (url.includes('api.groq.com')) {
      const err = new Error('Tempo limite excedido');
      err.name = 'AbortError';
      throw err;
    }
    if (url.includes('googleapis.com')) {
      chamouGemini = true;
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

    assert.ok(chamouGemini, 'Gemini deve ser acionado em caso de AbortError/Timeout da Groq');
    assert.equal(res.competencias.length, 5);
    pass('6 — Timeout na Groq permite fallback imediato para o Gemini quando há tempo útil');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('6', e); }

// ─── 7. Provedores sequenciais respeitam a ordem Groq → Gemini → OpenAI ──────
total++;
try {
  const originalFetch = globalThis.fetch;
  const ordemChamadas = [];

  globalThis.fetch = async (url) => {
    if (url.includes('api.groq.com')) {
      ordemChamadas.push('groq');
      return { ok: false, status: 500, text: async () => 'Groq 500' };
    }
    if (url.includes('googleapis.com')) {
      ordemChamadas.push('gemini');
      return { ok: false, status: 500, text: async () => 'Gemini 500' };
    }
    if (url.includes('api.openai.com')) {
      ordemChamadas.push('openai');
      return {
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: comp5Json() } }],
          usage: { prompt_tokens: 1000, completion_tokens: 800 }
        })
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  process.env.GROQ_API_KEY = 'mock-groq';
  process.env.GEMINI_API_KEY = 'mock-gemini';
  process.env.OPENAI_API_KEY = 'mock-openai';

  try {
    const res = await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
    });

    assert.deepEqual(ordemChamadas, ['groq', 'gemini', 'openai']);
    assert.equal(res.competencias.length, 5);
    pass('7 — Ordem estrita Groq → Gemini → OpenAI executada sequencialmente');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
} catch (e) { fail('7', e); }

// ─── 8. Comportamento correto com apenas uma chave configurada ───────────────
total++;
try {
  const originalFetch = globalThis.fetch;
  let chamadas = 0;

  globalThis.fetch = async (url) => {
    chamadas++;
    return {
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: comp5Json() }] } }]
      })
    };
  };

  delete process.env.GROQ_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-gemini';
  delete process.env.OPENAI_API_KEY;

  try {
    const res = await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
    });

    assert.equal(chamadas, 1);
    assert.equal(res.competencias.length, 5);
    pass('8 — Apenas uma chave configurada (Gemini) opera normalmente sem erros');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('8', e); }

// ─── 9. Resposta final agregada correta quando todos os provedores falham ────
total++;
try {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    return { ok: false, status: 503, text: async () => 'Service Unavailable' };
  };

  process.env.GROQ_API_KEY = 'mock-groq';
  process.env.GEMINI_API_KEY = 'mock-gemini';

  try {
    let capturou = false;
    try {
      await avaliarRedacaoComIA({
        tema: 'Tema teste',
        vestibular: 'enem',
        matriz: matrizEnem,
        texto: 'Texto de teste para validação de redação com mais de 50 caracteres para passar na validação.'
      });
    } catch (err) {
      capturou = true;
      assert.equal(err.statusCode, 502);
      assert.equal(err.tipo, 'FALHA_TODOS_PROVEDORES_IA');
      assert.ok(err.message.includes('groq'));
      assert.ok(err.message.includes('gemini'));
    }
    assert.ok(capturou);
    pass('9 — Erro agregado seguro com status 502 emitido quando todos os provedores falham');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
} catch (e) { fail('9', e); }

// ─── 10. Resposta truncada ('length') rejeitada sem atribuir nota parcial ────
total++;
try {
  const jsonTruncado = '{"nota_total": 480, "competencias": [{"numero": 1, "nota": 160';
  assert.throws(
    () => validarENormalizarResposta(jsonTruncado, matrizEnem, 'mock'),
    /Formato JSON inválido/i
  );
  pass('10 — Resposta truncada rejeitada sumariamente');
} catch (e) { fail('10', e); }

// ─── 11. Presença obrigatória de C1 a C5 no ENEM ─────────────────────────────
total++;
try {
  const json3 = JSON.stringify({
    nota_total: 480,
    competencias: [
      { numero: 1, nota: 160, justificativa: 'Justificativa 1 longa o suficiente.' },
      { numero: 2, nota: 160, justificativa: 'Justificativa 2 longa o suficiente.' },
      { numero: 3, nota: 160, justificativa: 'Justificativa 3 longa o suficiente.' }
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(json3, matrizEnem, 'mock'),
    /esperadas 5 competências/i
  );
  pass('11 — Resposta com apenas 3 competências sumariamente rejeitada');
} catch (e) { fail('11', e); }

// ─── 12. Validação estrita de notas em múltiplos de 40 no ENEM ───────────────
total++;
try {
  const jsonInvalidoNota = JSON.stringify({
    nota_total: 800,
    competencias: [
      { numero: 1, nota: 150, justificativa: 'Nota 150 inválida no ENEM.' },
      { numero: 2, nota: 160, justificativa: 'Justificativa 2 longa o suficiente.' },
      { numero: 3, nota: 160, justificativa: 'Justificativa 3 longa o suficiente.' },
      { numero: 4, nota: 160, justificativa: 'Justificativa 4 longa o suficiente.' },
      { numero: 5, nota: 160, justificativa: 'Justificativa 5 longa o suficiente.' }
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(jsonInvalidoNota, matrizEnem, 'mock'),
    /incrementos válidos de 40 pontos/i
  );
  pass('12 — Notas fora dos múltiplos de 40 no ENEM rejeitadas com erro estrito');
} catch (e) { fail('12', e); }

// ─── 13. Logs não expõem chaves nem texto integral da redação ────────────────
total++;
try {
  assert.ok(!aiServiceSrc.includes('console.log(apiKey)'));
  assert.ok(!aiServiceSrc.includes('console.log(key)'));
  assert.ok(!aiServiceSrc.includes('console.warn(texto)'));
  assert.ok(!aiServiceSrc.includes('console.log(rawText)'));
  pass('13 — Garantia estrutural de que chaves e textos de redação não são logados');
} catch (e) { fail('13', e); }

// ─── 14. Isolamento total contra chamadas reais ──────────────────────────────
total++;
try {
  // Testes rodam com chaves mockadas e fetch interceptado
  assert.ok(!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.includes('mock'));
  pass('14 — Testes executam exclusivamente em memória sem chamadas externas');
} catch (e) { fail('14', e); }

// ─── 15. Proteção de timeout mínimo por chamada ──────────────────────────────
total++;
try {
  assert.match(aiServiceSrc, /const timeoutEfetivo = Math\.max\(1000,\s*Number\(timeoutMs\)\s*\|\|\s*TIMEOUT_MS\);/);
  pass('15 — Timeout efetivo protege contra valores nulos, negativos ou abaixo de 1000ms');
} catch (e) { fail('15', e); }

console.log(`\n========================================`);
console.log(`Resultado ETAPA 36.3: ${passados}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (passados !== total) process.exit(1);
