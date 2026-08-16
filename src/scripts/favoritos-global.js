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
// Centraliza a checagem de plano: quem chama essa função (resumos.js,
// questoes.js, etc.) não precisa saber nada sobre limites de plano.
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
  // Antes de tentar favoritar, checa se o plano do aluno permite.
  const { data: temAcesso, error: erroAcesso } = await supabase.rpc('usuario_tem_acesso', {
    p_recurso: 'favoritos',
  });
  if (erroAcesso) {
    console.error('[favoritos] erro ao checar acesso', erroAcesso);
  } else if (!temAcesso) {
    mostrarAvisoFavoritos('Favoritar é um recurso exclusivo dos planos pagos. Faça upgrade pra salvar seus resumos e questões preferidos.');
    return false;
  }
  const { error } = await supabase
    .from('favoritos')
    .insert({ user_id: session.user.id, tipo, referencia_id: referenciaId });
  if (error) {
    console.error('[favoritos] insert recusado', error);
    mostrarAvisoFavoritos('Não foi possível favoritar agora. Faça upgrade do seu plano pra usar essa função.');
    return false;
  }
  return true;
}
function mostrarAvisoFavoritos(mensagem) {
  let aviso = document.getElementById('aviso-favoritos');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'aviso-favoritos';
    aviso.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100;max-width:420px;width:90%;padding:14px 18px;border-radius:12px;background:rgba(239,68,68,.18);border:1px solid #ef4444;color:#fff;font-size:.88rem;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.35);backdrop-filter:blur(6px);';
    document.body.appendChild(aviso);
  }
  aviso.textContent = mensagem;
  aviso.style.display = 'block';
  clearTimeout(aviso._timeout);
  aviso._timeout = setTimeout(() => { aviso.style.display = 'none'; }, 6000);
}
