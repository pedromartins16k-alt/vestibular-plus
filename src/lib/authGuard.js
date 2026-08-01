import { supabase } from './supabaseClient.js';

// Redireciona para o login se não houver sessão ativa.
// Retorna a sessão do usuário para uso na página.
export async function exigirAutenticacao() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = './login.html';
    return null;
  }
  return session;
}

export async function sair() {
  await supabase.auth.signOut();
  window.location.href = './login.html';
}
