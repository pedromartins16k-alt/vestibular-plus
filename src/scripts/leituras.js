/**
 * leituras.js — Leituras Obrigatórias
 *
 * Gerencia o status de leitura das obras obrigatórias dos vestibulares.
 * Status salvo em localStorage (sem necessidade de tabela adicional no banco).
 *
 * IMPORTANTE: A lista abaixo é baseada em edições anteriores da FUVEST.
 * Sempre verificar a lista oficial em https://www.fuvest.br/ para cada edição.
 * Esta lista é apenas para fins de acompanhamento pessoal.
 */

// ---------------------------------------------------------------
// Lista de obras — APENAS PARA REFERÊNCIA E ACOMPANHAMENTO
// Fonte: Histórico FUVEST. Confirmar lista oficial 2027 em fuvest.br
// ---------------------------------------------------------------
const LIVROS_FUVEST_REFERENCIA = [
  {
    id: 'leit-001',
    titulo: 'Gabriela, Cravo e Canela',
    autor: 'Jorge Amado',
    ano_publicacao: 1958,
    genero: 'Romance',
    tags: ['Literatura Brasileira', 'Modernismo']
  },
  {
    id: 'leit-002',
    titulo: 'Dom Casmurro',
    autor: 'Machado de Assis',
    ano_publicacao: 1899,
    genero: 'Romance',
    tags: ['Literatura Brasileira', 'Realismo']
  },
  {
    id: 'leit-003',
    titulo: 'A Paixão Segundo G.H.',
    autor: 'Clarice Lispector',
    ano_publicacao: 1964,
    genero: 'Romance',
    tags: ['Literatura Brasileira', 'Modernismo']
  },
  {
    id: 'leit-004',
    titulo: 'Caminho de Pedras',
    autor: 'Rachel de Queiroz',
    ano_publicacao: 1937,
    genero: 'Romance',
    tags: ['Literatura Brasileira', 'Modernismo']
  },
  {
    id: 'leit-005',
    titulo: 'Memórias de um Sargento de Milícias',
    autor: 'Manuel Antônio de Almeida',
    ano_publicacao: 1852,
    genero: 'Romance',
    tags: ['Literatura Brasileira', 'Romantismo']
  },
  {
    id: 'leit-006',
    titulo: 'O Cortiço',
    autor: 'Aluísio Azevedo',
    ano_publicacao: 1890,
    genero: 'Romance',
    tags: ['Literatura Brasileira', 'Naturalismo']
  },
  {
    id: 'leit-007',
    titulo: 'Vidas Secas',
    autor: 'Graciliano Ramos',
    ano_publicacao: 1938,
    genero: 'Romance',
    tags: ['Literatura Brasileira', 'Modernismo']
  },
  {
    id: 'leit-008',
    titulo: 'Grande Sertão: Veredas',
    autor: 'João Guimarães Rosa',
    ano_publicacao: 1956,
    genero: 'Romance',
    tags: ['Literatura Brasileira', 'Modernismo']
  }
];

import { supabase } from '../lib/supabaseClient.js';

let currentUserId = 'guest';

async function initUserContext() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) currentUserId = user.id;
  } catch (_) {}
}

const LS_KEY_PREFIX = 'vestibular_leituras_status_';

function getStorageKey() {
  return `${LS_KEY_PREFIX}${currentUserId}`;
}

// Status possíveis
const STATUS = {
  nao_iniciado: { texto: 'Não iniciado', emoji: '📕', classe: '' },
  lendo: { texto: 'Lendo', emoji: '📖', classe: 'lendo' },
  concluido: { texto: 'Concluído', emoji: '✅', classe: 'concluido' }
};

// ---------------------------------------------------------------
// Persistência (localStorage isolado por usuário)
// ---------------------------------------------------------------

function lerStatus() {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  } catch (_) {
    return {};
  }
}

function salvarStatus(statusMap) {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(statusMap));
  } catch (_) {}
}

function getStatusLivro(id) {
  const todos = lerStatus();
  return todos[id] || 'nao_iniciado';
}

function setStatusLivro(id, status) {
  const todos = lerStatus();
  todos[id] = status;
  salvarStatus(todos);
}

// ---------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------

function renderizarLivros() {
  const lista = document.getElementById('livros-lista');
  if (!lista) return;

  const todos = lerStatus();

  const html = LIVROS_FUVEST_REFERENCIA.map(livro => {
    const status = todos[livro.id] || 'nao_iniciado';
    const s = STATUS[status];
    const tagsHtml = (livro.tags || []).map(t => `<span class="livro-tag">${t}</span>`).join('');

    return `
      <div class="livro-card ${s.classe}" id="card-${livro.id}">
        <button class="livro-status-btn" onclick="toggleStatus('${livro.id}')"
          title="${s.texto}" aria-label="${s.texto}: ${livro.titulo}">
          ${status === 'concluido' ? '✓' : status === 'lendo' ? '📖' : ''}
        </button>
        <div class="livro-info">
          <div class="livro-titulo">${livro.titulo}</div>
          <div class="livro-autor">${livro.autor} (${livro.ano_publicacao})</div>
          <div class="livro-meta">
            <span class="livro-tag">${livro.genero}</span>
            ${tagsHtml}
          </div>
        </div>
        <div class="livro-acoes">
          <select class="livro-status-sel" onchange="mudarStatus('${livro.id}', this.value)"
            aria-label="Status de leitura: ${livro.titulo}">
            ${Object.entries(STATUS).map(([k, v]) =>
              `<option value="${k}" ${status === k ? 'selected' : ''}>${v.emoji} ${v.texto}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `;
  }).join('');

  lista.innerHTML = html;
  atualizarProgresso();
}

function atualizarProgresso() {
  const todos = lerStatus();
  const total = LIVROS_FUVEST_REFERENCIA.length;
  const concluidos = LIVROS_FUVEST_REFERENCIA.filter(l => todos[l.id] === 'concluido').length;
  const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  const elNums = document.getElementById('prog-nums');
  const elFill = document.getElementById('prog-fill');
  if (elNums) elNums.textContent = `${concluidos} / ${total}`;
  if (elFill) elFill.style.width = `${pct}%`;
}

// ---------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------

// Ciclo: não iniciado → lendo → concluído → não iniciado
window.toggleStatus = function(id) {
  const atual = getStatusLivro(id);
  const proximo = atual === 'nao_iniciado' ? 'lendo'
    : atual === 'lendo' ? 'concluido'
    : 'nao_iniciado';
  setStatusLivro(id, proximo);
  renderizarLivros();
};

window.mudarStatus = function(id, status) {
  setStatusLivro(id, status);
  renderizarLivros();
};

// Tabs
document.querySelectorAll('.leit-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.leit-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const vest = tab.dataset.vestibular;
    document.getElementById('painel-fuvest').style.display = vest === 'fuvest' ? 'block' : 'none';
    document.getElementById('painel-outros').style.display = vest === 'outros' ? 'block' : 'none';
  });
});

// Inicializa com contexto do usuário
initUserContext().then(() => {
  renderizarLivros();
});
