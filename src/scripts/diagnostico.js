/**
 * diagnostico.js — Lógica do Diagnóstico Inicial
 *
 * Fluxo:
 *  1. Carrega questões do banco Supabase por matéria
 *  2. Apresenta questões com dificuldade adaptativa
 *  3. Registra resultados e salva no banco (fallback: localStorage)
 *  4. Exibe resultado detalhado por matéria
 */

import { supabase } from '../lib/supabaseClient.js';

// ----------------------------------------------------------------
// Configuração do diagnóstico
// ----------------------------------------------------------------

const CONFIG = {
  questoesPorMateria: 3,   // Questões por matéria no diagnóstico
  materias: [
    'Matemática',
    'Física',
    'Química',
    'Biologia',
    'Português',
    'História',
    'Geografia'
  ]
};

// Estado do diagnóstico
const estado = {
  questoes: [],
  indiceAtual: 0,
  resultados: {},   // { materia: { acertos, total } }
  dificuldadeAtual: 'medio',
  userId: null
};

// ----------------------------------------------------------------
// Inicialização
// ----------------------------------------------------------------

async function iniciar() {
  mostrarTela('tela-loading');

  // Verifica autenticação
  try {
    const { data: { user } } = await supabase.auth.getUser();
    estado.userId = user?.id || null;
  } catch (_) {}

  // Inicializa resultados por matéria
  CONFIG.materias.forEach(m => {
    estado.resultados[m] = { acertos: 0, total: 0 };
  });

  // Carrega questões do banco
  await carregarQuestoes();

  // Configura eventos
  document.getElementById('btn-iniciar-diag')?.addEventListener('click', iniciarDiagnostico);
  document.getElementById('btn-voltar-diag')?.addEventListener('click', () => {
    if (confirm('Sair do diagnóstico? O progresso será perdido.')) {
      window.location.href = './dashboard.html';
    }
  });
  document.getElementById('btn-proxima')?.addEventListener('click', proximaQuestao);

  mostrarTela('tela-intro');
}

async function carregarQuestoes() {
  const todasQuestoes = [];

  for (const materia of CONFIG.materias) {
    try {
      // Busca questões por matéria (join com materias)
      const { data: materiaData } = await supabase
        .from('materias')
        .select('id')
        .ilike('nome', `%${materia.split(' ')[0]}%`)
        .limit(1)
        .single();

      if (!materiaData) continue;

      // Busca questões de dificuldades variadas
      for (const dif of ['facil', 'medio', 'dificil']) {
        const { data } = await supabase
          .from('questoes')
          .select('id, enunciado, alternativas, resposta_correta, comentario, dificuldade, materia_id')
          .eq('materia_id', materiaData.id)
          .eq('dificuldade', dif)
          .limit(2);

        if (data?.length) {
          data.forEach(q => {
            todasQuestoes.push({ ...q, materia });
          });
        }
      }
    } catch (err) {
      console.warn(`[diagnostico] Erro ao carregar questões de ${materia}:`, err);
    }
  }

  if (todasQuestoes.length === 0) {
    // Sem questões no banco — exibe mensagem amigável
    document.getElementById('btn-iniciar-diag').disabled = true;
    document.getElementById('btn-iniciar-diag').textContent = '⚠️ Sem questões cadastradas';
    document.getElementById('btn-iniciar-diag').style.opacity = '0.6';
    const nota = document.createElement('p');
    nota.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);margin-top:12px;text-align:center;';
    nota.textContent = 'O banco de questões está vazio. Peça ao administrador para cadastrar questões.';
    document.getElementById('btn-iniciar-diag').after(nota);
    return;
  }

  // Embaralha e seleciona questões balanceadas por matéria
  estado.questoes = selecionarQuestoesBalanceadas(todasQuestoes);
  document.getElementById('num-questoes-diag').textContent = `~${estado.questoes.length}`;
}

function selecionarQuestoesBalanceadas(todas) {
  const porMateria = {};
  CONFIG.materias.forEach(m => { porMateria[m] = []; });

  todas.forEach(q => {
    if (porMateria[q.materia]) {
      porMateria[q.materia].push(q);
    }
  });

  const selecionadas = [];
  CONFIG.materias.forEach(m => {
    const disponiveis = porMateria[m];
    // Embaralha
    for (let i = disponiveis.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [disponiveis[i], disponiveis[j]] = [disponiveis[j], disponiveis[i]];
    }
    // Pega até CONFIG.questoesPorMateria
    selecionadas.push(...disponiveis.slice(0, CONFIG.questoesPorMateria));
  });

  // Embaralha a lista final
  for (let i = selecionadas.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selecionadas[i], selecionadas[j]] = [selecionadas[j], selecionadas[i]];
  }

  return selecionadas;
}

// ----------------------------------------------------------------
// Controle de telas
// ----------------------------------------------------------------

function mostrarTela(id) {
  ['tela-loading', 'tela-intro', 'tela-questao', 'tela-resultado'].forEach(t => {
    const el = document.getElementById(t);
    if (el) el.classList.remove('active');
  });
  const tela = document.getElementById(id);
  if (tela) tela.classList.add('active');
}

function iniciarDiagnostico() {
  if (estado.questoes.length === 0) return;
  estado.indiceAtual = 0;
  mostrarTela('tela-questao');
  exibirQuestaoAtual();
}

function exibirQuestaoAtual() {
  const q = estado.questoes[estado.indiceAtual];
  if (!q) {
    finalizarDiagnostico();
    return;
  }

  const total = estado.questoes.length;
  const atual = estado.indiceAtual + 1;
  const pct = Math.round((estado.indiceAtual / total) * 100);

  // Atualiza progresso
  document.getElementById('prog-label').textContent = `Questão ${atual} de ${total}`;
  document.getElementById('prog-pct').textContent = `${pct}%`;
  document.getElementById('prog-fill').style.width = `${pct}%`;
  document.getElementById('q-num').textContent = `${atual}/${total}`;

  // Preenche questão
  document.getElementById('q-materia').textContent = q.materia || 'Geral';
  document.getElementById('q-dificuldade').textContent = traduzirDificuldade(q.dificuldade);
  document.getElementById('q-enunciado').textContent = q.enunciado || '';

  // Limpa estado anterior
  document.getElementById('q-feedback').className = 'diag-feedback';
  document.getElementById('q-feedback').textContent = '';
  document.getElementById('btn-proxima').style.display = 'none';

  // Renderiza alternativas
  const container = document.getElementById('q-alternativas');
  let alternativas = [];
  try {
    alternativas = typeof q.alternativas === 'string'
      ? JSON.parse(q.alternativas)
      : (q.alternativas || []);
  } catch (_) { alternativas = []; }

  container.innerHTML = alternativas.map((alt, idx) => {
    const letra = alt.letra || String.fromCharCode(65 + idx);
    return `
      <button class="diag-alt" data-letra="${letra}" onclick="responder('${letra}')">
        <span class="diag-alt-letra">${letra}</span>
        <span class="diag-alt-texto">${alt.texto || ''}</span>
      </button>
    `;
  }).join('');
}

// Expõe para onclick no HTML
window.responder = function(letra) {
  const q = estado.questoes[estado.indiceAtual];
  if (!q) return;

  const correta = q.resposta_correta;
  const acertou = letra === correta;

  // Atualiza resultado da matéria
  if (!estado.resultados[q.materia]) {
    estado.resultados[q.materia] = { acertos: 0, total: 0 };
  }
  estado.resultados[q.materia].total++;
  if (acertou) estado.resultados[q.materia].acertos++;

  // Marca alternativas
  const botoesAlt = document.querySelectorAll('.diag-alt');
  botoesAlt.forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.letra === correta) btn.classList.add('correta');
    if (btn.dataset.letra === letra && !acertou) btn.classList.add('errada');
  });

  // Feedback
  const feedback = document.getElementById('q-feedback');
  feedback.className = `diag-feedback ${acertou ? 'acertou' : 'errou'}`;
  feedback.innerHTML = acertou
    ? `✅ <strong>Correto!</strong> ${q.comentario || ''}`
    : `❌ <strong>Resposta correta: ${correta}.</strong> ${q.comentario || ''}`;

  // Mostra botão próxima
  const btnProxima = document.getElementById('btn-proxima');
  btnProxima.style.display = 'inline-flex';
  btnProxima.textContent = estado.indiceAtual + 1 < estado.questoes.length
    ? 'Próxima →'
    : '📊 Ver Resultado';
};

function proximaQuestao() {
  estado.indiceAtual++;
  if (estado.indiceAtual >= estado.questoes.length) {
    finalizarDiagnostico();
  } else {
    exibirQuestaoAtual();
  }
}

// ----------------------------------------------------------------
// Resultado final
// ----------------------------------------------------------------

async function finalizarDiagnostico() {
  mostrarTela('tela-resultado');

  // Calcula totais
  let totalAcertos = 0;
  let totalQuestoes = 0;
  Object.values(estado.resultados).forEach(r => {
    totalAcertos += r.acertos;
    totalQuestoes += r.total;
  });

  const pctGeral = totalQuestoes > 0
    ? Math.round((totalAcertos / totalQuestoes) * 100)
    : 0;

  // Salva resultado no banco (ou localStorage)
  await salvarResultado({
    totalQuestoes,
    totalAcertos,
    resultadosPorMateria: estado.resultados
  });

  // Exibe resultado geral
  document.getElementById('res-geral').textContent = `${pctGeral}%`;
  document.getElementById('res-icon').textContent = pctGeral >= 70 ? '🏆' : pctGeral >= 50 ? '📈' : '💪';
  document.getElementById('res-titulo').textContent =
    pctGeral >= 70 ? 'Excelente resultado!' :
    pctGeral >= 50 ? 'Bom começo!' :
    'Diagnóstico concluído!';
  document.getElementById('res-descricao').textContent =
    `Você acertou ${totalAcertos} de ${totalQuestoes} questões (${pctGeral}%). ` +
    `Veja abaixo quais matérias precisam de mais atenção.`;

  // Renderiza resultados por matéria
  const container = document.getElementById('resultado-materias');
  container.innerHTML = Object.entries(estado.resultados)
    .filter(([, r]) => r.total > 0)
    .sort(([, a], [, b]) => (b.acertos / b.total) - (a.acertos / a.total))
    .map(([materia, r]) => {
      const pct = r.total > 0 ? Math.round((r.acertos / r.total) * 100) : 0;
      const { cor, emoji } = classificarDominio(pct);
      return `
        <div class="resultado-materia-item">
          <div class="resultado-materia-dot" style="background:${cor}; box-shadow: 0 0 6px ${cor};"></div>
          <div class="resultado-materia-nome">${materia}</div>
          <div class="resultado-prog-wrap">
            <div class="resultado-prog-track">
              <div class="resultado-prog-fill" style="width:${pct}%; background:${cor};"></div>
            </div>
            <span class="resultado-pct" style="color:${cor};">${pct}%</span>
          </div>
          <span class="resultado-status">${emoji}</span>
        </div>
      `;
    }).join('');
}

async function salvarResultado({ totalQuestoes, totalAcertos, resultadosPorMateria }) {
  const payload = {
    total_questoes: totalQuestoes,
    total_acertos: totalAcertos,
    resultados_por_materia: resultadosPorMateria,
    concluido: true,
    realizado_em: new Date().toISOString()
  };

  // Tenta Supabase
  if (estado.userId) {
    try {
      const { error } = await supabase
        .from('diagnostico_resultados')
        .insert({ ...payload, user_id: estado.userId });

      if (!error) return;
      // Se tabela não existe (migration pendente), usa localStorage
    } catch (_) {}
  }

  // Fallback localStorage
  try {
    const key = `vestibular_diagnostico_${estado.userId || 'guest'}`;
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (_) {}
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function traduzirDificuldade(d) {
  const map = { facil: 'Fácil ●', medio: 'Médio ●●', dificil: 'Difícil ●●●' };
  return map[d] || d;
}

function classificarDominio(pct) {
  if (pct >= 75) return { cor: '#22c55e', emoji: '🟢' };
  if (pct >= 50) return { cor: '#84cc16', emoji: '🟡' };
  if (pct >= 30) return { cor: '#f59e0b', emoji: '🟠' };
  return { cor: '#ef4444', emoji: '🔴' };
}

// Inicia
iniciar();
