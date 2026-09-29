/**
 * cronograma.js — Cronograma Adaptativo Inteligente do Vestibular+
 *
 * Princípios e Fontes de Dados Reais:
 *  1. Objetivo do Aluno (`objetivos_usuario` / lerObjetivo): vestibular, curso, universidade, data da prova.
 *  2. Diagnóstico Inicial (`diagnostico_resultados`): identifica matérias e assuntos em déficit inicial.
 *  3. Sessões de Estudo (`sessoes_estudo`): prática contínua, taxa de acerto real e tempo dedicado.
 *  4. Sistema SM-2 (`revisao_agendada` / lerRevisoesPendentes): revisões atrasadas e pendentes para hoje.
 *  5. Compromissos Manuais (`cronograma`): compromissos agendados pelo aluno no banco Supabase.
 *  6. Taxonomia Curricular Oficial (`materias-assuntos.json`).
 *  7. Índice de Preparação Real (`indice-preparacao.js`): métrica consolidada sem invenção de fórmulas.
 *
 * Características Adaptativas:
 *  - Priorização automática do dia:
 *      * Prioridade 1: Revisões atrasadas/pendentes do SM-2 (com botão "Revisar Agora" -> questoes.html?modo=revisao)
 *      * Prioridade 2: Disciplinas e assuntos com baixo desempenho no diagnóstico ou nas sessões recentes (com botão para Laboratório de Questões com filtros específicos)
 *      * Prioridade 3: Simulado cronometrado quando a data da prova estiver próxima ou houver histórico consistente
 *      * Prioridade 4: Compromissos manuais do aluno registrados no Supabase
 *  - Marcação de conclusão com persistência:
 *      * Itens manuais atualizam `cronograma.concluido` no Supabase
 *      * Itens adaptativos registram estado no localStorage por usuário e data, mantendo consistência determinística após refresh.
 *  - Justificativa transparente para cada atividade recomendada.
 *  - Sem dados fictícios: estados claros para novo aluno ou dados insuficientes.
 */

import { supabase } from '../lib/supabaseClient.js';
import { lerObjetivo, abrirModalObjetivo, calcularDiasRestantes, formatarContagem } from './objetivo.js';
import { lerRevisoesPendentes } from '../utils/revisao.js';
import { classificarDominio, identificarAssunto } from './diagnostico.js';
import { calcularIndicePreparacao } from '../utils/indice-preparacao.js';
import materiasAssuntosData from '../data/materias-assuntos.json';
import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';

let sessionUserId = null;
let objetivoAluno = null;
let compromissosManuais = [];
let materiasCatalogo = [];
let dataFocoSelecionada = new Date().toISOString().slice(0, 10);

const STORAGE_CONCLUIDAS_PREFIX = 'vestibular_crono_concluidas_';

function getStorageConcluidasKey(userId, dataIso) {
  return `${STORAGE_CONCLUIDAS_PREFIX}${userId || 'guest'}_${dataIso}`;
}

function obterTarefasConcluidasLocais(userId, dataIso) {
  try {
    const raw = localStorage.getItem(getStorageConcluidasKey(userId, dataIso));
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function salvarTarefaConcluidaLocal(userId, dataIso, tarefaId, concluida) {
  try {
    let concluidas = obterTarefasConcluidasLocais(userId, dataIso);
    if (concluida) {
      if (!concluidas.includes(tarefaId)) concluidas.push(tarefaId);
    } else {
      concluidas = concluidas.filter(id => id !== tarefaId);
    }
    localStorage.setItem(getStorageConcluidasKey(userId, dataIso), JSON.stringify(concluidas));
  } catch (_) {}
}

// ================================================================
// INICIALIZAÇÃO
// ================================================================
async function iniciar() {
  exibirEstado('loading');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    sessionUserId = session?.user?.id || null;

    // 1. Carrega Catálogo Oficial de Disciplinas
    await carregarMateriasCatalogo();

    // 2. Carrega Objetivo do Aluno
    objetivoAluno = await lerObjetivo();

    // 3. Carrega Compromissos Manuais do Supabase
    if (sessionUserId) {
      const { data: cronoData } = await supabase
        .from('cronograma')
        .select('id, titulo, data, hora_inicio, hora_fim, concluido, materia_id, materias(nome, cor)')
        .eq('user_id', sessionUserId)
        .order('data')
        .order('hora_inicio');
      compromissosManuais = cronoData || [];
    }

    // 4. Carrega Fontes do Aluno (Diagnóstico, Sessões, Revisões, Perfil)
    const dadosConsolidados = await carregarDadosAluno(sessionUserId);

    // Se aluno não tiver objetivo nem histórico algum, exibe onboarding construtivo
    if (!objetivoAluno && !dadosConsolidados.temHistorico && compromissosManuais.length === 0) {
      configurarEventosGerais();
      exibirEstado('onboarding');
      return;
    }

    configurarEventosGerais();
    renderizarCronogramaCompleto(dadosConsolidados);
    exibirEstado('conteudo');

  } catch (err) {
    console.error('[cronograma] Erro ao carregar cronograma:', err);
    exibirErro('Não foi possível carregar seu cronograma adaptativo.');
  }
}

async function carregarMateriasCatalogo() {
  try {
    const { data, error } = await supabase.from('materias').select('id, nome, cor, ordem').order('ordem');
    if (!error && data && data.length) {
      materiasCatalogo = data;
    } else {
      materiasCatalogo = Object.keys(materiasAssuntosData.materias).map((nome, idx) => ({
        id: String(idx + 1),
        nome,
        cor: '#7c3aed'
      }));
    }
  } catch (_) {
    materiasCatalogo = [];
  }

  // Popula o select do modal manual
  const selectMateria = document.getElementById('input-materia');
  if (selectMateria) {
    selectMateria.innerHTML = '<option value="">Geral / Sem disciplina específica</option>' +
      materiasCatalogo.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
  }
}

async function carregarDadosAluno(userId) {
  let diagnostico = null;
  let sessoes = [];
  let simulados = [];
  let revisoes = [];
  let perfil = null;

  if (userId) {
    const [resDiag, resSess, resSim, resRev, resPerfil] = await Promise.allSettled([
      supabase.from('diagnostico_resultados').select('*').eq('user_id', userId).order('realizado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sessoes_estudo').select('materia_id, tipo, duracao_minutos, acertou, criado_em').eq('user_id', userId).limit(500),
      supabase.from('simulado_respostas').select('nota, finalizado_em').eq('user_id', userId).limit(50),
      lerRevisoesPendentes(userId),
      supabase.from('profiles').select('meta_diaria_minutos, planos(nome)').eq('id', userId).maybeSingle()
    ]);

    if (resDiag.status === 'fulfilled' && resDiag.value?.data) diagnostico = resDiag.value.data;
    if (resSess.status === 'fulfilled' && resSess.value?.data) sessoes = resSess.value.data;
    if (resSim.status === 'fulfilled' && resSim.value?.data) simulados = resSim.value.data;
    if (resRev.status === 'fulfilled' && Array.isArray(resRev.value)) revisoes = resRev.value;
    if (resPerfil.status === 'fulfilled' && resPerfil.value?.data) perfil = resPerfil.value.data;
  }

  // Fallback LocalStorage para Diagnóstico
  if (!diagnostico) {
    try {
      const raw = localStorage.getItem(`vestibular_diagnostico_${userId || 'guest'}`);
      if (raw) diagnostico = JSON.parse(raw);
    } catch (_) {}
  }

  const temHistorico = (sessoes && sessoes.length > 0) || Boolean(diagnostico) || (simulados && simulados.length > 0);

  return {
    diagnostico,
    sessoes,
    simulados,
    revisoes,
    perfil,
    temHistorico
  };
}

// ================================================================
// GERAÇÃO DO PLANO DIÁRIO ADAPTATIVO
// ================================================================
function gerarPlanoAdaptativo(dados, dataIso) {
  const tarefas = [];
  const hojeIso = new Date().toISOString().slice(0, 10);
  const ehHoje = dataIso === hojeIso;
  const concluidasLocais = obterTarefasConcluidasLocais(sessionUserId, dataIso);

  const diagResultados = dados.diagnostico?.resultado || dados.diagnostico?.resultados_por_materia || {};
  const pendentesRevisao = dados.revisoes || [];
  const metaDiariaMinutos = dados.perfil?.meta_diaria_minutos || 90;

  // 1. TAREFA: Revisão Espaçada SM-2 (Se houver pendências e for data de hoje)
  if (ehHoje && pendentesRevisao.length > 0) {
    const tempoSugerido = Math.min(45, Math.max(15, pendentesRevisao.length * 3));
    tarefas.push({
      id: 'auto-revisao-sm2',
      tipo: 'revisao',
      etiqueta: 'Revisão Espaçada',
      classeEtiqueta: 'revisao',
      icone: '🧠',
      titulo: `${pendentesRevisao.length} ${pendentesRevisao.length === 1 ? 'questão agendada' : 'questões agendadas'} para revisão hoje`,
      motivo: 'O algoritmo SM-2 identificou que você está no momento de repetição ideal para consolidar a retenção.',
      duracao: `⏱️ ${tempoSugerido} min`,
      ctaTexto: 'Revisar Agora 🚀',
      ctaUrl: './questoes.html?modo=revisao',
      concluida: concluidasLocais.includes('auto-revisao-sm2')
    });
  }

  // 2. TAREFA: Diagnóstico Inicial (se ainda não realizado)
  if (!dados.diagnostico) {
    tarefas.push({
      id: 'auto-diagnostico-inicial',
      tipo: 'diagnostico',
      etiqueta: 'Avaliação Inicial',
      classeEtiqueta: 'urgente',
      icone: '📊',
      titulo: 'Realizar Diagnóstico Inicial de Partida',
      motivo: 'Essencial para mapear seus pontos fortes, lacunas observadas e calibrar as próximas prioridades.',
      duracao: '⏱️ 15 min · 21 questões',
      ctaTexto: 'Fazer Diagnóstico →',
      ctaUrl: './diagnostico.html',
      concluida: concluidasLocais.includes('auto-diagnostico-inicial')
    });
  }

  // 3. TAREFAS: Prática Curricular nas Disciplinas de Maior Déficit
  // Extrai desempenhos observados combinando diagnóstico + sessões
  const desempenhos = materiasCatalogo.map(m => {
    let total = 0;
    let acertos = 0;

    // Do diagnóstico
    const matchDiag = Object.entries(diagResultados).find(([k]) =>
      k.toLowerCase().includes(m.nome.toLowerCase().split(' ')[0])
    );
    if (matchDiag && matchDiag[1]?.total > 0) {
      total += matchDiag[1].total;
      acertos += matchDiag[1].acertos;
    }

    // Das sessões de questões
    const sessMat = (dados.sessoes || []).filter(s => s.materia_id === m.id && s.tipo === 'questoes');
    sessMat.forEach(s => {
      total++;
      if (s.acertou) acertos++;
    });

    const pct = total > 0 ? Math.round((acertos / total) * 100) : null;
    return {
      materia: m,
      total,
      acertos,
      pct
    };
  });

  // Ordena por menor aproveitamento real
  const comDados = desempenhos.filter(d => d.pct !== null).sort((a, b) => a.pct - b.pct);
  const semDados = desempenhos.filter(d => d.pct === null);

  if (comDados.length > 0) {
    const maiorDeficit = comDados[0];
    const isGrave = maiorDeficit.pct < 50;

    // Busca o assunto de maior déficit nessa matéria no diagnóstico
    let assuntoFoco = null;
    const assuntosMateria = dados.diagnostico?.assuntos?.[maiorDeficit.materia.nome] || {};
    const listaAssuntos = Object.entries(assuntosMateria)
      .filter(([, v]) => v.total > 0)
      .sort(([, a], [, b]) => (a.percentual || 0) - (b.percentual || 0));

    if (listaAssuntos.length > 0) {
      assuntoFoco = listaAssuntos[0][0];
    }

    const taskId = `auto-pratica-${maiorDeficit.materia.id}`;
    const urlBusca = assuntoFoco ? `&busca=${encodeURIComponent(assuntoFoco)}` : '';

    tarefas.push({
      id: taskId,
      tipo: 'questoes',
      etiqueta: isGrave ? 'Déficit Prioritário' : 'Reforço de Domínio',
      classeEtiqueta: isGrave ? 'urgente' : 'pratica',
      icone: '📝',
      titulo: `Prática Focada em ${maiorDeficit.materia.nome}${assuntoFoco ? ' · ' + assuntoFoco : ''}`,
      motivo: `Aproveitamento atual de ${maiorDeficit.pct}% (${maiorDeficit.acertos}/${maiorDeficit.total} questões). Recomendado reforçar resolução com gabarito comentado.`,
      duracao: '⏱️ 35 min · 15 questões',
      ctaTexto: `Praticar ${maiorDeficit.materia.nome} →`,
      ctaUrl: `./questoes.html?materia=${encodeURIComponent(maiorDeficit.materia.id)}${urlBusca}`,
      concluida: concluidasLocais.includes(taskId)
    });

    // Se houver uma segunda matéria em desenvolvimento
    if (comDados.length > 1 && comDados[1].pct < 70) {
      const segDeficit = comDados[1];
      const task2Id = `auto-pratica-${segDeficit.materia.id}`;
      tarefas.push({
        id: task2Id,
        tipo: 'questoes',
        etiqueta: 'Em Desenvolvimento',
        classeEtiqueta: 'pratica',
        icone: '⚡',
        titulo: `Aprofundar ${segDeficit.materia.nome}`,
        motivo: `Domínio observado em ${segDeficit.pct}%. Manter constância para atingir o nível intermediário/consolidado.`,
        duracao: '⏱️ 25 min · 10 questões',
        ctaTexto: `Praticar ${segDeficit.materia.nome} →`,
        ctaUrl: `./questoes.html?materia=${encodeURIComponent(segDeficit.materia.id)}`,
        concluida: concluidasLocais.includes(task2Id)
      });
    }
  } else if (semDados.length > 0) {
    // Se não há dados de desempenho, recomenda explorar as disciplinas principais
    const matSugerida = semDados[0];
    const taskId = `auto-explorar-${matSugerida.materia.id}`;
    tarefas.push({
      id: taskId,
      tipo: 'questoes',
      etiqueta: 'Exploração de Nível',
      classeEtiqueta: 'pratica',
      icone: '📝',
      titulo: `Resolver primeiras questões de ${matSugerida.materia.nome}`,
      motivo: 'Ainda não possuímos dados suficientes sobre seu domínio nesta matéria. Responda questões para gerar o mapeamento.',
      duracao: '⏱️ 20 min · 10 questões',
      ctaTexto: `Começar ${matSugerida.materia.nome} →`,
      ctaUrl: `./questoes.html?materia=${encodeURIComponent(matSugerida.materia.id)}`,
      concluida: concluidasLocais.includes(taskId)
    });
  }

  // 4. TAREFA: Simulado ou Treino de Gestão de Tempo
  const diasRestantes = objetivoAluno?.data_prova ? calcularDiasRestantes(objetivoAluno.data_prova) : null;
  const totalSimulados = (dados.simulados || []).length;

  if (diasRestantes !== null && diasRestantes <= 60 && totalSimulados < 3) {
    const taskId = 'auto-simulado-edital';
    tarefas.push({
      id: taskId,
      tipo: 'simulado',
      etiqueta: 'Simulado de Prova',
      classeEtiqueta: 'simulado',
      icone: '⏱️',
      titulo: `Treino Cronometrado Oficial (${objetivoAluno.vestibular_id?.toUpperCase() || 'Vestibular'})`,
      motivo: `Faltam ${diasRestantes} dias para a sua prova. É hora de treinar velocidade de resolução sob pressão de tempo.`,
      duracao: '⏱️ 60 a 90 min',
      ctaTexto: 'Abrir Simulados →',
      ctaUrl: './simulados.html',
      concluida: concluidasLocais.includes(taskId)
    });
  }

  // 5. COMPROMISSOS MANUAIS DO SUPABASE PARA ESTA DATA
  const manuaisDoDia = compromissosManuais.filter(c => c.data === dataIso);
  manuaisDoDia.forEach(c => {
    const hora = c.hora_inicio ? `${c.hora_inicio.slice(0, 5)}` : 'Horário livre';
    tarefas.push({
      id: `manual-${c.id}`,
      idRealBanco: c.id,
      tipo: 'manual',
      etiqueta: c.materias?.nome || 'Personalizado',
      classeEtiqueta: 'manual',
      icone: '📌',
      titulo: c.titulo,
      motivo: 'Compromisso pessoal agendado por você.',
      duracao: `⏰ ${hora}`,
      ctaTexto: 'Concluir / Detalhes',
      ctaUrl: '#',
      isManual: true,
      concluida: Boolean(c.concluido)
    });
  });

  return tarefas;
}

// ================================================================
// RENDERIZAÇÃO COMPLETA
// ================================================================
function renderizarCronogramaCompleto(dados) {
  renderizarHeroObjetivo(objetivoAluno);
  renderizarStats(dados);
  renderizarSemana(dados);
  renderizarPlanoDoDia(dados, dataFocoSelecionada);
  renderizarPrioridadesSidebar(dados);
}

// 1. Hero do Aluno & Contagem da Prova
function renderizarHeroObjetivo(obj) {
  const container = document.getElementById('crono-hero-card');
  if (!container) return;

  if (!obj || !obj.vestibular_id) {
    container.innerHTML = `
      <div class="hero-contexto-info">
        <span class="hero-tag-objetivo">🎯 Objetivo Pendente</span>
        <h2 class="hero-titulo-vestibular">Configure sua meta de aprovação</h2>
        <p class="hero-sub-detalhes">
          Defina seu vestibular e curso desejado para que o cronograma calcule o tempo até a 1ª fase e reorganize as prioridades.
        </p>
      </div>
      <div>
        <button class="btn btn-primary" id="btn-hero-definir-obj">Definir Objetivo Agora 🚀</button>
      </div>
    `;
    document.getElementById('btn-hero-definir-obj')?.addEventListener('click', () => {
      abrirModalObjetivo((novo) => {
        objetivoAluno = novo;
        iniciar();
      });
    });
    return;
  }

  const dias = obj.data_prova ? calcularDiasRestantes(obj.data_prova) : null;
  const contagemTexto = formatarContagem(dias);
  const dataFormatada = obj.data_prova ? new Date(obj.data_prova + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Data a confirmar';

  container.innerHTML = `
    <div class="hero-contexto-info">
      <span class="hero-tag-objetivo">🎯 Alvo: ${obj.vestibular_nome || obj.vestibular_id.toUpperCase()}</span>
      <h2 class="hero-titulo-vestibular">${obj.curso || 'Curso em definição'} · ${obj.universidade || 'Vestibular'}</h2>
      <p class="hero-sub-detalhes">
        📅 1ª Fase: <strong>${dataFormatada}</strong> · O cronograma é calibrado dinamicamente com base nesta data.
      </p>
    </div>

    <div class="hero-countdown-box">
      <div class="countdown-num" style="color:${dias !== null && dias <= 30 ? '#ef4444' : '#38bdf8'};">
        ${dias !== null ? (dias <= 0 ? (dias === 0 ? 'HOJE' : 'FINAL') : dias) : '—'}
      </div>
      <div class="countdown-lbl">
        ${dias !== null && dias > 0 ? (dias === 1 ? 'Dia Restante' : 'Dias Restantes') : 'Contagem'}
      </div>
    </div>
  `;
}

// 2. Cards de Métricas e Constância
function renderizarStats(dados) {
  const container = document.getElementById('crono-stats-grid');
  if (!container) return;

  const totalSessoes = (dados.sessoes || []).length;
  const sessoesQuestoes = (dados.sessoes || []).filter(s => s.tipo === 'questoes');
  const totalQuestoes = sessoesQuestoes.length;
  const totalAcertos = sessoesQuestoes.filter(s => s.acertou).length;
  const taxaAcertos = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : null;
  const pendentesRevisao = (dados.revisoes || []).length;

  // Calcula Índice de Preparação real
  const resIndice = calcularIndicePreparacao({
    sessoes: dados.sessoes || [],
    diagnostico: dados.diagnostico,
    simulados: dados.simulados || [],
    metaDiariaMinutos: dados.perfil?.meta_diaria_minutos || 60
  });

  const indiceScore = resIndice?.score ?? '—';

  container.innerHTML = `
    <div class="crono-stat-card">
      <div class="crono-stat-lbl">Índice de Preparação</div>
      <div class="crono-stat-val" style="color:var(--color-primary-400);">${indiceScore}/100</div>
      <div class="crono-stat-sub">${resIndice ? resIndice.nivel.label : 'Em calibração'}</div>
    </div>
    <div class="crono-stat-card">
      <div class="crono-stat-lbl">Revisões Agendadas</div>
      <div class="crono-stat-val" style="color:${pendentesRevisao > 0 ? '#ef4444' : '#22c55e'};">${pendentesRevisao}</div>
      <div class="crono-stat-sub">${pendentesRevisao > 0 ? 'Pendentes para hoje' : 'Ciclo SM-2 em dia'}</div>
    </div>
    <div class="crono-stat-card">
      <div class="crono-stat-lbl">Desempenho em Questões</div>
      <div class="crono-stat-val" style="color:#38bdf8;">${taxaAcertos !== null ? taxaAcertos + '%' : '—'}</div>
      <div class="crono-stat-sub">${totalQuestoes > 0 ? `${totalAcertos}/${totalQuestoes} corretas` : 'Ainda sem questões'}</div>
    </div>
    <div class="crono-stat-card">
      <div class="crono-stat-lbl">Meta Diária</div>
      <div class="crono-stat-val" style="color:#f59e0b;">${dados.perfil?.meta_diaria_minutos || 60}m</div>
      <div class="crono-stat-sub">Tempo de foco sugerido</div>
    </div>
  `;
}

// 3. Calendário Semanal
function renderizarSemana(dados) {
  const grid = document.getElementById('semana-dias-grid');
  const rotuloMes = document.getElementById('semana-rotulo-mes');
  if (!grid) return;

  const hoje = new Date();
  const diaSemanaHoje = hoje.getDay(); // 0 = Domingo
  const primeiroDiaSemana = new Date(hoje);
  primeiroDiaSemana.setDate(hoje.getDate() - diaSemanaHoje);

  const nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const diasHtml = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(primeiroDiaSemana);
    d.setDate(primeiroDiaSemana.getDate() + i);
    const dIso = d.toISOString().slice(0, 10);
    const ehHoje = dIso === hoje.toISOString().slice(0, 10);
    const isSelecionado = dIso === dataFocoSelecionada;

    // Verifica se há compromissos manuais ou revisões no dia
    const temManual = compromissosManuais.some(c => c.data === dIso);
    const temAtividade = temManual || ehHoje;

    diasHtml.push(`
      <div class="semana-dia-col ${ehHoje ? 'hoje' : ''} ${isSelecionado ? 'selecionado' : ''}" data-data="${dIso}">
        <span class="dia-sigla">${nomesDias[i]}</span>
        <span class="dia-numero">${d.getDate()}</span>
        ${temAtividade ? '<span class="dia-dot-atividade"></span>' : '<span style="height:6px;"></span>'}
      </div>
    `);
  }

  if (rotuloMes) {
    rotuloMes.textContent = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  grid.innerHTML = diasHtml.join('');

  grid.querySelectorAll('.semana-dia-col').forEach(el => {
    el.addEventListener('click', () => {
      dataFocoSelecionada = el.dataset.data;
      renderizarSemana(dados);
      renderizarPlanoDoDia(dados, dataFocoSelecionada);
    });
  });
}

// 4. Plano de Estudos do Dia Selecionado
function renderizarPlanoDoDia(dados, dataIso) {
  const container = document.getElementById('tarefas-hoje-lista');
  const elDataTitulo = document.getElementById('plano-data-titulo');
  const elCarga = document.getElementById('plano-tempo-total-estimado');
  if (!container) return;

  const hojeIso = new Date().toISOString().slice(0, 10);
  const ehHoje = dataIso === hojeIso;
  const dataObj = new Date(dataIso + 'T00:00:00');
  const dataFmt = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  if (elDataTitulo) {
    elDataTitulo.textContent = ehHoje ? `Plano de Hoje (${dataFmt})` : `Plano para ${dataFmt}`;
  }

  const tarefas = gerarPlanoAdaptativo(dados, dataIso);

  if (tarefas.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 16px; color:var(--text-secondary);">
        <span style="font-size:2.4rem; display:block; margin-bottom:8px;">☕</span>
        <h4 style="font-size:1.05rem; margin-bottom:4px; color:var(--text-primary);">Nenhuma tarefa agendada para este dia</h4>
        <p style="font-size:0.86rem; margin:0;">Aproveite para descansar ou adicione um compromisso personalizado.</p>
      </div>
    `;
    if (elCarga) elCarga.textContent = '0 min de estudos';
    return;
  }

  if (elCarga) {
    elCarga.textContent = `${tarefas.length} atividades adaptativas sugeridas`;
  }

  container.innerHTML = tarefas.map(t => {
    return `
      <div class="tarefa-card ${t.concluida ? 'concluida' : ''}" data-task-id="${t.id}" data-is-manual="${Boolean(t.isManual)}" data-id-banco="${t.idRealBanco || ''}">
        <button class="tarefa-check" title="${t.concluida ? 'Desmarcar' : 'Marcar como concluída'}">
          ${t.concluida ? '✓' : ''}
        </button>
        <div class="tarefa-corpo">
          <div class="tarefa-meta-topo">
            <span class="tarefa-etiqueta ${t.classeEtiqueta}">${t.icone} ${t.etiqueta}</span>
            <span class="tarefa-duracao">${t.duracao}</span>
          </div>
          <h4 class="tarefa-titulo">${t.titulo}</h4>
          <p class="tarefa-motivo">${t.motivo}</p>
          <div class="tarefa-rodape">
            <span style="font-size:0.75rem; color:var(--text-secondary);">
              ${t.concluida ? '✅ Concluída no dia' : '⚡ Ação recomendada'}
            </span>
            <div class="tarefa-acoes">
              ${t.isManual ? `
                <button class="btn btn-ghost btn-excluir-manual" style="padding:4px 10px; font-size:0.75rem; color:#ef4444;" data-id="${t.idRealBanco}">
                  🗑️ Excluir
                </button>
              ` : `
                <a href="${t.ctaUrl}" class="btn btn-primary" style="padding:6px 14px; font-size:0.8rem;">
                  ${t.ctaTexto}
                </a>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Eventos de Checkbox / Conclusão
  container.querySelectorAll('.tarefa-check').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = btn.closest('.tarefa-card');
      const taskId = card.dataset.taskId;
      const isManual = card.dataset.isManual === 'true';
      const idBanco = card.dataset.idBanco;
      const estaConcluida = card.classList.contains('concluida');
      const novoStatus = !estaConcluida;

      if (isManual && idBanco && sessionUserId) {
        await supabase.from('cronograma').update({ concluido: novoStatus }).eq('id', idBanco);
        const item = compromissosManuais.find(c => c.id === idBanco);
        if (item) item.concluido = novoStatus;
      } else {
        salvarTarefaConcluidaLocal(sessionUserId, dataIso, taskId, novoStatus);
      }

      renderizarPlanoDoDia(dados, dataIso);
    });
  });

  // Evento de Excluir Manual
  container.querySelectorAll('.btn-excluir-manual').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Deseja excluir este compromisso?')) {
        await supabase.from('cronograma').delete().eq('id', id);
        compromissosManuais = compromissosManuais.filter(c => c.id !== id);
        renderizarPlanoDoDia(dados, dataIso);
        renderizarSemana(dados);
      }
    });
  });
}

// 5. Sidebar: Prioridades do Mapa de Domínio
function renderizarPrioridadesSidebar(dados) {
  const container = document.getElementById('crono-prioridades-lista');
  if (!container) return;

  const diagResultados = dados.diagnostico?.resultado || dados.diagnostico?.resultados_por_materia || {};

  const itens = Object.entries(diagResultados)
    .filter(([, v]) => v && v.total > 0)
    .map(([materia, v]) => ({
      materia,
      pct: v.percentual ?? Math.round((v.acertos / v.total) * 100),
      total: v.total
    }))
    .sort((a, b) => a.pct - b.pct);

  if (itens.length === 0) {
    container.innerHTML = `
      <p style="font-size:0.82rem; color:var(--text-secondary); margin:0;">
        ⚪ Realize o diagnóstico inicial para identificar seus tópicos prioritários.
      </p>
    `;
    return;
  }

  container.innerHTML = itens.slice(0, 4).map(it => {
    const escala = classificarDominio(it.pct);
    return `
      <div class="prioridade-mini-item">
        <div>
          <strong style="display:block;">${it.materia}</strong>
          <span style="font-size:0.74rem; color:var(--text-secondary);">${it.total} questões analisadas</span>
        </div>
        <div style="text-align:right;">
          <span style="font-weight:800; font-size:0.88rem; color:${escala.cor};">${it.pct}%</span>
          <span style="display:block; font-size:0.72rem; color:${escala.cor};">${escala.label}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ================================================================
// EVENTOS GERAIS & MODAIS
// ================================================================
function configurarEventosGerais() {
  // Ajustar Objetivo
  document.getElementById('btn-alterar-meta-crono')?.addEventListener('click', () => {
    abrirModalObjetivo((novo) => {
      objetivoAluno = novo;
      iniciar();
    });
  });

  document.getElementById('btn-onboarding-definir-obj')?.addEventListener('click', () => {
    abrirModalObjetivo((novo) => {
      objetivoAluno = novo;
      iniciar();
    });
  });

  // Modal Novo Compromisso
  const btnAdd = document.getElementById('btn-add-compromisso');
  const modal = document.getElementById('modal-overlay');
  const btnClose = document.getElementById('modal-close');
  const form = document.getElementById('form-novo-item');

  btnAdd?.addEventListener('click', () => {
    document.getElementById('input-data').value = dataFocoSelecionada;
    modal?.classList.add('open');
  });

  btnClose?.addEventListener('click', () => modal?.classList.remove('open'));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('input-titulo').value.trim();
    const materiaId = document.getElementById('input-materia').value || null;
    const data = document.getElementById('input-data').value;
    const horaInicio = document.getElementById('input-hora-inicio').value || null;

    if (!titulo || !data) return;

    if (!sessionUserId) {
      alert('Você precisa estar logado para salvar compromissos no banco.');
      return;
    }

    const { data: inserted, error } = await supabase.from('cronograma').insert({
      user_id: sessionUserId,
      materia_id: materiaId,
      titulo,
      data,
      hora_inicio: horaInicio,
      concluido: false
    }).select('id, titulo, data, hora_inicio, hora_fim, concluido, materia_id, materias(nome, cor)').single();

    if (!error && inserted) {
      compromissosManuais.push(inserted);
      modal.classList.remove('open');
      form.reset();
      const dados = await carregarDadosAluno(sessionUserId);
      renderizarPlanoDoDia(dados, dataFocoSelecionada);
      renderizarSemana(dados);
    } else {
      alert('Não foi possível salvar o compromisso no banco.');
    }
  });
}

function exibirEstado(estado) {
  const elSkeleton = document.getElementById('crono-loading-skeleton');
  const elConteudo = document.getElementById('crono-conteudo-principal');
  const elOnboarding = document.getElementById('crono-onboarding');

  if (elSkeleton) elSkeleton.style.display = estado === 'loading' ? 'block' : 'none';
  if (elConteudo) elConteudo.style.display = estado === 'conteudo' ? 'block' : 'none';
  if (elOnboarding) elOnboarding.style.display = estado === 'onboarding' ? 'block' : 'none';
}

function exibirErro(msg) {
  exibirEstado('none');
  const container = document.getElementById('crono-erro-container');
  if (container) {
    container.style.display = 'block';
    container.innerHTML = `
      <div class="card" style="padding:32px 20px; text-align:center;">
        <span style="font-size:2.4rem; display:block; margin-bottom:10px;">⚠️</span>
        <h3 style="font-size:1.15rem; margin-bottom:8px;">${msg}</h3>
        <button class="btn btn-secondary" onclick="window.location.reload()">Tentar novamente</button>
      </div>
    `;
  }
}

iniciar();
iniciarBusca();
iniciarNotificacoes();
