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

const NOMES_META_TIPO = {
  horas_estudo: 'Horas de estudo',
  questoes_resolvidas: 'Questões resolvidas',
  flashcards_revisados: 'Flashcards revisados',
  simulados_feitos: 'Simulados feitos',
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
    supabase.from('metas').select('descricao, tipo, valor_alvo, valor_atual, prazo').eq('user_id', userId),
  ]);

  renderizarResumo(sessoes || [], respostas || [], conquistasUsuario || []);
  renderizarTipos(sessoes || []);
  renderizarSimulados(respostas || []);
  renderizarConquistas(conquistas || [], conquistasUsuario || []);
  renderizarMetas(metas || []);
}

function renderizarResumo(sessoes, respostas, conquistasUsuario) {
  const totalMinutos = sessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);
  const questoesFeitas = sessoes.filter(s => s.tipo === 'questoes').length;

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

function renderizarMetas(metas) {
  if (!metas.length) {
    metaListaEl.innerHTML = `<p class="empty-state">Você ainda não criou nenhuma meta.</p>`;
    return;
  }

  metaListaEl.innerHTML = metas.map(m => {
    const percentual = m.valor_alvo > 0 ? Math.min(100, Math.round((m.valor_atual / m.valor_alvo) * 100)) : 0;
    const nomeTipo = NOMES_META_TIPO[m.tipo] || m.descricao;
    return `
      <div class="card meta-item">
        <div class="meta-topo">
          <span class="meta-nome">${m.descricao || nomeTipo}</span>
          <span class="meta-percentual">${percentual}%</span>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${percentual}%"></div></div>
      </div>
    `;
  }).join('');
}

iniciar();
