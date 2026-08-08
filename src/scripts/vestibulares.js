
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const vestibularesListaEl = document.getElementById('vestibulares-lista');
const filtroTreineiroEl = document.getElementById('filtro-materias-treineiro');
const aulasListaEl = document.getElementById('aulas-lista');
const pesquisaListaEl = document.getElementById('pesquisa-lista');
const modalAula = document.getElementById('modal-aula');

let aulasCache = [];
let vestibularesCache = [];
let materiaAtivaTreineiro = 'todas';

// Mapeia o "nome" de cada vestibular (igual está no banco, tabela vestibulares)
// para os ids das aulas do Treineiro que caem nele. Curadoria feita a partir
// dos editais/conteúdo programático oficiais de cada vestibular.
const ASSUNTOS_POR_VESTIBULAR = {
  'ENEM 2026': [
    '5f1d6d16-7434-4122-ab6d-c5a2809b4ab8', // Funções
    '4328eb75-9ecd-4cdb-97bd-8ea93182e0db', // Porcentagem e juros
    '8b3287b8-d97d-4ac5-9d3c-38cf58b1cd65', // Geometria plana
    'a0000001-0000-4000-8000-000000000003', // Probabilidade e estatística
    '59434946-96e0-439b-b107-573e5af22b56', // Interpretação de texto
    'd4a208d0-b6ff-487b-a4e2-ad5ab92be503', // Figuras de linguagem
    'a72e3df5-fa3f-43b4-a7b9-d88e93c0f031', // Estrutura da redação
    'c7060d1c-4715-4dcf-9bfa-e6c4d9dd4970', // Ecologia
    'c0650565-7c02-4330-a3c6-ad82d8adf5f5', // Citologia
    'faa87a6f-6a79-4433-b7ee-471a9eb5553c', // Cinemática
    '65a6c7d9-8ded-4638-8f7f-944ee35bb5d2', // Leis de Newton
    '757a6ed0-db10-46e4-b8e3-953136e2c633', // Estequiometria
    '08382315-4e07-4244-993b-91acf994aff6', // Urbanização brasileira
    'a35cc234-c855-4618-8fcc-df5f0a2af95d', // Globalização e blocos econômicos
  ],
  'Fuvest 2027 (USP)': [
    '4328eb75-9ecd-4cdb-97bd-8ea93182e0db', // Porcentagem e juros
    '5f1d6d16-7434-4122-ab6d-c5a2809b4ab8', // Funções
    '8b3287b8-d97d-4ac5-9d3c-38cf58b1cd65', // Geometria plana
    'a0000001-0000-4000-8000-000000000001', // Geometria espacial
    'a0000001-0000-4000-8000-000000000002', // Trigonometria
    'a0000001-0000-4000-8000-000000000003', // Probabilidade e estatística
    '65a6c7d9-8ded-4638-8f7f-944ee35bb5d2', // Leis de Newton
    'f0000001-0000-4000-8000-000000000002', // Trabalho e energia
    'f0000001-0000-4000-8000-000000000001', // Termologia
    '92326240-578c-4456-b064-677ffac00945', // Eletricidade básica
    '757a6ed0-db10-46e4-b8e3-953136e2c633', // Estequiometria
    'c0000001-0000-4000-8000-000000000001', // Equilíbrio químico
    'c0000001-0000-4000-8000-000000000002', // Ácidos, bases e pH
    'c0650565-7c02-4330-a3c6-ad82d8adf5f5', // Citologia
    '449335d0-226e-408a-888e-b3c7b138be6c', // Leis de Mendel
    'c7060d1c-4715-4dcf-9bfa-e6c4d9dd4970', // Ecologia
    'b0000001-0000-4000-8000-000000000001', // Evolução
    '10000001-0000-4000-8000-000000000001', // Gêneros textuais na redação
  ],
  'Vestibular Unicamp 2027': [
    'c7060d1c-4715-4dcf-9bfa-e6c4d9dd4970', // Ecologia
    'b0000001-0000-4000-8000-000000000002', // Zoologia
    'b0000001-0000-4000-8000-000000000003', // Botânica
    'b0000001-0000-4000-8000-000000000001', // Evolução
    'c0650565-7c02-4330-a3c6-ad82d8adf5f5', // Citologia
    '757a6ed0-db10-46e4-b8e3-953136e2c633', // Estequiometria
    'c0000001-0000-4000-8000-000000000001', // Equilíbrio químico
    'c0000001-0000-4000-8000-000000000003', // Soluções
    'faa87a6f-6a79-4433-b7ee-471a9eb5553c', // Cinemática
    'f0000001-0000-4000-8000-000000000001', // Termologia
    '5f1d6d16-7434-4122-ab6d-c5a2809b4ab8', // Funções
    'a0000001-0000-4000-8000-000000000002', // Trigonometria
    '00000001-0000-4000-8000-000000000001', // Brasil Colônia
    '00000001-0000-4000-8000-000000000002', // Idade Moderna
    'e0000001-0000-4000-8000-000000000001', // Biomas
    'e0000001-0000-4000-8000-000000000002', // Geopolítica mundial
  ],
  'Vestibular Unesp 2027': [
    'd0000001-0000-4000-8000-000000000001', // Gramática
    '59434946-96e0-439b-b107-573e5af22b56', // Interpretação de texto
    'd0000001-0000-4000-8000-000000000002', // Literatura brasileira
    '8b3287b8-d97d-4ac5-9d3c-38cf58b1cd65', // Geometria plana
    '5f1d6d16-7434-4122-ab6d-c5a2809b4ab8', // Funções
    'a0000001-0000-4000-8000-000000000004', // Progressões
    'c7060d1c-4715-4dcf-9bfa-e6c4d9dd4970', // Ecologia
    'c0650565-7c02-4330-a3c6-ad82d8adf5f5', // Citologia
    'b0000001-0000-4000-8000-000000000004', // Fisiologia humana
    'b0000001-0000-4000-8000-000000000001', // Evolução
    '92326240-578c-4456-b064-677ffac00945', // Eletricidade básica
    'f0000001-0000-4000-8000-000000000003', // Óptica geométrica
    'f0000001-0000-4000-8000-000000000001', // Termologia
    'c0000001-0000-4000-8000-000000000003', // Soluções
    'c0000001-0000-4000-8000-000000000004', // Química ambiental
    '00000001-0000-4000-8000-000000000003', // História da América
    '00000001-0000-4000-8000-000000000004', // História da África
    'e0000001-0000-4000-8000-000000000003', // População e demografia
    'e0000001-0000-4000-8000-000000000004', // Cartografia
  ],
  'Vestibular PUC-Campinas': [
    '5f1d6d16-7434-4122-ab6d-c5a2809b4ab8', // Funções
    '59434946-96e0-439b-b107-573e5af22b56', // Interpretação de texto
    'c7060d1c-4715-4dcf-9bfa-e6c4d9dd4970', // Ecologia
    '65a6c7d9-8ded-4638-8f7f-944ee35bb5d2', // Leis de Newton
    '757a6ed0-db10-46e4-b8e3-953136e2c633', // Estequiometria
    '5402e80f-fb4f-4e05-a854-712a3ca58cc1', // Era Vargas
    '08382315-4e07-4244-993b-91acf994aff6', // Urbanização brasileira
    'a72e3df5-fa3f-43b4-a7b9-d88e93c0f031', // Estrutura da redação
  ],
};

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
  renderPesquisaVestibulares();
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

  vestibularesCache = data;
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
  await renderExercicios(aula.id);
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

async function renderExercicios(aulaId) {
  const exerciciosEl = document.getElementById('aula-exercicios');

  const { data, error } = await supabase
    .from('questoes')
    .select('id, enunciado, alternativas, resposta_correta, comentario')
    .eq('aula_id', aulaId);

  if (error || !data || !data.length) {
    exerciciosEl.innerHTML = `<p class="empty-state">Ainda não tem exercícios cadastrados pra esse assunto.</p>`;
    return;
  }

  const embaralhadas = [...data].sort(() => Math.random() - 0.5);

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

/* ===== Por assunto (busca por vestibular) ===== */

function renderVestibularAssuntosCard(v) {
  const aulaIds = ASSUNTOS_POR_VESTIBULAR[v.nome] || [];
  const aulasEncontradas = aulaIds
    .map(id => aulasCache.find(a => a.id === id))
    .filter(Boolean);

  if (!aulasEncontradas.length) {
    return `
      <div class="card vestibular-accordion">
        <div class="vestibular-accordion-header">
          <div>
            <div class="nome">${v.nome}</div>
            <div class="inst">${v.instituicao || ''}</div>
          </div>
        </div>
      </div>
    `;
  }

  const porMateria = {};
  aulasEncontradas.forEach(a => {
    const nomeMateria = a.materias?.nome || 'Geral';
    if (!porMateria[nomeMateria]) {
      porMateria[nomeMateria] = { cor: a.materias?.cor || '#7c3aed', itens: [] };
    }
    porMateria[nomeMateria].itens.push(a);
  });

  const gruposHtml = Object.entries(porMateria).map(([nomeMateria, grupo]) => `
    <div class="assunto-materia-grupo">
      <div class="assunto-materia-titulo" style="color:${grupo.cor};">${nomeMateria}</div>
      <div class="assunto-chip-list">
        ${grupo.itens.map(a => `<div class="assunto-chip" data-id="${a.id}">${a.titulo.split(':')[0]}</div>`).join('')}
      </div>
    </div>
  `).join('');

  return `
    <div class="card vestibular-accordion">
      <div class="vestibular-accordion-header">
        <div>
          <div class="nome">${v.nome}</div>
          <div class="inst">${v.instituicao || ''}</div>
        </div>
        <span class="vestibular-accordion-arrow">▾</span>
      </div>
      <div class="vestibular-accordion-body">${gruposHtml}</div>
    </div>
  `;
}

function renderPesquisaVestibulares() {
  if (!vestibularesCache.length) {
    pesquisaListaEl.innerHTML = `<p class="empty-state">Nenhum vestibular cadastrado ainda.</p>`;
    return;
  }

  pesquisaListaEl.innerHTML = vestibularesCache.map(v => renderVestibularAssuntosCard(v)).join('');

  pesquisaListaEl.querySelectorAll('.vestibular-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.vestibular-accordion').classList.toggle('open');
    });
  });

  pesquisaListaEl.querySelectorAll('.assunto-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirAula(chip.dataset.id);
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
