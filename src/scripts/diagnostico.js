/**
 * diagnostico.js — Lógica Oficial do Diagnóstico Inicial
 *
 * Características pedagógicas e técnicas:
 *  1. Seleção balanceada de questões reais do banco Supabase por matéria.
 *  2. Sem correção imediata: o aluno responde, navega, altera e conclui conscientemente.
 *  3. Resumo pré-finalização: contagem de respondidas vs pendentes.
 *  4. Cálculo de desempenho real por matéria e classificação consistente (Inicial, Em desenvolvimento, Intermediário, Consolidado).
 *  5. Mapeamento de assuntos identificados baseado na taxonomia curricular real.
 *  6. Destaque de pontos fortes (melhor desempenho observado) e lacunas prioritárias.
 *  7. Persistência real em `diagnostico_resultados` (com fallback seguro no localStorage).
 *  8. Suporte à repetição do diagnóstico preservando o histórico existente.
 */

import { supabase } from '../lib/supabaseClient.js';
import materiasAssuntosData from '../data/materias-assuntos.json';

const CONFIG = {
  questoesPorMateria: 3, // 3 questões x 7 matérias = 21 questões reais
  materias: [
    'Matemática',
    'Português',
    'Física',
    'Química',
    'Biologia',
    'História',
    'Geografia'
  ]
};

const estado = {
  userId: null,
  questoes: [],
  indiceAtual: 0,
  respostas: {}, // { [questaoId]: 'A' | 'B' | ... }
  jaFinalizado: false
};

// ----------------------------------------------------------------
// CLASSIFICAÇÃO PEDAGÓGICA CONSISTENTE DE DOMÍNIO
// ----------------------------------------------------------------
export const ESCALA_DOMINIO = {
  CONSOLIDADO: { label: 'Consolidado', min: 75, cor: '#22c55e', emoji: '🟢' },
  INTERMEDIARIO: { label: 'Intermediário', min: 50, cor: '#84cc16', emoji: '🟡' },
  EM_DESENVOLVIMENTO: { label: 'Em desenvolvimento', min: 30, cor: '#f59e0b', emoji: '🟠' },
  INICIAL: { label: 'Inicial', min: 0, cor: '#ef4444', emoji: '🔴' }
};

export function classificarDominio(pct) {
  if (pct >= 75) return ESCALA_DOMINIO.CONSOLIDADO;
  if (pct >= 50) return ESCALA_DOMINIO.INTERMEDIARIO;
  if (pct >= 30) return ESCALA_DOMINIO.EM_DESENVOLVIMENTO;
  return ESCALA_DOMINIO.INICIAL;
}

// ----------------------------------------------------------------
// IDENTIFICAÇÃO DE ASSUNTO POR TAXONOMIA CURRICULAR
// ----------------------------------------------------------------
export function identificarAssunto(materiaNome, questao) {
  const taxonomia = materiasAssuntosData?.materias?.[materiaNome];
  if (!taxonomia || !Array.isArray(taxonomia.assuntos)) {
    return 'Conceitos Gerais';
  }

  const textoBusca = `${questao.enunciado || ''} ${questao.comentario || ''}`.toLowerCase();

  for (const assunto of taxonomia.assuntos) {
    if (assunto.keywords && Array.isArray(assunto.keywords)) {
      for (const kw of assunto.keywords) {
        if (textoBusca.includes(kw.toLowerCase())) {
          return assunto.nome;
        }
      }
    }
  }

  return taxonomia.assuntos[0]?.nome || 'Conceitos Gerais';
}

// ----------------------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------------------
async function iniciar() {
  mostrarTela('tela-loading');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    estado.userId = session?.user?.id || null;
  } catch (_) {}

  renderPreviewMaterias();

  // Verifica se o aluno já fez diagnóstico anterior para permitir visualização direta ou novo teste
  const diagnosticoExistente = await buscarUltimoDiagnostico(estado.userId);

  await carregarQuestoes();

  configurarBotoes();

  if (diagnosticoExistente && !window.location.search.includes('refazer=true')) {
    exibirResultadoFinal(diagnosticoExistente, true);
  } else {
    mostrarTela('tela-intro');
  }
}

function renderPreviewMaterias() {
  const container = document.getElementById('preview-materias');
  if (!container) return;

  container.innerHTML = CONFIG.materias.map(m => {
    const info = materiasAssuntosData?.materias?.[m] || {};
    const icone = info.icone || '📚';
    return `<div class="diag-materia-chip">${icone} ${m}</div>`;
  }).join('');
}

function configurarBotoes() {
  document.getElementById('btn-iniciar-diag')?.addEventListener('click', iniciarTeste);
  document.getElementById('btn-voltar-diag')?.addEventListener('click', () => {
    if (confirm('Deseja sair do diagnóstico? O progresso da sessão será cancelado.')) {
      window.location.href = './dashboard.html';
    }
  });

  document.getElementById('btn-anterior')?.addEventListener('click', () => {
    if (estado.indiceAtual > 0) {
      estado.indiceAtual--;
      renderQuestaoAtual();
    }
  });

  document.getElementById('btn-proxima')?.addEventListener('click', () => {
    if (estado.indiceAtual < estado.questoes.length - 1) {
      estado.indiceAtual++;
      renderQuestaoAtual();
    } else {
      abrirModalResumoPreFinalizacao();
    }
  });

  document.getElementById('btn-revisar-fim')?.addEventListener('click', abrirModalResumoPreFinalizacao);

  document.getElementById('btn-refazer-diag')?.addEventListener('click', () => {
    if (confirm('Deseja iniciar um novo diagnóstico? O resultado anterior permanecerá salvo em seu histórico.')) {
      estado.respostas = {};
      estado.indiceAtual = 0;
      estado.jaFinalizado = false;
      embaralharQuestoes();
      iniciarTeste();
    }
  });
}

// ----------------------------------------------------------------
// CARREGAMENTO DAS QUESTÕES REAIS DO SUPABASE
// ----------------------------------------------------------------
async function carregarQuestoes() {
  try {
    const { data: materias, error: errMat } = await supabase
      .from('materias')
      .select('id, nome');

    if (errMat || !materias) throw errMat || new Error('Materias não encontradas');

    const mapaMaterias = {};
    materias.forEach(m => {
      const chave = CONFIG.materias.find(c => c.toLowerCase() === m.nome.toLowerCase());
      if (chave) mapaMaterias[m.id] = chave;
    });

    const idsValidos = Object.keys(mapaMaterias);

    // Carrega questões do acervo real
    const { data: questoes, error: errQ } = await supabase
      .from('questoes')
      .select('id, enunciado, alternativas, resposta_correta, comentario, dificuldade, materia_id')
      .in('materia_id', idsValidos)
      .limit(300);

    if (errQ || !questoes || questoes.length === 0) {
      throw errQ || new Error('Nenhuma questão retornada');
    }

    // Organiza por disciplina
    const porMateria = {};
    CONFIG.materias.forEach(m => { porMateria[m] = []; });

    questoes.forEach(q => {
      const matNome = mapaMaterias[q.materia_id];
      if (matNome && porMateria[matNome]) {
        const assunto = identificarAssunto(matNome, q);
        porMateria[matNome].push({
          ...q,
          materiaNome: matNome,
          assuntoNome: assunto
        });
      }
    });

    // Seleciona até CONFIG.questoesPorMateria de cada matéria
    const selecionadas = [];
    CONFIG.materias.forEach(m => {
      const disponiveis = porMateria[m] || [];
      // Embaralha seleção interna
      disponiveis.sort(() => Math.random() - 0.5);
      const amostra = disponiveis.slice(0, CONFIG.questoesPorMateria);
      selecionadas.push(...amostra);
    });

    // Embaralha para alternar matérias durante o teste
    estado.questoes = selecionadas.sort(() => Math.random() - 0.5);

    // Atualiza contadores na tela de apresentação
    const totalQ = estado.questoes.length;
    const elNumQ = document.getElementById('num-questoes-diag');
    if (elNumQ) elNumQ.textContent = totalQ;

    const elTempo = document.getElementById('tempo-estimado-diag');
    if (elTempo) elTempo.textContent = `~${Math.round(totalQ * 1.5)}`;

    const elNumMat = document.getElementById('num-materias-diag');
    if (elNumMat) elNumMat.textContent = CONFIG.materias.length;

  } catch (err) {
    console.error('[diagnostico] Erro ao carregar questões:', err);
    document.getElementById('tela-loading').innerHTML = `
      <div class="card" style="padding:40px; text-align:center;">
        <p style="color:var(--color-danger); font-weight:700; margin-bottom:12px;">Não foi possível carregar as questões do diagnóstico.</p>
        <button class="btn btn-secondary" onclick="window.location.reload()">Tentar novamente</button>
      </div>
    `;
  }
}

function embaralharQuestoes() {
  estado.questoes.sort(() => Math.random() - 0.5);
}

// ----------------------------------------------------------------
// SALA DE TESTE E NAVEGAÇÃO
// ----------------------------------------------------------------
function iniciarTeste() {
  if (estado.questoes.length === 0) return;
  estado.indiceAtual = 0;
  mostrarTela('tela-questao');
  renderQuestaoAtual();
}

function renderQuestaoAtual() {
  const total = estado.questoes.length;
  const q = estado.questoes[estado.indiceAtual];
  if (!q) return;

  const respondidasCount = Object.keys(estado.respostas).length;
  const pctProgresso = Math.round((respondidasCount / total) * 100);

  // Atualiza barra de progresso
  const elProgLabel = document.getElementById('prog-label');
  const elProgPct = document.getElementById('prog-pct');
  const elProgFill = document.getElementById('prog-fill');
  const elQNum = document.getElementById('q-num');

  if (elProgLabel) elProgLabel.textContent = `Questão ${estado.indiceAtual + 1} de ${total}`;
  if (elProgPct) elProgPct.textContent = `${pctProgresso}% respondido (${respondidasCount}/${total})`;
  if (elProgFill) elProgFill.style.width = `${pctProgresso}%`;
  if (elQNum) elQNum.textContent = `${estado.indiceAtual + 1}/${total}`;

  // Metadados
  document.getElementById('q-materia').textContent = q.materiaNome;
  document.getElementById('q-dificuldade').textContent = traduzirDificuldade(q.dificuldade);

  const elAssunto = document.getElementById('q-assunto');
  if (q.assuntoNome) {
    elAssunto.style.display = 'inline-flex';
    elAssunto.textContent = q.assuntoNome;
  } else {
    elAssunto.style.display = 'none';
  }

  document.getElementById('q-enunciado').textContent = q.enunciado || '';

  // Renderiza alternativas (sem feedback imediato)
  let alternativas = q.alternativas;
  if (typeof alternativas === 'string') {
    try { alternativas = JSON.parse(alternativas); } catch (_) { alternativas = []; }
  }

  const containerAlt = document.getElementById('q-alternativas');
  const letraMarcada = estado.respostas[q.id];

  containerAlt.innerHTML = (Array.isArray(alternativas) ? alternativas : []).map(alt => {
    const isSel = letraMarcada === alt.letra;
    return `
      <div class="diag-alt ${isSel ? 'selecionada' : ''}" data-letra="${alt.letra}">
        <span class="diag-alt-letra">${alt.letra}</span>
        <span class="diag-alt-texto">${alt.texto || ''}</span>
      </div>
    `;
  }).join('');

  containerAlt.querySelectorAll('.diag-alt').forEach(el => {
    el.addEventListener('click', () => {
      const letra = el.dataset.letra;
      estado.respostas[q.id] = letra;
      renderQuestaoAtual();
    });
  });

  // Atualiza botões de ação
  const btnAnt = document.getElementById('btn-anterior');
  if (btnAnt) {
    btnAnt.disabled = estado.indiceAtual === 0;
    btnAnt.style.opacity = estado.indiceAtual === 0 ? '0.4' : '1';
    btnAnt.style.cursor = estado.indiceAtual === 0 ? 'not-allowed' : 'pointer';
  }

  const btnProx = document.getElementById('btn-proxima');
  if (btnProx) {
    btnProx.textContent = estado.indiceAtual === total - 1 ? 'Concluir Diagnóstico ✓' : 'Próxima →';
  }
}

function traduzirDificuldade(d) {
  const map = { facil: 'Fácil ●', medio: 'Médio ●●', dificil: 'Difícil ●●●' };
  return map[d] || 'Médio ●●';
}

// ----------------------------------------------------------------
// RESUMO PRÉ-FINALIZAÇÃO
// ----------------------------------------------------------------
function abrirModalResumoPreFinalizacao() {
  const total = estado.questoes.length;
  const respondidas = Object.keys(estado.respostas).length;
  const emBranco = total - respondidas;

  const modalContainer = document.getElementById('diag-modal-container');
  if (!modalContainer) return;

  modalContainer.innerHTML = `
    <div class="diag-modal-overlay" id="diag-modal-resumo">
      <div class="diag-modal-content">
        <h3 style="font-family:var(--font-display); font-size:1.35rem; margin-bottom:8px;">Concluir Diagnóstico</h3>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:20px; line-height:1.5;">
          Revise o status das suas respostas antes de gerar seu mapa de conhecimento.
        </p>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:14px; text-align:center;">
            <div style="font-size:1.6rem; font-weight:800; color:#38bdf8;">${respondidas}</div>
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-secondary); margin-top:4px;">Respondidas</div>
          </div>
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:14px; text-align:center;">
            <div style="font-size:1.6rem; font-weight:800; color:${emBranco > 0 ? '#ef4444' : '#22c55e'};">${emBranco}</div>
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-secondary); margin-top:4px;">Em Branco</div>
          </div>
        </div>

        ${emBranco > 0 ? `
          <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); padding:12px 14px; margin-bottom:20px; font-size:0.86rem; color:#fca5a5;">
            ⚠️ Você deixou <strong>${emBranco}</strong> ${emBranco === 1 ? 'questão em branco' : 'questões em branco'}. As questões não respondidas serão computadas como erro para o diagnóstico de partida.
          </div>
        ` : `
          <div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:var(--radius-md); padding:12px 14px; margin-bottom:20px; font-size:0.86rem; color:#86efac;">
            ✓ Todas as ${total} questões do diagnóstico foram respondidas!
          </div>
        `}

        <div style="display:flex; justify-content:flex-end; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-ghost" id="btn-voltar-ao-teste">Continuar Respondendo</button>
          <button class="btn btn-primary" id="btn-confirmar-finalizacao">
            Finalizar e Ver Resultado 📊
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-ao-teste').onclick = () => {
    modalContainer.innerHTML = '';
  };

  document.getElementById('btn-confirmar-finalizacao').onclick = () => {
    modalContainer.innerHTML = '';
    finalizarDiagnostico();
  };
}

// ----------------------------------------------------------------
// APURAÇÃO DOS RESULTADOS E PERSISTÊNCIA
// ----------------------------------------------------------------
async function finalizarDiagnostico() {
  mostrarTela('tela-loading');

  const totalQuestoes = estado.questoes.length;
  let totalAcertos = 0;
  let totalErros = 0;

  const resultadoPorMateria = {};
  CONFIG.materias.forEach(m => {
    resultadoPorMateria[m] = { acertos: 0, total: 0, percentual: 0 };
  });

  const resultadoPorAssunto = {}; // { [materia]: { [assunto]: { acertos, total, percentual } } }

  estado.questoes.forEach(q => {
    const mat = q.materiaNome;
    const ass = q.assuntoNome || 'Conceitos Gerais';
    const respDada = estado.respostas[q.id];
    const correta = (q.resposta_correta || '').trim().toUpperCase();
    const acertou = respDada && respDada.toUpperCase() === correta;

    if (!resultadoPorMateria[mat]) {
      resultadoPorMateria[mat] = { acertos: 0, total: 0, percentual: 0 };
    }
    resultadoPorMateria[mat].total++;

    if (!resultadoPorAssunto[mat]) {
      resultadoPorAssunto[mat] = {};
    }
    if (!resultadoPorAssunto[mat][ass]) {
      resultadoPorAssunto[mat][ass] = { acertos: 0, total: 0, percentual: 0 };
    }
    resultadoPorAssunto[mat][ass].total++;

    if (acertou) {
      totalAcertos++;
      resultadoPorMateria[mat].acertos++;
      resultadoPorAssunto[mat][ass].acertos++;
    } else {
      totalErros++;
    }
  });

  // Calcula percentuais das matérias
  Object.keys(resultadoPorMateria).forEach(m => {
    const d = resultadoPorMateria[m];
    d.percentual = d.total > 0 ? Math.round((d.acertos / d.total) * 100) : 0;
  });

  // Calcula percentuais dos assuntos
  Object.keys(resultadoPorAssunto).forEach(m => {
    Object.keys(resultadoPorAssunto[m]).forEach(a => {
      const d = resultadoPorAssunto[m][a];
      d.percentual = d.total > 0 ? Math.round((d.acertos / d.total) * 100) : 0;
    });
  });

  const pctGeral = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0;

  const diagnosticoSalvo = {
    total_questoes: totalQuestoes,
    acertos: totalAcertos,
    erros: totalErros,
    percentual: pctGeral,
    resultado: resultadoPorMateria,
    assuntos: resultadoPorAssunto,
    realizado_em: new Date().toISOString()
  };

  await salvarDiagnostico(diagnosticoSalvo);
  exibirResultadoFinal(diagnosticoSalvo, false);
}

async function salvarDiagnostico(dados) {
  // Salva no localStorage como garantia imediata
  try {
    const key = `vestibular_diagnostico_${estado.userId || 'guest'}`;
    localStorage.setItem(key, JSON.stringify(dados));
  } catch (_) {}

  // Tenta persistir no Supabase (diagnostico_resultados)
  if (estado.userId) {
    try {
      await supabase.from('diagnostico_resultados').insert({
        user_id: estado.userId,
        resultado: dados.resultado,
        acertos: dados.acertos,
        total_questoes: dados.total_questoes,
        percentual: dados.percentual,
        realizado_em: dados.realizado_em
      });

      // Registra sessão de estudo
      await supabase.from('sessoes_estudo').insert({
        user_id: estado.userId,
        materia_id: null,
        duracao_minutos: 15,
        tipo: 'diagnostico'
      });
    } catch (err) {
      console.warn('[diagnostico] Falha ao persistir no Supabase:', err);
    }
  }
}

async function buscarUltimoDiagnostico(userId) {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('diagnostico_resultados')
        .select('*')
        .eq('user_id', userId)
        .order('realizado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) return data;
    } catch (_) {}
  }

  // Fallback localStorage
  try {
    const raw = localStorage.getItem(`vestibular_diagnostico_${userId || 'guest'}`);
    if (raw) return JSON.parse(raw);
  } catch (_) {}

  return null;
}

// ----------------------------------------------------------------
// APRESENTAÇÃO DOS RESULTADOS DETALHADOS
// ----------------------------------------------------------------
function exibirResultadoFinal(diag, isHistorico = false) {
  mostrarTela('tela-resultado');

  const res = diag.resultado || diag.resultados_por_materia || {};
  const total = diag.total_questoes || 0;
  const acertos = diag.acertos || 0;
  const erros = diag.erros ?? (total - acertos);
  const pct = diag.percentual ?? (total > 0 ? Math.round((acertos / total) * 100) : 0);

  document.getElementById('res-pct-geral').textContent = `${pct}%`;
  document.getElementById('res-acertos').textContent = acertos;
  document.getElementById('res-erros').textContent = erros;
  document.getElementById('res-total').textContent = total;

  if (isHistorico) {
    document.getElementById('res-titulo').textContent = 'Seu Diagnóstico Registrado';
    const dataFmt = diag.realizado_em ? new Date(diag.realizado_em).toLocaleDateString('pt-BR') : 'Anteriormente';
    document.getElementById('res-subtitulo').textContent = `Avaliação inicial realizada em ${dataFmt}. Você pode refazer a qualquer momento.`;
  }

  // Listagem de matérias ordenada por melhor desempenho
  const listaMaterias = Object.entries(res)
    .filter(([, v]) => v && v.total > 0)
    .sort(([, a], [, b]) => {
      const pctA = a.percentual ?? Math.round((a.acertos / a.total) * 100);
      const pctB = b.percentual ?? Math.round((b.acertos / b.total) * 100);
      return pctB - pctA;
    });

  const containerMat = document.getElementById('resultado-materias');
  containerMat.innerHTML = listaMaterias.map(([materia, dados]) => {
    const p = dados.percentual ?? Math.round((dados.acertos / dados.total) * 100);
    const escala = classificarDominio(p);

    return `
      <div class="resultado-materia-item">
        <div class="resultado-materia-dot" style="background:${escala.cor}; box-shadow: 0 0 6px ${escala.cor};"></div>
        <div class="resultado-materia-nome">${materia}</div>
        <div class="resultado-prog-wrap">
          <div class="resultado-prog-track">
            <div class="resultado-prog-fill" style="width:${p}%; background:${escala.cor};"></div>
          </div>
          <span class="resultado-pct" style="color:${escala.cor};">${dados.acertos}/${dados.total} (${p}%)</span>
        </div>
        <span class="resultado-status" style="color:${escala.cor};">${escala.emoji} ${escala.label}</span>
      </div>
    `;
  }).join('');

  // Identificação de Pontos Fortes (maior desempenho) e Lacunas (menor desempenho)
  const fortes = listaMaterias.filter(([, d]) => (d.percentual ?? Math.round((d.acertos / d.total) * 100)) >= 60);
  const fracos = [...listaMaterias].reverse().filter(([, d]) => (d.percentual ?? Math.round((d.acertos / d.total) * 100)) < 60);

  const containerFortes = document.getElementById('destaque-fortes');
  if (fortes.length > 0) {
    containerFortes.innerHTML = fortes.slice(0, 3).map(([mat, d]) => {
      const p = d.percentual ?? Math.round((d.acertos / d.total) * 100);
      return `
        <div class="destaque-item">
          <strong>${mat}</strong>
          <span style="color:#22c55e; font-weight:700;">${p}% aproveitamento</span>
        </div>
      `;
    }).join('');
  } else {
    containerFortes.innerHTML = `<p style="font-size:0.84rem; color:var(--text-secondary); margin:0;">Nenhuma matéria atingiu 60%+ nesta rodada. Continue praticando!</p>`;
  }

  const containerFracos = document.getElementById('destaque-fracos');
  if (fracos.length > 0) {
    containerFracos.innerHTML = fracos.slice(0, 3).map(([mat, d]) => {
      const p = d.percentual ?? Math.round((d.acertos / d.total) * 100);
      return `
        <div class="destaque-item">
          <strong>${mat}</strong>
          <span style="color:#f59e0b; font-weight:700;">${p}% (Prioridade de estudo)</span>
        </div>
      `;
    }).join('');
  } else {
    containerFracos.innerHTML = `<p style="font-size:0.84rem; color:#22c55e; margin:0;">Parabéns! Nenhuma disciplina apresentou déficit grave no diagnóstico.</p>`;
  }

  // Desempenho por Assunto (se houver dados registrados)
  const containerAssuntos = document.getElementById('resultado-assuntos');
  const boxAssuntos = document.getElementById('box-assuntos');
  const assuntosObj = diag.assuntos || {};

  const assuntosArray = [];
  Object.entries(assuntosObj).forEach(([materia, list]) => {
    Object.entries(list).forEach(([assunto, dados]) => {
      if (dados.total > 0) {
        assuntosArray.push({
          materia,
          assunto,
          acertos: dados.acertos,
          total: dados.total,
          percentual: dados.percentual ?? Math.round((dados.acertos / dados.total) * 100)
        });
      }
    });
  });

  if (assuntosArray.length > 0) {
    boxAssuntos.style.display = 'block';
    containerAssuntos.innerHTML = assuntosArray
      .sort((a, b) => b.percentual - a.percentual)
      .map(item => {
        const escala = classificarDominio(item.percentual);
        return `
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:10px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <strong style="font-size:0.88rem; display:block;">${item.assunto}</strong>
              <span style="font-size:0.75rem; color:var(--text-secondary);">${item.materia}</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:0.82rem; color:var(--text-secondary);">${item.acertos}/${item.total}</span>
              <span style="font-size:0.88rem; font-weight:800; color:${escala.cor};">${item.percentual}%</span>
              <span style="font-size:0.78rem;">${escala.emoji}</span>
            </div>
          </div>
        `;
      }).join('');
  } else {
    boxAssuntos.style.display = 'none';
  }
}

function mostrarTela(id) {
  ['tela-loading', 'tela-intro', 'tela-questao', 'tela-resultado'].forEach(t => {
    const el = document.getElementById(t);
    if (el) el.classList.remove('active');
  });
  const tela = document.getElementById(id);
  if (tela) tela.classList.add('active');
}

iniciar();
