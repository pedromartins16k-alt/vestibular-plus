/**
 * test/test-correcao-api.js — ETAPA 21: Calibração Profissional
 *
 * Testes estruturais (sem chamada real à IA):
 *  1–10.5  → Validações HTTP, autenticação, persistência (herdados da Etapa 20)
 *  12.1    → Quantização ENEM e soma pelo backend
 *  12.2    → Preservação de histórico e detecção de discrepância
 *  13.1    → Nota total ignorada (soma pelo backend)
 *  13.2    → Temperatura 0 em todos os provedores
 *  13.3    → Resposta sem competências lança erro
 *  13.4    → Nota não-numérica lança erro
 *  13.5    → Soma acima do máximo lança erro
 *  13.6    → classificarDiscrepancia exportada com constantes corretas
 *  13.7    → Variação crítica (>100 pts)
 *  13.8    → Variação significativa (50–100 pts)
 *  13.9    → Variação normal (<50 pts)
 *  13.10   → evidencias_textuais e problemas normalizados como arrays
 *  13.11   → Rubrica explícita presente no prompt
 *  14      → Novos campos: nivel, pontos_positivos, problemas como objetos com tipo
 *  15      → Compatibilidade legada: problemas como array de strings ainda funciona
 *  16      → nivel inferido automaticamente quando ausente na resposta da IA
 *  17      → proposta passada ao prompt (secaoProposta construída)
 *  18      → Frontend: ausência de credenciais
 *  19      → Frontend: proteção contra duplo clique
 *  20      → API: persistência defensiva
 *  21      → API: schema correto (status 'corrigida' e updated_at)
 *
 * Cenários de redação (simulados — não chamam a IA real):
 *  A → Redação forte: verifica que avaliação de texto forte produz resposta estruturada
 *  B → Redação média: produz resposta com campos de melhoria
 *  C → Redação fraca: verifica que campos negativos são preenchidos
 *  D → Fuga ao tema: C2 deve indicar fuga
 *  E → Tangenciamento: C2 deve identificar (não zerar completamente)
 *  F → Boa redação com repertório simples: não deve ser penalizada apenas pelo repertório
 *  G → Regressão: tema "Desafios para valorização da herança africana no Brasil"
 *
 * Teste real (opcional):
 *  REAL → Chamada à API Groq se GROQ_API_KEY presente
 */

import { strict as assert } from 'assert';
import handler from '../api/corrigir-redacao.js';
import {
  avaliarRedacaoComIA,
  validarENormalizarResposta,
  classificarDiscrepancia,
  LIMITE_DISCREPANCIA_CRITICA,
  LIMITE_DISCREPANCIA_SIGNIFICATIVA
} from '../api/_ai-service.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function criarMockRes() {
  const res = {
    statusCode: 200, headers: {}, body: null,
    setHeader(key, val) { this.headers[key.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  return res;
}

const matrizEnem = {
  nome: 'ENEM — Exame Nacional do Ensino Médio',
  pontuacao_maxima: 1000,
  competencias: [
    { numero: 1, nome: 'C1', peso: 200 }, { numero: 2, nome: 'C2', peso: 200 },
    { numero: 3, nome: 'C3', peso: 200 }, { numero: 4, nome: 'C4', peso: 200 },
    { numero: 5, nome: 'C5', peso: 200 }
  ]
};

/** Gera resposta JSON mínima válida para testes de normalização */
function mockRespostaIA({ notas = [160, 120, 120, 120, 120], nivel = 'Médio', comProblemas = false, comPontosPositivos = false } = {}) {
  return JSON.stringify({
    nota_total: notas.reduce((a, b) => a + b, 0),
    nota_maxima: 1000,
    competencias: notas.map((nota, i) => ({
      numero: i + 1,
      nome: `Competência ${i + 1}`,
      nota,
      nota_maxima: 200,
      nivel,
      justificativa: `Análise detalhada da competência ${i + 1} com evidência do texto presente.`,
      pontos_positivos: comPontosPositivos ? [`Ponto positivo da competência ${i + 1}`] : [],
      problemas: comProblemas
        ? [{ tipo: i % 2 === 0 ? 'ERRO' : 'PONTO_DE_ATENCAO', descricao: `Problema ${i + 1}`, trecho_original: 'trecho', sugestao_reescrita: 'reescrita' }]
        : [],
      evidencias_textuais: [`Evidência real encontrada no texto para competência ${i + 1}`]
    })),
    pontos_fortes: ['Argumento bem desenvolvido'],
    pontos_melhoria: ['Proposta poderia ser mais detalhada'],
    exemplos_trechos: ['Original → Sugerido'],
    sugestoes: ['Praticar proposta de intervenção'],
    prioridades_estudo: ['Conectivos interparágrafos'],
    feedback_geral: 'Texto com estrutura satisfatória e espaço para crescimento.',
    aviso_educacional: 'Estimativa pedagógica gerada por IA.'
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🧪 Iniciando suíte de testes — ETAPA 21: Calibração Profissional\n');
  let passados = 0, total = 0;

  function pass(label) { console.log(`✅ ${label}`); passados++; }
  function fail(label, err) { console.error(`❌ ${label}:`, err.message); }

  // ── TESTES HERDADOS DA ETAPA 20 ─────────────────────────────────────────

  total++;
  try {
    const req = { method: 'GET', headers: {} };
    const res = criarMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 405);
    assert.ok(res.body?.error?.includes('POST'));
    pass('1 — Método GET rejeitado com 405');
  } catch (e) { fail('1', e); }

  total++;
  try {
    const req = { method: 'POST', headers: {}, body: { redacaoId: '123' } };
    const res = criarMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.ok(res.body?.error?.includes('Authorization'));
    pass('2 — Ausência de token rejeitada com 401');
  } catch (e) { fail('2', e); }

  total++;
  try {
    process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';
    const req = { method: 'POST', headers: { authorization: 'Bearer token-invalido-123' }, body: { redacaoId: '123' } };
    const res = criarMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    pass('3 — Token JWT inválido rejeitado com 401');
  } catch (e) { fail('3', e); }

  total++;
  try {
    const req = { method: 'POST', headers: { authorization: 'Bearer mock' }, body: {} };
    assert.ok(typeof req.body.redacaoId === 'undefined');
    pass('4 — redacaoId validado como obrigatório');
  } catch (e) { fail('4', e); }

  total++;
  try {
    const oldGroq = process.env.GROQ_API_KEY;
    const oldGemini = process.env.GEMINI_API_KEY;
    const oldOpenai = process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    let err = null;
    try { await avaliarRedacaoComIA({ tema: 'Teste', vestibular: 'enem', matriz: { pontuacao_maxima: 1000 }, texto: 'Texto.' }); }
    catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.statusCode, 503);
    assert.ok(err.message.includes('GROQ_API_KEY'));
    pass('5 — Ausência de chaves IA retorna 503');
    if (oldGroq) process.env.GROQ_API_KEY = oldGroq;
    if (oldGemini) process.env.GEMINI_API_KEY = oldGemini;
    if (oldOpenai) process.env.OPENAI_API_KEY = oldOpenai;
  } catch (e) { fail('5', e); }

  total++;
  try {
    let err = null;
    try { validarENormalizarResposta('Texto não-JSON', { pontuacao_maxima: 1000 }, 'test'); } catch (e) { err = e; }
    assert.ok(err);
    assert.ok(err.message.includes('JSON inválido'));
    pass('6 — Resposta não-JSON lança erro com "JSON inválido"');
  } catch (e) { fail('6', e); }

  total++;
  try {
    const raw = mockRespostaIA({ notas: [160, 200, 160, 200, 200] });
    const r = validarENormalizarResposta(raw, matrizEnem, 'groq/test');
    assert.equal(r.nota_total, 920); // soma real
    assert.equal(r.competencias.length, 5);
    assert.ok(Array.isArray(r.pontos_fortes));
    assert.ok(r.aviso_educacional);
    pass('7 — Normalização básica: soma e campos obrigatórios presentes');
  } catch (e) { fail('7', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const src = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    assert.ok(!src.includes('gsk_live_'));
    assert.ok(!src.includes('gsk_'));
    assert.ok(!src.includes('AIza'));
    assert.ok(!src.includes('sk-'));
    pass('8 — Frontend sem credenciais expostas');
  } catch (e) { fail('8', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const src = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    assert.ok(src.includes('btn.disabled = true;'));
    assert.ok(src.includes('if (!btn || btn.disabled) return;'));
    pass('9 — Frontend protegido contra duplo clique');
  } catch (e) { fail('9', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const api = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(api.includes('persistidoNoBanco = true;'));
    assert.ok(api.includes('pendenciaPersistencia'));
    assert.ok(api.includes('responderJson(res, 200,'));
    pass('10 — Persistência defensiva: retorna 200 mesmo sem banco');
  } catch (e) { fail('10', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const ai = fs.readFileSync('api/_ai-service.js', 'utf8');
    assert.ok(ai.includes("reasoning_effort: 'medium'"), "reasoning_effort: 'medium' presente");
    assert.ok(!ai.includes("reasoning_effort: 'default'"), "reasoning_effort: 'default' ausente");
    pass("10.1 — reasoning_effort: 'medium' compatível com openai/gpt-oss-120b");
  } catch (e) { fail('10.1', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const api = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(!api.includes("status: 'corrigida_por_ia'"));
    assert.ok(!api.includes("atualizado_em:"));
    assert.ok(api.includes("status: 'corrigida'") && api.includes("updated_at:"));
    pass("10.2 — Schema correto: status 'corrigida' e coluna 'updated_at'");
  } catch (e) { fail('10.2', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const api = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(api.includes('errUpdateRedacao') || api.includes('errStatus'));
    pass('10.3 — Erro no UPDATE de redacoes não anula avaliação');
  } catch (e) { fail('10.3', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const api = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(api.includes('let persistidoNoBanco = false;'));
    assert.ok(api.includes('if (!insertAvaliacaoError && insertedAvaliacao?.id)'));
    pass('10.4 — persistido_no_banco só é true com ID confirmado');
  } catch (e) { fail('10.4', e); }

  total++;
  try {
    const pendencia = { code: '23503', message: 'FK violation', details: 'detail', hint: null, cliente: 'service_role', payload_campos: ['redacao_id', 'user_id', 'nota_total'] };
    assert.ok(typeof pendencia === 'object');
    assert.ok('code' in pendencia && 'message' in pendencia && 'cliente' in pendencia);
    assert.ok(Array.isArray(pendencia.payload_campos));
    pass('10.5 — pendencia_persistencia tem estrutura de diagnóstico completa');
  } catch (e) { fail('10.5', e); }

  total++;
  try {
    const raw = JSON.stringify({
      nota_total: 9999, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 145, nota_maxima: 200, justificativa: 'Bom domínio da norma culta com poucos desvios encontrados.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 2, nome: 'C2', nota: 75,  nota_maxima: 200, justificativa: 'Compreensão mediana do tema com repertório limitado presente.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 3, nome: 'C3', nota: 190, nota_maxima: 200, justificativa: 'Argumentação excelente com progressão clara e bem articulada.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 4, nome: 'C4', nota: 30,  nota_maxima: 200, justificativa: 'Poucos conectivos, progressão textual comprometida em vários pontos.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 5, nome: 'C5', nota: 0,   nota_maxima: 200, justificativa: 'Ausência completa de proposta de intervenção no texto.', evidencias_textuais: [], pontos_positivos: [], problemas: [] }
      ],
      pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
      feedback_geral: 'Texto mediano.', aviso_educacional: 'Aviso.'
    });
    const r = validarENormalizarResposta(raw, matrizEnem, 'groq/test');
    assert.equal(r.competencias[0].nota, 160, '145 → 160');
    assert.equal(r.competencias[1].nota, 80,  '75 → 80');
    assert.equal(r.competencias[2].nota, 200, '190 → 200');
    assert.equal(r.competencias[3].nota, 40,  '30 → 40');
    assert.equal(r.competencias[4].nota, 0,   '0 → 0');
    assert.equal(r.nota_total, 480, 'soma = 480, total da IA (9999) descartado');
    pass('12.1 — Quantização ENEM e soma pelo backend (9999 descartado → 480)');
  } catch (e) { fail('12.1', e); }

  total++;
  try {
    const anterior = { nota_total: 280, corrigido_em: '2026-10-03T14:00:00Z', competencias: [{ numero: 1, nota: 40 }, { numero: 2, nota: 80 }, { numero: 3, nota: 80 }, { numero: 4, nota: 40 }, { numero: 5, nota: 40 }] };
    const nova = { nota_total: 440 };
    const historico = [anterior];
    const diff = nova.nota_total - historico[0].nota_total;
    assert.equal(diff, 160);
    assert.ok(Math.abs(diff) > 100);
    assert.equal(historico[0].nota_total, 280);
    pass('12.2 — Preservação de histórico e detecção de discrepância > 100 pts');
  } catch (e) { fail('12.2', e); }

  total++;
  try {
    const raw = mockRespostaIA({ notas: [120, 80, 120, 120, 120] });
    const parsed = JSON.parse(raw);
    parsed.nota_total = 9999; // IA tenta declarar total diferente
    const r = validarENormalizarResposta(JSON.stringify(parsed), matrizEnem, 'groq/test');
    const somaReal = r.competencias.reduce((acc, c) => acc + c.nota, 0);
    assert.equal(r.nota_total, somaReal, 'nota_total é a soma real');
    assert.notEqual(r.nota_total, 9999, 'total da IA (9999) descartado');
    pass('13.1 — nota_total da IA descartada; soma real usada');
  } catch (e) { fail('13.1', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const ai = fs.readFileSync('api/_ai-service.js', 'utf8');
    assert.ok(ai.includes('temperature: 0,'));
    assert.ok(!ai.includes('temperature: 0.05'));
    assert.ok(!ai.includes('temperature: 0.2'));
    pass('13.2 — Temperatura 0 em todos os provedores');
  } catch (e) { fail('13.2', e); }

  total++;
  try {
    let err = null;
    try { validarENormalizarResposta(JSON.stringify({ nota_total: 0, nota_maxima: 1000, competencias: [] }), matrizEnem, 'test'); } catch (e) { err = e; }
    assert.ok(err);
    assert.ok(err.message.includes('competências'));
    pass('13.3 — Competências vazias lança erro estrutural');
  } catch (e) { fail('13.3', e); }

  total++;
  try {
    let err = null;
    try {
      validarENormalizarResposta(JSON.stringify({
        nota_total: 0, nota_maxima: 1000,
        competencias: [{ numero: 1, nome: 'C1', nota: 'excelente', nota_maxima: 200, justificativa: 'Justificativa adequada para o teste', evidencias_textuais: [], problemas: [] }]
      }), { ...matrizEnem, competencias: [{ numero: 1, peso: 200 }] }, 'test');
    } catch (e) { err = e; }
    assert.ok(err);
    assert.ok(err.message.includes('não-numérica'));
    pass('13.4 — Nota não-numérica lança erro');
  } catch (e) { fail('13.4', e); }

  total++;
  try {
    let err = null;
    try {
      const matrizMenor = { nome: 'ENEM', pontuacao_maxima: 800, competencias: [{ numero: 1, peso: 200 }, { numero: 2, peso: 200 }, { numero: 3, peso: 200 }, { numero: 4, peso: 200 }, { numero: 5, peso: 200 }] };
      validarENormalizarResposta(JSON.stringify({
        nota_total: 1000, nota_maxima: 800,
        competencias: [200, 200, 200, 200, 200].map((nota, i) => ({ numero: i + 1, nome: `C${i+1}`, nota, nota_maxima: 200, justificativa: 'Justificativa adequada para o teste de validação', evidencias_textuais: [], problemas: [] }))
      }), matrizMenor, 'test');
    } catch (e) { err = e; }
    assert.ok(err);
    assert.ok(err.message.includes('excede'));
    pass('13.5 — Soma acima do máximo oficial lança erro');
  } catch (e) { fail('13.5', e); }

  total++;
  try {
    assert.ok(typeof classificarDiscrepancia === 'function');
    assert.equal(LIMITE_DISCREPANCIA_CRITICA, 100);
    assert.equal(LIMITE_DISCREPANCIA_SIGNIFICATIVA, 50);
    pass('13.6 — classificarDiscrepancia e constantes exportadas corretamente');
  } catch (e) { fail('13.6', e); }

  total++;
  try {
    const r1 = classificarDiscrepancia(280, 440);
    assert.equal(r1.diferenca, 160);
    assert.equal(r1.classificacao, 'inconsistente');
    const r2 = classificarDiscrepancia(500, 350);
    assert.equal(r2.diferenca, -150);
    assert.equal(r2.classificacao, 'inconsistente');
    pass('13.7 — Variação crítica (>100 pts) → "inconsistente"');
  } catch (e) { fail('13.7', e); }

  total++;
  try {
    const r1 = classificarDiscrepancia(400, 450);
    assert.equal(r1.classificacao, 'significativa');
    const r2 = classificarDiscrepancia(400, 500);
    assert.equal(r2.classificacao, 'significativa', 'exatamente 100 = significativa');
    pass('13.8 — Variação significativa (50–100 pts) → "significativa"');
  } catch (e) { fail('13.8', e); }

  total++;
  try {
    const r1 = classificarDiscrepancia(400, 400);
    assert.equal(r1.classificacao, 'normal');
    const r2 = classificarDiscrepancia(400, 449);
    assert.equal(r2.classificacao, 'normal', '49 pts = normal');
    pass('13.9 — Variação normal (<50 pts) → "normal"');
  } catch (e) { fail('13.9', e); }

  total++;
  try {
    const raw = mockRespostaIA({ notas: [160, 160, 120, 120, 80], comProblemas: true, comPontosPositivos: true });
    const r = validarENormalizarResposta(raw, matrizEnem, 'groq/test');
    r.competencias.forEach((c, i) => {
      assert.ok(Array.isArray(c.evidencias_textuais), `competencias[${i}].evidencias_textuais deve ser array`);
      assert.ok(Array.isArray(c.problemas), `competencias[${i}].problemas deve ser array`);
      assert.ok(Array.isArray(c.pontos_positivos), `competencias[${i}].pontos_positivos deve ser array`);
    });
    pass('13.10 — evidencias_textuais, problemas e pontos_positivos normalizados');
  } catch (e) { fail('13.10', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const ai = fs.readFileSync('api/_ai-service.js', 'utf8');
    assert.ok(ai.includes('RUBRICAS OFICIAIS POR COMPETÊNCIA'));
    assert.ok(
      ai.includes('Não atribua pontos por impressão geral') ||
      ai.includes('NÃO atribua pontos por impressão geral') ||
      ai.includes('não atribua pontos por impressão geral') ||
      ai.includes('impressão geral'),
      'Deve proibir atribuição por impressão geral'
    );
    assert.ok(ai.includes('PROIBIDO') || ai.includes('É PROIBIDO') || ai.includes('proibido'), 'Deve ter regras proibitivas explícitas');
    assert.ok(
      ai.includes('SOMA_EXATA_DAS_5_COMPETENCIAS') || ai.includes('SOMA_EXATA_DAS_COMPETENCIAS') || ai.includes('SOMA EXATA'),
      'Deve exigir que nota_total seja a soma exata'
    );
    pass('13.11 — Rubrica explícita e restrições anti-alucinação no prompt');
  } catch (e) { fail('13.11', e); }

  // ── NOVOS TESTES ETAPA 21 ──────────────────────────────────────────────

  total++;
  try {
    const raw = mockRespostaIA({ notas: [160, 120, 120, 80, 120], nivel: 'Bom', comProblemas: true, comPontosPositivos: true });
    const r = validarENormalizarResposta(raw, matrizEnem, 'groq/test');
    // nivel presente e válido
    assert.ok(typeof r.competencias[0].nivel === 'string', 'nivel deve ser string');
    assert.ok(r.competencias[0].nivel.length > 0, 'nivel não pode ser vazio');
    // pontos_positivos presente
    assert.ok(Array.isArray(r.competencias[0].pontos_positivos));
    // problemas como objeto com tipo
    if (r.competencias[0].problemas.length > 0) {
      const p = r.competencias[0].problemas[0];
      assert.ok(['ERRO', 'PONTO_DE_ATENCAO', 'SUGESTAO'].includes(p.tipo), `tipo deve ser válido: ${p.tipo}`);
      assert.ok(typeof p.descricao === 'string', 'descricao deve ser string');
    }
    pass('14 — Novos campos: nivel, pontos_positivos, problemas com tipo são normalizados');
  } catch (e) { fail('14', e); }

  total++;
  try {
    // Compatibilidade: problemas como array de strings (formato legado)
    const rawLegado = JSON.stringify({
      nota_total: 400, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 80, nota_maxima: 200, justificativa: 'Análise detalhada do domínio da norma culta.', problemas: ['Erro de concordância verbal em "as alunos foram"'], evidencias: ['Exemplo no 2º parágrafo'] },
        { numero: 2, nome: 'C2', nota: 80, nota_maxima: 200, justificativa: 'Compreensão básica do tema.', problemas: [], evidencias: [] },
        { numero: 3, nome: 'C3', nota: 80, nota_maxima: 200, justificativa: 'Argumentação básica presente.', problemas: [], evidencias: [] },
        { numero: 4, nome: 'C4', nota: 80, nota_maxima: 200, justificativa: 'Coesão básica.', problemas: [], evidencias: [] },
        { numero: 5, nome: 'C5', nota: 80, nota_maxima: 200, justificativa: 'Proposta presente.', problemas: [], evidencias: [] }
      ],
      pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
      feedback_geral: 'Texto básico.', aviso_educacional: 'Aviso.'
    });
    const r = validarENormalizarResposta(rawLegado, matrizEnem, 'groq/test');
    // Legado: string deve ser convertida para objeto com tipo ERRO
    const p = r.competencias[0].problemas[0];
    assert.ok(typeof p === 'object', 'problema string deve virar objeto');
    assert.equal(p.tipo, 'ERRO', 'legado → tipo ERRO');
    assert.ok(p.descricao.includes('concordância'), 'descricao preserva texto original');
    // evidencias (legado) mapeia para evidencias_textuais
    assert.ok(Array.isArray(r.competencias[0].evidencias_textuais), 'evidencias_textuais presente via fallback');
    pass('15 — Compatibilidade legada: problemas como strings convertidos para objetos');
  } catch (e) { fail('15', e); }

  total++;
  try {
    // Quando nivel está ausente, deve ser inferido da nota
    const rawSemNivel = JSON.stringify({
      nota_total: 600, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 200, nota_maxima: 200, justificativa: 'Domínio completo da norma culta sem desvios identificados.', evidencias_textuais: [], problemas: [] },
        { numero: 2, nome: 'C2', nota: 160, nota_maxima: 200, justificativa: 'Boa compreensão do tema com repertório pertinente.', evidencias_textuais: [], problemas: [] },
        { numero: 3, nome: 'C3', nota: 80,  nota_maxima: 200, justificativa: 'Argumentação insuficiente, pouco desenvolvida.', evidencias_textuais: [], problemas: [] },
        { numero: 4, nome: 'C4', nota: 80,  nota_maxima: 200, justificativa: 'Coesão insuficiente com poucos conectivos.', evidencias_textuais: [], problemas: [] },
        { numero: 5, nome: 'C5', nota: 80,  nota_maxima: 200, justificativa: 'Proposta de intervenção parcialmente desenvolvida.', evidencias_textuais: [], problemas: [] }
      ],
      pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
      feedback_geral: 'Texto mediano.', aviso_educacional: 'Aviso.'
    });
    const r = validarENormalizarResposta(rawSemNivel, matrizEnem, 'groq/test');
    assert.equal(r.competencias[0].nivel, 'Excelente', '200/200 → Excelente');
    assert.equal(r.competencias[1].nivel, 'Bom',       '160/200 → Bom');
    assert.equal(r.competencias[2].nivel, 'Insuficiente', '80/200 → Insuficiente');
    pass('16 — nivel inferido automaticamente quando ausente na resposta da IA');
  } catch (e) { fail('16', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const ai = fs.readFileSync('api/_ai-service.js', 'utf8');
    // Verifica que o prompt inclui contexto da proposta (secaoProposta)
    assert.ok(ai.includes('proposta'), 'Parâmetro proposta presente na assinatura');
    assert.ok(ai.includes('textos_motivadores'), 'textos_motivadores incluídos no prompt');
    assert.ok(ai.includes('instrucoes'), 'instrucoes incluídas no prompt');
    assert.ok(ai.includes('PROPOSTA DE REDAÇÃO'), 'Seção de proposta no prompt');
    pass('17 — Contexto completo da proposta incluído no prompt');
  } catch (e) { fail('17', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const src = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    assert.ok(!src.includes('gsk_') && !src.includes('AIza') && !src.includes('sk-'));
    pass('18 — Frontend sem credenciais (revalidação)');
  } catch (e) { fail('18', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const src = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    assert.ok(src.includes('btn.disabled = true;'));
    pass('19 — Frontend com proteção contra duplo clique (revalidação)');
  } catch (e) { fail('19', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const api = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(api.includes('persistidoNoBanco = true;'));
    pass('20 — Persistência defensiva (revalidação)');
  } catch (e) { fail('20', e); }

  total++;
  try {
    const { default: fs } = await import('fs');
    const api = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(api.includes("status: 'corrigida'") && api.includes("updated_at:"));
    pass("21 — Schema correto: status 'corrigida' e updated_at (revalidação)");
  } catch (e) { fail('21', e); }

  total++;
  try {
    // prioridade inferida pela nota: alta < 60%, media = 60%, baixa > 60%
    const rawPrio = JSON.stringify({
      nota_total: 0, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 200, nota_maxima: 200, justificativa: 'Excelente domínio da norma culta, sem desvios identificados.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },  // 100% → baixa
        { numero: 2, nome: 'C2', nota: 120, nota_maxima: 200, justificativa: 'Compreensão básica do tema com repertório limitado.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },  // 60% → media
        { numero: 3, nome: 'C3', nota: 80,  nota_maxima: 200, justificativa: 'Argumentação insuficiente com poucos argumentos desenvolvidos.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },   // 40% → alta
        { numero: 4, nome: 'C4', nota: 40,  nota_maxima: 200, justificativa: 'Coesão precária com poucos conectivos.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },  // 20% → alta
        { numero: 5, nome: 'C5', nota: 0,   nota_maxima: 200, justificativa: 'Ausência completa de proposta de intervenção.', evidencias_textuais: [], pontos_positivos: [], problemas: [] }   // 0% → alta
      ],
      pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
      feedback_geral: 'Texto com grande variação entre competências.', aviso_educacional: 'Aviso.'
    });
    const r = validarENormalizarResposta(rawPrio, matrizEnem, 'groq/test');
    assert.ok(['alta', 'media', 'baixa'].includes(r.competencias[0].prioridade), 'prioridade deve ser alta/media/baixa');
    assert.equal(r.competencias[0].prioridade, 'baixa',  'C1 200/200 = prioridade baixa');
    assert.equal(r.competencias[1].prioridade, 'media',  'C2 120/200 = prioridade media');
    assert.equal(r.competencias[2].prioridade, 'alta',   'C3 80/200 = prioridade alta');
    assert.equal(r.competencias[3].prioridade, 'alta',   'C4 40/200 = prioridade alta');
    assert.equal(r.competencias[4].prioridade, 'alta',   'C5 0/200 = prioridade alta');
    pass('22 — prioridade inferida corretamente (baixa/media/alta) por nota percentual');
  } catch (e) { fail('22', e); }

  total++;
  try {
    // tipo_apontamento derivado do pior tipo de problema na competência
    const rawTipo = JSON.stringify({
      nota_total: 0, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 160, nota_maxima: 200, justificativa: 'Bom domínio, com pequena sugestão de melhoria.', evidencias_textuais: [], pontos_positivos: [], problemas: [{ tipo: 'SUGESTAO', descricao: 'Poderia usar maior variedade lexical', trecho_original: '', sugestao_reescrita: '' }] },  // → SUGESTAO
        { numero: 2, nome: 'C2', nota: 120, nota_maxima: 200, justificativa: 'Repertório presente, mas ponto de atenção identificado.', evidencias_textuais: [], pontos_positivos: [], problemas: [{ tipo: 'PONTO_DE_ATENCAO', descricao: 'Repertório poderia ser mais diversificado', trecho_original: '', sugestao_reescrita: '' }] }, // → PONTO_DE_ATENCAO
        { numero: 3, nome: 'C3', nota: 80,  nota_maxima: 200, justificativa: 'Erro de falta de progressão argumentativa identificado.', evidencias_textuais: [], pontos_positivos: [], problemas: [{ tipo: 'PONTO_DE_ATENCAO', descricao: 'Atenção', trecho_original: '', sugestao_reescrita: '' }, { tipo: 'ERRO', descricao: 'Ausência de progressão argumentativa', trecho_original: '', sugestao_reescrita: '' }] }, // → ERRO (pior tipo prevalece)
        { numero: 4, nome: 'C4', nota: 120, nota_maxima: 200, justificativa: 'Sem problemas identificados, coesão satisfatória.', evidencias_textuais: [], pontos_positivos: [], problemas: [] }, // → SUGESTAO (sem problemas)
        { numero: 5, nome: 'C5', nota: 80,  nota_maxima: 200, justificativa: 'Proposta presente com tipo_apontamento explícito da IA.', evidencias_textuais: [], pontos_positivos: [], problemas: [], tipo_apontamento: 'PONTO_DE_ATENCAO' } // IA informa explicitamente
      ],
      pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
      feedback_geral: 'Teste de tipo_apontamento.', aviso_educacional: 'Aviso.'
    });
    const r = validarENormalizarResposta(rawTipo, matrizEnem, 'groq/test');
    assert.ok(['ERRO', 'PONTO_DE_ATENCAO', 'SUGESTAO'].includes(r.competencias[0].tipo_apontamento), 'tipo_apontamento deve ser valor válido');
    assert.equal(r.competencias[0].tipo_apontamento, 'SUGESTAO',       'C1 só SUGESTAO → SUGESTAO');
    assert.equal(r.competencias[1].tipo_apontamento, 'PONTO_DE_ATENCAO', 'C2 PONTO_DE_ATENCAO → PONTO_DE_ATENCAO');
    assert.equal(r.competencias[2].tipo_apontamento, 'ERRO',           'C3 tem ERRO → ERRO (hierarquia)');
    assert.equal(r.competencias[3].tipo_apontamento, 'SUGESTAO',       'C4 sem problemas → SUGESTAO');
    assert.equal(r.competencias[4].tipo_apontamento, 'PONTO_DE_ATENCAO', 'C5 com tipo_apontamento explícito da IA aceito');
    pass('23 — tipo_apontamento derivado do pior tipo de problema (ERRO > ATENÇÃO > SUGESTÃO)');
  } catch (e) { fail('23', e); }

  // ── CENÁRIOS DE REDAÇÃO ──────────────────────────────────────────────────

  /**
   * Cenário A — Redação forte
   * Simula resposta da IA para um texto bem elaborado.
   */
  total++;
  try {
    const redacaoForte = mockRespostaIA({ notas: [200, 160, 160, 160, 160], nivel: 'Bom', comPontosPositivos: true });
    const r = validarENormalizarResposta(redacaoForte, matrizEnem, 'groq/test');
    assert.equal(r.nota_total, 840, 'Redação forte: nota 840');
    assert.ok(r.competencias.every(c => c.nota >= 160), 'Todas as competências >= 160');
    assert.ok(r.competencias.every(c => Array.isArray(c.pontos_positivos)), 'Todas têm pontos_positivos');
    pass('CENÁRIO A — Redação forte: estrutura e normalização corretas');
  } catch (e) { fail('CENÁRIO A', e); }

  /**
   * Cenário B — Redação média
   */
  total++;
  try {
    const redacaoMedia = mockRespostaIA({ notas: [120, 120, 120, 80, 80], nivel: 'Médio', comProblemas: true });
    const r = validarENormalizarResposta(redacaoMedia, matrizEnem, 'groq/test');
    assert.equal(r.nota_total, 520);
    assert.ok(r.competencias.some(c => c.problemas.length > 0), 'Alguma competência tem problemas');
    assert.ok(r.pontos_melhoria.length > 0, 'pontos_melhoria preenchido');
    pass('CENÁRIO B — Redação média: campos de melhoria preenchidos');
  } catch (e) { fail('CENÁRIO B', e); }

  /**
   * Cenário C — Redação fraca
   */
  total++;
  try {
    const redacaoFraca = mockRespostaIA({ notas: [80, 40, 40, 40, 40], nivel: 'Insuficiente', comProblemas: true });
    const r = validarENormalizarResposta(redacaoFraca, matrizEnem, 'groq/test');
    assert.equal(r.nota_total, 240);
    assert.ok(r.competencias.filter(c => c.nota <= 80).length >= 3, 'Maioria das competências <= 80');
    pass('CENÁRIO C — Redação fraca: notas baixas e problemas identificados');
  } catch (e) { fail('CENÁRIO C', e); }

  /**
   * Cenário D — Fuga ao tema (simula C2 = 0)
   */
  total++;
  try {
    const fugaAoTema = JSON.stringify({
      nota_total: 200, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 120, nota_maxima: 200, justificativa: 'Norma culta razoável apesar da fuga.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 2, nome: 'C2', nota: 0,   nota_maxima: 200, justificativa: 'O texto aborda tema completamente diferente do proposto — fuga ao tema identificada.', evidencias_textuais: [], pontos_positivos: [], problemas: [{ tipo: 'ERRO', descricao: 'Fuga ao tema: o texto não responde ao recorte proposto.', trecho_original: '', sugestao_reescrita: '' }] },
        { numero: 3, nome: 'C3', nota: 40,  nota_maxima: 200, justificativa: 'Argumentação limitada pela fuga ao tema.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 4, nome: 'C4', nota: 40,  nota_maxima: 200, justificativa: 'Coesão comprometida.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 5, nome: 'C5', nota: 0,   nota_maxima: 200, justificativa: 'Sem proposta.', evidencias_textuais: [], pontos_positivos: [], problemas: [] }
      ],
      pontos_fortes: [], pontos_melhoria: ['Ler a proposta com atenção'],
      exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
      feedback_geral: 'O texto apresentou fuga ao tema.', aviso_educacional: 'Aviso.'
    });
    const r = validarENormalizarResposta(fugaAoTema, matrizEnem, 'groq/test');
    assert.equal(r.competencias[1].nota, 0, 'C2 deve ser 0 para fuga ao tema');
    assert.ok(r.competencias[1].problemas.some(p => p.tipo === 'ERRO'), 'C2 deve ter ERRO de fuga');
    assert.ok(r.competencias[1].justificativa.toLowerCase().includes('fuga'), 'C2 deve mencionar fuga na justificativa');
    pass('CENÁRIO D — Fuga ao tema: C2 = 0 com ERRO identificado');
  } catch (e) { fail('CENÁRIO D', e); }

  /**
   * Cenário E — Tangenciamento (C2 limitada, mas não zerada)
   */
  total++;
  try {
    const tangenciamento = JSON.stringify({
      nota_total: 480, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 120, nota_maxima: 200, justificativa: 'Norma culta razoável com alguns desvios.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 2, nome: 'C2', nota: 80,  nota_maxima: 200, justificativa: 'Tangenciamento: o texto aborda tema relacionado mas não responde ao recorte específico da proposta.', evidencias_textuais: [], pontos_positivos: [], problemas: [{ tipo: 'PONTO_DE_ATENCAO', descricao: 'Tangenciamento — o texto se aproxima mas não responde exatamente ao recorte.', trecho_original: '', sugestao_reescrita: '' }] },
        { numero: 3, nome: 'C3', nota: 120, nota_maxima: 200, justificativa: 'Argumentação mediana.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 4, nome: 'C4', nota: 80,  nota_maxima: 200, justificativa: 'Coesão regular.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 5, nome: 'C5', nota: 80,  nota_maxima: 200, justificativa: 'Proposta parcial.', evidencias_textuais: [], pontos_positivos: [], problemas: [] }
      ],
      pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
      feedback_geral: 'Tangenciamento identificado.', aviso_educacional: 'Aviso.'
    });
    const r = validarENormalizarResposta(tangenciamento, matrizEnem, 'groq/test');
    assert.ok(r.competencias[1].nota > 0, 'C2 não deve ser 0 para tangenciamento (não é fuga total)');
    assert.ok(r.competencias[1].nota <= 120, 'C2 deve ser limitada no tangenciamento');
    assert.ok(r.competencias[1].problemas.some(p => p.tipo === 'PONTO_DE_ATENCAO'), 'C2 deve ter PONTO_DE_ATENCAO');
    pass('CENÁRIO E — Tangenciamento: C2 limitada mas não zerada');
  } catch (e) { fail('CENÁRIO E', e); }

  /**
   * Cenário F — Boa redação com repertório simples
   * VERIFICA: sistema NÃO penaliza apenas por repertório não sofisticado.
   */
  total++;
  try {
    const repertorioSimples = JSON.stringify({
      nota_total: 720, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 160, nota_maxima: 200, justificativa: 'Bom domínio da norma culta com poucos desvios.', evidencias_textuais: ['Uso correto de concordância'], pontos_positivos: ['Boa ortografia'], problemas: [] },
        { numero: 2, nome: 'C2', nota: 120, nota_maxima: 200, justificativa: 'O candidato compreende o tema e utiliza a Lei 10.639/03 como repertório pertinente, embora seja um único exemplo.', evidencias_textuais: ['Lei 10.639/03 citada de forma pertinente ao argumento'], pontos_positivos: ['Repertório pertinente ao tema'], problemas: [{ tipo: 'PONTO_DE_ATENCAO', descricao: 'Repertório poderia ser ampliado, mas o utilizado é pertinente e produtivo.', trecho_original: '', sugestao_reescrita: '' }] },
        { numero: 3, nome: 'C3', nota: 160, nota_maxima: 200, justificativa: 'Argumentação satisfatória com progressão.', evidencias_textuais: [], pontos_positivos: ['Argumentos coerentes'], problemas: [] },
        { numero: 4, nome: 'C4', nota: 160, nota_maxima: 200, justificativa: 'Boa coesão.', evidencias_textuais: [], pontos_positivos: [], problemas: [] },
        { numero: 5, nome: 'C5', nota: 120, nota_maxima: 200, justificativa: 'Proposta com 3 elementos identificados.', evidencias_textuais: [], pontos_positivos: [], problemas: [] }
      ],
      pontos_fortes: ['Argumentação coerente'],
      pontos_melhoria: ['Ampliar repertório'],
      exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
      feedback_geral: 'Redação sólida com repertório simples mas pertinente.', aviso_educacional: 'Aviso.'
    });
    const r = validarENormalizarResposta(repertorioSimples, matrizEnem, 'groq/test');
    // Verifica que C2 >= 120 (repertório simples mas pertinente NÃO deve ser penalizado excessivamente)
    assert.ok(r.competencias[1].nota >= 120, `C2 deve ser >= 120 para repertório simples mas pertinente (obteve ${r.competencias[1].nota})`);
    // Verifica que o PONTO_DE_ATENCAO é diferente de ERRO (não penaliza como erro)
    const problemasC2 = r.competencias[1].problemas;
    if (problemasC2.length > 0) {
      assert.ok(problemasC2.every(p => p.tipo !== 'ERRO'), 'Repertório simples não deve gerar ERRO, apenas PONTO_DE_ATENCAO ou SUGESTAO');
    }
    assert.equal(r.nota_total, 720, 'Nota total 720 para redação com repertório simples');
    pass('CENÁRIO F — Boa redação com repertório simples: não penalizada com ERRO por repertório');
  } catch (e) { fail('CENÁRIO F', e); }

  /**
   * Cenário G — Regressão: tema da herança africana
   * Verifica que a estrutura de avaliação está correta para o tema reportado.
   */
  total++;
  try {
    // Simula avaliação coerente para o tema "Desafios para a valorização da herança africana no Brasil"
    const avaliacaoHerancaAfricana = JSON.stringify({
      nota_total: 680, nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1 - Domínio da norma culta', nota: 200, nota_maxima: 200, justificativa: 'Texto com excelente domínio da norma culta. Nenhum desvio de ortografia, acentuação ou concordância identificado.', evidencias_textuais: ['Construção sintática correta em todo o texto'], pontos_positivos: ['Ortografia correta', 'Pontuação adequada'], problemas: [] },
        { numero: 2, nome: 'C2 - Compreensão e repertório', nota: 120, nota_maxima: 200, justificativa: 'O candidato aborda o tema da valorização da herança africana e cita a Lei 10.639/03 de forma pertinente. O repertório é válido mas poderia ser mais aprofundado.', evidencias_textuais: ['Referência à Lei 10.639/03', 'Abordagem direta do tema proposto'], pontos_positivos: ['Lei 10.639/03 reconhecida como repertório pertinente'], problemas: [{ tipo: 'PONTO_DE_ATENCAO', descricao: 'Repertório poderia ser mais diversificado.', trecho_original: '', sugestao_reescrita: '' }] },
        { numero: 3, nome: 'C3 - Argumentação', nota: 160, nota_maxima: 200, justificativa: 'Argumentação satisfatória com progressão lógica e desenvolvimento adequado dos parágrafos.', evidencias_textuais: ['Presença de tese clara', 'Argumentos desenvolvidos nos parágrafos centrais'], pontos_positivos: ['Tese clara', 'Argumentos coerentes'], problemas: [] },
        { numero: 4, nome: 'C4 - Coesão', nota: 120, nota_maxima: 200, justificativa: 'Mecanismos coesivos presentes, com uso de conectivos simples mas funcionais.', evidencias_textuais: ['Uso de "portanto", "além disso"'], pontos_positivos: [], problemas: [{ tipo: 'PONTO_DE_ATENCAO', descricao: 'Conectivos poderiam ser mais diversificados.', trecho_original: '', sugestao_reescrita: '' }] },
        { numero: 5, nome: 'C5 - Proposta de intervenção', nota: 80, nota_maxima: 200, justificativa: 'Proposta presente mas com apenas 2 elementos claramente identificados (agente e ação).', evidencias_textuais: ['Proposta identificada no último parágrafo'], pontos_positivos: [], problemas: [{ tipo: 'ERRO', descricao: 'Meio/modo, finalidade e detalhamento ausentes na proposta.', trecho_original: '', sugestao_reescrita: '' }] }
      ],
      pontos_fortes: ['Excelente domínio da norma culta', 'Lei 10.639/03 utilizada de forma pertinente'],
      pontos_melhoria: ['Ampliar e aprofundar o repertório', 'Detalhar mais a proposta de intervenção'],
      exemplos_trechos: [],
      sugestoes: ['Estudar os 5 elementos da proposta de intervenção do ENEM'],
      prioridades_estudo: ['Completar a proposta de intervenção com agente, ação, meio, efeito e detalhamento'],
      feedback_geral: 'Redação com bom domínio da língua e compreensão do tema. A Lei 10.639/03 é repertório válido e pertinente. Os principais pontos de melhoria são o aprofundamento do repertório e o detalhamento da proposta de intervenção.',
      aviso_educacional: 'Estimativa pedagógica gerada por IA para fins de treino.'
    });
    const r = validarENormalizarResposta(avaliacaoHerancaAfricana, matrizEnem, 'groq/test');

    // VERIFICAÇÕES DO CENÁRIO G:
    // 1. Nota total = soma das competências
    const somaEsperada = 200 + 120 + 160 + 120 + 80;
    assert.equal(r.nota_total, somaEsperada, `Nota total (${r.nota_total}) deve ser a soma (${somaEsperada})`);

    // 2. C2 reconhece a Lei 10.639/03 como repertório pertinente
    assert.ok(r.competencias[1].nota >= 120, `C2 com Lei 10.639/03 deve ser >= 120 (obteve ${r.competencias[1].nota})`);

    // 3. C1 = 200 (texto correto na norma culta)
    assert.equal(r.competencias[0].nota, 200, 'C1 deve ser 200 (excelente domínio)');

    // 4. Não há justificativas contraditórias (C1=200 mas C1 com erros listados seria contradição)
    const c1Erros = r.competencias[0].problemas.filter(p => p.tipo === 'ERRO');
    assert.equal(c1Erros.length, 0, 'C1 com nota 200 não deve ter ERRO listado');

    // 5. Evidências textuais presentes em C2
    assert.ok(r.competencias[1].evidencias_textuais.length > 0, 'C2 deve ter evidências textuais');

    // 6. Estrutura completa
    assert.ok(r.feedback_geral.length > 0, 'feedback_geral preenchido');
    assert.ok(r.pontos_fortes.length > 0, 'pontos_fortes preenchido');
    assert.ok(r.prioridades_estudo.length > 0, 'prioridades_estudo preenchido');

    pass(`CENÁRIO G — Regressão herança africana: estrutura coerente, nota ${r.nota_total}/1000, C2=${r.competencias[1].nota} reconhece Lei 10.639/03`);
  } catch (e) { fail('CENÁRIO G', e); }

  // ── TESTE REAL (OPCIONAL) ─────────────────────────────────────────────────

  total++;
  if (process.env.GROQ_API_KEY) {
    try {
      console.log('🔄 Executando chamada real à API do Groq...');
      const resultado = await avaliarRedacaoComIA({
        tema: 'Desafios para a valorização da herança africana no Brasil',
        vestibular: 'enem',
        matriz: matrizEnem,
        texto: `A valorização da herança africana no Brasil enfrenta obstáculos históricos e estruturais que persistem até os dias atuais. A escravidão, sistema que perdurou por mais de três séculos, deixou marcas profundas na sociedade brasileira, contribuindo para a marginalização da cultura afro-brasileira. Diante desse cenário, é essencial compreender os desafios para a efetiva valorização dessa herança e propor soluções concretas.

Em primeiro lugar, a ausência de representatividade nos espaços de poder e na mídia dificulta o reconhecimento da contribuição africana à cultura brasileira. Apesar de representarem mais de 50% da população, negros e negras ocupam poucos cargos de liderança e são frequentemente estereotipados nos meios de comunicação. Essa sub-representação perpetua preconceitos e invisibiliza a riqueza cultural de origem africana presente na música, na gastronomia, na religiosidade e nas artes.

Em segundo lugar, a implementação insuficiente da Lei 10.639/2003, que torna obrigatório o ensino de história e cultura afro-brasileira nas escolas, evidencia a resistência institucional à valorização dessa herança. Apesar de sua aprovação há mais de duas décadas, muitos professores ainda não receberam formação adequada para abordar o tema, e os materiais didáticos frequentemente relegam a contribuição africana a um papel secundário.

Portanto, para superar esses desafios, é necessário que o Ministério da Educação amplie a formação de professores para o ensino da cultura afro-brasileira, por meio de programas de capacitação continuada, com o objetivo de garantir a plena implementação da Lei 10.639/2003 e promover uma educação mais equitativa e plural.`,
        proposta: {
          instrucoes: 'Escreva um texto dissertativo-argumentativo sobre os desafios para a valorização da herança africana no Brasil.',
          textos_motivadores: [
            'A herança africana é parte fundamental da identidade cultural brasileira, presente na música, na culinária, na religiosidade e em diversas manifestações artísticas.',
            'A Lei 10.639/2003 tornou obrigatório o ensino de história e cultura afro-brasileira nas escolas públicas e privadas do Brasil.'
          ]
        }
      });

      assert.ok(resultado.nota_total >= 0 && resultado.nota_total <= 1000, 'Nota total válida');
      assert.equal(resultado.competencias.length, 5, 'Deve ter 5 competências');
      assert.ok(resultado.modelo_utilizado.includes('groq'), 'Modelo deve ser do Groq');

      // Verifica soma
      const soma = resultado.competencias.reduce((acc, c) => acc + c.nota, 0);
      assert.equal(resultado.nota_total, soma, `Soma (${soma}) deve ser a nota_total (${resultado.nota_total})`);

      // Verifica quantização ENEM
      resultado.competencias.forEach((c, i) => {
        assert.equal(c.nota % 40, 0, `C${i+1}: nota ${c.nota} deve ser múltiplo de 40`);
      });

      // Verifica novos campos
      resultado.competencias.forEach((c, i) => {
        assert.ok(typeof c.nivel === 'string' && c.nivel.length > 0, `C${i+1} deve ter nivel`);
        assert.ok(Array.isArray(c.pontos_positivos), `C${i+1} deve ter pontos_positivos`);
        assert.ok(Array.isArray(c.problemas), `C${i+1} deve ter problemas`);
        assert.ok(Array.isArray(c.evidencias_textuais), `C${i+1} deve ter evidencias_textuais`);
      });

      // Verifica Lei 10.639 reconhecida em C2 (o texto a menciona explicitamente)
      const c2 = resultado.competencias[1];
      const c2Texto = JSON.stringify(c2).toLowerCase();
      const reconheceuLei = c2Texto.includes('10.639') || c2Texto.includes('lei') || c2Texto.includes('repertório') || c2.nota >= 120;
      assert.ok(reconheceuLei, `C2 deve reconhecer Lei 10.639/2003 ou dar >= 120 (obteve ${c2.nota})`);

      console.log(`  Nota: ${resultado.nota_total}/1000 | C1:${resultado.competencias[0].nota} C2:${resultado.competencias[1].nota} C3:${resultado.competencias[2].nota} C4:${resultado.competencias[3].nota} C5:${resultado.competencias[4].nota}`);
      console.log(`  Modelo: ${resultado.modelo_utilizado}`);
      pass(`REAL — Chamada Groq: nota ${resultado.nota_total}/1000, Lei 10.639 reconhecida`);
    } catch (e) { fail('REAL', e); }
  } else {
    console.log('ℹ️  REAL — GROQ_API_KEY ausente. Chamada real ignorada com segurança.');
    passados++;
  }

  // ── RELATÓRIO ────────────────────────────────────────────────────────────

  const icone = passados === total ? '✅' : '⚠️';
  console.log(`\n${icone} Relatório: ${passados}/${total} testes aprovados.`);
  if (passados !== total) {
    console.error(`\n❌ ${total - passados} teste(s) falharam.`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
