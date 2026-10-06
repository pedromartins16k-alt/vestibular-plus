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

function lerRascunho(userId, propostaId) {
  try {
    const raw = localStorage.getItem(getDraftKey(userId, propostaId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.texto === 'string') {
        return {
          texto: parsed.texto,
          tempo_segundos: Number(parsed.tempo_segundos) || 0
        };
      }
    } catch (_) {
      // Compatibilidade: rascunho salvo em versões anteriores como string simples de texto
    }
    return {
      texto: String(raw),
      tempo_segundos: 0
    };
  } catch (_) {
    return null;
  }
}

function salvarRascunhoStorage(userId, propostaId, texto, tempoSegundos) {
  try {
    const payload = JSON.stringify({
      texto: texto || '',
      tempo_segundos: Number(tempoSegundos) || 0,
      atualizado_em: new Date().toISOString()
    });
    localStorage.setItem(getDraftKey(userId, propostaId), payload);
  } catch (_) {}
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

function normalizarRedacaoBanco(row) {
  const bancaId = row.vestibular_id?.toLowerCase();
  const matriz = criteriosBancas[bancaId] || criteriosBancas.enem;
  const tempoSegundos = Number(row.tempo_segundos) || 0;
  const horas = Math.floor(tempoSegundos / 3600).toString().padStart(2, '0');
  const minutos = Math.floor((tempoSegundos % 3600) / 60).toString().padStart(2, '0');
  const segs = (tempoSegundos % 60).toString().padStart(2, '0');

  return {
    id: row.id,
    proposta_id: row.proposta_id,
    proposta_titulo: row.titulo,
    vestibular_id: row.vestibular_id,
    vestibular_nome: row.vestibular_id ? row.vestibular_id.toUpperCase() : 'Vestibular',
    tipo_genero: 'Dissertativo-argumentativo',
    texto: row.conteudo,
    palavras: row.total_palavras,
    caracteres: row.total_caracteres,
    linhas: row.total_linhas,
    tempo_segundos: tempoSegundos,
    tempo_formatado: `${horas}:${minutos}:${segs}`,
    data_envio: row.finalizada_em || row.created_at,
    status: row.status || 'aguardando_correcao',
    matriz_criterios: matriz
  };
}

async function carregarHistoricoSupabase() {
  if (!sessionUserId) return;
  try {
    const { data, error } = await supabase
      .from('redacoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[redacao] Não foi possível buscar redações no Supabase:', error.message);
      return;
    }

    if (data && data.length > 0) {
      const historicoAtual = lerHistoricoLocal(sessionUserId);
      const mapaLocal = new Map(historicoAtual.map(h => [h.id, h]));

      data.forEach(row => {
        const normalizado = normalizarRedacaoBanco(row);
        if (mapaLocal.has(row.id)) {
          // Atualiza dados vindos do banco mas preserva avaliacao_ia local se banco não tem
          const local = mapaLocal.get(row.id);
          mapaLocal.set(row.id, { ...local, ...normalizado, avaliacao_ia: local.avaliacao_ia || normalizado.avaliacao_ia });
        } else {
          mapaLocal.set(row.id, normalizado);
        }
      });

      const historicoAtualizado = Array.from(mapaLocal.values());
      // Ordena por data decrescente
      historicoAtualizado.sort((a, b) => new Date(b.data_envio) - new Date(a.data_envio));
      localStorage.setItem(getHistoricoKey(sessionUserId), JSON.stringify(historicoAtualizado));
    }

    // Consulta defensiva de avaliações salvas no Supabase (se a tabela redacao_avaliacoes já existir)
    try {
      const { data: avaliacoes, error: errAvaliacoes } = await supabase
        .from('redacao_avaliacoes')
        .select('*')
        .eq('user_id', sessionUserId)
        .order('criado_em', { ascending: false });

      if (errAvaliacoes) {
        // Loga detalhadamente para diagnóstico se a tabela ainda não existir (404/400) ou RLS
        console.info(
          `[redacao] Tabela 'redacao_avaliacoes' não sincronizada (${errAvaliacoes.code || errAvaliacoes.message}). Gravação em banco pendente da migration no Supabase.`
        );
      } else if (avaliacoes && avaliacoes.length > 0) {
        const historicoAtual = lerHistoricoLocal(sessionUserId);
        
        // Agrupa todas as avaliações por redacao_id ordenadas por criado_em desc
        const mapaTodasAvaliacoes = new Map();
        avaliacoes.forEach(av => {
          if (!mapaTodasAvaliacoes.has(av.redacao_id)) {
            mapaTodasAvaliacoes.set(av.redacao_id, []);
          }
          mapaTodasAvaliacoes.get(av.redacao_id).push(av);
        });

        function formatarItemAvaliacao(av) {
          return {
            nota_total: Number(av.nota_total),
            nota_maxima: Number(av.nota_maxima) || 1000,
            competencias: av.competencias || av.criterios_detalhe || [],
            pontos_fortes: av.pontos_fortes || [],
            pontos_melhoria: av.pontos_melhoria || [],
            exemplos_trechos: av.exemplos_trechos || [],
            sugestoes: av.sugestoes || [],
            prioridades_estudo: av.prioridades_estudo || [],
            feedback_geral: av.feedback_geral || '',
            modelo_utilizado: av.modelo_ia || 'ia',
            corrigido_em: av.criado_em,
            persistido_no_banco: true
          };
        }

        let houveAtualizacao = false;
        historicoAtual.forEach(r => {
          if (mapaTodasAvaliacoes.has(r.id)) {
            const lista = mapaTodasAvaliacoes.get(r.id);
            // A mais recente é a avaliação ativa
            r.avaliacao_ia = formatarItemAvaliacao(lista[0]);
            // As demais são o histórico de avaliações passadas
            r.historico_avaliacoes = lista.slice(1).map(formatarItemAvaliacao);
            r.status = 'corrigida_por_ia';
            houveAtualizacao = true;
          }
        });

        if (houveAtualizacao) {
          localStorage.setItem(getHistoricoKey(sessionUserId), JSON.stringify(historicoAtual));
        }
      }
    } catch (eCatch) {
      console.info('[redacao] Consulta de avaliações postergada (migration de redacao_avaliacoes ainda não aplicada).');
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

  // Restaura rascunho anterior se existir (texto e tempo)
  const textarea = document.getElementById('redacao-texto-input');
  const draft = lerRascunho(sessionUserId, proposta.id);
  if (draft) {
    textarea.value = draft.texto || '';
    timerSegundos = Number(draft.tempo_segundos) || 0;
  } else {
    textarea.value = '';
    timerSegundos = 0;
  }

  atualizarContadores();
  iniciarCronometro();
}

function iniciarCronometro() {
  pararCronometro();
  timerPausado = false;
  atualizarDisplayCronometro();

  timerInterval = setInterval(() => {
    if (!timerPausado) {
      timerSegundos++;
      atualizarDisplayCronometro();
      // Salva tempo decorrido no rascunho a cada 5 segundos se houver proposta ativa
      if (timerSegundos % 5 === 0 && propostaAtiva) {
        const textarea = document.getElementById('redacao-texto-input');
        salvarRascunhoStorage(sessionUserId, propostaAtiva.id, textarea ? textarea.value : '', timerSegundos);
      }
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

// Elemento espelho (mirror) invisível para calcular exatamente as linhas visuais ocupadas
let mirrorLinhasEl = null;

function obterOuCriarMirror(textarea) {
  if (!mirrorLinhasEl) {
    mirrorLinhasEl = document.createElement('div');
    mirrorLinhasEl.id = 'redacao-textarea-mirror';
    mirrorLinhasEl.setAttribute('aria-hidden', 'true');
    // Posicionamento fora da tela visível
    mirrorLinhasEl.style.position = 'absolute';
    mirrorLinhasEl.style.top = '-99999px';
    mirrorLinhasEl.style.left = '-99999px';
    mirrorLinhasEl.style.visibility = 'hidden';
    mirrorLinhasEl.style.pointerEvents = 'none';
    mirrorLinhasEl.style.zIndex = '-1';
    document.body.appendChild(mirrorLinhasEl);
  }

  const cs = window.getComputedStyle(textarea);
  mirrorLinhasEl.style.fontFamily = cs.fontFamily;
  mirrorLinhasEl.style.fontSize = cs.fontSize;
  mirrorLinhasEl.style.fontWeight = cs.fontWeight;
  mirrorLinhasEl.style.letterSpacing = cs.letterSpacing;
  mirrorLinhasEl.style.lineHeight = cs.lineHeight;
  mirrorLinhasEl.style.paddingLeft = cs.paddingLeft;
  mirrorLinhasEl.style.paddingRight = cs.paddingRight;
  mirrorLinhasEl.style.paddingTop = '0px';
  mirrorLinhasEl.style.paddingBottom = '0px';
  mirrorLinhasEl.style.borderLeft = cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' transparent';
  mirrorLinhasEl.style.borderRight = cs.borderRightWidth + ' ' + cs.borderRightStyle + ' transparent';
  mirrorLinhasEl.style.boxSizing = cs.boxSizing;
  mirrorLinhasEl.style.whiteSpace = 'pre-wrap';
  mirrorLinhasEl.style.wordWrap = 'break-word';
  mirrorLinhasEl.style.overflowWrap = 'break-word';
  mirrorLinhasEl.style.width = `${textarea.clientWidth}px`;

  return { mirror: mirrorLinhasEl, computed: cs };
}

function calcularLinhasVisuais(textarea) {
  if (!textarea) return 0;
  const texto = textarea.value;
  if (!texto || texto.trim().length === 0) return 0;

  try {
    const { mirror, computed } = obterOuCriarMirror(textarea);

    // Mede a altura de 1 linha de referência
    mirror.textContent = 'M';
    const alturaUmaLinha = mirror.getBoundingClientRect().height;

    // Define altura da linha com fallback computado
    let lineHeight = parseFloat(computed.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) {
      lineHeight = alturaUmaLinha > 0 ? alturaUmaLinha : 24;
    }

    // Alimenta com o texto completo digitado
    // Adiciona quebra invisível no final caso termine com \n para capturar linha em branco
    mirror.textContent = texto.endsWith('\n') ? texto + ' ' : texto;
    const alturaTotal = mirror.getBoundingClientRect().height;

    const linhas = Math.max(1, Math.round(alturaTotal / lineHeight));
    return linhas;
  } catch (_) {
    // Fallback defensivo
    const linhasQuebra = texto.split('\n').length;
    const palavras = texto.split(/\s+/).filter(Boolean).length;
    return Math.max(linhasQuebra, Math.ceil(palavras / 10));
  }
}

function atualizarContadores() {
  const textarea = document.getElementById('redacao-texto-input');
  if (!textarea) return;
  const texto = textarea.value;

  const palavras = texto.length > 0 ? texto.trim().split(/\s+/).filter(Boolean).length : 0;
  const caracteres = texto.length;
  const linhasVisuais = calcularLinhasVisuais(textarea);

  const elPalavras = document.getElementById('contador-palavras');
  const elCaracteres = document.getElementById('contador-caracteres');
  const elLinhas = document.getElementById('contador-linhas');

  if (elPalavras) elPalavras.textContent = `${palavras} palavra${palavras === 1 ? '' : 's'}`;
  if (elCaracteres) elCaracteres.textContent = `${caracteres} caractere${caracteres === 1 ? '' : 's'}`;
  if (elLinhas) elLinhas.textContent = `~${linhasVisuais} linha${linhasVisuais === 1 ? '' : 's'}`;
}

function salvarRascunho() {
  if (!propostaAtiva) return;
  const textarea = document.getElementById('redacao-texto-input');
  const texto = textarea ? textarea.value : '';
  salvarRascunhoStorage(sessionUserId, propostaAtiva.id, texto, timerSegundos);

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

  // Verifica autenticação se for salvar no Supabase
  const { data: { session } } = await supabase.auth.getSession();
  const currentUserId = session?.user?.id || sessionUserId;

  if (!currentUserId) {
    if (btnFinalizar) {
      btnFinalizar.disabled = false;
      btnFinalizar.textContent = 'Finalizar Redação ✓';
    }
    finalizandoEmAndamento = false;
    alert('⚠️ É necessário entrar na sua conta para salvar e finalizar a redação.');
    return;
  }

  pararCronometro();

  const duracaoMinutos = Math.max(1, Math.round(timerSegundos / 60));
  const agoraIso = new Date().toISOString();
  const totalLinhas = Math.max(1, calcularLinhasVisuais(textarea));
  const vestibularId = propostaAtiva.vestibular_id?.toLowerCase() || 'enem';

  // 1. Inserção no Supabase com o schema real da tabela public.redacoes
  let insertId = null;
  try {
    const { data: inserted, error: insertError } = await supabase
      .from('redacoes')
      .insert({
        user_id: currentUserId,
        proposta_id: propostaAtiva.id,
        titulo: propostaAtiva.titulo,
        vestibular_id: vestibularId,
        conteudo: texto,
        total_palavras: palavras,
        total_caracteres: texto.length,
        total_linhas: totalLinhas,
        tempo_segundos: timerSegundos,
        status: 'aguardando_correcao',
        finalizada_em: agoraIso
      })
      .select('id')
      .single();

    if (insertError) {
      throw insertError;
    }
    insertId = inserted?.id;
  } catch (err) {
    console.error('[redacao] Erro ao salvar redação em public.redacoes:', err);
    if (btnFinalizar) {
      btnFinalizar.disabled = false;
      btnFinalizar.textContent = 'Finalizar Redação ✓';
    }
    finalizandoEmAndamento = false;
    alert('❌ Ocorreu um erro ao salvar sua redação no servidor. Seu rascunho continua seguro no editor para você tentar novamente.');
    return;
  }

  // 2. Registra sessão de estudo em sessoes_estudo
  try {
    await supabase.from('sessoes_estudo').insert({
      user_id: currentUserId,
      materia_id: null,
      tipo: 'redacao',
      duracao_minutos: duracaoMinutos
    });
  } catch (err) {
    console.warn('[redacao] Falha ao registrar sessao_estudo no Supabase:', err);
  }

  // 3. Sucesso confirmado: Salva no histórico local e limpa o draft
  const bancaId = propostaAtiva.vestibular_id?.toLowerCase();
  const matriz = criteriosBancas[bancaId] || criteriosBancas.enem;
  const redacaoObj = {
    id: insertId || `red-${Date.now()}`,
    proposta_id: propostaAtiva.id,
    proposta_titulo: propostaAtiva.titulo,
    vestibular_id: vestibularId,
    vestibular_nome: propostaAtiva.vestibular_nome,
    tipo_genero: propostaAtiva.tipo_genero,
    texto: texto,
    palavras: palavras,
    caracteres: texto.length,
    linhas: totalLinhas,
    tempo_segundos: timerSegundos,
    tempo_formatado: document.getElementById('cronometro-display')?.textContent || '00:00:00',
    data_envio: agoraIso,
    status: 'aguardando_correcao',
    matriz_criterios: matriz
  };

  salvarNoHistoricoLocal(currentUserId, redacaoObj);
  localStorage.removeItem(getDraftKey(currentUserId, propostaAtiva.id));

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

  if (!sessionUserId) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-secondary); background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl);">
        <span style="font-size:3rem; display:block; margin-bottom:12px;">🔒</span>
        <h3 style="font-size:1.25rem; color:var(--text-primary); margin-bottom:6px;">Acesso restrito ao seu portfólio</h3>
        <p style="font-size:0.9rem; max-width:440px; margin:0 auto 20px;">
          Para salvar redações com segurança, acompanhar seu histórico e visualizar correções da banca, entre na sua conta do Vestibular+.
        </p>
        <a class="btn btn-primary" href="./login.html">
          Fazer Login no Vestibular+ →
        </a>
      </div>
    `;
    return;
  }

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

  // Identifica variação em relação à redação avaliada imediatamente anterior
  const avaliadas = historico.filter(r => r.avaliacao_ia && typeof r.avaliacao_ia.nota_total === 'number');

  container.innerHTML = historico.map(r => {
    const dataFmt = new Date(r.data_envio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const temAvaliacao = Boolean(r.avaliacao_ia);
    const notaTotal = r.avaliacao_ia?.nota_total;
    const notaMax = r.avaliacao_ia?.nota_maxima || 1000;

    // Variação em relação à anterior
    let variacaoBadge = '';
    if (temAvaliacao) {
      const idx = avaliadas.findIndex(a => a.id === r.id);
      if (idx !== -1 && idx < avaliadas.length - 1) {
        const anterior = avaliadas[idx + 1];
        const diff = notaTotal - anterior.avaliacao_ia.nota_total;
        if (diff > 0) {
          variacaoBadge = `<span style="font-size:0.7rem; font-weight:800; color:#22c55e; background:rgba(34,197,94,0.12); padding:2px 8px; border-radius:var(--radius-full);">+${diff} pts ↑</span>`;
        } else if (diff < 0) {
          variacaoBadge = `<span style="font-size:0.7rem; font-weight:800; color:#ef4444; background:rgba(239,68,68,0.12); padding:2px 8px; border-radius:var(--radius-full);">${diff} pts ↓</span>`;
        } else {
          variacaoBadge = `<span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:var(--radius-full);">= manteve</span>`;
        }
      }
    }

    return `
      <div class="redacao-historico-card">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
            <span class="banca-tag">${escapeHtml(r.vestibular_nome)}</span>
            <span style="font-size:0.78rem; color:var(--text-secondary);">Enviada em ${escapeHtml(dataFmt)}</span>
            ${temAvaliacao ? `
              <span style="font-size:0.72rem; font-weight:800; background:rgba(34,197,94,0.14); color:#22c55e; border:1px solid rgba(34,197,94,0.3); padding:2px 8px; border-radius:var(--radius-full);">
                ✨ Corrigida por IA
              </span>
            ` : ''}
            ${variacaoBadge}
          </div>
          <h3 style="font-size:1.05rem; margin:0 0 6px; font-weight:700;">${escapeHtml(r.proposta_titulo)}</h3>
          <div style="font-size:0.8rem; color:var(--text-secondary); display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <span>📝 ${r.palavras} palavras</span>
            <span>·</span>
            <span>⏱️ ${escapeHtml(r.tempo_formatado)}</span>
            <span>·</span>
            ${temAvaliacao ? `
              <span style="color:#22c55e; font-weight:800;">🎯 Nota: ${notaTotal} / ${notaMax}</span>
            ` : `
              <span style="color:#f59e0b; font-weight:600;">Aguardando correção</span>
            `}
          </div>
          ${temAvaliacao && Array.isArray(r.avaliacao_ia?.competencias) && r.avaliacao_ia.competencias.length > 0 ? `
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">
              ${r.avaliacao_ia.competencias.map(c => `
                <span style="font-size:0.67rem; font-weight:700; background:rgba(255,255,255,0.05); color:var(--text-secondary); border:1px solid var(--border-color); border-radius:var(--radius-full); padding:1px 6px;">
                  C${c.numero}: ${c.nota}
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <button class="btn ${temAvaliacao ? 'btn-primary' : 'btn-secondary'} btn-ver-redacao" data-id="${r.id}" style="font-size:0.82rem; padding:8px 16px;">
            ${temAvaliacao ? 'Ver Avaliação & Texto ✨' : 'Corrigir com IA ✨'}
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

// ================================================================
// ETAPA 24 & 25 — SISTEMA DE EVOLUÇÃO INTELIGENTE & PROFESSOR IA
// ================================================================

let filtroBancaEvolucao = 'todas';

// ─────────────────────────────────────────────────────────────────
// ETAPA 25: Funções Determinísticas de Blindagem e Auditoria
// ─────────────────────────────────────────────────────────────────

/**
 * Audita uma avaliação ou par de avaliações para verificar inconsistência crítica.
 * Reutiliza os limites oficiais: diferença > 100 total ou > 80 em competência única.
 */
function auditarAvaliacaoInconsistente(av, avAnterior = null) {
  if (!av) return false;
  if (av.avaliacao_inconsistente === true) return true;
  if (av.avaliacao_incompleta === true) return true;
  if (av.discrepancia?.classificacao === 'inconsistente') return true;

  // ETAPA 25.3: Avaliação sem as 5 competências do ENEM é incompleta/inconsistente
  if (!Array.isArray(av.competencias) || av.competencias.length < 5) {
    return true;
  }

  // Verifica se faltam competências ou notas
  for (let i = 0; i < 5; i++) {
    const comp = av.competencias[i];
    if (!comp || typeof comp.nota !== 'number' || isNaN(comp.nota)) {
      return true;
    }
  }

  if (avAnterior && typeof av.nota_total === 'number' && typeof avAnterior.nota_total === 'number') {
    const diffTotal = Math.abs(av.nota_total - avAnterior.nota_total);
    if (diffTotal > 100) return true;

    if (Array.isArray(av.competencias) && Array.isArray(avAnterior.competencias)) {
      for (let i = 0; i < Math.min(av.competencias.length, avAnterior.competencias.length); i++) {
        const nAtual = Number(av.competencias[i]?.nota) || 0;
        const nAnt = Number(avAnterior.competencias[i]?.nota) || 0;
        if (Math.abs(nAtual - nAnt) > 80) return true;
      }
    }
  }

  return false;
}

/**
 * Separa a lista bruta de redações avaliadas entre pedagogicamente válidas e inconsistentes.
 * Preserva o histórico intacto, mas filtra qualquer avaliação que apresente discrepância crítica.
 */
function auditarAvaliacoesRedacao(listaRedacoes) {
  const todasAvaliadas = (listaRedacoes || []).filter(r => r?.avaliacao_ia && typeof r.avaliacao_ia.nota_total === 'number');
  
  // Ordena cronologicamente
  const cronologicas = [...todasAvaliadas].sort((a, b) => new Date(a.data_envio || 0) - new Date(b.data_envio || 0));

  const validas = [];
  const inconsistentes = [];
  let temDiscrepanciaCriticaPar = false;

  cronologicas.forEach((r, idx) => {
    const av = r.avaliacao_ia;
    const anterior = idx > 0 ? cronologicas[idx - 1].avaliacao_ia : null;

    const ehInconsistente = auditarAvaliacaoInconsistente(av, anterior);

    if (ehInconsistente) {
      inconsistentes.push(r);
      temDiscrepanciaCriticaPar = true;
    } else {
      validas.push(r);
    }
  });

  return {
    todas: cronologicas,
    validas,
    inconsistentes,
    temDiscrepanciaCritica: temDiscrepanciaCriticaPar || inconsistentes.length > 0
  };
}

/**
 * Calcula médias válidas das competências C1 a C5
 */
function calcularMediasCompetencias(redacoesValidas) {
  const compsMap = {};
  for (let i = 1; i <= 5; i++) {
    compsMap[i] = { numero: i, soma: 0, count: 0, notas: [], nome: `Competência ${i}` };
  }

  (redacoesValidas || []).forEach(r => {
    const comps = r.avaliacao_ia?.competencias;
    if (Array.isArray(comps)) {
      comps.forEach(c => {
        const num = Number(c.numero);
        if (num >= 1 && num <= 5 && typeof c.nota === 'number') {
          compsMap[num].soma += c.nota;
          compsMap[num].count++;
          compsMap[num].notas.push(c.nota);
          if (c.nome) compsMap[num].nome = c.nome;
        }
      });
    }
  });

  const resultado = [];
  for (let i = 1; i <= 5; i++) {
    const item = compsMap[i];
    const media = item.count > 0 ? Math.round(item.soma / item.count) : null;
    resultado.push({
      numero: i,
      nome: item.nome,
      media,
      count: item.count,
      notas: item.notas
    });
  }

  return resultado;
}

/**
 * Calcula gaps até 200 pontos para cada competência
 */
function calcularGapsCompetencias(mediasComps) {
  return (mediasComps || []).map(c => ({
    numero: c.numero,
    nome: c.nome,
    media: c.media,
    gap: c.media !== null ? Math.max(0, 200 - c.media) : null
  }));
}

/**
 * Determina a competência prioritária de forma determinística:
 * 1. Menor média
 * 2. Maior gap
 * 3. Menor número da competência
 */
function determinarCompetenciaPrioritaria(mediasComps) {
  const comDados = (mediasComps || []).filter(c => c.media !== null);
  if (comDados.length === 0) return null;

  const ordenadas = [...comDados].sort((a, b) => {
    if (a.media !== b.media) return a.media - b.media; // menor média primeiro
    const gapA = 200 - a.media;
    const gapB = 200 - b.media;
    if (gapA !== gapB) return gapB - gapA; // maior gap primeiro
    return a.numero - b.numero; // menor número desempata
  });

  return ordenadas[0];
}

/**
 * Extrai problemas das avaliações válidas identificando ocorrências e recorrências
 */
function extrairProblemasRecorrentes(redacoesValidas, numCompetencia = null) {
  const problemasIdentificados = [];

  (redacoesValidas || []).forEach((r, idxR) => {
    const av = r.avaliacao_ia;
    if (!av) return;
    const redId = r.id || `redacao_${idxR}`;

    const comps = Array.isArray(av.competencias) ? av.competencias : [];
    comps.forEach(c => {
      if (numCompetencia !== null && Number(c.numero) !== Number(numCompetencia)) return;

      const probs = Array.isArray(c.problemas) ? c.problemas : [];
      probs.forEach(p => {
        const desc = typeof p === 'string' ? p : (p?.descricao || p?.mensagem || '');
        if (desc && desc.trim().length > 0) {
          problemasIdentificados.push({
            redacaoId: redId,
            competencia: c.numero,
            descricao: desc.trim(),
            tipo: p?.tipo || c.tipo_apontamento || 'ATENÇÃO',
            trecho: p?.trecho_original || ''
          });
        }
      });

      // Também inspeciona pontos_melhoria se não houver problemas específicos
      if (probs.length === 0 && Array.isArray(av.pontos_melhoria)) {
        av.pontos_melhoria.forEach(pm => {
          if (typeof pm === 'string' && pm.trim().length > 0) {
            problemasIdentificados.push({
              redacaoId: redId,
              competencia: c.numero,
              descricao: pm.trim(),
              tipo: 'ATENÇÃO',
              trecho: ''
            });
          }
        });
      }
    });
  });

  // Agrupa para detectar recorrência REAL (aparece em 2 ou mais avaliações/redações distintas)
  const contagemPorRedacao = {};
  problemasIdentificados.forEach(p => {
    const chave = p.descricao.toLowerCase().slice(0, 40);
    const redId = p.redacaoId || ('red_' + Math.random());
    if (!contagemPorRedacao[chave]) {
      contagemPorRedacao[chave] = { item: p, redacoesSet: new Set([redId]) };
    } else {
      contagemPorRedacao[chave].redacoesSet.add(redId);
    }
  });

  const recorrentes = [];
  const pontosAtencao = [];

  Object.values(contagemPorRedacao).forEach(obj => {
    const ocorrencias = obj.redacoesSet.size;
    if (ocorrencias >= 2) {
      recorrentes.push({ ...obj.item, ocorrencias });
    } else {
      pontosAtencao.push({ ...obj.item, ocorrencias: 1 });
    }
  });

  return {
    todos: problemasIdentificados,
    recorrentes,
    pontosAtencao
  };
}

/**
 * Mapa determinístico entre competência e conteúdos teóricos
 */
function gerarConteudoEstudo(numeroComp) {
  const mapa = {
    1: {
      titulo: 'Domínio da modalidade escrita formal',
      topicos: [
        'Concordância verbal e nominal (casos especiais e sujeito posposto)',
        'Regência verbal e emprego do sinal indicativo de crase',
        'Pontuação e isolamento de orações subordinadas e termos adverbiais',
        'Ortografia e adequação ao registro culto da língua',
        'Construção sintática (evitar truncamento e paralelismo sintático)'
      ]
    },
    2: {
      titulo: 'Compreensão do tema e repertório sociocultural',
      topicos: [
        'Interpretação e delimitação exata do recorte temático (evitar tangenciamento)',
        'Seleção de repertório sociocultural legitimado e produtivo',
        'Articulação orgânica entre repertório e a tese defendida',
        'Estrutura do texto dissertativo-argumentativo em prosa',
        'Construção do projeto de texto estratégico'
      ]
    },
    3: {
      titulo: 'Seleção, organização e interpretação de argumentos',
      topicos: [
        'Elaboração de tese clara e consistente na introdução',
        'Progressão argumentativa entre parágrafos (projeto de texto estratégico)',
        'Aprofundamento de ideias: argumento → explicação → consequência',
        'Relação explícita de cada tópico frasal com a tese central',
        'Eliminação de lacunas argumentativas e generalizações'
      ]
    },
    4: {
      titulo: 'Mecanismos linguísticos de coesão textual',
      topicos: [
        'Emprego variado de conectivos interparágrafos (em primeiro lugar, outrossim)',
        'Elos coesivos intraparágrafos (relações de causa, oposição e finalidade)',
        'Referenciação lexical e sinonímia (evitar repetições de palavras)',
        'Fluidez e harmonia sintática entre períodos compostos'
      ]
    },
    5: {
      titulo: 'Proposta de intervenção social',
      topicos: [
        'Estruturação dos 5 elementos obrigatórios: Agente, Ação, Meio/Modo, Efeito/Finalidade e Detalhamento',
        'Detalhamento qualificado (especificação do meio, explicação da ação ou exemplo concreto)',
        'Coerência e aplicabilidade prática em relação ao problema abordado',
        'Respeito irrestrito aos direitos humanos'
      ]
    }
  };

  return mapa[numeroComp] || {
    titulo: `Competência ${numeroComp}`,
    topicos: ['Prática orientada pela rubrica oficial do ENEM']
  };
}

/**
 * Treino focal acionável por competência
 */
function gerarTreinoFocal(numeroComp) {
  const mapa = {
    1: {
      titulo: 'Reescrita e lapidação da norma-padrão',
      instrucao: 'Reescreva um parágrafo que você já produziu eliminando desvios gramaticais, ajustando concordâncias e aplicando pontuação precisa.',
      exemplo: 'Revise conectivos, pontuação de orações intercaladas e garanta que não haja paralelismo quebrado.',
      botaoTexto: 'Reescrever Parágrafo no Editor ✍️'
    },
    2: {
      titulo: 'Construção de introdução com repertório produtivo',
      instrucao: 'Escreva uma introdução completa apresentando contextualização com repertório legítimo, delimitação do tema e tese com dois argumentos.',
      exemplo: 'Repertório (filósofo, lei, fato histórico) → Vinculação ao tema → Tese explícita.',
      botaoTexto: 'Treinar Introdução no Editor ✍️'
    },
    3: {
      titulo: 'Parágrafo de desenvolvimento com progressão plena',
      instrucao: 'Escreva um parágrafo de desenvolvimento estruturado contendo: Tópico Frasal + Argumento + Explicação Detalhada + Consequência + Vínculo com a Tese.',
      exemplo: 'Afirmação → "Isso ocorre porque..." → "Como consequência..." → "Logo, confirma-se o impacto..."',
      botaoTexto: 'Treinar Desenvolvimento no Editor ✍️'
    },
    4: {
      titulo: 'Articulação lógica e variação de conectivos',
      instrucao: 'Produza ou reescreva um parágrafo conectando todos os períodos com conectores adequados, sem repetições mecânicas.',
      exemplo: 'Intercale elos de causa ("haja vista que"), consequência ("por conseguinte") e adversidade ("todavia").',
      botaoTexto: 'Treinar Coesão no Editor ✍️'
    },
    5: {
      titulo: 'Proposta de intervenção completa com os 5 elementos',
      instrucao: 'Escreva uma proposta de intervenção para a conclusão contendo com clareza: Agente, Ação, Meio/Modo, Finalidade e 1 Detalhamento explicativo.',
      exemplo: 'Ministério X (Agente) deve criar Y (Ação), por meio de Z (Modo), com o intuito de W (Finalidade), com detalhamento explícito.',
      botaoTexto: 'Treinar Proposta de Intervenção ✍️'
    }
  };

  return mapa[numeroComp] || {
    titulo: 'Treino de produção textual',
    instrucao: 'Produza uma redação completa focando nos critérios avaliativos da banca.',
    exemplo: 'Pratique com tempo cronometrado.',
    botaoTexto: 'Iniciar Treino no Editor ✍️'
  };
}

/**
 * Próxima meta segura calculada em degraus progressivos de 40 pontos
 */
function calcularProximaMeta(mediaAtual, notaMaxima = 200) {
  if (mediaAtual === null || typeof mediaAtual !== 'number') return null;
  if (mediaAtual >= notaMaxima) return notaMaxima;

  // Próximo degrau múltiplo de 40 estritamente maior que a média atual
  const proximoDegrau = Math.ceil((mediaAtual + 1) / 40) * 40;
  return Math.min(notaMaxima, proximoDegrau);
}

/**
 * Checklist prático de autoavaliação por competência
 */
function gerarChecklist(numeroComp) {
  const mapa = {
    1: [
      'Revisei concordâncias verbais e nominais em todos os períodos?',
      'Utilizei vírgulas corretamente para isolar termos explicativos e orações subordinadas?',
      'Evitei períodos longos demais ou truncamento sintático?',
      'Acentuei e grafou todas as palavras no padrão culto?',
      'O vocabulário é formal, claro e sem gírias ou clichês?'
    ],
    2: [
      'Compreendi o tema em sua totalidade, sem fugir nem tangenciar?',
      'Apresentei pelo menos um repertório legitimado de outra área do conhecimento?',
      'O repertório tem relação direta e produtiva com o argumento defendido?',
      'O texto é dissertativo-argumentativo do início ao fim (sem narrar fatos soltos)?',
      'Minha introdução possui contextualização e tese clara?'
    ],
    3: [
      'Minha tese está expressa de forma evidente na introdução?',
      'Cada parágrafo de desenvolvimento possui uma ideia central definida?',
      'Expliquei os argumentos detalhadamente em vez de apenas enunciá-los?',
      'Mostrei a consequência prática dos problemas analisados?',
      'Todos os parágrafos convergem para defender a mesma tese?'
    ],
    4: [
      'Iniciei os desenvolvimentos e a conclusão com operadores argumentativos variados?',
      'Articulei os períodos internos com conectivos de causa, consequência ou oposição?',
      'Substituí palavras repetidas por pronomes, sinônimos ou elipses?',
      'Os conectivos empregados refletem o sentido exato que pretendo transmitir?',
      'O texto tem fluidez de leitura sem truncamentos?'
    ],
    5: [
      'Indiquei com clareza QUEM vai agir (Agente público ou institucional)?',
      'Descrevi O QUE deve ser feito (Ação propositiva e afirmativa)?',
      'Expliquei COMO ou POR MEIO DE QUE a ação será realizada (Meio/Modo)?',
      'Deixei explícito PARA QUE a ação serve (Efeito/Finalidade)?',
      'Inclui um DETALHAMENTO específico em um dos elementos?',
      'A proposta respeita integralmente os direitos humanos?'
    ]
  };

  return mapa[numeroComp] || [
    'Revisei todos os parágrafos do texto com atenção aos critérios da banca?'
  ];
}

/**
 * Motor central de diagnóstico do Professor IA — Responde às 7 Perguntas
 */
function gerarDiagnosticoProfessorIA(redacoesValidas, redacoesInconsistentes = []) {
  const totalValidas = redacoesValidas.length;

  if (totalValidas === 0) {
    return {
      estado: 'vazio',
      mensagem: 'Ainda preciso de uma redação avaliada para começar seu diagnóstico pedagógico.'
    };
  }

  const cronologicas = [...redacoesValidas].sort((a, b) => new Date(a.data_envio || 0) - new Date(b.data_envio || 0));
  const notas = cronologicas.map(r => r.avaliacao_ia.nota_total);
  const notaAtual = notas[notas.length - 1];
  const notaAnterior = totalValidas >= 2 ? notas[notas.length - 2] : null;
  const melhorNotaValida = Math.max(...notas);
  const mediaGeralValida = Math.round(notas.reduce((a, b) => a + b, 0) / totalValidas);
  const variacaoValida = notaAnterior !== null ? notaAtual - notaAnterior : null;

  // Médias e Gaps das Competências
  const mediasComps = calcularMediasCompetencias(cronologicas);
  const gapsComps = calcularGapsCompetencias(mediasComps);
  const compPrioritaria = determinarCompetenciaPrioritaria(mediasComps);
  const numPrio = compPrioritaria ? compPrioritaria.numero : 1;

  // 1. Como estou?
  let comoEstouTexto = '';
  let nivelGlobal = '';
  if (mediaGeralValida >= 900) nivelGlobal = 'Excelente (Faixa de aprovação competitiva)';
  else if (mediaGeralValida >= 760) nivelGlobal = 'Avançado (Consistente, refinando detalhes)';
  else if (mediaGeralValida >= 600) nivelGlobal = 'Intermediário (Base consolidada com oportunidades de salto)';
  else nivelGlobal = 'Em desenvolvimento (Foco na estrutura e critérios essenciais)';

  if (totalValidas === 1) {
    comoEstouTexto = `Você possui 1 avaliação válida registrada (${notaAtual} pontos). Este é seu primeiro diagnóstico pedagógico: já consigo identificar seus principais pontos de atenção, mas ainda não há histórico suficiente para medir sua evolução percentual.`;
  } else {
    const ritmo = variacaoValida > 0 ? `apresentando evolução recente de +${variacaoValida} pontos` : variacaoValida < 0 ? `com oscilação de ${variacaoValida} pontos na última produção` : `mantendo pontuação estável`;
    comoEstouTexto = `Você tem ${totalValidas} redações com avaliação pedagógica válida. Média geral de <strong>${mediaGeralValida} pontos</strong> (${nivelGlobal}), ${ritmo}.`;
  }

  // 2. Onde estou perdendo pontos?
  const ondePercoPontosTexto = compPrioritaria ? {
    competencia: compPrioritaria.numero,
    nome: compPrioritaria.nome,
    media: compPrioritaria.media,
    gap: 200 - compPrioritaria.media,
    todasComps: gapsComps
  } : null;

  // 3. Por que estou perdendo pontos?
  const problemas = extrairProblemasRecorrentes(cronologicas, numPrio);
  const justificativasReais = cronologicas.map(r => {
    const c = (r.avaliacao_ia?.competencias || []).find(comp => Number(comp.numero) === numPrio);
    return c?.justificativa || '';
  }).filter(Boolean);

  // 4. O que devo estudar?
  const conteudoEstudo = gerarConteudoEstudo(numPrio);

  // 5. O que devo treinar?
  const treinoFocal = gerarTreinoFocal(numPrio);

  // 6. Qual minha próxima meta?
  const metaComp = compPrioritaria ? calcularProximaMeta(compPrioritaria.media, 200) : 160;
  let metaGlobalTexto = '';
  if (totalValidas === 1) {
    const alvo = Math.min(1000, notaAtual + 40);
    metaGlobalTexto = `Buscar consolidar <strong>${alvo} pontos</strong> na sua próxima redação (+40 pts).`;
  } else {
    const proximoAlvo = Math.min(1000, Math.max(notaAtual + 40, melhorNotaValida));
    const salto = proximoAlvo - notaAtual;
    metaGlobalTexto = `Sua próxima meta é avançar uma faixa de desempenho: buscar <strong>${proximoAlvo} pontos</strong>${salto > 0 ? ` (+${salto} pts)` : ''}.`;
  }

  // 7. Como melhorar na próxima redação?
  const checklist = gerarChecklist(numPrio);

  return {
    estado: 'valido',
    totalValidas,
    notaAtual,
    notaAnterior,
    melhorNotaValida,
    mediaGeralValida,
    variacaoValida,
    compPrioritaria,
    gapsComps,
    comoEstouTexto,
    nivelGlobal,
    ondePercoPontosTexto,
    problemas,
    justificativasReais,
    conteudoEstudo,
    treinoFocal,
    metaComp,
    metaGlobalTexto,
    checklist
  };
}

// ─────────────────────────────────────────────────────────────────
// ETAPA 24 & 25: Renderização Integrada da Aba de Evolução
// ─────────────────────────────────────────────────────────────────

function renderizarEvolucaoInteligente() {
  const container = document.getElementById('evolucao-conteudo');
  if (!container) return;

  if (!sessionUserId) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-secondary); background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl);">
        <span style="font-size:3rem; display:block; margin-bottom:12px;">🔒</span>
        <h3 style="font-size:1.25rem; color:var(--text-primary); margin-bottom:6px;">Acesso restrito ao seu progresso</h3>
        <p style="font-size:0.9rem; max-width:440px; margin:0 auto 20px;">
          Para acompanhar sua evolução nota a nota e ter acesso ao Professor IA, faça login na sua conta do Vestibular+.
        </p>
        <a class="btn btn-primary" href="./login.html">Fazer Login no Vestibular+ →</a>
      </div>
    `;
    return;
  }

  const historicoCompleto = lerHistoricoLocal(sessionUserId);
  const avaliadasTotal = historicoCompleto.filter(r => r.avaliacao_ia && typeof r.avaliacao_ia.nota_total === 'number');

  // Estado vazio: Nenhuma redação avaliada
  if (avaliadasTotal.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-secondary); background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl);">
        <span style="font-size:3rem; display:block; margin-bottom:12px;">🎓</span>
        <h3 style="font-size:1.25rem; color:var(--text-primary); margin-bottom:6px;">Ainda preciso de uma redação para começar seu diagnóstico</h3>
        <p style="font-size:0.9rem; max-width:460px; margin:0 auto 20px; line-height:1.5;">
          Produza seu primeiro texto e solicite a correção com IA. O <strong>Professor IA</strong> analisará seus resultados e traçará seu plano de evolução personalizado.
        </p>
        <button class="btn btn-primary" onclick="document.getElementById('tab-btn-propostas').click()">
          Escolher uma Proposta 🚀
        </button>
      </div>
    `;
    return;
  }

  // Extrai lista única de bancas presentes nos dados reais
  const bancasDisponiveis = Array.from(new Set(avaliadasTotal.map(r => r.vestibular_nome || r.vestibular_id?.toUpperCase() || 'ENEM'))).filter(Boolean);

  // Aplica filtro de vestibular selecionado
  const avaliadasFiltro = filtroBancaEvolucao === 'todas'
    ? avaliadasTotal
    : avaliadasTotal.filter(r => (r.vestibular_nome || r.vestibular_id?.toUpperCase()) === filtroBancaEvolucao);

  if (avaliadasFiltro.length === 0) {
    container.innerHTML = `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl); padding:24px;">
        ${renderizarBarraFiltrosEvolucao(bancasDisponiveis, filtroBancaEvolucao)}
        <div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">
          <p style="font-size:0.9rem; margin:0;">Nenhuma redação avaliada encontrada para a banca <strong>${escapeHtml(filtroBancaEvolucao)}</strong>.</p>
        </div>
      </div>
    `;
    vincularEventosFiltroEvolucao();
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // ETAPA 25: Auditoria Determinística — Separação Válidas x Inconsistentes
  // ─────────────────────────────────────────────────────────────
  const auditoria = auditarAvaliacoesRedacao(avaliadasFiltro);
  const redacoesValidas = auditoria.validas;
  const redacoesInconsistentes = auditoria.inconsistentes;
  const temDiscrepanciaCritica = auditoria.temDiscrepanciaCritica;

  const totalValidas = redacoesValidas.length;
  const totalHistorico = auditoria.todas.length;

  // Banner explícito de Alerta de Evolução Inconclusiva
  const alertaInconclusivoHtml = temDiscrepanciaCritica ? `
    <div style="margin-bottom:20px; padding:16px 20px; border-radius:var(--radius-lg); background:rgba(239,68,68,0.08); border:2px solid rgba(239,68,68,0.4); color:#ef4444; font-size:0.86rem; line-height:1.55;">
      <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:0.95rem; margin-bottom:4px;">
        <span>⚠️</span> Evolução inconclusiva
      </div>
      <div>
        Identificamos uma diferença muito grande entre avaliações (${redacoesInconsistentes.length > 0 ? `${redacoesInconsistentes.length} avaliação com discrepância crítica` : 'variação crítica detectada'}).
        Os resultados continuam disponíveis no seu histórico, mas essa comparação <strong>não será utilizada para calcular sua evolução pedagógica, média ou metas</strong>.
      </div>
    </div>
  ` : '';

  // Aviso de 1 redação válida
  const avisoUmaRedacao = (totalValidas === 1 && !temDiscrepanciaCritica) ? `
    <div style="margin-bottom:20px; padding:14px 18px; border-radius:var(--radius-md); background:rgba(56,189,248,0.06); border:1px solid rgba(56,189,248,0.25); color:var(--text-secondary); font-size:0.84rem; line-height:1.5;">
      💡 <strong>Você possui 1 redação avaliada.</strong> Este é seu primeiro diagnóstico. Com novas redações conseguiremos medir as variações de nota e a evolução específica de cada competência.
    </div>
  ` : '';

  // ─────────────────────────────────────────────────────────────
  // Variáveis para cálculos pedagógicos BASEADOS EM AVALIAÇÕES VÁLIDAS
  // ─────────────────────────────────────────────────────────────
  const cronologicasValidas = [...redacoesValidas].sort((a, b) => new Date(a.data_envio || 0) - new Date(b.data_envio || 0));
  const totalAvaliacoes = totalValidas; // Aliases para compatibilidade total com os testes da Etapa 24
  const anterior = totalAvaliacoes >= 2 ? cronologicasValidas[totalAvaliacoes - 2] : null;
  const maisRecente = totalValidas > 0 ? cronologicasValidas[totalValidas - 1] : null;
  const maisRecenteValida = maisRecente;
  const anteriorValida = anterior;

  const notaAtual = maisRecenteValida ? maisRecenteValida.avaliacao_ia.nota_total : '—';
  const notaAnterior = anteriorValida ? anteriorValida.avaliacao_ia.nota_total : null;
  const variacaoNota = (anteriorValida && typeof notaAtual === 'number') ? notaAtual - notaAnterior : null;

  const todasNotasValidas = cronologicasValidas.map(r => r.avaliacao_ia.nota_total);
  const melhorNota = todasNotasValidas.length > 0 ? Math.max(...todasNotasValidas) : '—';
  const somaNotas = todasNotasValidas.reduce((acc, n) => acc + n, 0);
  const mediaNotas = totalValidas > 0 ? Math.round(somaNotas / totalValidas) : '—';

  // Badge da última evolução: se houve discrepância crítica na última, NÃO mostra +440, mostra Inconclusiva
  const variacaoBadgeHtml = (() => {
    if (temDiscrepanciaCritica && redacoesInconsistentes.length > 0) {
      return `<span style="color:#ef4444; font-weight:800; font-size:0.85rem;">⚠️ Evolução inconclusiva</span>`;
    }
    if (variacaoNota !== null) {
      if (variacaoNota > 0) return `<span style="color:#22c55e; font-weight:800; font-size:0.9rem;">+${variacaoNota} pontos ↑</span>`;
      if (variacaoNota < 0) return `<span style="color:#ef4444; font-weight:800; font-size:0.9rem;">${variacaoNota} pontos ↓</span>`;
      return `<span style="color:var(--text-secondary); font-weight:800; font-size:0.9rem;">= estável (0 pts)</span>`;
    }
    return '<span style="color:var(--text-secondary); font-size:0.8rem;">Primeira avaliação</span>';
  })();

  // 1. Cards de Resumo da Evolução (Alimentados apenas por dados válidos)
  const cardsMetricasHtml = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
      <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 18px;">
        <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Nota Atual</div>
        <div style="font-size:2rem; font-weight:900; font-family:var(--font-display); color:var(--text-primary); line-height:1.1;">${notaAtual}</div>
        <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:4px;">${maisRecenteValida ? 'Última avaliação válida' : 'Sem avaliação válida'}</div>
      </div>

      <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 18px;">
        <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Melhor Nota</div>
        <div style="font-size:2rem; font-weight:900; font-family:var(--font-display); color:#22c55e; line-height:1.1;">${melhorNota}</div>
        <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:4px;">Seu recorde pedagógico</div>
      </div>

      <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 18px;">
        <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Média Pedagógica</div>
        <div style="font-size:2rem; font-weight:900; font-family:var(--font-display); color:#38bdf8; line-height:1.1;">${mediaNotas}</div>
        <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:4px;">Baseada em ${totalValidas} redação${totalValidas !== 1 ? 'ões' : ''} válida${totalValidas !== 1 ? 's' : ''}</div>
      </div>

      <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 18px;">
        <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Última Evolução</div>
        <div style="margin-top:4px; line-height:1.2;">${variacaoBadgeHtml}</div>
        <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:6px;">${anteriorValida ? `Anterior: ${notaAnterior} pts` : 'Sem anterior para comparar'}</div>
      </div>
    </div>
  `;

  // 2. Gráfico Visual de Evolução (Mostra trajetória válida)
  const graficoHtml = totalValidas >= 2 ? (() => {
    const maxNota = 1000;
    return `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl); padding:20px 24px; margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px;">
          <h4 style="font-size:0.95rem; font-weight:800; margin:0; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
            <span>📈</span> Trajetória das Notas (Histórico Válido)
          </h4>
          <span style="font-size:0.75rem; color:var(--text-secondary);">${totalValidas} avaliações pedagógicas registradas</span>
        </div>
        <div style="display:flex; align-items:flex-end; gap:16px; min-height:140px; padding:10px 0 6px; overflow-x:auto;">
          ${cronologicasValidas.map((r, i) => {
            const n = r.avaliacao_ia.nota_total;
            const h = Math.max(18, Math.round((n / maxNota) * 110));
            const isLatest = i === cronologicasValidas.length - 1;
            const cor = isLatest ? 'var(--color-primary-400)' : '#38bdf8';
            const dataCurta = new Date(r.data_envio || 0).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

            return `
              <div style="display:flex; flex-direction:column; align-items:center; gap:6px; min-width:64px; flex-shrink:0;">
                <span style="font-size:0.78rem; font-weight:800; color:${cor};">${n}</span>
                <div style="width:42px; height:${h}px; background:${cor}${isLatest ? '' : '80'}; border-radius:5px 5px 0 0; transition:height 0.4s ease;"></div>
                <span style="font-size:0.67rem; color:var(--text-secondary); text-align:center; line-height:1.2;">
                  ${escapeHtml(dataCurta)}<br>
                  <strong style="color:var(--text-primary);">${isLatest ? 'Atual' : `#${i + 1}`}</strong>
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  })() : '';

  // 3. Competências e Diagnóstico do Professor IA
  const diagnosticoProfessor = gerarDiagnosticoProfessorIA(redacoesValidas, redacoesInconsistentes);

  // Variáveis da Etapa 24 preservadas com base nos dados válidos
  const compsAtuais = maisRecenteValida?.avaliacao_ia?.competencias || [];
  const compsAnteriores = anteriorValida?.avaliacao_ia?.competencias || [];
  const mudancasComps = [];
  const compsMelhoraram = [];
  const compsPioraram = [];
  const compsEstaveis = [];

  if (anteriorValida && compsAtuais.length > 0 && compsAnteriores.length > 0) {
    compsAtuais.forEach((cAtual, idx) => {
      const cAnt = compsAnteriores.find(c => c.numero === cAtual.numero) || compsAnteriores[idx];
      if (cAnt && typeof cAnt.nota === 'number') {
        const diffC = cAtual.nota - cAnt.nota;
        const item = {
          numero: cAtual.numero,
          nome: cAtual.nome,
          notaAtual: cAtual.nota,
          notaAnt: cAnt.nota,
          diff: diffC,
          peso: Number(cAtual.nota_maxima) || 200
        };
        mudancasComps.push(item);
        if (diffC > 0) compsMelhoraram.push(item);
        else if (diffC < 0) compsPioraram.push(item);
        else compsEstaveis.push(item);
      }
    });
  }

  const evolucaoCompsHtml = (mudancasComps.length > 0 && !temDiscrepanciaCritica) ? `
    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl); padding:20px 24px; margin-bottom:20px;">
      <h4 style="font-size:0.95rem; font-weight:800; margin:0 0 14px; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
        <span>🎯</span> Evolução por Competência (Última vs. Anterior)
      </h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
        ${mudancasComps.map(mc => {
          const sinal = mc.diff > 0 ? `+${mc.diff} ↑` : mc.diff < 0 ? `${mc.diff} ↓` : `0 →`;
          const cor = mc.diff > 0 ? '#22c55e' : mc.diff < 0 ? '#ef4444' : 'var(--text-secondary)';
          const bg = mc.diff > 0 ? 'rgba(34,197,94,0.08)' : mc.diff < 0 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)';
          return `
            <div style="background:${bg}; border:1px solid var(--border-color); border-radius:var(--radius-md); padding:12px; text-align:center;">
              <div style="font-size:0.75rem; font-weight:800; color:var(--text-secondary); margin-bottom:4px;">C${mc.numero}</div>
              <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary);">${mc.notaAnt} → ${mc.notaAtual}</div>
              <div style="font-size:0.85rem; font-weight:800; color:${cor}; margin-top:4px;">${sinal}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const oQueMudouHtml = (totalValidas >= 2 && !temDiscrepanciaCritica) ? (() => {
    const itensAnalise = [];
    if (variacaoNota > 0) itensAnalise.push(`Você aumentou <strong>${variacaoNota} pontos</strong> desde sua avaliação anterior.`);
    else if (variacaoNota < 0) itensAnalise.push(`Sua nota total teve oscilação de <strong>${variacaoNota} pontos</strong> em relação à anterior.`);
    else itensAnalise.push(`Sua nota total permaneceu estável em relação à redação anterior.`);

    if (compsMelhoraram.length > 0) {
      const melhorAvanco = [...compsMelhoraram].sort((a, b) => b.diff - a.diff)[0];
      itensAnalise.push(`Seu maior avanço ocorreu em <strong>C${melhorAvanco.numero}</strong> (+${melhorAvanco.diff} pontos).`);
    }
    if (compsPioraram.length > 0) {
      compsPioraram.forEach(cp => {
        itensAnalise.push(`Competência <strong>C${cp.numero}</strong> apresentou queda de ${Math.abs(cp.diff)} pontos (${cp.notaAnt} → ${cp.notaAtual}).`);
      });
    }
    if (compsEstaveis.length > 0) {
      const nomesEstaveis = compsEstaveis.map(c => `C${c.numero}`).join(', ');
      itensAnalise.push(`As competências <strong>${nomesEstaveis}</strong> mantiveram a mesma pontuação.`);
    }

    return `
      <div style="background:rgba(56,189,248,0.05); border:1px solid rgba(56,189,248,0.22); border-radius:var(--radius-xl); padding:18px 22px; margin-bottom:20px;">
        <h4 style="font-size:0.92rem; font-weight:800; margin:0 0 10px; color:#38bdf8; display:flex; align-items:center; gap:8px;">
          <span>🔎</span> O Que Mudou na Sua Escrita?
        </h4>
        <ul style="margin:0; padding-left:18px; font-size:0.83rem; color:var(--text-primary); line-height:1.6;">
          ${itensAnalise.map(it => `<li>${it}</li>`).join('')}
        </ul>
      </div>
    `;
  })() : '';

  let maiorOportunidadeTexto = 'Potencial máximo atingido';
  if (compsAtuais.length > 0) {
    const gaps = compsAtuais.map(c => ({ c, gap: (Number(c.nota_maxima) || 200) - c.nota })).filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap);
    if (gaps.length > 0) maiorOportunidadeTexto = `C${gaps[0].c.numero} (margem de até +${gaps[0].gap} pts)`;
  }

  let metaTexto = '';
  if (totalValidas === 1) {
    metaTexto = `Meta sugerida de treino: buscar consolidar a pontuação de ${Math.min(1000, Number(notaAtual) + 40)} pontos na próxima produção.`;
  } else if (typeof notaAtual === 'number') {
    const metaPontos = Math.min(1000, Math.max(notaAtual + 40, Number(melhorNota)));
    metaTexto = `Meta para a Próxima Redação: buscar alcançar <strong>${metaPontos} pontos</strong> (+${metaPontos - notaAtual} pts em relação à nota atual).`;
  }

  const prioridadesEstudo = Array.isArray(maisRecenteValida?.avaliacao_ia?.prioridades_estudo) ? maisRecenteValida.avaliacao_ia.prioridades_estudo : [];
  const sugestoes = Array.isArray(maisRecenteValida?.avaliacao_ia?.sugestoes) ? maisRecenteValida.avaliacao_ia.sugestoes : [];
  const pontosMelhoria = Array.isArray(maisRecenteValida?.avaliacao_ia?.pontos_melhoria) ? maisRecenteValida.avaliacao_ia.pontos_melhoria : [];
  const planoAcoes = [...prioridadesEstudo, ...pontosMelhoria, ...sugestoes].filter(Boolean).slice(0, 4);

  const planoEvolucaoHtml = planoAcoes.length > 0 ? `
    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl); padding:20px 24px; margin-bottom:20px;">
      <h4 style="font-size:0.95rem; font-weight:800; margin:0 0 12px; color:var(--color-primary-400); display:flex; align-items:center; gap:8px;">
        <span>📋</span> Plano Prático de Treino para a Próxima Produção
      </h4>
      <ol style="margin:0; padding-left:20px; font-size:0.83rem; color:var(--text-primary); line-height:1.6;">
        ${planoAcoes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ol>
    </div>
  ` : '';

  // Bloco do PROFESSOR IA (As 7 Perguntas)
  let professorIaHtml = '';
  if (diagnosticoProfessor.estado === 'valido') {
    const diag = diagnosticoProfessor;
    const prio = diag.compPrioritaria;
    const gapPrio = prio ? 200 - prio.media : 0;

    professorIaHtml = `
      <div id="professor-ia-card" style="background:linear-gradient(180deg, rgba(124,58,237,0.08) 0%, rgba(15,23,42,0.4) 100%); border:2px solid rgba(124,58,237,0.35); border-radius:var(--radius-xl); padding:24px 28px; margin-bottom:24px; box-shadow:0 8px 32px rgba(124,58,237,0.15);">
        
        <!-- Topo do Bloco -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; border-bottom:1px solid rgba(124,58,237,0.2); padding-bottom:14px;">
          <div>
            <div style="display:inline-flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--color-primary-400); background:rgba(124,58,237,0.16); padding:4px 12px; border-radius:var(--radius-full); margin-bottom:6px;">
              <span>🎓</span> Mentoria Pedagógica Personalizada
            </div>
            <h3 style="font-size:1.45rem; font-weight:900; margin:0; font-family:var(--font-display); color:var(--text-primary);">
              Professor IA de Redação
            </h3>
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary); text-align:right;">
            Orientação baseada em critérios oficiais ENEM
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:20px;">

          <!-- 1. Como estou? -->
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px;">
            <h4 style="font-size:0.95rem; font-weight:800; color:#38bdf8; margin:0 0 8px; display:flex; align-items:center; gap:8px;">
              <span>📊</span> 1. Como estou?
            </h4>
            <div style="font-size:0.88rem; color:var(--text-primary); line-height:1.55;">
              ${diag.comoEstouTexto}
            </div>
          </div>

          <!-- 2. Onde estou perdendo pontos? -->
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px;">
            <h4 style="font-size:0.95rem; font-weight:800; color:#f59e0b; margin:0 0 8px; display:flex; align-items:center; gap:8px;">
              <span>🎯</span> 2. Onde estou perdendo pontos?
            </h4>
            ${prio ? `
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
                <div>
                  <div style="font-size:1.15rem; font-weight:900; color:var(--text-primary);">
                    Competência ${prio.numero} — ${escapeHtml(prio.nome)}
                  </div>
                  <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:2px;">
                    Média válida: <strong>${prio.media}/200</strong> · Margem de ganho (Gap): <strong style="color:#f59e0b;">+${gapPrio} pontos</strong>
                  </div>
                </div>
                <div style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); border-radius:var(--radius-full); padding:6px 14px; font-size:0.78rem; font-weight:800; color:#f59e0b;">
                  Principal Oportunidade
                </div>
              </div>

              <!-- Barras comparativas de gaps C1-C5 -->
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:8px; margin-top:10px;">
                ${diag.gapsComps.map(g => {
                  const ehPrio = g.numero === prio.numero;
                  const pct = g.media !== null ? Math.round((g.media / 200) * 100) : 0;
                  return `
                    <div style="background:${ehPrio ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)'}; border:1px solid ${ehPrio ? '#f59e0b' : 'var(--border-color)'}; border-radius:var(--radius-sm); padding:8px; text-align:center;">
                      <div style="font-size:0.72rem; font-weight:800; color:${ehPrio ? '#f59e0b' : 'var(--text-secondary)'};">C${g.numero}</div>
                      <div style="font-size:0.95rem; font-weight:900; color:var(--text-primary); margin:2px 0;">${g.media !== null ? g.media : '—'}</div>
                      <div style="font-size:0.68rem; color:${ehPrio ? '#f59e0b' : 'var(--text-secondary)'};">gap: ${g.gap !== null ? `+${g.gap}` : '—'}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div style="font-size:0.85rem; color:var(--text-secondary);">Dados insuficientes para calcular competência prioritária.</div>
            `}
          </div>

          <!-- 3. Por que estou perdendo pontos? -->
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px;">
            <h4 style="font-size:0.95rem; font-weight:800; color:#ef4444; margin:0 0 10px; display:flex; align-items:center; gap:8px;">
              <span>🧠</span> 3. Por que estou perdendo pontos?
            </h4>
            ${diag.problemas.recorrentes.length > 0 ? `
              <div style="margin-bottom:10px;">
                <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:#ef4444; margin-bottom:6px;">⚠️ Dificuldades Recorrentes (identificadas em múltiplas avaliações):</div>
                <ul style="margin:0; padding-left:18px; font-size:0.84rem; color:var(--text-primary); line-height:1.55;">
                  ${diag.problemas.recorrentes.map(p => `<li><strong>${escapeHtml(p.descricao)}</strong> (observado ${p.ocorrencias}x nas suas redações)</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${diag.problemas.pontosAtencao.length > 0 ? `
              <div>
                <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:#f59e0b; margin-bottom:6px;">🔍 Pontos de Atenção na Competência ${prio?.numero || ''}:</div>
                <ul style="margin:0; padding-left:18px; font-size:0.84rem; color:var(--text-primary); line-height:1.55;">
                  ${diag.problemas.pontosAtencao.slice(0, 3).map(p => `<li>${escapeHtml(p.descricao)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${diag.problemas.recorrentes.length === 0 && diag.problemas.pontosAtencao.length === 0 ? `
              <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5;">
                ${diag.justificativasReais.length > 0 ? escapeHtml(diag.justificativasReais[diag.justificativasReais.length - 1]) : 'Aprofundamento e precisão nos critérios da competência prioritária.'}
              </div>
            ` : ''}
          </div>

          <!-- 4. O que devo estudar? -->
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px;">
            <h4 style="font-size:0.95rem; font-weight:800; color:var(--color-primary-400); margin:0 0 10px; display:flex; align-items:center; gap:8px;">
              <span>📚</span> 4. O que devo estudar? (${escapeHtml(diag.conteudoEstudo.titulo)})
            </h4>
            <ul style="margin:0; padding-left:18px; font-size:0.84rem; color:var(--text-primary); line-height:1.6;">
              ${diag.conteudoEstudo.topicos.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
            </ul>
          </div>

          <!-- 5. O que devo treinar? -->
          <div style="background:var(--bg-elevated); border:1px solid rgba(124,58,237,0.3); border-radius:var(--radius-lg); padding:18px 20px;">
            <h4 style="font-size:0.95rem; font-weight:800; color:#38bdf8; margin:0 0 8px; display:flex; align-items:center; gap:8px;">
              <span>✍️</span> 5. O que devo treinar?
            </h4>
            <div style="font-size:0.88rem; font-weight:700; color:var(--text-primary); margin-bottom:6px;">
              ${escapeHtml(diag.treinoFocal.titulo)}
            </div>
            <p style="font-size:0.84rem; color:var(--text-secondary); margin:0 0 10px; line-height:1.5;">
              ${escapeHtml(diag.treinoFocal.instrucao)}
            </p>
            <div style="background:rgba(255,255,255,0.03); border:1px dashed var(--border-color); border-radius:var(--radius-sm); padding:10px 14px; font-size:0.8rem; color:var(--text-secondary); margin-bottom:14px;">
              💡 <strong>Exemplo de aplicação:</strong> ${escapeHtml(diag.treinoFocal.exemplo)}
            </div>

            <!-- Botão Começar Treino -->
            <button id="btn-comecar-treino-ia" class="btn btn-primary" style="font-weight:800; font-size:0.88rem; padding:10px 22px; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 16px rgba(124,58,237,0.4);" data-competencia="${prio?.numero || 1}">
              🚀 Começar Treino (${prio ? `C${prio.numero}` : 'Redação'})
            </button>
          </div>

          <!-- 6. Qual minha próxima meta? -->
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px;">
            <h4 style="font-size:0.95rem; font-weight:800; color:#22c55e; margin:0 0 10px; display:flex; align-items:center; gap:8px;">
              <span>🎯</span> 6. Qual minha próxima meta?
            </h4>
            <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
              ${prio ? `
                <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.3); border-radius:var(--radius-md); padding:10px 16px;">
                  <div style="font-size:0.72rem; font-weight:800; color:#22c55e; text-transform:uppercase;">Meta da Competência ${prio.numero}</div>
                  <div style="font-size:1.15rem; font-weight:900; color:var(--text-primary); margin-top:2px;">
                    C${prio.numero}: ${prio.media} → <span style="color:#22c55e;">${diag.metaComp} pts</span>
                  </div>
                </div>
              ` : ''}

              <div style="flex:1; min-width:220px; font-size:0.85rem; color:var(--text-primary); line-height:1.5;">
                ${diag.metaGlobalTexto}
              </div>
            </div>
          </div>

          <!-- 7. Como melhorar na próxima redação? -->
          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px;">
            <h4 style="font-size:0.95rem; font-weight:800; color:var(--color-primary-400); margin:0 0 10px; display:flex; align-items:center; gap:8px;">
              <span>📋</span> 7. Como melhorar na próxima redação? (Checklist Prático)
            </h4>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${diag.checklist.map((item, idx) => `
                <label style="display:flex; align-items:flex-start; gap:10px; font-size:0.83rem; color:var(--text-primary); cursor:pointer;">
                  <input type="checkbox" style="margin-top:2px; accent-color:var(--color-primary-500);" id="chk-prof-ia-${idx}" />
                  <span>${escapeHtml(item)}</span>
                </label>
              `).join('')}
            </div>
          </div>

        </div>

        <!-- Disclaimer Oficial Obrigatório -->
        <div style="margin-top:22px; padding:12px 16px; border-radius:var(--radius-md); background:rgba(255,255,255,0.02); border:1px solid var(--border-color); font-size:0.78rem; color:var(--text-secondary); text-align:center;">
          Estimativa pedagógica baseada nos critérios do ENEM. Não constitui correção oficial da banca.
        </div>

      </div>
    `;
  }

  // 4. Comparativo Direto entre as Duas Últimas Válidas
  const comparativoDuasUltimasHtml = (totalValidas >= 2 && !temDiscrepanciaCritica) ? (() => {
    return `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl); padding:20px 24px; margin-bottom:20px;">
        <h4 style="font-size:0.95rem; font-weight:800; margin:0 0 14px; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
          <span>⚖️</span> Comparação Detalhada: Redação Anterior vs. Redação Atual
        </h4>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.82rem; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color); color:var(--text-secondary);">
                <th style="padding:8px 10px;">Item Avaliado</th>
                <th style="padding:8px 10px; text-align:center;">Redação Anterior</th>
                <th style="padding:8px 10px; text-align:center;">Redação Atual</th>
                <th style="padding:8px 10px; text-align:center;">Variação</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border-color); font-weight:800;">
                <td style="padding:10px;">Nota Geral</td>
                <td style="padding:10px; text-align:center;">${notaAnterior} / 1000</td>
                <td style="padding:10px; text-align:center; color:var(--color-primary-400);">${notaAtual} / 1000</td>
                <td style="padding:10px; text-align:center;">${variacaoBadgeHtml}</td>
              </tr>
              ${mudancasComps.map(mc => {
                const sinal = mc.diff > 0 ? `+${mc.diff} ↑` : mc.diff < 0 ? `${mc.diff} ↓` : `0 →`;
                const cor = mc.diff > 0 ? '#22c55e' : mc.diff < 0 ? '#ef4444' : 'var(--text-secondary)';
                return `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:8px 10px; color:var(--text-secondary);">C${mc.numero} — ${escapeHtml(mc.nome)}</td>
                    <td style="padding:8px 10px; text-align:center;">${mc.notaAnt}</td>
                    <td style="padding:8px 10px; text-align:center; font-weight:700;">${mc.notaAtual}</td>
                    <td style="padding:8px 10px; text-align:center; font-weight:800; color:${cor};">${sinal}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  })() : '';

  // Renderização final consolidada
  container.innerHTML = `
    ${renderizarBarraFiltrosEvolucao(bancasDisponiveis, filtroBancaEvolucao)}
    ${alertaInconclusivoHtml}
    ${avisoUmaRedacao}
    ${cardsMetricasHtml}
    ${professorIaHtml}
    ${graficoHtml}
    ${evolucaoCompsHtml}
    ${oQueMudouHtml}
    ${planoEvolucaoHtml}
    ${comparativoDuasUltimasHtml}
  `;

  vincularEventosFiltroEvolucao();

  // Vincula evento do botão "Começar Treino"
  const btnTreino = document.getElementById('btn-comecar-treino-ia');
  if (btnTreino) {
    btnTreino.addEventListener('click', () => {
      // Abre a primeira proposta disponível compatível no editor para prática focal
      const compNum = btnTreino.dataset.competencia || '1';
      const propostaParaTreino = propostasLista.find(p => p.vestibular_id?.toLowerCase() === 'enem') || propostasLista[0];
      if (propostaParaTreino) {
        iniciarEditor(propostaParaTreino);
      } else {
        document.getElementById('tab-btn-propostas')?.click();
      }
    });
  }
}

function renderizarBarraFiltrosEvolucao(bancasDisponiveis, selecionada) {
  if (!bancasDisponiveis || bancasDisponiveis.length <= 1) {
    return '';
  }

  return `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:18px; flex-wrap:wrap;">
      <span style="font-size:0.78rem; font-weight:700; color:var(--text-secondary); margin-right:4px;">Filtrar por banca:</span>
      <button class="chip-banca chip-filtro-evolucao ${selecionada === 'todas' ? 'active' : ''}" data-banca="todas">
        Todas as Bancas
      </button>
      ${bancasDisponiveis.map(b => `
        <button class="chip-banca chip-filtro-evolucao ${selecionada === b ? 'active' : ''}" data-banca="${escapeHtml(b)}">
          ${escapeHtml(b)}
        </button>
      `).join('')}
    </div>
  `;
}

function vincularEventosFiltroEvolucao() {
  const chips = document.querySelectorAll('.chip-filtro-evolucao');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      filtroBancaEvolucao = chip.dataset.banca || 'todas';
      renderizarEvolucaoInteligente();
    });
  });
}


/**
 * Renderiza o bloco de avaliação da IA (ou convite para iniciar)
 */
function renderizarBlocoAvaliacaoIA(r, matriz) {
  const av = r.avaliacao_ia;

  if (!av) {
    return `
      <div id="box-solicitar-correcao" style="background:var(--bg-elevated); border:1px solid rgba(124,58,237,0.3); border-radius:var(--radius-lg); padding:20px; text-align:center; margin-bottom:20px;">
        <div style="font-size:1.8rem; margin-bottom:6px;">✨</div>
        <h4 style="font-size:1.05rem; font-weight:800; font-family:var(--font-display); margin:0 0 6px; color:var(--text-primary);">
          Correção Pedagógica com Inteligência Artificial
        </h4>
        <p style="font-size:0.84rem; color:var(--text-secondary); max-width:480px; margin:0 auto 16px; line-height:1.5;">
          Obtenha pontuação por competência oficial da banca <strong>${escapeHtml(matriz.nome)}</strong>, pontos fortes, oportunidades de melhoria e orientações práticas de reescrita.
        </p>
        <button id="btn-disparar-correcao-ia" class="btn btn-primary" data-id="${r.id}" style="padding:10px 24px; font-weight:700; font-size:0.9rem; box-shadow:0 4px 16px rgba(124,58,237,0.35);">
          Corrigir com IA ✨
        </button>
        <div id="correcao-ia-feedback" style="margin-top:12px; font-size:0.82rem; display:none;"></div>
      </div>
    `;
  }

  // ETAPA 25.3: Tratamento defensivo de avaliação incompleta (ex: apenas C1 retornada)
  const isEnem = (matriz?.nome || '').toUpperCase().includes('ENEM');
  const compsRecebidas = Array.isArray(av.competencias) ? av.competencias.length : 0;
  const ehIncompleta = av.avaliacao_incompleta === true || (isEnem && compsRecebidas < 5);

  if (ehIncompleta) {
    return `
      <div style="background:var(--bg-card); border:2px solid rgba(245,158,11,0.5); border-radius:var(--radius-xl); padding:24px; margin-bottom:24px; box-shadow:var(--shadow-soft);">
        <div style="display:flex; align-items:flex-start; gap:16px;">
          <div style="font-size:2.2rem; line-height:1;">⚠️</div>
          <div style="flex:1;">
            <div style="display:inline-block; font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:#d97706; background:rgba(245,158,11,0.12); padding:3px 10px; border-radius:var(--radius-full); margin-bottom:6px;">
              Correção Incompleta
            </div>
            <h4 style="font-size:1.15rem; font-weight:800; font-family:var(--font-display); color:var(--text-primary); margin:0 0 8px;">
              Avaliação Parcial Detectada (${compsRecebidas} de 5 Competências)
            </h4>
            <p style="font-size:0.86rem; color:var(--text-secondary); line-height:1.6; margin:0 0 16px;">
              A correção recebida não continha todas as 5 competências oficiais do ENEM. Por segurança pedagógica e integridade do seu diagnóstico, nenhuma pontuação parcial (como ${av.nota_total || 0}/1000) foi considerada como sua nota final nem enviada para seu histórico de evolução.
            </p>
            <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
              <button id="btn-disparar-correcao-ia" class="btn btn-primary" data-id="${r.id}" style="padding:10px 20px; font-weight:700; font-size:0.88rem;">
                Repetir Correção 🔄
              </button>
              <span style="font-size:0.78rem; color:var(--text-secondary);">
                Você pode solicitar uma nova análise completa a qualquer momento.
              </span>
            </div>
            <div id="correcao-ia-feedback" style="margin-top:12px; font-size:0.82rem; display:none;"></div>
          </div>
        </div>
      </div>
    `;
  }

  // Se já possui avaliação
  const percentual = Math.round((av.nota_total / (av.nota_maxima || 1000)) * 100);
  const corNota = percentual >= 80 ? '#22c55e' : percentual >= 60 ? '#38bdf8' : '#f59e0b';

  // Banner de aviso para avaliação inconsistente
  const bannerInconsistente = av.avaliacao_inconsistente
    ? `<div style="margin-bottom:16px; padding:12px 16px; border-radius:var(--radius-md); background:rgba(239,68,68,0.08); border:2px solid rgba(239,68,68,0.4); color:#ef4444; font-size:0.84rem;">
        ⚠️ <strong>Análise requer atenção:</strong> Identificamos uma variação relevante entre os elementos analisados nesta correção e a anterior. A avaliação foi sinalizada para maior transparência e ambas estão preservadas.
      </div>`
    : '';

  // Banner para nota_suspeita / sinalização de consistência
  const compSuspeitas = (av.competencias || []).filter(c => c.nota_suspeita);
  const bannerSuspeita = compSuspeitas.length > 0
    ? `<div style="margin-bottom:16px; padding:10px 14px; border-radius:var(--radius-md); background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.3); color:#c084fc; font-size:0.82rem;">
        🔍 <strong>Sinalização pedagógica:</strong> Esta avaliação possui uma sinalização de consistência em ${compSuspeitas.map(c => `C${c.numero}`).join(', ')}. Isso não significa que sua redação esteja errada — confira as observações detalhadas.
       </div>`
    : '';

  return `
    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-xl); padding:22px; margin-bottom:24px; box-shadow:var(--shadow-soft);">
      ${bannerSuspeita}
      ${bannerInconsistente}
      <!-- Topo da Avaliação -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; border-bottom:1px solid var(--border-color); padding-bottom:16px; margin-bottom:18px;">
        <div>
          <span style="font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; color:var(--color-primary-400); background:rgba(124,58,237,0.12); padding:3px 10px; border-radius:var(--radius-full);">
            Estimativa Pedagógica (${escapeHtml(av.modelo_utilizado || 'IA')})
          </span>
          <h4 style="font-size:1.15rem; font-weight:800; font-family:var(--font-display); margin:8px 0 2px;">
            Resultado da Avaliação
          </h4>
          <span style="font-size:0.78rem; color:var(--text-secondary);">
            Avaliado em ${new Date(av.corrigido_em || Date.now()).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <!-- Card Principal da Nota e Resumo -->
      <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:stretch; margin-bottom:20px;">
        <!-- Card Destaque da Nota -->
        <div style="flex:1 1 200px; background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:20px 24px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); margin-bottom:6px;">
            SUA NOTA ESTIMADA
          </div>
          <div style="font-size:3.2rem; font-weight:900; font-family:var(--font-display); color:${corNota}; line-height:1;">
            ${av.nota_total}
          </div>
          <div style="font-size:0.95rem; color:var(--text-secondary); font-weight:600; margin-bottom:8px;">
            / ${av.nota_maxima}
          </div>
          <div style="font-size:0.72rem; color:var(--text-secondary); line-height:1.4;">
            Estimativa pedagógica baseada nos critérios do ENEM
          </div>
        </div>

        <!-- Resumo da Correção C1-C5 -->
        <div style="flex:2 1 300px; background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px; display:flex; flex-direction:column; justify-content:center;">
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-secondary); margin-bottom:12px;">
            📊 Resumo da Correção
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(85px, 1fr)); gap:10px;">
            ${(av.competencias || []).map(c => {
              const p = Number(c.nota_maxima) || 200;
              const pctC = Math.min(100, Math.round((c.nota / p) * 100));
              const corC = pctC >= 80 ? '#22c55e' : pctC >= 60 ? '#38bdf8' : pctC >= 40 ? '#f59e0b' : '#ef4444';
              const prioEmoji = c.prioridade === 'alta' ? '🔴' : c.prioridade === 'media' ? '🟡' : '🟢';
              return `
                <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:8px; text-align:center;">
                  <div style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); margin-bottom:2px;" title="${escapeHtml(c.nome || '')}">
                    C${c.numero} ${prioEmoji}
                  </div>
                  <div style="font-size:1.05rem; font-weight:900; color:${corC};">
                    ${c.nota}
                  </div>
                  <div style="font-size:0.62rem; color:var(--text-secondary);">
                    / ${p}
                  </div>
                  <div style="background:rgba(255,255,255,0.07); height:3px; border-radius:2px; margin-top:4px; overflow:hidden;">
                    <div style="background:${corC}; width:${pctC}%; height:100%;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Status de Persistência com Transparência -->
      <div style="margin-bottom:18px; padding:10px 14px; border-radius:var(--radius-md); font-size:0.8rem; ${av.persistido_no_banco ? 'background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25); color:#22c55e;' : 'background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); color:#f59e0b;'}">
        ${av.persistido_no_banco ? `
          <span>✓ <strong>Avaliação gravada no banco</strong> (vinculada ao seu perfil).${av.fingerprint ? ` <span style="font-size:0.7rem; opacity:0.7;">ID: ${escapeHtml(av.fingerprint)}</span>` : ''}</span>
        ` : `
          <span>⚠️ <strong>Avaliação calculada</strong>: Correção concluída pela IA${av.fingerprint ? ` (ID: ${escapeHtml(av.fingerprint)})` : ''}. A gravação definitiva não foi confirmada — pode ser necessário repetir a correção.</span>
        `}
      </div>

      <!-- Comparativo com Avaliação Anterior (Reavaliação) -->
      ${(() => {
        const hist = Array.isArray(r.historico_avaliacoes) ? r.historico_avaliacoes : [];
        if (hist.length === 0) return '';
        const anterior = hist[0];
        const diffNota = av.nota_total - anterior.nota_total;
        const diffSinal = diffNota > 0 ? `+${diffNota}` : `${diffNota}`;
        const corDiff = diffNota > 0 ? '#22c55e' : diffNota < 0 ? '#ef4444' : '#38bdf8';

        // Usa a classificação de discrepância já calculada e salva na avaliação
        const disc = av.discrepancia || null;
        const classificacao = disc?.classificacao || (Math.abs(diffNota) > 100 ? 'inconsistente' : Math.abs(diffNota) > 80 ? 'alta' : Math.abs(diffNota) > 40 ? 'moderada' : 'normal');
        const labelDisc = disc?.label || '';

        const alerteDiscrepancia = (() => {
          if (classificacao === 'inconsistente') {
            return `
              <div style="margin-bottom:10px; padding:10px 14px; border-radius:var(--radius-sm); font-size:0.8rem; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.4); color:#ef4444;">
                ⚠️ <strong>Variação crítica detectada (${Math.abs(diffNota)} pts).</strong>
                Diferença acima de 100 pts. Avaliação anterior (<strong>${anterior.nota_total} pts</strong>) e nova (<strong>${av.nota_total} pts</strong>) preservadas.
                ${labelDisc ? `<div style="margin-top:4px; font-size:0.75rem; opacity:0.85;">${escapeHtml(labelDisc)}</div>` : ''}
                ${disc?.discrepanciaCompetencia ? `<div style="margin-top:4px; font-size:0.75rem; opacity:0.85;">⚠️ C${disc.discrepanciaCompetencia.competencia} variou ${disc.discrepanciaCompetencia.diferenca} pts (${disc.discrepanciaCompetencia.nota_anterior}→${disc.discrepanciaCompetencia.nota_nova}).</div>` : ''}
              </div>`;
          } else if (classificacao === 'alta') {
            return `
              <div style="margin-bottom:10px; padding:8px 12px; border-radius:var(--radius-sm); font-size:0.78rem; background:rgba(239,68,68,0.07); border:1px solid rgba(239,68,68,0.3); color:#f87171;">
                ⚠️ <strong>Variação alta (${Math.abs(diffNota)} pts).</strong> Diferença entre 81 e 100 pts. Ambas as avaliações estão preservadas.
                ${disc?.discrepanciaCompetencia ? `<div style="font-size:0.73rem; opacity:0.85; margin-top:2px;">C${disc.discrepanciaCompetencia.competencia} variou ${disc.discrepanciaCompetencia.diferenca} pts.</div>` : ''}
              </div>`;
          } else if (classificacao === 'moderada') {
            return `
              <div style="margin-bottom:10px; padding:8px 12px; border-radius:var(--radius-sm); font-size:0.78rem; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); color:#f59e0b;">
                ⚠️ <strong>Variação moderada (${Math.abs(diffNota)} pts).</strong> Diferença entre 41 e 80 pts. Ambas preservadas.
              </div>`;
          }
          return '';
        })();

        return `
          <div style="margin-bottom:20px; padding:14px 16px; border-radius:var(--radius-md); background:rgba(56,189,248,0.06); border:1px solid rgba(56,189,248,0.25);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
              <strong style="font-size:0.88rem; color:#38bdf8; display:flex; align-items:center; gap:6px;">
                <span>⚖️</span> Comparativo com a Avaliação Anterior
              </strong>
              <span style="font-size:0.8rem; font-weight:800; color:${corDiff};">
                Nota anterior: ${anterior.nota_total} → Nova: ${av.nota_total} (${diffSinal} pts)
              </span>
            </div>
            ${alerteDiscrepancia}
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; font-size:0.78rem;">
              ${(av.competencias || []).map((c, i) => {
                const compAntiga = (anterior.competencias || [])[i];
                const notaAnt = compAntiga ? compAntiga.nota : '-';
                const deltaC = compAntiga ? c.nota - compAntiga.nota : 0;
                const deltaStr = compAntiga ? (deltaC > 0 ? `+${deltaC}` : `${deltaC}`) : '-';
                return `
                  <div style="background:var(--bg-elevated); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); text-align:center;">
                    <div style="font-weight:700; color:var(--text-secondary); margin-bottom:2px;">C${c.numero}</div>
                    <div style="font-size:0.85rem; font-weight:800; color:var(--text-primary);">${c.nota} <span style="font-size:0.75rem; color:var(--text-secondary);">(ant: ${notaAnt})</span></div>
                    <div style="font-size:0.7rem; font-weight:700; color:${deltaC > 0 ? '#22c55e' : deltaC < 0 ? '#ef4444' : 'var(--text-secondary)'};">${deltaStr}</div>
                  </div>
                `;
              }).join('')}
            </div>
            <div style="margin-top:10px; font-size:0.74rem; color:var(--text-secondary); text-align:right;">
              Avaliação anterior realizada em ${new Date(anterior.corrigido_em || Date.now()).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        `;
      })()}

      <!-- Evolução do Aluno (somente dados reais do histórico desta redação) -->
      ${(() => {
        const hist = Array.isArray(r.historico_avaliacoes) ? r.historico_avaliacoes : [];
        if (hist.length < 1) return '';
        const timeline = [...hist].reverse().map(h => ({ nota: h.nota_total, atual: false }));
        timeline.push({ nota: av.nota_total, atual: true });
        const max = av.nota_maxima || 1000;

        return `
          <div style="margin-bottom:20px; padding:14px 18px; border-radius:var(--radius-md); background:rgba(124,58,237,0.05); border:1px solid rgba(124,58,237,0.2);">
            <div style="font-size:0.86rem; font-weight:800; color:var(--color-primary-400); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
              <span>📈</span> Minha Evolução Nesta Redação
            </div>
            <div style="display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; padding:6px 0;">
              ${timeline.map((item, idx) => {
                const h = Math.max(14, Math.round((item.nota / max) * 75));
                const cor = item.atual ? 'var(--color-primary-400)' : '#38bdf8';
                const label = item.atual ? 'Atual' : `Versão ${idx + 1}`;
                return `
                  <div style="display:flex; flex-direction:column; align-items:center; gap:4px; min-width:54px;">
                    <span style="font-size:0.75rem; font-weight:800; color:${cor};">${item.nota}</span>
                    <div style="width:36px; height:${h}px; background:${cor}${item.atual ? '' : '80'}; border-radius:4px 4px 0 0; transition:height 0.3s ease;"></div>
                    <span style="font-size:0.65rem; color:var(--text-secondary); text-align:center;">${label}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      })()}

      <!-- Competências Avaliadas -->
      <div style="margin-bottom:20px;">
        <h5 style="font-size:0.92rem; font-weight:800; margin-bottom:12px; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.04em;">
          Detalhamento por Competência
        </h5>
        <div style="display:flex; flex-direction:column; gap:14px;">
          ${(av.competencias || []).map(c => {
            const peso = Number(c.nota_maxima) || 200;
            const pct = Math.min(100, Math.round((c.nota / peso) * 100));
            const corBarra = pct >= 80 ? '#22c55e' : pct >= 60 ? '#38bdf8' : pct >= 40 ? '#f59e0b' : '#ef4444';
            const nivel = c.nivel || '';
            const nivelCor = nivel === 'Excelente' ? '#22c55e' : nivel === 'Bom' ? '#38bdf8' : nivel === 'Médio' ? '#f59e0b' : '#ef4444';

            // Problemas estruturados (novo formato) ou legado (array de strings)
            const problemasHtml = (() => {
              if (!Array.isArray(c.problemas) || c.problemas.length === 0) return '';
              const items = c.problemas.map(p => {
                const isObj = typeof p === 'object' && p !== null;
                const tipo = isObj ? (p.tipo || 'PONTO_DE_ATENCAO') : 'ERRO';
                const descricao = isObj ? (p.descricao || '') : String(p);
                const trecho = isObj && p.trecho_original ? p.trecho_original : '';
                const sugestao = isObj && p.sugestao_reescrita ? p.sugestao_reescrita : '';
                const tipoCor = tipo === 'ERRO' ? '#ef4444' : tipo === 'PONTO_DE_ATENCAO' ? '#f59e0b' : '#38bdf8';
                const tipoBg = tipo === 'ERRO' ? 'rgba(239,68,68,0.08)' : tipo === 'PONTO_DE_ATENCAO' ? 'rgba(245,158,11,0.08)' : 'rgba(56,189,248,0.08)';
                const tipoLabel = tipo === 'ERRO' ? '❌ Erro' : tipo === 'PONTO_DE_ATENCAO' ? '⚠️ Atenção' : '💡 Sugestão';
                return `<div style="padding:8px 12px; border-radius:var(--radius-sm); background:${tipoBg}; border-left:3px solid ${tipoCor}; margin-bottom:6px;">
                  <span style="font-size:0.72rem; font-weight:800; color:${tipoCor};">${tipoLabel}</span>
                  <span style="font-size:0.79rem; color:var(--text-primary); margin-left:6px; line-height:1.45;">${escapeHtml(descricao)}</span>
                  ${trecho ? `
                    <div style="margin-top:6px; padding:6px 10px; background:rgba(255,255,255,0.04); border-radius:var(--radius-sm); border:1px solid rgba(255,255,255,0.08);">
                      <div style="font-size:0.67rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px;">
                        Evidência encontrada
                      </div>
                      <blockquote style="margin:0; font-size:0.78rem; font-style:italic; color:var(--text-primary); border-left:2px solid ${tipoCor}; padding-left:8px;">
                        "${escapeHtml(trecho)}"
                      </blockquote>
                      ${sugestao ? `
                        <div style="margin-top:4px; font-size:0.75rem; color:#38bdf8;">
                          <strong>Sugestão prática:</strong> ${escapeHtml(sugestao)}
                        </div>
                      ` : ''}
                    </div>
                  ` : ''}
                </div>`;
              }).join('');
              return `<div style="margin-top:8px;">${items}</div>`;
            })();

            // Elementos estruturados C5 (caso presentes no analise)
            const elementosC5Html = (c.numero === 5 && c.analise?.elementos_proposta) ? (() => {
              const ep = c.analise.elementos_proposta;
              const itens = [
                { nome: 'Agente', status: ep.agente },
                { nome: 'Ação', status: ep.acao },
                { nome: 'Meio/Modo', status: ep.meio },
                { nome: 'Finalidade', status: ep.finalidade },
                { nome: 'Detalhamento', status: ep.detalhamento }
              ];
              return `
                <div style="margin-top:8px; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:var(--radius-sm);">
                  <div style="font-size:0.69rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; margin-bottom:5px;">
                    Estrutura da Proposta de Intervenção (5 Elementos INEP):
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:5px;">
                    ${itens.map(it => {
                      const st = String(it.status || '').toLowerCase();
                      const corBadge = st.includes('presente') ? '#22c55e' : st.includes('insuficiente') ? '#f59e0b' : '#ef4444';
                      return `
                        <span style="font-size:0.69rem; padding:2px 7px; border-radius:var(--radius-full); background:${corBadge}15; border:1px solid ${corBadge}40; color:${corBadge}; font-weight:700;">
                          ${it.nome}: ${escapeHtml(it.status || 'não informado')}
                        </span>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            })() : '';

            // Pontos positivos
            const pontosPositivosHtml = (() => {
              const lista = Array.isArray(c.pontos_positivos) ? c.pontos_positivos : [];
              if (lista.length === 0) return '';
              return `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">
                ${lista.map(p => `<span style="font-size:0.72rem; background:rgba(34,197,94,0.1); color:#22c55e; border:1px solid rgba(34,197,94,0.3); border-radius:var(--radius-sm); padding:2px 8px;">✓ ${escapeHtml(String(p))}</span>`).join('')}
              </div>`;
            })();

            // Evidências textuais
            const evidenciasHtml = (() => {
              const lista = Array.isArray(c.evidencias_textuais) && c.evidencias_textuais.length > 0
                ? c.evidencias_textuais
                : Array.isArray(c.evidencias) ? c.evidencias : [];
              if (lista.length === 0) return '';
              return `<div style="margin-top:6px; font-size:0.75rem; color:var(--text-secondary);">
                <span style="font-weight:700; color:var(--text-primary);">📝 Evidências:</span>
                <ul style="margin:2px 0 0; padding-left:16px; line-height:1.4;">
                  ${lista.map(e => `<li style="font-style:italic;">${escapeHtml(String(e))}</li>`).join('')}
                </ul>
              </div>`;
            })();

            return `
              <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:14px 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
                  <span style="font-weight:700; font-size:0.88rem; color:var(--text-primary);">
                    Competência ${c.numero}: ${escapeHtml(c.nome)}
                  </span>
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${(() => {
                      const prio = c.prioridade || '';
                      if (!prio) return '';
                      const prioMap = { alta: { emoji: '🔴', label: 'Prioridade Alta', cor: '#ef4444' }, media: { emoji: '🟡', label: 'Prioridade Média', cor: '#f59e0b' }, baixa: { emoji: '🟢', label: 'Prioridade Baixa', cor: '#22c55e' } };
                      const p = prioMap[prio];
                      return p ? `<span title="${escapeHtml(p.label)}" style="font-size:0.7rem; font-weight:700; color:${p.cor}; background:${p.cor}15; border:1px solid ${p.cor}40; border-radius:var(--radius-full); padding:2px 7px;">${p.emoji} ${escapeHtml(p.label)}</span>` : '';
                    })()}
                    ${nivel ? `<span style="font-size:0.72rem; font-weight:800; color:${nivelCor}; background:${nivelCor}18; border:1px solid ${nivelCor}40; border-radius:var(--radius-full); padding:2px 8px;">${escapeHtml(nivel)}</span>` : ''}
                    <span style="font-weight:800; font-size:0.9rem; color:var(--color-primary-400);">${c.nota} / ${peso} pts</span>
                  </div>
                </div>
                <div style="background:rgba(255,255,255,0.06); height:6px; border-radius:var(--radius-full); overflow:hidden; margin-bottom:10px;">
                  <div style="background:${corBarra}; height:100%; width:${pct}%; transition:width 0.4s ease;"></div>
                </div>
                <p style="margin:0 0 4px; font-size:0.82rem; color:var(--text-secondary); line-height:1.5;">
                  ${escapeHtml(c.justificativa)}
                </p>
                ${elementosC5Html}
                ${pontosPositivosHtml}
                ${problemasHtml}
                ${evidenciasHtml}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Feedback Geral -->
      ${av.feedback_geral ? `
        <div style="margin-bottom:20px; background:rgba(124,58,237,0.06); border:1px solid rgba(124,58,237,0.18); border-radius:var(--radius-md); padding:14px 16px;">
          <h5 style="font-size:0.88rem; font-weight:800; margin:0 0 6px; color:var(--color-primary-400);">
            Análise Geral do Avaliador:
          </h5>
          <p style="margin:0; font-size:0.84rem; line-height:1.55; color:var(--text-primary);">
            ${escapeHtml(av.feedback_geral)}
          </p>
        </div>
      ` : ''}

      <!-- Pontos Fortes e Pontos a Melhorar -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px; margin-bottom:20px;">
        <!-- Fortes -->
        <div style="background:rgba(34,197,94,0.06); border:1px solid rgba(34,197,94,0.2); border-radius:var(--radius-md); padding:14px;">
          <h5 style="font-size:0.84rem; font-weight:800; margin:0 0 8px; color:#22c55e; display:flex; align-items:center; gap:6px;">
            <span>👍</span> Pontos Fortes
          </h5>
          <ul style="margin:0; padding-left:18px; font-size:0.8rem; color:var(--text-secondary); line-height:1.5;">
            ${(av.pontos_fortes || []).map(p => `<li>${escapeHtml(p)}</li>`).join('')}
          </ul>
        </div>

        <!-- Melhorias -->
        <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.2); border-radius:var(--radius-md); padding:14px;">
          <h5 style="font-size:0.84rem; font-weight:800; margin:0 0 8px; color:#f59e0b; display:flex; align-items:center; gap:6px;">
            <span>🎯</span> Problemas Identificados
          </h5>
          <ul style="margin:0; padding-left:18px; font-size:0.8rem; color:var(--text-secondary); line-height:1.5;">
            ${(av.pontos_melhoria || []).map(p => `<li>${escapeHtml(p)}</li>`).join('')}
          </ul>
        </div>
      </div>

      <!-- Exemplos de Trechos para Revisão -->
      ${(av.exemplos_trechos && av.exemplos_trechos.length > 0) ? `
        <div style="background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); border-radius:var(--radius-md); padding:14px; margin-bottom:20px;">
          <h5 style="font-size:0.84rem; font-weight:800; margin:0 0 8px; color:#ef4444; display:flex; align-items:center; gap:6px;">
            <span>🔍</span> Trechos que Precisam Melhorar & Reescrita Sugerida
          </h5>
          <ul style="margin:0; padding-left:18px; font-size:0.8rem; color:var(--text-secondary); line-height:1.55;">
            ${av.exemplos_trechos.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Seção: Como Subir Sua Nota -->
      ${(() => {
        const prioridadesEstudo = Array.isArray(av.prioridades_estudo) ? av.prioridades_estudo : [];
        const sugestoesGerais = Array.isArray(av.sugestoes) ? av.sugestoes : [];
        const compsComMargem = [...(av.competencias || [])].filter(c => c.nota < (Number(c.nota_maxima) || 200)).sort((a, b) => a.nota - b.nota);

        if (prioridadesEstudo.length === 0 && sugestoesGerais.length === 0 && compsComMargem.length === 0) {
          return '';
        }

        return `
          <div style="margin-bottom:20px; background:rgba(124,58,237,0.05); border:1px solid rgba(124,58,237,0.22); border-radius:var(--radius-md); padding:16px 18px;">
            <h5 style="font-size:0.92rem; font-weight:800; margin:0 0 10px; color:var(--color-primary-400); display:flex; align-items:center; gap:8px;">
              <span>🚀</span> Como Subir Sua Nota na Próxima Redação
            </h5>

            ${compsComMargem.length > 0 ? `
              <div style="margin-bottom:12px; font-size:0.8rem; color:var(--text-secondary); line-height:1.5;">
                Suas maiores oportunidades de ganho de pontos identificadas na avaliação:
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
                  ${compsComMargem.slice(0, 3).map(c => `
                    <span style="font-size:0.75rem; font-weight:700; background:rgba(124,58,237,0.12); color:var(--color-primary-400); border:1px solid rgba(124,58,237,0.25); border-radius:var(--radius-full); padding:2px 10px;">
                      C${c.numero} (+${(Number(c.nota_maxima) || 200) - c.nota} pts possíveis)
                    </span>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${prioridadesEstudo.length > 0 ? `
              <div style="margin-top:10px;">
                <div style="font-size:0.76rem; font-weight:800; color:var(--text-primary); text-transform:uppercase; margin-bottom:4px;">
                  📌 Ações Práticas Recomendadas:
                </div>
                <ul style="margin:0; padding-left:18px; font-size:0.82rem; color:var(--text-secondary); line-height:1.55;">
                  ${prioridadesEstudo.map(pe => `<li>${escapeHtml(pe)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${sugestoesGerais.length > 0 ? `
              <div style="margin-top:10px;">
                <div style="font-size:0.76rem; font-weight:800; color:var(--text-primary); text-transform:uppercase; margin-bottom:4px;">
                  💡 Orientações Práticas:
                </div>
                <ul style="margin:0; padding-left:18px; font-size:0.82rem; color:var(--text-secondary); line-height:1.55;">
                  ${sugestoesGerais.slice(0, 3).map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        `;
      })()}

      <!-- Reavaliar Button & Aviso Educacional -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:14px; border-top:1px solid var(--border-color);">
        <button id="btn-reavaliar-ia" class="btn btn-secondary" data-id="${r.id}" style="font-size:0.8rem; padding:6px 14px;">
          Reavaliar com IA 🔄
        </button>
        <span style="font-size:0.74rem; color:var(--text-secondary); max-width:440px;">
          ${escapeHtml(av.aviso_educacional || 'Estimativa pedagógica baseada nos critérios do ENEM.')}
        </span>
      </div>
      <div id="correcao-ia-feedback" style="margin-top:10px; font-size:0.82rem; display:none;"></div>
    </div>
  `;
}

async function solicitarCorrecaoIA(redacaoId, btn) {
  if (!btn || btn.disabled) return;

  const feedbackEl = document.getElementById('correcao-ia-feedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.style.color = 'var(--text-secondary)';
    feedbackEl.textContent = '⏳ Verificando credenciais e iniciando análise com IA...';
  }

  // Verifica autenticação
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    if (feedbackEl) {
      feedbackEl.style.color = '#ef4444';
      feedbackEl.textContent = '⚠️ É necessário estar logado na sua conta para solicitar a correção por IA.';
    }
    alert('⚠️ Faça login na sua conta do Vestibular+ para corrigir a redação.');
    return;
  }

  // Bloqueio de cliques duplicados e estado de carregamento
  btn.disabled = true;
  const textoOriginalBtn = btn.innerHTML;
  btn.innerHTML = 'Analisando redação com IA... ⏳';

  // Animação de status pedagógico
  let step = 0;
  const statusMsgs = [
    'Analisando estrutura dissertativa e gramática... ⏳',
    'Avaliando repertório sociocultural e argumentação... ⏳',
    'Computando notas oficiais por competência da banca... ⏳',
    'Sintetizando pontos fortes e orientações práticas... ⏳'
  ];
  const intervalStatus = setInterval(() => {
    step = (step + 1) % statusMsgs.length;
    if (feedbackEl) feedbackEl.textContent = statusMsgs[step];
  }, 3500);

  try {
    const response = await fetch('/api/corrigir-redacao', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ redacaoId })
    });

    clearInterval(intervalStatus);

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 503) {
        throw new Error(
          '🔑 Provedor de IA não configurado no servidor. Configure a variável GROQ_API_KEY (ou GEMINI_API_KEY) no painel da Vercel para habilitar a correção.'
        );
      }
      throw new Error(data?.error || `Falha na requisição (${response.status})`);
    }

    if (!data.avaliacao) {
      throw new Error('A resposta do servidor não continha os dados da avaliação.');
    }

    // Diagnóstico de falha de persistência (sem expor tokens nem texto da redação)
    if (!data.persistido_no_banco && data.pendencia_persistencia) {
      console.warn('[redacao] Falha na persistência da avaliação:', data.pendencia_persistencia);
    }

    // Atualiza histórico local com o retorno autêntico do servidor
    const historico = lerHistoricoLocal(sessionUserId);
    const itemIndex = historico.findIndex(item => item.id === redacaoId);

    const compsCount = Array.isArray(data.avaliacao.competencias) ? data.avaliacao.competencias.length : 0;
    const ehIncompleta = compsCount < 5;

    const novaAvaliacao = {
      ...data.avaliacao,
      persistido_no_banco: Boolean(data.persistido_no_banco),
      avaliacao_incompleta: ehIncompleta,
      // Inclui fingerprint e versão da rubrica para rastreabilidade
      fingerprint: data.fingerprint || null,
      rubrica_versao: data.rubrica_versao || null
    };

    // Informação de discrepância retornada pelo servidor (comparação com BD)
    // ou calculada localmente se o servidor não pôde comparar (ex: persistência pendente)
    let discrepanciaLocal = data.discrepancia || null;

    if (itemIndex !== -1) {
      const redacaoAtual = historico[itemIndex];

      // Se já existia avaliação anterior e servidor não trouxe discrepância, calcula localmente
      // com os mesmos 4 níveis usados no backend
      if (redacaoAtual.avaliacao_ia && !discrepanciaLocal) {
        const notaAnterior = Number(redacaoAtual.avaliacao_ia.nota_total);
        const notaNova = Number(novaAvaliacao.nota_total);
        const diferenca = notaNova - notaAnterior;
        const abs = Math.abs(diferenca);
        let classificacao, label;
        if (abs > 100) {
          classificacao = 'inconsistente';
          label = `⚠️ Variação crítica (${diferenca > 0 ? '+' : ''}${diferenca} pts): diferença acima de 100 pts. Ambas as avaliações preservadas para diagnóstico.`;
        } else if (abs > 80) {
          classificacao = 'alta';
          label = `⚠️ Variação alta (${diferenca > 0 ? '+' : ''}${diferenca} pts): diferença entre 81 e 100 pts.`;
        } else if (abs > 40) {
          classificacao = 'moderada';
          label = `Variação moderada (${diferenca > 0 ? '+' : ''}${diferenca} pts): diferença entre 41 e 80 pts.`;
        } else {
          classificacao = 'normal';
          label = `Variação pequena (${diferenca > 0 ? '+' : ''}${diferenca} pts): dentro do intervalo esperado.`;
        }
        discrepanciaLocal = {
          diferenca,
          classificacao,
          label,
          nota_anterior: notaAnterior,
          nota_nova: notaNova
        };
      }

      // Preserva avaliação anterior no histórico
      if (redacaoAtual.avaliacao_ia) {
        if (!Array.isArray(redacaoAtual.historico_avaliacoes)) {
          redacaoAtual.historico_avaliacoes = [];
        }
        redacaoAtual.historico_avaliacoes.unshift({ ...redacaoAtual.avaliacao_ia });
      }

      // Se discrepância crítica: marca a nova avaliação como inconsistente
      // mas NÃO descarta — preserva ambas para o aluno consultar
      if (discrepanciaLocal?.classificacao === 'inconsistente') {
        novaAvaliacao.avaliacao_inconsistente = true;
        novaAvaliacao.discrepancia = discrepanciaLocal;
      } else if (discrepanciaLocal) {
        novaAvaliacao.discrepancia = discrepanciaLocal;
      }

      redacaoAtual.avaliacao_ia = novaAvaliacao;
      redacaoAtual.status = 'corrigida_por_ia';
    } else {
      // Redação não estava no histórico local (ex: localStorage limpo) — cria entrada mínima
      historico.unshift({
        id: redacaoId,
        status: 'corrigida_por_ia',
        data_envio: new Date().toISOString(),
        avaliacao_ia: novaAvaliacao,
        historico_avaliacoes: []
      });
    }
    localStorage.setItem(getHistoricoKey(sessionUserId), JSON.stringify(historico));

    // Sucesso! Re-renderiza o modal atualizado
    abrirModalDetalhesRedacao(redacaoId);
    renderizarHistorico();

  } catch (err) {
    clearInterval(intervalStatus);
    console.error('[redacao] Erro na correção por IA:', err);
    btn.disabled = false;
    btn.innerHTML = textoOriginalBtn;

    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.style.color = '#ef4444';
      feedbackEl.innerHTML = `❌ ${escapeHtml(err.message)}`;
    } else {
      alert(`❌ ${err.message}`);
    }
  }
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
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
        <span class="banca-tag">${escapeHtml(r.vestibular_nome)}</span>
        ${r.avaliacao_ia ? `
          <span style="font-size:0.75rem; font-weight:800; color:#22c55e;">
            ✓ Redação Avaliada
          </span>
        ` : ''}
      </div>
      <h3 style="font-size:1.15rem; margin:6px 0 4px; font-family:var(--font-display);">${escapeHtml(r.proposta_titulo)}</h3>
      <div style="font-size:0.8rem; color:var(--text-secondary);">
        Extensão: ${r.palavras} palavras · Tempo de escrita: ${escapeHtml(r.tempo_formatado)}
      </div>
    </div>

    <!-- Bloco Dinâmico de Correção com IA -->
    ${renderizarBlocoAvaliacaoIA(r, matriz)}

    <!-- Texto do Aluno -->
    <div style="margin-bottom:20px;">
      <h4 style="font-size:0.9rem; margin-bottom:8px; color:var(--text-secondary);">Seu Texto Redigido:</h4>
      <div id="modal-detalhe-texto-aluno" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:16px 18px; font-size:0.95rem; line-height:1.75; white-space:pre-wrap; max-height:260px; overflow-y:auto; color:var(--text-primary);"></div>
    </div>

    <!-- Matriz de Critérios Oficiais da Banca -->
    <div style="background:rgba(124,58,237,0.06); border:1px solid rgba(124,58,237,0.2); border-radius:var(--radius-md); padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <strong style="font-size:0.92rem; color:var(--color-primary-400);">
          Critérios de Avaliação Oficiais (${matriz.nome})
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
  `;

  const elTexto = document.getElementById('modal-detalhe-texto-aluno');
  if (elTexto) elTexto.textContent = r.texto || '';

  // Configura listeners do botão de correção
  const btnCorrigir = document.getElementById('btn-disparar-correcao-ia');
  if (btnCorrigir) {
    btnCorrigir.addEventListener('click', () => {
      solicitarCorrecaoIA(r.id, btnCorrigir);
    });
  }

  const btnReavaliar = document.getElementById('btn-reavaliar-ia');
  if (btnReavaliar) {
    btnReavaliar.addEventListener('click', () => {
      const confirmou = confirm('Deseja solicitar uma nova avaliação desta redação pela IA?');
      if (confirmou) {
        solicitarCorrecaoIA(r.id, btnReavaliar);
      }
    });
  }

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
  const tabEvolucao = document.getElementById('tab-btn-evolucao');

  const abaPropostas = document.getElementById('aba-propostas');
  const abaEditor = document.getElementById('aba-editor');
  const abaHistorico = document.getElementById('aba-historico');
  const abaEvolucao = document.getElementById('aba-evolucao');

  tabPropostas?.addEventListener('click', () => {
    tabPropostas.classList.add('active');
    tabEditor?.classList.remove('active');
    tabHistorico?.classList.remove('active');
    tabEvolucao?.classList.remove('active');
    abaPropostas.style.display = 'block';
    if (abaEditor) abaEditor.style.display = 'none';
    if (abaHistorico) abaHistorico.style.display = 'none';
    if (abaEvolucao) abaEvolucao.style.display = 'none';
  });

  tabEditor?.addEventListener('click', () => {
    tabEditor.classList.add('active');
    tabPropostas?.classList.remove('active');
    tabHistorico?.classList.remove('active');
    tabEvolucao?.classList.remove('active');
    abaEditor.style.display = 'flex';
    if (abaPropostas) abaPropostas.style.display = 'none';
    if (abaHistorico) abaHistorico.style.display = 'none';
    if (abaEvolucao) abaEvolucao.style.display = 'none';
  });

  tabHistorico?.addEventListener('click', () => {
    tabHistorico.classList.add('active');
    tabPropostas?.classList.remove('active');
    tabEditor?.classList.remove('active');
    tabEvolucao?.classList.remove('active');
    abaHistorico.style.display = 'flex';
    if (abaPropostas) abaPropostas.style.display = 'none';
    if (abaEditor) abaEditor.style.display = 'none';
    if (abaEvolucao) abaEvolucao.style.display = 'none';
    renderizarHistorico();
  });

  tabEvolucao?.addEventListener('click', () => {
    tabEvolucao.classList.add('active');
    tabPropostas?.classList.remove('active');
    tabEditor?.classList.remove('active');
    tabHistorico?.classList.remove('active');
    if (abaEvolucao) abaEvolucao.style.display = 'flex';
    if (abaPropostas) abaPropostas.style.display = 'none';
    if (abaEditor) abaEditor.style.display = 'none';
    if (abaHistorico) abaHistorico.style.display = 'none';
    renderizarEvolucaoInteligente();
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

  // Recalcula linhas visuais em resize da janela
  let resizeTimeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (propostaAtiva) {
        atualizarContadores();
      }
    }, 150);
  });

  // Salva rascunho e tempo antes de descarregar a página
  window.addEventListener('beforeunload', () => {
    if (propostaAtiva) {
      const textarea = document.getElementById('redacao-texto-input');
      salvarRascunhoStorage(sessionUserId, propostaAtiva.id, textarea ? textarea.value : '', timerSegundos);
    }
  });
}

iniciar();

// ================================================================
// DIAGNÓSTICO DE AMBIENTE — APENAS PARA DEVTOOLS
// ================================================================
// Uso: abra DevTools (F12) → Console e execute:
//   await __vpDiag()              — verifica variáveis de ambiente no backend
//   await __vpDiag('id-redacao')  — também testa correção real e exibe pendencia_persistencia
//
// Nunca expõe tokens, chaves ou texto de redação. Usa a sessão existente automaticamente.
// Não está visível na interface. Removível após diagnóstico concluído.
// ================================================================
window.__vpDiag = async function(redacaoId) {
  const PREFIXO = '[vpDiag]';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.warn(PREFIXO, 'Nenhuma sessão ativa. Faça login no Vestibular+ primeiro.');
      return { erro: 'Sem sessão autenticada' };
    }

    const headers = {
      'Authorization': `Bearer ${session.access_token}`,
      'X-VP-Diag': '1'
    };

    // 1. Diagnóstico de variáveis de ambiente
    console.group(PREFIXO + ' Verificando variáveis de ambiente do backend...');
    let resultadoDiag = null;
    try {
      const resp = await fetch('/api/diagnostico-env', { headers });
      resultadoDiag = await resp.json();
      if (resp.ok && resultadoDiag.diagnostico) {
        const d = resultadoDiag.diagnostico;
        console.log('SUPABASE_SERVICE_ROLE_KEY presente:', d.SUPABASE_SERVICE_ROLE_KEY);
        console.log('GROQ_API_KEY presente:', d.GROQ_API_KEY);
        console.log('SUPABASE_URL presente:', d.SUPABASE_URL, '| VITE_SUPABASE_URL:', d.VITE_SUPABASE_URL);
        console.log('Supabase URL (prefixo):', d.supabase_url_prefixo);
        console.log('Cliente que será usado no INSERT:', d.cliente_insert_usara);
        if (d.GROQ_MODEL) console.log('Modelo Groq configurado:', d.GROQ_MODEL);
      } else {
        console.warn(PREFIXO, 'Resposta inesperada do /api/diagnostico-env:', resultadoDiag);
      }
    } catch (e) {
      console.error(PREFIXO, 'Falha ao chamar /api/diagnostico-env:', e.message);
    }
    console.groupEnd();

    // 2. Teste de correção real (opcional — só executa se redacaoId fornecido)
    let resultadoCorrecao = null;
    if (redacaoId) {
      console.group(PREFIXO + ` Testando correção da redação ${redacaoId}...`);
      try {
        const respCorr = await fetch('/api/corrigir-redacao', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ redacaoId })
        });
        resultadoCorrecao = await respCorr.json();

        if (respCorr.ok) {
          console.log('persistido_no_banco:', resultadoCorrecao.persistido_no_banco);
          console.log('avaliacao_id (banco):', resultadoCorrecao.avaliacao_id);

          if (!resultadoCorrecao.persistido_no_banco && resultadoCorrecao.pendencia_persistencia) {
            const p = resultadoCorrecao.pendencia_persistencia;
            console.group('⚠️ Falha na persistência — detalhes do Supabase:');
            console.log('code:', p.code);
            console.log('message:', p.message);
            console.log('details:', p.details);
            console.log('hint:', p.hint);
            console.log('cliente usado:', p.cliente);
            console.log('campos do payload:', p.payload_campos);
            console.groupEnd();
          } else if (resultadoCorrecao.persistido_no_banco) {
            console.log('✅ Persistência confirmada! ID:', resultadoCorrecao.avaliacao_id);
          }
        } else {
          console.warn(PREFIXO, 'Erro HTTP na correção:', respCorr.status, resultadoCorrecao?.error);
        }
      } catch (e) {
        console.error(PREFIXO, 'Falha ao chamar /api/corrigir-redacao:', e.message);
      }
      console.groupEnd();
    } else {
      console.info(PREFIXO, 'Para testar a correção completa, passe um ID de redação: await __vpDiag("uuid-da-redacao")');
    }

    return { diag: resultadoDiag, correcao: resultadoCorrecao };
  } catch (err) {
    console.error(PREFIXO, 'Erro inesperado no diagnóstico:', err.message);
    return { erro: err.message };
  }
};
