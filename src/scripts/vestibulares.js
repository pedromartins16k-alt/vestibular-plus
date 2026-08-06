import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const vestibularesListaEl = document.getElementById('vestibulares-lista');
const filtroTreineiroEl = document.getElementById('filtro-materias-treineiro');
const aulasListaEl = document.getElementById('aulas-lista');
const modalAula = document.getElementById('modal-aula');

let aulasCache = [];
let materiaAtivaTreineiro = 'todas';

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;

  configurarTabs();
  configurarModal();

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  renderFiltroTreineiro(materias || []);
  await carregarVestibulares();
  await carregarAulas();
}

/* ===== Vestibulares ===== */

async function carregarVestibulares() {
  const { data, error } = await supabase
    .from('vestibulares')
    .select('*')
    .order('data_prova', { ascending: true, nullsFirst: false });

  if (error || !data || !data.length) {
    vestibularesListaEl.innerHTML = `<p class="empty-state">Nenhum vestibular cadastrado ainda.</p>`;
    return;
  }

  vestibularesListaEl.innerHTML = data.map(v => renderVestibularCard(v)).join('');
}

function renderVestibularCard(v) {
  const hoje = new Date();
  const inscInicio = v.inscricao_inicio ? new Date(v.inscricao_inicio + 'T00:00:00') : null;
  const inscFim = v.inscricao_fim ? new Date(v.inscricao_fim + 'T23:59:59') : null;

  let statusHtml = '';
  if (inscInicio && inscFim) {
    if (hoje < inscInicio) {
      statusHtml = `<span class="status-pill status-em-breve">Inscrições abrem em ${formatarData(v.inscricao_inicio)}</span>`;
    } else if (hoje >= inscInicio && hoje <= inscFim) {
      statusHtml = `<span class="status-pill status-aberta">✅ Inscrições abertas até ${formatarData(v.inscricao_fim)}</span>`;
    } else {
      statusHtml = `<span class="status-pill status-encerrada">Inscrições encerradas</span>`;
    }
  }

  const badgeTreineiro = v.aceita_treineiro
    ? `<span class="badge-treineiro">🎓 Aceita treineiros</span>`
    : '';

  return `
    <div class="card vestibular-card">
      <div class="vestibular-header">
        <div>
          <div class="vestibular-nome">${v.nome}</div>
          <div class="vestibular-inst">${v.instituicao}${v.cidade ? ' · ' + v.cidade : ''}</div>
        </div>
        ${badgeTreineiro}
      </div>

      ${statusHtml}

      <div class="vestibular-datas">
        ${v.inscricao_inicio ? `<div class="data-item"><strong>Inscrições</strong><span>${formatarData(v.inscricao_inicio)} a ${formatarData(v.inscricao_fim)}</span></div>` : ''}
        ${v.data_prova ? `<div class="data-item"><strong>Prova</strong><span>${formatarData(v.data_prova)}</span></div>` : ''}
        ${v.tipo_prova ? `<div class="data-item"><strong>Formato</strong><span>${v.tipo_prova}</span></div>` : ''}
      </div>

      ${v.descricao ? `<p class="vestibular-desc">${v.descricao}</p>` : ''}

      <div class="vestibular-links">
        ${v.link_oficial ? `<a class="link-btn primary" href="${v.link_oficial}" target="_blank" rel="noopener">Site oficial ↗</a>` : ''}
        ${v.link_edital && v.link_edital !== v.link_oficial ? `<a class="link-btn" href="${v.link_edital}" target="_blank" rel="noopener">Edital ↗</a>` : ''}
      </div>
    </div>
  `;
}

function formatarData(dataStr) {
  if (!dataStr) return '';
  const data = new Date(dataStr + 'T00:00:00');
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ===== Treineiro ===== */

function renderFiltroTreineiro(materias) {
  const chipsHtml = materias.map(m => `<div class="chip" data-materia="${m.id}">${m.nome}</div>`).join('');
  filtroTreineiroEl.innerHTML = `<div class="chip active" data-materia="todas">Todas</div>${chipsHtml}`;

  filtroTreineiroEl.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroTreineiroEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      materiaAtivaTreineiro = chip.dataset.materia;
      renderAulas();
    });
  });
}

async function carregarAulas() {
  const { data, error } = await supabase
    .from('treineiro_aulas')
    .select('id, titulo, explicacao, youtube_busca, materia_id, ordem, materias(nome, cor)')
    .order('ordem');

  if (error || !data) {
    aulasListaEl.innerHTML = `<p class="empty-state">Não deu pra carregar as aulas agora.</p>`;
    return;
  }

  aulasCache = data;
  renderAulas();
}

function renderAulas() {
  const filtradas = materiaAtivaTreineiro === 'todas'
    ? aulasCache
    : aulasCache.filter(a => a.materia_id === materiaAtivaTreineiro);

  if (!filtradas.length) {
    aulasListaEl.innerHTML = `<p class="empty-state">Nenhuma aula nesse assunto ainda.</p>`;
    return;
  }

  aulasListaEl.innerHTML = filtradas.map(a => {
    const cor = a.materias?.cor || '#7c3aed';
    const nomeMateria = a.materias?.nome || 'Geral';
    return `
      <div class="card aula-card" data-id="${a.id}">
        <span class="aula-materia-tag" style="background:${cor}22; color:${cor};">${nomeMateria}</span>
        <h4>${a.titulo}</h4>
        <p>${a.explicacao.slice(0, 80)}...</p>
      </div>
    `;
  }).join('');

  aulasListaEl.querySelectorAll('.aula-card').forEach(el => {
    el.addEventListener('click', () => abrirAula(el.dataset.id));
  });
}

async function abrirAula(id) {
  const aula = aulasCache.find(a => a.id === id);
  if (!aula) return;

  const cor = aula.materias?.cor || '#7c3aed';
  document.getElementById('aula-materia-tag').textContent = aula.materias?.nome || 'Geral';
  document.getElementById('aula-materia-tag').style.background = cor + '22';
  document.getElementById('aula-materia-tag').style.color = cor;
  document.getElementById('aula-titulo').textContent = aula.titulo;
  document.getElementById('aula-explicacao').textContent = aula.explicacao;

  modalAula.classList.add('open');

  const videosEl = document.getElementById('aula-videos');
  videosEl.innerHTML = `<p class="empty-state" style="grid-column:1/-1;">Buscando vídeos...</p>`;
  const videos = await buscarVideosYoutube(aula.youtube_busca || aula.titulo);
  renderVideos(videos);

  const exerciciosEl = document.getElementById('aula-exercicios');
  exerciciosEl.innerHTML = `<p class="empty-state">Carregando exercícios...</p>`;
  await renderExercicios(aula.materia_id);
}

function renderVideos(videos) {
  const videosEl = document.getElementById('aula-videos');
  if (!videos.length) {
    videosEl.innerHTML = `<p class="empty-state" style="grid-column:1/-1;">Não encontramos vídeos agora. Tenta de novo mais tarde.</p>`;
    return;
  }
  videosEl.innerHTML = videos.map(v => `
    <a class="video-card" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">
      <img src="${v.thumb}" alt="${v.titulo}" />
      <div class="video-titulo">${v.titulo}</div>
      <div class="video-canal">${v.canal}</div>
    </a>
  `).join('');
}

async function buscarVideosYoutube(query) {
  const cacheKey = 'yt_busca_' + query;
  const cache = sessionStorage.getItem(cacheKey);
  if (cache) {
    try { return JSON.parse(cache); } catch (e) { /* ignora cache quebrado */ }
  }

  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('[YouTube] VITE_YOUTUBE_API_KEY não configurada.');
    return [];
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=4&relevanceLanguage=pt&regionCode=BR&q=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items) {
      console.error('[YouTube] resposta sem items:', data);
      return [];
    }

    const videos = data.items.map(item => ({
      id: item.id.videoId,
      titulo: item.snippet.title,
      canal: item.snippet.channelTitle,
      thumb: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    }));

    sessionStorage.setItem(cacheKey, JSON.stringify(videos));
    return videos;
  } catch (e) {
    console.error('[YouTube] erro na busca:', e);
    return [];
  }
}

async function renderExercicios(materiaId) {
  const exerciciosEl = document.getElementById('aula-exercicios');

  const { data, error } = await supabase
    .from('questoes')
    .select('id, enunciado, alternativas, resposta_correta, comentario')
    .eq('materia_id', materiaId);

  if (error || !data || !data.length) {
    exerciciosEl.innerHTML = `<p class="empty-state">Ainda não tem exercícios cadastrados pra essa matéria.</p>`;
    return;
  }

  const embaralhadas = [...data].sort(() => Math.random() - 0.5).slice(0, 5);

  exerciciosEl.innerHTML = embaralhadas.map((q, i) => {
  const alternativasHtml = (q.alternativas || []).map(alt => `
      <button class="alternativa-btn" data-letra="${alt.letra}" data-questao="${i}">
        <strong>${alt.letra})</strong> ${alt.texto}
      </button>
    `).join('');

    return `
      <div class="exercicio-item" data-questao-id="${q.id}">
        <div class="exercicio-enunciado">${q.enunciado}</div>
        <div data-alternativas="${i}">${alternativasHtml}</div>
        <div class="exercicio-comentario" id="comentario-${i}">${q.comentario || ''}</div>
      </div>
    `;
  }).join('');

  exerciciosEl.querySelectorAll('.alternativa-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.questao;
      const questao = embaralhadas[idx];
      const grupo = exerciciosEl.querySelector(`[data-alternativas="${idx}"]`);
      const jaRespondeu = grupo.dataset.respondido === 'true';
      if (jaRespondeu) return;
      grupo.dataset.respondido = 'true';

      grupo.querySelectorAll('.alternativa-btn').forEach(b => {
        if (b.dataset.letra === questao.resposta_correta) {
          b.classList.add('correta');
        } else if (b === btn) {
          b.classList.add('errada');
        }
      });

      const comentarioEl = document.getElementById(`comentario-${idx}`);
      if (comentarioEl && comentarioEl.textContent.trim()) {
        comentarioEl.classList.add('show');
      }
    });
  });
}

/* ===== Tabs e modal ===== */

function configurarTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

function configurarModal() {
  document.getElementById('modal-aula-close').addEventListener('click', () => {
    modalAula.classList.remove('open');
  });
  modalAula.addEventListener('click', (e) => {
    if (e.target === modalAula) modalAula.classList.remove('open');
  });
}

iniciar();
