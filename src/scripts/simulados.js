import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { PONTOS_XP, xpParaProximoNivel } from '../utils/xp.js';
import { verificarConquistas } from './conquistas.js';

const conteudo = document.getElementById('conteudo');
const filtrosTabs = document.getElementById('filtros-tabs');
let sessionUserId = null;

let todosSimulados = [];
let filtroAtual = 'todos';
let nomePlanoUsuario = 'free';

let questoesDoSimulado = [];
let indiceAtual = 0;
let respostasDadas = {};
let simuladoAtual = null;
let tempoRestante = 0;
let timerInterval = null;

const ORDEM_DIFICULDADE = { facil: 0, medio: 1, dificil: 2, genio: 3 };
const LABEL_DIFICULDADE = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', genio: 'Gênio' };
const FILTROS = [
  { chave: 'todos', label: 'Tudo' },
  { chave: 'facil', label: 'Fácil' },
  { chave: 'medio', label: 'Médio' },
  { chave: 'dificil', label: 'Difícil' },
  { chave: 'genio', label: 'Gênio' },
];

function getPlanoExclusivo(dificuldade) {
  if (dificuldade === 'genio') {
    return {
      nome: 'Ultimate',
      classe: 'ultimate',
      gradiente: 'linear-gradient(135deg, #f472b6, #c084fc, #60a5fa)',
      desc: 'no nível Gênio'
    };
  }
  if (dificuldade === 'dificil') {
    return {
      nome: 'PRO',
      classe: 'pro',
      gradiente: 'linear-gradient(135deg, #7c3aed, #a855f7)',
      desc: 'no nível Difícil'
    };
  }
  return {
    nome: 'Basic',
    classe: 'basic',
    gradiente: 'linear-gradient(135deg, #0284c7, #38bdf8)',
    desc: 'no nível Médio'
  };
}

function renderIconeCadeado(tipo) {
  if (tipo === 'ultimate') {
    return `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline-block; vertical-align:middle;">
        <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/>
        <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradUltSim)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        <circle cx="12" cy="15" r="1.5" fill="#34d399"/>
        <path d="M12 16.5V18.5" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="gradUltSim" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop stop-color="#f472b6"/>
            <stop offset="0.5" stop-color="#c084fc"/>
            <stop offset="1" stop-color="#60a5fa"/>
          </linearGradient>
        </defs>
      </svg>
    `;
  }
  if (tipo === 'basic') {
    return `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline-block; vertical-align:middle;">
        <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradBasicSim)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>
        <circle cx="12" cy="15" r="1.5" fill="#bae6fd"/>
        <path d="M12 16.5V18.5" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="gradBasicSim" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop stop-color="#0284c7"/>
            <stop offset="1" stop-color="#38bdf8"/>
          </linearGradient>
        </defs>
      </svg>
    `;
  }
  return `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline-block; vertical-align:middle;">
      <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradProSim)" stroke="rgba(168,85,247,0.5)" stroke-width="1"/>
      <circle cx="12" cy="15" r="1.5" fill="#e9d5ff"/>
      <path d="M12 16.5V18.5" stroke="#e9d5ff" stroke-width="2" stroke-linecap="round"/>
      <defs>
        <linearGradient id="gradProSim" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7c3aed"/>
          <stop offset="1" stop-color="#a855f7"/>
        </linearGradient>
      </defs>
    </svg>
  `;
}

function marcarSimuladosLiberadosEBloqueados(lista, nomePlano) {
  const plano = (nomePlano || 'free').toLowerCase();

  const medios = lista.filter(s => (s.dificuldade || 'facil') === 'medio');
  const qtdMediosLiberadosFree = Math.max(1, Math.ceil(medios.length * 0.5));
  const idsMediosLiberados = new Set(medios.slice(0, qtdMediosLiberadosFree).map(s => s.id));

  return lista.map(s => {
    const nivel = s.dificuldade || 'facil';
    let bloqueado = false;

    if (plano === 'premium' || plano === 'ultimate') {
      bloqueado = false;
    } else if (plano === 'pro') {
      bloqueado = (nivel === 'genio');
    } else if (plano === 'basic') {
      bloqueado = (nivel === 'dificil' || nivel === 'genio');
    } else {
      if (nivel === 'facil') {
        bloqueado = false;
      } else if (nivel === 'medio') {
        bloqueado = !idsMediosLiberados.has(s.id);
      } else {
        bloqueado = true;
      }
    }

    return { ...s, bloqueado };
  });
}

async function buscarNomePlanoUsuario() {
  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('planos(nome)')
    .eq('id', sessionUserId)
    .single();

  if (error || !perfil?.planos?.nome) {
    return 'free';
  }
  return perfil.planos.nome;
}

function mostrarModalUpgrade(mensagem, infoPlano = { nome: 'Basic', gradiente: 'linear-gradient(135deg, #0284c7, #38bdf8)' }) {
  let modalUpgrade = document.getElementById('modal-upgrade-alerta');
  if (!modalUpgrade) {
    modalUpgrade = document.createElement('div');
    modalUpgrade.id = 'modal-upgrade-alerta';
    modalUpgrade.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;backdrop-filter:blur(6px);animation:fadeIn .2s ease;';
    document.body.appendChild(modalUpgrade);
  }

  const isUltimate = infoPlano.nome === 'Ultimate';
  const isBasic = infoPlano.nome === 'Basic';

  let iconeHtml = `<div style="font-size:3rem;margin-bottom:12px;">🔒</div>`;
  let bordaCor = 'rgba(168,85,247,.4)';

  if (isUltimate) {
    bordaCor = 'rgba(244,114,182,.5)';
    iconeHtml = `
      <div style="margin-bottom:14px;">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" style="filter:drop-shadow(0 6px 16px rgba(244,114,182,.5));">
          <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/>
          <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradPadlockModalSim)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
          <circle cx="12" cy="15" r="1.5" fill="#34d399"/>
          <path d="M12 16.5V18.5" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
          <defs>
            <linearGradient id="gradPadlockModalSim" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#f472b6"/>
              <stop offset="0.5" stop-color="#c084fc"/>
              <stop offset="1" stop-color="#60a5fa"/>
            </linearGradient>
          </defs>
        </svg>
      </div>`;
  } else if (isBasic) {
    bordaCor = 'rgba(56,189,248,.5)';
    iconeHtml = `
      <div style="margin-bottom:14px;">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" style="filter:drop-shadow(0 6px 16px rgba(56,189,248,.5));">
          <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
          <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradBasicModalSim)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>
          <circle cx="12" cy="15" r="1.5" fill="#bae6fd"/>
          <path d="M12 16.5V18.5" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/>
          <defs>
            <linearGradient id="gradBasicModalSim" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#0284c7"/>
              <stop offset="1" stop-color="#38bdf8"/>
            </linearGradient>
          </defs>
        </svg>
      </div>`;
  }

  modalUpgrade.innerHTML = `
    <div style="background:var(--bg-card, #13111c);border:1px solid ${bordaCor};border-radius:20px;max-width:440px;width:100%;padding:32px 24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.6);position:relative;">
      <button id="fechar-modal-upgrade" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-secondary,#a1a1aa);font-size:1.2rem;cursor:pointer;">✕</button>
      ${iconeHtml}
      <h3 style="font-size:1.35rem;font-family:'Sora',sans-serif;margin-bottom:10px;color:#fff;">
        Exclusivo Plano <span style="background:${infoPlano.gradiente};-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${infoPlano.nome}</span>
      </h3>
      <p style="font-size:.92rem;color:var(--text-secondary,#a1a1aa);line-height:1.6;margin-bottom:24px;">${mensagem}</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="./precos.html?plano=${infoPlano.nome.toLowerCase()}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:${infoPlano.gradiente};color:#fff;text-decoration:none;font-weight:700;font-size:.95rem;box-shadow:0 4px 18px rgba(0,0,0,.4);transition:transform .2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
          🚀 Desbloquear no Plano ${infoPlano.nome}
        </a>
        <button id="cancelar-upgrade" style="background:none;border:none;color:var(--text-secondary,#71717a);font-size:.85rem;cursor:pointer;padding:6px;">Continuar no plano Free</button>
      </div>
    </div>
  `;

  const fechar = () => { modalUpgrade.style.display = 'none'; };
  document.getElementById('fechar-modal-upgrade').onclick = fechar;
  document.getElementById('cancelar-upgrade').onclick = fechar;
  modalUpgrade.onclick = (e) => { if (e.target === modalUpgrade) fechar(); };

  modalUpgrade.style.display = 'flex';
}

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  sessionUserId = session.user.id;

  nomePlanoUsuario = await buscarNomePlanoUsuario();

  const { data: simulados } = await supabase
    .from('simulados')
    .select('id, titulo, descricao, tempo_limite_minutos, dificuldade, vestibulares(nome)')
    .order('criado_em', { ascending: false });

  const lista = marcarSimuladosLiberadosEBloqueados(simulados || [], nomePlanoUsuario);

  todosSimulados = lista.slice().sort((a, b) => {
    const da = ORDEM_DIFICULDADE[a.dificuldade] ?? 99;
    const db = ORDEM_DIFICULDADE[b.dificuldade] ?? 99;
    if (da !== db) return da - db;
    return a.titulo.localeCompare(b.titulo);
  });

  renderFiltros();
  renderListaSimulados(aplicarFiltro(todosSimulados));
}

function renderFiltros() {
  filtrosTabs.innerHTML = FILTROS.map(f => {
    const classes = `chip ${filtroAtual === f.chave ? 'active' : ''}`;
    return `<div class="${classes}" data-filtro="${f.chave}">${f.label}</div>`;
  }).join('');

  filtrosTabs.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => {
      filtroAtual = el.dataset.filtro;
      renderFiltros();
      renderListaSimulados(aplicarFiltro(todosSimulados));
    });
  });
}

function aplicarFiltro(lista) {
  if (filtroAtual === 'todos') return lista;
  return lista.filter(s => s.dificuldade === filtroAtual);
}

function renderListaSimulados(simulados) {
  if (!simulados.length) {
    conteudo.innerHTML = `<p class="empty-state">Nenhum simulado nesse nível ainda. Tente outro filtro! ⏱️</p>`;
    return;
  }

  conteudo.innerHTML = simulados.map((s, i) => {
    const dificuldadeLabel = LABEL_DIFICULDADE[s.dificuldade] || '';
    const vestibularNome = s.vestibulares?.nome || '';
    const estaBloqueado = s.bloqueado;
    const infoPlano = getPlanoExclusivo(s.dificuldade);

    return `
    <div class="card simulado-card fade-up ${estaBloqueado ? 'bloqueado' : ''}">
      <div class="simulado-badges" style="justify-content:space-between; align-items:center;">
        <div style="display:flex; gap:8px; align-items:center;">
          ${dificuldadeLabel ? `<span class="badge-dificuldade badge-${s.dificuldade}">${dificuldadeLabel}</span>` : ''}
          ${vestibularNome ? `<span class="badge-vestibular">${vestibularNome}</span>` : ''}
        </div>
        ${estaBloqueado ? `<span class="cadeado-badge ${infoPlano.classe}">${renderIconeCadeado(infoPlano.classe)} Exclusivo ${infoPlano.nome}</span>` : ''}
      </div>
      <h3>${s.titulo}</h3>
      <p style="${estaBloqueado ? 'filter:blur(3px); user-select:none;' : ''}">${s.descricao || 'Simulado preparatório completo com cronômetro e ranking.'}</p>
      <div class="simulado-meta">
        <span>⏱️ ${s.tempo_limite_minutos} minutos</span>
      </div>
      ${estaBloqueado
        ? `<button class="btn" style="width:100%; background:${infoPlano.gradiente}; color:#fff; font-weight:700;" data-index="${i}">
             ${renderIconeCadeado(infoPlano.classe)} Desbloquear no Plano ${infoPlano.nome} →
           </button>`
        : `<button class="btn btn-primary" style="width:100%;" data-index="${i}">Começar simulado</button>`
      }
    </div>
  `;
  }).join('');

  conteudo.querySelectorAll('button[data-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const simulado = simulados[btn.dataset.index];
      if (simulado.bloqueado) {
        const info = getPlanoExclusivo(simulado.dificuldade);
        mostrarModalUpgrade(
          `Este simulado ${info.desc} é exclusivo para assinantes do plano ${info.nome}.`,
          info
        );
      } else {
        handleIniciarSimulado(simulado);
      }
    });
  });
}

// Checa o limite semanal do plano ANTES de deixar o aluno começar a prova.
async function handleIniciarSimulado(simulado) {
  const { data: uso, error } = await supabase.rpc('verificar_e_registrar_uso', { p_tipo: 'simulado' });

  if (error) {
    console.error('[uso simulado]', error);
    iniciarSimulado(simulado);
    return;
  }

  if (!uso.permitido) {
    const msg = uso.motivo === 'limite_semanal'
      ? `Você já fez ${uso.usado} de ${uso.limite} simulados essa semana no seu plano atual.`
      : 'Não foi possível verificar seu acesso agora. Tenta de novo em instantes.';
    mostrarModalUpgrade(msg, { nome: 'Basic', gradiente: 'linear-gradient(135deg, #0284c7, #38bdf8)' });
    return;
  }

  iniciarSimulado(simulado);
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

  filtrosTabs.style.display = 'none';
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
  await verificarConquistas(sessionUserId);

  filtrosTabs.style.display = '';

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
