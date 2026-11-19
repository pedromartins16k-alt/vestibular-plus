/**
 * benchmark/reporter.js — Gerador de Relatórios Legíveis do Benchmark
 *
 * Responsabilidades:
 *  - Formata o relatório para exibição clara no terminal (stdout).
 *  - Gera relatório estruturado em formato Markdown.
 *  - Destaca o ranking de competências onde a IA mais se afasta da referência humana.
 *  - Apresenta alertas para casos rejeitados ou dados inválidos.
 *  - Apresenta seção explícita para casos pendentes de adjudicação/banca humana.
 *  - Esclarece o papel da métrica operacional de ±40 pontos na nota total.
 */

import { NOMES_COMPETENCIAS_ENEM } from './metrics.js';

/**
 * Gera o relatório formatado em texto para o console do terminal.
 *
 * @param {object} params
 * @param {object} params.resultadoValidacao - Objeto retornado por validarDatasetBenchmark
 * @param {object} params.metricas - Objeto retornado por calcularMetricasBenchmark
 * @param {string} [params.origem='arquivo'] - Descrição da fonte de dados
 * @returns {string} Texto formatado para o console
 */
export function gerarRelatorioConsole({ resultadoValidacao, metricas, origem = 'arquivo' }) {
  const linhas = [];
  const div = '═'.repeat(74);
  const subDiv = '─'.repeat(74);

  linhas.push('');
  linhas.push(div);
  linhas.push('       📊 RELATÓRIO DE BENCHMARK: CORRETOR IA vs. AVALIAÇÃO HUMANA (ENEM)');
  linhas.push(div);

  const meta = resultadoValidacao?.metadados || {};
  if (meta.eh_demonstracao) {
    linhas.push('  ⚠️  ATENÇÃO: CONJUNTO DE DEMONSTRAÇÃO TÉCNICA / SINTÉTICO');
    linhas.push('      Este teste utiliza dados sintéticos de validação e não avaliações reais.');
  }

  const qtdValidos = metricas.quantidade_casos;
  const qtdPendentes = resultadoValidacao?.casosPendentes?.length || 0;
  const qtdRejeitados = resultadoValidacao?.casosRejeitados?.length || 0;
  const totalAnalisados = qtdValidos + qtdPendentes + qtdRejeitados;

  linhas.push(`  Origem dos dados: ${origem}`);
  linhas.push(`  Total de registros analisados: ${totalAnalisados}`);
  linhas.push(`  Casos válidos (resolvidos): ${qtdValidos}`);
  linhas.push(`  Casos pendentes de banca/adjudicação: ${qtdPendentes}`);
  linhas.push(`  Casos rejeitados/inválidos: ${qtdRejeitados}`);
  linhas.push(subDiv);

  if (qtdValidos === 0) {
    linhas.push('  ❌ Nenhum caso com referência humana resolvida foi encontrado para o cálculo.');
    if (qtdPendentes > 0) {
      linhas.push('\n  Casos pendentes de adjudicação/banca examinadora:');
      resultadoValidacao.casosPendentes.forEach(pen => {
        linhas.push(`    • [${pen.id}] (${pen.status}): ${pen.motivos?.join(' | ') || pen.avisos?.join(' | ') || pen.metodo_resolucao}`);
      });
    }
    if (qtdRejeitados > 0) {
      linhas.push('\n  Diagnóstico dos registros rejeitados:');
      resultadoValidacao.casosRejeitados.forEach(rej => {
        linhas.push(`    • [${rej.id}]: ${rej.erros.join(' | ')}`);
      });
    }
    linhas.push(div);
    return linhas.join('\n');
  }

  // 1. Resumo da Nota Total
  const glob = metricas.metricas_globais;
  linhas.push('  📌 DESEMPENHO NA NOTA TOTAL (0 a 1000 pontos):');
  linhas.push(`     • Erro Absoluto Médio (MAE Total):   ${glob.mae_total.toFixed(2)} pts`);
  linhas.push(`     • Viés Médio (Tendência):            ${glob.vies_total > 0 ? '+' : ''}${glob.vies_total.toFixed(2)} pts (${glob.tendencia_geral})`);
  linhas.push(`     • Exatidão (Nota IA == Humana):      ${glob.exatidao_total_pct.toFixed(1)}% (${glob.casos_exatos}/${qtdValidos} casos)`);
  linhas.push(`     • Na faixa de ±40 pontos (tolerância):${glob.faixa_40_total_pct.toFixed(1)}% (${glob.casos_faixa_40}/${qtdValidos} casos)`);
  linhas.push('       ↳ Nota metodológica: A faixa de ±40 pontos na nota total é uma métrica operacional');
  linhas.push('         de proximidade escolhida para o benchmark; não representa equivalência pedagógica estrita.');
  linhas.push(`     • Maior desvio positivo (IA > Ref):  +${glob.maior_desvio_positivo} pts`);
  linhas.push(`     • Maior desvio negativo (IA < Ref):  ${glob.maior_desvio_negativo} pts`);
  linhas.push(subDiv);

  // 2. Ranking de Afastamento por Competência
  linhas.push('  🚨 RANKING DE AFASTAMENTO DA IA (Da maior discrepância para a menor):');
  metricas.ranking_afastamento.forEach((r, idx) => {
    const medalha = idx === 0 ? '🔴 1º (Mais crítico)' : idx === 1 ? '🟠 2º' : idx === 2 ? '🟡 3º' : idx === 3 ? '🟢 4º' : '✅ 5º (Mais próximo)';
    const tendenciaStr = r.vies > 0 ? `superestima +${r.vies}` : r.vies < 0 ? `subestima ${r.vies}` : 'equilibrado';
    linhas.push(`     ${medalha.padEnd(23)} | ${r.nome.padEnd(36)} | MAE: ${String(r.mae.toFixed(1) + ' pts').padEnd(9)} | ±40pts: ${r.faixa_40_pct}% | (${tendenciaStr})`);
  });
  linhas.push(subDiv);

  // 3. Tabela Detalhada por Competência
  linhas.push('  📋 DETALHAMENTO POR COMPETÊNCIA (Escala oficial 0 a 200 pontos):');
  linhas.push('  Comp. | MAE (pts) | Viés Médio | Exatidão % | Na faixa ±40 | Na faixa ±80 | Críticos (>80)');
  linhas.push('  ' + '-'.repeat(72));

  for (let i = 1; i <= 5; i++) {
    const c = metricas.competencias[`c${i}`];
    const compRotulo = `C${i}`.padEnd(5);
    const maeStr = `${c.mae.toFixed(1)}`.padStart(8) + ' ';
    const viesStr = `${c.vies > 0 ? '+' : ''}${c.vies.toFixed(1)}`.padStart(10) + ' ';
    const exatStr = `${c.exatidao_pct.toFixed(1)}%`.padStart(10) + ' ';
    const f40Str = `${c.faixa_40_pct.toFixed(1)}%`.padStart(12) + ' ';
    const f80Str = `${c.faixa_80_pct.toFixed(1)}%`.padStart(12) + ' ';
    const critStr = `${c.discrepancias_criticas_qtd} (${c.discrepancias_criticas_pct.toFixed(1)}%)`.padStart(14);
    linhas.push(`  ${compRotulo} |${maeStr}|${viesStr}|${exatStr}|${f40Str}|${f80Str}|${critStr}`);
  }
  linhas.push(subDiv);

  // 4. Diagnóstico Textual
  linhas.push('  💡 SÍNTESE DIAGNÓSTICA PARA CALIBRAÇÃO:');
  linhas.push(`     ${metricas.diagnostico_calibracao}`);
  linhas.push(subDiv);

  // 5. Casos Pendentes de Adjudicação / Banca (se houver)
  if (qtdPendentes > 0) {
    linhas.push('  ⏳ REGISTROS PENDENTES DE BANCA / ADJUDICAÇÃO (Excluídos do cálculo):');
    resultadoValidacao.casosPendentes.forEach(pen => {
      linhas.push(`     • [${pen.id}] (${pen.status}):`);
      if (pen.motivos && pen.motivos.length > 0) {
        pen.motivos.forEach(m => linhas.push(`       - ${m}`));
      } else if (pen.avisos && pen.avisos.length > 0) {
        pen.avisos.forEach(a => linhas.push(`       - ${a}`));
      }
    });
    linhas.push(subDiv);
  }

  // 6. Casos Rejeitados (se houver)
  if (qtdRejeitados > 0) {
    linhas.push('  ⚠️  REGISTROS REJEITADOS NESTA EXECUÇÃO:');
    resultadoValidacao.casosRejeitados.forEach(rej => {
      linhas.push(`     • [${rej.id}]:`);
      rej.erros.forEach(e => linhas.push(`       - ${e}`));
    });
    linhas.push(subDiv);
  }

  linhas.push('  🔒 PRIVACIDADE: Este benchmark operou 100% offline sem conexões externas.');
  linhas.push(div);
  linhas.push('');

  return linhas.join('\n');
}

/**
 * Gera o relatório formatado em Markdown para documentação ou exportação.
 *
 * @param {object} params
 * @param {object} params.resultadoValidacao
 * @param {object} params.metricas
 * @param {string} [params.origem='arquivo']
 * @returns {string} Documento Markdown
 */
export function gerarRelatorioMarkdown({ resultadoValidacao, metricas, origem = 'arquivo' }) {
  const linhas = [];
  const glob = metricas.metricas_globais;
  const meta = resultadoValidacao?.metadados || {};

  const qtdValidos = metricas.quantidade_casos;
  const qtdPendentes = resultadoValidacao?.casosPendentes?.length || 0;
  const qtdRejeitados = resultadoValidacao?.casosRejeitados?.length || 0;
  const totalAnalisados = qtdValidos + qtdPendentes + qtdRejeitados;

  linhas.push('# Relatório de Benchmark: Corretor IA vs. Avaliações Humanas (ENEM)\n');

  if (meta.eh_demonstracao) {
    linhas.push('> [!WARNING]');
    linhas.push('> **Aviso de Demonstração Técnica:** Este relatório foi gerado a partir de um conjunto de dados sintético/demonstrativo para validação do pipeline do benchmark. Não representa avaliações humanas reais de especialistas.\n');
  }

  linhas.push('## Metadados da Execução\n');
  linhas.push(`- **Data e Hora:** ${new Date().toISOString()}`);
  linhas.push(`- **Origem dos Dados:** \`${origem}\``);
  linhas.push(`- **Total de Registros Analisados:** ${totalAnalisados}`);
  linhas.push(`- **Casos Válidos (Resolvidos):** ${qtdValidos}`);
  linhas.push(`- **Casos Pendentes de Banca/Adjudicação:** ${qtdPendentes}`);
  linhas.push(`- **Casos Rejeitados:** ${qtdRejeitados}`);
  linhas.push(`- **Modo:** 100% Offline (sem chamadas a provedores de IA ou segredos)\n`);

  if (qtdValidos === 0) {
    linhas.push('> [!CAUTION]\n> Nenhum registro com referência humana resolvida disponível para comparação.\n');
    return linhas.join('\n');
  }

  linhas.push('## Desempenho Global (Nota Total — 0 a 1000 pontos)\n');
  linhas.push('| Métrica | Valor | Observação |');
  linhas.push('|---|---|---|');
  linhas.push(`| **Erro Absoluto Médio (MAE Total)** | **${glob.mae_total.toFixed(2)} pts** | Média de distância absoluta em relação à referência |`);
  linhas.push(`| **Viés Médio Total** | **${glob.vies_total > 0 ? '+' : ''}${glob.vies_total.toFixed(2)} pts** | Tendência geral de ${glob.tendencia_geral} |`);
  linhas.push(`| **Exatidão Exata (IA == Humano)** | **${glob.exatidao_total_pct.toFixed(1)}%** | ${glob.casos_exatos} de ${qtdValidos} redações |`);
  linhas.push(`| **Na Faixa de ±40 pontos (Tolerância)** | **${glob.faixa_40_total_pct.toFixed(1)}%** | ${glob.casos_faixa_40} de ${qtdValidos} redações (métrica operacional; não garante equivalência pedagógica) |`);
  linhas.push(`| **Maior Desvio Positivo** | **+${glob.maior_desvio_positivo} pts** | Caso com maior sobrestimação |`);
  linhas.push(`| **Maior Desvio Negativo** | **${glob.maior_desvio_negativo} pts** | Caso com maior subestimação |\n`);

  linhas.push('## Ranking de Afastamento por Competência\n');
  linhas.push('Competências ordenadas da maior discrepância média (MAE) para a menor:\n');
  linhas.push('| Posição | Competência | MAE (pts) | Viés (pts) | Na Faixa ±40 | Exatidão % | Prioridade de Calibração |');
  linhas.push('|---|---|---|---|---|---|---|');

  metricas.ranking_afastamento.forEach((r, idx) => {
    const prioridade = idx === 0 ? '🔴 Alta (Mais divergente)' : idx === 1 ? '🟠 Média-Alta' : idx === 2 ? '🟡 Média' : '🟢 Baixa (Mais alinhada)';
    linhas.push(`| ${idx + 1}º | **${r.nome}** | ${r.mae.toFixed(1)} | ${r.vies > 0 ? '+' : ''}${r.vies.toFixed(1)} | ${r.faixa_40_pct}% | ${r.exatidao_pct}% | ${prioridade} |`);
  });
  linhas.push('');

  linhas.push('## Detalhamento Completo por Competência (0 a 200 pontos)\n');
  linhas.push('| Competência | MAE (pts) | Viés Médio | Exatidão % | Na Faixa ±40 % | Na Faixa ±80 % | Discrepâncias Críticas (>80 pts) | Desvio Padrão |');
  linhas.push('|---|---|---|---|---|---|---|---|');

  for (let i = 1; i <= 5; i++) {
    const c = metricas.competencias[`c${i}`];
    linhas.push(`| **C${i}: ${NOMES_COMPETENCIAS_ENEM[`c${i}`].split(' — ')[1]}** | ${c.mae.toFixed(1)} | ${c.vies > 0 ? '+' : ''}${c.vies.toFixed(1)} | ${c.exatidao_pct}% | ${c.faixa_40_pct}% | ${c.faixa_80_pct}% | ${c.discrepancias_criticas_qtd} (${c.discrepancias_criticas_pct}%) | ${c.desvio_padrao.toFixed(1)} |`);
  }
  linhas.push('');

  linhas.push('## Síntese Diagnóstica\n');
  linhas.push(`> [!NOTE]\n> ${metricas.diagnostico_calibracao}\n`);

  if (qtdPendentes > 0) {
    linhas.push('## Casos Pendentes de Banca / Adjudicação (Excluídos do Cálculo)\n');
    resultadoValidacao.casosPendentes.forEach(pen => {
      linhas.push(`- **Caso \`${pen.id}\`** (${pen.status}):`);
      if (pen.motivos && pen.motivos.length > 0) {
        pen.motivos.forEach(m => linhas.push(`  - ${m}`));
      } else if (pen.avisos && pen.avisos.length > 0) {
        pen.avisos.forEach(a => linhas.push(`  - ${a}`));
      }
    });
    linhas.push('');
  }

  if (qtdRejeitados > 0) {
    linhas.push('## Casos Rejeitados na Validação\n');
    resultadoValidacao.casosRejeitados.forEach(rej => {
      linhas.push(`- **Caso \`${rej.id}\`** (linha ${rej.indice + 1}):`);
      rej.erros.forEach(e => linhas.push(`  - ${e}`));
    });
    linhas.push('');
  }

  linhas.push('---');
  linhas.push('*Relatório gerado pelo pipeline de benchmark de calibração do Vestibular+.*');

  return linhas.join('\n');
}
