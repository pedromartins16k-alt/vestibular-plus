import { iniciarNotificacoes } from './notificacoes-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { iniciarBusca } from './busca-global.js';
import { verificarConquistas } from './conquistas.js';
import { buscarFavoritos, alternarFavorito } from './favoritos-global.js';

const grid = document.getElementById('resumo-grid');
const filtroContainer = document.getElementById('filtro-materias');
const modalOverlay = document.getElementById('modal-overlay');

const NIVEIS_RESUMO = ['facil', 'medio', 'dificil', 'genio'];
const PLANO_PADRAO = { dificuldade_maxima: 'medio', percentual_banco_liberado: 30 };

let resumosCache = [];
let materiaAtiva = 'todas';
let favoritosSet = new Set();
let resumoModalAtual = null;

function nivelPermitido(nivelResumo, maxPlano) {
  const idxResumo = NIVEIS_RESUMO.indexOf(nivelResumo || 'facil');
  const idxMax = NIVEIS_RESUMO.indexOf(maxPlano || 'medio');
  return idxResumo <= idxMax;
}

function getPlanoExclusivo(resumo) {
  if (resumo.nivel_dificuldade === 'genio') {
    return {
      nome: 'Ultimate',
      classe: 'ultimate',
      gradiente: 'linear-gradient(135deg, #f472b6, #c084fc, #60a5fa)',
      corTexto: '#ffffff',
      desc: 'no nível Gênio'
    };
  }
  if (resumo.nivel_dificuldade === 'dificil') {
    return {
      nome: 'PRO',
      classe: 'pro',
      gradiente: 'linear-gradient(135deg, #7c3aed, #a855f7)',
      corTexto: '#e9d5ff',
      desc: 'no nível Difícil'
    };
  }
  return {
    nome: 'PRO',
    classe: 'pro',
    gradiente: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    corTexto: '#e9d5ff',
    desc: 'do banco completo'
  };
}

function renderIconeCadeado(tipo) {
  if (tipo === 'ultimate') {
    return `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline-block; vertical-align:middle;">
        <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/>
        <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradUltimatePadlock)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        <circle cx="12" cy="15" r="1.5" fill="#34d399"/>
        <path d="M12 16.5V18.5" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="gradUltimatePadlock" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop stop-color="#f472b6"/>
            <stop offset="0.5" stop-color="#c084fc"/>
            <stop offset="1" stop-color="#60a5fa"/>
          </linearGradient>
        </defs>
      </svg>
    `;
  }
  return `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline-block; vertical-align:middle;">
      <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradProPadlock)" stroke="rgba(168,85,247,0.5)" stroke-width="1"/>
      <circle cx="12" cy="15" r="1.5" fill="#e9d5ff"/>
      <path d="M12 16.5V18.5" stroke="#e9d5ff" stroke-width="2" stroke-linecap="round"/>
      <defs>
        <linearGradient id="gradProPadlock" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7c3aed"/>
          <stop offset="1" stop-color="#a855f7"/>
        </linearGradient>
      </defs>
    </svg>
  `;
}

// Identifica quais resumos estão liberados e quais estão bloqueados pelo plano
function marcarResumosLiberadosEBloqueados(lista, plano) {
  const pct = Number(plano.percentual_banco_liberado) || 30;
  const maxDificuldade = plano.dificuldade_maxima || 'medio';

  const porMateria = new Map();
  lista.forEach(r => {
    if (!porMateria.has(r.materia_id)) porMateria.set(r.materia_id, []);
    porMateria.get(r.materia_id).push(r);
  });

  const idsLiberados = new Set();

  porMateria.forEach(rs => {
    // Apenas dentro da dificuldade permitida contam para a cota liberada
    const dentroDificuldade = rs.filter(r => nivelPermitido(r.nivel_dificuldade, maxDificuldade));
    const qtdLiberada = pct >= 100 ? rs.length : Math.max(1, Math.ceil(rs.length * pct / 100));
    dentroDificuldade.slice(0, qtdLiberada).forEach(r => idsLiberados.add(r.id));
  });

  return lista.map(r => ({
    ...r,
    bloqueado: !idsLiberados.has(r.id)
  }));
}

async function buscarPlanoUsuario(userId) {
  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('planos(dificuldade_maxima, percentual_banco_liberado)')
    .eq('id', userId)
    .single();

  if (error || !perfil?.planos) {
    console.error('Erro ao buscar plano do usuário, aplicando limites do Free:', error);
    return PLANO_PADRAO;
  }
  return perfil.planos;
}

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;

  const plano = await buscarPlanoUsuario(session.user.id);

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  const { data: resumos } = await supabase
    .from('resumos')
    .select('id, titulo, conteudo, fonte, nivel_dificuldade, materia_id, materias(nome, cor)')
    .order('criado_em', { ascending: false });

  // Marca liberados e bloqueados mantendo todos na lista
  resumosCache = marcarResumosLiberadosEBloqueados(resumos || [], plano);

  favoritosSet = await buscarFavoritos('resumo');

  renderFiltros(materias || []);
  renderResumos();
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
      renderResumos();
    });
  });
}

function renderResumos() {
  const filtrados = materiaAtiva === 'todas'
    ? resumosCache
    : resumosCache.filter(r => r.materia_id === materiaAtiva);

  if (!filtrados.length) {
    grid.innerHTML = `<p class="empty-state">Nenhum resumo encontrado nessa matéria ainda. Novos conteúdos chegam em breve! 📚</p>`;
    return;
  }

  grid.innerHTML = filtrados.map((r, i) => {
    const cor = r.materias?.cor || '#7c3aed';
    const nomeMateria = r.materias?.nome || 'Geral';
    const previa = r.conteudo.replace(/[#*\n]/g, ' ').slice(0, 110) + '...';
    const favoritado = favoritosSet.has(r.id);
    const estaBloqueado = r.bloqueado;
    const infoPlano = getPlanoExclusivo(r);

    return `
      <div class="card resumo-card fade-up ${estaBloqueado ? 'bloqueado' : ''}" data-index="${i}">
        ${estaBloqueado 
          ? `<span class="cadeado-badge ${infoPlano.classe}">${renderIconeCadeado(infoPlano.classe)} Exclusivo ${infoPlano.nome}</span>`
          : `<button class="favorito-btn ${favoritado ? 'ativo' : ''}" data-id="${r.id}" title="Favoritar">${favoritado ? '♥' : '♡'}</button>`
        }
        <span class="resumo-tag" style="background:${cor}22; color:${cor};">${nomeMateria}</span>
        <h3>${r.titulo}</h3>
        <p>${previa}</p>
        <div class="resumo-meta">
          <span>📊 ${traduzDificuldade(r.nivel_dificuldade)}</span>
          ${estaBloqueado 
            ? `<span style="background:${infoPlano.gradiente}; -webkit-background-clip:text; -webkit-text-fill-color:transparent; font-weight:700;">🔒 Desbloquear ${infoPlano.nome} →</span>`
            : `<span>Ler resumo →</span>`
          }
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.resumo-card').forEach(card => {
    const resumo = filtrados[card.dataset.index];
    card.addEventListener('click', () => {
      if (resumo.bloqueado) {
        const info = getPlanoExclusivo(resumo);
        mostrarModalUpgrade(
          `Este resumo ${info.desc} é exclusivo para assinantes do plano ${info.nome}.`,
          info
        );
      } else {
        handleAbrirResumo(resumo);
      }
    });
  });

  grid.querySelectorAll('.favorito-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoritoResumo(btn.dataset.id, btn);
    });
  });
}

// Checa o limite diário do plano antes de deixar o aluno ler o resumo.
async function handleAbrirResumo(resumo) {
  const { data: uso, error } = await supabase.rpc('verificar_e_registrar_uso', { p_tipo: 'resumo' });

  if (error) {
    console.error('[uso resumo]', error);
    abrirModal(resumo);
    return;
  }

  if (!uso.permitido) {
    const msg = uso.motivo === 'limite_diario'
      ? `Você atingiu o limite de ${uso.limite} resumos por dia do seu plano atual.`
      : 'Não foi possível verificar seu acesso agora. Tenta de novo em instantes.';
    mostrarModalUpgrade(msg, { nome: 'PRO', gradiente: 'linear-gradient(135deg, #7c3aed, #ec4899)' });
    return;
  }

  abrirModal(resumo);
}

async function toggleFavoritoResumo(id, btnEl) {
  const estava = favoritosSet.has(id);
  const novoEstado = await alternarFavorito('resumo', id, estava);
  if (novoEstado) favoritosSet.add(id); else favoritosSet.delete(id);

  if (btnEl) {
    btnEl.textContent = novoEstado ? '♥' : '♡';
    btnEl.classList.toggle('ativo', novoEstado);
  }
  if (resumoModalAtual?.id === id) {
    const modalBtn = document.getElementById('modal-favorito-btn');
    modalBtn.textContent = novoEstado ? '♥' : '♡';
    modalBtn.classList.toggle('ativo', novoEstado);
  }
}

function abrirModal(resumo) {
  resumoModalAtual = resumo;
  const cor = resumo.materias?.cor || '#7c3aed';
  document.getElementById('modal-tag').textContent = resumo.materias?.nome || 'Geral';
  document.getElementById('modal-tag').style.background = `${cor}22`;
  document.getElementById('modal-tag').style.color = cor;
  document.getElementById('modal-titulo').textContent = resumo.titulo;
  document.getElementById('modal-conteudo').textContent = resumo.conteudo
    .replace(/\\n/g, '\n')
    .replace(/[#*]/g, '');
  document.getElementById('modal-fonte').textContent = resumo.fonte ? `Fonte: ${resumo.fonte}` : '';

  const modalFavBtn = document.getElementById('modal-favorito-btn');
  const favoritado = favoritosSet.has(resumo.id);
  modalFavBtn.textContent = favoritado ? '♥' : '♡';
  modalFavBtn.classList.toggle('ativo', favoritado);

  modalOverlay.classList.add('open');

  registrarLeitura(resumo.materia_id);
}

async function registrarLeitura(materiaId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('sessoes_estudo').insert({
    user_id: session.user.id,
    materia_id: materiaId,
    duracao_minutos: 3,
    tipo: 'resumo',
  });
  verificarConquistas(session.user.id);
}

function traduzDificuldade(nivel) {
  return { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', genio: 'Gênio' }[nivel] || '—';
}

// Modal/aviso de conversão para a página de planos
function mostrarModalUpgrade(mensagem, infoPlano = { nome: 'PRO', gradiente: 'linear-gradient(135deg, #7c3aed, #ec4899)' }) {
  let modalUpgrade = document.getElementById('modal-upgrade-alerta');
  if (!modalUpgrade) {
    modalUpgrade = document.createElement('div');
    modalUpgrade.id = 'modal-upgrade-alerta';
    modalUpgrade.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;backdrop-filter:blur(6px);animation:fadeIn .2s ease;';
    document.body.appendChild(modalUpgrade);
  }

  const isUltimate = infoPlano.nome === 'Ultimate';
  const iconeHtml = isUltimate
    ? `<div style="margin-bottom:14px;">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" style="filter:drop-shadow(0 6px 16px rgba(244,114,182,.5));">
          <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/>
          <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradPadlockModal)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
          <circle cx="12" cy="15" r="1.5" fill="#34d399"/>
          <path d="M12 16.5V18.5" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
          <defs>
            <linearGradient id="gradPadlockModal" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#f472b6"/>
              <stop offset="0.5" stop-color="#c084fc"/>
              <stop offset="1" stop-color="#60a5fa"/>
            </linearGradient>
          </defs>
        </svg>
      </div>`
    : `<div style="font-size:3rem;margin-bottom:12px;">🔒</div>`;

  modalUpgrade.innerHTML = `
    <div style="background:var(--bg-card, #13111c);border:1px solid ${isUltimate ? 'rgba(244,114,182,.5)' : 'rgba(168,85,247,.4)'};border-radius:20px;max-width:440px;width:100%;padding:32px 24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.6);position:relative;">
      <button id="fechar-modal-upgrade" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-secondary,#a1a1aa);font-size:1.2rem;cursor:pointer;">✕</button>
      ${iconeHtml}
      <h3 style="font-size:1.35rem;font-family:'Sora',sans-serif;margin-bottom:10px;color:#fff;">
        Exclusivo Plano <span style="background:${infoPlano.gradiente};-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${infoPlano.nome}</span>
      </h3>
      <p style="font-size:.92rem;color:var(--text-secondary,#a1a1aa);line-height:1.6;margin-bottom:24px;">${mensagem}</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="./precos.html?plano=${infoPlano.nome.toLowerCase()}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:${infoPlano.gradiente};color:#fff;text-decoration:none;font-weight:700;font-size:.95rem;box-shadow:0 4px 18px rgba(124,58,237,.4);transition:transform .2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
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

document.getElementById('modal-close').addEventListener('click', () => {
  modalOverlay.classList.remove('open');
});
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('open');
});
document.getElementById('modal-favorito-btn').addEventListener('click', () => {
  if (resumoModalAtual) toggleFavoritoResumo(resumoModalAtual.id, null);
});

iniciar();
iniciarBusca();
iniciarNotificacoes();
