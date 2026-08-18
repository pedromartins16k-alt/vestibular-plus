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

let questoesCache = [];
let materiasCache = [];
let aulasCache = [];

let materiaAtiva = 'todas';
let mostrandoTemas = false;
let temaAtivo = null;

let indiceAtual = 0;
let respondida = false;
let acertos = 0;
let sessionUserId = null;
let favoritosSet = new Set();
let nomePlanoUsuario = 'free';
let questaoAtualContada = false;

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
        <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradUltPadlockQ)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        <circle cx="12" cy="15" r="1.5" fill="#34d399"/>
        <path d="M12 16.5V18.5" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="gradUltPadlockQ" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
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
        <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradBasicPadlockQ)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>
        <circle cx="12" cy="15" r="1.5" fill="#bae6fd"/>
        <path d="M12 16.5V18.5" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="gradBasicPadlockQ" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
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
      <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradProPadlockQ)" stroke="rgba(168,85,247,0.5)" stroke-width="1"/>
      <circle cx="12" cy="15" r="1.5" fill="#e9d5ff"/>
      <path d="M12 16.5V18.5" stroke="#e9d5ff" stroke-width="2" stroke-linecap="round"/>
      <defs>
        <linearGradient id="gradProPadlockQ" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7c3aed"/>
          <stop offset="1" stop-color="#a855f7"/>
        </linearGradient>
      </defs>
    </svg>
  `;
}

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

function marcarQuestoesLiberadasEBloqueadas(lista, nomePlano) {
  const plano = (nomePlano || 'free').toLowerCase();

  // Mapeia médios por matéria para liberar 50% no Free
  const mediosPorMateria = new Map();
  lista.forEach(q => {
    if ((q.dificuldade || 'facil') === 'medio') {
      if (!mediosPorMateria.has(q.materia_id)) mediosPorMateria.set(q.materia_id, []);
      mediosPorMateria.get(q.materia_id).push(q.id);
    }
  });

  const idsMediosLiberadosFree = new Set();
  mediosPorMateria.forEach(ids => {
    const qtdLiberada = Math.max(1, Math.ceil(ids.length * 0.5));
    ids.slice(0, qtdLiberada).forEach(id => idsMediosLiberadosFree.add(id));
  });

  return lista.map(q => {
    const nivel = q.dificuldade || 'facil';
    let bloqueada = false;

    if (plano === 'premium' || plano === 'ultimate') {
      bloqueada = false;
    } else if (plano === 'pro') {
      bloqueada = (nivel === 'genio');
    } else if (plano === 'basic') {
      bloqueada = (nivel === 'dificil' || nivel === 'genio');
    } else {
      // Plano Free:
      if (nivel === 'facil') {
        bloqueada = false; // 100% dos fáceis liberados
      } else if (nivel === 'medio') {
        bloqueada = !idsMediosLiberadosFree.has(q.id); // 50% liberados, 50% para Basic
      } else {
        bloqueada = true; // Difícil e Gênio bloqueados
      }
    }

    return {
      ...q,
      bloqueada
    };
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

async function checarELimitarQuestao() {
  const { data: uso, error } = await supabase.rpc('verificar_e_registrar_uso', { p_tipo: 'questao' });

  if (error) {
    console.error('[uso questao]', error);
    return { permitido: true };
  }
  return uso;
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
          <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradPadlockModalQ)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
          <circle cx="12" cy="15" r="1.5" fill="#34d399"/>
          <path d="M12 16.5V18.5" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
          <defs>
            <linearGradient id="gradPadlockModalQ" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
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
          <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradBasicModalQ)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>
          <circle cx="12" cy="15" r="1.5" fill="#bae6fd"/>
          <path d="M12 16.5V18.5" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/>
          <defs>
            <linearGradient id="gradBasicModalQ" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
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

function renderLimiteAtingido(limite) {
  container.innerHTML = `
    <div class="card questao-card" style="text-align:center;">
      <div style="font-size:3rem; margin-bottom:10px;">🔒</div>
      <h2>Limite diário atingido</h2>
      <p style="color:var(--text-secondary); margin-top:10px;">
        Seu plano permite ${limite} questões por dia. Faça upgrade pra continuar praticando sem limites.
      </p>
      <a class="btn btn-primary" style="margin-top:18px; display:inline-flex;" href="./precos.html?plano=basic">Ver planos</a>
    </div>`;
  progressInfo.textContent = '';
}

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  sessionUserId = session.user.id;

  nomePlanoUsuario = await buscarNomePlanoUsuario();

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  const { data: aulas } = await supabase
    .from('treineiro_aulas')
    .select('id, titulo, materia_id, ordem')
    .order('ordem');

  const questoesBrutas = await buscarTodasQuestoes();
  questoesCache = marcarQuestoesLiberadasEBloqueadas(questoesBrutas, nomePlanoUsuario);

  materiasCache = materias || [];
  aulasCache = aulas || [];
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

function traduzDificuldade(nivel) {
  return { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', genio: 'Gênio' }[nivel] || '—';
}

async function renderQuestaoAtual() {
  if (materiaAtiva !== 'todas' && mostrandoTemas) {
    renderTemas(materiaAtiva);
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
  const estaBloqueada = q.bloqueada;
  const infoPlano = getPlanoExclusivo(q.dificuldade);

  if (!estaBloqueada && !questaoAtualContada) {
    questaoAtualContada = true;
    const uso = await checarELimitarQuestao();
    if (!uso.permitido) {
      renderLimiteAtingido(uso.limite);
      return;
    }
  }

  const cor = q.materias?.cor || '#7c3aed';
  const favoritado = favoritosSet.has(q.id);
  const temaTitulo = q.treineiro_aulas?.titulo;
  const tagTexto = `${q.materias?.nome || 'Geral'}${temaTitulo ? ' · ' + temaTitulo : ''}${q.fonte ? ' · ' + q.fonte : ''} · 📊 ${traduzDificuldade(q.dificuldade)}`;

  progressInfo.innerHTML = `<span>Questão ${indiceAtual + 1} de ${lista.length}</span><span>✅ ${acertos} acertos</span>`;

  if (estaBloqueada) {
    container.innerHTML = `
      ${voltarTemasHtml}
      <div class="card questao-card fade-up bloqueada">
        <div class="questao-topo">
          <span class="questao-tag" style="background:${cor}22; color:${cor};">${tagTexto}</span>
          <span class="cadeado-badge ${infoPlano.classe}">
            ${renderIconeCadeado(infoPlano.classe)} Exclusivo ${infoPlano.nome}
          </span>
        </div>
        <p class="questao-enunciado">${q.enunciado}</p>
        <div class="bloqueio-overlay-card">
          <div style="margin-bottom:8px;">${renderIconeCadeado(infoPlano.classe)}</div>
          <h3 style="font-size:1.15rem; margin-bottom:8px;">Esta questão é exclusiva para assinantes ${infoPlano.nome}</h3>
          <p style="color:var(--text-secondary); font-size:.88rem; margin-bottom:18px;">
            Desbloqueie todo o banco de questões ${infoPlano.desc} para turbinar seus estudos.
          </p>
          <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
            <a href="./precos.html?plano=${infoPlano.nome.toLowerCase()}" class="btn" style="background:${infoPlano.gradiente}; color:#fff; font-weight:700;">
              🚀 Desbloquear no Plano ${infoPlano.nome}
            </a>
            <button class="btn btn-ghost" id="proxima-bloqueada-btn">Pular questão →</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('proxima-bloqueada-btn').addEventListener('click', () => {
      indiceAtual++;
      renderQuestaoAtual();
    });

    ligarVoltarTemas();
    return;
  }

  // Questão Liberada:
  container.innerHTML = `
    ${voltarTemasHtml}
    <div class="card questao-card fade-up">
      <div class="questao-topo">
        <span class="questao-tag" style="background:${cor}22; color:${cor};">${tagTexto}</span>
        <button class="favorito-btn ${favoritado ? 'ativo' : ''}" id="favorito-btn" title="Salvar para revisar depois">${favoritado ? '♥' : '♡'}</button>
      </div>
      <p class="questao-enunciado">${q.enunciado}</p>
      <div class="alternativas-container" id="alternativas-list"></div>
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
