import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { registrarResultado as registrarRevisaoEspacada } from '../utils/revisao.js';
import {
  obterOrdemPlano,
  canAccessDifficulty,
  getPlanoMinimoParaDificuldade,
  PLAN_LIMITS,
  isUltimate
} from '../lib/permissions.js';

// Elementos do DOM
const conteudo = document.getElementById('conteudo');
const filtrosTabs = document.getElementById('filtros-tabs');
const simFiltrosBar = document.getElementById('sim-filtros-bar');
const contadorSimulados = document.getElementById('contador-simulados');
const mainNavTabs = document.getElementById('main-nav-tabs');
const modalContainer = document.getElementById('modal-container');

// Estado Global
let sessionUser = null;
let sessionUserId = null;
let nomePlanoUsuario = 'free';
let abaAtiva = 'disponiveis'; // 'disponiveis' | 'historico'

let todosSimulados = [];
let filtroDificuldade = 'todos';
let historicoSimulados = [];

// Estado da Sessão de Prova Ativa
let simuladoAtual = null;
let questoesDoSimulado = [];
let indiceAtual = 0;
let respostasDadas = {}; // { [questaoId]: 'A' | 'B' | ... }
let questoesMarcadas = new Set(); // Set de IDs marcadas para revisão

let fimTimestamp = null;
let duracaoTotalSegundos = 0;
let timerInterval = null;
let avisosTempoExibidos = { p50: false, p25: false, p10: false, p5: false };

const ORDEM_DIFICULDADE = { facil: 0, medio: 1, dificil: 2, genio: 3 };
const LABEL_DIFICULDADE = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', genio: 'Gênio' };
const FILTROS = [
  { chave: 'todos', label: 'Todos os Níveis' },
  { chave: 'facil', label: 'Fácil' },
  { chave: 'medio', label: 'Médio' },
  { chave: 'dificil', label: 'Difícil' },
  { chave: 'genio', label: 'Gênio' },
];

function getPlanoExclusivo(dificuldade) {
  return getPlanoMinimoParaDificuldade(dificuldade);
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
  const ordemPlano = obterOrdemPlano(nomePlano || 'free');
  return lista.map(s => {
    const nivel = s.dificuldade || 'facil';
    const liberado = canAccessDifficulty(ordemPlano, nivel);
    return { ...s, bloqueado: !liberado };
  });
}

async function buscarNomePlanoUsuario(userId) {
  if (!userId) return 'free';
  try {
    const { data: perfil, error } = await supabase
      .from('profiles')
      .select('planos(nome)')
      .eq('id', userId)
      .single();

    if (error || !perfil?.planos?.nome) return 'free';
    return perfil.planos.nome;
  } catch (_) {
    return 'free';
  }
}

function mostrarModalUpgrade(mensagem, infoPlano = { nome: 'Basic', gradiente: 'linear-gradient(135deg, #0284c7, #38bdf8)' }) {
  let modalUpgrade = document.getElementById('modal-upgrade-alerta');
  if (!modalUpgrade) {
    modalUpgrade = document.createElement('div');
    modalUpgrade.id = 'modal-upgrade-alerta';
    modalUpgrade.className = 'sim-modal-overlay';
    document.body.appendChild(modalUpgrade);
  }

  const isUlt = infoPlano.nome === 'Ultimate';
  const isBas = infoPlano.nome === 'Basic';
  let iconeHtml = `<div style="font-size:3rem;margin-bottom:12px;">🔒</div>`;
  let bordaCor = 'rgba(168,85,247,.4)';

  if (isUlt) {
    bordaCor = 'rgba(244,114,182,.5)';
  } else if (isBas) {
    bordaCor = 'rgba(56,189,248,.5)';
  }

  modalUpgrade.innerHTML = `
    <div class="sim-modal-content" style="border-color:${bordaCor}; text-align:center;">
      <button id="fechar-modal-upgrade" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;">✕</button>
      ${iconeHtml}
      <h3 style="font-size:1.35rem;font-family:var(--font-display);margin-bottom:10px;color:#fff;">
        Exclusivo Plano <span style="background:${infoPlano.gradiente};-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${infoPlano.nome}</span>
      </h3>
      <p style="font-size:.92rem;color:var(--text-secondary);line-height:1.6;margin-bottom:24px;">${mensagem}</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="./precos.html?plano=${infoPlano.nome.toLowerCase()}" class="btn btn-primary" style="background:${infoPlano.gradiente}; justify-content:center;">
          🚀 Desbloquear no Plano ${infoPlano.nome}
        </a>
        <button id="cancelar-upgrade" class="btn btn-ghost" style="font-size:.85rem;">Continuar navegando</button>
      </div>
    </div>
  `;

  const fechar = () => { modalUpgrade.style.display = 'none'; };
  document.getElementById('fechar-modal-upgrade').onclick = fechar;
  document.getElementById('cancelar-upgrade').onclick = fechar;
  modalUpgrade.onclick = (e) => { if (e.target === modalUpgrade) fechar(); };
  modalUpgrade.style.display = 'flex';
}

// ============================================================================
// INICIALIZAÇÃO E CARREGAMENTO
// ============================================================================
async function iniciar() {
  renderFiltros();
  configurarAbas();

  // Verifica sessão (permite visitante ou logado)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    sessionUser = session.user;
    sessionUserId = session.user.id;
    nomePlanoUsuario = await buscarNomePlanoUsuario(sessionUserId);
  }

  await carregarSimulados();
}

function configurarAbas() {
  const btnDisponiveis = document.getElementById('tab-btn-disponiveis');
  const btnHistorico = document.getElementById('tab-btn-historico');

  btnDisponiveis.addEventListener('click', () => {
    abaAtiva = 'disponiveis';
    btnDisponiveis.classList.add('active');
    btnHistorico.classList.remove('active');
    simFiltrosBar.style.display = 'flex';
    renderListaSimulados(aplicarFiltro(todosSimulados));
  });

  btnHistorico.addEventListener('click', () => {
    abaAtiva = 'historico';
    btnHistorico.classList.add('active');
    btnDisponiveis.classList.remove('active');
    simFiltrosBar.style.display = 'none';
    carregarEExibirHistorico();
  });
}

async function carregarSimulados() {
  conteudo.innerHTML = `
    <div class="card" style="padding:48px; text-align:center;">
      <p style="color:var(--text-secondary); font-size:1.05rem;">Buscando simulados oficiais do acervo...</p>
    </div>
  `;

  try {
    const { data: simulados, error } = await supabase
      .from('simulados')
      .select('id, titulo, descricao, tempo_limite_minutos, dificuldade, vestibulares(nome), simulado_questoes(id)')
      .order('criado_em', { ascending: false });

    if (error) throw error;

    const lista = marcarSimuladosLiberadosEBloqueados(simulados || [], nomePlanoUsuario);

    todosSimulados = lista.slice().sort((a, b) => {
      const da = ORDEM_DIFICULDADE[a.dificuldade] ?? 99;
      const db = ORDEM_DIFICULDADE[b.dificuldade] ?? 99;
      if (da !== db) return da - db;
      return a.titulo.localeCompare(b.titulo);
    });

    renderListaSimulados(aplicarFiltro(todosSimulados));
  } catch (err) {
    console.error('[simulados] Erro ao carregar:', err);
    conteudo.innerHTML = `
      <div class="card" style="padding:40px; text-align:center;">
        <p style="color:var(--color-danger); font-weight:600; margin-bottom:12px;">Não foi possível carregar os simulados agora.</p>
        <button class="btn btn-secondary" onclick="window.location.reload()">Tentar novamente</button>
      </div>
    `;
  }
}

function renderFiltros() {
  filtrosTabs.innerHTML = FILTROS.map(f => {
    const classes = `chip ${filtroDificuldade === f.chave ? 'active' : ''}`;
    return `<div class="${classes}" data-filtro="${f.chave}">${f.label}</div>`;
  }).join('');

  filtrosTabs.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => {
      filtroDificuldade = el.dataset.filtro;
      renderFiltros();
      renderListaSimulados(aplicarFiltro(todosSimulados));
    });
  });
}

function aplicarFiltro(lista) {
  if (filtroDificuldade === 'todos') return lista;
  return lista.filter(s => s.dificuldade === filtroDificuldade);
}

function renderListaSimulados(simulados) {
  if (contadorSimulados) {
    contadorSimulados.textContent = `${simulados.length} ${simulados.length === 1 ? 'simulado disponível' : 'simulados disponíveis'}`;
  }

  if (!simulados.length) {
    conteudo.innerHTML = `
      <div class="card" style="padding:60px 20px; text-align:center;">
        <span style="font-size:2.8rem; display:block; margin-bottom:12px;">🔍</span>
        <h3 style="font-size:1.2rem; margin-bottom:8px;">Nenhum simulado encontrado</h3>
        <p style="color:var(--text-secondary); font-size:0.9rem; max-width:400px; margin:0 auto 20px;">Não encontramos provas cadastradas com os filtros selecionados.</p>
        <button class="btn btn-secondary" id="btn-resetar-filtros">Limpar filtros</button>
      </div>
    `;
    document.getElementById('btn-resetar-filtros')?.addEventListener('click', () => {
      filtroDificuldade = 'todos';
      renderFiltros();
      renderListaSimulados(todosSimulados);
    });
    return;
  }

  conteudo.innerHTML = `
    <div class="simulados-grid">
      ${simulados.map((s, i) => {
        const dificuldadeLabel = LABEL_DIFICULDADE[s.dificuldade] || 'Geral';
        const vestibularNome = s.vestibulares?.nome || 'Oficial';
        const estaBloqueado = s.bloqueado;
        const infoPlano = getPlanoExclusivo(s.dificuldade);
        const qtdQuestoes = s.simulado_questoes ? s.simulado_questoes.length : null;

        return `
        <div class="simulado-card ${estaBloqueado ? 'bloqueado' : ''}">
          <div>
            <div class="simulado-badges">
              <span class="badge-dificuldade badge-${s.dificuldade || 'facil'}">${dificuldadeLabel}</span>
              <span class="badge-vestibular">${vestibularNome}</span>
              ${qtdQuestoes ? `<span class="badge-questoes">${qtdQuestoes} Qs</span>` : ''}
              ${estaBloqueado ? `<span class="cadeado-badge ${infoPlano.classe}" style="margin-left:auto;">${renderIconeCadeado(infoPlano.classe)} ${infoPlano.nome}</span>` : ''}
            </div>
            <h3>${s.titulo}</h3>
            <p>${s.descricao || 'Simulado preparatório focado no padrão oficial das bancas com estatísticas por matéria e repetição espaçada.'}</p>
          </div>
          <div>
            <div class="simulado-meta-bar">
              <span>⏱️ ${s.tempo_limite_minutos} minutos de prova</span>
              <span>⚡ Resolução cronometrada</span>
            </div>
            ${estaBloqueado
              ? `<button class="btn" style="width:100%; background:${infoPlano.gradiente}; color:#fff; font-weight:700;" data-index="${i}">
                   ${renderIconeCadeado(infoPlano.classe)} Desbloquear (${infoPlano.nome}) →
                 </button>`
              : `<button class="btn btn-primary" style="width:100%;" data-index="${i}">
                   Iniciar Simulado →
                 </button>`
            }
          </div>
        </div>
        `;
      }).join('')}
    </div>
  `;

  conteudo.querySelectorAll('button[data-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const simulado = simulados[btn.dataset.index];
      if (simulado.bloqueado) {
        const info = getPlanoExclusivo(simulado.dificuldade);
        mostrarModalUpgrade(
          `Este simulado de nível ${info.desc} é exclusivo para alunos do plano ${info.nome}. Dê um upgrade para ter acesso irrestrito!`,
          info
        );
      } else {
        abrirPreFlightModal(simulado);
      }
    });
  });
}

// ============================================================================
// MODAL DE PREPARAÇÃO PRÉ-PROVA (PRE-FLIGHT CHECK)
// ============================================================================
async function abrirPreFlightModal(simulado) {
  modalContainer.innerHTML = `
    <div class="sim-modal-overlay" id="preflight-modal">
      <div class="sim-modal-content">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <span class="badge-vestibular" style="font-size:0.8rem;">Preparação para a Prova</span>
          <button id="btn-fechar-preflight" style="background:none; border:none; color:var(--text-secondary); font-size:1.2rem; cursor:pointer;">✕</button>
        </div>
        <h2 style="font-family:var(--font-display); font-size:1.4rem; margin-bottom:8px;">${simulado.titulo}</h2>
        <p style="color:var(--text-secondary); font-size:0.92rem; line-height:1.5; margin-bottom:20px;">
          ${simulado.descricao || 'Simulado completo com temporizador rigoroso. Ao iniciar, o cronômetro começará imediatamente.'}
        </p>

        <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px; margin-bottom:24px;">
          <h4 style="font-size:0.85rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary); margin-bottom:12px;">Instruções e Regras Oficiais</h4>
          <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:0.88rem; color:var(--text-primary);">
            <li style="display:flex; align-items:center; gap:8px;">
              <span>⏱️</span>
              <span><strong>Tempo Limite:</strong> ${simulado.tempo_limite_minutos} minutos corridos sem pausa.</span>
            </li>
            <li style="display:flex; align-items:center; gap:8px;">
              <span>🚩</span>
              <span><strong>Marcar Dúvidas:</strong> Você pode sinalizar questões para conferir antes da entrega.</span>
            </li>
            <li style="display:flex; align-items:center; gap:8px;">
              <span>📊</span>
              <span><strong>Gabarito e Correção:</strong> Liberados somente após a finalização da prova.</span>
            </li>
            <li style="display:flex; align-items:center; gap:8px;">
              <span>🧠</span>
              <span><strong>Repetição Espaçada:</strong> Seus erros serão agendados para revisão com o algoritmo SM-2.</span>
            </li>
          </ul>
        </div>

        <div style="display:flex; gap:12px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="btn-cancelar-preflight">Cancelar</button>
          <button class="btn btn-primary" id="btn-confirmar-inicio" style="min-width:180px;">
            Começar Agora 🚀
          </button>
        </div>
      </div>
    </div>
  `;

  const fechar = () => { modalContainer.innerHTML = ''; };
  document.getElementById('btn-fechar-preflight').onclick = fechar;
  document.getElementById('btn-cancelar-preflight').onclick = fechar;

  document.getElementById('btn-confirmar-inicio').onclick = async () => {
    fechar();
    await verificarLimiteEIniciar(simulado);
  };
}

async function verificarLimiteEIniciar(simulado) {
  if (!sessionUserId) {
    // Aluno visitante pode fazer para degustação
    iniciarSimulado(simulado);
    return;
  }

  const ordem = obterOrdemPlano(nomePlanoUsuario);
  const limitePlano = PLAN_LIMITS[(nomePlanoUsuario || 'free').toLowerCase()]?.simulados_semana;

  if (limitePlano === null || ordem >= 3 || isUltimate(nomePlanoUsuario)) {
    supabase.rpc('verificar_e_registrar_uso', { p_tipo: 'simulado' }).then(null, () => {});
    iniciarSimulado(simulado);
    return;
  }

  try {
    const { data: uso, error } = await supabase.rpc('verificar_e_registrar_uso', { p_tipo: 'simulado' });
    if (!error && uso && !uso.permitido) {
      const msg = uso.motivo === 'limite_semanal'
        ? `Você já atingiu seu limite de ${uso.limite || 5} simulados semanais no plano Free.`
        : 'Limite semanal atingido.';
      mostrarModalUpgrade(msg, { nome: 'Basic', gradiente: 'linear-gradient(135deg, #0284c7, #38bdf8)' });
      return;
    }
  } catch (err) {
    console.warn('[simulado uso rpc]', err);
  }

  iniciarSimulado(simulado);
}

// ============================================================================
// SALA DE PROVA / CARREGAMENTO DE QUESTÕES
// ============================================================================
async function iniciarSimulado(simulado) {
  simuladoAtual = simulado;

  conteudo.innerHTML = `
    <div class="card" style="padding:60px 20px; text-align:center;">
      <div style="font-size:2.5rem; margin-bottom:12px;">📝</div>
      <h3 style="font-size:1.3rem; margin-bottom:8px;">Preparando seu caderno de prova...</h3>
      <p style="color:var(--text-secondary); font-size:0.9rem;">Organizando questões oficiais e configurando cronômetro.</p>
    </div>
  `;

  // Oculta barras exteriores para foco absoluto na prova
  mainNavTabs.style.display = 'none';
  simFiltrosBar.style.display = 'none';

  try {
    const { data: vinculos, error } = await supabase
      .from('simulado_questoes')
      .select('ordem, questoes(id, enunciado, alternativas, resposta_correta, comentario, materia_id, dificuldade, materias(nome))')
      .eq('simulado_id', simulado.id)
      .order('ordem');

    if (error) throw error;

    questoesDoSimulado = (vinculos || [])
      .map(v => v.questoes)
      .filter(Boolean);

    if (questoesDoSimulado.length === 0) {
      conteudo.innerHTML = `
        <div class="card" style="padding:48px 24px; text-align:center;">
          <h3 style="font-size:1.2rem; margin-bottom:8px;">Nenhuma questão vinculada</h3>
          <p style="color:var(--text-secondary); margin-bottom:20px;">Este simulado ainda não possui questões publicadas no acervo.</p>
          <a class="btn btn-secondary" href="./simulados.html">Voltar para o Centro de Provas</a>
        </div>
      `;
      mainNavTabs.style.display = 'flex';
      simFiltrosBar.style.display = 'flex';
      return;
    }

    indiceAtual = 0;
    respostasDadas = {};
    questoesMarcadas.clear();
    avisosTempoExibidos = { p50: false, p25: false, p10: false, p5: false };

    // Configuração do Cronômetro Resiliente via Timestamp
    duracaoTotalSegundos = (simulado.tempo_limite_minutos || 60) * 60;
    fimTimestamp = Date.now() + (duracaoTotalSegundos * 1000);

    iniciarCronometroTimestamp();
    renderSalaDeProva();

  } catch (err) {
    console.error('[simulados] Erro ao carregar caderno de prova:', err);
    conteudo.innerHTML = `
      <div class="card" style="padding:40px; text-align:center;">
        <p style="color:var(--color-danger); margin-bottom:12px;">Falha ao carregar as questões deste simulado.</p>
        <a class="btn btn-secondary" href="./simulados.html">Voltar</a>
      </div>
    `;
    mainNavTabs.style.display = 'flex';
    simFiltrosBar.style.display = 'flex';
  }
}

// Cronômetro baseado em timestamp do relógio do sistema
function iniciarCronometroTimestamp() {
  clearInterval(timerInterval);

  const atualizar = () => {
    const agora = Date.now();
    const restantesMs = fimTimestamp - agora;
    const segundosRestantes = Math.max(0, Math.ceil(restantesMs / 1000));

    atualizarDisplayCronometro(segundosRestantes);

    // Alertas de progresso
    const porcentagemRestante = (segundosRestantes / duracaoTotalSegundos);
    if (!avisosTempoExibidos.p50 && porcentagemRestante <= 0.5) {
      avisosTempoExibidos.p50 = true;
      notificarTempo('Metade do tempo de prova decorrido! Mantenha seu ritmo.');
    } else if (!avisosTempoExibidos.p25 && porcentagemRestante <= 0.25) {
      avisosTempoExibidos.p25 = true;
      notificarTempo('Atenção: Restam 25% do tempo de prova.');
    } else if (!avisosTempoExibidos.p10 && porcentagemRestante <= 0.1) {
      avisosTempoExibidos.p10 = true;
      notificarTempo('Reta final: Restam 10% do tempo. Transfira suas respostas!');
    } else if (!avisosTempoExibidos.p5 && porcentagemRestante <= 0.05) {
      avisosTempoExibidos.p5 = true;
      notificarTempo('Últimos minutos de prova! Finalize suas marcações.');
    }

    if (segundosRestantes <= 0) {
      clearInterval(timerInterval);
      finalizarSimulado(true); // Finalização forçada por estouro de tempo
    }
  };

  timerInterval = setInterval(atualizar, 1000);
  atualizar();
}

function notificarTempo(msg) {
  const notif = document.createElement('div');
  notif.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 9999;
    background: #181524; border: 1px solid #f59e0b; color: #fff;
    padding: 12px 18px; border-radius: 12px; font-weight: 600; font-size: 0.88rem;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 10px;
    animation: fadeIn 0.3s ease;
  `;
  notif.innerHTML = `<span>⏳</span><span>${msg}</span>`;
  document.body.appendChild(notif);
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transition = 'opacity 0.4s ease';
    setTimeout(() => notif.remove(), 400);
  }, 4000);
}

function formatarTempo(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60).toString().padStart(2, '0');
  const s = (segundos % 60).toString().padStart(2, '0');
  if (h > 0) {
    return `${h}:${m}:${s}`;
  }
  return `${m}:${s}`;
}

function atualizarDisplayCronometro(segundos) {
  const timerEl = document.getElementById('timer-display');
  if (!timerEl) return;

  timerEl.textContent = formatarTempo(segundos);

  const container = document.getElementById('timer-box-container');
  if (!container) return;

  if (segundos < 300) { // menos de 5 min
    container.className = 'timer-box timer-critical';
  } else if (segundos < 900) { // menos de 15 min
    container.className = 'timer-box timer-warning';
  } else {
    container.className = 'timer-box';
  }
}

// ============================================================================
// RENDERIZAÇÃO DA SALA DE PROVA
// ============================================================================
function renderSalaDeProva() {
  const total = questoesDoSimulado.length;
  const q = questoesDoSimulado[indiceAtual];
  const questaoId = q.id;
  const foiMarcada = questoesMarcadas.has(questaoId);
  const respostaAtual = respostasDadas[questaoId];
  const materiaNome = q.materias?.nome || 'Conhecimentos Gerais';

  conteudo.innerHTML = `
    <!-- EXAM TOPBAR STICKY -->
    <div class="exam-topbar">
      <div class="exam-info-header">
        <div>
          <strong style="font-size:0.96rem; display:block; font-family:var(--font-display);">${simuladoAtual.titulo}</strong>
          <span style="font-size:0.8rem; color:var(--text-secondary);">Questão ${indiceAtual + 1} de ${total} · ${materiaNome}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="btn btn-ghost" id="btn-toggle-matriz" style="font-size:0.84rem; padding:6px 12px;">
          🗺️ Mapa de Questões
        </button>
        <div id="timer-box-container" class="timer-box">
          <span>⏱️</span>
          <span id="timer-display">--:--</span>
        </div>
      </div>
    </div>

    <!-- PAINEL RETRÁTIL: MAPA DE QUESTÕES (MATRIZ) -->
    <div class="matriz-questoes-panel" id="matriz-painel" style="display:none;">
      <div class="matriz-header">
        <span>Gabarito Visual de Navegação</span>
        <div class="matriz-legenda">
          <div class="legenda-item"><span class="dot-legenda" style="background:rgba(124,58,237,0.4); border:1px solid var(--color-primary-500);"></span> Respondida</div>
          <div class="legenda-item"><span class="dot-legenda" style="background:rgba(245,158,11,0.3); border:1px solid #f59e0b;"></span> Dúvida / Revisar</div>
          <div class="legenda-item"><span class="dot-legenda" style="background:var(--bg-elevated); border:1px solid var(--border-color);"></span> Em Branco</div>
        </div>
      </div>
      <div class="matriz-grid">
        ${questoesDoSimulado.map((item, idx) => {
          const resp = respostasDadas[item.id];
          const marc = questoesMarcadas.has(item.id);
          const isAt = idx === indiceAtual;
          let cls = 'matriz-btn';
          if (resp) cls += ' respondida';
          if (marc) cls += ' marcada';
          if (isAt) cls += ' atual';

          return `<button class="${cls}" data-goto="${idx}">${idx + 1}</button>`;
        }).join('')}
      </div>
    </div>

    <!-- CARD DA QUESTÃO ATUAL -->
    <div class="sim-questao-card fade-up">
      <div class="questao-top-info">
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="badge-vestibular">${materiaNome}</span>
          <span class="badge-dificuldade badge-${q.dificuldade || 'medio'}">${LABEL_DIFICULDADE[q.dificuldade] || 'Nível Médio'}</span>
        </div>
        <button class="btn-marcar-revisao ${foiMarcada ? 'marcado' : ''}" id="btn-marcar">
          ${foiMarcada ? '🚩 Marcada para Revisão' : '🏳️ Marcar para Revisão'}
        </button>
      </div>

      <div class="sim-enunciado">${q.enunciado}</div>

      <div class="sim-alternativas-list" id="lista-alternativas">
        ${renderAlternativasHtml(q, respostaAtual)}
      </div>

      <!-- BARRA DE NAVEGAÇÃO ENTRE QUESTÕES -->
      <div class="exam-bottom-actions">
        <button class="btn btn-ghost" id="btn-anterior" ${indiceAtual === 0 ? 'disabled style="opacity:.4; cursor:not-allowed;"' : ''}>
          ← Anterior
        </button>

        <button class="btn btn-secondary" id="btn-revisar-fim">
          📋 Revisão Pré-Entrega
        </button>

        ${indiceAtual === total - 1
          ? `<button class="btn btn-primary" id="btn-concluir">Entregar Prova ✓</button>`
          : `<button class="btn btn-primary" id="btn-proxima">Próxima →</button>`
        }
      </div>
    </div>
  `;

  // Event Listeners da Sala
  const restantesMs = Math.max(0, fimTimestamp - Date.now());
  atualizarDisplayCronometro(Math.ceil(restantesMs / 1000));

  // Alternativas
  document.querySelectorAll('.sim-alternativa').forEach(el => {
    el.addEventListener('click', () => {
      const letra = el.dataset.letra;
      respostasDadas[questaoId] = letra;
      renderSalaDeProva();
    });
  });

  // Marcar para revisão
  document.getElementById('btn-marcar').addEventListener('click', () => {
    if (questoesMarcadas.has(questaoId)) {
      questoesMarcadas.delete(questaoId);
    } else {
      questoesMarcadas.add(questaoId);
    }
    renderSalaDeProva();
  });

  // Toggle do mapa visual de questões
  const btnToggleMatriz = document.getElementById('btn-toggle-matriz');
  const painelMatriz = document.getElementById('matriz-painel');
  btnToggleMatriz.addEventListener('click', () => {
    painelMatriz.style.display = painelMatriz.style.display === 'none' ? 'block' : 'none';
  });

  // Botões do mapa de navegação
  document.querySelectorAll('.matriz-btn[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => {
      indiceAtual = parseInt(btn.dataset.goto, 10);
      renderSalaDeProva();
    });
  });

  // Navegação anterior / próxima
  document.getElementById('btn-anterior').addEventListener('click', () => {
    if (indiceAtual > 0) {
      indiceAtual--;
      renderSalaDeProva();
    }
  });

  const btnProx = document.getElementById('btn-proxima');
  if (btnProx) {
    btnProx.addEventListener('click', () => {
      if (indiceAtual < total - 1) {
        indiceAtual++;
        renderSalaDeProva();
      }
    });
  }

  // Revisão Pré-Entrega e Conclusão
  document.getElementById('btn-revisar-fim').addEventListener('click', abrirModalPreEntrega);
  document.getElementById('btn-concluir')?.addEventListener('click', abrirModalPreEntrega);
}

function renderAlternativasHtml(questao, selecionada) {
  let alternativas = questao.alternativas;
  if (typeof alternativas === 'string') {
    try {
      alternativas = JSON.parse(alternativas);
    } catch (_) {
      alternativas = [];
    }
  }

  if (!Array.isArray(alternativas)) return '<p style="color:var(--text-secondary);">Sem alternativas cadastradas.</p>';

  return alternativas.map(alt => {
    const isSel = selecionada === alt.letra;
    return `
      <div class="sim-alternativa ${isSel ? 'selecionada' : ''}" data-letra="${alt.letra}">
        <span class="sim-alt-letra">${alt.letra}</span>
        <div class="sim-alt-texto">${alt.texto}</div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// TELA / MODAL DE REVISÃO PRÉ-SUBMISSÃO (PRE-FINISH AUDIT)
// ============================================================================
function abrirModalPreEntrega() {
  const total = questoesDoSimulado.length;
  const respondidas = Object.keys(respostasDadas).length;
  const emBranco = total - respondidas;
  const marcadasQtd = questoesMarcadas.size;

  modalContainer.innerHTML = `
    <div class="sim-modal-overlay" id="modal-pre-entrega">
      <div class="sim-modal-content">
        <h3 style="font-family:var(--font-display); font-size:1.35rem; margin-bottom:8px;">Conferência de Gabarito</h3>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:20px;">
          Revise o status do seu preenchimento antes de submeter o exame para correção oficial.
        </p>

        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:24px;">
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:14px; text-align:center;">
            <div style="font-size:1.6rem; font-weight:800; color:#38bdf8;">${respondidas}</div>
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-secondary); margin-top:4px;">Respondidas</div>
          </div>
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:14px; text-align:center;">
            <div style="font-size:1.6rem; font-weight:800; color:${emBranco > 0 ? '#ef4444' : '#22c55e'};">${emBranco}</div>
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-secondary); margin-top:4px;">Em Branco</div>
          </div>
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:14px; text-align:center;">
            <div style="font-size:1.6rem; font-weight:800; color:#f59e0b;">${marcadasQtd}</div>
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-secondary); margin-top:4px;">Em Dúvida 🚩</div>
          </div>
        </div>

        ${emBranco > 0 ? `
          <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); padding:12px 16px; margin-bottom:20px; font-size:0.86rem; color:#fca5a5;">
            ⚠️ Você possui <strong>${emBranco}</strong> ${emBranco === 1 ? 'questão não respondida' : 'questões não respondidas'}. Tem certeza de que deseja entregar agora?
          </div>
        ` : `
          <div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:var(--radius-md); padding:12px 16px; margin-bottom:20px; font-size:0.86rem; color:#86efac;">
            ✓ Todas as ${total} questões do caderno foram preenchidas.
          </div>
        `}

        <div style="display:flex; justify-content:flex-end; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-ghost" id="btn-voltar-caderno">Voltar ao Caderno</button>
          <button class="btn btn-primary" id="btn-confirmar-entrega">
            Confirmar e Finalizar Simulado 🏁
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-caderno').onclick = () => {
    modalContainer.innerHTML = '';
  };

  document.getElementById('btn-confirmar-entrega').onclick = () => {
    modalContainer.innerHTML = '';
    finalizarSimulado(false);
  };
}

// ============================================================================
// FINALIZAÇÃO, PROCESSAMENTO E PERSISTÊNCIA NO BANCO
// ============================================================================
async function finalizarSimulado(forcarPorTempo = false) {
  clearInterval(timerInterval);

  conteudo.innerHTML = `
    <div class="card" style="padding:60px 20px; text-align:center;">
      <div style="font-size:2.8rem; margin-bottom:12px;">📊</div>
      <h3 style="font-size:1.3rem; margin-bottom:8px;">Tabulando resultados oficiais...</h3>
      <p style="color:var(--text-secondary); font-size:0.9rem;">Calculando nota, acurácia por disciplina e agendando revisões.</p>
    </div>
  `;

  const totalQuestoes = questoesDoSimulado.length;
  let acertos = 0;
  let erros = 0;
  const disciplinasEstat = {}; // { [nome]: { total: 0, acertos: 0 } }
  const questoesProcessadas = [];

  questoesDoSimulado.forEach(q => {
    const respostaDada = respostasDadas[q.id];
    const acertou = respostaDada === q.resposta_correta;
    const materiaNome = q.materias?.nome || 'Geral';

    if (!disciplinasEstat[materiaNome]) {
      disciplinasEstat[materiaNome] = { total: 0, acertos: 0 };
    }
    disciplinasEstat[materiaNome].total++;

    if (acertou) {
      acertos++;
      disciplinasEstat[materiaNome].acertos++;
    } else {
      erros++;
    }

    questoesProcessadas.push({
      ...q,
      respostaDada,
      acertou,
      materiaNome,
      marcadaParaRevisao: questoesMarcadas.has(q.id)
    });

    // INTEGRAÇÃO COM REPETIÇÃO ESPAÇADA (SM-2)
    if (sessionUserId && q.id) {
      const resultadoSM2 = acertou ? 'acerto' : 'erro';
      registrarRevisaoEspacada(sessionUserId, q.id, resultadoSM2, {
        tipoItem: 'questao',
        dificuldade: q.dificuldade || simuladoAtual?.dificuldade || 'medio'
      }).catch(err => {
        console.warn('[simulado revisao error]', err);
      });
    }
  });

  const nota = totalQuestoes > 0 ? Math.round((acertos / totalQuestoes) * 100) : 0;
  const tempoGastoMinutos = Math.max(1, Math.round((Date.now() - (fimTimestamp - duracaoTotalSegundos * 1000)) / 60000));

  let xpGanho = 0;

  // Persistência no Supabase para usuários logados
  if (sessionUserId && simuladoAtual?.id) {
    try {
      await supabase.from('simulado_respostas').insert({
        user_id: sessionUserId,
        simulado_id: simuladoAtual.id,
        respostas: respostasDadas,
        nota,
      });

      await supabase.from('sessoes_estudo').insert({
        user_id: sessionUserId,
        materia_id: null,
        duracao_minutos: tempoGastoMinutos,
        tipo: 'simulado',
      });

      const { data: resXp } = await supabase.rpc('conceder_xp', { p_tipo: 'simulado_finalizado' });
      if (resXp?.xp_ganho) xpGanho = resXp.xp_ganho;

      await supabase.rpc('verificar_conquistas', { p_user_id: sessionUserId });
    } catch (err) {
      console.warn('[simulado persistência]', err);
    }
  }

  // Restaura controles superiores
  mainNavTabs.style.display = 'flex';
  simFiltrosBar.style.display = 'none';

  renderTelaDeResultados({
    nota,
    acertos,
    erros,
    totalQuestoes,
    tempoGastoMinutos,
    xpGanho,
    disciplinasEstat,
    questoesProcessadas,
    forcarPorTempo
  });
}

// ============================================================================
// CENTRO DE RESULTADOS, ANÁLISE DE DESEMPENHO E REVISÃO DE ERROS
// ============================================================================
function renderTelaDeResultados(dados) {
  const {
    nota,
    acertos,
    erros,
    totalQuestoes,
    tempoGastoMinutos,
    xpGanho,
    disciplinasEstat,
    questoesProcessadas,
    forcarPorTempo
  } = dados;

  const questoesIncorretas = questoesProcessadas.filter(q => !q.acertou);
  const questoesDuvida = questoesProcessadas.filter(q => q.marcadaParaRevisao);

  conteudo.innerHTML = `
    <div class="resultado-container">
      
      <!-- HERO DO RESULTADO -->
      <div class="resultado-hero">
        ${forcarPorTempo ? `
          <div style="display:inline-block; padding:6px 14px; border-radius:var(--radius-full); background:rgba(239,68,68,0.15); color:#ef4444; font-weight:700; font-size:0.8rem; margin-bottom:12px;">
            ⏱️ Tempo limite esgotado — Prova finalizada automaticamente
          </div>
        ` : ''}

        <p style="color:var(--text-secondary); font-size:0.95rem; margin-bottom:4px;">Resultado do Simulado Oficial</p>
        <h2 style="font-family:var(--font-display); font-size:1.5rem; margin:0;">${simuladoAtual.titulo}</h2>
        
        <div class="resultado-score-big">${nota}%</div>

        <p style="color:var(--text-secondary); font-size:1rem; margin-bottom:12px;">
          Você acertou <strong>${acertos}</strong> de <strong>${totalQuestoes}</strong> questões
        </p>

        ${xpGanho > 0 ? `
          <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 16px; border-radius:var(--radius-full); background:rgba(34,197,94,0.15); color:#22c55e; font-weight:700; font-size:0.9rem;">
            <span>🎉</span> <span>+${xpGanho} XP adicionados ao seu perfil</span>
          </div>
        ` : ''}

        <div class="resultado-metricas-grid">
          <div class="resultado-metrica-card">
            <div class="resultado-metrica-val" style="color:#22c55e;">${acertos}</div>
            <div class="resultado-metrica-lbl">Acertos</div>
          </div>
          <div class="resultado-metrica-card">
            <div class="resultado-metrica-val" style="color:#ef4444;">${erros}</div>
            <div class="resultado-metrica-lbl">Erros</div>
          </div>
          <div class="resultado-metrica-card">
            <div class="resultado-metrica-val" style="color:#38bdf8;">${tempoGastoMinutos} min</div>
            <div class="resultado-metrica-lbl">Tempo de Prova</div>
          </div>
          <div class="resultado-metrica-card">
            <div class="resultado-metrica-val" style="color:#a855f7;">${questoesDuvida.length}</div>
            <div class="resultado-metrica-lbl">Em Dúvida 🚩</div>
          </div>
        </div>
      </div>

      <!-- DESEMPENHO POR DISCIPLINA / MATÉRIA -->
      <div class="card" style="padding:28px 24px; margin-bottom:28px;">
        <h3 style="font-size:1.15rem; font-family:var(--font-display); margin-bottom:16px;">
          📊 Aproveitamento por Disciplina
        </h3>
        <div style="display:flex; flex-direction:column; gap:16px;">
          ${Object.entries(disciplinasEstat).map(([nome, est]) => {
            const pct = est.total > 0 ? Math.round((est.acertos / est.total) * 100) : 0;
            return `
              <div>
                <div style="display:flex; justify-content:space-between; font-size:0.88rem; margin-bottom:6px;">
                  <strong>${nome}</strong>
                  <span style="color:var(--text-secondary);">${est.acertos}/${est.total} (${pct}%)</span>
                </div>
                <div style="height:8px; border-radius:var(--radius-full); background:var(--bg-elevated); overflow:hidden;">
                  <div style="height:100%; width:${pct}%; background:${pct >= 70 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'}; border-radius:var(--radius-full); transition:width 0.6s ease;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- GABARITO & REVISÃO COMENTADA DOS ERROS -->
      <div class="card" style="padding:28px 24px; margin-bottom:28px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:10px;">
          <h3 style="font-size:1.15rem; font-family:var(--font-display); margin:0;">
            🔍 Caderno de Correção Comentada (${questoesIncorretas.length} ${questoesIncorretas.length === 1 ? 'erro' : 'erros'})
          </h3>
          <div style="display:flex; gap:8px;">
            <button class="chip active" id="filtro-revisao-todos">Todos os Erros</button>
            ${questoesDuvida.length > 0 ? `<button class="chip" id="filtro-revisao-duvidas">Dúvidas (${questoesDuvida.length})</button>` : ''}
          </div>
        </div>

        <div id="lista-revisao-questoes" style="display:flex; flex-direction:column; gap:20px;">
          ${renderListaQuestoesRevisao(questoesIncorretas)}
        </div>
      </div>

      <!-- BOTÕES DE AÇÃO FINAL -->
      <div style="display:flex; justify-content:center; gap:16px; flex-wrap:wrap; margin-top:20px;">
        <a class="btn btn-primary" href="./simulados.html">
          Novo Simulado ⏱️
        </a>
        <a class="btn btn-secondary" href="./mapa-dominio.html">
          Ver Meu Domínio 🧬
        </a>
        <a class="btn btn-ghost" href="./dashboard.html">
          Voltar ao Dashboard
        </a>
      </div>

    </div>
  `;

  // Filtros de revisão
  const btnTodos = document.getElementById('filtro-revisao-todos');
  const btnDuvidas = document.getElementById('filtro-revisao-duvidas');
  const containerRevisao = document.getElementById('lista-revisao-questoes');

  btnTodos?.addEventListener('click', () => {
    btnTodos.classList.add('active');
    btnDuvidas?.classList.remove('active');
    containerRevisao.innerHTML = renderListaQuestoesRevisao(questoesIncorretas);
  });

  btnDuvidas?.addEventListener('click', () => {
    btnDuvidas.classList.add('active');
    btnTodos.classList.remove('active');
    containerRevisao.innerHTML = renderListaQuestoesRevisao(questoesDuvida);
  });
}

function renderListaQuestoesRevisao(questoes) {
  if (questoes.length === 0) {
    return `
      <div style="text-align:center; padding:32px 16px; color:var(--text-secondary);">
        <p style="font-size:1.1rem; color:var(--color-success); font-weight:700;">Parabéns! 100% de aproveitamento nesta seleção.</p>
        <p style="font-size:0.88rem;">Nenhum erro registrado neste filtro.</p>
      </div>
    `;
  }

  return questoes.map((q, idx) => {
    let alternativas = q.alternativas;
    if (typeof alternativas === 'string') {
      try { alternativas = JSON.parse(alternativas); } catch (_) { alternativas = []; }
    }

    return `
      <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <span style="font-weight:700; font-size:0.92rem;">Questão do Acervo · ${q.materiaNome}</span>
          <div style="display:flex; gap:6px;">
            ${q.acertou
              ? `<span style="padding:3px 10px; border-radius:var(--radius-full); font-size:0.75rem; font-weight:700; background:rgba(34,197,94,0.15); color:#22c55e;">Acerto ✓</span>`
              : `<span style="padding:3px 10px; border-radius:var(--radius-full); font-size:0.75rem; font-weight:700; background:rgba(239,68,68,0.15); color:#ef4444;">Errou ✕</span>`
            }
            ${q.marcadaParaRevisao ? `<span style="padding:3px 10px; border-radius:var(--radius-full); font-size:0.75rem; font-weight:700; background:rgba(245,158,11,0.15); color:#f59e0b;">Marcada 🚩</span>` : ''}
          </div>
        </div>

        <p style="font-size:0.95rem; line-height:1.6; margin-bottom:16px;">${q.enunciado}</p>

        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          ${Array.isArray(alternativas) ? alternativas.map(alt => {
            const isCorreta = alt.letra === q.resposta_correta;
            const foiMarcada = alt.letra === q.respostaDada;
            let bg = 'var(--bg-card)';
            let border = 'var(--border-color)';
            let icon = '';

            if (isCorreta) {
              bg = 'rgba(34,197,94,0.12)';
              border = '#22c55e';
              icon = '✓ Resposta Correta';
            } else if (foiMarcada && !isCorreta) {
              bg = 'rgba(239,68,68,0.12)';
              border = '#ef4444';
              icon = '✕ Sua Resposta';
            }

            return `
              <div style="padding:10px 14px; border-radius:var(--radius-md); border:1px solid ${border}; background:${bg}; display:flex; justify-content:space-between; align-items:center; font-size:0.88rem;">
                <div>
                  <strong>${alt.letra})</strong> ${alt.texto}
                </div>
                ${icon ? `<span style="font-size:0.75rem; font-weight:700; color:${isCorreta ? '#22c55e' : '#ef4444'};">${icon}</span>` : ''}
              </div>
            `;
          }).join('') : ''}
        </div>

        ${q.comentario ? `
          <div style="background:rgba(124,58,237,0.08); border-left:3px solid var(--color-primary-500); padding:12px 14px; border-radius:0 var(--radius-md) var(--radius-md) 0; font-size:0.86rem; color:var(--text-primary); line-height:1.5;">
            <strong>Comentário do Professor:</strong> ${q.comentario}
          </div>
        ` : ''}

        <div style="margin-top:12px; font-size:0.78rem; color:var(--text-secondary); display:flex; align-items:center; gap:6px;">
          <span>🧠</span>
          <span>Agendada para revisão espaçada (SM-2) para reforçar retenção em longo prazo.</span>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// ABA: HISTÓRICO & EVOLUÇÃO DO ALUNO
// ============================================================================
async function carregarEExibirHistorico() {
  conteudo.innerHTML = `
    <div class="card" style="padding:48px; text-align:center;">
      <p style="color:var(--text-secondary); font-size:1.05rem;">Carregando seu histórico de provas...</p>
    </div>
  `;

  if (!sessionUserId) {
    conteudo.innerHTML = `
      <div class="card" style="padding:60px 24px; text-align:center;">
        <span style="font-size:3rem; display:block; margin-bottom:12px;">🔒</span>
        <h3 style="font-size:1.3rem; margin-bottom:8px;">Histórico Exclusivo para Alunos Cadastrados</h3>
        <p style="color:var(--text-secondary); max-width:440px; margin:0 auto 24px; font-size:0.92rem;">
          Faça login ou crie sua conta gratuita para salvar suas notas, acompanhar sua evolução e habilitar revisões espaçadas.
        </p>
        <a class="btn btn-primary" href="./login.html" style="display:inline-flex;">Fazer Login / Criar Conta</a>
      </div>
    `;
    return;
  }

  try {
    const { data: respostas, error } = await supabase
      .from('simulado_respostas')
      .select('id, nota, finalizado_em, simulados(id, titulo, tempo_limite_minutos, dificuldade)')
      .eq('user_id', sessionUserId)
      .order('finalizado_em', { ascending: false });

    if (error) throw error;

    historicoSimulados = respostas || [];

    if (historicoSimulados.length === 0) {
      conteudo.innerHTML = `
        <div class="card" style="padding:60px 24px; text-align:center;">
          <span style="font-size:3rem; display:block; margin-bottom:14px;">🎯</span>
          <h3 style="font-size:1.3rem; margin-bottom:8px;">Você ainda não realizou simulados</h3>
          <p style="color:var(--text-secondary); max-width:440px; margin:0 auto 24px; font-size:0.92rem;">
            Teste seus conhecimentos com tempo oficial de prova para destravar gráficos de desempenho e calibrar sua rotina de estudos.
          </p>
          <button class="btn btn-primary" id="btn-comecar-primeiro-sim">
            Fazer Meu Primeiro Simulado 🚀
          </button>
        </div>
      `;
      document.getElementById('btn-comecar-primeiro-sim')?.addEventListener('click', () => {
        document.getElementById('tab-btn-disponiveis').click();
      });
      return;
    }

    // Calcula médias de evolução
    const totalSimulados = historicoSimulados.length;
    const mediaGeral = Math.round(historicoSimulados.reduce((acc, h) => acc + (h.nota || 0), 0) / totalSimulados);
    const melhorNota = Math.max(...historicoSimulados.map(h => h.nota || 0));

    conteudo.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:24px;">
        
        <!-- CARDS DE ESTATÍSTICA DO HISTÓRICO -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:16px;">
          <div class="card" style="padding:20px; text-align:center;">
            <div style="font-size:2rem; font-weight:800; font-family:var(--font-display); color:#38bdf8;">${totalSimulados}</div>
            <div style="font-size:0.78rem; text-transform:uppercase; color:var(--text-secondary); margin-top:4px;">Provas Realizadas</div>
          </div>
          <div class="card" style="padding:20px; text-align:center;">
            <div style="font-size:2rem; font-weight:800; font-family:var(--font-display); color:#22c55e;">${melhorNota}%</div>
            <div style="font-size:0.78rem; text-transform:uppercase; color:var(--text-secondary); margin-top:4px;">Melhor Nota</div>
          </div>
          <div class="card" style="padding:20px; text-align:center;">
            <div style="font-size:2rem; font-weight:800; font-family:var(--font-display); color:#a855f7;">${mediaGeral}%</div>
            <div style="font-size:0.78rem; text-transform:uppercase; color:var(--text-secondary); margin-top:4px;">Média Geral</div>
          </div>
        </div>

        <!-- LISTA DAS PROVAS FINALIZADAS -->
        <div class="historico-table-wrap">
          <div style="padding:18px 20px; border-bottom:1px solid var(--border-color); font-weight:700; font-size:1.05rem;">
            Cadernos Concluídos
          </div>
          ${historicoSimulados.map(item => {
            const dataFmt = item.finalizado_em ? new Date(item.finalizado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recentemente';
            const titulo = item.simulados?.titulo || 'Simulado Geral';
            const nota = item.nota || 0;
            const corNota = nota >= 70 ? '#22c55e' : nota >= 50 ? '#f59e0b' : '#ef4444';

            return `
              <div class="historico-item">
                <div>
                  <strong style="font-size:1rem; display:block; margin-bottom:4px;">${titulo}</strong>
                  <span style="font-size:0.8rem; color:var(--text-secondary);">Realizado em ${dataFmt}</span>
                </div>
                <div style="display:flex; align-items:center; gap:16px;">
                  <div style="font-size:1.4rem; font-weight:800; font-family:var(--font-display); color:${corNota};">
                    ${nota}%
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

      </div>
    `;

  } catch (err) {
    console.error('[historico simulados]', err);
    conteudo.innerHTML = `
      <div class="card" style="padding:40px; text-align:center;">
        <p style="color:var(--color-danger); margin-bottom:12px;">Não foi possível carregar seu histórico de simulados.</p>
        <button class="btn btn-secondary" onclick="window.location.reload()">Tentar novamente</button>
      </div>
    `;
  }
}

// Inicia fluxos auxiliares globais
iniciar();
iniciarBusca();
iniciarNotificacoes();
