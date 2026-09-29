/**
 * revisao.js — Sistema de Revisão Espaçada (Spaced Repetition)
 *
 * Implementa o algoritmo de revisão espaçada adaptado para o Vestibular+.
 * Baseado no algoritmo SM-2 com simplificações práticas para o contexto vestibular.
 *
 * Intervalos padrão:
 *  - Erro: revisão no dia seguinte (1 dia)
 *  - Dificuldade: 2 dias
 *  - Acerto: 7 dias
 *  - Acerto fácil: 14 dias → 30 dias → 60 dias
 *
 * NOTA: Persistência no Supabase requer a tabela `revisao_agendada`.
 * Veja CLAUDE_DATABASE_PROMPT.md. Usa localStorage como fallback.
 */

import { supabase } from '../lib/supabaseClient.js';

const LS_KEY_PREFIX = 'vestibular_revisao_';

// ----------------------------------------------------------------
// Cálculo de próxima revisão
// ----------------------------------------------------------------

/**
 * Calcula a próxima data de revisão e o novo intervalo.
 * @param {string} resultado — 'erro' | 'dificuldade' | 'acerto' | 'acerto_facil'
 * @param {number} intervaloDias — intervalo atual em dias
 * @returns {{ proximaRevisao: string, novoIntervalo: number }}
 */
export function calcularProximaRevisao(resultado, intervaloDias = 1) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let novoIntervalo;

  switch (resultado) {
    case 'erro':
      novoIntervalo = 1;
      break;
    case 'dificuldade':
      novoIntervalo = 2;
      break;
    case 'acerto':
      novoIntervalo = intervaloDias <= 1 ? 7 : Math.min(Math.round(intervaloDias * 2), 60);
      break;
    case 'acerto_facil':
      novoIntervalo = intervaloDias <= 1 ? 14 : Math.min(Math.round(intervaloDias * 2.5), 90);
      break;
    default:
      novoIntervalo = 1;
  }

  const proxima = new Date(hoje);
  proxima.setDate(proxima.getDate() + novoIntervalo);

  return {
    proximaRevisao: proxima.toISOString().split('T')[0],
    novoIntervalo
  };
}

/**
 * Formata a próxima revisão para exibição amigável.
 */
export function formatarProximaRevisao(dataStr) {
  if (!dataStr) return '—';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(dataStr + 'T00:00:00');
  const diff = Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));

  if (diff <= 0) return '🔴 Hoje';
  if (diff === 1) return '🟠 Amanhã';
  if (diff <= 7) return `🟡 Em ${diff} dias`;
  return `🟢 Em ${diff} dias`;
}

// ----------------------------------------------------------------
// Persistência
// ----------------------------------------------------------------

function getLsKey(userId) {
  return `${LS_KEY_PREFIX}${userId || 'guest'}`;
}

function lerRevisoesLocal(userId) {
  try {
    return JSON.parse(localStorage.getItem(getLsKey(userId)) || '[]');
  } catch (_) {
    return [];
  }
}

function salvarRevisoesLocal(userId, revisoes) {
  try {
    localStorage.setItem(getLsKey(userId), JSON.stringify(revisoes));
  } catch (_) {}
}

/**
 * Registra ou atualiza o resultado de um item no sistema de revisão espaçada.
 * @param {string} userId
 * @param {string|object} itemOrId — itemId/questaoId (string) ou objeto { itemId, tipoItem, resultado, dificuldade }
 * @param {string} [resultadoParam] — 'erro' | 'dificuldade' | 'acerto' | 'acerto_facil'
 * @param {object} [opcoes] — { tipoItem, dificuldade }
 */
export async function registrarResultado(userId, itemOrId, resultadoParam, opcoes = {}) {
  let itemId = '';
  let tipoItem = 'questao';
  let resultado = resultadoParam;
  let dificuldade = opcoes.dificuldade || 'medio';

  if (typeof itemOrId === 'object' && itemOrId !== null) {
    itemId = itemOrId.itemId || itemOrId.item_id || itemOrId.questaoId || itemOrId.questao_id || '';
    tipoItem = itemOrId.tipoItem || itemOrId.tipo_item || 'questao';
    resultado = itemOrId.resultado || resultadoParam;
    dificuldade = itemOrId.dificuldade || opcoes.dificuldade || 'medio';
  } else {
    itemId = String(itemOrId || '');
    tipoItem = opcoes.tipoItem || opcoes.tipo_item || 'questao';
  }

  if (!itemId || !resultado) return;

  // Ler revisão existente para calcular novo intervalo e nível
  let intervaloDias = 1;
  let nivelAtual = 0;
  let totalAcertos = 0;
  let totalErros = 0;
  let totalRevisoesAnteriores = 0;
  let historicoAnterior = [];

  // Tenta ler do Supabase
  try {
    const { data } = await supabase
      .from('revisao_agendada')
      .select('nivel, intervalo_dias, total_revisoes, acertos, erros, historico')
      .eq('user_id', userId)
      .eq('tipo_item', tipoItem)
      .eq('item_id', itemId)
      .maybeSingle();

    if (data) {
      intervaloDias = data.intervalo_dias || 1;
      nivelAtual = data.nivel || 0;
      totalAcertos = data.acertos || 0;
      totalErros = data.erros || 0;
      totalRevisoesAnteriores = data.total_revisoes || 0;
      historicoAnterior = Array.isArray(data.historico) ? data.historico : [];
    }
  } catch (_) {}

  const acertou = resultado === 'acerto' || resultado === 'acerto_facil';
  const novoNivel = acertou ? nivelAtual + 1 : Math.max(0, nivelAtual - 1);
  const { proximaRevisao, novoIntervalo } = calcularProximaRevisao(resultado, intervaloDias);
  
  const novoTotalRevisoes = totalRevisoesAnteriores + 1;
  const novoTotalAcertos = acertou ? totalAcertos + 1 : totalAcertos;
  const novoTotalErros = !acertou ? totalErros + 1 : totalErros;
  const agoraIso = new Date().toISOString();

  const novoHistorico = [
    ...historicoAnterior.slice(-19), // Mantém últimos 20 registros
    {
      data: agoraIso,
      resultado,
      intervalo_dias: novoIntervalo,
      nivel: novoNivel
    }
  ];

  const payload = {
    user_id: userId,
    tipo_item: tipoItem,
    item_id: itemId,
    nivel: novoNivel,
    intervalo_dias: novoIntervalo,
    dificuldade: dificuldade,
    total_revisoes: novoTotalRevisoes,
    acertos: novoTotalAcertos,
    erros: novoTotalErros,
    ultimo_resultado: resultado,
    ultima_revisao: agoraIso,
    proxima_revisao: proximaRevisao,
    historico: novoHistorico,
    updated_at: agoraIso
  };

  // Tenta salvar no Supabase (upsert)
  let salvoNoSupabase = false;
  try {
    const { error } = await supabase
      .from('revisao_agendada')
      .upsert(payload, { onConflict: 'user_id,tipo_item,item_id' });
    if (!error) salvoNoSupabase = true;
  } catch (_) {}

  // Fallback: localStorage isolado por usuário
  if (!salvoNoSupabase) {
    const revisoes = lerRevisoesLocal(userId);
    const idx = revisoes.findIndex(r => r.item_id === itemId && r.tipo_item === tipoItem);
    if (idx >= 0) {
      revisoes[idx] = payload;
    } else {
      revisoes.push(payload);
    }
    salvarRevisoesLocal(userId, revisoes);
  }

  return payload;
}

/**
 * Retorna questões agendadas para revisão hoje ou antes.
 * @param {string} userId
 * @returns {Array} lista de revisões pendentes
 */
export async function lerRevisoesPendentes(userId) {
  const hoje = new Date().toISOString().split('T')[0];

  // Tenta Supabase
  try {
    const { data, error } = await supabase
      .from('revisao_agendada')
      .select('*')
      .eq('user_id', userId)
      .lte('proxima_revisao', hoje)
      .order('proxima_revisao', { ascending: true })
      .limit(50);

    if (!error && data) return data;
  } catch (_) {}

  // Fallback: localStorage
  const todas = lerRevisoesLocal(userId);
  return todas.filter(r => r.proxima_revisao <= hoje);
}

/**
 * Retorna o total de revisões pendentes (para badge no dashboard).
 */
export async function contarRevisoesPendentes(userId) {
  const pendentes = await lerRevisoesPendentes(userId);
  return pendentes.length;
}
