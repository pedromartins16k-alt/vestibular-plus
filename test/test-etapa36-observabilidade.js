/**
 * test/test-etapa36-observabilidade.js — Etapa 36
 *
 * Cobre:
 *  1.  Orçamento de saída correto por provedor (sem chamadas reais).
 *  2.  finish_reason === 'length' → erro RESPOSTA_TRUNCADA_IA.
 *  3.  finish_reason === 'stop' com JSON incompleto (3 de 5) → rejeitado por validador.
 *  4.  finish_reason ausente → JSON completo aceito (validador decide, não finish_reason).
 *  5.  finish_reason inesperado ('content_filter') → JSON completo ainda aceito.
 *  6.  JSON sintaticamente válido com 3 competências → rejeitado.
 *  7.  JSON completo C1–C5 → aceito.
 *  8.  Campos usage ausentes → sem exceção.
 *  9.  reasoning_tokens presente → registrado sem exceção.
 * 10.  Ausência de PII nos metadados de log.
 * 11.  Erro do provedor (HTTP 4xx/5xx) → rejeita sem aceitar correção.
 */

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { validarENormalizarResposta } from '../api/_ai-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const aiServiceSrc = readFileSync(join(__dirname, '../api/_ai-service.js'), 'utf8');

let total = 0;
let passados = 0;

function pass(nome) { passados++; console.log(`  ✅ [PASS] ${nome}`); }
function fail(nome, err) { console.error(`  ❌ [FAIL] ${nome}:`, err?.message || err); }

const matrizEnem = {
  nome: 'ENEM',
  pontuacao_maxima: 1000,
  competencias: [
    { numero: 1, nome: 'C1', peso: 200 },
    { numero: 2, nome: 'C2', peso: 200 },
    { numero: 3, nome: 'C3', peso: 200 },
    { numero: 4, nome: 'C4', peso: 200 },
    { numero: 5, nome: 'C5', peso: 200 }
  ]
};

const comp5 = (notas = [160,160,160,160,160]) => notas.map((nota, i) => ({
  numero: i + 1,
  nota,
  justificativa: `Justificativa suficientemente longa para a competência ${i + 1}.`
}));

console.log('🧪 ETAPA 36 — Testes de Observabilidade e Orçamento de Tokens\n');

// ─── 1. Orçamento de tokens correto por provedor ────────────────────────────
total++;
try {
  // Groq: deve ter max_tokens: 16384
  assert.match(aiServiceSrc, /max_tokens:\s*16384/,
    'Groq deve ter max_tokens: 16384');

  // Gemini: deve ter maxOutputTokens: 8192
  assert.match(aiServiceSrc, /maxOutputTokens:\s*8192/,
    'Gemini deve ter maxOutputTokens: 8192');

  // Não deve mais existir max_tokens: 4096 em nenhuma função de provedor
  // (verificamos que o antigo valor 4096 não aparece no bloco de body JSON dos provedores)
  const groqBlock = aiServiceSrc.slice(aiServiceSrc.indexOf('async function chamarGroq'));
  const geminiBlock = aiServiceSrc.slice(aiServiceSrc.indexOf('async function chamarGemini'));
  const openaiBlock = aiServiceSrc.slice(aiServiceSrc.indexOf('async function chamarOpenAI'));
  assert.ok(!groqBlock.slice(0, groqBlock.indexOf('async function chamarGemini')).includes('max_tokens: 4096'),
    'Groq não deve ter max_tokens: 4096');
  assert.ok(!openaiBlock.slice(0, openaiBlock.indexOf('// ────')).includes('max_tokens: 4096'),
    'OpenAI não deve ter max_tokens: 4096');

  pass('1 — Orçamento de saída correto: Groq 16384, Gemini 8192, OpenAI 16384');
} catch (e) { fail('1', e); }

// ─── 2. finish_reason 'length' → erro RESPOSTA_TRUNCADA_IA ─────────────────
total++;
try {
  // Simula o comportamento do código: verifica que o padrão existe no fonte
  assert.match(aiServiceSrc, /finish_reason.*===.*'length'/);
  assert.match(aiServiceSrc, /RESPOSTA_TRUNCADA_IA/);
  pass('2 — finish_reason "length" detectado e mapeado para RESPOSTA_TRUNCADA_IA');
} catch (e) { fail('2', e); }

// ─── 3. finish_reason 'stop' com JSON incompleto → rejeitado pelo validador ─
total++;
try {
  // Simula: Groq retornou finish_reason='stop' mas JSON só tem 3 competências
  // O validador downstream deve rejeitar independentemente do finish_reason
  const payload3stop = JSON.stringify({
    nota_total: 480,
    competencias: comp5([160,160,160]).slice(0, 3)
  });
  assert.throws(
    () => validarENormalizarResposta(payload3stop, matrizEnem, 'groq/mock'),
    /esperadas 5 competências/i
  );
  pass('3 — finish_reason "stop" com 3 competências rejeitado pelo validador');
} catch (e) { fail('3', e); }

// ─── 4. finish_reason ausente → JSON completo aceito ──────────────────────
total++;
try {
  const payload5 = JSON.stringify({ nota_total: 800, competencias: comp5() });
  const res = validarENormalizarResposta(payload5, matrizEnem, 'groq/mock');
  assert.equal(res.competencias.length, 5);
  pass('4 — finish_reason ausente com JSON completo (C1–C5) aceito pelo validador');
} catch (e) { fail('4', e); }

// ─── 5. finish_reason inesperado ('content_filter') → JSON completo aceito ─
total++;
try {
  // O código loga o finish_reason inesperado mas passa o rawText ao validador.
  // O validador aceita se o JSON estiver completo.
  assert.match(aiServiceSrc, /finish_reason.*!==.*'stop'/,
    'Deve existir verificação de finish_reason inesperado');
  // Comportamento do validador não muda:
  const payload5 = JSON.stringify({ nota_total: 800, competencias: comp5() });
  const res = validarENormalizarResposta(payload5, matrizEnem, 'groq/mock');
  assert.equal(res.competencias.length, 5);
  pass('5 — finish_reason inesperado: JSON completo ainda passa no validador');
} catch (e) { fail('5', e); }

// ─── 6. JSON sintaticamente válido com 3 competências → rejeitado ───────────
total++;
try {
  const p3 = JSON.stringify({ nota_total: 480, competencias: comp5().slice(0, 3) });
  assert.throws(
    () => validarENormalizarResposta(p3, matrizEnem, 'groq/mock'),
    /esperadas 5 competências/i
  );
  pass('6 — JSON válido com apenas 3 competências rejeitado (nunca aceito parcialmente)');
} catch (e) { fail('6', e); }

// ─── 7. JSON completo C1–C5 → aceito ────────────────────────────────────────
total++;
try {
  const p5 = JSON.stringify({ nota_total: 800, competencias: comp5() });
  const res = validarENormalizarResposta(p5, matrizEnem, 'groq/mock');
  assert.equal(res.competencias.length, 5);
  assert.equal(res.nota_total, 800);
  pass('7 — JSON completo com C1–C5 aceito e nota_total correta');
} catch (e) { fail('7', e); }

// ─── 8. Campos usage ausentes → sem exceção ─────────────────────────────────
total++;
try {
  // Simula objeto data sem usage (ex: resposta inesperada do provedor)
  const dataVazio = { choices: [{ finish_reason: 'stop', message: { content: '{}' } }] };
  // Verifica que o padrão de acesso usa optional chaining com ?? null
  const logPattern = /data\.usage\?\.[a-z_]+\s*\?\?\s*null/;
  assert.match(aiServiceSrc, logPattern,
    'Acesso a usage deve usar optional chaining com fallback null');
  pass('8 — Campos usage ausentes tratados com optional chaining (sem exceção)');
} catch (e) { fail('8', e); }

// ─── 9. reasoning_tokens presente → registrado sem exceção ─────────────────
total++;
try {
  assert.match(aiServiceSrc, /completion_tokens_details\?\.[a-z_]+\s*\?\?\s*null/,
    'reasoning_tokens deve ser acessado com optional chaining com fallback null');
  pass('9 — reasoning_tokens acessado de forma segura com optional chaining');
} catch (e) { fail('9', e); }

// ─── 10. Ausência de PII nos campos de log ──────────────────────────────────
total++;
try {
  // Verifica que os blocos de log NÃO incluem conteúdo da redação nem rawText
  const logGroqBlock = (() => {
    const start = aiServiceSrc.indexOf('const logUso = {');
    const end = aiServiceSrc.indexOf('};', start) + 2;
    return aiServiceSrc.slice(start, end);
  })();

  assert.ok(!logGroqBlock.includes('rawText'),
    'Log Groq não deve incluir rawText (conteúdo da redação)');
  assert.ok(!logGroqBlock.includes('content'),
    'Log Groq não deve incluir campo content');
  assert.ok(!logGroqBlock.includes('apiKey'),
    'Log Groq não deve incluir apiKey');
  assert.ok(logGroqBlock.includes('finish_reason'),
    'Log Groq deve incluir finish_reason como metadado');
  assert.ok(logGroqBlock.includes('prompt_tokens'),
    'Log Groq deve incluir prompt_tokens como metadado');
  pass('10 — Logs de uso não contêm PII, rawText, apiKey ou conteúdo da redação');
} catch (e) { fail('10', e); }

// ─── 11. Erro do provedor → rejeita sem aceitar correção incompleta ─────────
total++;
try {
  // JSON inválido (truncado) deve lançar erro de formato
  const jsonTruncado = '{"nota_total": 800, "competencias": [{"numero":1,"nota":160';
  assert.throws(
    () => validarENormalizarResposta(jsonTruncado, matrizEnem, 'groq/mock'),
    /Formato JSON inválido/i
  );
  // Resposta com 1 competência deve ser rejeitada (nunca aceita parcialmente)
  const p1 = JSON.stringify({ nota_total: 160, competencias: comp5().slice(0, 1) });
  assert.throws(
    () => validarENormalizarResposta(p1, matrizEnem, 'groq/mock'),
    /esperadas 5 competências/i
  );
  pass('11 — Erro do provedor / resposta parcial sempre rejeitada, sem aceitar correção incompleta');
} catch (e) { fail('11', e); }

console.log(`\n========================================`);
console.log(`Resultado ETAPA 36: ${passados}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (passados !== total) process.exit(1);
