import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const resumoEl = document.getElementById('resumo-geral');
const tipoListaEl = document.getElementById('tipo-lista');
const simuladoListaEl = document.getElementById('simulado-lista');
const conquistaGridEl = document.getElementById('conquista-grid');
const metaListaEl = document.getElementById('meta-lista');

const NOMES_TIPO = {
  resumo: '📚 Resumos',
  questoes: '✅ Questões',
  flashcards: '🧠 Flashcards',
  simulado: '⏱️ Simulados',
};

// Mesmo mapa usado em metas.js — precisa bater certinho pra combinar
// ícone/rótulo/unidade com o tipo salvo em metas.tipo
const TIPO_INFO = {
  horas_estudo: { label: 'Horas de estudo', icone: '⏰', unidade: 'h' },
  questoes_resolvidas: { label: 'Questões resolvidas', icone: '✅', unidade: 'questões' },
  flashcards_revisados: { label: 'Flashcards revisados', icone: '🧠', unidade: 'cards' },
  simulados_feitos: { label: 'Simulados feitos', icone: '⏱️', unidade: 'simulados' },
};

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;

  const [
    { data: sessoes },
    { data: respostas },
    { data: conquistas },
    { data: conquistasUsuario },
    { data: metas },
  ] = await Promise.all([
    supabase.from('sessoes_estudo').select('duracao_minutos, tipo').eq('user_id', userId),
    supabase.from('simulado_respostas').select('nota, finalizado_em, simulados(titulo)').eq('user_id', userId).order('finalizado_em', { ascending: false }),
    supabase.from('conquistas').select('id, nome, descricao, icone, xp_recompensa').order('xp_recompensa'),
    supabase.from('usuario_conquistas').select('conquista_id').eq('user_id', userId),
    supabase.from('metas').select('descricao, tipo, valor_alvo, prazo').eq('user_id', userId),
  ]);

  renderizarResumo(sessoes || [], respostas || [], conquistasUsuario || []);
  renderizarTipos(sessoes || []);
  renderizarSimulados(respostas || []);
  renderizarConquistas(conquistas || [], conquistasUsuario || []);
  renderizarMetas(metas || [], sessoes || []);
}

function renderizarResumo(sessoes, respostas, conquistasUsuario) {
  const totalMinutos = sessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);

  resumoEl.innerHTML = `
    <div class="card resumo-card"><strong>${Math.round(totalMinutos / 60)}h</strong><span>Total estudado</span></div>
    <div class="card resumo-card"><strong>${sessoes.length}</strong><span>Sessões registradas</span></div>
    <div class="card resumo-card"><strong>${respostas.length}</strong><span>Simulados feitos</span></div>
    <div class="card resumo-card"><strong>${conquistasUsuario.length}</strong><span>Conquistas</span></div>
  `;
}

function renderizarTipos(sessoes) {
  const totalMinutos = sessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);
  const porTipo = {};
  sessoes.forEach(s => {
    if (!s.tipo) return;
    porTipo[s.tipo] = (porTipo[s.tipo] || 0) + (s.duracao_minutos || 0);
  });

  const tipos = Object.keys(NOMES_TIPO);
  if (!totalMinutos) {
    tipoListaEl.innerHTML = `<p class="empty-state">Ainda não há sessões de estudo registradas.</p>`;
    return;
  }

  tipoListaEl.innerHTML = tipos.map(tipo => {
    const minutos = porTipo[tipo] || 0;
    const percentual = totalMinutos > 0 ? Math.round((minutos / totalMinutos) * 100) : 0;
    return `
      <div class="card tipo-item">
        <div class="tipo-topo"><span>${NOMES_TIPO[tipo]}</span><span>${percentual}%</span></div>
        <div class="prog-track"><div class="prog-fill" style="width:${percentual}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderizarSimulados(respostas) {
  if (!respostas.length) {
    simuladoListaEl.innerHTML = `<p class="empty-state">Você ainda não fez nenhum simulado.</p>`;
    return;
  }

  simuladoListaEl.innerHTML = respostas.map(r => {
    const titulo = r.simulados?.titulo || 'Simulado';
    const data = r.finalizado_em ? new Date(r.finalizado_em).toLocaleDateString('pt-BR') : '';
    const nota = r.nota !== null && r.nota !== undefined ? r.nota : '—';
    return `
      <div class="card simulado-item">
        <div>
          <div class="simulado-nome">${titulo}</div>
          <div class="simulado-data">${data}</div>
        </div>
        <div class="simulado-nota">${nota}</div>
      </div>
    `;
  }).join('');
}

function renderizarConquistas(conquistas, conquistasUsuario) {
  if (!conquistas.length) {
    conquistaGridEl.innerHTML = `<p class="empty-state">Nenhuma conquista cadastrada ainda.</p>`;
    return;
  }

  const desbloqueadasIds = new Set(conquistasUsuario.map(c => c.conquista_id));

  conquistaGridEl.innerHTML = conquistas.map(c => {
    const desbloqueada = desbloqueadasIds.has(c.id);
    return `
      <div class="card conquista-card ${desbloqueada ? '' : 'bloqueada'}" title="${c.descricao || ''}">
        <span class="conquista-icone">${c.icone || '🏅'}</span>
        <span class="conquista-nome">${c.nome}</span>
        <span class="conquista-xp">+${c.xp_recompensa} XP</span>
      </div>
    `;
  }).join('');
}

// Igual ao calcularProgresso() de metas.js — o valor_atual salvo no banco
// pode estar desatualizado, então recalcula direto das sessões de estudo.
function calcularProgresso(sessoes) {
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

function renderizarMetas(metas, sessoes) {
  if (!metas.length) {
    metaListaEl.innerHTML = `<p class="empty-state">Você ainda não criou nenhuma meta.</p>`;
    return;
  }

  const progresso = calcularProgresso(sessoes);
  const hojeStr = new Date().toISOString().slice(0, 10);

  metaListaEl.innerHTML = metas.map(m => {
    const info = TIPO_INFO[m.tipo] || { label: m.tipo, icone: '🎯', unidade: '' };
    const valorAtual = progresso[m.tipo] ?? 0;
    const percentual = m.valor_alvo > 0 ? Math.min(100, Math.round((valorAtual / m.valor_alvo) * 100)) : 0;
    const concluida = valorAtual >= m.valor_alvo;
    const atrasada = !concluida && m.prazo && m.prazo < hojeStr;

    let prazoHtml = '';
    if (m.prazo) {
      const dataFormatada = new Date(m.prazo + 'T00:00:00').toLocaleDateString('pt-BR');
      prazoHtml = `<div class="meta-prazo ${atrasada ? 'atrasada' : ''}">
        ${atrasada ? '⚠️ Prazo era' : '📅 Até'} ${dataFormatada}
      </div>`;
    }

    return `
      <div class="card meta-item ${concluida ? 'concluida' : ''}">
        ${concluida ? '<span class="meta-selo">🏆</span>' : ''}
        <div class="meta-icone-nome">${info.icone} ${m.descricao}</div>
        <div class="meta-tipo-label">${info.label}</div>
        <div class="meta-prog-track"><div class="meta-prog-fill ${concluida ? 'concluida' : ''}" style="width:${percentual}%"></div></div>
        <div class="meta-valores">
          <span>${valorAtual} / ${m.valor_alvo} ${info.unidade}</span>
          <span>${percentual}%</span>
        </div>
        ${prazoHtml}
      </div>
    `;
  }).join('');
}

iniciar();
