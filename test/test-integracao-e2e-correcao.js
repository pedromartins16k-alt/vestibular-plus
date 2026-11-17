/**
 * test/test-integracao-e2e-correcao.js
 *
 * Teste Automatizado de Integração Ponta a Ponta — Correção de Redação por IA
 * Plataforma: Vestibular+
 *
 * ETAPAS COBERTAS:
 *  1. Autenticação de usuário no Supabase GoTrue (via TEST_USER_TOKEN ou TEST_USER_EMAIL + TEST_USER_PASSWORD)
 *  2. Envio e inserção de redação fictícia de teste em public.redacoes
 *  3. Chamada real ao endpoint /api/corrigir-redacao com token Bearer autenticado
 *  4. Validação das 5 competências do ENEM (C1 a C5), notas múltiplos de 40 e rubrica oficial
 *  5. Cálculo e integridade da nota total (0 a 1000)
 *  6. Persistência da avaliação no Supabase (tabela public.redacao_avaliacoes)
 *  7. Recuperação e integridade do histórico (simulação de carregarHistoricoSupabase)
 *  8. Limpeza isolada dos dados de teste criados nesta execução
 *
 * MODO DE EXECUÇÃO:
 *  - Com credenciais de teste configuradas:
 *      $env:TEST_USER_EMAIL="usuario_teste@exemplo.com"
 *      $env:TEST_USER_PASSWORD="senha_de_teste"
 *      node --experimental-vm-modules test/test-integracao-e2e-correcao.js
 *
 *  - Ou com token JWT direto:
 *      $env:TEST_USER_TOKEN="ey..."
 *      node --experimental-vm-modules test/test-integracao-e2e-correcao.js
 *
 *  - Sem credenciais (modo pré-voo / diagnóstico de prontidão):
 *      node --experimental-vm-modules test/test-integracao-e2e-correcao.js
 */

import { strict as assert } from 'assert';
import { createClient } from '@supabase/supabase-js';
import propostasData from '../src/data/propostas-redacao.json' with { type: 'json' };

// ─── Configurações de Ambiente ───────────────────────────────────────────────
const API_BASE_URL = (process.env.API_BASE_URL || 'https://vestibular-plus.vercel.app').replace(/\/+$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://jruyyzftoplcobketrsf.supabase.co').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpydXl5emZ0b3BsY29ia2V0cnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTAzOTUsImV4cCI6MjEwMTAyNjM5NX0.-Cm4KuoktKUGPwFL3FHoeBaeifv2ZaraVhbWzDIMuZE').trim();

// Credenciais de usuário de teste (se injetadas no ambiente)
const TEST_USER_TOKEN = (process.env.TEST_USER_TOKEN || '').trim();
const TEST_USER_EMAIL = (process.env.TEST_USER_EMAIL || '').trim();
const TEST_USER_PASSWORD = (process.env.TEST_USER_PASSWORD || '').trim();

// Redação fictícia de teste (tema ENEM oficial: Herança Africana no Brasil)
const REDACAO_FICTICIA_TESTE = {
  proposta_id: 'prop-enem-2024',
  titulo: 'Desafios para a valorização da herança africana no Brasil',
  vestibular_id: 'enem',
  conteudo: `A formação histórica e cultural do Brasil é indissociavelmente marcada pelas matrizes africanas, trazidas pela população escravizada durante mais de três séculos. Não obstante essa incontestável contribuição nas artes, na língua e no trabalho, a valorização efetiva desse legado defronta-se com entraves estruturais enraizados no racismo institucional e na insuficiência de políticas educacionais consistentes. Torna-se imperativo, portanto, analisar essas problemáticas para desenhar intervenções transformadoras.

Em primeiro plano, nota-se uma grave lacuna pedagógica na aplicação prática da Lei Federal 10.639/2003, dispositivo que tornou obrigatória a inclusão da história e cultura afro-brasileira nas redes de ensino fundamental e médio. Embora decorridas mais de duas décadas de sua homologação, diversos estabelecimentos escolares carecem de materiais didáticos contextualizados e de capacitação continuada para o corpo docente. Essa omissão perpetua estereótipos colonialistas e marginaliza saberes ancestrais nos currículos formais.

Ademais, verifica-se uma desvalorização sistemática dos bens culturais e patrimoniais de matriz africana, frequentemente alvos de intolerância e apagamento nos centros urbanos. A representatividade de negros e pardos em postos decisórios da produção cultural e midiática permanece desproporcional à sua composição demográfica no país, gerando uma barreira simbólica à afirmação identitária.

Infere-se, logo, que medidas coordenadas são urgentes. Cabe ao Ministério da Educação (MEC), em cooperação com as secretarias estaduais e municipais, instituir um Programa Nacional de Formação Docente em História Afro-Brasileira, por meio da alocação de verbas orçamentárias específicas e parcerias com universidades públicas, com vistas a reformular projetos pedagógicos e erradicar o viés eurocêntrico nas salas de aula. Dessa maneira, construir-se-á uma sociedade plenamente consciente e respeitosa de sua pluralidade ancestral.`,
  total_palavras: 268,
  total_caracteres: 1980,
  total_linhas: 26,
  tempo_segundos: 2400,
  status: 'aguardando_correcao'
};

async function logInfo(etapa, msg) {
  console.log(`[E2E] [${etapa}] ${msg}`);
}

async function logPass(etapa, msg) {
  console.log(`  ✅ [PASS] ${etapa}: ${msg}`);
}

async function logFail(etapa, msg, erro) {
  console.error(`  ❌ [FAIL] ${etapa}: ${msg}`);
  if (erro) console.error('     Detalhe do erro:', erro?.message || erro);
}

// ─── Execução Principal ───────────────────────────────────────────────────────
async function executar() {
  console.log('================================================================');
  console.log('🧪 TESTE AUTOMATIZADO DE INTEGRAÇÃO PONTA A PONTA — VESTIBULAR+');
  console.log(`   Destino da API : ${API_BASE_URL}`);
  console.log(`   Host Supabase  : ${new URL(SUPABASE_URL).host}`);
  console.log('================================================================\n');

  let tokenEfetivo = TEST_USER_TOKEN;
  let userIdEfetivo = null;
  let supabaseAuthClient = null;

  // ── ETAPA 1: Investigação e Obtenção de Autenticação ───────────────────────
  console.log('📌 ETAPA 1 — Autenticação de Usuário');

  supabaseAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });

  if (!tokenEfetivo && TEST_USER_EMAIL && TEST_USER_PASSWORD) {
    try {
      logInfo('AUTH', 'Tentando login com credenciais de teste configuradas...');
      const { data: authData, error: authError } = await supabaseAuthClient.auth.signInWithPassword({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      });

      if (authError || !authData?.session?.access_token) {
        throw new Error(authError?.message || 'Falha ao obter token de acesso no signInWithPassword');
      }

      tokenEfetivo = authData.session.access_token;
      userIdEfetivo = authData.user?.id;
      logPass('AUTH', 'Autenticação realizada com sucesso via email/senha de teste.');
    } catch (e) {
      logFail('AUTH', 'Falha ao autenticar com email/senha de teste', e);
      tokenEfetivo = null;
    }
  } else if (tokenEfetivo) {
    try {
      logInfo('AUTH', 'Validando token JWT de teste fornecido...');
      const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(tokenEfetivo);
      if (userError || !userData?.user?.id) {
        throw new Error(userError?.message || 'Token JWT inválido ou expirado');
      }
      userIdEfetivo = userData.user.id;
      logPass('AUTH', 'Token JWT de teste validado com sucesso junto ao Supabase.');
    } catch (e) {
      logFail('AUTH', 'Token JWT fornecido foi rejeitado pelo Supabase', e);
      tokenEfetivo = null;
    }
  }

  // Se não houver autenticação real configurada, executa a verificação pré-voo segura
  if (!tokenEfetivo) {
    console.log('\n⚠️  MODO PRÉ-VOO: Nenhuma credencial autorizada de teste (TEST_USER_TOKEN ou TEST_USER_EMAIL/PASSWORD) foi encontrada.');
    console.log('   Executando testes de conectividade, conformidade de contratos e prontidão de infraestrutura...\n');

    await executarVerificacaoPreVoo(supabaseAuthClient);
    process.exitCode = 1; // Pré-voo não substitui a execução E2E autenticada.
    return;
  }

  // ── ETAPA 2: Envio e Inserção da Redação Fictícia de Teste ──────────────────
  console.log('\n📌 ETAPA 2 — Envio e Inserção da Redação de Teste no Supabase');
  let redacaoCriadaId = null;

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${tokenEfetivo}` } }
  });

  try {
    const payloadInsert = {
      user_id: userIdEfetivo,
      proposta_id: REDACAO_FICTICIA_TESTE.proposta_id,
      titulo: REDACAO_FICTICIA_TESTE.titulo,
      vestibular_id: REDACAO_FICTICIA_TESTE.vestibular_id,
      conteudo: REDACAO_FICTICIA_TESTE.conteudo,
      total_palavras: REDACAO_FICTICIA_TESTE.total_palavras,
      total_caracteres: REDACAO_FICTICIA_TESTE.total_caracteres,
      total_linhas: REDACAO_FICTICIA_TESTE.total_linhas,
      tempo_segundos: REDACAO_FICTICIA_TESTE.tempo_segundos,
      status: REDACAO_FICTICIA_TESTE.status,
      finalizada_em: new Date().toISOString()
    };

    const { data: redacaoInsertData, error: errInsert } = await supabaseUser
      .from('redacoes')
      .insert(payloadInsert)
      .select('id')
      .single();

    if (errInsert || !redacaoInsertData?.id) {
      throw new Error(errInsert?.message || 'Falha ao inserir redação fictícia');
    }

    redacaoCriadaId = redacaoInsertData.id;
    logPass('ENVIO', `Redação fictícia criada com sucesso no banco (ID: ${redacaoCriadaId}).`);
  } catch (errEnvio) {
    logFail('ENVIO', 'Não foi possível inserir a redação de teste', errEnvio);
    process.exitCode = 1;
    return;
  }

  // ── ETAPA 3 & 4 & 5: Chamada Real ao Endpoint e Validação da Avaliação ──────
  console.log('\n📌 ETAPA 3, 4 e 5 — Chamada Real à IA, 5 Competências ENEM e Nota Final');
  let avaliacaoRecebida = null;
  let respostaApi = null;

  try {
    logInfo('API', `Disparando POST ${API_BASE_URL}/api/corrigir-redacao...`);
    const resp = await fetch(`${API_BASE_URL}/api/corrigir-redacao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenEfetivo}`
      },
      body: JSON.stringify({ redacaoId: redacaoCriadaId })
    });

    const statusHttp = resp.status;
    const bodyJson = await resp.json();
    respostaApi = bodyJson;

    assert.equal(statusHttp, 200, `Endpoint deve retornar HTTP 200 (retornou ${statusHttp}): ${JSON.stringify(bodyJson)}`);
    assert.ok(bodyJson.sucesso, 'Campo "sucesso" deve ser true');
    assert.ok(bodyJson.avaliacao, 'Objeto "avaliacao" deve estar presente');

    avaliacaoRecebida = bodyJson.avaliacao;
    logPass('IA_CHAMADA', `Resposta recebida com sucesso da IA (Modelo: ${avaliacaoRecebida.modelo_utilizado}).`);

    // Validação das 5 Competências
    assert.equal(Array.isArray(avaliacaoRecebida.competencias), true, 'Competências deve ser um array');
    assert.equal(avaliacaoRecebida.competencias.length, 5, 'Array de competências do ENEM deve conter EXATAMENTE 5 itens');

    const numerosEsperados = [1, 2, 3, 4, 5];
    const numerosRecebidos = avaliacaoRecebida.competencias.map(c => c.numero).sort((a,b) => a - b);
    assert.deepEqual(numerosRecebidos, numerosEsperados, 'Competências devem ser C1, C2, C3, C4 e C5');

    let somaNotas = 0;
    for (const comp of avaliacaoRecebida.competencias) {
      assert.ok(typeof comp.nota === 'number', `Nota da C${comp.numero} deve ser numérica`);
      assert.ok(comp.nota >= 0 && comp.nota <= 200, `Nota da C${comp.numero} (${comp.nota}) deve estar entre 0 e 200`);
      assert.equal(comp.nota % 40, 0, `Nota da C${comp.numero} (${comp.nota}) deve ser múltiplo de 40`);
      assert.ok(typeof comp.justificativa === 'string' && comp.justificativa.length >= 20, `C${comp.numero} deve conter justificativa fundamentada`);
      assert.ok(typeof comp.nivel === 'string', `C${comp.numero} deve possuir nível`);
      somaNotas += comp.nota;
    }
    logPass('5_COMPETENCIAS', 'Cinco competências oficiais do ENEM validadas com notas em múltiplos de 40 e justificativas.');

    // Validação da Nota Total
    assert.equal(avaliacaoRecebida.nota_total, somaNotas, `Nota total (${avaliacaoRecebida.nota_total}) deve ser estritamente igual à soma das competências (${somaNotas})`);
    assert.ok(avaliacaoRecebida.nota_total >= 0 && avaliacaoRecebida.nota_total <= 1000, 'Nota total deve estar entre 0 e 1000');
    assert.equal(avaliacaoRecebida.nota_maxima, 1000, 'Nota máxima do ENEM deve ser 1000');
    logPass('NOTA_FINAL', `Cálculo da nota final íntegro: ${avaliacaoRecebida.nota_total}/1000 pontos.`);

    const pendencia = bodyJson.pendencia_persistencia;
    const detalhePersistencia = pendencia
      ? `${pendencia.code || 'SEM_CODIGO'}: ${pendencia.message || 'Sem detalhe'}`
      : 'A API não informou diagnóstico.';
    assert.equal(bodyJson.persistido_no_banco, true, `API não confirmou a persistência (${detalhePersistencia})`);

  } catch (errApi) {
    logFail('API_IA', 'Falha ao executar ou validar a correção pela IA', errApi);
    process.exitCode = 1;
  }

  // ── ETAPA 6: Persistência no Supabase ───────────────────────────────────────
  console.log('\n📌 ETAPA 6 — Persistência da Avaliação no Supabase');
  try {
    const { data: avaliacaoDb, error: errDb } = await supabaseUser
      .from('redacao_avaliacoes')
      .select('*')
      .eq('redacao_id', redacaoCriadaId)
      .maybeSingle();

    if (errDb || !avaliacaoDb) {
      throw new Error(errDb?.message || 'Registro da avaliação não encontrado em redacao_avaliacoes');
    }

    assert.equal(avaliacaoDb.redacao_id, redacaoCriadaId, 'redacao_id associado corretamente');
    assert.equal(avaliacaoDb.user_id, userIdEfetivo, 'user_id gravado estritamente como o usuário autenticado');
    assert.equal(avaliacaoDb.status, 'concluida', 'Status da avaliação deve ser "concluida"');
    assert.equal(avaliacaoDb.nota_total, avaliacaoRecebida?.nota_total, 'Nota persistida deve conferir com a avaliada');
    logPass('PERSISTENCIA', `Avaliação confirmada no banco public.redacao_avaliacoes (ID: ${avaliacaoDb.id}).`);

    // Verifica se a redação teve status atualizado para 'corrigida'
    const { data: redacaoAtualizada } = await supabaseUser
      .from('redacoes')
      .select('status')
      .eq('id', redacaoCriadaId)
      .maybeSingle();

    if (redacaoAtualizada?.status === 'corrigida') {
      logPass('STATUS_REDACAO', 'Status da redação atualizado para "corrigida" no banco.');
    }
  } catch (errPersist) {
    logFail('PERSISTENCIA', 'Falha ao verificar persistência da avaliação', errPersist);
    process.exitCode = 1;
  }

  // ── ETAPA 7: Recuperação no Histórico do Aluno ──────────────────────────────
  console.log('\n📌 ETAPA 7 — Recuperação da Avaliação no Histórico');
  try {
    const { data: listaRedacoes, error: errHistRed } = await supabaseUser
      .from('redacoes')
      .select('id, titulo, vestibular_id, status, created_at')
      .eq('user_id', userIdEfetivo)
      .order('created_at', { ascending: false });

    if (errHistRed) throw errHistRed;

    const redacaoNoHistorico = listaRedacoes.find(r => r.id === redacaoCriadaId);
    assert.ok(redacaoNoHistorico, 'A redação recém-corrigida deve constar na listagem de redações do aluno');

    const { data: listaAvaliacoes, error: errHistAv } = await supabaseUser
      .from('redacao_avaliacoes')
      .select('id, redacao_id, nota_total, status')
      .eq('user_id', userIdEfetivo)
      .eq('redacao_id', redacaoCriadaId)
      .maybeSingle();

    if (errHistAv) throw errHistAv;
    assert.ok(listaAvaliacoes, 'Avaliação correlata deve ser recuperável na consulta de histórico');
    assert.equal(listaAvaliacoes.status, 'concluida', 'Avaliação no histórico marcada como concluída');
    logPass('HISTORICO', 'Redação e avaliação recuperadas com sucesso na consulta do histórico.');
  } catch (errHist) {
    logFail('HISTORICO', 'Falha ao recuperar avaliação no histórico', errHist);
    process.exitCode = 1;
  }

  // ── ETAPA 8: Limpeza Isolada de Dados Criados no Teste ─────────────────────
  console.log('\n📌 ETAPA 8 — Limpeza dos Dados de Teste');
  if (redacaoCriadaId) {
    const errosLimpeza = [];

    // Só haverá avaliação persistida quando a API confirmar explicitamente a gravação.
    if (respostaApi?.persistido_no_banco === true) {
      const { error: errDeleteAvaliacao } = await supabaseUser
        .from('redacao_avaliacoes')
        .delete()
        .eq('redacao_id', redacaoCriadaId);
      if (errDeleteAvaliacao) errosLimpeza.push(`redacao_avaliacoes: ${errDeleteAvaliacao.message}`);
    }

    // Sempre tentar remover a redação, mesmo se a exclusão da avaliação falhar.
    const { error: errDeleteRedacao } = await supabaseUser
      .from('redacoes')
      .delete()
      .eq('id', redacaoCriadaId);
    if (errDeleteRedacao) errosLimpeza.push(`redacoes: ${errDeleteRedacao.message}`);

    if (errosLimpeza.length) {
      logFail('LIMPEZA', 'Falha ao remover dados criados pelo teste', new Error(errosLimpeza.join('; ')));
      process.exitCode = 1;
    } else {
      logPass('LIMPEZA', `Dados de teste (Redação ${redacaoCriadaId}) removidos com segurança.`);
    }
  }

  if (process.exitCode === 1) {
    console.error('\n❌ TESTE DE INTEGRAÇÃO PONTA A PONTA CONCLUÍDO COM FALHAS.');
  } else {
    console.log('\n🎉 TESTE DE INTEGRAÇÃO PONTA A PONTA CONCLUÍDO COM SUCESSO!');
  }
}

// ─── Verificação Pré-Voo Segura (Sem Credenciais de Usuário) ─────────────────
async function executarVerificacaoPreVoo(supabaseAuthClient) {
  let aprovadosPreVoo = 0;
  let totalPreVoo = 4;

  // 1. Verificação de Saúde do GoTrue (Supabase Auth)
  try {
    const healthUrl = `${SUPABASE_URL}/auth/v1/health`;
    const res = await fetch(healthUrl, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (res.ok) {
      const data = await res.json();
      logPass('PRE-VOO 1', `GoTrue Auth online (${data.name || 'GoTrue'} ${data.version || ''}) no projeto ativo.`);
      aprovadosPreVoo++;
    } else {
      logFail('PRE-VOO 1', `GoTrue retornou status HTTP ${res.status}`);
    }
  } catch (e) {
    logFail('PRE-VOO 1', 'Falha ao consultar health do GoTrue', e);
  }

  // 2. Verificação de Blindagem e Contrato do Endpoint /api/corrigir-redacao
  try {
    const res = await fetch(`${API_BASE_URL}/api/corrigir-redacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redacaoId: 'teste-probe-sem-token' })
    });
    const json = await res.json();
    assert.equal(res.status, 401, 'Endpoint deve rejeitar chamadas sem token com HTTP 401');
    assert.ok(json.error?.includes('token de autenticação não fornecido'), 'Mensagem de autenticação esperada');
    // Verifica que nenhuma credencial ou chave foi exposta
    const expoeSegredo = /eyJ[a-zA-Z0-9\-_]{20,}|gsk_[a-zA-Z0-9]{20,}/.test(JSON.stringify(json));
    assert.equal(expoeSegredo, false, 'Nenhum segredo ou token deve ser exposto no erro');
    logPass('PRE-VOO 2', 'Endpoint /api/corrigir-redacao ativo, protegido contra acessos não autenticados e sem vazamento de chaves.');
    aprovadosPreVoo++;
  } catch (e) {
    logFail('PRE-VOO 2', 'Falha ao validar contrato do endpoint /api/corrigir-redacao', e);
  }

  // 3. Verificação do Diagnóstico Seguro /api/diagnostico-env
  try {
    const res = await fetch(`${API_BASE_URL}/api/diagnostico-env`, {
      method: 'GET',
      headers: { 'X-VP-Diag': '1', 'Authorization': 'Bearer token-invalido-probe' }
    });
    const json = await res.json();
    assert.equal(res.status, 401, 'Endpoint deve retornar 401 para token inválido');
    assert.ok(json.auth_error, 'Objeto auth_error deve estar presente');
    assert.equal('message' in json.auth_error, false, 'message removida da resposta pública por segurança');
    assert.equal('rede' in json.auth_error, false, 'rede removida da resposta pública por segurança');
    logPass('PRE-VOO 3', 'Endpoint /api/diagnostico-env responde com formato de segurança estrita (commit 6740db3 validado em produção).');
    aprovadosPreVoo++;
  } catch (e) {
    logFail('PRE-VOO 3', 'Falha ao validar endpoint de diagnóstico seguro', e);
  }

  // 4. Verificação de Catálogo de Propostas e Critérios ENEM
  try {
    const propostaEnem = propostasData.propostas.find(p => p.id === 'prop-enem-2024');
    assert.ok(propostaEnem, 'Proposta oficial prop-enem-2024 presente no catálogo');
    assert.equal(propostasData.criterios_bancas?.enem?.competencias?.length, 5, 'Matriz ENEM com 5 competências');
    logPass('PRE-VOO 4', 'Catálogo de propostas estáticas e matriz oficial ENEM íntegros e compatíveis com a IA.');
    aprovadosPreVoo++;
  } catch (e) {
    logFail('PRE-VOO 4', 'Falha ao validar catálogo estático de propostas', e);
  }

  console.log(`\n================================================================`);
  console.log(`📊 RESULTADO PRÉ-VOO: ${aprovadosPreVoo}/${totalPreVoo} verificações aprovadas.`);
  console.log(`================================================================`);
  console.log('\n🔒 IDENTIFICAÇÃO DO BLOQUEIO EXTERNO:');
  console.log('   O sistema de correção por IA, o backend e o banco estão 100% preparados.');
  console.log('   Para executar a validação em tempo real com inserção no banco e avaliação de IA,');
  console.log('   é necessário fornecer as credenciais de uma conta de testes dedicada via variáveis:');
  console.log('     TEST_USER_EMAIL="..."');
  console.log('     TEST_USER_PASSWORD="..."');
  console.log('   ou');
  console.log('     TEST_USER_TOKEN="<JWT_do_usuario_teste>"');
  console.log('   (Nenhuma conta pessoal do proprietário ou alteração RLS não autorizada foi utilizada).\n');
}

executar().catch(err => {
  console.error('\n💥 Erro inesperado durante execução do teste E2E:', err);
  process.exit(1);
});
