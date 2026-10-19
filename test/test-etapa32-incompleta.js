/**
 * test/test-etapa32-incompleta.js — Validação da Integridade e Limites de Tokens (Etapa 32)
 */

import { strict as assert } from 'assert';
import { validarENormalizarResposta } from '../api/_ai-service.js';

let total = 0;
let passados = 0;

function pass(nome) {
  passados++;
  console.log(`  ✅ [PASS] ${nome}`);
}

function fail(nome, err) {
  console.error(`  ❌ [FAIL] ${nome}:`, err.message || err);
}

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

console.log('🧪 Iniciando Testes da ETAPA 32: Integridade contra respostas parciais e limites de tokens...\n');

// 1. Resposta com 5 competências válidas é aceita
total++;
try {
  const payload5 = JSON.stringify({
    nota_total: 800,
    competencias: [
      { numero: 1, nota: 160, justificativa: 'Justificativa adequada para a competência 1.' },
      { numero: 2, nota: 160, justificativa: 'Justificativa adequada para a competência 2.' },
      { numero: 3, nota: 160, justificativa: 'Justificativa adequada para a competência 3.' },
      { numero: 4, nota: 160, justificativa: 'Justificativa adequada para a competência 4.' },
      { numero: 5, nota: 160, justificativa: 'Justificativa adequada para a competência 5.' }
    ]
  });
  const res = validarENormalizarResposta(payload5, matrizEnem, 'mock');
  assert.equal(res.competencias.length, 5);
  assert.equal(res.nota_total, 800);
  pass('1 — Resposta completa com C1 a C5 aceita com exatidão');
} catch (e) { fail('1', e); }

// 2. Resposta com apenas 3 competências é sumariamente rejeitada
total++;
try {
  const payload3 = JSON.stringify({
    nota_total: 480,
    competencias: [
      { numero: 1, nota: 160, justificativa: 'Justificativa adequada para a competência 1.' },
      { numero: 2, nota: 160, justificativa: 'Justificativa adequada para a competência 2.' },
      { numero: 3, nota: 160, justificativa: 'Justificativa adequada para a competência 3.' }
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(payload3, matrizEnem, 'mock'),
    /A avaliação está incompleta: esperadas 5 competências/i
  );
  pass('2 — Resposta com apenas 3 competências é sumariamente rejeitada');
} catch (e) { fail('2', e); }

// 3. Resposta com competência duplicada (ex: duas vezes C1) é rejeitada
total++;
try {
  const payloadDup = JSON.stringify({
    nota_total: 800,
    competencias: [
      { numero: 1, nota: 160, justificativa: 'Justificativa adequada para a competência 1.' },
      { numero: 1, nota: 160, justificativa: 'Justificativa adequada para a competência 1 duplicada.' },
      { numero: 2, nota: 160, justificativa: 'Justificativa adequada para a competência 2.' },
      { numero: 3, nota: 160, justificativa: 'Justificativa adequada para a competência 3.' },
      { numero: 4, nota: 160, justificativa: 'Justificativa adequada para a competência 4.' }
    ]
  });
  assert.throws(
    () => validarENormalizarResposta(payloadDup, matrizEnem, 'mock'),
    /competência C5 não foi retornada/i
  );
  pass('3 — Resposta com competência duplicada e ausência de C5 é rejeitada');
} catch (e) { fail('3', e); }

// 4. JSON malformado / truncado lança erro explícito de formatação
total++;
try {
  const jsonTruncado = '{"nota_total": 800, "competencias": [{"numero": 1, "nota": 160';
  assert.throws(
    () => validarENormalizarResposta(jsonTruncado, matrizEnem, 'mock'),
    /Formato JSON inválido/i
  );
  pass('4 — JSON truncado lança erro explícito de formatação');
} catch (e) { fail('4', e); }

// 5. Garantia de que notas parciais NÃO são atribuídas nem computadas
total++;
try {
  let atribuiuNota = false;
  try {
    const payloadIncompleto = JSON.stringify({
      nota_total: 480,
      competencias: [
        { numero: 1, nota: 160, justificativa: 'J1 longa o suficiente.' },
        { numero: 2, nota: 160, justificativa: 'J2 longa o suficiente.' }
      ]
    });
    const res = validarENormalizarResposta(payloadIncompleto, matrizEnem, 'mock');
    if (res && res.nota_total) atribuiuNota = true;
  } catch (err) {
    atribuiuNota = false;
  }
  assert.equal(atribuiuNota, false, 'Nenhuma nota atribuída em resposta incompleta');
  pass('5 — Garantia de que nenhuma nota é atribuída ou persistida para avaliações incompletas');
} catch (e) { fail('5', e); }

console.log(`\n========================================`);
console.log(`Resultado ETAPA 32: ${passados}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (passados !== total) {
  process.exit(1);
}
