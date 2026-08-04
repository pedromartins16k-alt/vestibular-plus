import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const gridEl = document.getElementById('metas-grid');
const modalOverlay = document.getElementById('modal-overlay');

let userId = null;
let metasCache = [];

const TIPO_INFO = {
  horas_estudo: { label: 'Horas de estudo', icone: '⏰', unidade: 'h' },
  questoes_resolvidas: { label: 'Questões resolvidas', icone: '✅', unidade: 'questões' },
  flashcards_revisados: { label: 'Flashcards revisados', icone: '🧠', unidade: 'cards' },
  simulados_feitos: { label: 'Simulados feitos', icone: '⏱️', unidade: 'simulados' },
};

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  userId = session.user.id;
  await carregarMetas();
}

async function carregarMetas() {
  const { data: metas } = await supabase
    .from('metas')
    .select('id, descricao, tipo, valor_alvo, valor_atual, prazo')
    .eq('user_id', userId);

  const { data: sessoes } = await supabase
    .from('sessoes_estudo')
    .select('tipo, duracao_minutos')
    .eq('user_id', userId);

  const progresso = calcularProgresso(sessoes || []);

  metasCache = (metas || []).map(m => ({
    ...m,
    valor_atual: progresso[m.tipo] ?? 0,
  }));

  // Mantém o valor_atual salvo no banco em sincronia (não é obrigatório, mas evita
  // que outras telas mostrem um número desatualizado).
  metasCache.forEach(m => {
    supabase.from('metas').update({ valor_atual: m.valor_atual }).eq('id', m.id);
  });

  renderMetas();
}

function calcularProgresso(sessoes) {
  const minutosPorTipo = { flashcards: 0, questoes: 0, simulado: 0, resumo: 0 };
  let totalMinutos = 0;
  let flashcardsRevisados = 0;
  let questoesResolvidas = 0;
  let simuladosFeitos = 0;

  sessoes.forEach(s => {
    totalMinutos += s.duracao_minutos || 0;
    if (s.tipo === 'flashcards') flashcardsRevisados++;
    if (s.tipo === 'questoes') questoesResolvidas++;
    if (s.tipo === 'simulado') simuladosFeitos++;
  });

  return {
    horas_estudo: Math.round((totalMinutos / 60) * 10) / 10,
    questoes_resolvidas: questoesResolvidas,
    flashcards_revisados: flashcardsRevisados,
    simulados_feitos: simuladosFeitos,
  };
}

function renderMetas() {
  if (!metasCache.length) {
    gridEl.innerHTML = `<p class="empty-state">Nenhuma meta criada ainda. Clica em "+ Nova meta" pra começar! 🎯</p>`;
    return;
  }

  const hojeStr = new Date().toISOString().slice(0, 10);

  gridEl.innerHTML = metasCache.map(m => {
    const info = TIPO_INFO[m.tipo] || { label: m.tipo, icone: '🎯', unidade: '' };
    const percentual = Math.min(100, Math.round((m.valor_atual / m.valor_alvo) * 100));
    const concluida = m.valor_atual >= m.valor_alvo;
    const atrasada = !concluida && m.prazo && m.prazo < hojeStr;

    let prazoHtml = '';
    if (m.prazo) {
      const dataFormatada = new Date(m.prazo + 'T00:00:00').toLocaleDateString('pt-BR');
      prazoHtml = `<div class="meta-prazo ${atrasada ? 'atrasada' : ''}">
        ${atrasada ? '⚠️ Prazo era' : '📅 Até'} ${dataFormatada}
      </div>`;
    }

    return `
      <div class="card meta-card ${concluida ? 'concluida' : ''}" data-id="${m.id}">
        ${concluida ? '<span class="meta-selo">🏆</span>' : ''}
        <div class="meta-icone">${info.icone}</div>
        <div class="meta-descricao">${m.descricao}</div>
        <div class="meta-tipo">${info.label}</div>
        <div class="meta-prog-track">
          <div class="meta-prog-fill ${concluida ? 'concluida' : ''}" style="width:${percentual}%"></div>
        </div>
        <div class="meta-valores">
          <span>${m.valor_atual} / ${m.valor_alvo} ${info.unidade}</span>
          <span>${percentual}%</span>
        </div>
        ${prazoHtml}
        <span class="meta-del" data-del="${m.id}">🗑️</span>
      </div>
    `;
  }).join('');

  gridEl.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', () => excluirMeta(el.dataset.del));
  });
}

async function excluirMeta(id) {
  if (!confirm('Excluir essa meta?')) return;
  await supabase.from('metas').delete().eq('id', id);
  metasCache = metasCache.filter(m => m.id !== id);
  renderMetas();
}

async function salvarNovaMeta() {
  const descricao = document.getElementById('input-descricao').value.trim();
  const tipo = document.getElementById('input-tipo').value;
  const valorAlvo = document.getElementById('input-valor-alvo').value;
  const prazo = document.getElementById('input-prazo').value || null;

  if (!descricao || !valorAlvo || Number(valorAlvo) <= 0) {
    alert('Preenche a descrição e um valor alvo maior que zero.');
    return;
  }

  const { error } = await supabase.from('metas').insert({
    user_id: userId,
    descricao,
    tipo,
    valor_alvo: Number(valorAlvo),
    prazo,
    valor_atual: 0,
  });

  if (error) {
    alert('Não deu pra salvar. Tenta de novo.');
    return;
  }

  fecharModal();
  document.getElementById('input-descricao').value = '';
  document.getElementById('input-valor-alvo').value = '';
  document.getElementById('input-prazo').value = '';
  await carregarMetas();
}

function abrirModal() {
  modalOverlay.classList.add('open');
}
function fecharModal() {
  modalOverlay.classList.remove('open');
}

document.getElementById('btn-add').addEventListener('click', abrirModal);
document.getElementById('modal-close').addEventListener('click', fecharModal);
document.getElementById('btn-salvar').addEventListener('click', salvarNovaMeta);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) fecharModal();
});

iniciar();
