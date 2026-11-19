/**
 * benchmark/metrics.js — Motor de Métricas Estatísticas do Benchmark de Redação
 *
 * Responsabilidades:
 *  - Calcula o erro absoluto médio (MAE) da nota total e de cada competência (C1..C5).
 *  - Calcula o viés médio (Mean Signed Error / tendência de superestimar ou subestimar).
 *  - Calcula o percentual de exatidão (notas idênticas à referência).
 *  - Calcula o percentual de notas dentro da faixa de tolerância de 40 pontos por competência.
 *  - Calcula o percentual dentro da faixa de 80 pontos e a taxa de discrepâncias críticas.
 *  - Gera o ranking de afastamento das competências (da maior discrepância para a menor).
 *  - Diagnostica assimetrias e desvios para direcionar a calibração pedagógica.
 */

/**
 * Arredonda um número float para casas decimais especificadas.
 *
 * @param {number} valor
 * @param {number} [decimais=2]
 * @returns {number}
 */
export function arredondar(valor, decimais = 2) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 0;
  const fator = Math.pow(10, decimais);
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

/**
 * Nomes oficiais das 5 competências do ENEM.
 */
export const NOMES_COMPETENCIAS_ENEM = Object.freeze({
  c1: 'C1 — Domínio da norma culta',
  c2: 'C2 — Compreensão do tema e repertório',
  c3: 'C3 — Projeto de texto e argumentação',
  c4: 'C4 — Mecanismos coesivos',
  c5: 'C5 — Proposta de intervenção'
});

/**
 * Calcula todas as métricas comparativas entre as correções da IA e as referências humanas.
 *
 * @param {Array<object>} casosValidados - Array de casos retornados por validarCasoBenchmark
 * @returns {object} Objeto estruturado com todas as métricas globais e por competência
 */
export function calcularMetricasBenchmark(casosValidados) {
  const n = Array.isArray(casosValidados) ? casosValidados.length : 0;

  if (n === 0) {
    return {
      quantidade_casos: 0,
      metricas_globais: {
        mae_total: 0,
        vies_total: 0,
        exatidao_total_pct: 0,
        faixa_40_total_pct: 0,
        faixa_80_total_pct: 0,
        maior_desvio_positivo: 0,
        maior_desvio_negativo: 0
      },
      competencias: {
        c1: _criarMetricaVazia('c1'),
        c2: _criarMetricaVazia('c2'),
        c3: _criarMetricaVazia('c3'),
        c4: _criarMetricaVazia('c4'),
        c5: _criarMetricaVazia('c5')
      },
      ranking_afastamento: [],
      diagnostico_calibracao: 'Nenhum caso válido para cálculo de métricas.'
    };
  }

  // Acumuladores globais
  let somaAbsTotal = 0;
  let somaSignedTotal = 0;
  let exatosTotal = 0;
  let dentroFaixa40Total = 0;
  let dentroFaixa80Total = 0;
  let maxDesvioPosTotal = -Infinity;
  let maxDesvioNegTotal = Infinity;

  // Acumuladores por competência
  const acumuladoresComp = {
    c1: _criarAcumulador(),
    c2: _criarAcumulador(),
    c3: _criarAcumulador(),
    c4: _criarAcumulador(),
    c5: _criarAcumulador()
  };

  for (const caso of casosValidados) {
    const notaIaTotal = caso.correcao_ia.nota_total;
    const notaRefTotal = caso.referencia.nota_total;
    const diffTotal = notaIaTotal - notaRefTotal;
    const absDiffTotal = Math.abs(diffTotal);

    somaAbsTotal += absDiffTotal;
    somaSignedTotal += diffTotal;

    if (absDiffTotal === 0) exatosTotal++;
    if (absDiffTotal <= 40) dentroFaixa40Total++;
    if (absDiffTotal <= 80) dentroFaixa80Total++;

    if (diffTotal > maxDesvioPosTotal) maxDesvioPosTotal = diffTotal;
    if (diffTotal < maxDesvioNegTotal) maxDesvioNegTotal = diffTotal;

    // Métricas por competência
    for (let i = 1; i <= 5; i++) {
      const chave = `c${i}`;
      const notaIaComp = caso.correcao_ia.competencias[chave];
      const notaRefComp = caso.referencia.competencias[chave];
      const diffComp = notaIaComp - notaRefComp;
      const absDiffComp = Math.abs(diffComp);

      const ac = acumuladoresComp[chave];
      ac.somaAbs += absDiffComp;
      ac.somaSigned += diffComp;
      ac.erros.push(diffComp);

      if (absDiffComp === 0) ac.exatos++;
      if (absDiffComp <= 40) ac.faixa40++;
      if (absDiffComp <= 80) ac.faixa80++;
      if (absDiffComp > 80) ac.discrepanciasCriticas++;

      if (diffComp > ac.maxPos) ac.maxPos = diffComp;
      if (diffComp < ac.maxNeg) ac.maxNeg = diffComp;
    }
  }

  // Consolidação por competência
  const metricasComp = {};
  const listaParaRanking = [];

  for (let i = 1; i <= 5; i++) {
    const chave = `c${i}`;
    const ac = acumuladoresComp[chave];
    const mae = ac.somaAbs / n;
    const vies = ac.somaSigned / n;
    const exatidaoPct = (ac.exatos / n) * 100;
    const faixa40Pct = (ac.faixa40 / n) * 100;
    const faixa80Pct = (ac.faixa80 / n) * 100;
    const discrepanciasCriticasPct = (ac.discrepanciasCriticas / n) * 100;

    // Desvio padrão dos erros
    const variancia = ac.erros.reduce((acc, err) => acc + Math.pow(err - vies, 2), 0) / (n > 1 ? n - 1 : 1);
    const desvioPadrao = Math.sqrt(variancia);

    metricasComp[chave] = {
      chave,
      numero: i,
      nome: NOMES_COMPETENCIAS_ENEM[chave],
      mae: arredondar(mae, 2),
      vies: arredondar(vies, 2),
      tendencia: vies > 2 ? 'superestima' : vies < -2 ? 'subestima' : 'neutro',
      exatidao_pct: arredondar(exatidaoPct, 1),
      faixa_40_pct: arredondar(faixa40Pct, 1),
      faixa_80_pct: arredondar(faixa80Pct, 1),
      discrepancias_criticas_pct: arredondar(discrepanciasCriticasPct, 1),
      discrepancias_criticas_qtd: ac.discrepanciasCriticas,
      maior_desvio_positivo: ac.maxPos === -Infinity ? 0 : ac.maxPos,
      maior_desvio_negativo: ac.maxNeg === Infinity ? 0 : ac.maxNeg,
      desvio_padrao: arredondar(desvioPadrao, 2),
      casos_exatos: ac.exatos,
      casos_faixa_40: ac.faixa40
    };

    listaParaRanking.push({
      chave,
      numero: i,
      nome: NOMES_COMPETENCIAS_ENEM[chave],
      mae: arredondar(mae, 2),
      vies: arredondar(vies, 2),
      faixa_40_pct: arredondar(faixa40Pct, 1),
      exatidao_pct: arredondar(exatidaoPct, 1)
    });
  }

  // Ordena ranking por MAE decrescente (maior erro primeiro)
  listaParaRanking.sort((a, b) => {
    if (b.mae !== a.mae) return b.mae - a.mae;
    return a.faixa_40_pct - b.faixa_40_pct; // Desempate: menor % na faixa de 40 pts é mais crítica
  });

  // Métricas globais
  const maeTotal = somaAbsTotal / n;
  const viesTotal = somaSignedTotal / n;
  const exatidaoTotalPct = (exatosTotal / n) * 100;
  const faixa40TotalPct = (dentroFaixa40Total / n) * 100;
  const faixa80TotalPct = (dentroFaixa80Total / n) * 100;

  // Diagnóstico textual de calibração
  const diagnostico = _gerarDiagnosticoTexto(listaParaRanking, metricasComp, maeTotal, viesTotal);

  return {
    quantidade_casos: n,
    metricas_globais: {
      mae_total: arredondar(maeTotal, 2),
      vies_total: arredondar(viesTotal, 2),
      tendencia_geral: viesTotal > 5 ? 'superestimação' : viesTotal < -5 ? 'subestimação' : 'equilibrada',
      exatidao_total_pct: arredondar(exatidaoTotalPct, 1),
      faixa_40_total_pct: arredondar(faixa40TotalPct, 1),
      faixa_80_total_pct: arredondar(faixa80TotalPct, 1),
      casos_exatos: exatosTotal,
      casos_faixa_40: dentroFaixa40Total,
      maior_desvio_positivo: maxDesvioPosTotal === -Infinity ? 0 : maxDesvioPosTotal,
      maior_desvio_negativo: maxDesvioNegTotal === Infinity ? 0 : maxDesvioNegTotal
    },
    competencias: metricasComp,
    ranking_afastamento: listaParaRanking,
    diagnostico_calibracao: diagnostico
  };
}

/**
 * Cria um acumulador numérico para uma competência.
 */
function _criarAcumulador() {
  return {
    somaAbs: 0,
    somaSigned: 0,
    erros: [],
    exatos: 0,
    faixa40: 0,
    faixa80: 0,
    discrepanciasCriticas: 0,
    maxPos: -Infinity,
    maxNeg: Infinity
  };
}

/**
 * Cria a estrutura vazia de métricas para quando não há casos.
 */
function _criarMetricaVazia(chave) {
  const i = Number(chave.replace('c', ''));
  return {
    chave,
    numero: i,
    nome: NOMES_COMPETENCIAS_ENEM[chave],
    mae: 0,
    vies: 0,
    tendencia: 'neutro',
    exatidao_pct: 0,
    faixa_40_pct: 0,
    faixa_80_pct: 0,
    discrepancias_criticas_pct: 0,
    discrepancias_criticas_qtd: 0,
    maior_desvio_positivo: 0,
    maior_desvio_negativo: 0,
    desvio_padrao: 0,
    casos_exatos: 0,
    casos_faixa_40: 0
  };
}

/**
 * Gera um diagnóstico qualitativo dos pontos prioritários de calibração.
 */
function _gerarDiagnosticoTexto(ranking, metricasComp, maeTotal, viesTotal) {
  if (ranking.length === 0) return 'Sem dados suficientes.';

  const maisCritica = ranking[0];
  const segundaMaisCritica = ranking[1];
  const menosCritica = ranking[ranking.length - 1];

  const partes = [];

  partes.push(
    `A IA apresenta erro absoluto médio (MAE) total de ${arredondar(maeTotal, 1)} pts com tendência global de ${
      viesTotal > 0 ? `superestimação (+${arredondar(viesTotal, 1)} pts)` : viesTotal < 0 ? `subestimação (${arredondar(viesTotal, 1)} pts)` : 'equilíbrio (0 pts)'
    }.`
  );

  partes.push(
    `A competência com maior afastamento é ${maisCritica.nome} (MAE = ${maisCritica.mae} pts, ${maisCritica.faixa_40_pct}% dentro de ±40 pts, viés: ${maisCritica.vies > 0 ? '+' : ''}${maisCritica.vies} pts).`
  );

  if (segundaMaisCritica && segundaMaisCritica.mae > 0) {
    partes.push(
      `Em segundo lugar em afastamento está ${segundaMaisCritica.nome} (MAE = ${segundaMaisCritica.mae} pts).`
    );
  }

  partes.push(
    `A competência mais alinhada com a referência humana é ${menosCritica.nome} (MAE = ${menosCritica.mae} pts, ${menosCritica.exatidao_pct}% de acertos exatos).`
  );

  return partes.join(' ');
}
