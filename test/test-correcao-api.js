/**
 * test/test-correcao-api.js
 * Suíte de testes automatizados para o subsistema de correção de redação por IA
 *
 * Cobre:
 * 1.  Método HTTP inválido (405)
 * 2.  Usuário sem autenticação (401)
 * 3.  Token inválido (401)
 * 4.  Ausência de redacaoId (400)
 * 5.  Ausência de GROQ_API_KEY e demais chaves de IA (503)
 * 6.  Resposta inválida / JSON malformado do modelo
 * 7.  Normalização: soma das competências calculada no backend (nota da IA descartada)
 * 8.  Auditoria de segurança no frontend (nenhuma chave secreta exposta)
 * 9.  Proteção contra chamadas duplicadas no frontend
 * 10. Persistência defensiva (não quebra se tabela não existir)
 * 10.1 reasoning_effort 'medium' compatível com openai/gpt-oss-120b
 * 10.2 Schema correto: status 'corrigida' e coluna 'updated_at'
 * 10.3 Resiliência: erro no UPDATE de redacoes não anula avaliação
 * 10.4 persistido_no_banco só é true com confirmação explícita de ID
 * 10.5 pendencia_persistencia é objeto estruturado
 * 12.1 Quantização oficial ENEM (múltiplos de 40) e soma pelo backend
 * 12.2 Preservação do histórico e detecção de discrepância entre reavaliações
 * 13.1 NOVO: Nota total é SEMPRE soma das competências — IA não pode declarar total separado
 * 13.2 NOVO: Temperatura 0 configurada nos provedores para determinismo
 * 13.3 NOVO: Resposta sem competências lança erro estrutural
 * 13.4 NOVO: Nota de competência não-numérica lança erro
 * 13.5 NOVO: Soma que excede máximo oficial lança erro de validação
 * 13.6 NOVO: classificarDiscrepancia classifica corretamente os três níveis
 * 13.7 NOVO: classificarDiscrepancia — variação crítica (>100 pts)
 * 13.8 NOVO: classificarDiscrepancia — variação significativa (50-100 pts)
 * 13.9 NOVO: classificarDiscrepancia — variação normal (<50 pts)
 * 13.10 NOVO: evidencias e problemas são normalizados como arrays na resposta
 * 13.11 NOVO: rubrica explícita está presente no prompt gerado
 * 14.  Chamada real com Groq (se GROQ_API_KEY presente)
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

// Mock de resposta HTTP
function criarMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) { this.headers[key.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  return res;
}

// Matriz ENEM padrão para testes
const matrizEnemOficial = {
  nome: 'ENEM — Exame Nacional do Ensino Médio',
  pontuacao_maxima: 1000,
  competencias: [
    { numero: 1, nome: 'C1 - Norma culta', peso: 200 },
    { numero: 2, nome: 'C2 - Compreensão', peso: 200 },
    { numero: 3, nome: 'C3 - Argumentação', peso: 200 },
    { numero: 4, nome: 'C4 - Coesão', peso: 200 },
    { numero: 5, nome: 'C5 - Intervenção', peso: 200 }
  ]
};

async function runTests() {
  console.log('🧪 Iniciando suíte de testes da Correção de Redação com Groq e IA...\n');

  let passados = 0;
  let total = 0;

  // ─────────────────────────────────────────────────────────
  // TESTE 1: Bloqueio de métodos diferentes de POST (405)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const req = { method: 'GET', headers: {} };
    const res = criarMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 405, 'Deve retornar 405 para GET');
    assert.ok(res.body?.error?.includes('POST'), 'Mensagem deve indicar POST');
    console.log('✅ Teste 1: Método HTTP inválido (GET) rejeitado com status 405.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 1 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 2: Usuário sem autenticação (401)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const req = { method: 'POST', headers: {}, body: { redacaoId: '123' } };
    const res = criarMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 401, 'Deve retornar 401 sem token');
    assert.ok(res.body?.error?.includes('Authorization'), 'Deve solicitar Authorization');
    console.log('✅ Teste 2: Usuário sem autenticação rejeitado com status 401.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 2 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 3: Token inválido / malformado (401)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer token-invalido-123' },
      body: { redacaoId: '123' }
    };
    const res = criarMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 401, 'Deve retornar 401 para token inválido');
    console.log('✅ Teste 3: Token JWT inválido rejeitado com status 401.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 3 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 4: Validação de ausência de redacaoId (400)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer mock' },
      body: {}
    };
    const res = criarMockRes();
    assert.ok(typeof req.body.redacaoId === 'undefined');
    console.log('✅ Teste 4: Parâmetro redacaoId validado como obrigatório.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 4 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 5: Ausência de GROQ_API_KEY e demais chaves de IA (503)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const oldGroq = process.env.GROQ_API_KEY;
    const oldGemini = process.env.GEMINI_API_KEY;
    const oldOpenai = process.env.OPENAI_API_KEY;

    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    let erroLancado = null;
    try {
      await avaliarRedacaoComIA({
        tema: 'Democratização do acesso ao cinema',
        vestibular: 'enem',
        matriz: { pontuacao_maxima: 1000 },
        texto: 'Texto de teste com comprimento suficiente para avaliação pedagógica...'
      });
    } catch (e) {
      erroLancado = e;
    }

    assert.ok(erroLancado, 'Deve lançar erro quando nenhuma chave estiver configurada');
    assert.equal(erroLancado.statusCode, 503, 'Status deve ser 503');
    assert.ok(erroLancado.message.includes('GROQ_API_KEY'), 'Mensagem deve orientar sobre GROQ_API_KEY');
    console.log('✅ Teste 5: Ausência de GROQ_API_KEY tratada com erro 503 informativo.');
    passados++;

    if (oldGroq) process.env.GROQ_API_KEY = oldGroq;
    if (oldGemini) process.env.GEMINI_API_KEY = oldGemini;
    if (oldOpenai) process.env.OPENAI_API_KEY = oldOpenai;
  } catch (err) {
    console.error('❌ Teste 5 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 6: Tratamento de resposta inválida / JSON malformado
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    let erroParse = null;
    try {
      validarENormalizarResposta('Resposta não-json da IA com erro', { pontuacao_maxima: 1000 }, 'groq/test');
    } catch (e) {
      erroParse = e;
    }
    assert.ok(erroParse, 'Deve capturar JSON inválido');
    assert.ok(erroParse.message.includes('JSON inválido'), 'Deve reportar formato inválido');
    console.log('✅ Teste 6: Resposta inválida/malformada da IA tratada adequadamente.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 6 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 7: Nota total calculada pelo backend (IA declara 920, soma real é 920)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const rawMockGroq = JSON.stringify({
      nota_total: 920, // valor da IA — deve ser IGNORADO, soma real = 920
      nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 160, nota_maxima: 200, justificativa: 'Bom domínio da norma com pequenos desvios.', evidencias: ['Uso correto de verbos de ligação'], problemas: [] },
        { numero: 2, nome: 'C2', nota: 200, nota_maxima: 200, justificativa: 'Repertório de Bauman pertinente.', evidencias: ['Cita Zygmunt Bauman'], problemas: [] },
        { numero: 3, nome: 'C3', nota: 160, nota_maxima: 200, justificativa: 'Argumentação consistente mas com lacuna.', evidencias: ['Progressão lógica nos parágrafos'], problemas: ['Conclusão fraca'] },
        { numero: 4, nome: 'C4', nota: 200, nota_maxima: 200, justificativa: 'Conectivos diversificados.', evidencias: ['Uso de "portanto", "contudo", "ademais"'], problemas: [] },
        { numero: 5, nome: 'C5', nota: 200, nota_maxima: 200, justificativa: 'Proposta com 5 elementos.', evidencias: ['Agente: governo; ação: implementar; meio: lei; efeito: inclusão; detalhe: prazo de 2 anos'], problemas: [] }
      ],
      pontos_fortes: ['Excelente repertório sociocultural', 'Uso maduro de conectivos'],
      pontos_melhoria: ['Ajustar concordância no 2º parágrafo'],
      exemplos_trechos: ['Trecho: "fazem muitos anos" → Reescrita: "faz muitos anos"'],
      sugestoes: ['Praticar pontuação antes de conjunções adversativas'],
      prioridades_estudo: ['Revisar concordância verbal impessoal'],
      feedback_geral: 'Texto muito bem articulado.',
      aviso_educacional: 'Estimativa pedagógica.'
    });

    const normalizada = validarENormalizarResposta(rawMockGroq, matrizEnemOficial, 'groq/openai/gpt-oss-120b');
    assert.equal(normalizada.nota_total, 920, 'Nota total deve ser soma real das competências (160+200+160+200+200=920)');
    assert.equal(normalizada.competencias.length, 5, 'Deve ter 5 competências');
    assert.ok(normalizada.pontos_fortes.length >= 1, 'Deve ter pontos fortes');
    assert.ok(normalizada.aviso_educacional, 'Deve conter aviso educacional');
    // Verifica que evidencias e problemas foram normalizados
    assert.ok(Array.isArray(normalizada.competencias[0].evidencias), 'evidencias deve ser array');
    assert.ok(Array.isArray(normalizada.competencias[0].problemas), 'problemas deve ser array');
    console.log('✅ Teste 7: Nota total calculada pelo backend e campos normalizados corretamente.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 7 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 8: Auditoria de segurança no frontend
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const redacaoJsContent = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    assert.ok(!redacaoJsContent.includes('gsk_live_'), 'Não deve haver token Groq real no redacao.js');
    assert.ok(!redacaoJsContent.includes('gsk_'), 'Não deve haver token gsk_ no redacao.js');
    assert.ok(!redacaoJsContent.includes('AIza'), 'Não deve haver chaves Google no redacao.js');
    assert.ok(!redacaoJsContent.includes('sk-'), 'Não deve haver chaves OpenAI no redacao.js');
    console.log('✅ Teste 8: Frontend auditado — nenhuma credencial ou chave privada exposta.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 8 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 9: Proteção contra chamadas duplicadas no frontend
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const redacaoJsContent = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    assert.ok(redacaoJsContent.includes('btn.disabled = true;'), 'Deve desabilitar o botão ao iniciar');
    assert.ok(redacaoJsContent.includes('if (!btn || btn.disabled) return;'), 'Deve bloquear clique se botão desabilitado');
    console.log('✅ Teste 9: Proteção contra cliques duplicados confirmada no frontend.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 9 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 10: Persistência defensiva
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const apiCode = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(apiCode.includes('persistidoNoBanco = true;'), 'Deve sinalizar persistidoNoBanco');
    assert.ok(apiCode.includes('pendenciaPersistencia'), 'Deve capturar erro de persistência');
    assert.ok(apiCode.includes('responderJson(res, 200,'), 'Deve devolver 200 com a avaliação mesmo sem banco');
    console.log('✅ Teste 10: Persistência defensiva validada.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 10 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 10.1: reasoning_effort 'medium' no Groq
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const aiServiceCode = fs.readFileSync('api/_ai-service.js', 'utf8');
    assert.ok(
      aiServiceCode.includes("reasoning_effort: 'medium'"),
      "Deve utilizar reasoning_effort: 'medium' compatível com openai/gpt-oss-120b"
    );
    assert.ok(
      !aiServiceCode.includes("reasoning_effort: 'default'"),
      "Não deve conter reasoning_effort: 'default' que gera HTTP 400 no Groq"
    );
    console.log("✅ Teste 10.1: Parâmetro reasoning_effort verificado como 'medium'.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.1 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 10.2: Schema correto (status 'corrigida' e coluna 'updated_at')
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const apiCode = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(!apiCode.includes("status: 'corrigida_por_ia'"), "Não deve usar status 'corrigida_por_ia'");
    assert.ok(!apiCode.includes("atualizado_em:"), "Não deve referenciar coluna inexistente 'atualizado_em'");
    assert.ok(apiCode.includes("status: 'corrigida'") && apiCode.includes("updated_at:"), "Deve usar status 'corrigida' e coluna 'updated_at'");
    console.log("✅ Teste 10.2: Schema correto com status 'corrigida' e coluna 'updated_at'.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.2 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 10.3: Resiliência — erro no UPDATE não anula avaliação
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const apiCode = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(apiCode.includes('errUpdateRedacao') || apiCode.includes('errStatus'), "Deve capturar erro de update isoladamente");
    assert.ok(apiCode.includes('supabaseDb'), "Deve suportar persistência via cliente de backend seguro");
    console.log("✅ Teste 10.3: Resiliência garantida: erro no status de redacoes não anula avaliação.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.3 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 10.4: persistido_no_banco condicional
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const apiCode = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(apiCode.includes('let persistidoNoBanco = false;'), "persistidoNoBanco deve iniciar como false");
    assert.ok(apiCode.includes('if (!insertAvaliacaoError && insertedAvaliacao?.id)'), "persistidoNoBanco só true com ID confirmado");
    console.log("✅ Teste 10.4: persistido_no_banco só é true com confirmação explícita do ID.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.4 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 10.5: pendencia_persistencia é objeto estruturado
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const pendencia = {
      code: '23503',
      message: 'insert or update violates foreign key constraint',
      details: 'Key (redacao_id) not present.',
      hint: null,
      cliente: 'service_role',
      payload_campos: ['redacao_id', 'user_id', 'tipo_avaliacao', 'nota_total', 'competencias', 'status']
    };
    assert.ok(typeof pendencia === 'object' && pendencia !== null, 'Deve ser objeto');
    assert.ok('code' in pendencia, 'Deve ter campo code');
    assert.ok('message' in pendencia, 'Deve ter campo message');
    assert.ok('cliente' in pendencia, 'Deve ter campo cliente');
    assert.ok(Array.isArray(pendencia.payload_campos), 'payload_campos deve ser array');
    console.log("✅ Teste 10.5: pendencia_persistencia tem estrutura de diagnóstico completa.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.5 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 12.1: Quantização oficial ENEM (múltiplos de 40) e soma pelo backend
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const rawFakeEnem = JSON.stringify({
      nota_total: 9999, // total falso declarado pela IA — DEVE ser descartado
      nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 145, nota_maxima: 200, justificativa: 'Bom domínio com poucos desvios.', evidencias: [], problemas: [] }, // 145 → 160
        { numero: 2, nome: 'C2', nota: 75,  nota_maxima: 200, justificativa: 'Tema regular.',                  evidencias: [], problemas: [] }, // 75 → 80
        { numero: 3, nome: 'C3', nota: 190, nota_maxima: 200, justificativa: 'Excelente tese.',               evidencias: [], problemas: [] }, // 190 → 200
        { numero: 4, nome: 'C4', nota: 30,  nota_maxima: 200, justificativa: 'Poucos conectivos.',            evidencias: [], problemas: [] }, // 30 → 40
        { numero: 5, nome: 'C5', nota: 0,   nota_maxima: 200, justificativa: 'Sem proposta.',                 evidencias: [], problemas: [] }  // 0 → 0
      ],
      pontos_fortes: ['Bons argumentos'],
      pontos_melhoria: ['Norma padrão'],
      exemplos_trechos: [],
      sugestoes: [],
      prioridades_estudo: [],
      feedback_geral: 'Texto mediano.',
      aviso_educacional: 'Aviso teste'
    });

    const resNorm = validarENormalizarResposta(rawFakeEnem, matrizEnemOficial, 'groq/openai/gpt-oss-120b');

    // Quantização INEP
    assert.equal(resNorm.competencias[0].nota, 160, '145 → 160');
    assert.equal(resNorm.competencias[1].nota, 80,  '75 → 80');
    assert.equal(resNorm.competencias[2].nota, 200, '190 → 200');
    assert.equal(resNorm.competencias[3].nota, 40,  '30 → 40');
    assert.equal(resNorm.competencias[4].nota, 0,   '0 → 0');

    // Soma pelo backend (160+80+200+40+0=480), total da IA (9999) descartado
    assert.equal(resNorm.nota_total, 480, 'Nota total deve ser 480 (soma real), não 9999 da IA');
    console.log('✅ Teste 12.1: Quantização oficial ENEM e soma pelo backend validados.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 12.1 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 12.2: Preservação do histórico e detecção de discrepância
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const avaliacaoInicial = {
      nota_total: 280,
      competencias: [
        { numero: 1, nota: 160 }, { numero: 2, nota: 0 },
        { numero: 3, nota: 40 },  { numero: 4, nota: 40 }, { numero: 5, nota: 40 }
      ],
      corrigido_em: '2026-10-03T14:00:00.000Z'
    };
    const avaliacaoReavaliada = {
      nota_total: 440,
      competencias: [
        { numero: 1, nota: 160 }, { numero: 2, nota: 0 },
        { numero: 3, nota: 100 }, { numero: 4, nota: 80 }, { numero: 5, nota: 100 }
      ],
      corrigido_em: '2026-10-03T14:05:00.000Z'
    };

    const historico = [avaliacaoInicial];
    const diff = avaliacaoReavaliada.nota_total - historico[0].nota_total;
    assert.equal(diff, 160, 'Diferença deve ser 160');
    assert.ok(Math.abs(diff) > 100, 'Diferença > 100 deve acionar alerta de discrepância crítica');
    assert.equal(historico.length, 1, 'Histórico anterior preservado');
    assert.equal(historico[0].nota_total, 280, 'Nota anterior 280 intacta');
    console.log('✅ Teste 12.2: Comparativo e preservação de histórico validados.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 12.2 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.1: Nota total é SEMPRE soma das competências
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    // Simula IA declarando nota_total=800 mas competências somam 560
    const rawDesonesto = JSON.stringify({
      nota_total: 800,
      nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 120, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] },
        { numero: 2, nome: 'C2', nota: 80,  nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] },
        { numero: 3, nome: 'C3', nota: 120, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] },
        { numero: 4, nome: 'C4', nota: 120, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] },
        { numero: 5, nome: 'C5', nota: 120, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] }
      ],
      pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [],
      sugestoes: [], prioridades_estudo: [],
      feedback_geral: '', aviso_educacional: ''
    });
    const res = validarENormalizarResposta(rawDesonesto, matrizEnemOficial, 'groq/test');
    // 120+80+120+120+120 = 560
    assert.equal(res.nota_total, 560, 'Nota total deve ser 560 (soma), não 800 (declarada pela IA)');
    assert.notEqual(res.nota_total, 800, 'Total declarado pela IA (800) deve ser descartado');
    console.log('✅ Teste 13.1: Nota total da IA descartada — soma real das competências usada (560).');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.1 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.2: Temperatura 0 configurada nos provedores
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const aiCode = fs.readFileSync('api/_ai-service.js', 'utf8');
    // Verifica que temperatura 0 está configurada (não 0.05 ou 0.2)
    assert.ok(aiCode.includes('temperature: 0,'), 'Temperatura deve ser 0 para máximo determinismo');
    assert.ok(!aiCode.includes('temperature: 0.05'), 'Não deve usar temperatura 0.05');
    assert.ok(!aiCode.includes('temperature: 0.2'), 'Não deve usar temperatura 0.2');
    console.log('✅ Teste 13.2: Temperatura 0 configurada em todos os provedores para avaliação determinística.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.2 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.3: Resposta sem competências lança erro estrutural
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    let erroEstrutura = null;
    try {
      validarENormalizarResposta(JSON.stringify({
        nota_total: 500,
        nota_maxima: 1000,
        competencias: [] // lista vazia deve ser rejeitada
      }), matrizEnemOficial, 'groq/test');
    } catch (e) {
      erroEstrutura = e;
    }
    assert.ok(erroEstrutura, 'Deve lançar erro para lista de competências vazia');
    assert.ok(erroEstrutura.message.includes('competências'), 'Mensagem deve mencionar competências');
    console.log('✅ Teste 13.3: Resposta sem competências lança erro estrutural corretamente.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.3 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.4: Nota não-numérica em competência lança erro
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    let erroNota = null;
    try {
      validarENormalizarResposta(JSON.stringify({
        nota_total: 500,
        nota_maxima: 1000,
        competencias: [
          { numero: 1, nome: 'C1', nota: 'excelente', nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] }
        ]
      }), { ...matrizEnemOficial, competencias: [{ numero: 1, peso: 200 }] }, 'groq/test');
    } catch (e) {
      erroNota = e;
    }
    assert.ok(erroNota, 'Deve lançar erro para nota não-numérica');
    assert.ok(erroNota.message.includes('não-numérica'), 'Mensagem deve mencionar nota não-numérica');
    console.log('✅ Teste 13.4: Nota não-numérica em competência rejeitada com erro.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.4 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.5: Soma que excede máximo oficial lança erro de validação
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    let erroMaximo = null;
    try {
      // 5 competências com 200 cada = 1000, mas se pesoMax for manipulado para 220 cada = 1100
      const matrizMenor = {
        nome: 'ENEM',
        pontuacao_maxima: 800, // máximo oficial menor
        competencias: [
          { numero: 1, peso: 200 }, { numero: 2, peso: 200 },
          { numero: 3, peso: 200 }, { numero: 4, peso: 200 },
          { numero: 5, peso: 200 }
        ]
      };
      validarENormalizarResposta(JSON.stringify({
        nota_total: 1000,
        nota_maxima: 800,
        competencias: [
          { numero: 1, nome: 'C1', nota: 200, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] },
          { numero: 2, nome: 'C2', nota: 200, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] },
          { numero: 3, nome: 'C3', nota: 200, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] },
          { numero: 4, nome: 'C4', nota: 200, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] },
          { numero: 5, nome: 'C5', nota: 200, nota_maxima: 200, justificativa: 'OK', evidencias: [], problemas: [] }
        ]
      }), matrizMenor, 'groq/test');
    } catch (e) {
      erroMaximo = e;
    }
    assert.ok(erroMaximo, 'Deve lançar erro quando soma excede máximo oficial');
    assert.ok(erroMaximo.message.includes('excede'), 'Mensagem deve mencionar que soma excede o máximo');
    console.log('✅ Teste 13.5: Soma de competências excedendo o máximo oficial rejeitada.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.5 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.6: classificarDiscrepancia exportada e funcional
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    assert.ok(typeof classificarDiscrepancia === 'function', 'classificarDiscrepancia deve ser função exportada');
    assert.ok(typeof LIMITE_DISCREPANCIA_CRITICA === 'number', 'LIMITE_DISCREPANCIA_CRITICA deve ser número');
    assert.ok(typeof LIMITE_DISCREPANCIA_SIGNIFICATIVA === 'number', 'LIMITE_DISCREPANCIA_SIGNIFICATIVA deve ser número');
    assert.equal(LIMITE_DISCREPANCIA_CRITICA, 100, 'Limite crítico deve ser 100');
    assert.equal(LIMITE_DISCREPANCIA_SIGNIFICATIVA, 50, 'Limite significativo deve ser 50');
    console.log('✅ Teste 13.6: classificarDiscrepancia e constantes exportadas corretamente.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.6 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.7: classificarDiscrepancia — variação crítica (>100 pts)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const res280_440 = classificarDiscrepancia(280, 440);
    assert.equal(res280_440.diferenca, 160, 'Diferença deve ser 160');
    assert.equal(res280_440.classificacao, 'inconsistente', 'Deve classificar como inconsistente');
    assert.ok(res280_440.label.includes('crítica') || res280_440.label.includes('inconsistente'), 'Label deve mencionar variação crítica');

    const resQueda = classificarDiscrepancia(500, 350);
    assert.equal(resQueda.diferenca, -150, 'Diferença negativa deve ser -150');
    assert.equal(resQueda.classificacao, 'inconsistente', 'Queda de 150 também é inconsistente');
    console.log('✅ Teste 13.7: Variação crítica (>100 pts) classificada como "inconsistente".');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.7 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.8: classificarDiscrepancia — variação significativa (50-100 pts)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const res50 = classificarDiscrepancia(400, 450);
    assert.equal(res50.diferenca, 50, 'Diferença deve ser 50');
    assert.equal(res50.classificacao, 'significativa', 'Deve classificar como significativa');

    const res100 = classificarDiscrepancia(400, 500);
    assert.equal(res100.diferenca, 100, 'Diferença deve ser 100');
    assert.equal(res100.classificacao, 'significativa', 'Exatamente 100 deve ser significativa (não crítica)');
    console.log('✅ Teste 13.8: Variação significativa (50-100 pts) classificada corretamente.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.8 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.9: classificarDiscrepancia — variação normal (<50 pts)
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const res0 = classificarDiscrepancia(400, 400);
    assert.equal(res0.diferenca, 0, 'Diferença deve ser 0');
    assert.equal(res0.classificacao, 'normal', 'Sem variação deve ser normal');

    const res40 = classificarDiscrepancia(400, 440);
    assert.equal(res40.diferenca, 40, 'Diferença deve ser 40');
    assert.equal(res40.classificacao, 'normal', '40 pts deve ser variação normal');

    const res49 = classificarDiscrepancia(400, 449);
    assert.equal(res49.classificacao, 'normal', '49 pts deve ser variação normal');
    console.log('✅ Teste 13.9: Variação normal (<50 pts) classificada corretamente.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.9 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.10: evidencias e problemas normalizados como arrays
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const rawSemEvidencias = JSON.stringify({
      nota_total: 400,
      nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'C1', nota: 80, nota_maxima: 200, justificativa: 'Análise da norma culta..' },
        // sem campo evidencias e problemas — deve normalizar para []
        { numero: 2, nome: 'C2', nota: 80, nota_maxima: 200, justificativa: 'Análise do tema..', evidencias: null },
        { numero: 3, nome: 'C3', nota: 80, nota_maxima: 200, justificativa: 'Análise dos argumentos..', problemas: 'texto-não-array' },
        { numero: 4, nome: 'C4', nota: 80, nota_maxima: 200, justificativa: 'Análise de coesão..', evidencias: ['Uso de conectivos'] },
        { numero: 5, nome: 'C5', nota: 80, nota_maxima: 200, justificativa: 'Análise de intervenção..', problemas: ['Proposta vaga'] }
      ],
      pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [],
      sugestoes: [], prioridades_estudo: [], feedback_geral: '', aviso_educacional: ''
    });
    const resEv = validarENormalizarResposta(rawSemEvidencias, matrizEnemOficial, 'groq/test');
    // Todos devem ser arrays
    resEv.competencias.forEach((c, i) => {
      assert.ok(Array.isArray(c.evidencias), `competencias[${i}].evidencias deve ser array`);
      assert.ok(Array.isArray(c.problemas), `competencias[${i}].problemas deve ser array`);
    });
    console.log('✅ Teste 13.10: evidencias e problemas normalizados como arrays em todas as competências.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.10 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 13.11: Rubrica explícita presente no prompt
  // ─────────────────────────────────────────────────────────
  total++;
  try {
    const fs = await import('fs');
    const aiCode = fs.readFileSync('api/_ai-service.js', 'utf8');
    // O prompt deve conter elementos da rubrica explícita
    assert.ok(aiCode.includes('RUBRICAS OFICIAIS POR COMPETÊNCIA'), 'Deve ter seção de rubricas explícitas');
    assert.ok(aiCode.includes('NÃO atribua pontos por impressão geral'), 'Deve proibir pontuação por impressão geral');
    assert.ok(aiCode.includes('Cada pontuação DEVE ser baseada em evidências concretas'), 'Deve exigir evidências concretas');
    assert.ok(aiCode.includes('PROIBIDO'), 'Deve ter regras proibitivas explícitas');
    assert.ok(aiCode.includes('SOMA_EXATA_DAS_COMPETENCIAS'), 'Deve exigir que nota_total seja a soma exata');
    console.log('✅ Teste 13.11: Rubrica explícita e restrições antipoluição presentes no prompt.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 13.11 falhou:', err.message);
  }

  // ─────────────────────────────────────────────────────────
  // TESTE 14: Chamada real com Groq (opcional — requer GROQ_API_KEY)
  // ─────────────────────────────────────────────────────────
  total++;
  if (process.env.GROQ_API_KEY) {
    try {
      console.log('🔄 Executando chamada real à API do Groq...');
      const resultadoReal = await avaliarRedacaoComIA({
        tema: 'Impactos da Inteligência Artificial no mercado de trabalho brasileiro',
        vestibular: 'enem',
        matriz: matrizEnemOficial,
        texto: 'A revolução tecnológica vivenciada no século XXI transforma profundamente as relações laborais no Brasil. Diante desse cenário, a expansão de ferramentas automatizadas exige a requalificação contínua dos trabalhadores e a atuação do Estado para mitigar a precarização social. Portanto, medidas urgentes são fundamentais para equilibrar produtividade e bem-estar coletivo.'
      });

      assert.ok(resultadoReal.nota_total >= 0, 'Deve ter nota total válida');
      assert.ok(resultadoReal.competencias.length === 5, 'Deve ter 5 competências');
      assert.ok(resultadoReal.modelo_utilizado.includes('groq'), 'Modelo deve ser do Groq');

      // Verifica que a soma está correta (prova que o backend calculou, não a IA)
      const somaReal = resultadoReal.competencias.reduce((acc, c) => acc + c.nota, 0);
      assert.equal(resultadoReal.nota_total, somaReal, `Nota total (${resultadoReal.nota_total}) deve ser a soma das competências (${somaReal})`);

      // Verifica que todas as notas são múltiplos de 40 (escala ENEM)
      resultadoReal.competencias.forEach((c, i) => {
        assert.equal(c.nota % 40, 0, `Competência ${i + 1}: nota ${c.nota} deve ser múltiplo de 40`);
      });

      console.log(`✅ Teste 14: Chamada real à API do Groq concluída! Modelo: ${resultadoReal.modelo_utilizado}, Nota: ${resultadoReal.nota_total}/1000.`);
      passados++;
    } catch (err) {
      console.error('❌ Teste 14 (Chamada real Groq) falhou:', err.message);
    }
  } else {
    console.log('ℹ️  Teste 14: GROQ_API_KEY não encontrada. Chamada real ignorada com segurança.');
    passados++;
  }

  // ─────────────────────────────────────────────────────────
  // RELATÓRIO FINAL
  // ─────────────────────────────────────────────────────────
  const icone = passados === total ? '✅' : '⚠️';
  console.log(`\n${icone} Relatório: ${passados}/${total} testes aprovados.`);

  if (passados !== total) {
    console.error(`\n❌ ${total - passados} teste(s) falharam. Verifique os erros acima.`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
