import { supabase } from '../lib/supabaseClient.js';

// Retorna um Set com os IDs já favoritados pelo usuário logado,
// filtrando por tipo ('resumo' ou 'questao').
export async function buscarFavoritos(tipo) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Set();

  const { data } = await supabase
    .from('favoritos')
    .select('referencia_id')
    .eq('user_id', session.user.id)
    .eq('tipo', tipo);

  return new Set((data || []).map(f => f.referencia_id));
}

// Alterna o favorito (adiciona se não existe, remove se já existe).
// Retorna o novo estado (true = favoritado, false = não favoritado).
export async function alternarFavorito(tipo, referenciaId, favoritadoAtualmente) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return favoritadoAtualmente;

  if (favoritadoAtualmente) {
    await supabase
      .from('favoritos')
      .delete()
      .eq('user_id', session.user.id)
      .eq('tipo', tipo)
      .eq('referencia_id', referenciaId);
    return false;
  }

  await supabase
    .from('favoritos')
    .insert({ user_id: session.user.id, tipo, referencia_id: referenciaId });
  return true;
}
