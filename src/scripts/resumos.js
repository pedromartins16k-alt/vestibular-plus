import { iniciarNotificacoes } from './notificacoes-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { iniciarBusca } from './busca-global.js';
import { verificarConquistas } from './conquistas.js';
import { buscarFavoritos, alternarFavorito } from './favoritos-global.js';

const grid = document.getElementById('resumo-grid');
const filtroContainer = document.getElementById('filtro-materias');
const modalOverlay = document.getElementById('modal-overlay');

// Resumos só têm nivel_dificuldade facil/medio/dificil (não existe "genio" pra resumos).
const NIVEIS_RESUMO = ['facil', 'medio', 'dificil'];
const PLANO_PADRAO = { dificuldade_maxima: 'medio', percentual_banco_liberado: 30 };

let resumosCache = [];
let materiaAtiva = 'todas';
let favoritosSet = new Set();
let resumoModalAtual = null;

function nivelPermitido(nivelResumo, maxPlano) {
  const idxResumo = NIVEIS_RESUMO.indexOf(nivelResumo || 'facil');
  const maxEquivalente = maxPlano === 'genio' ? 'dificil' : (maxPlano || 'medio');
  const idxMax = NIVEIS_RESUMO.indexOf(maxEquivalente);
  return idxResumo <= idxMax;
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

    return `
      <div class="card resumo-card fade-up ${estaBloqueado ? 'bloqueado' : ''}" data-index="${i}">
        ${estaBloqueado 
          ? `<span class="cadeado-badge">🔒 Exclusivo PRO</span>`
          : `<button class="favorito-btn ${favoritado ? 'ativo' : ''}" data-id="${r.id}" title="Favoritar">${favoritado ? '♥' : '♡'}</button>`
        }
        <span class="resumo-tag" style="background:${cor}22; color:${cor};">${nomeMateria}</span>
        <h3>${r.titulo}</h3>
        <p>${previa}</p>
        <div class="resumo-meta">
          <span>📊 ${traduzDificuldade(r.nivel_dificuldade)}</span>
          ${estaBloqueado 
            ? `<span style="color:#a855f7; font-weight:600;">🔒 Desbloquear →</span>`
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
        mostrarModalUpgrade('Este resumo faz parte do banco completo exclusivo para assinantes dos planos pagos.');
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
    mostrarModalUpgrade(msg);
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
  return { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }[nivel] || '—';
}

// Modal/aviso de conversão para a página de planos
function mostrarModalUpgrade(mensagem) {
  let modalUpgrade = document.getElementById('modal-upgrade-alerta');
  if (!modalUpgrade) {
    modalUpgrade = document.createElement('div');
    modalUpgrade.id = 'modal-upgrade-alerta';
    modalUpgrade.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;backdrop-filter:blur(6px);';
    modalUpgrade.innerHTML = `
      <div style="background:var(--bg-card, #13111c);border:1px solid rgba(168,85,247,.4);border-radius:20px;max-width:440px;width:100%;padding:32px 24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.6);position:relative;">
        <button id="fechar-modal-upgrade" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-secondary,#a1a1aa);font-size:1.2rem;cursor:pointer;">✕</button>
        <div style="font-size:3rem;margin-bottom:12px;">🔒</div>
        <h3 style="font-size:1.35rem;font-family:'Sora',sans-serif;margin-bottom:10px;color:#fff;">Conteúdo Exclusivo</h3>
        <p id="msg-upgrade-texto" style="font-size:.92rem;color:var(--text-secondary,#a1a1aa);line-height:1.6;margin-bottom:24px;"></p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <a href="./precos.html" style="display:inline-block;padding:12px 20px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;text-decoration:none;font-weight:700;font-size:.95rem;box-shadow:0 4px 15px rgba(124,58,237,.4);transition:transform .2s;">
            🚀 Ver Planos e Desbloquear
          </a>
          <button id="cancelar-upgrade" style="background:none;border:none;color:var(--text-secondary,#71717a);font-size:.85rem;cursor:pointer;padding:6px;">Continuar no plano Free</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalUpgrade);

    const fechar = () => { modalUpgrade.style.display = 'none'; };
    document.getElementById('fechar-modal-upgrade').onclick = fechar;
    document.getElementById('cancelar-upgrade').onclick = fechar;
    modalUpgrade.onclick = (e) => { if (e.target === modalUpgrade) fechar(); };
  }

  document.getElementById('msg-upgrade-texto').textContent = mensagem;
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
