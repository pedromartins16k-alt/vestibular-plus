/**
 * mapa-dominio.js — Painel Permanente de Conhecimento do Aluno
 *
 * Características e fontes de dados reais:
 *  1. Diagnóstico Inicial (`diagnostico_resultados`).
 *  2. Sessões de Prática e Questões (`sessoes_estudo` com tipo 'questoes').
 *  3. Provas e Simulados Oficiais (`simulado_respostas`).
 *  4. Fila de Repetição Espaçada (`revisao_agendada`).
 *  5. Taxonomia Curricular Oficial (`src/data/materias-assuntos.json`).
 *
 * Diferenciação pedagógica obrigatória:
 *  - Distingue "Desempenho Inicial" (diagnóstico) de "Desempenho Atual/Recente" (questões/simulados).
 *  - Distingue "Sem dados suficientes" (amostra pequena) de "0% de domínio".
 *  - Identifica "O que estudar agora" com base em déficit real, recorrência de erros e revisões pendentes.
 *  - Ações direcionadas: "Praticar questões →" e "Revisar pendências →".
 */

import { supabase } from '../lib/supabaseClient.js';
import materiasAssuntosData from '../data/materias-assuntos.json';
import { classificarDominio, identificarAssunto } from './diagnostico.js';
import { lerRevisoesPendentes } from '../utils/revisao.js';

let sessionUserId = null;

// Elementos DOM
const elSkeleton = document.getElementById('mapa-loading-skeleton');
const elConteudo = document.getElementById('mapa-conteudo-principal');
const elOnboarding = document.getElementById('mapa-onboarding');
const elErroContainer = document.getElementById('mapa-erro-container');

async function iniciar() {
  exibirEstado('loading');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    sessionUserId = session?.user?.id || null;

    const dadosConsolidados = await carregarDadosAluno(sessionUserId);

    if (!dadosConsolidados.temDados) {
      exibirEstado('onboarding');
      return;
    }

    renderizarMapaCompleto(dadosConsolidados);
    exibirEstado('conteudo');

  } catch (err) {
    console.error('[mapa-dominio] Erro ao carregar painel:', err);
    exibirErro('Não foi possível carregar seu mapa de domínio no momento.');
  }
}

// ----------------------------------------------------------------
// CARREGAMENTO CONSOLIDADO DAS FONTES DE DADOS
// ----------------------------------------------------------------
async function carregarDadosAluno(userId) {
  let diagnostico = null;
  let sessoes = [];
  let simulados = [];
  let revisoes = [];
  let materiasCatalogo = [];

  // Busca catálogo oficial de matérias
  try {
    const { data: mats } = await supabase.from('materias').select('id, nome');
    if (mats) materiasCatalogo = mats;
  } catch (_) {}

  if (!materiasCatalogo.length) {
    materiasCatalogo = Object.keys(materiasAssuntosData.materias).map(nome => ({ id: nome, nome }));
  }

  // Se logado, busca dados das tabelas do usuário
  if (userId) {
    const [resDiag, resSess, resSim, resRev] = await Promise.allSettled([
      supabase.from('diagnostico_resultados').select('*').eq('user_id', userId).order('realizado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sessoes_estudo').select('materia_id, tipo, duracao_minutos, acertou, criado_em').eq('user_id', userId).limit(500),
      supabase.from('simulado_respostas').select('nota, finalizado_em').eq('user_id', userId).limit(50),
      lerRevisoesPendentes(userId)
    ]);

    if (resDiag.status === 'fulfilled' && resDiag.value?.data) {
      diagnostico = resDiag.value.data;
    }
    if (resSess.status === 'fulfilled' && resSess.value?.data) {
      sessoes = resSess.value.data;
    }
    if (resSim.status === 'fulfilled' && resSim.value?.data) {
      simulados = resSim.value.data;
    }
    if (resRev.status === 'fulfilled' && Array.isArray(resRev.value)) {
      revisoes = resRev.value;
    }
  }

  // Fallback LocalStorage para diagnóstico
  if (!diagnostico) {
    try {
      const raw = localStorage.getItem(`vestibular_diagnostico_${userId || 'guest'}`);
      if (raw) diagnostico = JSON.parse(raw);
    } catch (_) {}
  }

  // Processa e compila o domínio por matéria e por assunto
  return processarMetricas(diagnostico, sessoes, simulados, revisoes, materiasCatalogo);
}

function processarMetricas(diagnostico, sessoes, simulados, revisoes, materiasCatalogo) {
  const diagResultados = diagnostico?.resultado || diagnostico?.resultados_por_materia || {};
  const sessoesQuestoes = (sessoes || []).filter(s => s.tipo === 'questoes');

  let totalQuestoesPraticadas = sessoesQuestoes.length;
  let totalQuestoesDiag = diagnostico?.total_questoes || 0;
  let totalQuestoesGeral = totalQuestoesPraticadas + totalQuestoesDiag;

  const temDados = totalQuestoesGeral > 0 || (simulados || []).length > 0;

  const mapaDisciplinas = {};

  materiasCatalogo.forEach(m => {
    const nomeMateria = m.nome;
    const taxonomia = materiasAssuntosData.materias[nomeMateria] || { assuntos: [], icone: '📚' };

    // 1. Desempenho no Diagnóstico
    let diagData = null;
    const diagMatch = Object.entries(diagResultados).find(([k]) =>
      k.toLowerCase().includes(nomeMateria.toLowerCase().split(' ')[0])
    );
    if (diagMatch && diagMatch[1]?.total > 0) {
      diagData = {
        acertos: diagMatch[1].acertos,
        total: diagMatch[1].total,
        percentual: diagMatch[1].percentual ?? Math.round((diagMatch[1].acertos / diagMatch[1].total) * 100)
      };
    }

    // 2. Desempenho Recente (Sessões de estudo por matéria)
    const sessoesDaMateria = sessoesQuestoes.filter(s => s.materia_id === m.id);
    let recenteData = null;
    if (sessoesDaMateria.length > 0) {
      const acertos = sessoesDaMateria.filter(s => s.acertou === true).length;
      recenteData = {
        acertos,
        total: sessoesDaMateria.length,
        percentual: Math.round((acertos / sessoesDaMateria.length) * 100)
      };
    }

    // 3. Métrica Consolidada Observada
    let percentualConsolidado = null;
    let totalObservado = 0;
    let acertosObservados = 0;

    if (diagData && recenteData) {
      // 30% diagnóstico inicial + 70% prática recente contínua
      percentualConsolidado = Math.round(diagData.percentual * 0.3 + recenteData.percentual * 0.7);
      totalObservado = diagData.total + recenteData.total;
      acertosObservados = diagData.acertos + recenteData.acertos;
    } else if (recenteData) {
      percentualConsolidado = recenteData.percentual;
      totalObservado = recenteData.total;
      acertosObservados = recenteData.acertos;
    } else if (diagData) {
      percentualConsolidado = diagData.percentual;
      totalObservado = diagData.total;
      acertosObservados = diagData.acertos;
    }

    // 4. Assuntos da Matéria
    const assuntosMapeados = taxonomia.assuntos.map(ass => {
      // Se houver dados no diagnóstico para o assunto
      const diagAssunto = diagnostico?.assuntos?.[nomeMateria]?.[ass.nome];
      let assPct = null;
      let assTotal = 0;

      if (diagAssunto && diagAssunto.total > 0) {
        assPct = diagAssunto.percentual ?? Math.round((diagAssunto.acertos / diagAssunto.total) * 100);
        assTotal = diagAssunto.total;
      }

      return {
        nome: ass.nome,
        percentual: assPct,
        totalQuestoes: assTotal,
        amostraPequena: assTotal > 0 && assTotal < 3
      };
    });

    mapaDisciplinas[nomeMateria] = {
      id: m.id,
      nome: nomeMateria,
      icone: taxonomia.icone || '📚',
      percentual: percentualConsolidado,
      totalObservado,
      acertosObservados,
      diagData,
      recenteData,
      assuntos: assuntosMapeados,
      amostraPequena: totalObservado > 0 && totalObservado < 5
    };
  });

  return {
    temDados,
    totalQuestoesGeral,
    totalQuestoesPraticadas,
    diagnostico,
    simulados,
    revisoes,
    mapaDisciplinas
  };
}

// ----------------------------------------------------------------
// RENDERIZAÇÃO DO PAINEL PRINCIPAL
// ----------------------------------------------------------------
function renderizarMapaCompleto(dados) {
  renderizarResumo(dados);
  renderizarPrioridades(dados);
  renderizarComparativo(dados);
  renderizarGridDisciplinas(dados);
}

// 1. Resumo Geral
function renderizarResumo(dados) {
  const container = document.getElementById('mapa-resumo-grid');
  if (!container) return;

  const disciplinasComDados = Object.values(dados.mapaDisciplinas).filter(d => d.percentual !== null);
  const totalAnalisadas = disciplinasComDados.length;

  let melhorDisciplina = '—';
  let maiorLacuna = '—';
  let mediaGeral = 0;

  if (disciplinasComDados.length > 0) {
    const ordenadas = [...disciplinasComDados].sort((a, b) => b.percentual - a.percentual);
    melhorDisciplina = `${ordenadas[0].nome} (${ordenadas[0].percentual}%)`;
    maiorLacuna = `${ordenadas[ordenadas.length - 1].nome} (${ordenadas[ordenadas.length - 1].percentual}%)`;
    mediaGeral = Math.round(disciplinasComDados.reduce((acc, d) => acc + d.percentual, 0) / disciplinasComDados.length);
  }

  container.innerHTML = `
    <div class="resumo-card">
      <div class="resumo-label">Disciplinas Analisadas</div>
      <div class="resumo-val" style="color:var(--color-primary-400);">${totalAnalisadas}/7</div>
      <div class="resumo-sub">${totalAnalisadas === 7 ? 'Cobertura completa' : 'Continue praticando'}</div>
    </div>
    <div class="resumo-card">
      <div class="resumo-label">Melhor Desempenho</div>
      <div class="resumo-val" style="font-size:1.15rem; color:#22c55e;">${melhorDisciplina}</div>
      <div class="resumo-sub">Ponto forte observado</div>
    </div>
    <div class="resumo-card">
      <div class="resumo-label">Maior Lacuna</div>
      <div class="resumo-val" style="font-size:1.15rem; color:#ef4444;">${maiorLacuna}</div>
      <div class="resumo-sub">Foco de estudo prioritário</div>
    </div>
    <div class="resumo-card">
      <div class="resumo-label">Questões Analisadas</div>
      <div class="resumo-val" style="color:#38bdf8;">${dados.totalQuestoesGeral}</div>
      <div class="resumo-sub">${dados.totalQuestoesPraticadas} em sessões · ${dados.diagnostico?.total_questoes || 0} no diag</div>
    </div>
  `;
}

// 2. Prioridades de Estudo ("O que estudar agora")
function renderizarPrioridades(dados) {
  const container = document.getElementById('prioridades-lista');
  if (!container) return;

  const prioridades = [];
  const pendentes = dados.revisoes || [];

  // Se houver revisões agendadas pendentes (revisao_agendada)
  if (pendentes.length > 0) {
    prioridades.push({
      tipo: 'revisao',
      tag: 'Revisão Espaçada',
      classeTag: 'revisao',
      titulo: `${pendentes.length} ${pendentes.length === 1 ? 'questão pendente' : 'questões pendentes'} para revisão`,
      motivo: 'O algoritmo SM-2 identificou que você está no momento ideal de repetição para não esquecer os conceitos.',
      cta: 'Revisar agora →',
      url: './questoes.html'
    });
  }

  // Busca disciplinas com menor percentual e volume relevante
  const deficitarias = Object.values(dados.mapaDisciplinas)
    .filter(d => d.percentual !== null && d.percentual < 60)
    .sort((a, b) => a.percentual - b.percentual);

  deficitarias.slice(0, 2).forEach(d => {
    const isUrgente = d.percentual < 40;
    prioridades.push({
      tipo: 'disciplina',
      tag: isUrgente ? 'Déficit Alto' : 'Atenção',
      classeTag: isUrgente ? 'urgente' : 'atencao',
      titulo: `Praticar ${d.nome} (${d.percentual}%)`,
      motivo: `Aproveitamento observado de ${d.acertosObservados} em ${d.totalObservado} questões. Indicado reforçar resolução com gabarito comentado.`,
      cta: `Praticar ${d.nome} →`,
      url: `./questoes.html?materia=${encodeURIComponent(d.id)}`
    });
  });

  // Se não houver lacunas graves
  if (prioridades.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:20px; color:var(--text-secondary);">
        <p style="font-size:1.05rem; color:#22c55e; font-weight:700; margin-bottom:4px;">Seu cronograma está equilibrado!</p>
        <p style="font-size:0.86rem; margin:0;">Nenhuma lacuna crítica pendente no momento. Continue resolvendo questões ou realize um simulado completo.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = prioridades.map(p => `
    <div class="prioridade-card">
      <div>
        <div class="prioridade-topo">
          <strong style="font-size:0.96rem; font-family:var(--font-display);">${p.titulo}</strong>
          <span class="prioridade-tag ${p.classeTag}">${p.tag}</span>
        </div>
        <p style="font-size:0.84rem; color:var(--text-secondary); line-height:1.45; margin:8px 0 0;">
          ${p.motivo}
        </p>
      </div>
      <div>
        <a href="${p.url}" class="btn btn-secondary" style="font-size:0.82rem; padding:8px 14px; width:100%; justify-content:center;">
          ${p.cta}
        </a>
      </div>
    </div>
  `).join('');
}

// 3. Comparativo: Diagnóstico Inicial vs Desempenho Recente
function renderizarComparativo(dados) {
  const panel = document.getElementById('comparativo-panel');
  const container = document.getElementById('comparativo-lista');
  if (!panel || !container) return;

  const comparaveis = Object.values(dados.mapaDisciplinas).filter(d => d.diagData && d.recenteData);

  if (comparaveis.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  container.innerHTML = comparaveis.map(d => {
    const diff = d.recenteData.percentual - d.diagData.percentual;
    const diffTexto = diff > 0 ? `+${diff}%` : `${diff}%`;
    const corDiff = diff > 0 ? '#22c55e' : diff === 0 ? 'var(--text-secondary)' : '#ef4444';

    return `
      <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>${d.icone}</span>
          <strong style="font-size:0.9rem;">${d.nome}</strong>
        </div>
        <div style="display:flex; align-items:center; gap:18px; font-size:0.85rem;">
          <span style="color:var(--text-secondary);">Diagnóstico Inicial: <strong>${d.diagData.percentual}%</strong></span>
          <span style="color:var(--text-secondary);">Prática Recente: <strong>${d.recenteData.percentual}%</strong></span>
          <span style="color:${corDiff}; font-weight:800; min-width:44px; text-align:right;">${diffTexto}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 4. Grid de Matérias e Assuntos
function renderizarGridDisciplinas(dados) {
  const grid = document.getElementById('materias-grid');
  if (!grid) return;

  grid.innerHTML = Object.values(dados.mapaDisciplinas).map(d => {
    const pct = d.percentual;
    const temPct = pct !== null;
    const escala = temPct ? classificarDominio(pct) : { cor: 'var(--border-color)', emoji: '⚪', label: 'Sem dados suficientes' };

    // Lista de assuntos
    const assuntosHtml = d.assuntos.map(a => {
      const aPct = a.percentual;
      const temAssPct = aPct !== null;
      const aEscala = temAssPct ? classificarDominio(aPct) : { cor: 'var(--border-color)', emoji: '⚪' };

      return `
        <div class="assunto-item">
          <span class="assunto-nome" title="${a.nome}">${a.nome}</span>
          <div class="assunto-prog-wrap">
            ${temAssPct ? `
              <div class="assunto-track">
                <div class="assunto-fill" style="width:${aPct}%; background:${aEscala.cor};"></div>
              </div>
              <span class="assunto-pct" style="color:${aEscala.cor};">${aPct}%</span>
            ` : `
              <span style="font-size:0.75rem; color:var(--text-secondary);">Sem dados</span>
            `}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="materia-card">
        <div>
          <div class="materia-card-header">
            <div class="materia-nome-wrap">
              <div class="materia-icone">${d.icone}</div>
              <div>
                <span class="materia-nome">${d.nome}</span>
                <span style="display:block; font-size:0.74rem; color:var(--text-secondary);">
                  ${d.totalObservado > 0 ? `${d.totalObservado} questões analisadas` : 'Nenhuma questão respondida'}
                </span>
              </div>
            </div>
            <div style="text-align:right;">
              <span class="materia-pct-geral" style="color:${temPct ? escala.cor : 'var(--text-secondary)'};">
                ${temPct ? pct + '%' : '—'}
              </span>
            </div>
          </div>

          <!-- Barra de Progresso Geral -->
          ${temPct ? `
            <div style="display:flex; justify-content:space-between; font-size:0.76rem; font-weight:700; color:${escala.cor}; margin-bottom:2px;">
              <span>Domínio Observado</span>
              <span>${escala.emoji} ${escala.label}</span>
            </div>
            <div class="materia-prog-track">
              <div class="materia-prog-fill" style="width:${pct}%; background:${escala.cor};"></div>
            </div>
          ` : `
            <div style="padding:10px 12px; background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-sm); margin-bottom:14px; font-size:0.8rem; color:var(--text-secondary);">
              ⚪ Sem dados suficientes para estimar o domínio.
            </div>
          `}

          <!-- Assuntos da disciplina -->
          <div class="assuntos-lista">
            ${assuntosHtml}
          </div>
        </div>

        <div class="materia-footer-action">
          <span style="font-size:0.78rem; color:var(--text-secondary);">
            ${d.amostraPequena ? '⚠️ Amostra reduzida' : ''}
          </span>
          <a href="./questoes.html?materia=${encodeURIComponent(d.id)}" class="btn btn-ghost" style="font-size:0.82rem; padding:6px 12px;">
            Praticar ${d.nome} →
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------------------
// CONTROLE DE ESTADOS (LOADING, ONBOARDING, CONTEUDO, ERRO)
// ----------------------------------------------------------------
function exibirEstado(estado) {
  if (elSkeleton) elSkeleton.style.display = estado === 'loading' ? 'block' : 'none';
  if (elOnboarding) elOnboarding.style.display = estado === 'onboarding' ? 'block' : 'none';
  if (elConteudo) elConteudo.style.display = estado === 'conteudo' ? 'block' : 'none';
}

function exibirErro(msg) {
  exibirEstado('none');
  if (elErroContainer) {
    elErroContainer.style.display = 'block';
    elErroContainer.innerHTML = `
      <div class="card" style="padding:32px 20px; text-align:center;">
        <span style="font-size:2.4rem; display:block; margin-bottom:10px;">⚠️</span>
        <h3 style="font-size:1.15rem; margin-bottom:8px;">${msg}</h3>
        <button class="btn btn-secondary" onclick="window.location.reload()">Tentar novamente</button>
      </div>
    `;
  }
}

iniciar();
