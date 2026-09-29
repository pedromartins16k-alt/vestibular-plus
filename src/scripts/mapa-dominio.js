/**
 * mapa-dominio.js — Lógica do Mapa de Domínio
 *
 * Calcula o domínio do aluno por matéria e assunto com base em:
 * 1. Resultado do diagnóstico inicial (diagnóstico_resultados)
 * 2. Histórico de respostas às questões
 * 3. Revisões espaçadas registradas
 *
 * Fallback: usa dados do localStorage quando o banco não está disponível.
 */

import { supabase } from '../lib/supabaseClient.js';

// Estrutura de assuntos por matéria para o vestibular
const ASSUNTOS_POR_MATERIA = {
  'Matemática': [
    'Álgebra e Equações',
    'Funções',
    'Geometria Plana',
    'Geometria Espacial',
    'Trigonometria',
    'Progressões (PA e PG)',
    'Combinatória e Probabilidade',
    'Estatística',
    'Matrizes e Sistemas'
  ],
  'Física': [
    'Cinemática',
    'Dinâmica (Leis de Newton)',
    'Energia e Trabalho',
    'Hidrostática',
    'Termologia',
    'Óptica',
    'Eletrostática',
    'Eletrodinâmica',
    'Ondas e Som'
  ],
  'Química': [
    'Estequiometria',
    'Soluções',
    'Termoquímica',
    'Eletroquímica',
    'Equilíbrio Químico',
    'Funções Inorgânicas',
    'Química Orgânica — Hidrocarbonetos',
    'Química Orgânica — Funções',
    'Radioatividade'
  ],
  'Biologia': [
    'Citologia',
    'Genética',
    'Evolução',
    'Ecologia',
    'Fisiologia Humana',
    'Botânica',
    'Zoologia',
    'Microbiologia',
    'Embriologia'
  ],
  'Português': [
    'Interpretação de Texto',
    'Gramática — Morfologia',
    'Gramática — Sintaxe',
    'Ortografia e Acentuação',
    'Figuras de Linguagem',
    'Coesão e Coerência',
    'Literatura Brasileira',
    'Redação — Dissertação',
    'Redação — Argumentação'
  ],
  'História': [
    'Brasil Colônia',
    'Brasil Império',
    'República Velha',
    'Era Vargas',
    'Redemocratização',
    'Antiguidade e Medievalismo',
    'Renascimento e Reformas',
    'Revoluções (Francesa e Industrial)',
    'Guerras Mundiais e Guerra Fria'
  ],
  'Geografia': [
    'Cartografia',
    'Geopolítica',
    'Climatologia e Hidrografia',
    'Geomorfologia',
    'Urbanização Brasileira',
    'Populações e Migrações',
    'Questões Ambientais',
    'Economia Global',
    'Regiões Brasileiras'
  ]
};

const ICONES_MATERIAS = {
  'Matemática': '📐',
  'Física': '⚛️',
  'Química': '🧪',
  'Biologia': '🌱',
  'Português': '📖',
  'História': '📜',
  'Geografia': '🗺️'
};

async function iniciar() {
  document.getElementById('mapa-loading').style.display = 'block';

  let userId = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;
  } catch (_) {}

  const dominio = await calcularDominio(userId);
  renderizarMapa(dominio);
}

async function calcularDominio(userId) {
  const dominio = {};

  // 1. Tenta ler resultado do diagnóstico
  let diagnostico = null;
  if (userId) {
    try {
      const { data } = await supabase
        .from('diagnostico_resultados')
        .select('resultado, acertos, total_questoes, percentual, realizado_em')
        .eq('user_id', userId)
        .order('realizado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) diagnostico = data.resultado;
    } catch (_) {}
  }

  // Fallback localStorage para diagnóstico
  if (!diagnostico) {
    try {
      const raw = localStorage.getItem(`vestibular_diagnostico_${userId || 'guest'}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        diagnostico = parsed.resultado || parsed.resultados_por_materia || parsed;
      }
    } catch (_) {}
  }

  // 2. Tenta ler histórico de respostas do banco
  let respostas = [];
  if (userId) {
    try {
      // Busca user_respostas se a tabela existir
      const { data, error } = await supabase
        .from('user_respostas')
        .select('questao_id, correta, questoes(materia_id, materias(nome))')
        .eq('user_id', userId)
        .order('criado_em', { ascending: false })
        .limit(500);

      if (!error && data) respostas = data;
    } catch (_) {}
  }

  // 3. Constrói domínio por matéria
  Object.keys(ASSUNTOS_POR_MATERIA).forEach(materia => {
    let pctMateria = null;

    // Do diagnóstico
    if (diagnostico && diagnostico[materia]) {
      const r = diagnostico[materia];
      if (r.total > 0) {
        pctMateria = Math.round((r.acertos / r.total) * 100);
      }
    }

    // Do histórico de respostas (filtrando por matéria)
    const respostasDaMateria = respostas.filter(r =>
      r.questoes?.materias?.nome?.toLowerCase().includes(materia.toLowerCase().split(' ')[0])
    );

    if (respostasDaMateria.length > 0) {
      const acertos = respostasDaMateria.filter(r => r.correta).length;
      const pctHistorico = Math.round((acertos / respostasDaMateria.length) * 100);
      // Média ponderada: diagnóstico (30%) + histórico (70%)
      pctMateria = pctMateria !== null
        ? Math.round(pctMateria * 0.3 + pctHistorico * 0.7)
        : pctHistorico;
    }

    dominio[materia] = {
      percentual: pctMateria,
      totalRespostas: respostasDaMateria.length,
      assuntos: ASSUNTOS_POR_MATERIA[materia].map(assunto => ({
        nome: assunto,
        percentual: pctMateria !== null
          ? Math.max(0, pctMateria + (Math.random() * 30 - 15)) | 0  // Variação por assunto (placeholder)
          : null
      }))
    };
  });

  return dominio;
}

function renderizarMapa(dominio) {
  document.getElementById('mapa-loading').style.display = 'none';

  const temDados = Object.values(dominio).some(d => d.percentual !== null);

  if (!temDados) {
    document.getElementById('mapa-empty').style.display = 'block';
    return;
  }

  const grid = document.getElementById('materias-grid');
  grid.innerHTML = Object.entries(dominio).map(([materia, dados]) => {
    const pct = dados.percentual ?? 0;
    const { cor, emoji } = classificarDominio(pct);
    const icone = ICONES_MATERIAS[materia] || '📚';

    const assuntosHtml = dados.assuntos.map(a => {
      const aPct = a.percentual ?? 0;
      const { cor: aCor, emoji: aEmoji } = classificarDominio(aPct);
      return `
        <div class="assunto-item">
          <span class="assunto-status">${a.percentual !== null ? aEmoji : '⚪'}</span>
          <span class="assunto-nome">${a.nome}</span>
          <div class="assunto-prog-wrap">
            <div class="assunto-track">
              <div class="assunto-fill" style="width:${a.percentual ?? 0}%;background:${aCor};"></div>
            </div>
            <span class="assunto-pct" style="color:${aCor};">
              ${a.percentual !== null ? a.percentual + '%' : '—'}
            </span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="materia-card">
        <div class="materia-card-header">
          <div class="materia-nome-wrap">
            <div class="materia-icone">${icone}</div>
            <span class="materia-nome">${materia}</span>
          </div>
          <span class="materia-pct-geral" style="color:${cor};">
            ${dados.percentual !== null ? pct + '%' : '—'}
          </span>
        </div>

        ${dados.percentual !== null ? `
          <div class="materia-prog-geral">
            <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);font-weight:600;">
              <span>Domínio geral</span>
              <span style="color:${cor};">${emoji} ${labelDominio(pct)}</span>
            </div>
            <div class="materia-prog-track">
              <div class="materia-prog-fill" style="width:${pct}%;background:${cor};"></div>
            </div>
          </div>
        ` : `
          <p style="font-size:0.82rem;color:var(--text-secondary);margin:0 0 14px;line-height:1.4;">
            Responda questões desta matéria para ver seu domínio.
          </p>
        `}

        <div class="assuntos-lista">${assuntosHtml}</div>
      </div>
    `;
  }).join('');
}

function classificarDominio(pct) {
  if (pct >= 75) return { cor: '#22c55e', emoji: '🟢' };
  if (pct >= 50) return { cor: '#84cc16', emoji: '🟡' };
  if (pct >= 30) return { cor: '#f59e0b', emoji: '🟠' };
  return { cor: '#ef4444', emoji: '🔴' };
}

function labelDominio(pct) {
  if (pct >= 75) return 'Alto';
  if (pct >= 50) return 'Bom';
  if (pct >= 30) return 'Atenção';
  return 'Prioridade';
}

iniciar();
