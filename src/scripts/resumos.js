import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { iniciarBusca } from './busca-global.js';

const grid = document.getElementById('resumo-grid');
const filtroContainer = document.getElementById('filtro-materias');
const modalOverlay = document.getElementById('modal-overlay');

let resumosCache = [];
let materiaAtiva = 'todas';

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
    return `
      <div class="card resumo-card fade-up" data-index="${i}">
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
}

function abrirModal(resumo) {
  const cor = resumo.materias?.cor || '#7c3aed';
  document.getElementById('modal-tag').textContent = resumo.materias?.nome || 'Geral';
  document.getElementById('modal-tag').style.background = `${cor}22`;
  document.getElementById('modal-tag').style.color = cor;
  document.getElementById('modal-titulo').textContent = resumo.titulo;
 document.getElementById('modal-conteudo').textContent = resumo.conteudo
    .replace(/\\n/g, '\n')   // converte "\n" literal em quebra de linha real
    .replace(/[#*]/g, '');    // remove símbolos de markdown (#, *)
  document.getElementById('modal-fonte').textContent = resumo.fonte ? `Fonte: ${resumo.fonte}` : '';
  modalOverlay.classList.add('open');

  // Registra a sessão de estudo (para XP e estatísticas)
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
