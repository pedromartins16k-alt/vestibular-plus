/**
 * questoes.js — Laboratório de Questões (Vestibular+)
 *
 * Sistema profissional de resolução de exercícios, feedback pedagógico,
 * filtros combinados e ciclo contínuo de Spaced Repetition (SM-2).
 */

import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { verificarConquistas } from './conquistas.js';
import { buscarFavoritos, alternarFavorito } from './favoritos-global.js';
import { registrarResultado as registrarRevisaoEspacada, lerRevisoesPendentes } from '../utils/revisao.js';
import {
  obterOrdemPlano,
  canAccessDifficulty,
  getPlanoMinimoParaDificuldade,
  PLAN_LIMITS
} from '../lib/permissions.js';

// Elementos da Interface
const container = document.getElementById('questao-container');
const buscaInput = document.getElementById('filtro-busca-input');
const materiaSelect = document.getElementById('filtro-materia-select');
const dificuldadeSelect = document.getElementById('filtro-dificuldade-select');
const modosChipsRow = document.getElementById('modos-chips-row');
const filtrosAtivosBar = document.getElementById('filtros-ativos-bar');
const badgesContainer = document.getElementById('badges-filtros-container');
const btnLimparTodos = document.getElementById('btn-limpar-todos-filtros');

// Barra de Estatísticas da Sessão
const sessaoNumAtual = document.getElementById('sessao-num-atual');
const sessaoAcertosNum = document.getElementById('sessao-acertos-num');
const sessaoErrosNum = document.getElementById('sessao-erros-num');
const sessaoAproveitamentoNum = document.getElementById('sessao-aproveitamento-num');
const btnFinalizarSessao = document.getElementById('btn-finalizar-sessao');

// Estado Global
let sessionUserId = null;
let nomePlanoUsuario = 'free';
let questoesCache = [];
let materiasCache = [];
let favoritosSet = new Set();
let revisoesPendentesSet = new Set();
let questoesErradasSet = new Set();

// Estado dos Filtros
const filtros = {
  materia: 'todas',
  dificuldade: 'todas',
  busca: '',
  modo: 'todas' // 'todas' | 'revisao' | 'erradas' | 'favoritas'
};

// Estado da Sessão Ativa
const sessao = {
  indiceAtual: 0,
  respondidas: 0,
  acertos: 0,
  erros: 0,
  alternativaSelecionada: null,
  respondida: false
};

// ----------------------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------------------

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  sessionUserId = session.user.id;

  configurarEventosFiltros();

  try {
    // 1. Carrega plano, matérias, questões, favoritos e revisões pendentes em paralelo
    const [
      planoUsuario,
      resMaterias,
      questoesBrutas,
      favoritos,
      pendentes,
      resHistoricoErros
    ] = await Promise.all([
      buscarNomePlanoUsuario(),
      supabase.from('materias').select('id, nome, cor').order('ordem'),
      buscarTodasQuestoes(),
      buscarFavoritos('questao'),
      lerRevisoesPendentes(sessionUserId),
      supabase
        .from('sessoes_estudo')
        .select('materia_id, acertou')
        .eq('user_id', sessionUserId)
        .eq('tipo', 'questoes')
        .eq('acertou', false)
        .limit(200)
    ]);

    nomePlanoUsuario = planoUsuario;
    materiasCache = resMaterias.data || [];
    favoritosSet = favoritos || new Set();

    // Mapeia IDs para os modos rápidos
    const listaPendentes = Array.isArray(pendentes) ? pendentes : [];
    revisoesPendentesSet = new Set(listaPendentes.map(p => p.item_id || p.questao_id));

    // Carrega IDs errados do revisao_agendada
    try {
      const { data: revErradas } = await supabase
        .from('revisao_agendada')
        .select('item_id')
        .eq('user_id', sessionUserId)
        .gt('erros', 0);
      if (revErradas) {
        revErradas.forEach(r => questoesErradasSet.add(r.item_id));
      }
    } catch (_) {}

    // Processa questões com permissão do plano
    questoesCache = marcarQuestoesLiberadasEBloqueadas(questoesBrutas, nomePlanoUsuario);

    // Popula select de matérias
    preencherSelectMaterias();

    // Lê parâmetros da URL (ex: ?materia=..., ?busca=...)
    processarParametrosUrl();

    // Renderiza a primeira questão
    renderizarQuestao();
    atualizarBarraSessao();
  } catch (err) {
    console.error('Erro ao inicializar laboratório de questões:', err);
    renderizarErro('Não foi possível conectar ao banco de questões.');
  }
}

// ----------------------------------------------------------------
// BUSCA DE QUESTÕES NO SUPABASE
// ----------------------------------------------------------------

async function buscarTodasQuestoes() {
  const TAMANHO_PAGINA = 1000;
  let todas = [];
  let pagina = 0;

  while (true) {
    const inicio = pagina * TAMANHO_PAGINA;
    const fim = inicio + TAMANHO_PAGINA - 1;

    const { data, error } = await supabase
      .from('questoes')
      .select('id, enunciado, alternativas, resposta_correta, comentario, fonte, ano, dificuldade, materia_id, aula_id, materias(nome, cor)')
      .range(inicio, fim);

    if (error) {
      console.warn('Erro ao carregar questões:', error);
      break;
    }

    todas = todas.concat(data || []);
    if (!data || data.length < TAMANHO_PAGINA) break;
    pagina++;
  }

  return todas;
}

function marcarQuestoesLiberadasEBloqueadas(lista, nomePlano) {
  const ordemPlano = obterOrdemPlano(nomePlano || 'free');

  return lista.map(q => {
    const nivel = q.dificuldade || 'facil';
    const liberada = canAccessDifficulty(ordemPlano, nivel);
    return {
      ...q,
      bloqueada: !liberada
    };
  });
}

async function buscarNomePlanoUsuario() {
  try {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('planos(nome)')
      .eq('id', sessionUserId)
      .single();

    return perfil?.planos?.nome || 'free';
  } catch (_) {
    return 'free';
  }
}

// ----------------------------------------------------------------
// FILTRAGEM COMBINADA
// ----------------------------------------------------------------

function filtrarQuestoes() {
  let lista = questoesCache;

  // 1. Filtro de Matéria
  if (filtros.materia !== 'todas') {
    lista = lista.filter(q => q.materia_id === filtros.materia);
  }

  // 2. Filtro de Dificuldade
  if (filtros.dificuldade !== 'todas') {
    lista = lista.filter(q => (q.dificuldade || 'medio').toLowerCase() === filtros.dificuldade.toLowerCase());
  }

  // 3. Filtro de Modo Especial
  if (filtros.modo === 'revisao') {
    lista = lista.filter(q => revisoesPendentesSet.has(q.id));
  } else if (filtros.modo === 'erradas') {
    lista = lista.filter(q => questoesErradasSet.has(q.id));
  } else if (filtros.modo === 'favoritas') {
    lista = lista.filter(q => favoritosSet.has(q.id));
  }

  // 4. Filtro de Busca Textual
  if (filtros.busca.trim().length > 0) {
    const termo = normalizarTexto(filtros.busca);
    lista = lista.filter(q => {
      const enunciado = normalizarTexto(q.enunciado || '');
      const fonte = normalizarTexto(q.fonte || '');
      const comentario = normalizarTexto(q.comentario || '');
      const materia = normalizarTexto(q.materias?.nome || '');
      return enunciado.includes(termo) || fonte.includes(termo) || comentario.includes(termo) || materia.includes(termo);
    });
  }

  return lista;
}

function normalizarTexto(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function configurarEventosFiltros() {
  // Busca com debounce
  let timeoutBusca = null;
  buscaInput?.addEventListener('input', (e) => {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(() => {
      filtros.busca = e.target.value.trim();
      sessao.indiceAtual = 0;
      atualizarBadgesFiltros();
      renderizarQuestao();
    }, 250);
  });

  // Select de Matéria
  materiaSelect?.addEventListener('change', (e) => {
    filtros.materia = e.target.value;
    sessao.indiceAtual = 0;
    atualizarBadgesFiltros();
    renderizarQuestao();
  });

  // Select de Dificuldade
  dificuldadeSelect?.addEventListener('change', (e) => {
    filtros.dificuldade = e.target.value;
    sessao.indiceAtual = 0;
    atualizarBadgesFiltros();
    renderizarQuestao();
  });

  // Chips de Modos Rápidos
  modosChipsRow?.querySelectorAll('.chip-modo').forEach(chip => {
    chip.addEventListener('click', () => {
      modosChipsRow.querySelectorAll('.chip-modo').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filtros.modo = chip.dataset.modo || 'todas';
      sessao.indiceAtual = 0;
      atualizarBadgesFiltros();
      renderizarQuestao();
    });
  });

  // Botão Limpar Filtros
  btnLimparTodos?.addEventListener('click', limparTodosFiltros);

  // Botão Finalizar Sessão
  btnFinalizarSessao?.addEventListener('click', exibirResumoSessao);
}

function preencherSelectMaterias() {
  if (!materiaSelect) return;
  materiaSelect.innerHTML = '<option value="todas">Todas as Matérias</option>';
  materiasCache.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.nome;
    materiaSelect.appendChild(opt);
  });
}

function atualizarBadgesFiltros() {
  if (!filtrosAtivosBar || !badgesContainer) return;

  const badges = [];

  if (filtros.materia !== 'todas') {
    const m = materiasCache.find(x => x.id === filtros.materia);
    badges.push({ tipo: 'materia', texto: `Matéria: ${m?.nome || 'Selecionada'}` });
  }

  if (filtros.dificuldade !== 'todas') {
    const difs = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', genio: 'Gênio' };
    badges.push({ tipo: 'dificuldade', texto: `Nível: ${difs[filtros.dificuldade] || filtros.dificuldade}` });
  }

  if (filtros.modo !== 'todas') {
    const modosLabels = { revisao: '🧠 Para Revisar', erradas: '❌ Minhas Erradas', favoritas: '⭐ Favoritas' };
    badges.push({ tipo: 'modo', texto: modosLabels[filtros.modo] || filtros.modo });
  }

  if (filtros.busca.trim().length > 0) {
    badges.push({ tipo: 'busca', texto: `Busca: "${filtros.busca}"` });
  }

  if (badges.length === 0) {
    filtrosAtivosBar.style.display = 'none';
    badgesContainer.innerHTML = '';
    return;
  }

  filtrosAtivosBar.style.display = 'flex';
  badgesContainer.innerHTML = badges.map(b => `
    <span class="badge-filtro-ativo">
      ${b.texto}
      <span class="badge-filtro-fechar" onclick="window.removerFiltroIndividual('${b.tipo}')">✕</span>
    </span>
  `).join('');
}

window.removerFiltroIndividual = function(tipo) {
  if (tipo === 'materia') {
    filtros.materia = 'todas';
    if (materiaSelect) materiaSelect.value = 'todas';
  } else if (tipo === 'dificuldade') {
    filtros.dificuldade = 'todas';
    if (dificuldadeSelect) dificuldadeSelect.value = 'todas';
  } else if (tipo === 'modo') {
    filtros.modo = 'todas';
    modosChipsRow?.querySelectorAll('.chip-modo').forEach(c => {
      c.classList.toggle('active', c.dataset.modo === 'todas');
    });
  } else if (tipo === 'busca') {
    filtros.busca = '';
    if (buscaInput) buscaInput.value = '';
  }

  sessao.indiceAtual = 0;
  atualizarBadgesFiltros();
  renderizarQuestao();
};

function limparTodosFiltros() {
  filtros.materia = 'todas';
  filtros.dificuldade = 'todas';
  filtros.busca = '';
  filtros.modo = 'todas';

  if (materiaSelect) materiaSelect.value = 'todas';
  if (dificuldadeSelect) dificuldadeSelect.value = 'todas';
  if (buscaInput) buscaInput.value = '';

  modosChipsRow?.querySelectorAll('.chip-modo').forEach(c => {
    c.classList.toggle('active', c.dataset.modo === 'todas');
  });

  sessao.indiceAtual = 0;
  atualizarBadgesFiltros();
  renderizarQuestao();
}

function processarParametrosUrl() {
  const params = new URLSearchParams(window.location.search);
  const paramMateria = params.get('materia');
  const paramBusca = params.get('busca') || params.get('assunto');
  const paramModo = params.get('modo');

  if (paramMateria && paramMateria !== 'todas') {
    // Busca por ID ou Nome
    const porId = materiasCache.find(m => m.id === paramMateria);
    const porNome = materiasCache.find(m => normalizarTexto(m.nome) === normalizarTexto(paramMateria));
    const matFinal = porId || porNome;
    if (matFinal && materiaSelect) {
      filtros.materia = matFinal.id;
      materiaSelect.value = matFinal.id;
    }
  }

  if (paramBusca && buscaInput) {
    filtros.busca = paramBusca;
    buscaInput.value = paramBusca;
  }

  if (paramModo && ['revisao', 'erradas', 'favoritas'].includes(paramModo)) {
    filtros.modo = paramModo;
    modosChipsRow?.querySelectorAll('.chip-modo').forEach(c => {
      c.classList.toggle('active', c.dataset.modo === paramModo);
    });
  }

  atualizarBadgesFiltros();
}

// ----------------------------------------------------------------
// RENDERIZAÇÃO DA QUESTÃO
// ----------------------------------------------------------------

function renderizarQuestao() {
  sessao.alternativaSelecionada = null;
  sessao.respondida = false;

  const lista = filtrarQuestoes();

  if (lista.length === 0) {
    renderizarEmptyState();
    return;
  }

  if (sessao.indiceAtual >= lista.length) {
    exibirResumoSessao();
    return;
  }

  const q = lista[sessao.indiceAtual];
  atualizarBarraSessao(lista.length);

  // Verificação de bloqueio por plano
  if (q.bloqueada) {
    renderizarQuestaoBloqueada(q);
    return;
  }

  const corMateria = q.materias?.cor || '#7c3aed';
  const nomeMateria = q.materias?.nome || 'Geral';
  const favoritado = favoritosSet.has(q.id);

  const fonteTexto = q.fonte ? `${q.fonte}${q.ano ? ' · ' + q.ano : ''}` : (q.ano ? String(q.ano) : 'Vestibular');
  const difLabel = traduzirDificuldade(q.dificuldade);

  // Alternativas
  let alternativas = [];
  try {
    alternativas = typeof q.alternativas === 'string' ? JSON.parse(q.alternativas) : (q.alternativas || []);
  } catch (_) {
    alternativas = [];
  }

  const alternativasHtml = alternativas.map((alt, idx) => {
    const letra = alt.letra || String.fromCharCode(65 + idx);
    return `
      <div class="alt-item" data-letra="${letra}" tabindex="0" role="button" aria-label="Alternativa ${letra}">
        <span class="alt-letra-circle">${letra}</span>
        <div class="alt-texto-conteudo">${alt.texto || ''}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <article class="questao-card-moderno fade-up" aria-label="Questão ${sessao.indiceAtual + 1}">
      <div class="questao-topo-meta">
        <div class="meta-tags-left">
          <span class="tag-pill" style="background:${corMateria}20; color:${corMateria}; border:1px solid ${corMateria}40;">
            ${nomeMateria}
          </span>
          <span class="tag-pill" style="background:var(--glass-bg); border:1px solid var(--border-color); color:var(--text-secondary);">
            🏛️ ${fonteTexto}
          </span>
          <span class="tag-pill" style="background:var(--glass-bg); border:1px solid var(--border-color); color:var(--text-secondary);">
            📊 ${difLabel}
          </span>
        </div>
        <button class="favorito-toggle-btn ${favoritado ? 'ativo' : ''}" id="btn-favorito-questao" title="Salvar questão nos favoritos">
          ${favoritado ? '♥' : '♡'}
        </button>
      </div>

      <div class="questao-enunciado-texto">
        ${formatarEnunciado(q.enunciado)}
      </div>

      <div class="alternativas-lista" id="alternativas-lista">
        ${alternativasHtml}
      </div>

      <div class="feedback-box-laboratorio" id="feedback-box-lab">
        <div class="feedback-topo-titulo" id="feedback-titulo"></div>
        <div id="feedback-detalhe"></div>
        <div class="feedback-comentario-texto" id="feedback-comentario"></div>
      </div>

      <div class="questao-actions-bar">
        <div>
          <button type="button" class="btn btn-ghost" id="btn-pular-questao" style="font-size:0.85rem; padding:8px 16px;">
            Pular questão →
          </button>
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn btn-primary" id="btn-confirmar-resposta" disabled style="padding:10px 22px; font-weight:700;">
            Confirmar resposta
          </button>
          <button type="button" class="btn btn-primary" id="btn-proxima-questao" style="display:none; padding:10px 22px; font-weight:700;">
            Próxima questão →
          </button>
        </div>
      </div>
    </article>
  `;

  // Eventos das alternativas
  const itensAlt = container.querySelectorAll('.alt-item');
  itensAlt.forEach(el => {
    el.addEventListener('click', () => {
      if (sessao.respondida) return;
      itensAlt.forEach(a => a.classList.remove('selecionada'));
      el.classList.add('selecionada');
      sessao.alternativaSelecionada = el.dataset.letra;

      const btnConfirmar = document.getElementById('btn-confirmar-resposta');
      if (btnConfirmar) btnConfirmar.disabled = false;
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });

  // Evento Confirmar Resposta
  document.getElementById('btn-confirmar-resposta')?.addEventListener('click', () => {
    confirmarResposta(q);
  });

  // Evento Próxima Questão
  document.getElementById('btn-proxima-questao')?.addEventListener('click', () => {
    sessao.indiceAtual++;
    renderizarQuestao();
  });

  // Evento Pular Questão
  document.getElementById('btn-pular-questao')?.addEventListener('click', () => {
    sessao.indiceAtual++;
    renderizarQuestao();
  });

  // Evento Favoritar
  document.getElementById('btn-favorito-questao')?.addEventListener('click', () => {
    alternarFavoritoQuestao(q.id);
  });
}

function formatarEnunciado(texto) {
  if (!texto) return '';
  return texto
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function traduzirDificuldade(d) {
  const map = { facil: 'Fácil ●', medio: 'Médio ●●', dificil: 'Difícil ●●●', genio: 'Gênio ●●●●' };
  return map[d?.toLowerCase()] || 'Médio ●●';
}

// ----------------------------------------------------------------
// CONFIRMAÇÃO & CORREÇÃO DA RESPOSTA
// ----------------------------------------------------------------

async function confirmarResposta(questao) {
  if (sessao.respondida || !sessao.alternativaSelecionada) return;
  sessao.respondida = true;
  sessao.respondidas++;

  const letraEscolhida = sessao.alternativaSelecionada;
  const letraCorreta = (questao.resposta_correta || '').trim().toUpperCase();
  const acertou = letraEscolhida.toUpperCase() === letraCorreta;

  if (acertou) {
    sessao.acertos++;
  } else {
    sessao.erros++;
    questoesErradasSet.add(questao.id);
  }

  // Estiliza alternativas
  const itensAlt = container.querySelectorAll('.alt-item');
  itensAlt.forEach(el => {
    el.style.pointerEvents = 'none';
    const l = el.dataset.letra?.toUpperCase();
    if (l === letraCorreta) {
      el.classList.add('correta');
    } else if (l === letraEscolhida.toUpperCase() && !acertou) {
      el.classList.add('errada');
    }
  });

  // Preenche caixa de feedback
  const feedbackBox = document.getElementById('feedback-box-lab');
  const feedbackTitulo = document.getElementById('feedback-titulo');
  const feedbackDetalhe = document.getElementById('feedback-detalhe');
  const feedbackComentario = document.getElementById('feedback-comentario');

  if (feedbackBox) {
    feedbackBox.className = `feedback-box-laboratorio ${acertou ? 'acerto' : 'erro'}`;

    if (acertou) {
      feedbackTitulo.innerHTML = '🎉 Excelente! Resposta Correta.';
      feedbackTitulo.style.color = 'var(--color-success)';
      feedbackDetalhe.textContent = `Você acertou a questão marcando a alternativa ${letraCorreta}.`;
    } else {
      feedbackTitulo.innerHTML = '❌ Não foi desta vez.';
      feedbackTitulo.style.color = 'var(--color-danger)';
      feedbackDetalhe.innerHTML = `Sua resposta: <strong>${letraEscolhida}</strong>. A resposta correta é a alternativa <strong>${letraCorreta}</strong>.`;
    }

    if (questao.comentario && questao.comentario.trim().length > 0) {
      feedbackComentario.style.display = 'block';
      feedbackComentario.innerHTML = `<strong>💡 Resolução comentada:</strong><br>${questao.comentario}`;
    } else {
      feedbackComentario.style.display = 'none';
    }
  }

  // Alterna botões
  const btnConfirmar = document.getElementById('btn-confirmar-resposta');
  const btnProxima = document.getElementById('btn-proxima-questao');
  if (btnConfirmar) btnConfirmar.style.display = 'none';
  if (btnProxima) btnProxima.style.display = 'inline-flex';

  // Atualiza barra de sessão
  atualizarBarraSessao();

  // Integração com Spaced Repetition (revisao_agendada)
  if (sessionUserId && questao.id) {
    registrarRevisaoEspacada(sessionUserId, questao.id, acertou ? 'acerto' : 'erro', {
      tipoItem: 'questao',
      dificuldade: questao.dificuldade || 'medio'
    }).catch(err => console.warn('[questões] Erro ao registrar revisão espaçada:', err));
  }

  // Registra sessão de estudo e concede XP
  try {
    await supabase.from('sessoes_estudo').insert({
      user_id: sessionUserId,
      materia_id: questao.materia_id || null,
      duracao_minutos: 2,
      tipo: 'questoes',
      acertou
    });

    const p_tipo = acertou ? 'questao_correta' : 'questao_errada';
    await supabase.rpc('conceder_xp', { p_tipo });
    verificarConquistas(sessionUserId);
  } catch (err) {
    console.warn('[questões] Falha ao registrar sessão de estudo:', err);
  }
}

// ----------------------------------------------------------------
// ATUALIZAÇÃO DA BARRA DE SESSÃO
// ----------------------------------------------------------------

function atualizarBarraSessao(totalNaLista = null) {
  const lista = totalNaLista !== null ? totalNaLista : filtrarQuestoes().length;
  const numAtual = Math.min(sessao.indiceAtual + 1, Math.max(1, lista));

  if (sessaoNumAtual) sessaoNumAtual.textContent = `Questão ${numAtual} de ${lista}`;
  if (sessaoAcertosNum) sessaoAcertosNum.textContent = `${sessao.acertos} acerto${sessao.acertos === 1 ? '' : 's'}`;
  if (sessaoErrosNum) sessaoErrosNum.textContent = `${sessao.erros} erro${sessao.erros === 1 ? '' : 's'}`;

  const pct = sessao.respondidas > 0 ? Math.round((sessao.acertos / sessao.respondidas) * 100) : 0;
  if (sessaoAproveitamentoNum) sessaoAproveitamentoNum.textContent = `${pct}% aproveitamento`;
}

// ----------------------------------------------------------------
// RESUMO DA SESSÃO
// ----------------------------------------------------------------

function exibirResumoSessao() {
  const pct = sessao.respondidas > 0 ? Math.round((sessao.acertos / sessao.respondidas) * 100) : 0;

  container.innerHTML = `
    <div class="resumo-sessao-card fade-up">
      <div style="font-size:3rem; margin-bottom:12px;">
        ${pct >= 70 ? '🏆' : pct >= 50 ? '📈' : '💪'}
      </div>
      <h2 style="font-size:1.6rem; font-weight:800; margin-bottom:8px;">Sessão Concluída!</h2>
      <p style="color:var(--text-secondary); font-size:0.95rem; margin-bottom:24px;">
        Você respondeu <strong>${sessao.respondidas}</strong> questões com aproveitamento de <strong>${pct}%</strong>.
      </p>

      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; max-width:440px; margin:0 auto 28px;">
        <div style="background:var(--glass-bg); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:14px;">
          <div style="font-size:1.4rem; font-weight:900; color:var(--color-success);">${sessao.acertos}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:700;">ACERTOS</div>
        </div>
        <div style="background:var(--glass-bg); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:14px;">
          <div style="font-size:1.4rem; font-weight:900; color:var(--color-danger);">${sessao.erros}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:700;">ERROS</div>
        </div>
        <div style="background:var(--glass-bg); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:14px;">
          <div style="font-size:1.4rem; font-weight:900; color:var(--color-primary-400);">${pct}%</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:700;">DESEMPENHO</div>
        </div>
      </div>

      <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" id="btn-reiniciar-sessao">
          Reiniciar Sessão 🔄
        </button>
        <a href="./dashboard.html" class="btn btn-ghost">
          Voltar ao Centro de Comando 🏠
        </a>
      </div>
    </div>
  `;

  document.getElementById('btn-reiniciar-sessao')?.addEventListener('click', () => {
    sessao.indiceAtual = 0;
    sessao.respondidas = 0;
    sessao.acertos = 0;
    sessao.erros = 0;
    renderizarQuestao();
  });
}

// ----------------------------------------------------------------
// ESTADOS VAZIO, ERRO E BLOQUEADO
// ----------------------------------------------------------------

function renderizarEmptyState() {
  container.innerHTML = `
    <div class="resumo-sessao-card fade-up" style="padding:48px 24px;">
      <div style="font-size:2.8rem; margin-bottom:12px;">🔍</div>
      <h3 style="font-size:1.3rem; font-weight:800; margin-bottom:8px;">Nenhuma questão encontrada</h3>
      <p style="color:var(--text-secondary); font-size:0.9rem; max-width:440px; margin:0 auto 20px;">
        Não encontramos questões correspondentes aos filtros ativos no momento.
      </p>
      <button type="button" class="btn btn-primary" onclick="window.redefinirFiltrosGerais()">
        Limpar Filtros ✕
      </button>
    </div>
  `;
  window.redefinirFiltrosGerais = limparTodosFiltros;
}

function renderizarErro(msg) {
  container.innerHTML = `
    <div class="resumo-sessao-card fade-up" style="padding:48px 24px;">
      <div style="font-size:2.8rem; margin-bottom:12px;">⚠️</div>
      <h3 style="font-size:1.3rem; font-weight:800; margin-bottom:8px;">Erro ao carregar questões</h3>
      <p style="color:var(--text-secondary); font-size:0.9rem; max-width:440px; margin:0 auto 20px;">
        ${msg}
      </p>
      <button type="button" class="btn btn-primary" onclick="location.reload()">
        Tentar Novamente 🔄
      </button>
    </div>
  `;
}

function renderizarQuestaoBloqueada(q) {
  const infoPlano = getPlanoMinimoParaDificuldade(q.dificuldade);

  container.innerHTML = `
    <article class="questao-card-moderno fade-up" style="text-align:center; padding:48px 24px;">
      <div style="font-size:3rem; margin-bottom:14px;">🔒</div>
      <h3 style="font-size:1.35rem; font-weight:800; margin-bottom:10px;">
        Questão exclusiva do Plano ${infoPlano.nome}
      </h3>
      <p style="color:var(--text-secondary); font-size:0.92rem; max-width:460px; margin:0 auto 24px;">
        Esta questão de nível <strong>${traduzirDificuldade(q.dificuldade)}</strong> está reservada para assinantes. Faça upgrade para desbloquear todo o acervo.
      </p>
      <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        <a href="./precos.html?plano=${infoPlano.nome.toLowerCase()}" class="btn btn-primary" style="background:${infoPlano.gradiente};">
          🚀 Desbloquear no Plano ${infoPlano.nome}
        </a>
        <button type="button" class="btn btn-ghost" id="btn-pular-bloqueada">
          Pular questão →
        </button>
      </div>
    </article>
  `;

  document.getElementById('btn-pular-bloqueada')?.addEventListener('click', () => {
    sessao.indiceAtual++;
    renderizarQuestao();
  });
}

// ----------------------------------------------------------------
// FAVORITOS
// ----------------------------------------------------------------

async function alternarFavoritoQuestao(id) {
  const estava = favoritosSet.has(id);
  const novoEstado = await alternarFavorito('questao', id, estava);
  if (novoEstado) favoritosSet.add(id); else favoritosSet.delete(id);

  const btn = document.getElementById('btn-favorito-questao');
  if (btn) {
    btn.textContent = novoEstado ? '♥' : '♡';
    btn.classList.toggle('ativo', novoEstado);
  }
}

// Inicia
iniciar();