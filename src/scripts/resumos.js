import { iniciarNotificacoes } from './notificacoes-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { iniciarBusca } from './busca-global.js';
import { verificarConquistas } from './conquistas.js';
import { buscarFavoritos, alternarFavorito } from './favoritos-global.js';

const grid = document.getElementById('resumo-grid');
const filtroContainer = document.getElementById('filtro-materias');
const modalOverlay = document.getElementById('modal-overlay');

let resumosCache = [];
let materiaAtiva = 'todas';
let favoritosSet = new Set();
let resumoModalAtual = null;

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  const { data: resumos } = await supabase
    .from('resumos')
    .select('id, titulo, conteudo, fonte, nivel_dificuldade, materia_id, materias(nome, cor)')
    .order('criado_em', { ascending: false });

  resumosCache = resumos || [];
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
    return `
      <div class="card resumo-card fade-up" data-index="${i}">
        <button class="favorito-btn ${favoritado ? 'ativo' : ''}" data-id="${r.id}" title="Favoritar">${favoritado ? '♥' : '♡'}</button>
        <span class="resumo-tag" style="background:${cor}22; color:${cor};">${nomeMateria}</span>
        <h3>${r.titulo}</h3>
        <p>${previa}</p>
        <div class="resumo-meta">
          <span>📊 ${traduzDificuldade(r.nivel_dificuldade)}</span>
          <span>Ler resumo →</span>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.resumo-card').forEach(card => {
    card.addEventListener('click', () => abrirModal(filtrados[card.dataset.index]));
  });

  grid.querySelectorAll('.favorito-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoritoResumo(btn.dataset.id, btn);
    });
  });
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
