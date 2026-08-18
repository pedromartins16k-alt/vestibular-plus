import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { verificarConquistas } from './conquistas.js';

const studyArea = document.getElementById('study-area');
const filtroContainer = document.getElementById('filtro-materias');
const assuntoContainer = document.getElementById('assunto-tabs');
const modoTabsContainer = document.getElementById('modo-tabs');
const statsBar = document.getElementById('stats-bar');
const progressoTrack = document.querySelector('.progresso-track');
const statRestantes = document.getElementById('stat-restantes');
const statRevisados = document.getElementById('stat-revisados');
const progressoFill = document.getElementById('progresso-fill');

const INTERVALOS_DIAS = [1, 1, 3, 7, 15, 30];

let userId = null;
let todosFlashcards = [];
let materiaAtiva = 'todas';
let assuntoAtivo = 'todos';
let modoAtivo = 'revisar';
let fila = [];
let totalSessao = 0;
let cardAtual = null;
let virado = false;
let revisadosHoje = 0;
let ultimoCardContadoId = null;

function renderIconeCadeadoBasic() {
  return `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="filter:drop-shadow(0 6px 16px rgba(56,189,248,.4));">
      <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradBasicPadlockFc)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>
      <circle cx="12" cy="15" r="1.5" fill="#bae6fd"/>
      <path d="M12 16.5V18.5" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/>
      <defs>
        <linearGradient id="gradBasicPadlockFc" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0284c7"/>
          <stop offset="1" stop-color="#38bdf8"/>
        </linearGradient>
      </defs>
    </svg>
  `;
}

function renderBloqueado() {
  if (statsBar) statsBar.style.display = 'none';
  if (progressoTrack) progressoTrack.style.display = 'none';
  if (modoTabsContainer) modoTabsContainer.style.display = 'none';

  studyArea.innerHTML = `
    <div class="card fade-up" style="max-width:520px; width:100%; text-align:center; padding:40px 24px; border:1px solid rgba(56,189,248,.4); box-shadow:0 12px 35px rgba(0,0,0,.4);">
      <div style="margin-bottom:14px;">${renderIconeCadeadoBasic()}</div>
      <h2 style="font-size:1.4rem; margin-bottom:10px;">Exclusivo a partir do Plano <span style="background:linear-gradient(135deg, #0284c7, #38bdf8); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Basic</span></h2>
      <p style="color:var(--text-secondary); font-size:.92rem; line-height:1.6; margin-bottom:24px;">
        O método de repetição espaçada com Flashcards inteligentes é um recurso exclusivo para assinantes dos planos Basic, Pro e Ultimate.
      </p>
      <a class="btn" style="background:linear-gradient(135deg, #0284c7, #38bdf8); color:#fff; font-weight:700; font-size:.95rem; box-shadow:0 4px 18px rgba(14,165,233,.4);" href="./precos.html?plano=basic">
        🚀 Desbloquear Flashcards no Plano Basic
      </a>
    </div>
  `;
}

function renderLimiteAtingido(limite) {
  studyArea.innerHTML = `
    <div class="card fade-up" style="max-width:520px; width:100%; text-align:center; padding:36px 24px; border:1px solid rgba(56,189,248,.4);">
      <div style="margin-bottom:10px;">${renderIconeCadeadoBasic()}</div>
      <h3 style="font-size:1.25rem; margin-bottom:8px;">Limite diário atingido</h3>
      <p style="color:var(--text-secondary); font-size:.9rem; line-height:1.6; margin-bottom:20px;">
        Você atingiu o limite de ${limite} flashcards por dia do seu plano. Faça upgrade para revisar sem limites.
      </p>
      <a class="btn" style="background:linear-gradient(135deg, #0284c7, #38bdf8); color:#fff; font-weight:700;" href="./precos.html?plano=basic">
        Ver Planos
      </a>
    </div>
  `;
}

async function checarELimitarFlashcard() {
  const { data: uso, error } = await supabase.rpc('verificar_e_registrar_uso', { p_tipo: 'flashcard' });

  if (error) {
    console.error('[uso flashcard]', error);
    return { permitido: true };
  }
  return uso;
}

async function buscarAcessoFlashcards() {
  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('planos(acesso_flashcards, nome)')
    .eq('id', userId)
    .single();

  if (error || !perfil?.planos) {
    console.error('Erro ao buscar plano do usuário:', error);
    return false;
  }
  // Se for plano free, flashcards são bloqueados
  if ((perfil.planos.nome || 'free').toLowerCase() === 'free') {
    return false;
  }
  return perfil.planos.acesso_flashcards ?? true;
}

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  userId = session.user.id;

  const acesso = await buscarAcessoFlashcards();
  if (!acesso) {
    renderBloqueado();
    return;
  }

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  const { data: flashcards } = await supabase
    .from('flashcards')
    .select('id, frente, verso, materia_id, assunto, materias(nome, cor)');

  const { data: progresso } = await supabase
    .from('flashcards_progresso')
    .select('flashcard_id, nivel_memorizacao, proxima_revisao')
    .eq('user_id', userId);

  const progressoPorCard = {};
  (progresso || []).forEach(p => { progressoPorCard[p.flashcard_id] = p; });

  todosFlashcards = (flashcards || []).map(c => ({
    ...c,
    progresso: progressoPorCard[c.id] || null,
  }));

  renderFiltros(materias || []);
  renderModos();
  montarFila();
  mostrarProximoCard();
}

function renderModos() {
  modoTabsContainer.querySelectorAll('.modo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modoTabsContainer.querySelectorAll('.modo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      modoAtivo = btn.dataset.modo;
      montarFila();
      mostrarProximoCard();
    });
  });
}

function renderFiltros(materias) {
  const chipsHtml = materias.map(m => `
    <div class="chip" data-materia="${m.id}" style="--cor:${m.cor}">${m.nome}</div>
  `).join('');
  filtroContainer.innerHTML = `<div class="chip active" data-materia="todas">Todas</div>${chipsHtml}`;

  filtroContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      materiaAtiva = chip.dataset.materia;
      assuntoAtivo = 'todos';
      renderAssuntos();
      montarFila();
      mostrarProximoCard();
    });
  });
}

function renderAssuntos() {
  if (materiaAtiva === 'todas') {
    assuntoContainer.style.display = 'none';
    assuntoContainer.innerHTML = '';
    return;
  }

  const assuntosDaMateria = [...new Set(
    todosFlashcards
      .filter(c => c.materia_id === materiaAtiva && c.assunto)
      .map(c => c.assunto)
  )];

  if (!assuntosDaMateria.length) {
    assuntoContainer.style.display = 'none';
    assuntoContainer.innerHTML = '';
    return;
  }

  const chipsHtml = assuntosDaMateria.map(a => `
    <div class="chip-sub" data-assunto="${a}">${a}</div>
  `).join('');
  assuntoContainer.innerHTML = `<div class="chip-sub active" data-assunto="todos">Todos os assuntos</div>${chipsHtml}`;
  assuntoContainer.style.display = 'flex';

  assuntoContainer.querySelectorAll('.chip-sub').forEach(chip => {
    chip.addEventListener('click', () => {
      assuntoContainer.querySelectorAll('.chip-sub').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      assuntoAtivo = chip.dataset.assunto;
      montarFila();
      mostrarProximoCard();
    });
  });
}

function estaPendente(card) {
  if (!card.progresso) return true;
  return new Date(card.progresso.proxima_revisao) <= new Date();
}

function jaLembrado(card) {
  return card.progresso && card.progresso.nivel_memorizacao > 0;
}

function montarFila() {
  let base = materiaAtiva === 'todas'
    ? todosFlashcards
    : todosFlashcards.filter(c => c.materia_id === materiaAtiva);

  if (assuntoAtivo !== 'todos') {
    base = base.filter(c => c.assunto === assuntoAtivo);
  }

  fila = modoAtivo === 'sei'
    ? base.filter(jaLembrado)
    : base.filter(estaPendente);

  totalSessao = fila.length;
  atualizarStats();
}

function atualizarStats() {
  statRestantes.textContent = fila.length;
  statRevisados.textContent = revisadosHoje;

  const progresso = totalSessao > 0 ? ((totalSessao - fila.length) / totalSessao) * 100 : 0;
  progressoFill.style.width = `${progresso}%`;
}

function baseAtual() {
  let base = materiaAtiva === 'todas' ? todosFlashcards : todosFlashcards.filter(c => c.materia_id === materiaAtiva);
  if (assuntoAtivo !== 'todos') {
    base = base.filter(c => c.assunto === assuntoAtivo);
  }
  return base;
}

async function mostrarProximoCard() {
  virado = false;

  if (!fila.length) {
    cardAtual = null;

    if (modoAtivo === 'sei') {
      studyArea.innerHTML = `
        <div class="empty-state">
          Você ainda não tem flashcards marcados como "lembrei" por aqui.<br>
          Estuda um pouco na aba "Para revisar" primeiro 🙂
        </div>
      `;
      return;
    }

    studyArea.innerHTML = `
      <div class="empty-state">
        🎉 Você revisou todos os flashcards por aqui!<br>
        Volte mais tarde ou treine de novo sem esperar a data de revisão.
        <br><br>
        <button id="btn-revisar-tudo" style="padding:10px 20px;border-radius:999px;border:none;background:var(--gradient-primary);color:#fff;font-weight:700;cursor:pointer;">
          Revisar tudo de novo
        </button>
      </div>
    `;
    document.getElementById('btn-revisar-tudo').addEventListener('click', () => {
      fila = [...baseAtual()];
      totalSessao = fila.length;
      atualizarStats();
      mostrarProximoCard();
    });
    return;
  }

  cardAtual = fila[0];

  if (ultimoCardContadoId !== cardAtual.id) {
    const uso = await checarELimitarFlashcard();
    if (!uso.permitido) {
      renderLimiteAtingido(uso.limite);
      return;
    }
    ultimoCardContadoId = cardAtual.id;
  }

  const cor = cardAtual.materias?.cor || '#7c3aed';
  const nomeMateria = cardAtual.materias?.nome || 'Geral';

  studyArea.innerHTML = `
    <div class="fc-container" id="flashcard-container">
      <div class="fc-card" id="flashcard">
        <div class="fc-face fc-frente">
          <span class="fc-tag" style="background:${cor}22; color:${cor};">${nomeMateria}</span>
          ${cardAtual.frente}
          <span class="fc-hint">👆 toque para virar</span>
        </div>
        <div class="fc-face fc-verso">
          ${cardAtual.verso}
        </div>
      </div>
    </div>
    <div class="fc-avaliar-botoes" id="avaliar-botoes" style="display:none;">
      <button class="fc-btn-avaliar fc-errei" id="btn-errei">😵 Não lembrei</button>
      <button class="fc-btn-avaliar fc-acertei" id="btn-acertei">🙂 Lembrei</button>
    </div>
  `;

  document.getElementById('flashcard-container').addEventListener('click', virarCard);
  document.getElementById('btn-errei').addEventListener('click', () => avaliar(false));
  document.getElementById('btn-acertei').addEventListener('click', () => avaliar(true));
}

function virarCard() {
  if (virado) return;
  virado = true;
  document.getElementById('flashcard').classList.add('flipped');
  document.getElementById('avaliar-botoes').style.display = 'flex';
}

async function avaliar(acertou) {
  if (!cardAtual) return;
  const nivelAtual = cardAtual.progresso?.nivel_memorizacao ?? 0;
  const novoNivel = acertou ? Math.min(nivelAtual + 1, 5) : 0;
  const dias = INTERVALOS_DIAS[novoNivel];
  const proximaRevisao = new Date();
  proximaRevisao.setDate(proximaRevisao.getDate() + dias);

  await supabase.from('flashcards_progresso').upsert({
    user_id: userId,
    flashcard_id: cardAtual.id,
    nivel_memorizacao: novoNivel,
    proxima_revisao: proximaRevisao.toISOString(),
  });

  await supabase.from('sessoes_estudo').insert({
    user_id: userId,
    materia_id: cardAtual.materia_id,
    duracao_minutos: 1,
    tipo: 'flashcards',
  });

  verificarConquistas(userId);

  cardAtual.progresso = {
    flashcard_id: cardAtual.id,
    nivel_memorizacao: novoNivel,
    proxima_revisao: proximaRevisao.toISOString(),
  };

  const cardResolvido = fila.shift();

  if (acertou) {
    revisadosHoje++;
  } else {
    fila.push(cardResolvido);
  }

  atualizarStats();
  mostrarProximoCard();
}

iniciar();
iniciarBusca();
iniciarNotificacoes();
