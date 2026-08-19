import { iniciarNotificacoes } from './notificacoes-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao, sair } from '../lib/authGuard.js';
import { calcularProgressoNivel } from '../utils/xp.js';
import { iniciarBusca } from './busca-global.js';
import { verificarConquistas } from './conquistas.js';
import { aplicarCadeadosSidebar } from './plano-sidebar.js';

async function iniciarDashboard() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;

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
    const seq = calcularSequencia(sessoes.map(s => s.criado_em));
    document.getElementById('stat-sequencia').textContent = seq;
    const topbarStreak = document.getElementById('topbar-streak');
    if (topbarStreak) {
      topbarStreak.textContent = `${seq} ${seq === 1 ? 'dia seguido' : 'dias seguidos'}`;
    }
  }

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

  // Se não estudou hoje ainda, checa a partir de ontem para manter a sequência ativa
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