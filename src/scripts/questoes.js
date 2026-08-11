import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { PONTOS_XP, xpParaProximoNivel } from '../utils/xp.js';
import { verificarConquistas } from './conquistas.js';

const container = document.getElementById('questao-container');
const filtroContainer = document.getElementById('filtro-materias');
const progressInfo = document.getElementById('progress-info');

let questoesCache = [];
let materiaAtiva = 'todas';
let indiceAtual = 0;
let respondida = false;
let acertos = 0;
let sessionUserId = null;

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  sessionUserId = session.user.id;

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  const { data: questoes } = await supabase
    .from('questoes')
    .select('id, enunciado, alternativas, resposta_correta, comentario, fonte, ano, dificuldade, materia_id, materias(nome, cor)');

  questoesCache = questoes || [];

  renderFiltros(materias || []);
  renderQuestaoAtual();
}

function renderFiltros(materias) {
  const chipsHtml = materias.map(m => `<div class="chip" data-materia="${m.id}">${m.nome}</div>`).join('');
  filtroContainer.innerHTML = `<div class="chip active" data-materia="todas">Todas</div>${chipsHtml}`;

  filtroContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      materiaAtiva = chip.dataset.materia;
      indiceAtual = 0;
      acertos = 0;
      renderQuestaoAtual();
    });
  });
}

function questoesFiltradas() {
  return materiaAtiva === 'todas'
    ? questoesCache
    : questoesCache.filter(q => q.materia_id === materiaAtiva);
}

function renderQuestaoAtual() {
  const lista = questoesFiltradas();
  respondida = false;

  if (!lista.length) {
    container.innerHTML = `<p class="empty-state">Nenhuma questão nessa matéria ainda. Volte em breve! ✅</p>`;
    progressInfo.textContent = '';
    return;
  }

  if (indiceAtual >= lista.length) {
    container.innerHTML = `
      <div class="card questao-card" style="text-align:center;">
        <h2>Você terminou! 🎉</h2>
        <p style="color:var(--text-secondary); margin-top:10px;">Acertou ${acertos} de ${lista.length} questões.</p>
        <button class="btn btn-primary" style="margin-top:18px;" onclick="location.reload()">Recomeçar</button>
      </div>`;
    progressInfo.textContent = '';
    return;
  }

  const q = lista[indiceAtual];
  const cor = q.materias?.cor || '#7c3aed';
  progressInfo.innerHTML = `<span>Questão ${indiceAtual + 1} de ${lista.length}</span><span>✅ ${acertos} acertos</span>`;

  container.innerHTML = `
    <div class="card questao-card fade-up">
      <span class="questao-tag" style="background:${cor}22; color:${cor};">${q.materias?.nome || 'Geral'} ${q.fonte ? '· ' + q.fonte : ''}</span>
      <p class="questao-enunciado">${q.enunciado}</p>
      <div id="alternativas-list"></div>
      <div class="feedback-box" id="feedback-box"></div>
      <div class="actions-row">
        <span></span>
        <button class="btn btn-primary" id="proxima-btn" style="display:none;">Próxima questão →</button>
      </div>
    </div>
  `;

  const altList = document.getElementById('alternativas-list');
  altList.innerHTML = q.alternativas.map(alt => `
    <div class="alternativa" data-letra="${alt.letra}">
      <span class="alt-letra">${alt.letra}</span>
      <span>${alt.texto}</span>
    </div>
  `).join('');

  altList.querySelectorAll('.alternativa').forEach(el => {
    el.addEventListener('click', () => selecionarResposta(el, q));
  });

  document.getElementById('proxima-btn').addEventListener('click', () => {
    indiceAtual++;
    renderQuestaoAtual();
  });
}

async function selecionarResposta(el, questao) {
  if (respondida) return;
  respondida = true;

  const letraEscolhida = el.dataset.letra;
  const acertou = letraEscolhida === questao.resposta_correta;
  if (acertou) acertos++;

  document.querySelectorAll('.alternativa').forEach(a => {
    if (a.dataset.letra === questao.resposta_correta) a.classList.add('correta');
    else if (a.dataset.letra === letraEscolhida) a.classList.add('errada');
  });

  const feedbackBox = document.getElementById('feedback-box');
  feedbackBox.classList.add(acertou ? 'acerto' : 'erro');
  feedbackBox.innerHTML = `
    <strong>${acertou ? '✅ Você acertou!' : '❌ Não foi dessa vez'}</strong>
    ${questao.comentario || 'Sem comentário disponível para esta questão.'}
  `;

  document.getElementById('proxima-btn').style.display = 'inline-flex';

  await registrarResposta(questao.materia_id, acertou);
}

async function registrarResposta(materiaId, acertou) {
  const xpGanho = acertou ? PONTOS_XP.questao_correta : PONTOS_XP.questao_errada;

  await supabase.from('sessoes_estudo').insert({
    user_id: sessionUserId,
    materia_id: materiaId,
    duracao_minutos: 2,
    tipo: 'questoes',
    acertou,
  });

  // Atualiza XP do perfil (e sobe de nível se necessário)
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

  await supabase
    .from('profiles')
    .update({ xp: novoXp, nivel: novoNivel })
    .eq('id', sessionUserId);

  verificarConquistas(sessionUserId);
}

iniciar();
iniciarBusca();
iniciarNotificacoes();
