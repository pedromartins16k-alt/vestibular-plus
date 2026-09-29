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
 * Registra ou atualiza o resultado de uma questão no sistema de revisão.
 * @param {string} userId
 * @param {string} questaoId
 * @param {string} resultado — 'erro' | 'dificuldade' | 'acerto' | 'acerto_facil'
 */
export async function registrarResultado(userId, questaoId, resultado) {
  if (!questaoId || !resultado) return;

  // Ler revisão existente para calcular novo intervalo
  let intervaloDias = 1;
  let revisaoExistente = null;

  // Tenta ler do Supabase
  try {
    const { data } = await supabase
      .from('revisao_agendada')
      .select('intervalo_dias, total_revisoes')
      .eq('user_id', userId)
      .eq('questao_id', questaoId)
      .single();
    if (data) {
      intervaloDias = data.intervalo_dias || 1;
      revisaoExistente = data;
    }
  } catch (_) {}

  const { proximaRevisao, novoIntervalo } = calcularProximaRevisao(resultado, intervaloDias);
  const totalRevisoes = (revisaoExistente?.total_revisoes || 0) + 1;

  const payload = {
    user_id: userId,
    questao_id: questaoId,
    proxima_revisao: proximaRevisao,
    intervalo_dias: novoIntervalo,
    ultimo_resultado: resultado,
    total_revisoes: totalRevisoes,
    atualizado_em: new Date().toISOString()
  };

  // Tenta salvar no Supabase (upsert)
  let salvoNoSupabase = false;
  try {
    const { error } = await supabase
      .from('revisao_agendada')
      .upsert(payload, { onConflict: 'user_id,questao_id' });
    if (!error) salvoNoSupabase = true;
  } catch (_) {}

  // Fallback: localStorage
  if (!salvoNoSupabase) {
    const revisoes = lerRevisoesLocal(userId);
    const idx = revisoes.findIndex(r => r.questao_id === questaoId);
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
