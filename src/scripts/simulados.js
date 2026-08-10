import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { PONTOS_XP, xpParaProximoNivel } from '../utils/xp.js';

const conteudo = document.getElementById('conteudo');
let sessionUserId = null;

// Estado de um simulado em andamento
let questoesDoSimulado = [];
let indiceAtual = 0;
let respostasDadas = {}; // { questao_id: 'letra' }
let simuladoAtual = null;
let tempoRestante = 0;
let timerInterval = null;

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  sessionUserId = session.user.id;

  const { data: simulados } = await supabase
    .from('simulados')
    .select('id, titulo, descricao, tempo_limite_minutos')
    .order('criado_em', { ascending: false });

  renderListaSimulados(simulados || []);
}

function renderListaSimulados(simulados) {
  if (!simulados.length) {
    conteudo.innerHTML = `<p class="empty-state">Nenhum simulado disponível ainda. Volte em breve! ⏱️</p>`;
    return;
  }

  conteudo.innerHTML = simulados.map((s, i) => `
    <div class="card simulado-card fade-up">
      <h3>${s.titulo}</h3>
      <p>${s.descricao || ''}</p>
      <div class="simulado-meta">
        <span>⏱️ ${s.tempo_limite_minutos} minutos</span>
      </div>
      <button class="btn btn-primary" data-index="${i}">Começar simulado</button>
    </div>
  `).join('');

  conteudo.querySelectorAll('button[data-index]').forEach(btn => {
    btn.addEventListener('click', () => iniciarSimulado(simulados[btn.dataset.index]));
  });
}

async function iniciarSimulado(simulado) {
  simuladoAtual = simulado;

  const { data: vinculos } = await supabase
    .from('simulado_questoes')
    .select('ordem, questoes(id, enunciado, alternativas, resposta_correta, comentario, materia_id)')
    .eq('simulado_id', simulado.id)
    .order('ordem');

  questoesDoSimulado = (vinculos || []).map(v => v.questoes);
  indiceAtual = 0;
  respostasDadas = {};
  tempoRestante = simulado.tempo_limite_minutos * 60;

  iniciarCronometro();
  renderQuestaoAtual();
}

function iniciarCronometro() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    tempoRestante--;
    const badge = document.getElementById('timer-badge');
    if (badge) badge.textContent = `⏱️ ${formatarTempo(tempoRestante)}`;
    if (tempoRestante <= 0) {
      clearInterval(timerInterval);
      finalizarSimulado();
    }
  }, 1000);
}

function formatarTempo(segundos) {
  const m = Math.floor(segundos / 60).toString().padStart(2, '0');
  const s = (segundos % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function renderQuestaoAtual() {
  const q = questoesDoSimulado[indiceAtual];

  conteudo.innerHTML = `
    <div class="progress-info">
      <span>Questão ${indiceAtual + 1} de ${questoesDoSimulado.length}</span>
      <span class="timer-badge" id="timer-badge">⏱️ ${formatarTempo(tempoRestante)}</span>
    </div>
    <div class="card questao-card fade-up">
      <p class="questao-enunciado">${q.enunciado}</p>
      <div id="alternativas-list"></div>
      <div class="actions-row">
        <button class="btn btn-ghost" id="anterior-btn" ${indiceAtual === 0 ? 'disabled style="opacity:.4;"' : ''}>← Anterior</button>
        <button class="btn btn-primary" id="proximo-btn">
          ${indiceAtual === questoesDoSimulado.length - 1 ? 'Finalizar simulado' : 'Próxima →'}
        </button>
      </div>
    </div>
  `;

  const altList = document.getElementById('alternativas-list');
  altList.innerHTML = q.alternativas.map(alt => `
    <div class="alternativa ${respostasDadas[q.id] === alt.letra ? 'selecionada' : ''}" data-letra="${alt.letra}">
      <span class="alt-letra">${alt.letra}</span>
      <span>${alt.texto}</span>
    </div>
  `).join('');

  altList.querySelectorAll('.alternativa').forEach(el => {
    el.addEventListener('click', () => {
      respostasDadas[q.id] = el.dataset.letra;
      renderQuestaoAtual();
    });
  });

  document.getElementById('anterior-btn').addEventListener('click', () => {
    if (indiceAtual > 0) { indiceAtual--; renderQuestaoAtual(); }
  });

  document.getElementById('proximo-btn').addEventListener('click', () => {
    if (indiceAtual < questoesDoSimulado.length - 1) {
      indiceAtual++;
      renderQuestaoAtual();
    } else {
      finalizarSimulado();
    }
  });
}

async function finalizarSimulado() {
  clearInterval(timerInterval);

  let acertos = 0;
  questoesDoSimulado.forEach(q => {
    if (respostasDadas[q.id] === q.resposta_correta) acertos++;
  });
  const nota = Math.round((acertos / questoesDoSimulado.length) * 100);

  await supabase.from('simulado_respostas').insert({
    user_id: sessionUserId,
    simulado_id: simuladoAtual.id,
    respostas: respostasDadas,
    nota,
  });

  await supabase.from('sessoes_estudo').insert({
    user_id: sessionUserId,
    materia_id: null,
    duracao_minutos: simuladoAtual.tempo_limite_minutos,
    tipo: 'simulado',
  });

  await concederXp(PONTOS_XP.simulado_finalizado);

  conteudo.innerHTML = `
    <div class="card resultado-card fade-up">
      <p style="color:var(--text-secondary); margin-bottom:6px;">Você finalizou o simulado!</p>
      <div class="resultado-nota">${nota}%</div>
      <p style="color:var(--text-secondary); margin-top:6px;">${acertos} de ${questoesDoSimulado.length} questões corretas</p>
      <p style="margin-top:12px; color:var(--color-success); font-weight:600;">+${PONTOS_XP.simulado_finalizado} XP ganhos 🎉</p>
      <a class="btn btn-primary" href="./simulados.html" style="margin-top:20px; display:inline-flex;">Voltar aos simulados</a>
    </div>
  `;
}

async function concederXp(xpGanho) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('xp, nivel')
    .eq('id', sessionUserId)
    .single();
  if (!profile) return;

  let novoXp = profile.xp + xpGanho;
  let novoNivel = profile.nivel;
  while (novoXp >= xpParaProximoNivel(novoNivel)) {
    novoXp -= xpParaProximoNivel(novoNivel);
    novoNivel++;
  }

  await supabase.from('profiles').update({ xp: novoXp, nivel: novoNivel }).eq('id', sessionUserId);
}

iniciar();
iniciarBusca();
iniciarNotificacoes();
