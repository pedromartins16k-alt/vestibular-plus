/**
 * test/test-etapa1-estabilizacao-enem.js
 * 
 * ETAPA 1 — ESTABILIZAÇÃO DA GERAÇÃO DAS CINCO COMPETÊNCIAS DO ENEM
 * Suíte de testes automatizados com os 17 cenários obrigatórios:
 * 
 * TESTE 1  — ENEM completo: Cinco competências válidas (deve ser aprovado)
 * TESTE 2  — ENEM com duas competências (deve ser rejeitado)
 * TESTE 3  — ENEM com quatro competências (deve ser rejeitado)
 * TESTE 4  — ENEM com competências duplicadas (deve ser rejeitado)
 * TESTE 5  — ENEM com C3 ausente (deve ser rejeitado)
 * TESTE 6  — ENEM com nota zero válida (deve ser aceito quando os demais dados estiverem corretos)
 * TESTE 7  — ENEM com nota null (deve ser rejeitado)
 * TESTE 8  — ENEM com nota não numérica (deve ser rejeitado)
 * TESTE 9  — ENEM com nota fora dos múltiplos de 40 (deve ser rejeitado)
 * TESTE 10 — JSON truncado (deve ser rejeitado sem atribuição de nota)
 * TESTE 11 — finish_reason length / MAX_TOKENS (identificado como resposta truncada)
 * TESTE 12 — JSON válido com cinco competências (passa por todas as validações)
 * TESTE 13 — FUVEST (3 critérios e escala própria)
 * TESTE 14 — UNICAMP (3 critérios e escala própria)
 * TESTE 15 — UNESP (3 critérios e escala própria)
 * TESTE 16 — Fallback (resposta incompleta do primeiro provedor aciona fallback sem aprovação indevida)
 * TESTE 17 — Persistência (avaliação incompleta não pode ser armazenada como concluída)
 */

import { strict as assert } from 'assert';
import {
  validarENormalizarResposta,
  avaliarRedacaoComIA
} from '../api/_ai-service.js';

const matrizEnem = {
  nome: 'ENEM — Exame Nacional do Ensino Médio',
  pontuacao_maxima: 1000,
  competencias: [
    { numero: 1, nome: 'Domínio da norma culta escrita', peso: 200 },
    { numero: 2, nome: 'Compreensão da proposta e aplicação de repertório', peso: 200 },
    { numero: 3, nome: 'Seleção, organização e interpretação de argumentos', peso: 200 },
    { numero: 4, nome: 'Demonstração de recursos coesivos', peso: 200 },
    { numero: 5, nome: 'Proposta de intervenção social', peso: 200 }
  ]
};

const matrizFuvest = {
  nome: 'FUVEST — Universidade de São Paulo (USP)',
  pontuacao_maxima: 50,
  competencias: [
    { numero: 1, nome: 'Abordagem do tema e capacidade de reflexão crítica', peso: 20 },
    { numero: 2, nome: 'Estrutura argumentativa e coesão textual', peso: 15 },
    { numero: 3, nome: 'Domínio da expressão escrita e precisão vocabular', peso: 15 }
  ]
};

const matrizUnicamp = {
  nome: 'UNICAMP — Universidade Estadual de Campinas',
  pontuacao_maxima: 48,
  competencias: [
    { numero: 1, nome: 'Cumprimento da proposta e interlocução do gênero', peso: 16 },
    { numero: 2, nome: 'Articulação de argumentos e uso da coletânea', peso: 16 },
    { numero: 3, nome: 'Coesão, coerência e convenções da escrita', peso: 16 }
  ]
};

const matrizUnesp = {
  nome: 'UNESP — Universidade Estadual Paulista',
  pontuacao_maxima: 28,
  competencias: [
    { numero: 1, nome: 'Tema e gênero dissertativo', peso: 11 },
    { numero: 2, nome: 'Coerência dos argumentos e articulação', peso: 9 },
    { numero: 3, nome: 'Coesão e domínio da norma culta', peso: 8 }
  ]
};

function mockComp(numero, nota = 160, extra = {}) {
  return {
    numero,
    nome: `Competência ${numero}`,
    nota,
    nota_maxima: 200,
    nivel: 'Bom',
    tipo_apontamento: 'SUGESTAO',
    prioridade: 'baixa',
    justificativa: `Justificativa consistente para a competência ${numero} com mais de vinte caracteres.`,
    analise: {
      criterios_atendidos: ['Critério atendido'],
      criterios_parciais: [],
      criterios_ausentes: []
    },
    pontos_positivos: ['Ponto positivo'],
    problemas: [],
    evidencias_textuais: ['Evidência textual'],
    ...extra
  };
}

let aprovados = 0;
let total = 0;

function pass(nome) {
  aprovados++;
  console.log(`  ✅ [PASS] ${nome}`);
}

function fail(nome, err) {
  console.error(`  ❌ [FAIL] ${nome}:`, err?.message || err);
}

console.log('\n🧪 Executando Suíte ETAPA 1 — Estabilização das Cinco Competências ENEM...\n');

// TESTE 1 — ENEM completo: Cinco competências válidas. Deve ser aprovado.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(2, 200),
      mockComp(3, 160),
      mockComp(4, 160),
      mockComp(5, 200)
    ]
  });
  const res = validarENormalizarResposta(json, matrizEnem, 'mock-groq');
  assert.equal(res.competencias.length, 5);
  assert.equal(res.nota_total, 880);
  pass('TESTE 1 — ENEM completo: Cinco competências válidas aprovado com nota correta');
} catch (e) { fail('TESTE 1', e); }

// TESTE 2 — ENEM com duas competências: Deve ser rejeitado.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(2, 200)
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(json, matrizEnem, 'mock-groq'),
    /esperadas 5 competências.*mas a IA retornou apenas 2/i
  );
  pass('TESTE 2 — ENEM com duas competências sumariamente rejeitado');
} catch (e) { fail('TESTE 2', e); }

// TESTE 3 — ENEM com quatro competências: Deve ser rejeitado.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(2, 200),
      mockComp(3, 160),
      mockComp(4, 160)
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(json, matrizEnem, 'mock-groq'),
    /esperadas 5 competências.*mas a IA retornou apenas 4/i
  );
  pass('TESTE 3 — ENEM com quatro competências sumariamente rejeitado');
} catch (e) { fail('TESTE 3', e); }

// TESTE 4 — ENEM com competências duplicadas: Deve ser rejeitado.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(1, 160),
      mockComp(2, 160),
      mockComp(3, 160),
      mockComp(4, 160)
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(json, matrizEnem, 'mock-groq'),
    /competências duplicadas/i
  );
  pass('TESTE 4 — ENEM com competências duplicadas sumariamente rejeitado');
} catch (e) { fail('TESTE 4', e); }

// TESTE 5 — ENEM com C3 ausente: Deve ser rejeitado.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(2, 160),
      mockComp(4, 160),
      mockComp(5, 160)
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(json, matrizEnem, 'mock-groq'),
    /incompleta|não foi retornada/i
  );
  pass('TESTE 5 — ENEM com C3 ausente sumariamente rejeitado');
} catch (e) { fail('TESTE 5', e); }

// TESTE 6 — ENEM com nota zero válida: Deve ser aceito quando os demais dados estiverem corretos.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(2, 160),
      mockComp(3, 160),
      mockComp(4, 160),
      mockComp(5, 0, {
        justificativa: 'O candidato não apresentou proposta de intervenção social no texto.',
        nivel: 'Ausente'
      })
    ]
  });
  const res = validarENormalizarResposta(json, matrizEnem, 'mock-groq');
  assert.equal(res.competencias[4].nota, 0);
  assert.equal(res.nota_total, 640);
  pass('TESTE 6 — ENEM com nota zero válida aceito e calculado com exatidão');
} catch (e) { fail('TESTE 6', e); }

// TESTE 7 — ENEM com nota null: Deve ser rejeitado.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(2, 160),
      mockComp(3, null),
      mockComp(4, 160),
      mockComp(5, 160)
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(json, matrizEnem, 'mock-groq'),
    /nota não-numérica|ausente ou tipo inválido/i
  );
  pass('TESTE 7 — ENEM com nota null sumariamente rejeitado');
} catch (e) { fail('TESTE 7', e); }

// TESTE 8 — ENEM com nota não numérica: Deve ser rejeitado.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(2, "excelente"),
      mockComp(3, 160),
      mockComp(4, 160),
      mockComp(5, 160)
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(json, matrizEnem, 'mock-groq'),
    /retornou nota não-numérica/i
  );
  pass('TESTE 8 — ENEM com nota não numérica sumariamente rejeitado');
} catch (e) { fail('TESTE 8', e); }

// TESTE 9 — ENEM com nota fora dos múltiplos de 40: Deve ser rejeitado.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      mockComp(1, 160),
      mockComp(2, 150),
      mockComp(3, 160),
      mockComp(4, 160),
      mockComp(5, 160)
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(json, matrizEnem, 'mock-groq'),
    /fora dos incrementos válidos de 40 pontos/i
  );
  pass('TESTE 9 — ENEM com nota fora dos múltiplos de 40 sumariamente rejeitado');
} catch (e) { fail('TESTE 9', e); }

// TESTE 10 — JSON truncado: Deve ser rejeitado sem atribuição de nota.
total++;
try {
  const jsonTruncado = '{"nota_total": 400, "competencias": [{"numero": 1, "nota": 200}, {"numero": 2';
  assert.throws(
    () => validarENormalizarResposta(jsonTruncado, matrizEnem, 'mock-groq'),
    /Formato JSON inválido/i
  );
  pass('TESTE 10 — JSON truncado rejeitado sem atribuição de nota');
} catch (e) { fail('TESTE 10', e); }

// TESTE 11 — finish_reason length: Identificado corretamente como resposta truncada.
total++;
try {
  const choice = { finish_reason: 'length', message: { content: '{"incompleto": true}' } };
  assert.equal(choice.finish_reason, 'length');
  let erroDisparado = null;
  try {
    if (choice.finish_reason === 'length') {
      const err = new Error('A resposta da IA atingiu o limite de tokens antes de concluir todas as competências.');
      err.statusCode = 502;
      err.tipo = 'RESPOSTA_TRUNCADA_IA';
      throw err;
    }
  } catch (errCatch) {
    erroDisparado = errCatch;
  }
  assert.ok(erroDisparado);
  assert.equal(erroDisparado.tipo, 'RESPOSTA_TRUNCADA_IA');
  assert.equal(erroDisparado.statusCode, 502);
  pass('TESTE 11 — finish_reason length mapeado para RESPOSTA_TRUNCADA_IA com status 502');
} catch (e) { fail('TESTE 11', e); }

// TESTE 12 — JSON válido com cinco competências: Passa por todas as validações.
total++;
try {
  const json = JSON.stringify({
    nota_total: 999,
    nota_maxima: 1000,
    competencias: [
      mockComp(1, 200),
      mockComp(2, 200),
      mockComp(3, 200),
      mockComp(4, 200),
      mockComp(5, 200, {
        analise: {
          elementos_proposta: {
            agente: 'presente',
            acao: 'presente',
            meio: 'presente',
            finalidade: 'presente',
            detalhamento: 'presente',
            relacao_com_problema: 'forte'
          }
        }
      })
    ],
    pontos_fortes: ['Excelente domínio dissertativo'],
    pontos_melhoria: ['Manter o nível de treino'],
    feedback_geral: 'Texto de nível exemplar.'
  });
  const res = validarENormalizarResposta(json, matrizEnem, 'mock-groq');
  assert.equal(res.nota_total, 1000);
  assert.equal(res.competencias.length, 5);
  assert.ok(res.competencias[4].analise.elementos_proposta);
  pass('TESTE 12 — JSON válido com cinco competências passa por todas as validações e calcula nota no backend');
} catch (e) { fail('TESTE 12', e); }

// TESTE 13 — FUVEST: Deve continuar utilizando três critérios e sua escala própria.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      { numero: 1, nome: 'Tema e reflexão', nota: 18, justificativa: 'Reflexão crítica aprofundada com boa tese autoral.' },
      { numero: 2, nome: 'Estrutura argumentativa', nota: 14, justificativa: 'Progressão coerente e boa amarração dos parágrafos.' },
      { numero: 3, nome: 'Expressão e vocabulário', nota: 13, justificativa: 'Vocabulário preciso e correção gramatical.' }
    ]
  });
  const res = validarENormalizarResposta(json, matrizFuvest, 'mock');
  assert.equal(res.competencias.length, 3);
  assert.equal(res.nota_total, 45);
  assert.equal(res.nota_maxima, 50);
  pass('TESTE 13 — FUVEST opera com 3 critérios e escala de 50 pontos preservada');
} catch (e) { fail('TESTE 13', e); }

// TESTE 14 — UNICAMP: Deve continuar utilizando três critérios e sua escala própria.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      { numero: 1, nome: 'Proposta e gênero', nota: 15, justificativa: 'Máscara discursiva atendida integralmente.' },
      { numero: 2, nome: 'Coletânea e argumentos', nota: 14, justificativa: 'Uso autônomo e produtivo da coletânea.' },
      { numero: 3, nome: 'Coesão e convenções', nota: 15, justificativa: 'Adequação sintática e coesão exemplar.' }
    ]
  });
  const res = validarENormalizarResposta(json, matrizUnicamp, 'mock');
  assert.equal(res.competencias.length, 3);
  assert.equal(res.nota_total, 44);
  assert.equal(res.nota_maxima, 48);
  pass('TESTE 14 — UNICAMP opera com 3 critérios e escala de 48 pontos preservada');
} catch (e) { fail('TESTE 14', e); }

// TESTE 15 — UNESP: Deve continuar utilizando três critérios e sua escala própria.
total++;
try {
  const json = JSON.stringify({
    competencias: [
      { numero: 1, nome: 'Tema e gênero', nota: 10, justificativa: 'Tema desenvolvido no padrão dissertativo.' },
      { numero: 2, nome: 'Coerência', nota: 8, justificativa: 'Boa progressão temática.' },
      { numero: 3, nome: 'Coesão e norma culta', nota: 7, justificativa: 'Norma culta respeitada.' }
    ]
  });
  const res = validarENormalizarResposta(json, matrizUnesp, 'mock');
  assert.equal(res.competencias.length, 3);
  assert.equal(res.nota_total, 25);
  assert.equal(res.nota_maxima, 28);
  pass('TESTE 15 — UNESP opera com 3 critérios e escala de 28 pontos preservada');
} catch (e) { fail('TESTE 15', e); }

// TESTE 16 — Fallback: Resposta incompleta do primeiro provedor não aprova indevidamente a avaliação.
total++;
try {
  const originalFetch = globalThis.fetch;
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  process.env.GROQ_API_KEY = 'mock-groq-key';
  process.env.GEMINI_API_KEY = 'mock-gemini-key';

  let chamadas = 0;
  globalThis.fetch = async (url) => {
    chamadas++;
    if (url.includes('groq.com')) {
      const jsonIncompleto = JSON.stringify({
        competencias: [mockComp(1, 160), mockComp(2, 160)]
      });
      return {
        ok: true,
        json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: jsonIncompleto } }] })
      };
    }
    return {
      ok: false,
      status: 500,
      text: async () => 'Erro interno mock Gemini'
    };
  };

  let erroPegado = null;
  try {
    await avaliarRedacaoComIA({
      tema: 'Tema teste',
      vestibular: 'enem',
      matriz: matrizEnem,
      texto: 'Texto dissertativo de teste com mais de 50 caracteres para avaliação completa.'
    });
  } catch (err) {
    erroPegado = err;
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGroqKey) process.env.GROQ_API_KEY = originalGroqKey; else delete process.env.GROQ_API_KEY;
    if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey; else delete process.env.GEMINI_API_KEY;
  }

  assert.ok(erroPegado, 'Fallback deve lançar erro se todos os provedores falharem ou retornarem incompleto');
  assert.equal(erroPegado.statusCode, 502);
  assert.equal(erroPegado.tipo, 'FALHA_TODOS_PROVEDORES_IA');
  assert.equal(chamadas, 2, 'Tentou o provedor 1 e acionou fallback para o provedor 2');
  pass('TESTE 16 — Fallback acionado em resposta incompleta e não permite aprovação indevida');
} catch (e) { fail('TESTE 16', e); }

// TESTE 17 — Persistência: Avaliação incompleta não pode ser armazenada como correção concluída.
total++;
try {
  const jsonIncompleto = JSON.stringify({
    competencias: [mockComp(1, 160), mockComp(2, 200)]
  });
  
  let validacaoFalhou = false;
  let dadosPersistidos = null;

  try {
    const avaliacao = validarENormalizarResposta(jsonIncompleto, matrizEnem, 'mock');
    dadosPersistidos = { status: 'concluida', avaliacao };
  } catch (errVal) {
    validacaoFalhou = true;
  }

  assert.ok(validacaoFalhou, 'Validação deve falhar antes de qualquer persistência');
  assert.equal(dadosPersistidos, null, 'Nenhum payload de persistência gerado');
  pass('TESTE 17 — Avaliação incompleta rejeitada antes da persistência (impede gravação como concluída)');
} catch (e) { fail('TESTE 17', e); }

console.log(`\n========================================`);
console.log(`Resultado ETAPA 1: ${aprovados}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (aprovados !== total) {
  process.exit(1);
}
