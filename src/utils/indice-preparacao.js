/**
 * indice-preparacao.js — Índice de Preparação do Aluno
 *
 * Calcula uma pontuação de 0 a 100 que representa o progresso do aluno
 * em relação ao vestibular escolhido.
 *
 * IMPORTANTE: Este é um indicador INTERNO de progresso.
 * NÃO é uma previsão de aprovação.
 *
 * Componentes do cálculo (pesos configuráveis):
 *  - Consistência (dias estudados)    → 25%
 *  - Desempenho em questões          → 35%
 *  - Cobertura de matérias           → 20%
 *  - Simulados realizados            → 15%
 *  - Conteúdos revisados             → 5%
 */

// ----------------------------------------------------------------
// Configuração dos pesos
// ----------------------------------------------------------------

const PESOS = {
  consistencia: 0.25,     // Streak e frequência de estudos
  desempenho: 0.35,       // Taxa de acerto em questões
  cobertura: 0.20,        // Diversidade de matérias estudadas
  simulados: 0.15,        // Simulados realizados
  conteudo: 0.05          // Resumos/flashcards revisados
};

// ----------------------------------------------------------------
// Funções de cálculo por componente
// ----------------------------------------------------------------

/**
 * Calcula pontuação de consistência (0-100).
 * Baseado no streak de dias e frequência semanal.
 */
function calcularConsistencia({ streakDias = 0, sessoes = [] }) {
  // Pontuação por streak (até 50 pts)
  const pontosStreak = Math.min(streakDias / 30 * 50, 50);

  // Frequência nas últimas 4 semanas (até 50 pts)
  const quatroSemanasAtras = new Date();
  quatroSemanasAtras.setDate(quatroSemanasAtras.getDate() - 28);

  const sessoesRecentes = sessoes.filter(s => {
    const data = new Date(s.criado_em || s.created_at || 0);
    return data >= quatroSemanasAtras;
  });

  // Dias únicos de estudo nas últimas 4 semanas
  const diasUnicos = new Set(
    sessoesRecentes.map(s => (s.criado_em || s.created_at || '').substring(0, 10))
  ).size;

  const pontosFrequencia = Math.min(diasUnicos / 20 * 50, 50); // 20 dias em 4 sem = máximo

  return Math.round(pontosStreak + pontosFrequencia);
}

/**
 * Calcula pontuação de desempenho (0-100).
 * Baseado na taxa de acerto ponderada por dificuldade.
 */
function calcularDesempenho({ totalQuestoes = 0, totalAcertos = 0, sessoes = [] }) {
  if (totalQuestoes === 0) return 0;

  const taxaAcerto = totalAcertos / totalQuestoes;

  // Penaliza pouca prática (menos de 20 questões = nota baixa mesmo com 100% de acerto)
  const fatorVolume = Math.min(totalQuestoes / 100, 1); // Satura em 100 questões

  return Math.round(taxaAcerto * fatorVolume * 100);
}

/**
 * Calcula pontuação de cobertura de matérias (0-100).
 * Quanto mais matérias diferentes foram praticadas, maior a pontuação.
 */
function calcularCobertura({ materiasEstudadas = [], totalMaterias = 10 }) {
  if (totalMaterias === 0) return 0;
  const unique = new Set(materiasEstudadas).size;
  return Math.round(Math.min(unique / totalMaterias, 1) * 100);
}

/**
 * Calcula pontuação de simulados (0-100).
 */
function calcularSimulados({ totalSimulados = 0, mediaAproveitamento = 0 }) {
  if (totalSimulados === 0) return 0;

  // Pontos por quantidade (até 40 pts: 1 simulado = 20, 2+ = 40)
  const pontosQtd = Math.min(totalSimulados * 20, 40);

  // Pontos por aproveitamento (até 60 pts)
  const pontosPerf = Math.round((mediaAproveitamento / 100) * 60);

  return Math.min(pontosQtd + pontosPerf, 100);
}

/**
 * Calcula pontuação de conteúdo revisado (0-100).
 */
function calcularConteudo({ totalFlashcards = 0, totalResumosVistos = 0 }) {
  const pontosFlash = Math.min(totalFlashcards / 50 * 50, 50);
  const pontosResumos = Math.min(totalResumosVistos / 20 * 50, 50);
  return Math.round(pontosFlash + pontosResumos);
}

// ----------------------------------------------------------------
// Função principal
// ----------------------------------------------------------------

/**
 * Calcula o Índice de Preparação completo.
 *
 * @param {Object} dados — dados do usuário coletados do dashboard
 * @returns {{ total: number, componentes: Object, detalhes: Object }}
 */
export function calcularIndicePreparacao(dados = {}) {
  const {
    streakDias = 0,
    sessoes = [],
    totalQuestoes = 0,
    totalAcertos = 0,
    materiasEstudadas = [],
    totalMaterias = 10,
    totalSimulados = 0,
    mediaAproveitamentoSimulados = 0,
    totalFlashcards = 0,
    totalResumosVistos = 0
  } = dados;

  const componentes = {
    consistencia: calcularConsistencia({ streakDias, sessoes }),
    desempenho: calcularDesempenho({ totalQuestoes, totalAcertos, sessoes }),
    cobertura: calcularCobertura({ materiasEstudadas, totalMaterias }),
    simulados: calcularSimulados({ totalSimulados, mediaAproveitamento: mediaAproveitamentoSimulados }),
    conteudo: calcularConteudo({ totalFlashcards, totalResumosVistos })
  };

  const total = Math.round(
    componentes.consistencia * PESOS.consistencia +
    componentes.desempenho * PESOS.desempenho +
    componentes.cobertura * PESOS.cobertura +
    componentes.simulados * PESOS.simulados +
    componentes.conteudo * PESOS.conteudo
  );

  return {
    total: Math.min(total, 100),
    componentes,
    pesos: PESOS,
    interpretacao: interpretarIndice(total)
  };
}

/**
 * Retorna interpretação textual do índice.
 */
function interpretarIndice(total) {
  if (total >= 80) return { nivel: 'alto', texto: 'Excelente progresso!', cor: '#22c55e' };
  if (total >= 60) return { nivel: 'bom', texto: 'Bom progresso', cor: '#84cc16' };
  if (total >= 40) return { nivel: 'medio', texto: 'Em desenvolvimento', cor: '#f59e0b' };
  if (total >= 20) return { nivel: 'baixo', texto: 'Intensifique os estudos', cor: '#f97316' };
  return { nivel: 'inicial', texto: 'Começando a jornada', cor: '#ef4444' };
}

/**
 * Renderiza o card de Índice de Preparação em um elemento HTML.
 * @param {HTMLElement} container — elemento onde renderizar
 * @param {Object} indice — resultado de calcularIndicePreparacao()
 */
export function renderizarIndice(container, indice) {
  if (!container || !indice) return;

  const { total, componentes, interpretacao } = indice;

  container.innerHTML = `
    <div style="
      display: flex; align-items: center; gap: 20px;
      flex-wrap: wrap;
    ">
      <!-- Número central -->
      <div style="
        width: 80px; height: 80px; border-radius: 50%;
        background: conic-gradient(
          ${interpretacao.cor} ${total * 3.6}deg,
          var(--border-color) ${total * 3.6}deg
        );
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 0 20px ${interpretacao.cor}33;
      ">
        <div style="
          width: 64px; height: 64px; border-radius: 50%;
          background: var(--bg-elevated);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        ">
          <span style="
            font-size: 1.3rem; font-weight: 800;
            font-family: var(--font-display);
            color: ${interpretacao.cor};
            line-height: 1;
          ">${total}</span>
          <span style="font-size: 0.6rem; color: var(--text-secondary); font-weight: 600;">/100</span>
        </div>
      </div>

      <!-- Detalhes -->
      <div style="flex: 1; min-width: 200px;">
        <div style="font-weight: 700; font-size: 0.88rem; color: ${interpretacao.cor}; margin-bottom: 4px;">
          ${interpretacao.texto}
        </div>
        <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.4;">
          Indicador interno de progresso — não é previsão de aprovação.
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;">
          ${Object.entries(componentes).map(([k, v]) => `
            <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
              <div style="
                width: 32px; height: 4px; border-radius: 2px;
                background: linear-gradient(90deg, var(--color-primary-500) ${v}%, var(--border-color) ${v}%);
              "></div>
              <span>${nomeComponente(k)}: ${v}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function nomeComponente(k) {
  const nomes = {
    consistencia: 'Consistência',
    desempenho: 'Desempenho',
    cobertura: 'Cobertura',
    simulados: 'Simulados',
    conteudo: 'Conteúdo'
  };
  return nomes[k] || k;
}
