/**
 * dashboard.js — Centro de Comando do Aluno (Vestibular+)
 *
 * Integra e orquestra todos os 8 blocos de inteligência e progresso do aluno:
 * 1. Cabeçalho & Saudação Personalizada
 * 2. Contagem Regressiva Oficial Dinâmica
 * 3. Índice de Preparação Real (0 a 100)
 * 4. O Que Fazer Hoje (Recomendações Prioritárias Adaptativas)
 * 5. Progresso & Domínio por Matéria
 * 6. Revisões Espaçadas (Spaced Repetition / SM-2)
 * 7. Seu Desempenho (Horas, Taxa de Acerto %, Simulados, Streak)
 * 8. Seu Próximo Passo (Spotlight Central)
 */

import { iniciarNotificacoes } from './notificacoes-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao, sair } from '../lib/authGuard.js';
import { calcularProgressoNivel } from '../utils/xp.js';
import { iniciarBusca } from './busca-global.js';
import { verificarConquistas } from './conquistas.js';
import { aplicarCadeadosSidebar } from './plano-sidebar.js';
import { isUltimate, obterPlanoUsuario, PLAN_LIMITS } from '../lib/permissions.js';
import { getCache, setCache } from '../lib/cache.js';
import { lerObjetivo, abrirModalObjetivo, calcularDiasRestantes, formatarContagem } from './objetivo.js';
import { calcularIndicePreparacao, renderizarIndice } from '../utils/indice-preparacao.js';
import { lerRevisoesPendentes } from '../utils/revisao.js';

let currentUserId = null;
let isCarregandoCotas = false;
let ultimoFetchCotas = 0;
let canalCotasRealtime = null;
let planoUsuarioCache = null;

// Cache em memória de dados carregados
let dadosSessoesCache = [];
let dadosDiagnosticoCache = null;
let dadosRevisoesCache = [];

async function iniciarDashboard() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;
  currentUserId = userId;

  document.getElementById('logout-btn')?.addEventListener('click', sair);

  // Data atual formatada no topo
  atualizarDataTopo();

  // Inicia Notificações
  iniciarNotificacoes(userId);

  // 1. PRIORIDADE ALTA: Carregar e renderizar Objetivo do Aluno e Contagem Regressiva
  const promessaObjetivo = inicializarPainelObjetivo(userId);

  // 2. PRIORIDADE ALTA: Carregar Perfil do Usuário (Nome, Nível, XP, Cadeados)
  const promessaPerfil = carregarPerfil(userId);

  // 3. PRIORIDADE ALTA: Carregar Sessões de Estudo & Estatísticas Reais
  const promessaSessoes = carregarEstatisticas(userId);

  // 4. PRIORIDADE MÉDIA: Carregar Diagnóstico e Revisões Espaçadas
  const promessaDiagnostico = carregarDiagnostico(userId);
  const promessaRevisoes = carregarRevisoes(userId);

  // 5. PRIORIDADE MÉDIA: Cotas de Recursos (Questões, Resumos, Chat, Simulados)
  promessaPerfil.then(perfil => {
    const planoNome = perfil?.planos?.nome;
    carregarCotasDisponiveis(userId, planoNome);
  });

  // 6. PRIORIDADE MÉDIA: Contagem de vestibulares no topbar
  carregarContagemVestibulares(promessaObjetivo);

  // 7. Renderiza Índice de Preparação, Recomendações e Matérias quando os dados chegarem
  Promise.allSettled([promessaSessoes, promessaDiagnostico, promessaRevisoes, promessaObjetivo]).then(
    ([resSessoes, resDiag, resRev, resObj]) => {
      const sessoes = resSessoes.status === 'fulfilled' ? resSessoes.value : [];
      const diag = resDiag.status === 'fulfilled' ? resDiag.value : null;
      const revisoes = resRev.status === 'fulfilled' ? resRev.value : [];
      const objetivo = resObj.status === 'fulfilled' ? resObj.value : null;

      dadosSessoesCache = sessoes;
      dadosDiagnosticoCache = diag;
      dadosRevisoesCache = revisoes;

      // Renderiza Bloco 3: Índice de Preparação
      atualizarIndicePreparacaoUI(sessoes, diag);

      // Renderiza Bloco 4: Recomendado para Hoje
      atualizarRecomendacoesHoje(sessoes, diag, revisoes, objetivo);

      // Renderiza Bloco 5: Progresso das Matérias
      carregarMateriasEProgresso(sessoes, diag);

      // Renderiza Bloco 8: Seu Próximo Passo
      atualizarProximoPasso(sessoes, diag, revisoes, objetivo);

      // Gerencia Onboarding para Aluno Novo
      gerenciarOnboarding(sessoes, objetivo, diag);
    }
  );

  // 8. Ranking Geral Top 5
  carregarRanking(userId);

  // 9. Verificação de Conquistas em Background
  Promise.allSettled([promessaPerfil, promessaSessoes]).then(([resPerfil, resSessoes]) => {
    const perfil = resPerfil.status === 'fulfilled' ? resPerfil.value : null;
    const sessoes = resSessoes.status === 'fulfilled' ? resSessoes.value : [];
    verificarConquistas(userId, {
      sessoes: sessoes || [],
      metaDiaria: perfil?.meta_diaria_minutos || 60
    }).catch(err => console.warn('Erro em verificarConquistas:', err));
  });

  // 10. Realtime
  iniciarSincronizacaoRealtime(userId);
}

// ----------------------------------------------------------------
// BLOCO 1 & BLOCO 2: CABEÇALHO DO ALUNO & CONTAGEM REGRESSIVA
// ----------------------------------------------------------------

function atualizarDataTopo() {
  const elData = document.getElementById('data-hoje');
  if (!elData) return;
  const agora = new Date();
  try {
    const opcoes = { weekday: 'long', day: 'numeric', month: 'long' };
    const formatada = agora.toLocaleDateString('pt-BR', opcoes);
    elData.textContent = `📅 ${formatada.charAt(0).toUpperCase() + formatada.slice(1)}`;
  } catch (_) {
    elData.textContent = '📅 Hoje';
  }
}

async function inicializarPainelObjetivo(userId) {
  const btnAlterar = document.getElementById('btn-alterar-objetivo');
  if (btnAlterar) {
    btnAlterar.addEventListener('click', () => {
      abrirModalObjetivo((novoObj) => {
        atualizarVisualObjetivo(novoObj);
        carregarContagemVestibulares(Promise.resolve(novoObj));
        atualizarRecomendacoesHoje(dadosSessoesCache, dadosDiagnosticoCache, dadosRevisoesCache, novoObj);
      });
    });
  }

  const objetivo = await lerObjetivo();
  atualizarVisualObjetivo(objetivo);
  return objetivo;
}

function atualizarVisualObjetivo(obj) {
  const elTitulo = document.getElementById('obj-titulo');
  const elSubtitulo = document.getElementById('obj-subtitulo');
  const elDiasVal = document.getElementById('countdown-dias-val');
  const elDataVal = document.getElementById('countdown-data-val');
  const elRotulo = document.getElementById('countdown-rotulo');

  if (!obj) {
    if (elTitulo) elTitulo.textContent = '🎯 Defina seu vestibular alvo';
    if (elSubtitulo) {
      elSubtitulo.innerHTML = 'Personalize sua meta de vestibular e curso para receber um plano sob medida. <a href="#" id="link-definir-obj" style="color:#a7f3d0;font-weight:700;">Configurar objetivo →</a>';
      document.getElementById('link-definir-obj')?.addEventListener('click', (e) => {
        e.preventDefault();
        abrirModalObjetivo((novo) => atualizarVisualObjetivo(novo));
      });
    }
    if (elDiasVal) elDiasVal.textContent = '—';
    if (elDataVal) elDataVal.textContent = 'Data da prova a definir';
    if (elRotulo) elRotulo.textContent = '⏳ CONTAGEM REGRESSIVA';
    return;
  }

  const vestNome = obj.vestibular_nome || 'Vestibular';
  const univNome = obj.universidade ? ` · ${obj.universidade}` : '';
  const cursoNome = obj.curso ? ` · ${obj.curso}` : '';

  if (elTitulo) {
    elTitulo.textContent = `${vestNome}${univNome}${cursoNome}`;
  }
  if (elSubtitulo) {
    elSubtitulo.textContent = obj.curso
      ? `Preparação estratégica focada para aprovação em ${obj.curso}.`
      : 'Plano intensivo de estudos para o vestibular.';
  }

  // Calcula contagem regressiva
  const dataProva = obj.data_prova || '2026-11-01';
  const diasRestantes = calcularDiasRestantes(dataProva);

  if (elDiasVal) {
    if (diasRestantes === null) {
      elDiasVal.textContent = '—';
    } else if (diasRestantes <= 0) {
      elDiasVal.textContent = diasRestantes === 0 ? 'HOJE' : '0';
    } else {
      elDiasVal.textContent = diasRestantes;
    }
  }

  if (elRotulo) {
    elRotulo.textContent = diasRestantes !== null && diasRestantes <= 1
      ? '🚨 PROVA CHEGOU!'
      : `⏳ DIAS PARA A 1ª FASE (${obj.vestibular_id?.toUpperCase() || 'PROVA'})`;
  }

  if (elDataVal) {
    if (obj.data_prova) {
      try {
        const d = new Date(obj.data_prova + 'T00:00:00');
        elDataVal.textContent = `📅 Data oficial: ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
      } catch (_) {
        elDataVal.textContent = `📅 Prova em ${obj.data_prova}`;
      }
    } else {
      elDataVal.textContent = '📅 Data a confirmar no edital oficial';
    }
  }
}

// ----------------------------------------------------------------
// BLOCO 3: ÍNDICE DE PREPARAÇÃO REAL
// ----------------------------------------------------------------

function atualizarIndicePreparacaoUI(sessoes, diagnostico) {
  const container = document.getElementById('container-indice-preparacao');
  if (!container) return;

  const listaSessoes = Array.isArray(sessoes) ? sessoes : [];
  const sessoesQuestoes = listaSessoes.filter(s => s.tipo === 'questoes');
  const totalQuestoes = sessoesQuestoes.length;
  const totalAcertos = sessoesQuestoes.filter(s => s.acertou === true).length;
  const totalSimulados = listaSessoes.filter(s => s.tipo === 'simulado').length;
  const totalFlashcards = listaSessoes.filter(s => s.tipo === 'flashcards').length;
  const totalResumos = listaSessoes.filter(s => s.tipo === 'resumo').length;
  const streakReal = calcularSequencia(listaSessoes.map(s => s.criado_em));

  // Matérias únicas praticadas
  const materiasUnicas = Array.from(new Set(listaSessoes.map(s => s.materia_id).filter(Boolean)));

  // Se o aluno não tiver nenhuma atividade registrada
  if (totalQuestoes === 0 && totalSimulados === 0 && streakReal === 0 && !diagnostico) {
    container.innerHTML = `
      <div style="text-align:center; width:100%; color:var(--text-secondary); padding:20px 10px;">
        <span style="font-size:2.4rem; font-weight:900; font-family:var(--font-display); color:var(--text-primary); display:block; line-height:1; margin-bottom:8px;">— / 100</span>
        <div style="font-weight:700; font-size:0.9rem; color:var(--color-primary-400); margin-bottom:4px;">Índice em aguardo</div>
        <p style="font-size:0.82rem; margin:0; line-height:1.4;">Resolva suas primeiras questões ou faça o diagnóstico para gerar seu índice de preparação real.</p>
        <div style="margin-top:14px;">
          <a href="./diagnostico.html" class="btn btn-primary" style="padding:7px 16px; font-size:0.8rem;">Iniciar Diagnóstico 🧠</a>
        </div>
      </div>
    `;
    return;
  }

  const resIndice = calcularIndicePreparacao({
    streakDias: streakReal,
    sessoes: listaSessoes,
    totalQuestoes: totalQuestoes,
    totalAcertos: totalAcertos,
    totalSimulados: totalSimulados,
    materiasEstudadas: materiasUnicas,
    totalMaterias: 7,
    totalFlashcards: totalFlashcards,
    totalResumosVistos: totalResumos
  });

  renderizarIndice(container, resIndice);
}

// ----------------------------------------------------------------
// BLOCO 4: O QUE FAZER HOJE (RECOMENDADO PARA HOJE)
// ----------------------------------------------------------------

function atualizarRecomendacoesHoje(sessoes, diagnostico, revisoes, objetivo) {
  const container = document.getElementById('recomendacoes-hoje-lista');
  if (!container) return;

  const itens = [];
  const pendentesHoje = Array.isArray(revisoes) ? revisoes.length : 0;

  // 1. PRIORIDADE 1: Revisões espaçadas pendentes
  if (pendentesHoje > 0) {
    itens.push({
      icone: '🧠',
      corIcone: '#ef4444',
      bgIcone: 'rgba(239, 68, 68, 0.15)',
      titulo: `Revisão Espaçada (${pendentesHoje} ite${pendentesHoje === 1 ? 'm' : 'ns'})`,
      motivo: 'Itens que atingiram a data ideal de repetição para não serem esquecidos.',
      tempoEstimado: `⏱️ ~${Math.max(5, pendentesHoje * 2)} min`,
      ctaTexto: 'Revisar Agora →',
      ctaUrl: './questoes.html'
    });
  }

  // 2. PRIORIDADE 2: Diagnóstico Inicial (se ainda não fez)
  if (!diagnostico) {
    itens.push({
      icone: '📊',
      corIcone: '#8b5cf6',
      bgIcone: 'rgba(139, 92, 246, 0.15)',
      titulo: 'Diagnóstico Inicial Adaptativo',
      motivo: 'Descubra seus pontos fortes e fracos em cada matéria do vestibular.',
      tempoEstimado: '⏱️ ~15 min · 21 questões',
      ctaTexto: 'Iniciar Diagnóstico →',
      ctaUrl: './diagnostico.html'
    });
  } else {
    // Se fez diagnóstico, encontra a matéria de menor pontuação
    const resultados = diagnostico.resultado || diagnostico.resultados_por_materia || {};
    const materiasPontuacao = Object.entries(resultados)
      .filter(([, v]) => v && v.total > 0)
      .map(([materia, v]) => ({
        materia,
        pct: Math.round((v.acertos / v.total) * 100)
      }))
      .sort((a, b) => a.pct - b.pct);

    if (materiasPontuacao.length > 0 && materiasPontuacao[0].pct < 70) {
      const fraca = materiasPontuacao[0];
      itens.push({
        icone: '🎯',
        corIcone: '#f59e0b',
        bgIcone: 'rgba(245, 158, 11, 0.15)',
        titulo: `Reforçar ${fraca.materia}`,
        motivo: `Seu domínio está em ${fraca.pct}% no diagnóstico. Pratique questões comentadas para subir de nível.`,
        tempoEstimado: '⏱️ ~20 min · 10 questões',
        ctaTexto: `Praticar ${fraca.materia} →`,
        ctaUrl: `./questoes.html`
      });
    }
  }

  // 3. PRIORIDADE 3: Prática Geral ou Simulado Cronometrado
  const totalQuestoesResolvidas = (sessoes || []).filter(s => s.tipo === 'questoes').length;
  if (totalQuestoesResolvidas < 20) {
    itens.push({
      icone: '📝',
      corIcone: '#3b82f6',
      bgIcone: 'rgba(59, 130, 246, 0.15)',
      titulo: 'Sessão de Prática de Questões',
      motivo: 'Resolva questões reais comentadas com gabarito explicativo detalhado.',
      tempoEstimado: '⏱️ 15 min',
      ctaTexto: 'Resolver Questões →',
      ctaUrl: './questoes.html'
    });
  } else {
    itens.push({
      icone: '⏱️',
      corIcone: '#10b981',
      bgIcone: 'rgba(16, 185, 129, 0.15)',
      titulo: 'Simulado de Treino Cronometrado',
      motivo: 'Teste sua velocidade e controle de tempo sob condições reais de prova.',
      tempoEstimado: '⏱️ 30 a 60 min',
      ctaTexto: 'Abrir Simulados →',
      ctaUrl: './simulados.html'
    });
  }

  // Renderiza até 3 itens prioritários
  container.innerHTML = itens.slice(0, 3).map(it => `
    <div class="recomendacao-card-item">
      <div class="rec-info-left">
        <div class="rec-icone-box" style="background:${it.bgIcone}; color:${it.corIcone};">
          ${it.icone}
        </div>
        <div>
          <div class="rec-titulo">${it.titulo}</div>
          <div class="rec-motivo">${it.motivo}</div>
          <div style="font-size:0.74rem; color:var(--text-secondary); margin-top:3px; font-weight:600;">${it.tempoEstimado}</div>
        </div>
      </div>
      <a href="${it.ctaUrl}" class="btn btn-primary" style="padding:6px 14px; font-size:0.78rem; white-space:nowrap; flex-shrink:0;">
        ${it.ctaTexto}
      </a>
    </div>
  `).join('');
}

// ----------------------------------------------------------------
// BLOCO 5: PROGRESSO & DOMÍNIO DAS MATÉRIAS
// ----------------------------------------------------------------

async function carregarMateriasEProgresso(sessoes, diagnostico) {
  const elMateriaList = document.getElementById('materia-list');
  if (!elMateriaList) return;

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

    if (!materias || !materias.length) {
      materias = [
        { id: '1', nome: 'Matemática', cor: '#3b82f6' },
        { id: '2', nome: 'Física', cor: '#8b5cf6' },
        { id: '3', nome: 'Química', cor: '#ec4899' },
        { id: '4', nome: 'Biologia', cor: '#10b981' },
        { id: '5', nome: 'Português', cor: '#f59e0b' },
        { id: '6', nome: 'História', cor: '#ef4444' },
        { id: '7', nome: 'Geografia', cor: '#06b6d4' }
      ];
    }

    const diagResultados = diagnostico?.resultado || diagnostico?.resultados_por_materia || {};

    elMateriaList.innerHTML = materias.slice(0, 7).map(m => {
      const cor = m.cor || '#7c3aed';
      let pct = 0;

      // Busca no resultado do diagnóstico
      const diagMateria = Object.entries(diagResultados).find(([k]) =>
        k.toLowerCase().includes(m.nome.toLowerCase().split(' ')[0])
      );

      if (diagMateria && diagMateria[1]?.total > 0) {
        pct = Math.round((diagMateria[1].acertos / diagMateria[1].total) * 100);
      } else {
        // Fallback: calcula com base nas sessões
        const sessoesMateria = (sessoes || []).filter(s => s.materia_id === m.id && s.tipo === 'questoes');
        if (sessoesMateria.length > 0) {
          const acertos = sessoesMateria.filter(s => s.acertou).length;
          pct = Math.round((acertos / sessoesMateria.length) * 100);
        }
      }

      return `
        <div class="materia-prog-row">
          <span class="materia-dot" style="background:${cor}; width:8px; height:8px; border-radius:50%; flex-shrink:0;"></span>
          <span class="materia-prog-nome" title="${m.nome}">${m.nome}</span>
          <div class="materia-prog-track">
            <div class="materia-prog-fill" style="width:${pct}%; background:${cor};"></div>
          </div>
          <span class="materia-prog-pct" style="color:${cor};">${pct > 0 ? pct + '%' : '0%'}</span>
          <a href="./questoes.html?materia=${m.id}" class="see-all" style="font-size:0.75rem; margin-left:4px;" title="Praticar ${m.nome}">Praticar →</a>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar progresso por matéria:', err);
  }
}

// ----------------------------------------------------------------
// BLOCO 6: REVISÕES ESPAÇADAS (Spaced Repetition)
// ----------------------------------------------------------------

async function carregarRevisoes(userId) {
  const elPendentes = document.getElementById('rev-num-pendentes');
  const elConcluidas = document.getElementById('rev-num-concluidas');
  const elTotal = document.getElementById('rev-num-total');
  const elStatusTexto = document.getElementById('rev-status-texto');
  const btnRevisar = document.getElementById('btn-revisar-agora');

  try {
    const pendentes = await lerRevisoesPendentes(userId);
    const listaPendentes = Array.isArray(pendentes) ? pendentes : [];

    // Busca total de itens agendados no Supabase
    let totalItens = listaPendentes.length;
    let concluidas = 0;

    try {
      const { data } = await supabase
        .from('revisao_agendada')
        .select('total_revisoes, acertos')
        .eq('user_id', userId);

      if (data && data.length) {
        totalItens = data.length;
        concluidas = data.filter(d => (d.total_revisoes || 0) > 0).length;
      }
    } catch (_) {}

    if (elPendentes) elPendentes.textContent = listaPendentes.length;
    if (elConcluidas) elConcluidas.textContent = concluidas;
    if (elTotal) elTotal.textContent = totalItens;

    if (elStatusTexto) {
      if (listaPendentes.length === 0) {
        elStatusTexto.textContent = '🎉 Tudo em dia! Nenhuma revisão atrasada hoje.';
        if (btnRevisar) {
          btnRevisar.textContent = 'Praticar Mais 📝';
          btnRevisar.className = 'btn btn-ghost';
        }
      } else {
        elStatusTexto.textContent = `🔴 ${listaPendentes.length} ite${listaPendentes.length === 1 ? 'm precisa' : 'ns precisam'} de revisão hoje.`;
        if (btnRevisar) {
          btnRevisar.textContent = '🚀 Revisar Agora';
          btnRevisar.className = 'btn btn-primary';
        }
      }
    }

    return listaPendentes;
  } catch (err) {
    console.warn('Erro ao carregar revisões:', err);
    return [];
  }
}

// ----------------------------------------------------------------
// BLOCO 7: SEU DESEMPENHO (MÉTRICAS REAIS)
// ----------------------------------------------------------------

async function carregarEstatisticas(userId) {
  try {
    const { data: sessoes, error } = await supabase
      .from('sessoes_estudo')
      .select('duracao_minutos, tipo, materia_id, criado_em, acertou')
      .eq('user_id', userId);

    if (error) {
      console.warn('Erro ao carregar sessões de estudo:', error);
      return [];
    }

    const listaSessoes = sessoes || [];
    const totalMinutos = listaSessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);

    const sessoesQuestoes = listaSessoes.filter(s => s.tipo === 'questoes');
    const totalQuestoes = sessoesQuestoes.length;
    const totalAcertos = sessoesQuestoes.filter(s => s.acertou === true).length;
    const taxaAcertoPct = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0;

    const totalSimulados = listaSessoes.filter(s => s.tipo === 'simulado').length;

    const elHoras = document.getElementById('stat-horas');
    const elQuestoes = document.getElementById('stat-questoes');
    const elAcertosPct = document.getElementById('stat-acertos-pct');
    const elSimulados = document.getElementById('stat-simulados');
    const elStreakCard = document.getElementById('stat-streak-dias');
    const elStreakTopbar = document.getElementById('topbar-streak');

    if (elHoras) elHoras.textContent = `${Math.round(totalMinutos / 60)}h`;
    if (elQuestoes) elQuestoes.textContent = totalQuestoes;
    if (elAcertosPct) elAcertosPct.textContent = `Taxa de acertos: ${taxaAcertoPct}%`;
    if (elSimulados) elSimulados.textContent = totalSimulados;

    const seq = calcularSequencia(listaSessoes.map(s => s.criado_em));
    const streakTexto = `${seq} ${seq === 1 ? 'dia' : 'dias'}`;

    if (elStreakTopbar) elStreakTopbar.textContent = streakTexto;
    if (elStreakCard) elStreakCard.textContent = streakTexto;

    return listaSessoes;
  } catch (err) {
    console.error('Erro nas estatísticas:', err);
    return [];
  }
}

// ----------------------------------------------------------------
// BLOCO 8: SEU PRÓXIMO PASSO (SPOTLIGHT CENTRAL)
// ----------------------------------------------------------------

function atualizarProximoPasso(sessoes, diagnostico, revisoes, objetivo) {
  const container = document.getElementById('proximo-passo-container');
  if (!container) return;

  const pendentesHoje = Array.isArray(revisoes) ? revisoes.length : 0;

  // Cenário 1: Revisões pendentes
  if (pendentesHoje > 0) {
    container.innerHTML = `
      <div style="flex:1; min-width:280px;">
        <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#ef4444; margin-bottom:4px;">
          🎯 SEU PRÓXIMO PASSO PRIORITÁRIO
        </div>
        <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-primary); margin:0 0 4px;">
          Conclua suas ${pendentesHoje} revisões de hoje
        </h3>
        <p style="font-size:0.86rem; color:var(--text-secondary); margin:0; line-height:1.4;">
          Revise os itens agendados no ciclo SM-2 antes de iniciar novos assuntos para garantir máxima retenção.
        </p>
      </div>
      <div>
        <a href="./questoes.html" class="btn btn-primary" style="padding:10px 22px; font-weight:700;">
          Iniciar Revisão Agora 🚀
        </a>
      </div>
    `;
    return;
  }

  // Cenário 2: Diagnóstico não realizado
  if (!diagnostico) {
    container.innerHTML = `
      <div style="flex:1; min-width:280px;">
        <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#8b5cf6; margin-bottom:4px;">
          🧠 DIAGNÓSTICO PENDENTE
        </div>
        <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-primary); margin:0 0 4px;">
          Descubra seus pontos fortes e fracos
        </h3>
        <p style="font-size:0.86rem; color:var(--text-secondary); margin:0; line-height:1.4;">
          Faça o teste adaptativo de 15 minutos para calibrar seu índice de preparação e mapa de domínio.
        </p>
      </div>
      <div>
        <a href="./diagnostico.html" class="btn btn-primary" style="padding:10px 22px; font-weight:700;">
          Fazer Diagnóstico (15 min) 🧠
        </a>
      </div>
    `;
    return;
  }

  // Cenário 3: Jornada ativa de estudos
  container.innerHTML = `
    <div style="flex:1; min-width:280px;">
      <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#10b981; margin-bottom:4px;">
        ⚡ PRONTO PARA AVANÇAR
      </div>
      <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-primary); margin:0 0 4px;">
        Mantenha o ritmo com uma sessão de questões
      </h3>
      <p style="font-size:0.86rem; color:var(--text-secondary); margin:0; line-height:1.4;">
        Você está em dia com as revisões! Resolva mais 15 questões ou treine com um simulado completo.
      </p>
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <a href="./questoes.html" class="btn btn-primary" style="padding:10px 20px; font-weight:700;">
        Resolver Questões 📝
      </a>
      <a href="./simulados.html" class="btn btn-ghost" style="padding:10px 20px; font-weight:700;">
        Fazer Simulado ⏱️
      </a>
    </div>
  `;
}

// ----------------------------------------------------------------
// ONBOARDING PROGRESSIVO PARA ALUNO NOVO
// ----------------------------------------------------------------

function gerenciarOnboarding(sessoes, objetivo, diagnostico) {
  const container = document.getElementById('onboarding-novo-aluno');
  if (!container) return;

  const totalQuestoes = (sessoes || []).filter(s => s.tipo === 'questoes').length;
  const totalSimulados = (sessoes || []).filter(s => s.tipo === 'simulado').length;

  const stepObjFeito = Boolean(objetivo?.vestibular_id);
  const stepDiagFeito = Boolean(diagnostico);
  const stepQuestFeito = totalQuestoes >= 10;
  const stepSimFeito = totalSimulados >= 1;

  // Se o aluno já concluiu todas as 4 etapas, oculta o onboarding
  if (stepObjFeito && stepDiagFeito && stepQuestFeito && stepSimFeito) {
    container.style.display = 'none';
    return;
  }

  // Atualiza os marcadores de cada etapa
  const elCheckObj = document.getElementById('ob-check-objetivo');
  const elCheckDiag = document.getElementById('ob-check-diagnostico');
  const elCheckQuest = document.getElementById('ob-check-questoes');
  const elCheckSim = document.getElementById('ob-check-simulado');

  if (elCheckObj) {
    elCheckObj.innerHTML = stepObjFeito ? '✅ Concluído' : '⚪ Etapa 1';
    elCheckObj.style.color = stepObjFeito ? '#22c55e' : 'var(--text-secondary)';
  }
  if (elCheckDiag) {
    elCheckDiag.innerHTML = stepDiagFeito ? '✅ Concluído' : '⚪ Etapa 2';
    elCheckDiag.style.color = stepDiagFeito ? '#22c55e' : 'var(--text-secondary)';
  }
  if (elCheckQuest) {
    elCheckQuest.innerHTML = stepQuestFeito ? '✅ Concluído' : `⚪ Etapa 3 (${totalQuestoes}/10)`;
    elCheckQuest.style.color = stepQuestFeito ? '#22c55e' : 'var(--text-secondary)';
  }
  if (elCheckSim) {
    elCheckSim.innerHTML = stepSimFeito ? '✅ Concluído' : '⚪ Etapa 4';
    elCheckSim.style.color = stepSimFeito ? '#22c55e' : 'var(--text-secondary)';
  }

  document.getElementById('ob-step-objetivo')?.addEventListener('click', () => {
    abrirModalObjetivo((novo) => {
      atualizarVisualObjetivo(novo);
      gerenciarOnboarding(sessoes, novo, diagnostico);
    });
  });

  container.style.display = 'block';
}

// ----------------------------------------------------------------
// HELPERS DE PERFIL, COTAS, RANKING E REALTIME
// ----------------------------------------------------------------

async function carregarPerfil(userId) {
  try {
    let { data: profile } = await supabase
      .from('profiles')
      .select('nome, nome_usuario, nivel, xp, meta_diaria_minutos, planos(nome, ordem)')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        const nomeInicial = meta.full_name || meta.name || meta.nome || user.email?.split('@')[0] || 'Aluno(a)';
        profile = { nome: nomeInicial, nivel: 1, xp: 0 };
      }
    }

    if (!profile) return null;

    const planoNome = profile.planos?.nome || 'free';
    planoUsuarioCache = planoNome;
    const ehUltimate = isUltimate(planoNome);

    const nomeExibicao = profile.nome_usuario || profile.nome?.split(' ')[0] || 'Aluno(a)';
    const elSaudacao = document.getElementById('saudacao');
    const elAvatar = document.getElementById('avatar-inicial');

    if (elSaudacao) {
      elSaudacao.innerHTML = `Olá, ${nomeExibicao}! 👋 ${
        ehUltimate
          ? `<span style="display:inline-block; font-size:.75rem; background:linear-gradient(135deg, #f59e0b, #ec4899); color:#fff; font-weight:800; padding:3px 10px; border-radius:999px; vertical-align:middle; margin-left:6px;">✦ ULTIMATE</span>`
          : ''
      }`;
    }
    if (elAvatar) elAvatar.textContent = nomeExibicao[0]?.toUpperCase() || 'A';

    aplicarCadeadosSidebar(userId, profile.planos?.ordem ?? 0);
    return profile;
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
    return null;
  }
}

async function carregarDiagnostico(userId) {
  try {
    const { data } = await supabase
      .from('diagnostico_resultados')
      .select('resultado, acertos, total_questoes, percentual, realizado_em')
      .eq('user_id', userId)
      .order('realizado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) return data;
  } catch (_) {}

  try {
    const raw = localStorage.getItem(`vestibular_diagnostico_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch (_) {}

  return null;
}

async function carregarCotasDisponiveis(userId, planoNome = null) {
  if (!userId || isCarregandoCotas) return;

  const elQ = document.getElementById('cota-questoes');
  const elR = document.getElementById('cota-resumos');
  const elC = document.getElementById('cota-chat');

  if (planoNome) {
    planoUsuarioCache = planoNome;
  } else if (!planoUsuarioCache) {
    const planoRes = await obterPlanoUsuario(userId);
    planoUsuarioCache = planoRes.nome;
  }

  const planoKey = (planoUsuarioCache || 'free').toLowerCase();
  const limitesPlano = PLAN_LIMITS[planoKey] || PLAN_LIMITS.free;

  if (limitesPlano.questoes_dia === null && elQ) elQ.textContent = '∞';
  if (limitesPlano.resumos_dia === null && elR) elR.textContent = '∞';

  isCarregandoCotas = true;
  ultimoFetchCotas = Date.now();

  try {
    const rpcs = [];
    if (limitesPlano.questoes_dia !== null) {
      rpcs.push(supabase.rpc('consultar_uso_diario', { p_tipo: 'questao' }));
    } else {
      rpcs.push(Promise.resolve({ data: { ilimitado: true } }));
    }

    if (limitesPlano.resumos_dia !== null) {
      rpcs.push(supabase.rpc('consultar_uso_diario', { p_tipo: 'resumo' }));
    } else {
      rpcs.push(Promise.resolve({ data: { ilimitado: true } }));
    }

    rpcs.push(supabase.rpc('consultar_uso_diario', { p_tipo: 'chat' }));

    const [usoQ, usoR, usoC] = await Promise.all(rpcs);

    const calcularRestante = (res, limiteOficial) => {
      if (limiteOficial === null) return '∞';
      const usado = res?.data?.usado ?? 0;
      return Math.max(0, limiteOficial - usado);
    };

    if (elQ) elQ.textContent = limitesPlano.questoes_dia === null ? '∞' : calcularRestante(usoQ, limitesPlano.questoes_dia);
    if (elR) elR.textContent = limitesPlano.resumos_dia === null ? '∞' : calcularRestante(usoR, limitesPlano.resumos_dia);
    if (elC) elC.textContent = calcularRestante(usoC, limitesPlano.chat_dia);
  } catch (_) {
    if (elQ) elQ.textContent = limitesPlano.questoes_dia === null ? '∞' : limitesPlano.questoes_dia;
    if (elR) elR.textContent = limitesPlano.resumos_dia === null ? '∞' : limitesPlano.resumos_dia;
    if (elC) elC.textContent = limitesPlano.chat_dia;
  } finally {
    isCarregandoCotas = false;
  }
}

async function carregarContagemVestibulares(promessaObjetivo) {
  const el = document.getElementById('topbar-countdown');
  if (!el) return;

  const objetivo = await promessaObjetivo;
  if (objetivo?.data_prova) {
    const dias = calcularDiasRestantes(objetivo.data_prova);
    el.textContent = `${objetivo.vestibular_id?.toUpperCase() || 'Vestibular'}: ${formatarContagem(dias)}`;
    return;
  }

  try {
    let vestibulares = getCache('vestibulares-datas');
    if (!vestibulares) {
      const { data } = await supabase
        .from('vestibulares')
        .select('nome, data_prova')
        .order('data_prova', { ascending: true });

      if (data) {
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
      el.textContent = `${proximo.nome}: ${dias} dias`;
    } else {
      const dias = calcularDiasRestantes('2026-11-01');
      el.textContent = `FUVEST 2027: ${formatarContagem(dias)}`;
    }
  } catch (_) {
    const dias = calcularDiasRestantes('2026-11-01');
    el.textContent = `FUVEST 2027: ${formatarContagem(dias)}`;
  }
}

async function carregarRanking(userId) {
  const elRanking = document.getElementById('ranking-list');
  if (!elRanking) return;

  try {
    const { data: ranking } = await supabase
      .from('profiles')
      .select('id, nome, nome_usuario, xp')
      .order('xp', { ascending: false })
      .limit(5);

    if (!ranking || !ranking.length) return;

    const medalhas = ['🥇 1º', '🥈 2º', '🥉 3º', '4º', '5º'];

    elRanking.innerHTML = ranking.map((p, i) => {
      const nome = p.nome_usuario || p.nome || 'Aluno(a)';
      const ehVoce = p.id === userId;

      return `
        <div class="materia-prog-row" style="padding:8px 0;">
          <span style="font-weight:800; font-size:0.8rem; width:36px;">${medalhas[i] || `${i + 1}º`}</span>
          <span class="materia-prog-nome" style="flex:1;">${nome} ${ehVoce ? '<span style="font-size:0.68rem; background:rgba(124,58,237,0.2); color:var(--color-primary-400); padding:1px 6px; border-radius:999px;">você</span>' : ''}</span>
          <span style="font-size:0.82rem; font-weight:700;">${(p.xp || 0).toLocaleString('pt-BR')} XP</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Erro ao carregar ranking:', err);
  }
}

function iniciarSincronizacaoRealtime(userId) {
  const verificarFoco = () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimoFetchCotas > 30000) {
      carregarCotasDisponiveis(userId, planoUsuarioCache);
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
        carregarCotasDisponiveis(userId, planoUsuarioCache);
      })
      .subscribe();

    window.addEventListener('beforeunload', () => {
      if (canalCotasRealtime) {
        supabase.removeChannel(canalCotasRealtime);
      }
    });
  } catch (_) {}
}

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