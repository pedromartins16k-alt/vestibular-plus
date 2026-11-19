/**
 * benchmark/schema.js — Validador de Schema e Resolução de Divergências do ENEM
 *
 * Responsabilidades:
 *  - Valida a estrutura dos dados de entrada do benchmark (redações, avaliações humanas e correções da IA).
 *  - Valida conformidade estrita com a escala oficial do ENEM (0, 40, 80, 120, 160, 200 por competência).
 *  - Implementa a resolução técnica de divergências entre múltiplos avaliadores humanos
 *    segundo as regras oficiais do INEP (média simples, 3º corretor, e precedência da nota adjudicada/consenso).
 *  - Rejeita registros corrompidos ou incompletos com mensagens claras e diagnósticas.
 *  - Execução 100% offline, pura e determinística.
 */

export const INCREMENTOS_ENEM = Object.freeze([0, 40, 80, 120, 160, 200]);
export const PONTUACAO_MAXIMA_ENEM = 1000;
export const PESO_COMPETENCIA_ENEM = 200;
export const NUMERO_COMPETENCIAS_ENEM = 5;

// Critérios oficiais de discrepância do INEP:
//  - Mais de 100 pontos de diferença na nota total entre avaliadores; OU
//  - Mais de 80 pontos de diferença em qualquer uma das 5 competências.
export const LIMITE_DISCREPANCIA_TOTAL_INEP = 100;
export const LIMITE_DISCREPANCIA_COMP_INEP = 80;

/**
 * Normaliza o formato de competências para um objeto uniforme { c1, c2, c3, c4, c5 }.
 * Aceita tanto objeto `{ c1: 160, ... }` ou `{ 1: 160, ... }`, quanto array `[{ numero: 1, nota: 160 }, ...]`.
 *
 * @param {object|Array} competenciasRaw
 * @returns {{ c1: number, c2: number, c3: number, c4: number, c5: number }}
 */
export function normalizarCompetencias(competenciasRaw) {
  if (!competenciasRaw) {
    throw new Error('Campo de competências ausente ou nulo.');
  }

  const mapa = {};

  if (Array.isArray(competenciasRaw)) {
    if (competenciasRaw.length < NUMERO_COMPETENCIAS_ENEM) {
      throw new Error(`Array de competências incompleto: recebido ${competenciasRaw.length}, esperado ${NUMERO_COMPETENCIAS_ENEM}.`);
    }
    for (const item of competenciasRaw) {
      if (!item || typeof item !== 'object') {
        throw new Error('Item de competência inválido no array.');
      }
      const num = Number(item.numero ?? item.comp ?? item.id);
      if (!Number.isInteger(num) || num < 1 || num > 5) {
        throw new Error(`Número de competência inválido: ${num}. Deve ser um inteiro de 1 a 5.`);
      }
      if (typeof item.nota !== 'number' || !Number.isFinite(item.nota)) {
        throw new Error(`Nota inválida para competência C${num}: ${item.nota}`);
      }
      mapa[`c${num}`] = item.nota;
    }
  } else if (typeof competenciasRaw === 'object') {
    for (let i = 1; i <= 5; i++) {
      const val = competenciasRaw[`c${i}`] ?? competenciasRaw[`C${i}`] ?? competenciasRaw[i] ?? competenciasRaw[String(i)];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new Error(`Nota da competência C${i} ausente ou não numérica.`);
      }
      mapa[`c${i}`] = val;
    }
  } else {
    throw new Error('Formato inválido de competências (deve ser objeto ou array).');
  }

  // Confirma que todas as 5 competências estão presentes
  for (let i = 1; i <= 5; i++) {
    if (typeof mapa[`c${i}`] !== 'number') {
      throw new Error(`Competência C${i} ausente no mapeamento.`);
    }
  }

  return {
    c1: mapa.c1,
    c2: mapa.c2,
    c3: mapa.c3,
    c4: mapa.c4,
    c5: mapa.c5
  };
}

/**
 * Valida se as notas de um avaliador individual seguem os incrementos oficiais do ENEM.
 *
 * @param {{ c1: number, c2: number, c3: number, c4: number, c5: number }} comps
 * @param {boolean} [permitirMedias=false] - Se true, permite valores intermediários (ex: 140, 100) resultantes de médias.
 * @returns {{ valido: boolean, erros: string[] }}
 */
export function validarNotasEnem(comps, permitirMedias = false) {
  const erros = [];
  for (let i = 1; i <= 5; i++) {
    const nota = comps[`c${i}`];
    if (typeof nota !== 'number' || !Number.isFinite(nota)) {
      erros.push(`C${i}: nota não numérica (${nota})`);
      continue;
    }
    if (nota < 0 || nota > PESO_COMPETENCIA_ENEM) {
      erros.push(`C${i}: nota fora do limite [0, 200] (${nota})`);
      continue;
    }
    if (!permitirMedias) {
      if (!INCREMENTOS_ENEM.includes(nota)) {
        erros.push(`C${i}: nota ${nota} não pertence aos incrementos de 40 pontos do ENEM (0, 40, 80, 120, 160, 200).`);
      }
    } else {
      if (nota % 10 !== 0 && nota % 5 !== 0) {
        erros.push(`C${i}: nota de média fracionária incomum (${nota}).`);
      }
    }
  }
  return { valido: erros.length === 0, erros };
}

/**
 * Verifica se dois conjuntos de competências apresentam discrepância segundo a norma do INEP:
 *  - Diferença total > 100; OU
 *  - Qualquer competência com diferença > 80.
 *
 * @param {{ c1: number, c2: number, c3: number, c4: number, c5: number }} cA
 * @param {{ c1: number, c2: number, c3: number, c4: number, c5: number }} cB
 * @returns {{ discrepante: boolean, deltaTotal: number, deltasComp: object, motivos: string[] }}
 */
export function verificarDiscrepanciaEntreAvaliadores(cA, cB) {
  const totalA = cA.c1 + cA.c2 + cA.c3 + cA.c4 + cA.c5;
  const totalB = cB.c1 + cB.c2 + cB.c3 + cB.c4 + cB.c5;
  const deltaTotal = Math.abs(totalA - totalB);
  const deltasComp = {};
  const motivos = [];

  let compDiscrepante = false;
  for (let i = 1; i <= 5; i++) {
    const d = Math.abs(cA[`c${i}`] - cB[`c${i}`]);
    deltasComp[`c${i}`] = d;
    if (d > LIMITE_DISCREPANCIA_COMP_INEP) {
      compDiscrepante = true;
      motivos.push(`C${i} divergente: diferença de ${d} pontos (> ${LIMITE_DISCREPANCIA_COMP_INEP} pts)`);
    }
  }

  const totalDiscrepante = deltaTotal > LIMITE_DISCREPANCIA_TOTAL_INEP;
  if (totalDiscrepante) {
    motivos.push(`Nota total divergente: diferença de ${deltaTotal} pontos (> ${LIMITE_DISCREPANCIA_TOTAL_INEP} pts)`);
  }

  return {
    discrepante: totalDiscrepante || compDiscrepante,
    deltaTotal,
    deltasComp,
    motivos
  };
}

/**
 * Resolve a nota humana de referência a partir dos dados do caso.
 *
 * Hierarquia de resolução:
 * 1. Se `referencia` explícita ou `nota_adjudicada`/`nota_consenso` for informada, utiliza-a diretamente.
 * 2. Se houver 1 único avaliador, utiliza suas notas como referência (com flag de avaliador único).
 * 3. Se houver 2 avaliadores:
 *    - Se não houver discrepância (delta total <= 100 e delta comp <= 80): calcula a média aritmética.
 *    - Se houver discrepância: se houver 3º avaliador, aplica a regra do INEP (média entre o 3º e o mais próximo).
 *    - Se não houver 3º avaliador nem consenso: sinaliza divergência pendente de adjudicação e usa média provisória.
 * 4. Se houver mais de 2 avaliadores sem indicação formal, calcula a média com aviso.
 *
 * @param {object} caso
 * @returns {{
 *   competencias: { c1: number, c2: number, c3: number, c4: number, c5: number },
 *   nota_total: number,
 *   metodo_resolucao: string,
 *   discrepancia_detectada: boolean,
 *   avisos: string[]
 * }}
 */
export function resolverReferenciaHumana(caso) {
  const avisos = [];

  // 1. Nota de referência explícita pré-definida (consenso, banca ou adjudicação)
  const refExplicita = caso.referencia || caso.nota_consenso || caso.nota_adjudicada;
  if (refExplicita) {
    const rawComps = refExplicita.competencias ?? refExplicita;
    const comps = normalizarCompetencias(rawComps);
    const validacao = validarNotasEnem(comps, true);
    if (!validacao.valido) {
      throw new Error(`Referência explícita inválida: ${validacao.erros.join('; ')}`);
    }
    const notaTotal = typeof refExplicita.nota_total === 'number'
      ? refExplicita.nota_total
      : (comps.c1 + comps.c2 + comps.c3 + comps.c4 + comps.c5);

    return {
      competencias: comps,
      nota_total: notaTotal,
      metodo_resolucao: refExplicita.tipo || (caso.nota_adjudicada ? 'adjudicada' : 'consenso_declarado'),
      discrepancia_detectada: false,
      avisos
    };
  }

  // 2. Avaliações humanas listadas
  const avaliacoes = Array.isArray(caso.avaliacoes_humanas) ? caso.avaliacoes_humanas : [];
  if (avaliacoes.length === 0) {
    throw new Error('Nenhuma avaliação humana ou nota de referência foi fornecida para esta redação.');
  }

  // Avaliador único
  if (avaliacoes.length === 1) {
    const comps = normalizarCompetencias(avaliacoes[0].competencias);
    const val = validarNotasEnem(comps, false);
    if (!val.valido) {
      throw new Error(`Avaliador único possui notas inválidas: ${val.erros.join('; ')}`);
    }
    avisos.push('Apenas 1 avaliador humano disponível. Recomenda-se no mínimo 2 para validação ENEM.');
    return {
      competencias: comps,
      nota_total: comps.c1 + comps.c2 + comps.c3 + comps.c4 + comps.c5,
      metodo_resolucao: 'avaliador_unico',
      discrepancia_detectada: false,
      avisos
    };
  }

  // Dois avaliadores
  if (avaliacoes.length === 2) {
    const c1 = normalizarCompetencias(avaliacoes[0].competencias);
    const c2 = normalizarCompetencias(avaliacoes[1].competencias);
    const val1 = validarNotasEnem(c1, false);
    const val2 = validarNotasEnem(c2, false);
    if (!val1.valido) throw new Error(`Avaliador 1 possui notas inválidas: ${val1.erros.join('; ')}`);
    if (!val2.valido) throw new Error(`Avaliador 2 possui notas inválidas: ${val2.erros.join('; ')}`);

    const disc = verificarDiscrepanciaEntreAvaliadores(c1, c2);

    if (!disc.discrepante) {
      const compsMedia = {
        c1: (c1.c1 + c2.c1) / 2,
        c2: (c1.c2 + c2.c2) / 2,
        c3: (c1.c3 + c2.c3) / 2,
        c4: (c1.c4 + c2.c4) / 2,
        c5: (c1.c5 + c2.c5) / 2
      };
      return {
        competencias: compsMedia,
        nota_total: compsMedia.c1 + compsMedia.c2 + compsMedia.c3 + compsMedia.c4 + compsMedia.c5,
        metodo_resolucao: 'media_dois_avaliadores_concordantes',
        discrepancia_detectada: false,
        avisos
      };
    }

    avisos.push(`Divergência entre avaliadores humanos detectada: ${disc.motivos.join('; ')}. Requer adjudicação.`);
    const compsMedia = {
      c1: (c1.c1 + c2.c1) / 2,
      c2: (c1.c2 + c2.c2) / 2,
      c3: (c1.c3 + c2.c3) / 2,
      c4: (c1.c4 + c2.c4) / 2,
      c5: (c1.c5 + c2.c5) / 2
    };
    return {
      competencias: compsMedia,
      nota_total: compsMedia.c1 + compsMedia.c2 + compsMedia.c3 + compsMedia.c4 + compsMedia.c5,
      metodo_resolucao: 'media_provisoria_com_divergencia_pendente',
      discrepancia_detectada: true,
      avisos
    };
  }

  // Três avaliadores (1º, 2º e 3º avaliador de desempate)
  if (avaliacoes.length === 3) {
    const c1 = normalizarCompetencias(avaliacoes[0].competencias);
    const c2 = normalizarCompetencias(avaliacoes[1].competencias);
    const c3 = normalizarCompetencias(avaliacoes[2].competencias);

    const total1 = c1.c1 + c1.c2 + c1.c3 + c1.c4 + c1.c5;
    const total2 = c2.c1 + c2.c2 + c2.c3 + c2.c4 + c2.c5;
    const total3 = c3.c1 + c3.c2 + c3.c3 + c3.c4 + c3.c5;

    const diff13 = Math.abs(total1 - total3);
    const diff23 = Math.abs(total2 - total3);

    const maisProximo = diff13 <= diff23 ? c1 : c2;
    const nomeMaisProximo = diff13 <= diff23 ? 'avaliador_1' : 'avaliador_2';

    const compsMedia = {
      c1: (c3.c1 + maisProximo.c1) / 2,
      c2: (c3.c2 + maisProximo.c2) / 2,
      c3: (c3.c3 + maisProximo.c3) / 2,
      c4: (c3.c4 + maisProximo.c4) / 2,
      c5: (c3.c5 + maisProximo.c5) / 2
    };

    return {
      competencias: compsMedia,
      nota_total: compsMedia.c1 + compsMedia.c2 + compsMedia.c3 + compsMedia.c4 + compsMedia.c5,
      metodo_resolucao: `terceiro_avaliador_com_${nomeMaisProximo}`,
      discrepancia_detectada: true,
      avisos
    };
  }

  avisos.push(`Mais de 3 avaliadores informados (${avaliacoes.length}). Calculada média geral aritmética.`);
  const compsSoma = { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };
  for (const a of avaliacoes) {
    const c = normalizarCompetencias(a.competencias);
    for (let i = 1; i <= 5; i++) compsSoma[`c${i}`] += c[`c${i}`];
  }
  const n = avaliacoes.length;
  const compsMedia = {
    c1: compsSoma.c1 / n,
    c2: compsSoma.c2 / n,
    c3: compsSoma.c3 / n,
    c4: compsSoma.c4 / n,
    c5: compsSoma.c5 / n
  };
  return {
    competencias: compsMedia,
    nota_total: compsMedia.c1 + compsMedia.c2 + compsMedia.c3 + compsMedia.c4 + compsMedia.c5,
    metodo_resolucao: 'media_multiplos_avaliadores',
    discrepancia_detectada: false,
    avisos
  };
}

/**
 * Valida a correção da IA vinculada ao caso.
 *
 * @param {object} caso
 * @returns {{
 *   competencias: { c1: number, c2: number, c3: number, c4: number, c5: number },
 *   nota_total: number,
 *   modelo: string
 * }}
 */
export function validarCorrecaoIA(caso) {
  const ia = caso.correcao_ia || caso.avaliacao_ia || caso.ia;
  if (!ia || typeof ia !== 'object') {
    throw new Error('Correção da IA (correcao_ia) ausente ou inválida no registro.');
  }

  const rawComps = ia.competencias ?? ia;
  const comps = normalizarCompetencias(rawComps);
  const validacao = validarNotasEnem(comps, false);

  if (!validacao.valido) {
    throw new Error(`Correção da IA possui notas inválidas na escala ENEM: ${validacao.erros.join('; ')}`);
  }

  const somaBackend = comps.c1 + comps.c2 + comps.c3 + comps.c4 + comps.c5;
  const notaTotal = typeof ia.nota_total === 'number' ? ia.nota_total : somaBackend;

  if (Math.abs(notaTotal - somaBackend) > 0.01) {
    throw new Error(
      `Inconsistência na correção da IA: nota_total informada (${notaTotal}) diverge da soma das competências (${somaBackend}).`
    );
  }

  return {
    competencias: comps,
    nota_total: somaBackend,
    modelo: String(ia.modelo || ia.modelo_utilizado || 'ia-corretor')
  };
}

/**
 * Valida um caso completo do benchmark.
 *
 * @param {object} item - Objeto do caso do benchmark
 * @param {number} [indice=0] - Posição do item no dataset
 * @returns {{
 *   valido: boolean,
 *   caso?: {
 *     id: string,
 *     tema: string,
 *     texto: string,
 *     referencia: { competencias: object, nota_total: number, metodo_resolucao: string },
 *     correcao_ia: { competencias: object, nota_total: number, modelo: string },
 *     discrepancia_humana: boolean,
 *     avisos: string[]
 *   },
 *   erros: string[]
 * }}
 */
export function validarCasoBenchmark(item, indice = 0) {
  const prefixo = `Caso #${indice + 1} (id: ${item?.id || 'sem_id'})`;
  const erros = [];

  if (!item || typeof item !== 'object') {
    return { valido: false, erros: [`${prefixo}: Registro deve ser um objeto JSON válido.`] };
  }

  const id = String(item.id || `caso-${indice + 1}`).trim();
  const tema = String(item.tema || item.titulo || '').trim();
  const texto = String(item.texto || item.redacao || '').trim();

  if (!tema) erros.push(`${prefixo}: Tema/título da redação não informado.`);
  if (!texto) erros.push(`${prefixo}: Texto da redação não informado.`);

  let ref = null;
  try {
    ref = resolverReferenciaHumana(item);
  } catch (err) {
    erros.push(`${prefixo}: Falha ao resolver avaliação humana de referência: ${err.message}`);
  }

  let ia = null;
  try {
    ia = validarCorrecaoIA(item);
  } catch (err) {
    erros.push(`${prefixo}: Falha ao validar correção da IA: ${err.message}`);
  }

  if (erros.length > 0) {
    return { valido: false, erros };
  }

  return {
    valido: true,
    erros: [],
    caso: {
      id,
      tema,
      texto,
      referencia: ref,
      correcao_ia: ia,
      discrepancia_humana: ref.discrepancia_detectada,
      avisos: ref.avisos
    }
  };
}

/**
 * Valida um dataset completo (array ou objeto com propriedade casos/redacoes).
 *
 * @param {object|Array} datasetRaw
 * @returns {{
 *   valido: boolean,
 *   metadados: object,
 *   casosValidos: Array<object>,
 *   casosRejeitados: Array<{ indice: number, id: string, erros: string[] }>,
 *   errosGlobais: string[]
 * }}
 */
export function validarDatasetBenchmark(datasetRaw) {
  const errosGlobais = [];

  if (!datasetRaw) {
    return {
      valido: false,
      metadados: {},
      casosValidos: [],
      casosRejeitados: [],
      errosGlobais: ['Dataset vazio ou nulo.']
    };
  }

  let itens = [];
  let metadados = {};

  if (Array.isArray(datasetRaw)) {
    itens = datasetRaw;
  } else if (typeof datasetRaw === 'object') {
    itens = datasetRaw.casos || datasetRaw.redacoes || datasetRaw.dados || [];
    metadados = { ...datasetRaw };
    delete metadados.casos;
    delete metadados.redacoes;
    delete metadados.dados;
  } else {
    return {
      valido: false,
      metadados: {},
      casosValidos: [],
      casosRejeitados: [],
      errosGlobais: ['Dataset deve ser um array JSON ou objeto contendo array de casos.']
    };
  }

  if (!Array.isArray(itens)) {
    errosGlobais.push('A lista de casos não é um array iterável.');
    return { valido: false, metadados, casosValidos: [], casosRejeitados: [], errosGlobais };
  }

  const casosValidos = [];
  const casosRejeitados = [];

  itens.forEach((item, idx) => {
    const res = validarCasoBenchmark(item, idx);
    if (res.valido) {
      casosValidos.push(res.caso);
    } else {
      casosRejeitados.push({
        indice: idx,
        id: item?.id || `indice-${idx}`,
        erros: res.erros
      });
    }
  });

  return {
    valido: casosValidos.length > 0,
    metadados,
    casosValidos,
    casosRejeitados,
    errosGlobais
  };
}
