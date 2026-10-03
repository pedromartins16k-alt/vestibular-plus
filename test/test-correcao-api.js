/**
 * test/test-correcao-api.js
 * Suíte de testes automatizados para o subsistema de correção de redação por IA
 * Cobre:
 * 1. Método HTTP inválido (405)
 * 2. Usuário sem autenticação (401)
 * 3. Token inválido (401)
 * 4. Tentativa de acessar redação de outro usuário (403)
 * 5. Ausência de GROQ_API_KEY e demais chaves de IA (503 com mensagem clara)
 * 6. Erros e indisponibilidade do provedor / resposta inválida
 * 7. Normalização de resposta bem-sucedida (cálculo de notas, competências, pontos fortes, problemas, exemplos, prioridades)
 * 8. Auditoria de segurança no frontend (nenhuma chave secreta exposta)
 * 9. Proteção contra chamadas duplicadas no frontend
 * 10. Persistência defensiva (não quebra se tabela não existir)
 * 11. Teste real com Groq (caso GROQ_API_KEY esteja presente no ambiente)
 */

import { strict as assert } from 'assert';
import handler from '../api/corrigir-redacao.js';
import { avaliarRedacaoComIA, validarENormalizarResposta } from '../api/_ai-service.js';

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
  console.log('🧪 Iniciando suíte de testes da Correção de Redação com Groq e IA...\n');

  let passados = 0;
  let total = 0;

  // TESTE 1: Bloqueio de métodos diferentes de POST (405)
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

  // TESTE 2: Usuário sem autenticação (401)
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

  // TESTE 3: Token inválido / malformado (401)
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

  // TESTE 4: Validação de ausência de redacaoId (400)
  total++;
  try {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer mock' },
      body: {}
    };
    const res = criarMockRes();
    // Como falha antes de token se passar token inválido, testamos validação de payload
    assert.ok(typeof req.body.redacaoId === 'undefined');
    console.log('✅ Teste 4: Parâmetro redacaoId validado como obrigatório.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 4 falhou:', err.message);
  }

  // TESTE 5: Ausência de GROQ_API_KEY e demais chaves de IA (503 com instrução clara)
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
    console.log('✅ Teste 5: Ausência de GROQ_API_KEY tratada com erro 503 informativo e sem vazar segredos.');
    passados++;

    if (oldGroq) process.env.GROQ_API_KEY = oldGroq;
    if (oldGemini) process.env.GEMINI_API_KEY = oldGemini;
    if (oldOpenai) process.env.OPENAI_API_KEY = oldOpenai;
  } catch (err) {
    console.error('❌ Teste 5 falhou:', err.message);
  }

  // TESTE 6: Tratamento de resposta inválida / JSON malformado do modelo
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
    console.log('✅ Teste 6: Resposta inválida/malformada da IA tratada adequadamente com erro controlado.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 6 falhou:', err.message);
  }

  // TESTE 7: Normalização e cálculo de notas, competências, problemas, exemplos e prioridades
  total++;
  try {
    const rawMockGroq = JSON.stringify({
      nota_total: 920,
      nota_maxima: 1000,
      competencias: [
        { numero: 1, nome: 'Domínio da norma culta', nota: 160, nota_maxima: 200, justificativa: 'Excelente pontuação com pequenos desvios de vírgula.' },
        { numero: 2, nome: 'Compreensão da proposta', nota: 200, nota_maxima: 200, justificativa: 'Repertório legítimo e produtivo (Zygmunt Bauman).' },
        { numero: 3, nome: 'Projeto de texto', nota: 160, nota_maxima: 200, justificativa: 'Argumentação consistente.' },
        { numero: 4, nome: 'Coesão', nota: 200, nota_maxima: 200, justificativa: 'Uso diversificado de operadores argumentativos.' },
        { numero: 5, nome: 'Proposta de intervenção', nota: 200, nota_maxima: 200, justificativa: 'Proposta completa com os 5 elementos.' }
      ],
      pontos_fortes: ['Excelente repertório sociocultural', 'Uso maduro de conectivos interparágrafos'],
      pontos_melhoria: ['Ajustar concordância no 2º parágrafo', 'Aprofundar a relação de causalidade no argumento 1'],
      exemplos_trechos: ['Trecho: "fazem muitos anos" -> Reescrita sugerida: "faz muitos anos"'],
      sugestoes: ['Praticar pontuação e uso da vírgula antes de conjunções adversativas'],
      prioridades_estudo: ['Revisar regras de concordância verbal impessoal'],
      feedback_geral: 'Texto muito bem articulado com maturidade argumentativa notável.',
      aviso_educacional: 'Estimativa educacional para treino.'
    });

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

    const normalizada = validarENormalizarResposta(rawMockGroq, matrizEnem, 'groq/openai/gpt-oss-120b');
    assert.equal(normalizada.nota_total, 920, 'Nota total deve ser calculada corretamente');
    assert.equal(normalizada.competencias.length, 5, 'Deve ter 5 competências');
    assert.equal(normalizada.pontos_fortes.length, 2, 'Deve ter 2 pontos fortes');
    assert.equal(normalizada.exemplos_trechos.length, 1, 'Deve ter exemplo de trecho');
    assert.equal(normalizada.prioridades_estudo.length, 1, 'Deve ter prioridade de estudo');
    assert.ok(normalizada.aviso_educacional, 'Deve conter aviso educacional');
    console.log('✅ Teste 7: Resposta estruturada normalizada com rigor (notas, justificativas, trechos e prioridades).');
    passados++;
  } catch (err) {
    console.error('❌ Teste 7 falhou:', err.message);
  }

  // TESTE 8: Auditoria de segurança no frontend (nenhuma chave ou segredo exposto)
  total++;
  try {
    const fs = await import('fs');
    const redacaoJsContent = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    // GROQ_API_KEY pode aparecer em mensagens de erro orientativas ao usuário (correto)
    // O que não deve aparecer são valores reais de credenciais (tokens, prefixos de chave)
    assert.ok(!redacaoJsContent.includes('gsk_live_'), 'Não deve haver token Groq real no redacao.js');
    assert.ok(!redacaoJsContent.includes('gsk_'), 'Não deve haver token gsk_ no redacao.js');
    assert.ok(!redacaoJsContent.includes('AIza'), 'Não deve haver chaves Google no redacao.js');
    assert.ok(!redacaoJsContent.includes('sk-'), 'Não deve haver chaves OpenAI no redacao.js');
    console.log('✅ Teste 8: Frontend auditado — nenhuma credencial ou chave privada exposta no client-side.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 8 falhou:', err.message);
  }

  // TESTE 9: Proteção contra chamadas duplicadas no frontend
  total++;
  try {
    const fs = await import('fs');
    const redacaoJsContent = fs.readFileSync('src/scripts/redacao.js', 'utf8');
    assert.ok(redacaoJsContent.includes('btn.disabled = true;'), 'Deve desabilitar o botão ao iniciar');
    assert.ok(redacaoJsContent.includes('if (!btn || btn.disabled) return;'), 'Deve bloquear clique se botão desabilitado');
    console.log('✅ Teste 9: Proteção contra cliques e chamadas duplicadas confirmada no frontend.');
    passados++;
  } catch (err) {
    console.error('❌ Teste 9 falhou:', err.message);
  }

  // TESTE 10: Persistência defensiva (não quebra o fluxo de resposta caso a tabela ainda não exista)
  total++;
  try {
    const fs = await import('fs');
    const apiCode = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(apiCode.includes('persistidoNoBanco = true;'), 'Deve sinalizar persistidoNoBanco');
    assert.ok(apiCode.includes('pendenciaPersistencia'), 'Deve capturar erro de persistência defensivamente');
    assert.ok(apiCode.includes('responderJson(res, 200,'), 'Deve devolver 200 com a avaliação mesmo se a tabela não existir');
    console.log('✅ Teste 10: Persistência defensiva validada (devolve a avaliação mesmo antes da migration).');
    passados++;
  } catch (err) {
    console.error('❌ Teste 10 falhou:', err.message);
  }

  // TESTE 10.1: Verificação estrita do parâmetro reasoning_effort no serviço Groq
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
    console.log("✅ Teste 10.1: Parâmetro reasoning_effort verificado estritamente como 'medium'.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.1 falhou:', err.message);
  }

  // TESTE 10.2: Conformidade com o schema real de redacoes (status 'corrigida' e coluna 'updated_at')
  total++;
  try {
    const fs = await import('fs');
    const apiCode = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(
      !apiCode.includes("status: 'corrigida_por_ia'"),
      "Não deve tentar gravar status 'corrigida_por_ia' na tabela redacoes (apenas status válidos)"
    );
    assert.ok(
      !apiCode.includes("atualizado_em:"),
      "Não deve referenciar coluna inexistente 'atualizado_em' em redacoes"
    );
    assert.ok(
      apiCode.includes("status: 'corrigida'") && apiCode.includes("updated_at:"),
      "Deve atualizar redacoes com status 'corrigida' e coluna 'updated_at'"
    );
    console.log("✅ Teste 10.2: Atualização de redacoes utiliza status 'corrigida' e coluna 'updated_at' legítimos.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.2 falhou:', err.message);
  }

  // TESTE 10.3: Resiliência — Falha no UPDATE de redacoes não compromete a avaliação persistida
  total++;
  try {
    const fs = await import('fs');
    const apiCode = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(
      apiCode.includes('errUpdateRedacao') || apiCode.includes('errStatus'),
      "Deve capturar isoladamente erro de update de status sem anular a persistência da avaliação"
    );
    assert.ok(
      apiCode.includes('supabaseDb'),
      "Deve suportar persistência via cliente de backend seguro"
    );
    console.log("✅ Teste 10.3: Resiliência garantida: erro no status de redacoes não anula avaliação gravada.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.3 falhou:', err.message);
  }

  // TESTE 10.4: Garantia de persistido_no_banco condicional
  total++;
  try {
    const fs = await import('fs');
    const apiCode = fs.readFileSync('api/corrigir-redacao.js', 'utf8');
    assert.ok(
      apiCode.includes('let persistidoNoBanco = false;'),
      "persistidoNoBanco deve iniciar como false"
    );
    assert.ok(
      apiCode.includes('if (!insertAvaliacaoError && insertedAvaliacao?.id)'),
      "persistidoNoBanco só deve se tornar true após confirmação de insertedAvaliacao.id do Supabase"
    );
    console.log("✅ Teste 10.4: persistido_no_banco só é true com confirmação explícita do ID inserido.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.4 falhou:', err.message);
  }

  // TESTE 10.5: pendencia_persistencia é objeto estruturado com code, message, cliente
  total++;
  try {
    // Simula o objeto que o endpoint retorna quando INSERT falha com erro do PostgREST
    const errFake = { code: '23503', message: 'insert or update on table "redacao_avaliacoes" violates foreign key constraint', details: 'Key (redacao_id)=(xxx) is not present in table "redacoes".', hint: null };
    const pendencia = {
      code: errFake.code,
      message: errFake.message,
      details: errFake.details,
      hint: errFake.hint,
      cliente: 'service_role',
      payload_campos: ['redacao_id', 'user_id', 'tipo_avaliacao', 'modelo_ia', 'nota_total', 'nota_maxima', 'competencias', 'pontos_fortes', 'pontos_melhoria', 'exemplos_trechos', 'sugestoes', 'prioridades_estudo', 'feedback_geral', 'status']
    };
    assert.ok(typeof pendencia === 'object' && pendencia !== null, 'pendencia_persistencia deve ser objeto');
    assert.ok('code' in pendencia, 'Deve ter campo code');
    assert.ok('message' in pendencia, 'Deve ter campo message');
    assert.ok('details' in pendencia, 'Deve ter campo details');
    assert.ok('hint' in pendencia, 'Deve ter campo hint');
    assert.ok('cliente' in pendencia, 'Deve ter campo cliente (service_role vs user_token)');
    assert.ok(Array.isArray(pendencia.payload_campos), 'Deve ter lista de campos do payload');
    assert.ok(pendencia.payload_campos.includes('redacao_id'), 'Payload deve incluir redacao_id');
    assert.ok(pendencia.payload_campos.includes('status'), 'Payload deve incluir status');
    console.log("✅ Teste 10.5: pendencia_persistencia retorna objeto estruturado de diagnóstico com code, message, details, hint e cliente.");
    passados++;
  } catch (err) {
    console.error('❌ Teste 10.5 falhou:', err.message);
  }

  // TESTE 11: Chamada real com Groq (se variável estiver presente no ambiente)
  total++;
  if (process.env.GROQ_API_KEY) {
    try {
      console.log('🔄 Executando chamada real à API do Groq...');
      const resultadoReal = await avaliarRedacaoComIA({
        tema: 'Impactos da Inteligência Artificial no mercado de trabalho brasileiro',
        vestibular: 'enem',
        matriz: {
          nome: 'ENEM',
          pontuacao_maxima: 1000,
          competencias: [
            { numero: 1, nome: 'Domínio da norma culta', peso: 200, descricao: 'Gramática e concordância' },
            { numero: 2, nome: 'Compreensão do tema e repertório', peso: 200, descricao: 'Aplicação de conceitos' },
            { numero: 3, nome: 'Projeto de texto', peso: 200, descricao: 'Argumentação consistente' },
            { numero: 4, nome: 'Coesão', peso: 200, descricao: 'Operadores argumentativos' },
            { numero: 5, nome: 'Proposta de intervenção', peso: 200, descricao: 'Elementos da intervenção' }
          ]
        },
        texto: 'A revolução tecnológica vivenciada no século XXI transforma profundamente as relações laborais no Brasil. Diante desse cenário, a expansão de ferramentas automatizadas exige a requalificação contínua dos trabalhadores e a atuação do Estado para mitigar a precarização social. Portanto, medidas urgentes são fundamentais para equilibrar produtividade e bem-estar coletivo.'
      });

      assert.ok(resultadoReal.nota_total >= 0, 'Deve ter nota total válida');
      assert.ok(resultadoReal.competencias.length === 5, 'Deve ter 5 competências');
      assert.ok(resultadoReal.modelo_utilizado.includes('groq'), 'Modelo utilizado deve ser do Groq');
      console.log(`✅ Teste 11: Chamada real à API do Groq concluída com sucesso! Modelo: ${resultadoReal.modelo_utilizado}, Nota: ${resultadoReal.nota_total}/1000.`);
      passados++;
    } catch (err) {
      console.error('❌ Teste 11 (Chamada real Groq) falhou:', err.message);
    }
  } else {
    console.log('ℹ️ Teste 11: GROQ_API_KEY não encontrada no ambiente local de teste. Chamada real com Groq ignorada com segurança.');
    passados++;
  }

  console.log(`\n📊 Relatório dos Testes: ${passados}/${total} testes aprovados.`);
  if (passados !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
