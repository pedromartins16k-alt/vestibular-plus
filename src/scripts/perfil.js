import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { lerObjetivo, salvarObjetivo } from './objetivo.js';

const avatarEl = document.getElementById('perfil-avatar');
const nomeRealEl = document.getElementById('perfil-nome-real');
const emailEl = document.getElementById('perfil-email');
const inputEl = document.getElementById('input-nome-usuario');
const selVestibular = document.getElementById('sel-perfil-vestibular');
const inputUniv = document.getElementById('input-perfil-universidade');
const inputCurso = document.getElementById('input-perfil-curso');
const inputData = document.getElementById('input-perfil-data');
const btnSalvar = document.getElementById('btn-salvar');
const mensagemEl = document.getElementById('mensagem-perfil');

let userId = null;

async function iniciarPerfil() {
  const session = await exigirAutenticacao();
  if (!session) return;
  userId = session.user.id;

  const [{ data: profile, error }, objetivo] = await Promise.all([
    supabase.from('profiles').select('nome, nome_usuario').eq('id', userId).single(),
    lerObjetivo()
  ]);

  if (error || !profile) {
    mostrarMensagem('Não foi possível carregar seu perfil. Tente recarregar a página.', 'erro');
    return;
  }

  const primeiroNome = profile.nome?.split(' ')[0] || 'Aluno(a)';
  avatarEl.textContent = primeiroNome[0]?.toUpperCase() || 'A';
  nomeRealEl.textContent = profile.nome || 'Aluno(a)';
  emailEl.textContent = session.user.email || '';
  inputEl.value = profile.nome_usuario || '';

  if (objetivo) {
    if (selVestibular && objetivo.vestibular_id) selVestibular.value = objetivo.vestibular_id;
    if (inputUniv && objetivo.universidade) inputUniv.value = objetivo.universidade;
    if (inputCurso && objetivo.curso) inputCurso.value = objetivo.curso;
    if (inputData && objetivo.data_prova) inputData.value = objetivo.data_prova;
  }
  // Se não houver objetivo salvo, mantém os campos vazios

  btnSalvar.addEventListener('click', salvarPerfilCompleto);
}

async function salvarPerfilCompleto() {
  const valorApelido = inputEl.value.trim();
  const vestId = selVestibular?.value || '';
  const vestNome = selVestibular?.options[selVestibular.selectedIndex]?.text || '';
  const univ = inputUniv?.value.trim() || '';
  const curso = inputCurso?.value.trim() || '';
  const dataProva = inputData?.value || null;

  btnSalvar.disabled = true;
  mostrarMensagem('Salvando alterações...', '');

  const [resProfile, resObj] = await Promise.allSettled([
    supabase
      .from('profiles')
      .update({ nome_usuario: valorApelido === '' ? null : valorApelido })
      .eq('id', userId),
    salvarObjetivo({
      vestibular_id: vestId,
      vestibular_nome: vestNome,
      universidade: univ,
      curso: curso,
      data_prova: dataProva
    })
  ]);

  btnSalvar.disabled = false;

  if (resProfile.status === 'rejected' || resProfile.value?.error) {
    mostrarMensagem('Erro ao salvar nome de usuário. Tente novamente.', 'erro');
    return;
  }

  mostrarMensagem('Perfil e objetivo salvos com sucesso! ✅', 'sucesso');
}

function mostrarMensagem(texto, tipo) {
  mensagemEl.textContent = texto;
  mensagemEl.className = 'mensagem-perfil' + (tipo ? ` ${tipo}` : '');
}

iniciarPerfil();
iniciarBusca();
iniciarNotificacoes();

