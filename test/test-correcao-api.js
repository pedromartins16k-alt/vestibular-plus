/**
 * test/test-correcao-api.js
 * Suíte de testes automatizados para o subsistema de correção de redação por IA
 */

import { strict as assert } from 'assert';
import handler from '../api/corrigir-redacao.js';
import { avaliarRedacaoComIA } from '../api/_ai-service.js';

// Mock de resposta HTTP
function criarMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log('🧪 Iniciando testes da API de Correção de Redação...\n');

  let passados = 0;
  let total = 0;

  // TESTE 1: Bloqueio de métodos diferentes de POST
  total++;
  try {
    const req = { method: 'GET', headers: {} };
    const res = criarMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 405, 'Deve retornar 405 para GET');
    assert.ok(res.body?.error?.includes('POST'), 'Mensagem deve indicar POST');
    console.log('✅ Teste 1: Bloqueio de método GET passou (405).');
    passados++;
  } catch (err) {
    console.error('❌ Teste 1 falhou:', err.message);
  }

  // TESTE 2: Rejeição de requisição sem token Bearer
  total++;
  try {
    const req = { method: 'POST', headers: {}, body: { redacaoId: '123' } };
    const res = criarMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 401, 'Deve retornar 401 sem token');
    assert.ok(res.body?.error?.includes('Authorization'), 'Deve solicitar Authorization');
    console.log('✅ Teste 2: Rejeição de requisição sem token passou (401).');
    passados++;
  } catch (err) {
    console.error('❌ Teste 2 falhou:', err.message);
  }

  // TESTE 3: Rejeição de requisição com token Bearer malformado/inválido
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
    console.log('✅ Teste 3: Rejeição de token inválido passou (401).');
    passados++;
  } catch (err) {
    console.error('❌ Teste 3 falhou:', err.message);
  }

  // TESTE 4: Detecção de ausência de chaves de IA (503 sem quebra)
  total++;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;

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
    assert.ok(erroLancado.message.includes('GEMINI_API_KEY'), 'Mensagem deve orientar sobre GEMINI_API_KEY');
    console.log('✅ Teste 4: Ausência de provedor de IA tratada com erro 503 informativo e sem vazar segredos.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 4 falhou:', err.message);
  }

  // TESTE 5: Verificação de que nenhuma chave secreta está no frontend
  total++;
  try {
    const fs = await import('fs');
    const redacaoJsContent = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    assert.ok(!redacaoJsContent.includes('AI_KEY'), 'Não deve haver AI_KEY no redacao.js');
    assert.ok(!redacaoJsContent.includes('sk-'), 'Não deve haver chaves no redacao.js');
    assert.ok(!redacaoJsContent.includes('AIza'), 'Não deve haver chaves Google no redacao.js');
    console.log('✅ Teste 5: Frontend auditado — nenhuma chave ou segredo de IA exposto no client-side.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 5 falhou:', err.message);
  }

  console.log(`\n📊 Resultado dos testes: ${passados}/${total} passaram com sucesso.`);
  if (passados !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
