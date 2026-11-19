/**
 * test/test-benchmark.js — Suíte de Testes Automatizados do Benchmark ENEM
 *
 * Cenários de Teste:
 *  1. Normalização de competências suporta objeto e array de itens.
 *  2. Rejeição estrita de competências incompletas ou nulas.
 *  3. Validação estrita da escala ENEM (0, 40, 80, 120, 160, 200).
 *  4. Rejeição quando nota_total informada pela IA diverge da soma das competências.
 *  5. Rejeição clara quando tema ou texto estão ausentes.
 *  6. Dois corretores concordantes: média aritmética calculada corretamente (referência resolvida).
 *  7. Discrepância INEP detectada quando delta comp > 80 ou delta total > 100.
 *  8. Dois avaliadores divergentes sem 3º avaliador: marcado como pendente de adjudicação (sem inventar média provisória).
 *  9. Terceiro avaliador compatível com apenas um dos anteriores: média com o compatível (resolvido).
 * 10. Terceiro avaliador ainda divergente dos dois (divergência persistente): pendente de banca presencial (sem nota inventada).
 * 11. Terceiro avaliador compatível com ambos: média com o mais próximo no total (resolvido).
 * 12. Validação estrita do 3º avaliador: notas fora da escala ENEM no 3º avaliador são rejeitadas.
 * 13. Nota adjudicada total que não bate com as competências: rejeitada com erro descritivo.
 * 14. Caso válido de adjudicação: aceito como referência resolvida com precedência.
 * 15. Média provisória e casos pendentes excluídos das métricas: métricas usam somente referências resolvidas.
 * 16. Cálculo matemático exato de MAE, Viés, Exatidão e Faixa de ±40 pontos.
 * 17. Ranking de afastamento: ordena corretamente as competências por MAE decrescente.
 * 18. Execução ponta a ponta offline com dataset de demonstração e geração de relatórios.
 * 19. Tratamento elegante de dataset vazio com mensagens informativas.
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
  assert.equal(ref.resolvida, true);
  assert.equal(ref.status, 'resolvida');
  assert.equal(ref.discrepancia_detectada, false);
  assert.equal(ref.metodo_resolucao, 'media_dois_avaliadores_concordantes');
  assert.equal(ref.competencias.c1, 160);
  assert.equal(ref.competencias.c2, 140); // (160+120)/2
  assert.equal(ref.competencias.c3, 120);
  assert.equal(ref.competencias.c5, 140); // (120+160)/2
  assert.equal(ref.nota_total, 720);
  pass('6. Dois corretores concordantes: média aritmética calculada como referência resolvida');
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

// 8. Dois avaliadores divergentes sem 3º avaliador: marcado como pendente de adjudicação (sem inventar média)
totalTestes++;
try {
  const caso2Divergentes = {
    avaliacoes_humanas: [
      { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 },
      { competencias: { c1: 160, c2: 40, c3: 160, c4: 160, c5: 160 }, nota_total: 680 } // C2 diff = 120 > 80
    ]
  };
  const ref = resolverReferenciaHumana(caso2Divergentes);
  assert.equal(ref.resolvida, false);
  assert.equal(ref.status, 'pendente_adjudicacao');
  assert.equal(ref.competencias, null);
  assert.equal(ref.nota_total, null);
  assert.equal(ref.discrepancia_detectada, true);
  assert.equal(ref.metodo_resolucao, 'divergencia_pendente_adjudicacao');
  pass('8. Dois avaliadores divergentes sem 3º corretor: marcado como pendente sem inventar nota');
} catch (err) {
  fail('8. Dois avaliadores divergentes sem 3º corretor', err);
}

// 9. Terceiro avaliador compatível com apenas um dos anteriores (média entre 3º e o compatível)
totalTestes++;
try {
  // Avaliador 1: 520 (120, 120, 80, 120, 80)
  // Avaliador 2: 760 (160, 160, 160, 160, 120) -> discrepância com 1 (delta total = 240 > 100)
  // Avaliador 3: 720 (160, 160, 120, 160, 120)
  //   3 vs 1: delta total = 200 > 100 (divergente!)
  //   3 vs 2: delta total = 40 <= 100; deltas comp: todos <= 40 <= 80 (COMPATÍVEL com avaliador 2!)
  const caso3AvaliadoresCompativelUm = {
    avaliacoes_humanas: [
      { competencias: { c1: 120, c2: 120, c3: 80, c4: 120, c5: 80 }, nota_total: 520 },
      { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 120 }, nota_total: 760 },
      { competencias: { c1: 160, c2: 160, c3: 120, c4: 160, c5: 120 }, nota_total: 720 }
    ]
  };
  const ref = resolverReferenciaHumana(caso3AvaliadoresCompativelUm);
  assert.equal(ref.resolvida, true);
  assert.equal(ref.status, 'resolvida');
  assert.equal(ref.metodo_resolucao, 'terceiro_avaliador_com_avaliador_2');
  // Média entre avaliador 2 e 3: C3 = (160+120)/2 = 140; C5 = (120+120)/2 = 120; Total = (760+720)/2 = 740
  assert.equal(ref.competencias.c3, 140);
  assert.equal(ref.competencias.c5, 120);
  assert.equal(ref.nota_total, 740);
  pass('9. Terceiro avaliador compatível apenas com o 2º: média calculada com o par compatível');
} catch (err) {
  fail('9. Terceiro avaliador compatível com apenas um', err);
}

// 10. Terceiro avaliador divergente de ambos (divergência persistente: pendente de banca presencial)
totalTestes++;
try {
  // Avaliador 1: 520 (120, 120, 80, 120, 80)
  // Avaliador 2: 760 (160, 160, 160, 160, 120) -> discrepância com 1 (240 > 100)
  // Avaliador 3: 1000 (200, 200, 200, 200, 200) -> diverge de 1 (delta 480) E diverge de 2 (delta 240)
  const caso3DivergenciaPersistente = {
    avaliacoes_humanas: [
      { competencias: { c1: 120, c2: 120, c3: 80, c4: 120, c5: 80 }, nota_total: 520 },
      { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 120 }, nota_total: 760 },
      { competencias: { c1: 200, c2: 200, c3: 200, c4: 200, c5: 200 }, nota_total: 1000 }
    ]
  };
  const ref = resolverReferenciaHumana(caso3DivergenciaPersistente);
  assert.equal(ref.resolvida, false);
  assert.equal(ref.status, 'pendente_banca');
  assert.equal(ref.competencias, null);
  assert.equal(ref.nota_total, null);
  assert.equal(ref.metodo_resolucao, 'divergencia_persistente_requer_banca');
  assert.equal(ref.discrepancia_detectada, true);
  pass('10. Terceiro avaliador divergente de ambos: classificado como pendente de banca presencial');
} catch (err) {
  fail('10. Terceiro avaliador divergente de ambos', err);
}

// 11. Terceiro avaliador compatível com ambos: média com o mais próximo no total
totalTestes++;
try {
  // Avaliador 1: 680 (120, 120, 160, 160, 120)
  // Avaliador 2: 800 (160, 160, 160, 160, 160) -> delta total 120 > 100 (discrepante!)
  // Avaliador 3: 760 (160, 160, 160, 160, 120)
  //   3 vs 1: delta total = 80 <= 100; todos deltas comp <= 40 <= 80 (compatível com 1)
  //   3 vs 2: delta total = 40 <= 100; todos deltas comp <= 40 <= 80 (compatível com 2)
  //   Mais próximo no total: avaliador 2 (|800 - 760| = 40 <= |680 - 760| = 80)
  const caso3CompativelAmbos = {
    avaliacoes_humanas: [
      { competencias: { c1: 120, c2: 120, c3: 160, c4: 160, c5: 120 }, nota_total: 680 },
      { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 },
      { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 120 }, nota_total: 760 }
    ]
  };
  const ref = resolverReferenciaHumana(caso3CompativelAmbos);
  assert.equal(ref.resolvida, true);
  assert.equal(ref.status, 'resolvida');
  assert.equal(ref.metodo_resolucao, 'terceiro_avaliador_com_avaliador_2');
  // Média entre 3 e 2: C1=(160+160)/2=160; C5=(120+160)/2=140; Total: 780
  assert.equal(ref.competencias.c1, 160);
  assert.equal(ref.competencias.c5, 140);
  assert.equal(ref.nota_total, 780);
  pass('11. Terceiro avaliador compatível com ambos: média calculada com o mais próximo em nota total');
} catch (err) {
  fail('11. Terceiro avaliador compatível com ambos', err);
}

// 12. Validação estrita de notas do 3º avaliador (rejeição de notas fora da escala ENEM)
totalTestes++;
try {
  const caso3ComNotaInvalida = {
    avaliacoes_humanas: [
      { competencias: { c1: 120, c2: 120, c3: 80, c4: 120, c5: 80 } },
      { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 120 } },
      { competencias: { c1: 150, c2: 160, c3: 120, c4: 160, c5: 120 } } // C1 = 150 inválido no ENEM
    ]
  };
  assert.throws(() => resolverReferenciaHumana(caso3ComNotaInvalida), /Avaliador #3.*não pertence aos incrementos de 40 pontos/);
  pass('12. Validação estrita do 3º avaliador: notas fora da escala ENEM são rejeitadas');
} catch (err) {
  fail('12. Validação do 3º avaliador', err);
}

// 13. Nota adjudicada total que não bate com a soma das competências (rejeição com erro descritivo)
totalTestes++;
try {
  const casoAdjudicadaInconsistente = {
    nota_adjudicada: {
      tipo: 'banca_consenso',
      competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, // soma = 800
      nota_total: 900 // inconsistente!
    }
  };
  assert.throws(
    () => resolverReferenciaHumana(casoAdjudicadaInconsistente),
    /Inconsistência na referência explícita: nota_total informada \(900\) não corresponde à soma das 5 competências \(800\)/
  );
  pass('13. Nota adjudicada total que não bate com as competências é rejeitada com mensagem clara');
} catch (err) {
  fail('13. Adjudicação com nota total inconsistente', err);
}

// 14. Caso válido de adjudicação (adotado como referência resolvida com precedência)
totalTestes++;
try {
  const casoAdjudicadaValida = {
    avaliacoes_humanas: [
      { competencias: { c1: 80, c2: 80, c3: 80, c4: 80, c5: 80 }, nota_total: 400 },
      { competencias: { c1: 200, c2: 200, c3: 200, c4: 200, c5: 200 }, nota_total: 1000 }
    ],
    nota_adjudicada: {
      tipo: 'consenso_banca_examinadora',
      competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 },
      nota_total: 800
    }
  };
  const ref = resolverReferenciaHumana(casoAdjudicadaValida);
  assert.equal(ref.resolvida, true);
  assert.equal(ref.status, 'resolvida');
  assert.equal(ref.metodo_resolucao, 'consenso_banca_examinadora');
  assert.equal(ref.nota_total, 800);
  assert.equal(ref.competencias.c1, 160);
  pass('14. Caso válido de adjudicação aceito como referência resolvida com precedência soberana');
} catch (err) {
  fail('14. Adjudicação válida', err);
}

// 15. Média provisória e casos pendentes excluídos das métricas de desempenho
totalTestes++;
try {
  const datasetMisto = {
    casos: [
      // Caso 1: Resolvido (IA 800 vs Ref 800)
      {
        id: 'caso-resolvido',
        tema: 'Tema 1',
        texto: 'Texto 1',
        avaliacoes_humanas: [
          { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 },
          { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 }
        ],
        correcao_ia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 }
      },
      // Caso 2: Pendente (2 avaliadores divergentes sem 3º avaliador)
      {
        id: 'caso-pendente-2-avals',
        tema: 'Tema 2',
        texto: 'Texto 2',
        avaliacoes_humanas: [
          { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 },
          { competencias: { c1: 160, c2: 40, c3: 160, c4: 160, c5: 160 }, nota_total: 680 }
        ],
        correcao_ia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 }
      },
      // Caso 3: Pendente (3 avaliadores divergentes de ambos)
      {
        id: 'caso-pendente-3-avals-persistente',
        tema: 'Tema 3',
        texto: 'Texto 3',
        avaliacoes_humanas: [
          { competencias: { c1: 120, c2: 120, c3: 80, c4: 120, c5: 80 }, nota_total: 520 },
          { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 120 }, nota_total: 760 },
          { competencias: { c1: 200, c2: 200, c3: 200, c4: 200, c5: 200 }, nota_total: 1000 }
        ],
        correcao_ia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 }
      }
    ]
  };

  const val = validarDatasetBenchmark(datasetMisto);
  assert.equal(val.casosValidos.length, 1);
  assert.equal(val.casosPendentes.length, 2);
  assert.equal(val.casosRejeitados.length, 0);

  // Calcula métricas sobre casosValidos
  const m = calcularMetricasBenchmark(val.casosValidos);
  assert.equal(m.quantidade_casos, 1);
  assert.equal(m.metricas_globais.mae_total, 0); // O único caso resolvido bate 800 com 800!

  // Se por erro alguém tentar passar todo o dataset com pendentes para calcularMetricasBenchmark, ela filtra:
  const todosOsCasos = [...val.casosValidos, ...val.casosPendentes.map(p => p.caso)];
  const mBlindada = calcularMetricasBenchmark(todosOsCasos);
  assert.equal(mBlindada.quantidade_casos, 1);
  assert.equal(mBlindada.metricas_globais.mae_total, 0);

  pass('15. Casos pendentes são estritamente excluídos do cálculo das métricas de desempenho');
} catch (err) {
  fail('15. Exclusão de casos pendentes das métricas', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 3: Cálculo das Métricas Estatísticas
// ─────────────────────────────────────────────────────────────────────────────

// 16. Cálculo exato de MAE, Viés, Exatidão e Faixa de ±40 pontos em dataset de controle
totalTestes++;
try {
  const casosControle = [
    {
      id: 'caso-A',
      referencia: { resolvida: true, competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 },
      correcao_ia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 }
    },
    {
      id: 'caso-B',
      referencia: { resolvida: true, competencias: { c1: 160, c2: 120, c3: 160, c4: 160, c5: 120 }, nota_total: 720 },
      correcao_ia: { competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 120 }, nota_total: 760 }
    },
    {
      id: 'caso-C',
      referencia: { resolvida: true, competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 140 }, nota_total: 780 },
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

  pass('16. Cálculo matemático exato de MAE, Viés, Exatidão e Faixa de ±40 pontos');
} catch (err) {
  fail('16. Cálculo de métricas', err);
}

// 17. Ranking de afastamento das competências por MAE decrescente
totalTestes++;
try {
  const casosRanking = [
    {
      id: 'r1',
      referencia: { resolvida: true, competencias: { c1: 160, c2: 160, c3: 160, c4: 160, c5: 160 }, nota_total: 800 },
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

  pass('17. Ranking de afastamento ordena competências da mais crítica para a mais alinhada');
} catch (err) {
  fail('17. Ranking de afastamento', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 4: Execução Offline e Integração Ponta a Ponta
// ─────────────────────────────────────────────────────────────────────────────

// 18. Execução ponta a ponta com o dataset de demonstração padrão
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

  pass('18. Execução ponta a ponta offline com dataset de demonstração e geração de relatórios');
} catch (err) {
  fail('18. Execução ponta a ponta', err);
}

// 19. Dataset vazio: rejeição e retorno amigável sem lançar exceção
totalTestes++;
try {
  const datasetVazio = { versao: '1.0', casos: [] };
  const res = validarDatasetBenchmark(datasetVazio);
  assert.equal(res.valido, false);
  const m = calcularMetricasBenchmark(res.casosValidos);
  assert.equal(m.quantidade_casos, 0);
  const relConsole = gerarRelatorioConsole({ resultadoValidacao: res, metricas: m });
  assert.equal(relConsole.includes('Nenhum caso com referência humana resolvida'), true);

  pass('19. Tratamento elegante de dataset vazio com mensagens informativas');
} catch (err) {
  fail('19. Dataset vazio', err);
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
