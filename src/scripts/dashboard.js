import { iniciarNotificacoes } from './notificacoes-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao, sair } from '../lib/authGuard.js';
import { calcularProgressoNivel } from '../utils/xp.js';
import { iniciarBusca } from './busca-global.js';
import { verificarConquistas } from './conquistas.js';
import { aplicarCadeadosSidebar } from './plano-sidebar.js';

let currentUserId = null;

async function iniciarDashboard() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;
  currentUserId = userId;

  // ---- Perfil (nome, nível, XP) ----
  const { data: profile } = await supabase
    .from('profiles')
    .select('nome, nome_usuario, nivel, xp, meta_diaria_minutos')
    .eq('id', userId)
    .single();

  if (profile) {
    const nomeExibicao = profile.nome_usuario || profile.nome?.split(' ')[0] || 'Aluno(a)';
    document.getElementById('saudacao').textContent = `Olá, ${nomeExibicao}! 👋`;
    document.getElementById('avatar-inicial').textContent = nomeExibicao[0]?.toUpperCase() || 'A';
    const { necessario, percentual } = calcularProgressoNivel(profile.xp, profile.nivel);
    document.getElementById('nivel-info').textContent =
      `Nível ${profile.nivel} · ${profile.xp}/${necessario} XP para o próximo nível`;
    document.getElementById('xp-bar').style.width = `${percentual}%`;
  }

  // ---- Estatísticas (sessões de estudo) ----
  const { data: sessoes } = await supabase
    .from('sessoes_estudo')
    .select('duracao_minutos, tipo, materia_id, criado_em')
    .eq('user_id', userId);

  let totalMinutos = 0;
  if (sessoes) {
    totalMinutos = sessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);
    document.getElementById('stat-horas').textContent = `${Math.round(totalMinutos / 60)}h`;
    document.getElementById('stat-questoes').textContent =
      sessoes.filter(s => s.tipo === 'questoes').length;
    document.getElementById('stat-simulados').textContent =
      sessoes.filter(s => s.tipo === 'simulado').length;

    // Atualiza a ofensiva no topo
    const seq = calcularSequencia(sessoes.map(s => s.criado_em));
    const topbarStreak = document.getElementById('topbar-streak');
    if (topbarStreak) {
      topbarStreak.textContent = `${seq} ${seq === 1 ? 'dia seguido' : 'dias seguidos'}`;
    }
  }

  // ---- Carrega as cotas/limites restantes de funções ----
  await carregarCotasDisponiveis(userId);

  // ---- Contagem Regressiva para o Vestibular/ENEM no Topbar ----
  carregarContagemVestibulares();

  // ---- Matérias + progresso ----
  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  if (materias && materias.length) {
    const minutosPorMateria = {};
    (sessoes || []).forEach(s => {
      if (!s.materia_id) return;
      minutosPorMateria[s.materia_id] = (minutosPorMateria[s.materia_id] || 0) + (s.duracao_minutos || 0);
    });

    document.getElementById('materia-list').innerHTML = materias.map(m => {
      const minutos = minutosPorMateria[m.id] || 0;
      const percentual = totalMinutos > 0 ? Math.round((minutos / totalMinutos) * 100) : 0;
      return `
      <div class="materia-item">
        <span class="materia-dot" style="background:${m.cor}"></span>
        <span style="flex:0 0 90px;">${m.nome}</span>
        <div class="prog-track"><div class="prog-fill" style="width:${percentual}%; background:${m.cor}"></div></div>
      </div>
    `;
    }).join('');
  }

  // ---- Ranking (top 5 por XP) ----
  const { data: ranking } = await supabase
    .from('profiles')
    .select('id, nome, nome_usuario, xp')
    .order('xp', { ascending: false })
    .limit(5);

  if (ranking && ranking.length) {
    document.getElementById('ranking-list').innerHTML = ranking.map((p, i) => {
      const nome = p.nome_usuario || p.nome || 'Aluno(a)';
      return `
      <div class="ranking-item">
        <span class="ranking-pos">${i + 1}º</span>
        <span class="ranking-avatar-mini">${nome[0]?.toUpperCase() || 'A'}</span>
        <span style="flex:1;">${nome}${p.id === userId ? ' (você)' : ''}</span>
        <span style="font-weight:700;">${p.xp || 0} XP</span>
      </div>
    `;
    }).join('');
  }

  document.getElementById('logout-btn').addEventListener('click', sair);

  verificarConquistas(userId);
  aplicarCadeadosSidebar(userId);
  iniciarSincronizacaoRealtime(userId);
}

// Carrega a quantidade restante de cada função diretamente via RPC do banco
async function carregarCotasDisponiveis(userId) {
  if (!userId) return;

  try {
    const [usoQ, usoR, usoC, usoS] = await Promise.all([
      supabase.rpc('consultar_uso_diario', { p_tipo: 'questao' }),
      supabase.rpc('consultar_uso_diario', { p_tipo: 'resumo' }),
      supabase.rpc('consultar_uso_diario', { p_tipo: 'chat' }),
      supabase.rpc('consultar_uso_diario', { p_tipo: 'simulado' })
    ]);

    const formatarCota = (res, fallbackLimite) => {
      if (res?.error || !res?.data) return fallbackLimite;
      const d = res.data;
      if (d.plano && ['pro', 'premium', 'ultimate'].includes(d.plano.toLowerCase())) return '∞';
      const lim = d.limite ?? fallbackLimite;
      const usado = d.usado ?? 0;
      return Math.max(0, lim - usado);
    };

    const elQ = document.getElementById('cota-questoes');
    const elR = document.getElementById('cota-resumos');
    const elC = document.getElementById('cota-chat');
    const elS = document.getElementById('cota-simulados');

    if (elQ) elQ.textContent = formatarCota(usoQ, 15);
    if (elR) elR.textContent = formatarCota(usoR, 10);
    if (elC) elC.textContent = formatarCota(usoC, 10);
    if (elS) elS.textContent = formatarCota(usoS, 5);
  } catch (err) {
    console.error('Erro ao carregar cotas:', err);
  }
}

// Atualização em tempo real (mudança de aba, foco e canal Supabase Realtime)
function iniciarSincronizacaoRealtime(userId) {
  window.addEventListener('focus', () => carregarCotasDisponiveis(userId));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      carregarCotasDisponiveis(userId);
    }
  });

  // Atualiza automaticamente a cada 10 segundos
  setInterval(() => carregarCotasDisponiveis(userId), 10000);

  // Escuta no Supabase Realtime para atualizar instantaneamente quando o banco registrar uso
  try {
    supabase
      .channel('cotas-realtime-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uso_recursos' }, () => {
        carregarCotasDisponiveis(userId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessoes_estudo' }, () => {
        carregarCotasDisponiveis(userId);
      })
      .subscribe();
  } catch (e) {
    console.warn('Realtime channel warning:', e);
  }
}

// Conta os dias seguidos no fuso horário local correto
function calcularSequencia(datasCriadoEm) {
  if (!datasCriadoEm || !datasCriadoEm.length) return 0;

  const formatLocalDate = (d) => {
    const date = new Date(d);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const dias = new Set(datasCriadoEm.map(formatLocalDate));
  const cursor = new Date();
  const hojeStr = formatLocalDate(cursor);

  if (!dias.has(hojeStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let sequencia = 0;
  while (dias.has(formatLocalDate(cursor))) {
    sequencia++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return sequencia;
}

async function carregarContagemVestibulares() {
  const el = document.getElementById('topbar-countdown');
  if (!el) return;

  try {
    const { data: vestibulares } = await supabase
      .from('vestibulares')
      .select('nome, data_prova')
      .order('data_prova', { ascending: true });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const proximo = (vestibulares || []).find(v => v.data_prova && new Date(v.data_prova) >= hoje);

    if (proximo) {
      const diffMs = new Date(proximo.data_prova) - hoje;
      const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      el.textContent = `${proximo.nome}: Faltam ${dias} dias`;
    } else {
      const anoAtual = hoje.getFullYear();
      let dataEnem = new Date(anoAtual, 10, 8);
      if (dataEnem < hoje) dataEnem = new Date(anoAtual + 1, 10, 8);
      const diffMs = dataEnem - hoje;
      const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      el.textContent = `ENEM ${dataEnem.getFullYear()}: Faltam ${dias} dias`;
    }
  } catch (_) {
    el.textContent = 'ENEM 2026: Faltam 82 dias';
  }
}

iniciarDashboard();
iniciarBusca();
iniciarNotificacoes();