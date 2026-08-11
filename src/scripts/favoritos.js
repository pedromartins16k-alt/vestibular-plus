import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { alternarFavorito } from './favoritos-global.js';

const gridResumos = document.getElementById('favoritos-resumos-grid');
const gridQuestoes = document.getElementById('favoritos-questoes-grid');
const modalOverlay = document.getElementById('modal-overlay');

let resumosFavoritados = [];

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;

  const { data: favoritos } = await supabase
    .from('favoritos')
    .select('tipo, referencia_id')
    .eq('user_id', session.user.id);

  const idsResumos = (favoritos || []).filter(f => f.tipo === 'resumo').map(f => f.referencia_id);
  const idsQuestoes = (favoritos || []).filter(f => f.tipo === 'questao').map(f => f.referencia_id);

  await carregarResumos(idsResumos);
  await carregarQuestoes(idsQuestoes);
}

async function carregarResumos(ids) {
  if (!ids.length) {
    gridResumos.innerHTML = `<p class="empty-state">Você ainda não favoritou nenhum resumo.</p>`;
    return;
  }

  const { data: resumos } = await supabase
    .from('resumos')
    .select('id, titulo, conteudo, fonte, nivel_dificuldade, materia_id, materias(nome, cor)')
    .in('id', ids);

  resumosFavoritados = resumos || [];
  renderResumos();
}

function renderResumos() {
  if (!resumosFavoritados.length) {
    gridResumos.innerHTML = `<p class="empty-state">Você ainda não favoritou nenhum resumo.</p>`;
    return;
  }

  gridResumos.innerHTML = resumosFavoritados.map((r, i) => {
    const cor = r.materias?.cor || '#7c3aed';
    const nomeMateria = r.materias?.nome || 'Geral';
    const previa = r.conteudo.replace(/[#*\n]/g, ' ').slice(0, 110) + '...';
    return `
      <div class="card resumo-card fade-up" data-index="${i}">
        <button class="favorito-btn" data-id="${r.id}" title="Remover dos favoritos">♥</button>
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

  gridResumos.querySelectorAll('.resumo-card').forEach(card => {
    card.addEventListener('click', () => abrirModal(resumosFavoritados[card.dataset.index]));
  });

  gridResumos.querySelectorAll('.favorito-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await alternarFavorito('resumo', btn.dataset.id, true);
      resumosFavoritados = resumosFavoritados.filter(r => r.id !== btn.dataset.id);
      renderResumos();
    });
  });
}

async function carregarQuestoes(ids) {
  if (!ids.length) {
    gridQuestoes.innerHTML = `<p class="empty-state">Você ainda não favoritou nenhuma questão.</p>`;
    return;
  }

  const { data: questoes } = await supabase
    .from('questoes')
    .select('id, enunciado, alternativas, resposta_correta, comentario, fonte, materia_id, materias(nome, cor)')
    .in('id', ids);

  renderQuestoes(questoes || []);
}

function renderQuestoes(questoes) {
  if (!questoes.length) {
    gridQuestoes.innerHTML = `<p class="empty-state">Você ainda não favoritou nenhuma questão.</p>`;
    return;
  }

  gridQuestoes.innerHTML = questoes.map(q => {
    const cor = q.materias?.cor || '#7c3aed';
    const altsHtml = q.alternativas.map(alt => `
      <div class="alternativa-view ${alt.letra === q.resposta_correta ? 'correta' : ''}">
        <span class="alt-letra">${alt.letra}</span>
        <span>${alt.texto}</span>
      </div>
    `).join('');

    return `
      <div class="card questao-card-view fade-up" data-id="${q.id}">
        <button class="favorito-btn" data-id="${q.id}" title="Remover dos favoritos">♥</button>
        <span class="questao-tag" style="background:${cor}22; color:${cor};">${q.materias?.nome || 'Geral'} ${q.fonte ? '· ' + q.fonte : ''}</span>
        <p class="questao-enunciado">${q.enunciado}</p>
        ${altsHtml}
        <div class="questao-comentario">${q.comentario || 'Sem comentário disponível para esta questão.'}</div>
      </div>
    `;
  }).join('');

  gridQuestoes.querySelectorAll('.favorito-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await alternarFavorito('questao', btn.dataset.id, true);
      btn.closest('.questao-card-view').remove();
      if (!gridQuestoes.querySelector('.questao-card-view')) {
        gridQuestoes.innerHTML = `<p class="empty-state">Você ainda não favoritou nenhuma questão.</p>`;
      }
    });
  });
}

function abrirModal(resumo) {
  const cor = resumo.materias?.cor || '#7c3aed';
  document.getElementById('modal-tag').textContent = resumo.materias?.nome || 'Geral';
  document.getElementById('modal-tag').style.background = `${cor}22`;
  document.getElementById('modal-tag').style.color = cor;
  document.getElementById('modal-titulo').textContent = resumo.titulo;
  document.getElementById('modal-conteudo').textContent = resumo.conteudo
    .replace(/\\n/g, '\n')
    .replace(/[#*]/g, '');
  document.getElementById('modal-fonte').textContent = resumo.fonte ? `Fonte: ${resumo.fonte}` : '';
  modalOverlay.classList.add('open');
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

iniciar();
iniciarBusca();
iniciarNotificacoes();
