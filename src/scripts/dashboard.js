import { iniciarNotificacoes } from './notificacoes-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao, sair } from '../lib/authGuard.js';
import { calcularProgressoNivel } from '../utils/xp.js';
import { iniciarBusca } from './busca-global.js';
import { verificarConquistas } from './conquistas.js';
import { aplicarCadeadosSidebar } from './plano-sidebar.js';
import { getCache, setCache } from '../lib/cache.js';

let currentUserId = null;
let isCarregandoCotas = false;
let ultimoFetchCotas = 0;
let canalCotasRealtime = null;

async function iniciarDashboard() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;
  currentUserId = userId;

  document.getElementById('logout-btn')?.addEventListener('click', sair);

  // Inicia Notificações (passando userId para evitar nova chamada a getSession)
  iniciarNotificacoes(userId);

  // =========================================================================
  // CARREGAMENTO PRIORITÁRIO EM PARALELO
  // As requisições não se bloqueiam: cada elemento renderiza assim que responder.
  // =========================================================================

  // 1. PRIORIDADE ALTA: Perfil do usuário (saudação, avatar, XP, cadeados)
  const promessaPerfil = carregarPerfil(userId);

  // 2. PRIORIDADE ALTA: Sessões de estudo (horas, questões, simulados, streak)
  const promessaSessoes = carregarEstatisticas(userId);

  // 3. PRIORIDADE MÉDIA: Cotas de recursos (questões, resumos, chat, simulados)
  const promessaCotas = promessaPerfil.then(perfil => {
    const planoNome = perfil?.planos?.nome;
    return carregarCotasDisponiveis(userId, planoNome);
  });

  // 4. PRIORIDADE MÉDIA: Progresso por matéria (usa dados de sessões quando prontos)
  const promessaMaterias = carregarMateriasEProgresso(promessaSessoes);

  // 5. PRIORIDADE MÉDIA: Contagem regressiva de vestibulares/ENEM
  const promessaVestibulares = carregarContagemVestibulares();

  // 6. PRIORIDADE BAIXA: Ranking (top 5) e Conquistas em segundo plano
  const promessaRanking = carregarRanking(userId);

  // Executa verificação de conquistas em background aproveitando dados já carregados
  Promise.allSettled([promessaPerfil, promessaSessoes]).then(([resPerfil, resSessoes]) => {
    const perfil = resPerfil.status === 'fulfilled' ? resPerfil.value : null;
    const sessoes = resSessoes.status === 'fulfilled' ? resSessoes.value : null;
    verificarConquistas(userId, {
      sessoes: sessoes || [],
      metaDiaria: perfil?.meta_diaria_minutos || 60
    }).catch(err => console.warn('Erro em verificarConquistas:', err));
  });

  // Inicia sincronização Realtime e listener de visibilidade (SEM polling de 10s)
  iniciarSincronizacaoRealtime(userId);
}

/**
 * Carrega e renderiza os dados do perfil: nome, avatar, XP e aplica cadeados na barra lateral.
 */
async function carregarPerfil(userId) {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('nome, nome_usuario, nivel, xp, meta_diaria_minutos, planos(nome, ordem)')
      .eq('id', userId)
      .single();

    if (error || !profile) return null;

    const nomeExibicao = profile.nome_usuario || profile.nome?.split(' ')[0] || 'Aluno(a)';
    const elSaudacao = document.getElementById('saudacao');
    const elAvatar = document.getElementById('avatar-inicial');
    const elNivelInfo = document.getElementById('nivel-info');
    const elXpBar = document.getElementById('xp-bar');

    if (elSaudacao) elSaudacao.textContent = `Olá, ${nomeExibicao}! 👋`;
    if (elAvatar) elAvatar.textContent = nomeExibicao[0]?.toUpperCase() || 'A';

    const { necessario, percentual } = calcularProgressoNivel(profile.xp, profile.nivel);
    if (elNivelInfo) {
      elNivelInfo.textContent = `Nível ${profile.nivel} · ${profile.xp}/${necessario} XP para o próximo nível`;
    }
    if (elXpBar) elXpBar.style.width = `${percentual}%`;

    // Aplica cadeados na sidebar usando a ordem já obtida, SEM consulta adicional ao banco
    aplicarCadeadosSidebar(userId, profile.planos?.ordem ?? 0);

    return profile;
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
    return null;
  }
}

/**
 * Carrega as sessões de estudo e calcula horas, questões, simulados e streak.
 */
async function carregarEstatisticas(userId) {
  try {
    const { data: sessoes, error } = await supabase
      .from('sessoes_estudo')
      .select('duracao_minutos, tipo, materia_id, criado_em')
      .eq('user_id', userId);

    if (error) {
      console.warn('Erro ao carregar sessões de estudo:', error);
      return [];
    }

    const listaSessoes = sessoes || [];
    const totalMinutos = listaSessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);

    const elHoras = document.getElementById('stat-horas');
    const elQuestoes = document.getElementById('stat-questoes');
    const elSimulados = document.getElementById('stat-simulados');
    const elStreak = document.getElementById('topbar-streak');

    if (elHoras) elHoras.textContent = `${Math.round(totalMinutos / 60)}h`;
    if (elQuestoes) elQuestoes.textContent = listaSessoes.filter(s => s.tipo === 'questoes').length;
    if (elSimulados) elSimulados.textContent = listaSessoes.filter(s => s.tipo === 'simulado').length;

    if (elStreak) {
      const seq = calcularSequencia(listaSessoes.map(s => s.criado_em));
      elStreak.textContent = `${seq} ${seq === 1 ? 'dia seguido' : 'dias seguidos'}`;
    }

    return listaSessoes;
  } catch (err) {
    console.error('Erro nas estatísticas:', err);
    return [];
  }
}

/**
 * Carrega a quantidade restante de cotas com proteção contra chamadas simultâneas.
 * Se o plano do usuário for Pro, Premium ou Ultimate, define imediatamente '∞' sem chamadas RPC.
 */
async function carregarCotasDisponiveis(userId, planoNome = null) {
  if (!userId || isCarregandoCotas) return;

  const elQ = document.getElementById('cota-questoes');
  const elR = document.getElementById('cota-resumos');
  const elC = document.getElementById('cota-chat');
  const elS = document.getElementById('cota-simulados');

  // Otimização: se já sabemos que o plano é ilimitado, não precisamos fazer 4 chamadas RPC
  if (planoNome && ['pro', 'premium', 'ultimate'].includes(planoNome.toLowerCase())) {
    if (elQ) elQ.textContent = '∞';
    if (elR) elR.textContent = '∞';
    if (elC) elC.textContent = '∞';
    if (elS) elS.textContent = '∞';
    return;
  }

  isCarregandoCotas = true;
  ultimoFetchCotas = Date.now();

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

    if (elQ) elQ.textContent = formatarCota(usoQ, 15);
    if (elR) elR.textContent = formatarCota(usoR, 10);
    if (elC) elC.textContent = formatarCota(usoC, 10);
    if (elS) elS.textContent = formatarCota(usoS, 5);
  } catch (err) {
    console.error('Erro ao carregar cotas:', err);
  } finally {
    isCarregandoCotas = false;
  }
}

/**
 * Carrega as matérias (com cache em memória de 5 min) e renderiza as barras de progresso.
 */
async function carregarMateriasEProgresso(promessaSessoes) {
  try {
    let materias = getCache('materias-catalogo');
    if (!materias) {
      const { data, error } = await supabase
        .from('materias')
        .select('id, nome, cor')
        .order('ordem');

      if (!error && data) {
        materias = data;
        setCache('materias-catalogo', materias, 300); // 5 minutos de cache
      }
    }

    const sessoes = await promessaSessoes;
    const listaSessoes = sessoes || [];
    const totalMinutos = listaSessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);

    const elMateriaList = document.getElementById('materia-list');
    if (!elMateriaList) return;

    if (materias && materias.length) {
      const minutosPorMateria = {};
      listaSessoes.forEach(s => {
        if (!s.materia_id) return;
        minutosPorMateria[s.materia_id] = (minutosPorMateria[s.materia_id] || 0) + (s.duracao_minutos || 0);
      });

      elMateriaList.innerHTML = materias.map(m => {
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
  } catch (err) {
    console.error('Erro ao carregar matérias:', err);
  }
}

/**
 * Carrega a contagem regressiva para a próxima prova com cache de 10 minutos.
 */
async function carregarContagemVestibulares() {
  const el = document.getElementById('topbar-countdown');
  if (!el) return;

  try {
    let vestibulares = getCache('vestibulares-datas');
    if (!vestibulares) {
      const { data, error } = await supabase
        .from('vestibulares')
        .select('nome, data_prova')
        .order('data_prova', { ascending: true });

      if (!error && data) {
        vestibulares = data;
        setCache('vestibulares-datas', vestibulares, 600); // 10 minutos
      }
    }

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

/**
 * Carrega os 5 melhores alunos no ranking de forma resiliente.
 */
async function carregarRanking(userId) {
  const elRanking = document.getElementById('ranking-list');
  if (!elRanking) return;

  try {
    const { data: ranking, error } = await supabase
      .from('profiles')
      .select('id, nome, nome_usuario, xp')
      .order('xp', { ascending: false })
      .limit(5);

    if (error || !ranking || !ranking.length) return;

    elRanking.innerHTML = ranking.map((p, i) => {
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
  } catch (err) {
    console.warn('Erro ao carregar ranking:', err);
  }
}

/**
 * Sincronização Realtime otimizada:
 * - REMOVIDO o setInterval(..., 10000) que gerava 24 RPCs/minuto sem necessidade.
 * - Atualização ao retornar o foco à aba com debounce mínimo de 30 segundos.
 * - Canal Realtime com filtro estrito de usuário (filter: user_id=eq.${userId}).
 * - Limpeza correta da subscription no descarregamento da página.
 */
function iniciarSincronizacaoRealtime(userId) {
  // Atualiza cotas quando a aba volta a ficar visível, respeitando intervalo mínimo de 30 segundos
  const verificarFoco = () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimoFetchCotas > 30000) {
      carregarCotasDisponiveis(userId);
    }
  };

  window.addEventListener('focus', verificarFoco);
  document.addEventListener('visibilitychange', verificarFoco);

  try {
    // Escuta eventos Realtime APENAS deste usuário
    canalCotasRealtime = supabase
      .channel('cotas-usuario-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'uso_recursos',
        filter: `user_id=eq.${userId}`
      }, () => {
        carregarCotasDisponiveis(userId);
      })
      .subscribe();

    window.addEventListener('beforeunload', () => {
      if (canalCotasRealtime) {
        supabase.removeChannel(canalCotasRealtime);
      }
    });
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

function iniciarMenuAvatar() {
  const avatarBtn = document.getElementById('avatar-inicial');
  const userDropdown = document.getElementById('user-dropdown');
  if (avatarBtn && userDropdown) {
    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!userDropdown.contains(e.target) && e.target !== avatarBtn) {
        userDropdown.classList.remove('open');
      }
    });
  }
}

iniciarDashboard();
iniciarBusca();
iniciarMenuAvatar();