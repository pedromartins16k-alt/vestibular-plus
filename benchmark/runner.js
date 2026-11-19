#!/usr/bin/env node
/**
 * benchmark/runner.js — Executor Offline do Benchmark ENEM
 *
 * Uso via linha de comando:
 *   node benchmark/runner.js [caminho-do-dataset.json] [--output relatorio.md]
 *
 * Características:
 *  - 100% offline: sem dependência de rede, APIs externas ou credenciais.
 *  - Rejeita dados corrompidos com mensagens descritivas.
 *  - Gera relatório no terminal e opcionalmente em arquivo Markdown.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validarDatasetBenchmark } from './schema.js';
import { calcularMetricasBenchmark } from './metrics.js';
import { gerarRelatorioConsole, gerarRelatorioMarkdown } from './reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATASET_DEMO_PADRAO = path.resolve(__dirname, 'data/dataset-demonstracao-enem.json');

/**
 * Executa o benchmark offline para um conjunto de dados JSON ou arquivo.
 *
 * @param {string|object|Array} entrada - Caminho para arquivo JSON ou objeto do dataset
 * @param {object} [opcoes={}]
 * @param {string} [opcoes.caminhoSaidaMarkdown] - Caminho para salvar relatório em Markdown
 * @param {boolean} [opcoes.silencioso=false] - Se true, não imprime no console
 * @returns {{
 *   valido: boolean,
 *   resultadoValidacao: object,
 *   metricas: object,
 *   relatorioConsole: string,
 *   relatorioMarkdown: string
 * }}
 */
export function executarBenchmark(entrada, opcoes = {}) {
  let datasetRaw = null;
  let origem = 'objeto_memoria';

  if (typeof entrada === 'string') {
    origem = entrada;
    const caminhoResolvido = path.resolve(process.cwd(), entrada);
    if (!fs.existsSync(caminhoResolvido)) {
      throw new Error(`Arquivo de dataset não encontrado: ${caminhoResolvido}`);
    }
    const conteudo = fs.readFileSync(caminhoResolvido, 'utf8');
    try {
      datasetRaw = JSON.parse(conteudo);
    } catch (errJson) {
      throw new Error(`Falha ao ler JSON de "${entrada}": ${errJson.message}`);
    }
  } else if (typeof entrada === 'object' && entrada !== null) {
    datasetRaw = entrada;
  } else {
    throw new Error('Entrada inválida para o benchmark. Forneça o caminho do arquivo JSON ou o objeto de dados.');
  }

  // 1. Validação de formato e resolução de avaliações humanas
  const resultadoValidacao = validarDatasetBenchmark(datasetRaw);

  // 2. Cálculo das métricas comparativas
  const metricas = calcularMetricasBenchmark(resultadoValidacao.casosValidos);

  // 3. Geração dos relatórios
  const relatorioConsole = gerarRelatorioConsole({ resultadoValidacao, metricas, origem });
  const relatorioMarkdown = gerarRelatorioMarkdown({ resultadoValidacao, metricas, origem });

  if (!opcoes.silencioso) {
    console.log(relatorioConsole);
  }

  // 4. Gravação opcional do relatório em Markdown
  if (opcoes.caminhoSaidaMarkdown) {
    const caminhoDestino = path.resolve(process.cwd(), opcoes.caminhoSaidaMarkdown);
    const pastaDestino = path.dirname(caminhoDestino);
    if (!fs.existsSync(pastaDestino)) {
      fs.mkdirSync(pastaDestino, { recursive: true });
    }
    fs.writeFileSync(caminhoDestino, relatorioMarkdown, 'utf8');
    if (!opcoes.silencioso) {
      console.log(`📄 Relatório Markdown salvo com sucesso em: ${caminhoDestino}\n`);
    }
  }

  return {
    valido: resultadoValidacao.valido,
    resultadoValidacao,
    metricas,
    relatorioConsole,
    relatorioMarkdown
  };
}

// Execução via linha de comando (CLI)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = process.argv.slice(2);
    let arquivoDataset = DATASET_DEMO_PADRAO;
    let caminhoSaidaMarkdown = null;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--output' || args[i] === '-o') {
        caminhoSaidaMarkdown = args[i + 1] || null;
        i++;
      } else if (!args[i].startsWith('-')) {
        arquivoDataset = args[i];
      }
    }

    const resultado = executarBenchmark(arquivoDataset, { caminhoSaidaMarkdown });

    if (!resultado.valido) {
      console.error('⚠️  Benchmark concluído com advertências (nenhum caso válido ou dados corrompidos).');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\n❌ Erro na execução do benchmark:', err.message);
    process.exitCode = 1;
  }
}
