import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const avatarEl = document.getElementById('perfil-avatar');
const nomeRealEl = document.getElementById('perfil-nome-real');
const emailEl = document.getElementById('perfil-email');
const inputEl = document.getElementById('input-nome-usuario');
const btnSalvar = document.getElementById('btn-salvar');
const mensagemEl = document.getElementById('mensagem-perfil');

let userId = null;

async function iniciarPerfil() {
  const session = await exigirAutenticacao();
  if (!session) return;
  userId = session.user.id;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('nome, nome_usuario')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    mostrarMensagem('Não foi possível carregar seu perfil. Tente recarregar a página.', 'erro');
    return;
  }

  const primeiroNome = profile.nome?.split(' ')[0] || 'Aluno(a)';
  avatarEl.textContent = primeiroNome[0]?.toUpperCase() || 'A';
  nomeRealEl.textContent = profile.nome || 'Aluno(a)';
  emailEl.textContent = session.user.email || '';
  inputEl.value = profile.nome_usuario || '';

  btnSalvar.addEventListener('click', salvarNomeUsuario);
}

async function salvarNomeUsuario() {
  const valor = inputEl.value.trim();

  btnSalvar.disabled = true;
  mostrarMensagem('Salvando...', '');

  const { error } = await supabase
    .from('profiles')
    .update({ nome_usuario: valor === '' ? null : valor })
    .eq('id', userId);

  btnSalvar.disabled = false;

  if (error) {
    mostrarMensagem('Erro ao salvar. Tente novamente.', 'erro');
    return;
  }

  mostrarMensagem('Salvo com sucesso! ✅', 'sucesso');
}

function mostrarMensagem(texto, tipo) {
  mensagemEl.textContent = texto;
  mensagemEl.className = 'mensagem-perfil' + (tipo ? ` ${tipo}` : '');
}

iniciarPerfil();
iniciarBusca();
iniciarNotificacoes();
