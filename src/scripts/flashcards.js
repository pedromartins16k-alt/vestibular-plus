import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const studyArea = document.getElementById('study-area');
const filtroContainer = document.getElementById('filtro-materias');
const modoTabsContainer = document.getElementById('modo-tabs');
const statRestantes = document.getElementById('stat-restantes');
const statRevisados = document.getElementById('stat-revisados');
const progressoFill = document.getElementById('progresso-fill');

const INTERVALOS_DIAS = [1, 1, 3, 7, 15, 30]; // índice = nível de memorização após avaliar

let userId = null;
let todosFlashcards = [];
let materiaAtiva = 'todas';
let modoAtivo = 'revisar'; // 'revisar' = pendentes | 'sei' = já lembrados antes
let fila = [];
let totalSessao = 0;
let cardAtual = null;
let virado = false;
let revisadosHoje = 0;

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  userId = session.user.id;

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  const { data: flashcards } = await supabase
    .from('flashcards')
    .select('id, frente, verso, materia_id, materias(nome, cor)');

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
      montarFila();
      mostrarProximoCard();
    });
  });
}

function estaPendente(card) {
  if (!card.progresso) return true; // nunca estudado ainda
  return new Date(card.progresso.proxima_revisao) <= new Date();
}

function jaLembrado(card) {
  return card.progresso && card.progresso.nivel_memorizacao > 0;
}

function montarFila() {
  const base = materiaAtiva === 'todas'
    ? todosFlashcards
    : todosFlashcards.filter(c => c.materia_id === materiaAtiva);

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

function mostrarProximoCard() {
  virado = false;

  if (!fila.length) {
    cardAtual = null;

    if (modoAtivo === 'sei') {
      studyArea.innerHTML = `
        <div class="empty-state card-session">
          Você ainda não tem flashcards marcados como "lembrei" por aqui.<br>
          Estuda um pouco na aba "Para revisar" primeiro 🙂
        </div>
      `;
      return;
    }

    studyArea.innerHTML = `
      <div class="empty-state card-session">
        🎉 Você revisou todos os flashcards por aqui!<br>
        Volte mais tarde ou treine de novo sem esperar a data de revisão.
        <br><br>
        <button id="btn-revisar-tudo" style="padding:10px 20px;border-radius:999px;border:none;background:var(--gradient-primary);color:#fff;font-weight:700;cursor:pointer;">
          Revisar tudo de novo
        </button>
      </div>
    `;
    document.getElementById('btn-revisar-tudo').addEventListener('click', () => {
      const base = materiaAtiva === 'todas' ? todosFlashcards : todosFlashcards.filter(c => c.materia_id === materiaAtiva);
      fila = [...base];
      totalSessao = fila.length;
      atualizarStats();
      mostrarProximoCard();
    });
    return;
  }

  cardAtual = fila[0];
  const cor = cardAtual.materias?.cor || '#7c3aed';
  const nomeMateria = cardAtual.materias?.nome || 'Geral';

  studyArea.innerHTML = `
    <div class="card-session">
      <div class="flashcard-container" id="flashcard-container">
        <div class="flashcard" id="flashcard">
          <div class="flashcard-face frente">
            <span class="flashcard-tag" style="background:${cor}22; color:${cor};">${nomeMateria}</span>
            ${cardAtual.frente}
            <span class="flip-hint">👆 toque para virar</span>
          </div>
          <div class="flashcard-face verso">
            ${cardAtual.verso}
          </div>
        </div>
      </div>
      <div class="avaliar-botoes" id="avaliar-botoes" style="display:none;">
        <button class="btn-avaliar errei" id="btn-errei">😵 Não lembrei</button>
        <button class="btn-avaliar acertei" id="btn-acertei">🙂 Lembrei</button>
      </div>
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

  cardAtual.progresso = {
    flashcard_id: cardAtual.id,
    nivel_memorizacao: novoNivel,
    proxima_revisao: proximaRevisao.toISOString(),
  };

  const cardResolvido = fila.shift();

  if (acertou) {
    revisadosHoje++;
  } else {
    // não lembrou: volta pro fim da fila e repete na mesma sessão até acertar
    fila.push(cardResolvido);
  }

  atualizarStats();
  mostrarProximoCard();
}

iniciar();
iniciarBusca();
