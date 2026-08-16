import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const mensagensEl = document.getElementById('mensagens');
const formEl = document.getElementById('form-mensagem');
const inputEl = document.getElementById('input-mensagem');
const btnEnviar = document.getElementById('btn-enviar');
const usoBadge = document.getElementById('uso-badge');
const filtroContainer = document.getElementById('filtro-materias');

let historico = []; // { role: 'usuario' | 'assistente', texto: string }
let materiaAtiva = { id: '', nome: '' };
let enviando = false;
let primeiraMensagem = true;

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  renderFiltros(materias || []);
  atualizarBadgeInicial();
}

function renderFiltros(materias) {
  const chipsHtml = materias.map(m => `
    <div class="chip" data-materia="${m.id}" data-nome="${m.nome}" style="--cor:${m.cor}">${m.nome}</div>
  `).join('');
  filtroContainer.innerHTML = `<div class="chip active" data-materia="" data-nome="">Sem matéria específica</div>${chipsHtml}`;

  filtroContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      materiaAtiva = { id: chip.dataset.materia, nome: chip.dataset.nome };
    });
  });
}

// Tenta mostrar quantas perguntas já foram feitas hoje, sem gastar uma pergunta pra isso.
// Se não conseguir (RLS, erro de rede, etc.), só esconde o badge — não trava o chat.
async function atualizarBadgeInicial() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const { data: perfil } = await supabase
      .from('profiles')
      .select('planos(limite_chat_dia)')
      .eq('id', session.user.id)
      .single();

    const limite = perfil?.planos?.limite_chat_dia;
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: uso } = await supabase
      .from('uso_diario')
      .select('chat_perguntas')
      .eq('user_id', session.user.id)
      .eq('data', hoje)
      .maybeSingle();

    const usado = uso?.chat_perguntas || 0;
    definirBadge(usado, limite);
  } catch (e) {
    usoBadge.style.display = 'none';
  }
}

function definirBadge(usado, limite) {
  if (limite === null || limite === undefined) {
    usoBadge.textContent = '💬 Perguntas ilimitadas hoje';
  } else {
    usoBadge.textContent = `💬 ${usado}/${limite} perguntas hoje`;
  }
}

function renderMensagem(role, texto) {
  if (primeiraMensagem) {
    mensagensEl.innerHTML = '';
    primeiraMensagem = false;
  }
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  div.textContent = texto;
  mensagensEl.appendChild(div);
  mensagensEl.scrollTop = mensagensEl.scrollHeight;
  return div;
}

function renderCarregando() {
  const div = document.createElement('div');
  div.className = 'msg-carregando';
  div.id = 'msg-carregando';
  div.textContent = 'Tutor está digitando...';
  mensagensEl.appendChild(div);
  mensagensEl.scrollTop = mensagensEl.scrollHeight;
}

function removerCarregando() {
  document.getElementById('msg-carregando')?.remove();
}

async function enviarMensagem(mensagem) {
  renderMensagem('usuario', mensagem);
  historico.push({ role: 'usuario', texto: mensagem });
  renderCarregando();

  const { data, error } = await supabase.functions.invoke('chat-ia', {
    body: {
      mensagem,
      historico,
      materia: materiaAtiva.nome || undefined,
    },
  });

  removerCarregando();

  if (error) {
    let mensagemErro = 'Não consegui falar com o tutor agora. Tenta de novo em instantes.';
    try {
      const corpo = await error.context.json();
      if (corpo?.mensagem) mensagemErro = corpo.mensagem;
    } catch (_) { /* mantém a mensagem padrão */ }
    renderMensagem('erro', mensagemErro);
    return;
  }

  renderMensagem('assistente', data.resposta);
  historico.push({ role: 'assistente', texto: data.resposta });
  if (data.uso) definirBadge(data.uso.usado, data.uso.limite);
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = inputEl.value.trim();
  if (!texto || enviando) return;

  enviando = true;
  btnEnviar.disabled = true;
  inputEl.value = '';
  inputEl.style.height = 'auto';

  try {
    await enviarMensagem(texto);
  } finally {
    enviando = false;
    btnEnviar.disabled = false;
    inputEl.focus();
  }
});

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

iniciar();
iniciarBusca();
iniciarNotificacoes();
