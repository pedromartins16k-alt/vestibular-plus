/**
 * test/test-benchmark.js — Suíte de Testes Automatizados do Benchmark ENEM
 *
 * Validações implementadas:
 *  1. Validação de formato: aceita registros íntegros com tema, texto, avaliações humanas e correção da IA.
 *  2. Rejeição de dados inválidos com mensagens claras (campos faltantes, notas negativas, fora de escala).
 *  3. Incrementos do ENEM: exige estritamente 0, 40, 80, 120, 160, 200 para avaliadores individuais e IA.
 *  4. Inconsistência na soma: rejeita quando a nota_total da IA diverge da soma das 5 competências.
 *  5. Resolução de 2 avaliadores concordantes: calcula média aritmética oficial.
 *  6. Detecção de discrepância INEP: identifica divergência quando delta total > 100 ou delta comp > 80.
 *  7. Resolução com 3º avaliador (desempate): calcula média entre o 3º e o corretor mais próximo.
 *  8. Precedência de adjudicação: adota nota de consenso/adjudicada diretamente quando informada.
 *  9. Cálculo exato de métricas (MAE total, MAE por competência, viés, exatidão % e faixa de ±40 pts).
 * 10. Ranking de afastamento: ordena corretamente as competências por MAE decrescente.
 * 11. Resiliência a dataset vazio ou corrompido: não quebra e retorna diagnóstico claro.
 * 12. Execução ponta a ponta do runner offline com dataset de demonstração e geração de relatórios.
 */

import { strict as assert } from 'assert';
import path from 'path';
import fs from 'fs';
import {
  normalizarCompetencias,
  validarNotasEnem,
  verificarDiscrepanciaEntreAvaliadores,
  resolverReferenciaHumana,
  validarCorrecaoIA,
  validarCasoBenchmark,
  validarDatasetBenchmark
} from '../benchmark/schema.js';
import {
  calcularMetricasBenchmark,
  arredondar
} from '../benchmark/metrics.js';
import {
  gerarRelatorioConsole,
  gerarRelatorioMarkdown
} from '../benchmark/reporter.js';
import {
  executarBenchmark,
  DATASET_DEMO_PADRAO
} from '../benchmark/runner.js';

let totalTestes = 0;
let aprovados = 0;

function pass(nome) {
  aprovados++;
  console.log(`  ✅ [PASS] ${nome}`);
}

function fail(nome, err) {
  console.error(`  ❌ [FAIL] ${nome}:`, err?.message || err);
}

console.log('🧪 Iniciando Testes do Módulo de Benchmark (ENEM Offline)...\n');

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 1: Validação de Schema e Escala ENEM
// ─────────────────────────────────────────────────────────────────────────────

// 1. Normalização de competências em diferentes formatos (objeto e array)
totalTestes++;
try {
  const compObj = normalizarCompetencias({ c1: 160, c2: 120, c3: 160, c4: 200, c5: 120 });
  assert.equal(compObj.c1, 160);
  assert.equal(compObj.c5, 120);

  const compArr = normalizarCompetencias([
    { numero: 1, nota: 160 },
    { numero: 2, nota: 120 },
    { numero: 3, nota: 160 },
    { numero: 4, nota: 200 },
    { numero: 5, nota: 120 }
  ]);
  assert.deepEqual(compArr, compObj);

  pass('1. Normalização de competências suporta objeto e array de itens');
} catch (err) {
  fail('1. Normalização de competências', err);
}

// 2. Rejeição de competências incompletas ou ausentes
totalTestes++;
try {
  assert.throws(() => normalizarCompetencias(null), /ausente ou nulo/);
  assert.throws(() => normalizarCompetencias({ c1: 160, c2: 120 }), /C3 ausente/);
  assert.throws(() => normalizarCompetencias([ { numero: 1, nota: 160 } ]), /incompleto/);
  pass('2. Rejeição estrita de competências incompletas ou nulas');
} catch (err) {
  fail('2. Rejeição de competências incompletas', err);
}

// 3. Validação dos incrementos oficiais de 40 pontos do ENEM
totalTestes++;
try {
  const validas = validarNotasEnem({ c1: 0, c2: 40, c3: 80, c4: 160, c5: 200 }, false);
  assert.equal(validas.valido, true);

  const invalidas = validarNotasEnem({ c1: 150, c2: -40, c3: 240, c4: 160, c5: 'cem' }, false);
  assert.equal(invalidas.valido, false);
  assert.equal(invalidas.erros.length >= 4, true);

  pass('3. Validação estrita da escala ENEM (0, 40, 80, 120, 160, 200)');
} catch (err) {
  fail('3. Validação da escala ENEM', err);
}

// 4. Inconsistência na soma das competências da IA
totalTestes++;
try {
  const casoIaInconsistente = {
    correcao_ia: {
      competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 },
      nota_total: 900 // Soma real é 800
    }
  };
  assert.throws(() => validarCorrecaoIA(casoIaInconsistente), /diverge da soma das competências/);
  pass('4. Rejeição quando nota_total informada pela IA diverge da soma das competências');
} catch (err) {
  fail('4. Inconsistência na soma da IA', err);
}

// 5. Rejeição de redações com campos vitais ausentes (tema ou texto)
totalTestes++;
try {
  const casoSemTema = {
    id: 'teste-sem-tema',
    texto: 'Texto da redação...',
    avaliacoes_humanas: [{ competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 } }],
    correcao_ia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 }
  };
  const res = validarCasoBenchmark(casoSemTema, 0);
  assert.equal(res.valido, false);
  assert.equal(res.erros.some(e => e.includes('Tema/título')), true);
  pass('5. Rejeição clara quando tema ou texto estão ausentes');
} catch (err) {
  fail('5. Rejeição de campos ausentes', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 2: Resolução de Divergências entre Avaliadores Humanos (INEP)
// ─────────────────────────────────────────────────────────────────────────────

// 6. Dois avaliadores sem discrepância: média aritmética oficial
totalTestes++;
try {
  const caso2Avaliadores = {
    avaliacoes_humanas: [
      { competencias: { c1: 160, c2: 160, c3: 120, c4: 160, c5: 120 } },
      { competencias: { c1: 160, c2: 120, c3: 120, c4: 160, c5: 160 } }
    ]
  };
  const ref = resolverReferenciaHumana(caso2Avaliadores);
  assert.equal(ref.discrepancia_detectada, false);
  assert.equal(ref.metodo_resolucao, 'media_dois_avaliadores_concordantes');
  assert.equal(ref.competencias.c1, 160);
  assert.equal(ref.competencias.c2, 140); // (160+120)/2
  assert.equal(ref.competencias.c3, 120);
  assert.equal(ref.competencias.c5, 140); // (120+160)/2
  assert.equal(ref.nota_total, 720);
  pass('6. Dois corretores concordantes: média aritmética calculada corretamente');
} catch (err) {
  fail('6. Dois corretores concordantes', err);
}

// 7. Detecção de discrepância segundo critérios do INEP (>100 total ou >80 comp)
totalTestes++;
try {
  const cA = { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }; // 800
  const cB = { c1: 160, c2: 40, c3: 160, c4: 160, c5: 160 };  // 680 (diff comp = 120 > 80; diff total = 120 > 100)
  const disc = verificarDiscrepanciaEntreAvaliadores(cA, cB);
  assert.equal(disc.discrepante, true);
  assert.equal(disc.deltaTotal, 120);
  assert.equal(disc.deltasComp.c2, 120);
  assert.equal(disc.motivos.length >= 2, true);
  pass('7. Discrepância INEP detectada quando delta comp > 80 ou delta total > 100');
} catch (err) {
  fail('7. Discrepância INEP', err);
}

// 8. Resolução com 3º avaliador (desempate com o corretor mais próximo)
totalTestes++;
try {
  const caso3Avaliadores = {
    avaliacoes_humanas: [
      { competencias: { c1: 120, c2: 120, c3: 80, c4: 120, c5: 80 } },   // Total: 520
      { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 120 } }, // Total: 760
      { competencias: { c1: 160, c2: 160, c3: 120, c4: 160, c5: 120 } }  // Total: 720 (3º corretor, mais próximo do corretor 2: delta=40 vs delta=200)
    ]
  };
  const ref = resolverReferenciaHumana(caso3Avaliadores);
  assert.equal(ref.discrepancia_detectada, true);
  assert.equal(ref.metodo_resolucao, 'terceiro_avaliador_com_avaliador_2');
  // Média entre avaliador 2 e 3: C3 = (160+120)/2 = 140; C5 = (120+120)/2 = 120; Total = (760+720)/2 = 740
  assert.equal(ref.competencias.c3, 140);
  assert.equal(ref.competencias.c5, 120);
  assert.equal(ref.nota_total, 740);
  pass('8. Desempate com 3º avaliador: média calculada com o corretor mais próximo');
} catch (err) {
  fail('8. Desempate com 3º avaliador', err);
}

// 9. Precedência de nota adjudicada ou consenso pré-definido
totalTestes++;
try {
  const casoComAdjudicada = {
    avaliacoes_humanas: [
      { competencias: { c1: 80, c2: 80, c3: 80, c4: 80, c5: 80 } },
      { competencias: { c1: 200, c2: 200, c3: 200, c4: 200, c5: 200 } }
    ],
    nota_adjudicada: {
      tipo: 'consenso_banca_examinadora',
      competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 },
      nota_total: 800
    }
  };
  const ref = resolverReferenciaHumana(casoComAdjudicada);
  assert.equal(ref.metodo_resolucao, 'consenso_banca_examinadora');
  assert.equal(ref.nota_total, 800);
  assert.equal(ref.competencias.c1, 160);
  pass('9. Precedência da nota adjudicada/consenso sobre divergências de corretores');
} catch (err) {
  fail('9. Precedência de nota adjudicada', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 3: Cálculo das Métricas Estatísticas
// ─────────────────────────────────────────────────────────────────────────────

// 10. Cálculo exato de MAE, Viés, Exatidão e Faixa de ±40 pontos em dataset de controle
totalTestes++;
try {
  // Casos de controle matematicamente verificáveis:
  // Caso A: IA = Ref (Total: 800 vs 800, delta=0; comp deltas: todos 0)
  // Caso B: IA = 760 vs Ref = 720 (delta=+40; C2: 160 vs 120 = +40, outros 0)
  // Caso C: IA = 680 vs Ref = 740 (delta=-60; C3: 120 vs 160 = -40, C5: 120 vs 140 = -20, outros 0)
  const casosControle = [
    {
      id: 'caso-A',
      referencia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 },
      correcao_ia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 }
    },
    {
      id: 'caso-B',
      referencia: { competencias: { c1: 160, c2: 120, c3: 160, c4: 160, c5: 120 }, nota_total: 720 },
      correcao_ia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 120 }, nota_total: 760 }
    },
    {
      id: 'caso-C',
      referencia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 140 }, nota_total: 780 },
      correcao_ia: { competencias: { c1: 160, c2: 160, c3: 120, c4: 160, c5: 120 }, nota_total: 720 }
    }
  ];

  const m = calcularMetricasBenchmark(casosControle);

  // MAE Total = (|0| + |40| + |-60|) / 3 = 100 / 3 = 33.33 pts
  assert.equal(m.quantidade_casos, 3);
  assert.equal(m.metricas_globais.mae_total, 33.33);

  // Viés Total = (0 + 40 - 60) / 3 = -20 / 3 = -6.67 pts
  assert.equal(m.metricas_globais.vies_total, -6.67);

  // Exatidão Total = 1 de 3 = 33.3%
  assert.equal(m.metricas_globais.exatidao_total_pct, 33.3);

  // Faixa de 40 pts Total = 2 de 3 (0 e 40 estão dentro, 60 está fora) = 66.7%
  assert.equal(m.metricas_globais.faixa_40_total_pct, 66.7);

  // C1: erro sempre zero -> MAE = 0, Exatidão = 100%, Faixa 40 = 100%
  assert.equal(m.competencias.c1.mae, 0);
  assert.equal(m.competencias.c1.exatidao_pct, 100);

  // C2: deltas: 0, +40, 0 -> MAE = 40/3 = 13.33 pts; Viés = +13.33 pts
  assert.equal(m.competencias.c2.mae, 13.33);
  assert.equal(m.competencias.c2.vies, 13.33);

  // C3: deltas: 0, 0, -40 -> MAE = 40/3 = 13.33 pts; Viés = -13.33 pts
  assert.equal(m.competencias.c3.mae, 13.33);
  assert.equal(m.competencias.c3.vies, -13.33);

  pass('10. Cálculo matemático exato de MAE, Viés, Exatidão e Faixa de ±40 pontos');
} catch (err) {
  fail('10. Cálculo de métricas', err);
}

// 11. Ranking de afastamento das competências por MAE decrescente
totalTestes++;
try {
  const casosRanking = [
    {
      id: 'r1',
      referencia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 },
      correcao_ia: { competencias: { c1: 160, c2: 120, c3: 80, c4: 160, c5: 120 }, nota_total: 640 }
      // deltas: C1=0, C2=40, C3=80, C4=0, C5=40
    }
  ];
  const m = calcularMetricasBenchmark(casosRanking);
  const ranking = m.ranking_afastamento;

  // C3 tem maior erro (80), seguido de C2/C5 (40), e C1/C4 (0)
  assert.equal(ranking[0].chave, 'c3');
  assert.equal(ranking[0].mae, 80);
  assert.equal(ranking[ranking.length - 1].mae, 0);

  pass('11. Ranking de afastamento ordena competências da mais crítica para a mais alinhada');
} catch (err) {
  fail('11. Ranking de afastamento', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 4: Execução Offline e Integração Ponta a Ponta
// ─────────────────────────────────────────────────────────────────────────────

// 12. Execução ponta a ponta com o dataset de demonstração padrão
totalTestes++;
try {
  const caminhoTempRelatorio = path.resolve(process.cwd(), 'benchmark/data/temp-relatorio-teste.md');

  const resultado = executarBenchmark(DATASET_DEMO_PADRAO, {
    caminhoSaidaMarkdown: caminhoTempRelatorio,
    silencioso: true
  });

  assert.equal(resultado.valido, true);
  assert.equal(resultado.metricas.quantidade_casos, 5);
  assert.equal(resultado.metricas.metricas_globais.mae_total > 0, true);
  assert.equal(resultado.metricas.ranking_afastamento.length, 5);
  assert.equal(typeof resultado.relatorioConsole, 'string');
  assert.equal(resultado.relatorioConsole.includes('RELATÓRIO DE BENCHMARK'), true);
  assert.equal(fs.existsSync(caminhoTempRelatorio), true);

  // Limpa arquivo temporário de teste
  fs.unlinkSync(caminhoTempRelatorio);

  pass('12. Execução ponta a ponta offline com dataset de demonstração e geração de relatórios');
} catch (err) {
  fail('12. Execução ponta a ponta', err);
}

// 13. Dataset vazio: rejeição e retorno amigável sem lançar exceção
totalTestes++;
try {
  const datasetVazio = { versao: '1.0', casos: [] };
  const res = validarDatasetBenchmark(datasetVazio);
  assert.equal(res.valido, false);
  const m = calcularMetricasBenchmark(res.casosValidos);
  assert.equal(m.quantidade_casos, 0);
  const relConsole = gerarRelatorioConsole({ resultadoValidacao: res, metricas: m });
  assert.equal(relConsole.includes('Nenhum caso válido'), true);

  pass('13. Tratamento elegante de dataset vazio com mensagens informativas');
} catch (err) {
  fail('13. Dataset vazio', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO DA SUÍTE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`Relatório da Suíte: ${aprovados}/${totalTestes} testes aprovados.`);
console.log('═'.repeat(60));

if (aprovados !== totalTestes) {
  process.exitCode = 1;
}
