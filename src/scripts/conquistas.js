import { supabase } from '../lib/supabaseClient.js';

/**
 * Verifica as conquistas de um usuário no servidor via RPC (cobrindo as 60 conquistas do banco).
 * O bônus de XP de cada conquista é concedido diretamente pelo banco de dados.
 * @param {string} userId
 * @param {Object} [_dadosPrecarregados] Mantido por compatibilidade de assinatura.
 * @returns {Promise<Array>} Lista de novas conquistas desbloqueadas.
 */
export async function verificarConquistas(userId, _dadosPrecarregados = {}) {
  if (!userId) return [];

  const { data, error } = await supabase.rpc('verificar_conquistas', { p_user_id: userId });
  if (error) {
    console.warn('Erro ao verificar conquistas:', error);
    return [];
  }

  return data?.novas_conquistas || [];
}
