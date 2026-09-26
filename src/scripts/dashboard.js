import { iniciarNotificacoes } from './notificacoes-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao, sair } from '../lib/authGuard.js';
import { calcularProgressoNivel } from '../utils/xp.js';
import { iniciarBusca } from './busca-global.js';
import { verificarConquistas } from './conquistas.js';
import { aplicarCadeadosSidebar } from './plano-sidebar.js';
import { isUltimate } from '../lib/permissions.js';
import { getCache, setCache } from '../lib/cache.js';

let currentUserId = null;
let isCarregandoCotas = false;
let ultimoFetchCotas = 0;
let canalCotasRealtime = null;

// Cache em memória de dados carregados na sessão do dashboard
let dadosProjetosCache = [];
let dadosSessoesCache = [];

async function iniciarDashboard() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;
  currentUserId = userId;

  document.getElementById('logout-btn')?.addEventListener('click', sair);

  // Inicializa data atual e mensagem motivacional contextual
  atualizarDataEMotivacao();

  // Inicia Notificações (passando userId para evitar nova chamada a getSession)
  iniciarNotificacoes(userId);

  // 1. PRIORIDADE ALTA: Perfil do usuário (saudação, avatar, XP, cadeados)
  const promessaPerfil = carregarPerfil(userId);

  // 2. PRIORIDADE ALTA: Sessões de estudo (horas, questões, simulados, streak)
  const promessaSessoes = carregarEstatisticas(userId);

  // 3. PRIORIDADE MÉDIA: Cotas de recursos (questões, resumos, chat, simulados)
  const promessaCotas = promessaPerfil.then(perfil => {
    const planoNome = perfil?.planos?.nome;
    return carregarCotasDisponiveis(userId, planoNome);
  });

  // 4. PRIORIDADE MÉDIA: Carregar Projetos de Estudo do usuário e atualizar "Seu Próximo Passo"
  const projetosCarregados = carregarProjetosEstudo(userId);
  dadosProjetosCache = projetosCarregados || [];

  // 5. PRIORIDADE MÉDIA: Progresso por matéria (usa dados de sessões quando prontos)
  const promessaMaterias = carregarMateriasEProgresso(promessaSessoes);

  // 6. PRIORIDADE MÉDIA: Contagem regressiva de vestibulares/ENEM
  const promessaVestibulares = carregarContagemVestibulares();

  // 7. PRIORIDADE BAIXA: Ranking (top 5) e Conquistas em segundo plano
  const promessaRanking = carregarRanking(userId);

  // Atualiza o spotlight "Seu Próximo Passo" assim que projetos ou sessões estiverem prontos
  promessaSessoes.then(sessoes => {
    dadosSessoesCache = sessoes || [];
    atualizarProximoPasso(dadosProjetosCache, dadosSessoesCache);
  });

  // Executa verificação de conquistas em background aproveitando dados já carregados
  Promise.allSettled([promessaPerfil, promessaSessoes]).then(([resPerfil, resSessoes]) => {
    const perfil = resPerfil.status === 'fulfilled' ? resPerfil.value : null;
    const sessoes = resSessoes.status === 'fulfilled' ? resSessoes.value : null;
    verificarConquistas(userId, {
      sessoes: sessoes || [],
      metaDiaria: perfil?.meta_diaria_minutos || 60
    }).catch(err => console.warn('Erro em verificarConquistas:', err));
  });

  // Inicia sincronização Realtime e listener de visibilidade
  iniciarSincronizacaoRealtime(userId);
}

/**
 * Atualiza o cabeçalho com a data atual formatada e uma saudação/motivação contextual.
 */
function atualizarDataEMotivacao() {
  const elData = document.getElementById('data-hoje');
  const elMotivacao = document.getElementById('mensagem-motivacional');

  const agora = new Date();
  if (elData) {
    try {
      const opcoes = { weekday: 'long', day: 'numeric', month: 'long' };
      const dataFormatada = agora.toLocaleDateString('pt-BR', opcoes);
      elData.textContent = `📅 ${dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1)}`;
    } catch (_) {
      elData.textContent = '📅 Hoje';
    }
  }

  if (elMotivacao) {
    const hora = agora.getHours();
    let msg = 'Mantenha a consistência! Cada hora de foco aproxima você do resultado no vestibular.';
    if (hora >= 5 && hora < 12) {
      msg = 'Bom dia! Mantenha a constância e o foco na sua sessão matinal de estudos.';
    } else if (hora >= 12 && hora < 18) {
      msg = 'Boa tarde! Continue firme nos seus objetivos de estudos de hoje.';
    } else {
      msg = 'Boa noite! Revise os tópicos essenciais e consolide sua retenção.';
    }
    elMotivacao.textContent = msg;
  }
}

/**
 * Carrega e renderiza os dados do perfil: nome, avatar, XP e aplica cadeados na barra lateral.
 */
async function carregarPerfil(userId) {
  try {
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('nome, nome_usuario, nivel, xp, meta_diaria_minutos, planos(nome, ordem)')
      .eq('id', userId)
      .maybeSingle();

    // Se o usuário ainda não possui perfil (usuário novo via OAuth)
    if (!profile) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id === userId) {
          const meta = user.user_metadata || {};
          const nomeInicial = meta.full_name || meta.name || meta.nome || user.email?.split('@')[0] || 'Aluno(a)';

          const { data: planoFree } = await supabase
            .from('planos')
            .select('id')
            .eq('nome', 'free')
            .maybeSingle();

          await supabase
            .from('profiles')
            .upsert({
              id: userId,
              nome: nomeInicial,
              plano_id: planoFree?.id || null,
              nivel: 1,
              xp: 0,
              meta_diaria_minutos: 60
            }, { onConflict: 'id', ignoreDuplicates: true });

          const { data: perfilNovo } = await supabase
            .from('profiles')
            .select('nome, nome_usuario, nivel, xp, meta_diaria_minutos, planos(nome, ordem)')
            .eq('id', userId)
            .maybeSingle();

          profile = perfilNovo;
        }
      } catch (errNovo) {
        console.warn('Erro ao provisionar perfil para novo usuário:', errNovo);
      }
    }

    if (!profile) return null;

    const planoNome = profile.planos?.nome || 'free';
    const ehUltimate = isUltimate(planoNome);

    const nomeExibicao = profile.nome_usuario || profile.nome?.split(' ')[0] || 'Aluno(a)';
    const elSaudacao = document.getElementById('saudacao');
    const elAvatar = document.getElementById('avatar-inicial');
    const elNivelInfo = document.getElementById('nivel-info');
    const elXpBar = document.getElementById('xp-bar');

    if (elSaudacao) {
      elSaudacao.innerHTML = `Olá, ${nomeExibicao}! 👋 ${
        ehUltimate
          ? `<span style="display:inline-block; font-size:.75rem; background:linear-gradient(135deg, #f59e0b, #ec4899); color:#fff; font-weight:800; padding:3px 10px; border-radius:999px; vertical-align:middle; margin-left:6px; letter-spacing:0.04em; box-shadow:0 2px 10px rgba(245,158,11,0.4);">✦ ULTIMATE</span>`
          : ''
      }`;
    }
    if (elAvatar) elAvatar.textContent = nomeExibicao[0]?.toUpperCase() || 'A';

    const { necessario, percentual } = calcularProgressoNivel(profile.xp, profile.nivel);
    if (elNivelInfo) {
      elNivelInfo.textContent = `Nível ${profile.nivel} · ${profile.xp}/${necessario} XP para o próximo nível`;
    }
    if (elXpBar) elXpBar.style.width = `${percentual}%`;

    // Aplica cadeados na sidebar usando a ordem já obtida
    aplicarCadeadosSidebar(userId, profile.planos?.ordem ?? 0);

    return profile;
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
    return null;
  }
}

/**
 * Atualiza dinamicamente a seção de destaque "Seu Próximo Passo" com base nos dados reais disponíveis.
 */
function atualizarProximoPasso(projetos, sessoes) {
  const container = document.getElementById('proximo-passo-container');
  if (!container) return;

  const primeiroProjeto = Array.isArray(projetos) && projetos.length > 0 ? projetos[0] : null;

  if (primeiroProjeto) {
    const tarefas = primeiroProjeto.tarefas || primeiroProjeto.etapas || [];
    const proximaTarefa = tarefas.length > 0 ? tarefas[0] : (primeiroProjeto.meta || 'Revisar exercícios da matéria');
    const materia = primeiroProjeto.materia || 'Geral';
    const prazo = primeiroProjeto.prazo || 'Em andamento';
    const progresso = primeiroProjeto.progresso || 25;

    container.innerHTML = `
      <div class="proximo-passo-card fade-up">
        <div class="proximo-passo-badge">🎯 SEU PRÓXIMO PASSO RECOMENDADO</div>
        <div class="proximo-passo-content">
          <div class="proximo-passo-info">
            <div class="proximo-passo-header">
              <h3 class="proximo-passo-titulo">${primeiroProjeto.titulo || primeiroProjeto.objetivo || 'Projeto de Estudos Ativo'}</h3>
              <span class="proximo-passo-materia-tag">${materia}</span>
            </div>
            <p class="proximo-passo-desc">
              <strong>Próxima atividade:</strong> ${proximaTarefa}
            </p>
            <div class="proximo-passo-meta">
              <span>📅 Prazo: ${prazo}</span>
              <span>📊 Progresso: ${progresso}%</span>
            </div>
          </div>
          <div class="proximo-passo-actions">
            <a href="./chat.html" class="btn btn-primary btn-proximo-passo">
              Continuar com IA 🚀
            </a>
            <a href="./questoes.html" class="btn btn-ghost btn-proximo-passo">
              Praticar Questões 📝
            </a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Se não houver projetos, mas houver sessões registradas
  const listaSessoes = Array.isArray(sessoes) ? sessoes : [];
  if (listaSessoes.length > 0) {
    container.innerHTML = `
      <div class="proximo-passo-card fade-up">
        <div class="proximo-passo-badge">🚀 CONTINUE SUA JORNADA DE ESTUDOS</div>
        <div class="proximo-passo-content">
          <div class="proximo-passo-info">
            <h3 class="proximo-passo-titulo">Pronto para mais uma rodada de foco?</h3>
            <p class="proximo-passo-desc">
              Você já acumulou horas de dedicação. O próximo passo ideal é testar seus conhecimentos em novas questões ou tirar dúvidas conceituais com o Tutor IA.
            </p>
          </div>
          <div class="proximo-passo-actions">
            <a href="./questoes.html" class="btn btn-primary btn-proximo-passo">
              Resolver Questões 📝
            </a>
            <a href="./chat.html" class="btn btn-ghost btn-proximo-passo">
              Tirar Dúvidas no Chat 💬
            </a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Se for aluno novo (sem projetos e sem sessões)
  container.innerHTML = `
    <div class="proximo-passo-card fade-up">
      <div class="proximo-passo-badge">✨ COMECE POR AQUI</div>
      <div class="proximo-passo-content">
        <div class="proximo-passo-info">
          <h3 class="proximo-passo-titulo">Planeje sua rotina de aprovação com o Tutor IA</h3>
          <p class="proximo-passo-desc">
            Defina suas metas e matérias prioritárias para receber um cronograma de estudos sob medida com objetivos semanais claros.
          </p>
        </div>
        <div class="proximo-passo-actions">
          <a href="./chat.html" class="btn btn-primary btn-proximo-passo">
            Criar Plano com IA 💬
          </a>
          <a href="./questoes.html" class="btn btn-ghost btn-proximo-passo">
            Explorar Questões 📝
          </a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renderiza os projetos e cronogramas de estudo salvos localmente
 */
function carregarProjetosEstudo(userId) {
  const container = document.getElementById('projetos-estudo-list');
  if (!container) return [];

  try {
    const rawProjetos = localStorage.getItem(`vestibular_projetos_${userId}`) || localStorage.getItem('vestibular_projetos_guest');
    if (!rawProjetos) return [];

    const projetos = JSON.parse(rawProjetos);
    if (!Array.isArray(projetos) || !projetos.length) return [];

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${projetos.slice(0, 3).map((p) => {
          const listaTarefas = p.tarefas || p.etapas || [];
          const proximaTarefa = listaTarefas.length > 0 ? listaTarefas[0] : (p.meta || 'Revisar exercícios');
          const progresso = p.progresso || 25;
          return `
          <div class="projeto-item-card">
            <div class="projeto-top">
              <span class="projeto-titulo">${p.titulo || p.objetivo || 'Plano de Estudos'}</span>
              <span class="projeto-tag-materia">${p.materia || 'Geral'}</span>
            </div>
            <p class="projeto-meta-texto">
              <strong>Próxima etapa:</strong> ${proximaTarefa}
            </p>
            <div style="margin: 4px 0 2px;">
              <div style="height:6px; border-radius:999px; background:var(--border-color); overflow:hidden;">
                <div style="height:100%; width:${progresso}%; background:var(--gradient-primary); border-radius:999px;"></div>
              </div>
            </div>
            <div class="projeto-footer">
              <span>📅 Prazo: ${p.prazo || '30 dias'}</span>
              <span>Tarefas: ${listaTarefas.length} etapas</span>
              <a href="./chat.html" class="see-all" style="font-size:0.78rem;">Continuar →</a>
            </div>
          </div>
        `}).join('')}
      </div>
    `;

    return projetos;
  } catch (e) {
    console.warn('Erro ao carregar projetos de estudo:', e);
    return [];
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
    const elStreakTopbar = document.getElementById('topbar-streak');
    const elStreakCard = document.getElementById('stat-streak-dias');

    if (elHoras) elHoras.textContent = `${Math.round(totalMinutos / 60)}h`;
    if (elQuestoes) elQuestoes.textContent = listaSessoes.filter(s => s.tipo === 'questoes').length;
    if (elSimulados) elSimulados.textContent = listaSessoes.filter(s => s.tipo === 'simulado').length;

    const seq = calcularSequencia(listaSessoes.map(s => s.criado_em));
    const streakTexto = `${seq} ${seq === 1 ? 'dia seguido' : 'dias seguidos'}`;
    const streakCardTexto = `${seq} ${seq === 1 ? 'dia' : 'dias'}`;

    if (elStreakTopbar) elStreakTopbar.textContent = streakTexto;
    if (elStreakCard) elStreakCard.textContent = streakCardTexto;

    return listaSessoes;
  } catch (err) {
    console.error('Erro nas estatísticas:', err);
    return [];
  }
}

/**
 * Carrega a quantidade restante de cotas com proteção contra chamadas simultâneas.
 */
async function carregarCotasDisponiveis(userId, planoNome = null) {
  if (!userId || isCarregandoCotas) return;

  const elQ = document.getElementById('cota-questoes');
  const elR = document.getElementById('cota-resumos');
  const elC = document.getElementById('cota-chat');
  const elS = document.getElementById('cota-simulados');

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

    const formatarCota = (res, fallbackLimite, tipo) => {
      if (res?.error || !res?.data) return fallbackLimite;
      const d = res.data;
      if (tipo !== 'chat' && d.ilimitado === true) return '∞';
      const lim = d.limite ?? fallbackLimite;
      const usado = d.usado ?? 0;
      return Math.max(0, lim - usado);
    };

    if (elQ) elQ.textContent = formatarCota(usoQ, 15, 'questao');
    if (elR) elR.textContent = formatarCota(usoR, 10, 'resumo');
    if (elC) elC.textContent = formatarCota(usoC, 5, 'chat');
    if (elS) elS.textContent = formatarCota(usoS, 5, 'simulado');
  } catch (err) {
    console.error('Erro ao carregar cotas:', err);
  } finally {
    isCarregandoCotas = false;
  }
}

/**
 * Carrega as matérias e renderiza as barras de progresso elegantes com tempos reais.
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
        setCache('materias-catalogo', materias, 300);
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

      if (totalMinutos > 0) {
        elMateriaList.innerHTML = materias.map(m => {
          const minutos = minutosPorMateria[m.id] || 0;
          const percentual = Math.round((minutos / totalMinutos) * 100);
          const cor = m.cor || '#7c3aed';
          
          let tempoFormatado = '0m';
          if (minutos >= 60) {
            const h = Math.floor(minutos / 60);
            const mResto = minutos % 60;
            tempoFormatado = mResto > 0 ? `${h}h ${mResto}m` : `${h}h`;
          } else if (minutos > 0) {
            tempoFormatado = `${minutos}m`;
          }

          return `
            <div class="materia-item">
              <span class="materia-dot" style="background:${cor}; color:${cor};"></span>
              <span class="materia-nome" title="${m.nome}">${m.nome}</span>
              <div class="materia-prog-wrapper">
                <div class="prog-track">
                  <div class="prog-fill" style="width:${percentual}%; background:${cor};"></div>
                </div>
                <span class="materia-tempo">${tempoFormatado}</span>
              </div>
              <a href="./questoes.html" class="see-all" style="font-size:0.75rem;" title="Praticar ${m.nome}">Praticar →</a>
            </div>
          `;
        }).join('');
      }
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
        setCache('vestibulares-datas', vestibulares, 600);
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
 * Carrega os 5 melhores alunos no ranking com pódio estilizado e distinção do usuário logado.
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

    const medalhas = ['🥇 1º', '🥈 2º', '🥉 3º', '4º', '5º'];
    const classesPodio = ['pos-ouro', 'pos-prata', 'pos-bronze', 'pos-padrao', 'pos-padrao'];

    elRanking.innerHTML = ranking.map((p, i) => {
      const nome = p.nome_usuario || p.nome || 'Aluno(a)';
      const ehVoce = p.id === userId;
      const labelPos = medalhas[i] || `${i + 1}º`;
      const classePos = classesPodio[i] || 'pos-padrao';

      return `
        <div class="ranking-item ${ehVoce ? 'ranking-item-voce' : ''}">
          <span class="ranking-pos-badge ${classePos}">${labelPos}</span>
          <span class="ranking-avatar-mini">${nome[0]?.toUpperCase() || 'A'}</span>
          <div class="ranking-info">
            <span class="ranking-nome">${nome}</span>
            ${ehVoce ? '<span class="tag-voce">você</span>' : ''}
          </div>
          <span class="ranking-xp"><strong>${(p.xp || 0).toLocaleString('pt-BR')}</strong> XP</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Erro ao carregar ranking:', err);
  }
}

/**
 * Sincronização Realtime otimizada e limpeza correta da subscription.
 */
function iniciarSincronizacaoRealtime(userId) {
  const verificarFoco = () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimoFetchCotas > 30000) {
      carregarCotasDisponiveis(userId);
    }
  };

  window.addEventListener('focus', verificarFoco);
  document.addEventListener('visibilitychange', verificarFoco);

  try {
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

/**
 * Conta os dias seguidos no fuso horário local correto.
 */
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