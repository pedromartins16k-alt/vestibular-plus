/**
 * redacao.js — Laboratório Oficial de Redação do Vestibular+
 *
 * Características e Diretrizes:
 *  1. Acervo com propostas reais e inéditas de treino com textos motivadores (`src/data/propostas-redacao.json`).
 *  2. Editor com foco visual, contagem em tempo real (palavras, caracteres, linhas estimadas).
 *  3. Cronômetro de escrita com suporte a pausar, retomar e computar tempo de produção.
 *  4. Autosave resiliente e isolado por usuário (`redacao_draft_<userId>_<propostaId>`).
 *  5. Histórico e persistência de redações finalizadas com isolamento estrito por usuário:
 *     - Tenta persistir sessão em `sessoes_estudo` (tipo 'redacao').
 *     - Armazena histórico completo de redações e avaliações em storage isolado por `sessionUserId`.
 *  6. Matriz de Correção Oficial:
 *     - ENEM (5 competências, 1000 pontos totais).
 *     - FUVEST (3 competências, 50 pontos totais).
 *     - UNICAMP e UNESP conforme suas respectivas matrizes de banca.
 *  7. Transparência pedagógica:
 *     - Diferenciação nítida entre "Aguardando correção da banca / Estrutura preparada" e nota atribuída.
 *     - Não inventa pontuações fictícias.
 */

import { supabase } from '../lib/supabaseClient.js';
import { lerObjetivo } from './objetivo.js';
import propostasDataImported from '../data/propostas-redacao.json';

let propostasData = propostasDataImported;
let propostasLista = propostasDataImported?.propostas || [];
let criteriosBancas = propostasDataImported?.criterios_bancas || {};
let propostaAtiva = null;
let sessionUserId = null;
let objetivoAluno = null;

// Variáveis do Cronômetro
let timerSegundos = 0;
let timerInterval = null;
let timerPausado = false;

// Chaves de Armazenamento
const STORAGE_PREFIX_HISTORICO = 'vestibular_redacoes_concluidas_';
const STORAGE_PREFIX_DRAFT = 'redacao_draft_';

function getDraftKey(userId, propostaId) {
  return `${STORAGE_PREFIX_DRAFT}${userId || 'guest'}_${propostaId}`;
}

function getHistoricoKey(userId) {
  return `${STORAGE_PREFIX_HISTORICO}${userId || 'guest'}`;
}

function lerHistoricoLocal(userId) {
  try {
    const raw = localStorage.getItem(getHistoricoKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function salvarNoHistoricoLocal(userId, redacaoObj) {
  try {
    const historico = lerHistoricoLocal(userId);
    historico.unshift(redacaoObj);
    localStorage.setItem(getHistoricoKey(userId), JSON.stringify(historico));
  } catch (_) {}
}

async function carregarHistoricoSupabase() {
  if (!sessionUserId) return;
  try {
    const { data, error } = await supabase
      .from('redacoes')
      .select('*')
      .order('criado_em', { ascending: false });

    if (error) {
      console.warn('[redacao] Não foi possível buscar redações no Supabase (verifique permissões/GRANT):', error.message);
      return;
    }

    if (data && data.length > 0) {
      const historicoAtual = lerHistoricoLocal(sessionUserId);
      const idsLocais = new Set(historicoAtual.map(h => h.id));

      data.forEach(row => {
        if (!idsLocais.has(row.id)) {
          const bancaId = row.banca?.toLowerCase();
          const matriz = criteriosBancas[bancaId] || criteriosBancas.enem;
          historicoAtual.push({
            id: row.id,
            proposta_id: row.proposta_id,
            proposta_titulo: row.titulo_proposta,
            vestibular_id: row.banca,
            vestibular_nome: row.banca ? row.banca.toUpperCase() : 'Vestibular',
            tipo_genero: 'Dissertativo-argumentativo',
            texto: row.texto,
            palavras: row.palavras,
            caracteres: row.caracteres,
            tempo_segundos: row.tempo_segundos,
            tempo_formatado: `${Math.floor(row.tempo_segundos / 3600).toString().padStart(2, '0')}:${Math.floor((row.tempo_segundos % 3600) / 60).toString().padStart(2, '0')}:${(row.tempo_segundos % 60).toString().padStart(2, '0')}`,
            data_envio: row.criado_em,
            status: row.status || 'aguardando_correcao',
            matriz_criterios: matriz
          });
        }
      });

      // Ordena por data decrescente
      historicoAtual.sort((a, b) => new Date(b.data_envio) - new Date(a.data_envio));
      localStorage.setItem(getHistoricoKey(sessionUserId), JSON.stringify(historicoAtual));
    }
  } catch (err) {
    console.warn('[redacao] Erro na sincronização Supabase -> Local:', err);
  }
}

// ================================================================
// INICIALIZAÇÃO
// ================================================================
async function iniciar() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    sessionUserId = session?.user?.id || null;

    // Carrega objetivo do aluno
    objetivoAluno = await lerObjetivo();

    // Sincroniza histórico remoto se logado
    await carregarHistoricoSupabase();

    renderizarHero();
    renderizarPropostas(propostasLista);
    atualizarContadorHistorico();
    configurarEventosUI();

  } catch (err) {
    console.error('[redacao] Erro ao carregar laboratório de redação:', err);
  }
}

// ================================================================
// HERO CONTEXTUAL
// ================================================================
function renderizarHero() {
  const container = document.getElementById('redacao-hero-card');
  if (!container) return;

  const historico = lerHistoricoLocal(sessionUserId);
  const totalFeitas = historico.length;

  const vestAlvo = objetivoAluno?.vestibular_nome || objetivoAluno?.vestibular_id?.toUpperCase() || 'Vestibular';
  const cursoAlvo = objetivoAluno?.curso ? ` para ${objetivoAluno.curso}` : '';

  container.innerHTML = `
    <div>
      <span class="hero-tag">🎯 Foco: ${vestAlvo}${cursoAlvo}</span>
      <h2 style="font-size:1.45rem; font-weight:800; font-family:var(--font-display); margin:8px 0 4px;">
        Treine a produção do seu vestibular-alvo
      </h2>
      <p style="font-size:0.88rem; color:var(--text-secondary); margin:0;">
        Escreva com tempo cronometrado, textos motivadores autênticos e conheça as competências exigidas pela banca.
      </p>
    </div>

    <div style="display:flex; align-items:center; gap:16px;">
      <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:14px 20px; text-align:center;">
        <div style="font-size:1.8rem; font-weight:900; font-family:var(--font-display); color:#38bdf8;">${totalFeitas}</div>
        <div style="font-size:0.74rem; text-transform:uppercase; color:var(--text-secondary); margin-top:2px;">Redações Realizadas</div>
      </div>
    </div>
  `;
}

// ================================================================
// LISTAGEM DE PROPOSTAS & FILTROS
// ================================================================
function renderizarPropostas(lista) {
  const grid = document.getElementById('propostas-grid');
  if (!grid) return;

  if (lista.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:50px 20px; color:var(--text-secondary);">
        <span style="font-size:2.5rem; display:block; margin-bottom:8px;">🔍</span>
        <h4 style="font-size:1.1rem; color:var(--text-primary); margin-bottom:4px;">Nenhuma proposta encontrada</h4>
        <p style="font-size:0.86rem;">Tente ajustar os filtros de banca ou termo de busca.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = lista.map(p => {
    const draftSalvo = localStorage.getItem(getDraftKey(sessionUserId, p.id));
    const temDraft = Boolean(draftSalvo);

    return `
      <div class="proposta-card">
        <div>
          <div class="proposta-topo">
            <span class="banca-tag">${p.vestibular_nome}</span>
            <span class="${p.edicao_oficial ? 'tipo-tag-oficial' : 'tipo-tag-treino'}">
              ${p.edicao_oficial ? `Oficial ${p.ano}` : 'Proposta Inédita'}
            </span>
          </div>

          <h3 class="proposta-titulo">${p.titulo}</h3>

          <div class="proposta-meta">
            <span>🏷️ ${p.categoria}</span>
            <span>·</span>
            <span>📝 ${p.tipo_genero}</span>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:12px; border-top:1px solid var(--border-color);">
          <span style="font-size:0.78rem; color:${temDraft ? '#f59e0b' : 'var(--text-secondary)'}; font-weight:600;">
            ${temDraft ? '✏️ Rascunho salvo' : 'Pronto para escrever'}
          </span>
          <button class="btn btn-secondary btn-abrir-proposta" data-id="${p.id}" style="padding:6px 14px; font-size:0.82rem;">
            Ver Proposta →
          </button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.btn-abrir-proposta').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      abrirModalProposta(id);
    });
  });
}

function abrirModalProposta(propostaId) {
  const p = propostasLista.find(item => item.id === propostaId);
  if (!p) return;

  const modal = document.getElementById('modal-proposta-overlay');
  document.getElementById('modal-banca-tag').textContent = p.vestibular_nome;
  const tipoTag = document.getElementById('modal-tipo-tag');
  if (tipoTag) {
    tipoTag.textContent = p.edicao_oficial ? `Oficial ${p.ano}` : 'Proposta Inédita';
    tipoTag.className = p.edicao_oficial ? 'tipo-tag-oficial' : 'tipo-tag-treino';
  }
  document.getElementById('modal-proposta-titulo').textContent = p.titulo;
  document.getElementById('modal-proposta-meta').textContent = `${p.categoria} · ${p.tipo_genero} · ${p.palavras_recomendadas}`;
  document.getElementById('modal-proposta-instrucoes').textContent = p.instrucoes;

  const containerTextos = document.getElementById('modal-textos-motivadores');
  containerTextos.innerHTML = (p.textos_motivadores || []).map(t => `
    <div class="texto-mot-item">
      <strong>${escapeHtml(t.titulo)}</strong>
      <p style="margin:6px 0 0;">${escapeHtml(t.conteudo)}</p>
      ${t.fonte ? `<div class="texto-mot-fonte">Fonte: ${escapeHtml(t.fonte)}</div>` : ''}
    </div>
  `).join('');

  const btnIniciar = document.getElementById('modal-btn-iniciar-escrita');
  btnIniciar.onclick = () => {
    modal.classList.remove('open');
    iniciarEditor(p);
  };

  modal.classList.add('open');
}

// ================================================================
// EDITOR DE REDAÇÃO & CRONÔMETRO
// ================================================================
function iniciarEditor(proposta) {
  propostaAtiva = proposta;

  // Alterna Abas
  document.getElementById('aba-propostas').style.display = 'none';
  document.getElementById('aba-historico').style.display = 'none';
  const tabEditor = document.getElementById('tab-btn-editor');
  tabEditor.style.display = 'inline-flex';
  tabEditor.click();

  // Preenche dados da proposta no editor
  document.getElementById('editor-banca-tag').textContent = proposta.vestibular_nome;
  document.getElementById('editor-tema-titulo').textContent = proposta.titulo;
  document.getElementById('editor-tipo-genero').textContent = `${proposta.tipo_genero} · ${proposta.palavras_recomendadas}`;

  // Preenche textos motivadores na coluna lateral
  const containerColetanea = document.getElementById('coletanea-textos-lista');
  containerColetanea.innerHTML = (proposta.textos_motivadores || []).map(t => `
    <div class="texto-mot-item">
      <strong>${t.titulo}</strong>
      <p style="margin:6px 0 0;">${t.conteudo}</p>
      ${t.fonte ? `<div class="texto-mot-fonte">Fonte: ${t.fonte}</div>` : ''}
    </div>
  `).join('');

  // Resumo de Critérios da Banca
  const bancaId = proposta.vestibular_id?.toLowerCase();
  const matriz = criteriosBancas[bancaId] || criteriosBancas.enem;
  const resumoCriterios = document.getElementById('coletanea-criterios-resumo');
  if (resumoCriterios && matriz) {
    resumoCriterios.innerHTML = `
      <strong>Critérios Oficiais (${matriz.nome}):</strong>
      <div style="margin-top:4px;">Nota Máxima: <strong>${matriz.pontuacao_maxima} pontos</strong></div>
      <div>Extensão: <strong>${matriz.limite_linhas}</strong></div>
    `;
  }

  // Restaura rascunho anterior se existir
  const textarea = document.getElementById('redacao-texto-input');
  const draftSalvo = localStorage.getItem(getDraftKey(sessionUserId, proposta.id));
  if (draftSalvo) {
    textarea.value = draftSalvo;
  } else {
    textarea.value = '';
  }

  atualizarContadores();
  iniciarCronometro();
}

function iniciarCronometro() {
  pararCronometro();
  timerSegundos = 0;
  timerPausado = false;
  atualizarDisplayCronometro();

  timerInterval = setInterval(() => {
    if (!timerPausado) {
      timerSegundos++;
      atualizarDisplayCronometro();
    }
  }, 1000);
}

function pararCronometro() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function atualizarDisplayCronometro() {
  const el = document.getElementById('cronometro-display');
  if (!el) return;
  const h = String(Math.floor(timerSegundos / 3600)).padStart(2, '0');
  const m = String(Math.floor((timerSegundos % 3600) / 60)).padStart(2, '0');
  const s = String(timerSegundos % 60).padStart(2, '0');
  el.textContent = `${h}:${m}:${s}`;
}

function atualizarContadores() {
  const textarea = document.getElementById('redacao-texto-input');
  const texto = textarea.value.trim();

  const palavras = texto.length > 0 ? texto.split(/\s+/).filter(Boolean).length : 0;
  const caracteres = texto.length;
  // Média padrão para vestibular: ~9 a 10 palavras por linha manuscrita
  const linhasEstimadas = Math.ceil(palavras / 10);

  document.getElementById('contador-palavras').textContent = `${palavras} palavras`;
  document.getElementById('contador-caracteres').textContent = `${caracteres} caracteres`;
  document.getElementById('contador-linhas').textContent = `~${linhasEstimadas} linhas`;
}

function salvarRascunho() {
  if (!propostaAtiva) return;
  const textarea = document.getElementById('redacao-texto-input');
  const texto = textarea.value;
  localStorage.setItem(getDraftKey(sessionUserId, propostaAtiva.id), texto);

  const statusEl = document.getElementById('autosave-status');
  if (statusEl) {
    statusEl.textContent = '✓ Rascunho salvo!';
    statusEl.style.color = '#22c55e';
    setTimeout(() => {
      statusEl.textContent = '✓ Rascunho seguro';
    }, 2000);
  }
}

let finalizandoEmAndamento = false;

async function finalizarRedacao() {
  if (!propostaAtiva || finalizandoEmAndamento) return;
  const textarea = document.getElementById('redacao-texto-input');
  const texto = textarea.value.trim();

  const palavras = texto.length > 0 ? texto.split(/\s+/).filter(Boolean).length : 0;
  if (palavras < 30) {
    alert('Sua redação parece curta demais para ser finalizada (mínimo recomendado de 30 palavras para análise).');
    return;
  }

  const confirmou = confirm(`Deseja concluir a redação "${propostaAtiva.titulo}" (${palavras} palavras)?`);
  if (!confirmou) return;

  finalizandoEmAndamento = true;
  const btnFinalizar = document.getElementById('btn-finalizar-redacao');
  if (btnFinalizar) {
    btnFinalizar.disabled = true;
    btnFinalizar.textContent = 'Finalizando... ⏳';
  }

  pararCronometro();

  const duracaoMinutos = Math.max(1, Math.round(timerSegundos / 60));
  const agoraIso = new Date().toISOString();

  const bancaId = propostaAtiva.vestibular_id?.toLowerCase();
  const matriz = criteriosBancas[bancaId] || criteriosBancas.enem;

  const redacaoObj = {
    id: `red-${Date.now()}`,
    proposta_id: propostaAtiva.id,
    proposta_titulo: propostaAtiva.titulo,
    vestibular_id: propostaAtiva.vestibular_id,
    vestibular_nome: propostaAtiva.vestibular_nome,
    tipo_genero: propostaAtiva.tipo_genero,
    texto: texto,
    palavras: palavras,
    caracteres: texto.length,
    tempo_segundos: timerSegundos,
    tempo_formatado: document.getElementById('cronometro-display')?.textContent || '00:00:00',
    data_envio: agoraIso,
    status: 'aguardando_correcao', // Transparência: sem nota inventada antes de correção
    matriz_criterios: matriz
  };

  // Salva no histórico do usuário
  salvarNoHistoricoLocal(sessionUserId, redacaoObj);

  // Remove rascunho temporário
  localStorage.removeItem(getDraftKey(sessionUserId, propostaAtiva.id));

  // Registra sessão de estudo no Supabase se logado
  if (sessionUserId) {
    try {
      await supabase.from('sessoes_estudo').insert({
        user_id: sessionUserId,
        materia_id: null,
        tipo: 'redacao',
        duracao_minutos: duracaoMinutos
      });
    } catch (err) {
      console.warn('[redacao] Falha ao registrar sessao_estudo no Supabase:', err);
    }

    try {
      await supabase.from('redacoes').insert({
        user_id: sessionUserId,
        proposta_id: propostaAtiva.id,
        titulo_proposta: propostaAtiva.titulo,
        banca: propostaAtiva.vestibular_id,
        ano: propostaAtiva.ano || null,
        texto: texto,
        palavras: palavras,
        caracteres: texto.length,
        linhas: Math.ceil(palavras / 10),
        tempo_segundos: timerSegundos,
        status: 'aguardando_correcao'
      });
    } catch (err) {
      console.warn('[redacao] Falha ao salvar redação na tabela public.redacoes:', err);
    }
  }

  alert('🎉 Redação finalizada e salva com sucesso no seu histórico!');

  // Oculta aba do editor e navega para o histórico
  document.getElementById('tab-btn-editor').style.display = 'none';
  if (btnFinalizar) {
    btnFinalizar.disabled = false;
    btnFinalizar.textContent = 'Finalizar Redação ✓';
  }
  finalizandoEmAndamento = false;
  propostaAtiva = null;
  renderizarHero();
  atualizarContadorHistorico();
  document.getElementById('tab-btn-historico').click();
}

// ================================================================
// HISTÓRICO E DETALHES DE REDAÇÕES
// ================================================================
function atualizarContadorHistorico() {
  const historico = lerHistoricoLocal(sessionUserId);
  const countEl = document.getElementById('count-historico');
  if (countEl) countEl.textContent = historico.length;
}

function renderizarHistorico() {
  const container = document.getElementById('historico-lista');
  if (!container) return;

  const historico = lerHistoricoLocal(sessionUserId);

  if (historico.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-secondary); background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl);">
        <span style="font-size:3rem; display:block; margin-bottom:12px;">✍️</span>
        <h3 style="font-size:1.25rem; color:var(--text-primary); margin-bottom:6px;">Sua jornada de redação começa aqui</h3>
        <p style="font-size:0.9rem; max-width:440px; margin:0 auto 20px;">
          Você ainda não produziu nenhuma redação. Escolha uma proposta orientada pela sua banca e comece seu primeiro texto.
        </p>
        <button class="btn btn-primary" onclick="document.getElementById('tab-btn-propostas').click()">
          Escolher uma Proposta 🚀
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = historico.map(r => {
    const dataFmt = new Date(r.data_envio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `
      <div class="redacao-historico-card">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span class="banca-tag">${escapeHtml(r.vestibular_nome)}</span>
            <span style="font-size:0.78rem; color:var(--text-secondary);">Enviada em ${escapeHtml(dataFmt)}</span>
          </div>
          <h3 style="font-size:1.05rem; margin:0 0 6px; font-weight:700;">${escapeHtml(r.proposta_titulo)}</h3>
          <div style="font-size:0.8rem; color:var(--text-secondary); display:flex; gap:12px; flex-wrap:wrap;">
            <span>📝 ${r.palavras} palavras</span>
            <span>·</span>
            <span>⏱️ ${escapeHtml(r.tempo_formatado)}</span>
            <span>·</span>
            <span style="color:#f59e0b; font-weight:600;">Aguardando correção da banca</span>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <button class="btn btn-secondary btn-ver-redacao" data-id="${r.id}" style="font-size:0.82rem; padding:8px 16px;">
            Ver Texto & Critérios 📄
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-ver-redacao').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      abrirModalDetalhesRedacao(id);
    });
  });
}

function abrirModalDetalhesRedacao(redacaoId) {
  const historico = lerHistoricoLocal(sessionUserId);
  const r = historico.find(item => item.id === redacaoId);
  if (!r) return;

  const modal = document.getElementById('modal-correcao-overlay');
  const conteudo = document.getElementById('modal-correcao-conteudo');

  const matriz = r.matriz_criterios || criteriosBancas[r.vestibular_id?.toLowerCase()] || criteriosBancas.enem;

  conteudo.innerHTML = `
    <div style="margin-bottom:16px;">
      <span class="banca-tag">${escapeHtml(r.vestibular_nome)}</span>
      <h3 style="font-size:1.15rem; margin:8px 0 4px; font-family:var(--font-display);">${escapeHtml(r.proposta_titulo)}</h3>
      <div style="font-size:0.8rem; color:var(--text-secondary);">
        Extensão: ${r.palavras} palavras · Tempo de escrita: ${escapeHtml(r.tempo_formatado)}
      </div>
    </div>

    <!-- Texto do Aluno -->
    <div style="margin-bottom:20px;">
      <h4 style="font-size:0.9rem; margin-bottom:8px; color:var(--text-secondary);">Seu Texto Redigido:</h4>
      <div id="modal-detalhe-texto-aluno" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:16px 18px; font-size:0.95rem; line-height:1.75; white-space:pre-wrap; max-height:260px; overflow-y:auto; color:var(--text-primary);"></div>
    </div>

    <!-- Matriz de Critérios Oficiais da Banca -->
    <div style="background:rgba(124,58,237,0.08); border:1px solid rgba(124,58,237,0.2); border-radius:var(--radius-md); padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <strong style="font-size:0.92rem; color:var(--color-primary-400);">
          Critérios de Avaliação (${matriz.nome})
        </strong>
        <span style="font-size:0.8rem; font-weight:700;">Máx: ${matriz.pontuacao_maxima} pts</span>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        ${(matriz.competencias || []).map(c => `
          <div style="background:var(--bg-elevated); padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.84rem;">
            <div style="display:flex; justify-content:space-between; font-weight:700; margin-bottom:2px;">
              <span>Competência ${c.numero}: ${c.nome}</span>
              <span style="color:var(--color-primary-400);">Até ${c.peso} pts</span>
            </div>
            <p style="margin:0; font-size:0.78rem; color:var(--text-secondary); line-height:1.4;">${c.descricao}</p>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="margin-top:18px; font-size:0.82rem; color:var(--text-secondary); text-align:center;">
      💡 Esta redação está registrada no seu portfólio. As competências acima orientam sua autoavaliação e correções futuras.
    </div>
  `;

  const elTexto = document.getElementById('modal-detalhe-texto-aluno');
  if (elTexto) elTexto.textContent = r.texto || '';

  modal.classList.add('open');
}

// ================================================================
// EVENTOS GERAIS DA UI
// ================================================================
function configurarEventosUI() {
  // Abas
  const tabPropostas = document.getElementById('tab-btn-propostas');
  const tabEditor = document.getElementById('tab-btn-editor');
  const tabHistorico = document.getElementById('tab-btn-historico');

  const abaPropostas = document.getElementById('aba-propostas');
  const abaEditor = document.getElementById('aba-editor');
  const abaHistorico = document.getElementById('aba-historico');

  tabPropostas?.addEventListener('click', () => {
    tabPropostas.classList.add('active');
    tabEditor?.classList.remove('active');
    tabHistorico?.classList.remove('active');
    abaPropostas.style.display = 'block';
    abaEditor.style.display = 'none';
    abaHistorico.style.display = 'none';
  });

  tabEditor?.addEventListener('click', () => {
    tabEditor.classList.add('active');
    tabPropostas?.classList.remove('active');
    tabHistorico?.classList.remove('active');
    abaEditor.style.display = 'flex';
    abaPropostas.style.display = 'none';
    abaHistorico.style.display = 'none';
  });

  tabHistorico?.addEventListener('click', () => {
    tabHistorico.classList.add('active');
    tabPropostas?.classList.remove('active');
    tabEditor?.classList.remove('active');
    abaHistorico.style.display = 'flex';
    abaPropostas.style.display = 'none';
    abaEditor.style.display = 'none';
    renderizarHistorico();
  });

  // Filtros por Banca
  const chipsBancas = document.querySelectorAll('#filtros-bancas .chip-banca');
  chipsBancas.forEach(chip => {
    chip.addEventListener('click', () => {
      chipsBancas.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      aplicarFiltros();
    });
  });

  // Filtros por Tipo (Oficial vs Treino)
  const chipsTipos = document.querySelectorAll('#filtros-tipos .chip-banca');
  chipsTipos.forEach(chip => {
    chip.addEventListener('click', () => {
      chipsTipos.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      aplicarFiltros();
    });
  });

  // Botão Limpar Filtros
  const btnLimpar = document.getElementById('btn-limpar-filtros');
  btnLimpar?.addEventListener('click', () => {
    chipsBancas.forEach(c => c.classList.remove('active'));
    document.querySelector('#filtros-bancas .chip-banca[data-banca="todas"]')?.classList.add('active');

    chipsTipos.forEach(c => c.classList.remove('active'));
    document.querySelector('#filtros-tipos .chip-banca[data-tipo="todos"]')?.classList.add('active');

    if (inputBusca) inputBusca.value = '';
    aplicarFiltros();
  });

  // Busca Textual de Propostas
  const inputBusca = document.getElementById('busca-proposta-input');
  inputBusca?.addEventListener('input', () => {
    aplicarFiltros();
  });

  function aplicarFiltros() {
    const bancaAtiva = document.querySelector('#filtros-bancas .chip-banca.active')?.dataset.banca || 'todas';
    const tipoAtivo = document.querySelector('#filtros-tipos .chip-banca.active')?.dataset.tipo || 'todos';
    const termo = (inputBusca?.value || '').toLowerCase().trim();

    let filtradas = propostasLista;

    if (bancaAtiva !== 'todas') {
      filtradas = filtradas.filter(p => p.vestibular_id?.toLowerCase() === bancaAtiva);
    }

    if (tipoAtivo === 'oficial') {
      filtradas = filtradas.filter(p => p.edicao_oficial === true);
    } else if (tipoAtivo === 'treino') {
      filtradas = filtradas.filter(p => p.edicao_oficial === false);
    }

    if (termo.length > 0) {
      filtradas = filtradas.filter(p =>
        p.titulo.toLowerCase().includes(termo) ||
        p.categoria.toLowerCase().includes(termo) ||
        p.vestibular_nome.toLowerCase().includes(termo)
      );
    }

    const filtrosAtivos = bancaAtiva !== 'todas' || tipoAtivo !== 'todos' || termo.length > 0;
    if (btnLimpar) {
      btnLimpar.style.display = filtrosAtivos ? 'inline-flex' : 'none';
    }

    renderizarPropostas(filtradas);
  }

  // Eventos do Textarea
  const textarea = document.getElementById('redacao-texto-input');
  let autosaveTimeout = null;
  textarea?.addEventListener('input', () => {
    atualizarContadores();
    clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(() => {
      salvarRascunho();
    }, 1200);
  });

  // Botões do Editor
  document.getElementById('btn-toggle-cronometro')?.addEventListener('click', () => {
    timerPausado = !timerPausado;
    const btn = document.getElementById('btn-toggle-cronometro');
    if (btn) btn.textContent = timerPausado ? '▶️' : '⏸️';
  });

  document.getElementById('btn-salvar-rascunho')?.addEventListener('click', salvarRascunho);
  document.getElementById('btn-descartar-rascunho')?.addEventListener('click', () => {
    if (!propostaAtiva) return;
    const confirmou = confirm('Descartar o rascunho desta redação? Esta ação não pode ser desfeita.');
    if (!confirmou) return;

    localStorage.removeItem(getDraftKey(sessionUserId, propostaAtiva.id));
    pararCronometro();
    document.getElementById('tab-btn-editor').style.display = 'none';
    propostaAtiva = null;
    renderizarHero();
    atualizarContadorHistorico();
    document.getElementById('tab-btn-propostas').click();
  });
  document.getElementById('btn-finalizar-redacao')?.addEventListener('click', finalizarRedacao);

  // Modais Close
  document.getElementById('modal-proposta-close')?.addEventListener('click', () => {
    document.getElementById('modal-proposta-overlay')?.classList.remove('open');
  });
  document.getElementById('modal-btn-cancelar')?.addEventListener('click', () => {
    document.getElementById('modal-proposta-overlay')?.classList.remove('open');
  });

  document.getElementById('modal-correcao-close')?.addEventListener('click', () => {
    document.getElementById('modal-correcao-overlay')?.classList.remove('open');
  });
}

iniciar();
