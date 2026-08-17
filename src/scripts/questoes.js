
import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { PONTOS_XP, xpParaProximoNivel } from '../utils/xp.js';
import { verificarConquistas } from './conquistas.js';
import { buscarFavoritos, alternarFavorito } from './favoritos-global.js';

const container = document.getElementById('questao-container');
const filtroContainer = document.getElementById('filtro-materias');
const progressInfo = document.getElementById('progress-info');

const NIVEIS_DIFICULDADE = ['facil', 'medio', 'dificil', 'genio'];
const PLANO_PADRAO = { dificuldade_maxima: 'medio', percentual_banco_liberado: 30, limite_questoes_dia: 5 };

let questoesCache = [];
let materiasCache = [];
let aulasCache = [];

let materiaAtiva = 'todas';   // 'todas' ou id da matéria
let mostrandoTemas = false;   // true quando estamos na tela de seleção de tema
let temaAtivo = null;         // null (ainda não escolheu), 'todos' (todos os temas da matéria) ou id da aula

let indiceAtual = 0;
let respondida = false;
let acertos = 0;
let sessionUserId = null;
let favoritosSet = new Set();

let planoUsuario = PLANO_PADRAO;
let questoesVistasHoje = 0;
let hojeISO = new Date().toISOString().slice(0, 10);
let questaoAtualContada = false; // evita contar a mesma questão 2x em re-renders

async function buscarTodasQuestoes() {
  const TAMANHO_PAGINA = 1000;
  let todas = [];
  let pagina = 0;

  while (true) {
    const inicio = pagina * TAMANHO_PAGINA;
    const fim = inicio + TAMANHO_PAGINA - 1;

    const { data, error } = await supabase
      .from('questoes')
      .select('id, enunciado, alternativas, resposta_correta, comentario, fonte, ano, dificuldade, materia_id, aula_id, materias(nome, cor), treineiro_aulas(titulo)')
      .range(inicio, fim);

    if (error) {
      console.error('Erro ao buscar questões:', error);
      break;
    }

    todas = todas.concat(data || []);

    if (!data || data.length < TAMANHO_PAGINA) break;
    pagina++;
  }

  return todas;
}

function nivelPermitido(dificuldadeQuestao, maxPermitido) {
  const idxQuestao = NIVEIS_DIFICULDADE.indexOf(dificuldadeQuestao || 'facil');
  const idxMax = NIVEIS_DIFICULDADE.indexOf(maxPermitido || 'medio');
  return idxQuestao <= idxMax;
}

function aplicarPercentualBanco(lista, percentual) {
  const pct = Number(percentual);
  if (!pct || pct >= 100) return lista;

  const porMateria = new Map();
  lista.forEach(q => {
    if (!porMateria.has(q.materia_id)) porMateria.set(q.materia_id, []);
    porMateria.get(q.materia_id).push(q);
  });

  let resultado = [];
  porMateria.forEach(qs => {
    const qtd = Math.max(1, Math.ceil(qs.length * pct / 100));
    resultado = resultado.concat(qs.slice(0, qtd));
  });
  return resultado;
}

async function buscarPlanoUsuario() {
  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('planos(dificuldade_maxima, percentual_banco_liberado, limite_questoes_dia)')
    .eq('id', sessionUserId)
    .single();

  if (error || !perfil?.planos) {
    console.error('Erro ao buscar plano do usuário, aplicando limites do Free:', error);
    return PLANO_PADRAO;
  }
  return perfil.planos;
}

async function buscarUsoHoje() {
  const { data } = await supabase
    .from('uso_diario')
    .select('questoes_vistas')
    .eq('user_id', sessionUserId)
    .eq('data', hojeISO)
    .maybeSingle();

  return data?.questoes_vistas ?? 0;
}

async function registrarQuestaoVista() {
  if (!planoUsuario.limite_questoes_dia) return; // plano com uso ilimitado
  questoesVistasHoje++;
  await supabase
    .from('uso_diario')
    .upsert({ user_id: sessionUserId, data: hojeISO, questoes_vistas: questoesVistasHoje }, { onConflict: 'user_id,data' });
}

function limiteDiarioAtingido() {
  return !!planoUsuario.limite_questoes_dia && questoesVistasHoje >= planoUsuario.limite_questoes_dia;
}

function renderLimiteAtingido() {
  container.innerHTML = `
    <div class="card questao-card" style="text-align:center;">
      <h2>🔒 Limite diário atingido</h2>
      <p style="color:var(--text-secondary); margin-top:10px;">
        Seu plano permite ${planoUsuario.limite_questoes_dia} questões por dia. Volte amanhã ou faça upgrade pra continuar agora.
      </p>
      <a class="btn btn-primary" style="margin-top:18px; display:inline-flex;" href="./precos.html?upgrade=questoes">Ver planos</a>
    </div>`;
  progressInfo.textContent = '';
}

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  sessionUserId = session.user.id;

  planoUsuario = await buscarPlanoUsuario();
  questoesVistasHoje = await buscarUsoHoje();

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  const { data: aulas } = await supabase
    .from('treineiro_aulas')
    .select('id, titulo, materia_id, ordem')
    .order('ordem');

  const questoesBrutas = await buscarTodasQuestoes();
  const dentroDaDificuldade = questoesBrutas.filter(q => nivelPermitido(q.dificuldade, planoUsuario.dificuldade_maxima));
  const questoes = aplicarPercentualBanco(dentroDaDificuldade, planoUsuario.percentual_banco_liberado);

  materiasCache = materias || [];
  aulasCache = aulas || [];
  questoesCache = questoes;
  favoritosSet = await buscarFavoritos('questao');

  renderFiltros(materiasCache);
  renderQuestaoAtual();
}

function renderFiltros(materias) {
  const chipsHtml = materias.map(m => `<div class="chip" data-materia="${m.id}">${m.nome}</div>`).join('');
  filtroContainer.innerHTML = `<div class="chip active" data-materia="todas">Todas</div>${chipsHtml}`;

  filtroContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const materiaId = chip.dataset.materia;
      indiceAtual = 0;

      if (materiaId === 'todas') {
        materiaAtiva = 'todas';
        mostrandoTemas = false;
        temaAtivo = null;
        renderQuestaoAtual();
      } else {
        materiaAtiva = materiaId;
        mostrandoTemas = true;
        temaAtivo = null;
        renderTemas(materiaId);
      }
    });
  });
}

function questoesFiltradas() {
  if (materiaAtiva === 'todas') return questoesCache;

  const daMateria = questoesCache.filter(q => q.materia_id === materiaAtiva);

  if (!temaAtivo || temaAtivo === 'todos') return daMateria;

  return daMateria.filter(q => q.aula_id === temaAtivo);
}

function renderTemas(materiaId) {
  respondida = false;
  progressInfo.textContent = '';

  const materia = materiasCache.find(m => m.id === materiaId);
  const temas = aulasCache.filter(a => a.materia_id === materiaId);
  const questoesDaMateria = questoesCache.filter(q => q.materia_id === materiaId);

  if (!temas.length) {
    container.innerHTML = `
      <span class="back-link" id="voltar-materias-link" style="display:block; margin-bottom:12px;">← Voltar às matérias</span>
      <p class="empty-state">Ainda não há temas cadastrados para ${materia?.nome || 'essa matéria'}. Volte em breve! ✅</p>
    `;
    document.getElementById('voltar-materias-link').addEventListener('click', () => {
      filtroContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      filtroContainer.querySelector('[data-materia="todas"]').classList.add('active');
      materiaAtiva = 'todas';
      mostrandoTemas = false;
      temaAtivo = null;
      indiceAtual = 0;
      renderQuestaoAtual();
    });
    return;
  }

  const totalMateria = questoesDaMateria.length;

  const cardsHtml = temas.map(tema => {
    const qtd = questoesDaMateria.filter(q => q.aula_id === tema.id).length;
    return `
      <div class="tema-card" data-tema="${tema.id}">
        <div class="tema-card-titulo">${tema.titulo}</div>
        <div class="tema-card-count">${qtd} questõe${qtd === 1 ? '' : 's'}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="temas-header">
      <span class="back-link" id="voltar-materias-link">← Voltar às matérias</span>
      <h2 class="temas-titulo">${materia?.nome || ''}: escolha um tema</h2>
    </div>
    <div class="tema-grid">
      <div class="tema-card todos" data-tema="todos">
        <div class="tema-card-titulo">Todos os temas</div>
        <div class="tema-card-count">${totalMateria} questõe${totalMateria === 1 ? '' : 's'}</div>
      </div>
      ${cardsHtml}
    </div>
  `;

  document.getElementById('voltar-materias-link').addEventListener('click', () => {
    filtroContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    filtroContainer.querySelector('[data-materia="todas"]').classList.add('active');
    materiaAtiva = 'todas';
    mostrandoTemas = false;
    temaAtivo = null;
    indiceAtual = 0;
    renderQuestaoAtual();
  });

  container.querySelectorAll('.tema-card').forEach(card => {
    card.addEventListener('click', () => {
      temaAtivo = card.dataset.tema;
      mostrandoTemas = false;
      indiceAtual = 0;
      renderQuestaoAtual();
    });
  });
}

async function renderQuestaoAtual() {
  if (materiaAtiva !== 'todas' && mostrandoTemas) {
    renderTemas(materiaAtiva);
    return;
  }

  if (limiteDiarioAtingido()) {
    renderLimiteAtingido();
    return;
  }

  const lista = questoesFiltradas();
  respondida = false;
  questaoAtualContada = false;

  const voltarTemasHtml = materiaAtiva !== 'todas'
    ? `<span class="back-link" id="voltar-temas-link" style="display:block; margin-bottom:12px;">← Voltar aos temas</span>`
    : '';

  if (!lista.length) {
    container.innerHTML = `${voltarTemasHtml}<p class="empty-state">Nenhuma questão nesse tema ainda. Volte em breve! ✅</p>`;
    progressInfo.textContent = '';
    ligarVoltarTemas();
    return;
  }

  if (indiceAtual >= lista.length) {
    container.innerHTML = `
      ${voltarTemasHtml}
      <div class="card questao-card" style="text-align:center;">
        <h2>Você terminou! 🎉</h2>
        <p style="color:var(--text-secondary); margin-top:10px;">Acertou ${acertos} questões no total.</p>
        <button class="btn btn-primary" style="margin-top:18px;" onclick="location.reload()">Recomeçar</button>
      </div>`;
    progressInfo.textContent = '';
    ligarVoltarTemas();
    return;
  }

  const q = lista[indiceAtual];

  if (!questaoAtualContada) {
    questaoAtualContada = true;
    await registrarQuestaoVista();
  }

  const cor = q.materias?.cor || '#7c3aed';
  const favoritado = favoritosSet.has(q.id);
  const temaTitulo = q.treineiro_aulas?.titulo;
  const tagTexto = `${q.materias?.nome || 'Geral'}${temaTitulo ? ' · ' + temaTitulo : ''}${q.fonte ? ' · ' + q.fonte : ''}`;

  progressInfo.innerHTML = `<span>Questão ${indiceAtual + 1} de ${lista.length}</span><span>✅ ${acertos} acertos</span>`;

  container.innerHTML = `
    ${voltarTemasHtml}
    <div class="card questao-card fade-up">
      <div class="questao-topo">
        <span class="questao-tag" style="background:${cor}22; color:${cor};">${tagTexto}</span>
        <button class="favorito-btn ${favoritado ? 'ativo' : ''}" id="favorito-btn" title="Salvar para revisar depois">${favoritado ? '♥' : '♡'}</button>
      </div>
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

  document.getElementById('favorito-btn').addEventListener('click', () => toggleFavoritoQuestao(q.id));

  ligarVoltarTemas();
}

function ligarVoltarTemas() {
  const link = document.getElementById('voltar-temas-link');
  if (!link) return;
  link.addEventListener('click', () => {
    mostrandoTemas = true;
    temaAtivo = null;
    indiceAtual = 0;
    renderTemas(materiaAtiva);
  });
}

async function toggleFavoritoQuestao(id) {
  const estava = favoritosSet.has(id);
  const novoEstado = await alternarFavorito('questao', id, estava);
  if (novoEstado) favoritosSet.add(id); else favoritosSet.delete(id);

  const btn = document.getElementById('favorito-btn');
  if (btn) {
    btn.textContent = novoEstado ? '♥' : '♡';
    btn.classList.toggle('ativo', novoEstado);
  }
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
