import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { obterPlanoUsuario, isUltimate, getPlanLimit } from '../lib/permissions.js';

// Elementos do DOM
const mensagensEl = document.getElementById('mensagens');
const chatConversaEl = document.getElementById('chat-conversa');
const emptyStateEl = document.getElementById('empty-state');
const formEl = document.getElementById('form-mensagem');
const inputEl = document.getElementById('input-mensagem');
const btnEnviar = document.getElementById('btn-enviar');
const usoBadge = document.getElementById('uso-badge');
const headerPlanoBadge = document.getElementById('header-plano-badge');
const filtroContainer = document.getElementById('filtro-materias');
const tutorHeaderTitle = document.getElementById('tutor-header-title');
const tutorSubCargo = document.getElementById('tutor-sub-cargo');
const tutorAvatar = document.getElementById('tutor-avatar');
const btnNovoChat = document.getElementById('btn-novo-chat');
const btnHistorico = document.getElementById('btn-historico');
const drawerOverlay = document.getElementById('drawer-overlay');
const historicoDrawer = document.getElementById('historico-drawer');
const btnFecharDrawer = document.getElementById('btn-fechar-drawer');
const drawerListaHistorico = document.getElementById('drawer-lista-historico');
const modalConfirmOverlay = document.getElementById('modal-confirm-overlay');
const btnCancelarLimpar = document.getElementById('btn-cancelar-limpar');
const btnConfirmarLimpar = document.getElementById('btn-confirmar-limpar');
const btnAnexo = document.getElementById('btn-anexo');
const inputAnexoFile = document.getElementById('input-anexo-file');
const sugestoesGrid = document.getElementById('sugestoes-grid');

let userId = null;
let historico = []; // { role: 'usuario' | 'assistente', texto: string }
let materiaAtiva = { id: '', nome: '', icone: '📚' };
let materiasLista = [];
let enviando = false;
let conversaAtualId = null;
let planoInfo = { nome: 'free', ordem: 0, isUltimate: false };

const STORAGE_HISTORICO_KEY = 'vestibular_chat_sessoes';

// Mapeamento padrão de ícones para matérias escolares comuns
const ICONES_MATERIAS = {
  matematica: '📐',
  física: '⚡',
  fisica: '⚡',
  quimica: '🧪',
  química: '🧪',
  biologia: '🧬',
  historia: '🌎',
  história: '🌎',
  geografia: '🗺️',
  portugues: '📚',
  português: '📚',
  literatura: '📖',
  redacao: '✍️',
  redação: '✍️',
  ingles: '🇬🇧',
  inglês: '🇬🇧',
  filosofia: '🏛️',
  sociologia: '👥',
};

function obterIconeMateria(nome, iconeBanco) {
  if (iconeBanco) return iconeBanco;
  if (!nome) return '📚';
  const normalizado = nome.toLowerCase().trim();
  return ICONES_MATERIAS[normalizado] || '📖';
}

const DEFAULT_MATERIAS = [
  { id: 'matematica', nome: 'Matemática', cor: '#7c3aed', icone: '📐' },
  { id: 'portugues', nome: 'Português', cor: '#3b82f6', icone: '📚' },
  { id: 'fisica', nome: 'Física', cor: '#a855f7', icone: '⚡' },
  { id: 'quimica', nome: 'Química', cor: '#38bdf8', icone: '🧪' },
  { id: 'biologia', nome: 'Biologia', cor: '#22c55e', icone: '🧬' },
  { id: 'historia', nome: 'História', cor: '#f59e0b', icone: '🌎' },
  { id: 'geografia', nome: 'Geografia', cor: '#ef4444', icone: '🗺️' },
  { id: 'redacao', nome: 'Redação', cor: '#ec4899', icone: '✍️' },
];

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  userId = session.user.id;

  // Carrega plano centralizado
  planoInfo = await obterPlanoUsuario(userId);
  aplicarBadgePlanoHeader();

  // Carrega matérias e saldo de uso paralelamente
  let materias = null;
  try {
    const [resMaterias] = await Promise.all([
      supabase.from('materias').select('id, nome, cor, icone').order('ordem'),
      atualizarBadgeInicial(userId),
    ]);
    materias = resMaterias.data;
  } catch (err) {
    console.warn('Usando lista padrão de matérias:', err);
  }

  materiasLista = (materias && materias.length > 0) ? materias : DEFAULT_MATERIAS;

  // Verifica se veio alguma matéria por parâmetro de URL (ex: ?materia=Matemática ou ?materiaId=uuid)
  const urlParams = new URLSearchParams(window.location.search);
  const paramMateria = urlParams.get('materia');
  const paramMateriaId = urlParams.get('materiaId');

  renderFiltros(materiasLista);

  if (paramMateriaId) {
    selecionarMateriaPorId(paramMateriaId);
  } else if (paramMateria) {
    selecionarMateriaPorNome(paramMateria);
  } else {
    atualizarIdentificacaoTutor();
  }

  conversaAtualId = gerarIdSessao();

  configurarSugestoesIniciais();
  configurarEventosUI();
  configurarDrawerHistorico();

  iniciarNotificacoes(userId);
  iniciarBusca();
}

function aplicarBadgePlanoHeader() {
  if (!headerPlanoBadge) return;
  if (planoInfo.isUltimate) {
    headerPlanoBadge.textContent = '✦ ULTIMATE';
    headerPlanoBadge.className = 'plano-badge-tag ultimate';
    headerPlanoBadge.style.display = 'inline-flex';
  } else if (planoInfo.ordem >= 2) {
    headerPlanoBadge.textContent = 'PRO';
    headerPlanoBadge.className = 'plano-badge-tag';
    headerPlanoBadge.style.display = 'inline-flex';
  } else {
    headerPlanoBadge.style.display = 'none';
  }
}

// Renderiza a barra de chips de matérias
function renderFiltros(materias) {
  const chipsHtml = materias.map(m => {
    const icone = obterIconeMateria(m.nome, m.icone);
    return `
      <button type="button" class="chip" data-materia="${m.id}" data-nome="${m.nome}" data-icone="${icone}">
        <span>${icone}</span> <span>${m.nome}</span>
      </button>
    `;
  }).join('');

  filtroContainer.innerHTML = `
    <button type="button" class="chip active" data-materia="" data-nome="" data-icone="📚">
      <span>📚</span> <span>Todas as matérias</span>
    </button>
    ${chipsHtml}
  `;

  filtroContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      materiaAtiva = {
        id: chip.dataset.materia || '',
        nome: chip.dataset.nome || '',
        icone: chip.dataset.icone || '📚'
      };
      atualizarIdentificacaoTutor();
    });
  });
}

function selecionarMateriaPorId(id) {
  const chip = filtroContainer.querySelector(`.chip[data-materia="${id}"]`);
  if (chip) chip.click();
}

function selecionarMateriaPorNome(nome) {
  const nomeNorm = nome.toLowerCase().trim();
  const chip = Array.from(filtroContainer.querySelectorAll('.chip')).find(c => {
    return (c.dataset.nome || '').toLowerCase().trim() === nomeNorm;
  });
  if (chip) {
    chip.click();
  }
}

// Atualiza o Header e Avatar com a matéria selecionada
function atualizarIdentificacaoTutor() {
  if (materiaAtiva.nome) {
    tutorHeaderTitle.textContent = `Chat com IA · ${materiaAtiva.nome}`;
    tutorSubCargo.textContent = `Tutor de ${materiaAtiva.nome}`;
    tutorAvatar.innerHTML = `
      ${materiaAtiva.icone}
      <div class="tutor-avatar-status" title="Tutor de ${materiaAtiva.nome} disponível"></div>
    `;
  } else {
    tutorHeaderTitle.textContent = 'Chat com IA';
    tutorSubCargo.textContent = 'Tutor Geral';
    tutorAvatar.innerHTML = `
      🤖
      <div class="tutor-avatar-status" title="Tutor inteligente disponível online"></div>
    `;
  }
}

// Consulta do limite diário do usuário via RPC centralizada
async function atualizarBadgeInicial(userId) {
  try {
    const { data: uso, error } = await supabase.rpc('consultar_uso_diario', { p_tipo: 'chat' });
    const limiteOficial = getPlanLimit('chat_dia', planoInfo.nome) || 5;

    if (error || !uso) {
      definirBadge(0, limiteOficial);
      return;
    }

    definirBadge(uso.usado ?? 0, uso.limite ?? limiteOficial);
  } catch (e) {
    const limiteOficial = getPlanLimit('chat_dia', planoInfo.nome) || 5;
    definirBadge(0, limiteOficial);
  }
}

function definirBadge(usado, limite) {
  usoBadge.style.display = 'inline-flex';
  const limiteEfetivo = limite ?? getPlanLimit('chat_dia', planoInfo.nome) ?? 5;
  usoBadge.innerHTML = `<span class="uso-icon">💬</span> ${usado}/${limiteEfetivo} perguntas hoje`;
}

function rolarParaFinal() {
  if (chatConversaEl) {
    chatConversaEl.scrollTo({
      top: chatConversaEl.scrollHeight,
      behavior: 'smooth'
    });
  }
}

// Converte markdown seguro com títulos, listas, tabelas e código
function formatarTextoMarkdown(texto) {
  if (!texto) return '';

  // Sanitização estrita contra injeção de scripts HTML
  let seguro = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bloco de código: ```linguagem\n código ```
  seguro = seguro.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Código inline: `código`
  seguro = seguro.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Negrito: **texto** ou __texto__
  seguro = seguro.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  seguro = seguro.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Itálico: *texto* ou _texto_
  seguro = seguro.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Parágrafos, subtítulos e listas
  const linhas = seguro.split('\n');
  let html = '';
  let emLista = false;
  let emListaNum = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();

    if (linha.startsWith('### ')) {
      fecharListas();
      html += `<h4 style="margin:12px 0 6px; font-size:1rem; color:var(--text-primary); font-weight:700;">${linha.replace(/^###\s+/, '')}</h4>`;
    } else if (linha.startsWith('## ')) {
      fecharListas();
      html += `<h3 style="margin:14px 0 8px; font-size:1.1rem; color:var(--text-primary); font-weight:800;">${linha.replace(/^##\s+/, '')}</h3>`;
    } else if (/^\d+\.\s+/.test(linha)) {
      if (emLista) { html += '</ul>'; emLista = false; }
      if (!emListaNum) { html += '<ol style="margin: 8px 0 8px 22px; line-height:1.6;">'; emListaNum = true; }
      html += `<li>${linha.replace(/^\d+\.\s+/, '')}</li>`;
    } else if (linha.startsWith('- ') || linha.startsWith('* ') || linha.startsWith('• ')) {
      if (emListaNum) { html += '</ol>'; emListaNum = false; }
      if (!emLista) { html += '<ul style="margin: 8px 0 8px 20px; line-height:1.6;">'; emLista = true; }
      html += `<li>${linha.replace(/^[-*•]\s+/, '')}</li>`;
    } else {
      fecharListas();
      if (linha === '') {
        html += '<div style="height: 6px;"></div>';
      } else {
        html += `<p>${linha}</p>`;
      }
    }
  }

  fecharListas();

  function fecharListas() {
    if (emLista) { html += '</ul>'; emLista = false; }
    if (emListaNum) { html += '</ol>'; emListaNum = false; }
  }

  return html;
}

// Renderiza balão de mensagem
function renderMensagem(role, texto, mensagemOriginal = null) {
  if (emptyStateEl && emptyStateEl.style.display !== 'none') {
    emptyStateEl.style.display = 'none';
  }

  const row = document.createElement('div');
  row.className = `msg-row msg-row-${role}`;

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble msg-${role}`;

  if (role === 'tutor' || role === 'assistente') {
    const nomeTutor = materiaAtiva.nome ? `Tutor de ${materiaAtiva.nome}` : 'Tutor Vestibular+';
    const iconeTutor = materiaAtiva.nome ? materiaAtiva.icone : '🤖';

    bubble.innerHTML = `
      <div class="msg-tutor-header">
        <span class="tutor-label">
          <span>${iconeTutor}</span> ${nomeTutor}
        </span>
        <div class="msg-acoes-toolbar">
          <button type="button" class="btn-acao-msg btn-copiar" title="Copiar explicação">
            📋 Copiar
          </button>
          <button type="button" class="btn-acao-msg btn-regenerar" title="Regenerar resposta">
            🔄
          </button>
          <button type="button" class="btn-acao-msg btn-feedback-like" title="Útil 👍">
            👍
          </button>
          <button type="button" class="btn-acao-msg btn-feedback-dislike" title="Não útil 👎">
            👎
          </button>
        </div>
      </div>
      <div class="msg-conteudo">${formatarTextoMarkdown(texto)}</div>
      <div class="proximos-passos-wrap">
        <button type="button" class="btn-passo-sugestao" data-acao="exemplo">🔍 Ver exemplo</button>
        <button type="button" class="btn-passo-sugestao" data-acao="exercicio">📝 Criar exercício</button>
        <button type="button" class="btn-passo-sugestao destaque" data-acao="flashcards">✨ Criar flashcards</button>
        <button type="button" class="btn-passo-sugestao" data-acao="projeto">🎯 Criar projeto de estudos</button>
      </div>
    `;

    // Ações na resposta
    const btnCopiar = bubble.querySelector('.btn-copiar');
    btnCopiar?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(texto);
        btnCopiar.textContent = '✓ Copiado';
        setTimeout(() => { btnCopiar.textContent = '📋 Copiar'; }, 2000);
      } catch (err) {
        console.warn('Falha ao copiar:', err);
      }
    });

    const btnRegenerar = bubble.querySelector('.btn-regenerar');
    btnRegenerar?.addEventListener('click', () => {
      if (enviando) return;
      // Procura a última pergunta do usuário
      const ultimaPergunta = [...historico].reverse().find(h => h.role === 'usuario')?.texto;
      if (ultimaPergunta) {
        inputEl.value = ultimaPergunta;
        formEl.requestSubmit();
      }
    });

    const btnLike = bubble.querySelector('.btn-feedback-like');
    const btnDislike = bubble.querySelector('.btn-feedback-dislike');

    btnLike?.addEventListener('click', () => {
      btnLike.classList.toggle('active');
      btnDislike.classList.remove('active');
    });

    btnDislike?.addEventListener('click', () => {
      btnDislike.classList.toggle('active');
      btnLike.classList.remove('active');
    });

    // Ações contextuais pós-resposta (Ecossistema Integrado)
    bubble.querySelectorAll('.btn-passo-sugestao').forEach(btn => {
      btn.addEventListener('click', () => {
        const acao = btn.dataset.acao;
        executarAcaoContextual(acao, texto, btn);
      });
    });

  } else {
    // Mensagem do usuário
    bubble.textContent = texto;
  }

  row.appendChild(bubble);
  mensagensEl.appendChild(row);
  rolarParaFinal();

  salvarConversaNoHistorico();
  return row;
}

// Ações do Ecossistema (Chat -> Flashcards, Chat -> Projetos, Exemplo, Exercício)
function executarAcaoContextual(acao, textoOrigem, btn = null) {
  if (acao === 'exemplo') {
    inputEl.value = 'Dê um exemplo prático resolvido passo a passo sobre essa explicação.';
    formEl.requestSubmit();
  } else if (acao === 'exercicio') {
    inputEl.value = 'Crie 1 questão inédita estilo ENEM com 5 alternativas sobre esse assunto para eu resolver.';
    formEl.requestSubmit();
  } else if (acao === 'flashcards') {
    integrarChatParaFlashcards(textoOrigem);
  } else if (acao === 'projeto') {
    const ultimaPergunta = [...historico].reverse().find(h => h.role === 'usuario')?.texto || '';
    integrarChatParaProjeto(textoOrigem, ultimaPergunta, btn);
  }
}

// INTEGRAÇÃO CHAT -> FLASHCARDS (Widget Interativo Inline)
function integrarChatParaFlashcards(conteudoTutor) {
  const materiaNome = materiaAtiva.nome || 'Geral';
  const materiaId   = materiaAtiva.id   || '';
  const icone       = materiaAtiva.icone || '✨';

  /* ── 1. EXTRAÇÃO DE PARES PERGUNTA/RESPOSTA ── */
  const pares = [];

  // Tenta tabela Markdown: |Frente|Verso| ou |Pergunta|Resposta|
  const linhasTabela = conteudoTutor.split('\n').filter(l => l.trim().startsWith('|'));
  if (linhasTabela.length >= 3) {
    for (let i = 0; i < linhasTabela.length; i++) {
      const cols = linhasTabela[i].split('|').map(c => c.trim()).filter(Boolean);
      // Pula linhas de separador (---|---) e cabeçalho
      if (cols.length < 2) continue;
      if (cols.some(c => /^[-:]+$/.test(c))) continue;
      if (/^(frente|pergunta|front|question|#)/i.test(cols[0])) continue;
      pares.push({ frente: cols[0], verso: cols[1] });
    }
  }

  // Tenta padrão "**Pergunta:** … **Resposta:** …" ou "Frente: … / Verso: …"
  if (pares.length === 0) {
    const blocos = conteudoTutor.split(/\n(?=\d+[\.\)]|\*\*\d+)/);
    blocos.forEach(bloco => {
      const frenteMatch = bloco.match(/(?:\*\*)?(?:Frente|Pergunta|Front|P)(?:\*\*)?[:\-]\s*(.+?)(?:\n|$)/i);
      const versoMatch  = bloco.match(/(?:\*\*)?(?:Verso|Resposta|Back|R)(?:\*\*)?[:\-]\s*(.+?)(?:\n|$)/i);
      if (frenteMatch && versoMatch) {
        pares.push({
          frente: frenteMatch[1].replace(/\*\*/g, '').trim(),
          verso:  versoMatch[1].replace(/\*\*/g, '').trim()
        });
      }
    });
  }

  // Tenta linhas numeradas: "1. Conceito — Definição" ou "1. **Conceito**: Definição"
  if (pares.length === 0) {
    const linhasNum = conteudoTutor.split('\n').filter(l => /^\d+[\.\)]/.test(l.trim()));
    linhasNum.forEach(linha => {
      const semNum = linha.replace(/^\d+[\.\)]\s*/, '').replace(/\*\*/g, '').trim();
      const sep = semNum.match(/[—–:]/);
      if (sep) {
        const idx = semNum.indexOf(sep[0]);
        const frente = semNum.slice(0, idx).trim();
        const verso  = semNum.slice(idx + 1).trim();
        if (frente && verso) pares.push({ frente, verso });
      }
    });
  }

  // Fallback: usa títulos/negrito como perguntas e o parágrafo seguinte como resposta
  if (pares.length === 0) {
    const linhas = conteudoTutor.split('\n');
    for (let i = 0; i < linhas.length - 1; i++) {
      const l = linhas[i].trim();
      const titulo = l.match(/^#{1,3}\s+(.+)/) || l.match(/^\*\*(.+)\*\*$/);
      if (titulo) {
        const resposta = linhas.slice(i + 1).find(r => r.trim().length > 20);
        if (resposta) {
          pares.push({
            frente: titulo[1].replace(/\*\*/g, '').trim() + '?',
            verso:  resposta.replace(/[*#`]/g, '').trim().slice(0, 220)
          });
        }
      }
    }
  }

  // Último fallback: gera pares contextuais genéricos
  if (pares.length === 0) {
    const trecho = conteudoTutor.replace(/[#*`]/g, '').trim().slice(0, 300);
    pares.push(
      { frente: `O que define o conceito principal de ${materiaNome} abordado nessa resposta?`, verso: trecho + (trecho.length === 300 ? '…' : '') },
      { frente: `Como esse tópico de ${materiaNome} costuma ser cobrado no vestibular?`, verso: 'Em questões contextualizadas, interdisciplinares, geralmente com interpretação de dados ou situações-problema.' },
      { frente: `Cite um exemplo prático relacionado ao tema de ${materiaNome} apresentado.`, verso: 'Busque exemplos do cotidiano ou de provas anteriores do ENEM para fixar o conceito.' }
    );
  }

  // Garante máx 20 cards e formato completo
  const cards = pares.slice(0, 20).map(p => ({
    frente: p.frente,
    verso:  p.verso,
    materia_nome: materiaNome,
    materia_id:   materiaId,
    assunto:      materiaNome
  }));

  /* ── 2. RENDERIZA O WIDGET ── */
  let indiceAtual = 0;

  function atualizar(box) {
    const card = cards[indiceAtual];
    box.querySelector('.cfc-pergunta-texto').textContent  = card.frente;
    box.querySelector('.cfc-resposta-texto').textContent  = card.verso;
    box.querySelector('.cfc-contador').textContent        = `${indiceAtual + 1} / ${cards.length}`;
    box.querySelector('.cfc-progress-fill').style.width   = `${((indiceAtual + 1) / cards.length) * 100}%`;

    const respostaWrap = box.querySelector('.cfc-resposta-wrap');
    respostaWrap.classList.remove('revelada');

    const btnRevelar = box.querySelector('.cfc-btn-revelar');
    btnRevelar.textContent = '👁 Revelar resposta';
    btnRevelar.classList.remove('revelado');

    box.querySelector('.cfc-btn-nav.anterior').disabled = indiceAtual === 0;
    box.querySelector('.cfc-btn-nav.proximo').disabled  = indiceAtual === cards.length - 1;
  }

  const box = document.createElement('div');
  box.className = 'chat-flashcards-box';
  box.innerHTML = `
    <div class="cfc-header">
      <div class="cfc-badge-tema">
        <span class="icone">${icone}</span>
        Flashcards · ${materiaNome}
      </div>
      <span class="cfc-contador">1 / ${cards.length}</span>
    </div>
    <div class="cfc-progress-track">
      <div class="cfc-progress-fill" style="width:${(1/cards.length*100).toFixed(1)}%"></div>
    </div>
    <div class="cfc-card-stage">
      <div class="cfc-pergunta-label">PERGUNTA</div>
      <div class="cfc-pergunta-texto">${cards[0].frente}</div>
      <button type="button" class="cfc-btn-revelar">👁 Revelar resposta</button>
      <div class="cfc-resposta-wrap">
        <div class="cfc-resposta-inner">
          <div class="cfc-resposta-label">RESPOSTA</div>
          <div class="cfc-resposta-texto">${cards[0].verso}</div>
        </div>
      </div>
    </div>
    <div class="cfc-nav-bar">
      <button type="button" class="cfc-btn-nav anterior" disabled>← Anterior</button>
      <button type="button" class="cfc-btn-nav proximo" ${cards.length === 1 ? 'disabled' : ''}>Próximo →</button>
    </div>
    <div class="cfc-acoes-bar">
      <button type="button" class="cfc-btn-acao embaralhar">🔀 Embaralhar</button>
      <button type="button" class="cfc-btn-acao salvar-deck">💾 Salvar deck</button>
      <a class="cfc-btn-acao destaque-abrir" href="./flashcards.html?importar=true">📖 Abrir página de Flashcards</a>
    </div>
  `;

  // Revelar resposta
  box.querySelector('.cfc-btn-revelar').addEventListener('click', function () {
    box.querySelector('.cfc-resposta-wrap').classList.add('revelada');
    this.textContent = '✓ Resposta revelada';
    this.classList.add('revelado');
  });

  // Navegação
  box.querySelector('.cfc-btn-nav.anterior').addEventListener('click', () => {
    if (indiceAtual > 0) { indiceAtual--; atualizar(box); }
  });
  box.querySelector('.cfc-btn-nav.proximo').addEventListener('click', () => {
    if (indiceAtual < cards.length - 1) { indiceAtual++; atualizar(box); }
  });

  // Embaralhar
  box.querySelector('.cfc-btn-acao.embaralhar').addEventListener('click', () => {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    indiceAtual = 0;
    atualizar(box);
  });

  // Salvar deck
  box.querySelector('.cfc-btn-acao.salvar-deck').addEventListener('click', function () {
    try {
      const pendentes = JSON.parse(localStorage.getItem('novos_flashcards_pendentes') || '[]');
      pendentes.push(...cards);
      localStorage.setItem('novos_flashcards_pendentes', JSON.stringify(pendentes));
      this.textContent = '✓ Deck salvo!';
      this.classList.add('salvo');
      setTimeout(() => {
        this.textContent = '💾 Salvar deck';
        this.classList.remove('salvo');
      }, 3000);
    } catch (err) {
      console.error('Erro ao salvar deck:', err);
    }
  });

  mensagensEl.appendChild(box);
  rolarParaFinal();
}


// =========================================================
// CLASSIFICAÇÃO ROBUSTA DE MATÉRIAS E EXTRAÇÃO DE PROJETOS
// =========================================================
function normalizarTextoMateria(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Configuração curricular oficial com termos explícitos e temas/tópicos
const MATERIAS_CONFIG = [
  {
    nome: 'Redação',
    termosExatos: [
      'redacao', 'dissertacao', 'dissertativo', 'dissertativa', 'texto dissertativo',
      'dissertacao-argumentativa', 'proposta de intervencao', 'competencias do enem',
      'nota 1000', 'repertorio para redacao', 'repertorio sociocultural', 'repertorio'
    ],
    temas: [
      'redacao', 'dissertacao', 'dissertativa', 'argumentacao', 'conectivos',
      'proposta de intervencao', 'repertorio sociocultural', 'competencias do enem',
      'competencia 1', 'competencia 2', 'competencia 3', 'competencia 4', 'competencia 5',
      'paragrafo dissertativo', 'introducao de redacao', 'conclusao de redacao'
    ]
  },
  {
    nome: 'Matemática',
    termosExatos: [
      'matematica', 'funcao', 'funcoes', 'algebra', 'geometria', 'trigonometria',
      'probabilidade', 'estatistica', 'logaritmo', 'logaritmos', 'equacao', 'equacoes'
    ],
    temas: [
      'matematica', 'funcao', 'funcoes', 'funcao afim', 'funcao quadratica',
      'funcao exponencial', 'funcao logaritmica', 'algebra', 'geometria plana',
      'geometria espacial', 'geometria analitica', 'geometria', 'trigonometria',
      'probabilidade', 'estatistica', 'logaritmo', 'logaritmos', 'equacao', 'equacoes',
      'analise combinatoria', 'matriz', 'matrizes', 'determinantes', 'sistemas lineares',
      'progressao aritmetica', 'progressao geometrica', 'pa e pg', 'porcentagem', 'regra de tres'
    ]
  },
  {
    nome: 'Biologia',
    termosExatos: [
      'biologia', 'celula', 'celulas', 'genetica', 'ecologia', 'evolucao',
      'mitose', 'meiose', 'fisiologia'
    ],
    temas: [
      'biologia', 'celula', 'celulas', 'citologia', 'genetica', 'dna', 'rna',
      'ecologia', 'biomas', 'cadeia alimentar', 'evolucao', 'darwinismo', 'lamarckismo',
      'mitose', 'meiose', 'divisao celular', 'fisiologia', 'fisiologia humana',
      'botanica', 'zoologia', 'reino vegetal', 'reino animal', 'virus', 'bacterias',
      'bioquimica', 'fotossintese', 'respiracao celular', 'sistema imunologico', 'imunologia', 'embriologia'
    ]
  },
  {
    nome: 'História',
    termosExatos: [
      'historia', 'brasil colonia', 'era vargas', 'vargas', 'ditadura',
      'revolucao', 'imperio', 'republica'
    ],
    temas: [
      'historia', 'historia do brasil', 'historia geral', 'vargas', 'era vargas',
      'ditadura', 'ditadura militar', 'revolucao', 'revolucao francesa', 'revolucao industrial',
      'brasil colonia', 'brasil imperio', 'brasil republica', 'imperio', 'republica',
      'guerra fria', 'primeira guerra', 'segunda guerra', 'feudalismo', 'idade media',
      'idade moderna', 'idade contemporanea', 'antiguidade', 'grecia antiga', 'roma antiga',
      'independencia do brasil', 'iluminismo', 'renascimento'
    ]
  },
  {
    nome: 'Geografia',
    termosExatos: [
      'geografia', 'geopolitica', 'relevo', 'clima', 'urbanizacao', 'cartografia'
    ],
    temas: [
      'geografia', 'geografia fisica', 'geografia humana', 'geopolitica', 'relevo',
      'clima', 'climatologia', 'urbanizacao', 'cartografia', 'demografia', 'populacao',
      'migracao', 'migracoes', 'globalizacao', 'biomas brasileiros', 'agropecuaria',
      'meio ambiente', 'hidrografia', 'fontes de energia', 'industrializacao'
    ]
  },
  {
    nome: 'Física',
    termosExatos: [
      'fisica', 'mecanica', 'cinematica', 'termodinamica', 'optica',
      'eletricidade', 'eletromagnetismo', 'ondulatoria', 'newton'
    ],
    temas: [
      'fisica', 'mecanica', 'cinematica', 'dinamica', 'leis de newton', 'newton',
      'energia', 'trabalho e energia', 'termodinamica', 'calorimetria', 'optica',
      'optica geometrica', 'eletricidade', 'eletrostatica', 'eletrodinamica',
      'circuitos eletricos', 'eletromagnetismo', 'ondulatoria', 'ondas', 'hidrostatica',
      'gravitacao universal', 'gravitacao'
    ]
  },
  {
    nome: 'Química',
    termosExatos: [
      'quimica', 'estequiometria', 'termoquimica', 'eletroquimica',
      'tabela periodica', 'atomo', 'ligacoes quimicas'
    ],
    temas: [
      'quimica', 'quimica organica', 'quimica inorganica', 'fisico-quimica',
      'estequiometria', 'calculo estequiometrico', 'termoquimica', 'solucoes',
      'concentracao de solucoes', 'eletroquimica', 'pilhas e baterias', 'tabela periodica',
      'reacoes quimicas', 'atomo', 'estrutura atomica', 'modelos atomicos',
      'ligacoes quimicas', 'ligacoes', 'equilibrio quimico', 'cinetica quimica',
      'acidos e bases', 'funcoes organicas'
    ]
  },
  {
    nome: 'Português',
    termosExatos: [
      'portugues', 'gramatica', 'sintaxe', 'morfologia', 'literatura', 'figuras de linguagem'
    ],
    temas: [
      'portugues', 'lingua portuguesa', 'gramatica', 'sintaxe', 'analise sintatica',
      'morfologia', 'classes de palavras', 'concordancia', 'concordancia verbal',
      'concordancia nominal', 'regencia', 'regencia verbal', 'crase', 'pontuacao',
      'interpretacao de texto', 'compreensao de texto', 'generos textuais',
      'figuras de linguagem', 'literatura', 'quinhentismo', 'barroco', 'arcadismo',
      'romantismo', 'realismo', 'naturalismo', 'parnasianismo', 'simbolismo',
      'modernismo', 'vanguardas europeias'
    ]
  }
];

function classificarMateriasTexto(texto) {
  if (!texto) return [];
  const norm = normalizarTextoMateria(texto);
  const resultados = [];

  for (const m of MATERIAS_CONFIG) {
    let score = 0;
    let matchTermo = '';
    let isExato = false;

    // 1. Termos exatos da matéria
    for (const termo of m.termosExatos) {
      const termoNorm = normalizarTextoMateria(termo);
      const regex = new RegExp('(\\b|[^a-z0-9])' + termoNorm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '(\\b|[^a-z0-9]|$)', 'i');
      if (regex.test(norm)) {
        score += 10;
        matchTermo = termo;
        isExato = true;
        break;
      }
    }

    // 2. Tópicos / temas específicos
    if (!isExato) {
      for (const tema of m.temas) {
        const temaNorm = normalizarTextoMateria(tema);
        const regex = new RegExp('(\\b|[^a-z0-9])' + temaNorm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '(\\b|[^a-z0-9]|$)', 'i');
        if (regex.test(norm)) {
          score += 4;
          if (!matchTermo) matchTermo = tema;
          break;
        }
      }
    }

    if (score > 0) {
      resultados.push({ nome: m.nome, score, isExato, matchTermo });
    }
  }

  // Ordena por score descendente (maior pontuação primeiro)
  resultados.sort((a, b) => b.score - a.score);
  return resultados;
}

function extrairInformacoesProjeto(conteudoTutor, mensagemUsuario) {
  const msgUser = (mensagemUsuario || '').trim();
  const msgTutor = (conteudoTutor || '').trim();

  // 1. Extração de Prazo / Duração
  let prazoDias = 30; // Padrão inteligente de 30 dias para planos de estudo
  const matchDias = msgUser.match(/\b(\d+)\s*(?:dias?)\b/i) || msgTutor.match(/\b(\d+)\s*(?:dias?)\b/i);
  const matchSemanas = msgUser.match(/\b(\d+)\s*(?:semanas?)\b/i) || msgTutor.match(/\b(\d+)\s*(?:semanas?)\b/i);
  const matchMeses = msgUser.match(/\b(\d+)\s*(?:m[eê]s(?:es)?)\b/i) || msgTutor.match(/\b(\d+)\s*(?:m[eê]s(?:es)?)\b/i);

  if (matchDias) {
    prazoDias = parseInt(matchDias[1], 10);
  } else if (matchSemanas) {
    prazoDias = parseInt(matchSemanas[1], 10) * 7;
  } else if (matchMeses) {
    prazoDias = parseInt(matchMeses[1], 10) * 30;
  } else if (/duas semanas/i.test(msgUser)) {
    prazoDias = 14;
  } else if (/um m[eê]s/i.test(msgUser)) {
    prazoDias = 30;
  }

  if (isNaN(prazoDias) || prazoDias < 3) prazoDias = 14;
  if (prazoDias > 180) prazoDias = 180;

  const dataAlvo = new Date();
  dataAlvo.setDate(dataAlvo.getDate() + prazoDias);
  const prazoFormatado = dataAlvo.toISOString().slice(0, 10);
  const prazoTexto = `${prazoFormatado} (${prazoDias} dias)`;

  // 2. Classificação Robusta de Matéria com Prioridade Absoluta para o Usuário
  const matsUsuario = classificarMateriasTexto(msgUser);
  let materiaDetectada = '';
  let conflitoMaterias = false;

  if (matsUsuario.length > 0) {
    const exatosUsuario = matsUsuario.filter(m => m.isExato);
    if (exatosUsuario.length > 1) {
      // Conflito explícito: o usuário pediu múltiplas matérias (ex: "redação e biologia")
      conflitoMaterias = true;
      materiaDetectada = exatosUsuario.map(m => m.nome).join(' e ');
    } else if (exatosUsuario.length === 1) {
      materiaDetectada = exatosUsuario[0].nome;
    } else {
      materiaDetectada = matsUsuario[0].nome;
    }
  } else if (materiaAtiva?.nome && materiaAtiva.nome !== 'Todas as matérias') {
    // Se o usuário não mencionou matéria explícita, mas estava com um chip de matéria ativo
    materiaDetectada = materiaAtiva.nome;
  } else {
    // Apenas se o usuário não indicou matéria, inspeciona o conteúdo do tutor com validação
    const matsTutor = classificarMateriasTexto(msgTutor);
    if (matsTutor.length > 0) {
      materiaDetectada = matsTutor[0].nome;
    }
  }

  // 3. Extração do TEMA específico (ex: "Redação", "Função Afim", "Genética")
  let temaEspecifico = '';

  const patterns = [
    /(?:projeto|plano|cronograma|estudo[s]?)\s+(?:de\s+estudos?\s+)?(?:de|para|sobre)\s+([a-z\u00C0-\u00FF0-9\s-]{3,45})/i,
    /(?:aprender|estudar|dominar|revisar|focar em|compreender|melhorar)\s+(?:minha\s+|meu\s+)?([a-z\u00C0-\u00FF0-9\s-]{3,45})/i,
    /(?:como passar em|como ir bem em|guia de)\s+([a-z\u00C0-\u00FF0-9\s-]{3,45})/i
  ];

  for (const pat of patterns) {
    const match = msgUser.match(pat);
    if (match && match[1]) {
      let cand = match[1].trim();
      cand = cand.replace(/\b(em\s+\d+\s*(?:dias?|semanas?|m[eê]s(?:es)?)|para o enem|pro enem|do enem|no enem|para vestibulares?|r[aá]pido|do zero|passo a passo|por favor)\b/gi, '').trim();
      cand = cand.replace(/^(estudar|aprender|revisar|dominar|melhorar|focar em|compreender)\s+/i, '').trim();
      cand = cand.replace(/[.,:;!?]+$/, '').trim();
      // Não considera palavras genéricas ou conectivos como tema
      if (cand.length >= 3 && !/^(o|a|os|as|um|uma|meu|minha|esse|esta|isso|tudo|estudo|estudos)$/i.test(cand)) {
        temaEspecifico = cand;
        break;
      }
    }
  }

  // Se o tema extraído ficou vazio ou virou algo genérico, aproveita o termo identificado da matéria
  if (!temaEspecifico && matsUsuario.length > 0) {
    if (matsUsuario.length === 1 && matsUsuario[0].isExato) {
      temaEspecifico = matsUsuario[0].nome;
    } else {
      const melhorMatch = matsUsuario[0].matchTermo;
      if (melhorMatch && melhorMatch.length >= 3 && melhorMatch !== 'enem' && melhorMatch !== 'estudo') {
        temaEspecifico = melhorMatch.charAt(0).toUpperCase() + melhorMatch.slice(1);
      }
    }
  }

  if (!temaEspecifico && msgTutor) {
    const matchTitulo = msgTutor.match(/^(?:#+\s*|\*\*)([^\n*#]+)(?:\*\*|$)/m);
    if (matchTitulo && matchTitulo[1] && matchTitulo[1].length < 50) {
      const candTitulo = matchTitulo[1].trim();
      if (!/^(ol[aá]|bom dia|boa tarde|boa noite|tutor)/i.test(candTitulo)) {
        temaEspecifico = candTitulo;
      }
    }
  }

  // 4. Validação Cruzada: A matéria corresponde à intenção explícita do usuário?
  if (matsUsuario.length === 1) {
    materiaDetectada = matsUsuario[0].nome;
  }

  // Se o tema coincidir com a matéria detectada (mesmo sem acento), utiliza o nome oficial
  if (materiaDetectada && normalizarTextoMateria(temaEspecifico) === normalizarTextoMateria(materiaDetectada)) {
    temaEspecifico = materiaDetectada;
  }

  if (temaEspecifico) {
    temaEspecifico = temaEspecifico.charAt(0).toUpperCase() + temaEspecifico.slice(1);
  } else if (materiaDetectada) {
    temaEspecifico = materiaDetectada;
  } else {
    temaEspecifico = 'Preparação Intensiva para o Vestibular';
  }

  if (!materiaDetectada) {
    materiaDetectada = temaEspecifico.length <= 25 ? temaEspecifico : 'Geral';
  }

  const tituloProjeto = `Dominar ${temaEspecifico}`;
  const objetivoProjeto = `Plano focado em ${temaEspecifico} para Vestibulares`;
  const metaDesc = `Cronograma de ${prazoDias} dias para dominar os conteúdos essenciais de ${temaEspecifico}, com foco em teoria, fixação de exercícios e resolução de questões reais.`;

  // 5. Extração ou Construção de Tarefas Dinâmicas
  let tarefas = [];

  const linhasLista = msgTutor.match(/(?:^|\n)\s*(?:\d+[\.\)]|[-*•])\s+([^\n]+)/g);
  if (linhasLista && linhasLista.length >= 3) {
    for (const linha of linhasLista) {
      const itemLimpo = linha.replace(/^\s*(?:\d+[\.\)]|[-*•])\s+/, '').trim();
      const textoItem = itemLimpo.replace(/\*\*/g, '').trim();
      if (textoItem.length > 8 && textoItem.length < 120 && !/^(olá|espero|boa sorte|bons estudos|conclusão|introdução)/i.test(textoItem)) {
        tarefas.push({
          titulo: textoItem,
          concluida: tarefas.length === 0
        });
      }
      if (tarefas.length >= 5) break;
    }
  }

  if (tarefas.length < 3) {
    tarefas = [
      { titulo: `Revisar os fundamentos teóricos e conceitos-chave de ${temaEspecifico}`, concluida: true },
      { titulo: `Resolver 20 questões contextualizadas de ${temaEspecifico} do ENEM e vestibulares`, concluida: false },
      { titulo: `Elaborar resumo esquemático ou mapa mental com as fórmulas e pontos críticos`, concluida: false },
      { titulo: `Revisar flashcards de fixação ativa sobre ${temaEspecifico}`, concluida: false },
      { titulo: `Fazer simulado temático e diagnosticar os pontos com maior taxa de erro`, concluida: false }
    ];
  }

  return {
    materia: materiaDetectada,
    conflito: conflitoMaterias,
    tema: temaEspecifico,
    titulo: tituloProjeto,
    objetivo: objetivoProjeto,
    descricao: metaDesc,
    meta: metaDesc,
    prazo: prazoTexto,
    prazoDias,
    prazoData: prazoFormatado,
    tarefas
  };
}

// Deduplicação inteligente de lista de projetos locais
function deduplicarProjetosLocais(lista) {
  if (!Array.isArray(lista)) return [];
  const mapa = new Map();

  for (const p of lista) {
    if (!p) continue;
    const tit = (p.titulo || p.objetivo || 'projeto').trim().toLowerCase();
    const mat = (p.materia || 'geral').trim().toLowerCase();
    const chave = `${tit}::${mat}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, p);
    } else {
      const anterior = mapa.get(chave);
      if ((p.progresso || 0) > (anterior.progresso || 0)) {
        mapa.set(chave, p);
      }
    }
  }

  return Array.from(mapa.values());
}

// Cache em memória para evitar duplicações por cliques repetidos ou chamadas concorrentes
let ultimoProjetoCriado = {
  chave: '',
  timestamp: 0,
  id: null
};

// INTEGRAÇÃO CHAT -> PROJETOS DE ESTUDO (Reflete no Dashboard)
function integrarChatParaProjeto(conteudoTutor, mensagemUsuario = '', botaoElemento = null) {
  // Se o botão já foi acionado e processado nesta mensagem, ignora repetição
  if (botaoElemento && botaoElemento.dataset.processado === 'true') {
    return;
  }

  // Se mensagemUsuario não foi informada, tenta pegar a última do histórico
  let msgUser = mensagemUsuario;
  if (!msgUser && typeof historico !== 'undefined' && Array.isArray(historico)) {
    msgUser = [...historico].reverse().find(h => h.role === 'usuario')?.texto || '';
  }

  const info = extrairInformacoesProjeto(conteudoTutor, msgUser);
  const chaveProjeto = `${info.titulo}::${info.materia}`.toLowerCase().trim();
  const agora = Date.now();

  // Trava Anti-Duplicação 1: Mesmo projeto criado há menos de 15 segundos
  if (ultimoProjetoCriado.chave === chaveProjeto && (agora - ultimoProjetoCriado.timestamp < 15000)) {
    if (botaoElemento) {
      botaoElemento.textContent = '✓ Projeto já adicionado ao Dashboard';
      botaoElemento.disabled = true;
      botaoElemento.dataset.processado = 'true';
    }
    return;
  }

  const idProjeto = 'proj_' + agora;
  const novoProjeto = {
    id: idProjeto,
    titulo: info.titulo,
    objetivo: info.objetivo,
    materia: info.materia,
    descricao: info.descricao,
    meta: info.meta,
    prazo: info.prazo,
    status: 'em_andamento',
    progresso: Math.round((info.tarefas.filter(t => t.concluida).length / info.tarefas.length) * 100) || 20,
    tarefas: info.tarefas,
    etapas: info.tarefas,
    criado_em: new Date().toISOString()
  };

  try {
    const storageKey = userId ? `vestibular_projetos_${userId}` : 'vestibular_projetos_guest';
    const projetosAtuais = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem('vestibular_projetos_guest') || '[]');

    // Trava Anti-Duplicação 2: Verifica se já existe um projeto idêntico salvo recentemente
    const indexExistente = projetosAtuais.findIndex(p => {
      const pChave = `${p.titulo || p.objetivo || ''}::${p.materia || ''}`.toLowerCase().trim();
      return pChave === chaveProjeto;
    });

    if (indexExistente !== -1) {
      const existente = projetosAtuais[indexExistente];
      const diffMs = agora - (new Date(existente.criado_em || 0).getTime() || 0);
      if (diffMs < 300000) { // 5 minutos
        ultimoProjetoCriado = { chave: chaveProjeto, timestamp: agora, id: existente.id };
        if (botaoElemento) {
          botaoElemento.textContent = '✓ Projeto já salvo no Dashboard';
          botaoElemento.disabled = true;
          botaoElemento.dataset.processado = 'true';
        }
        return;
      }
    }

    // Salva com desduplicação
    projetosAtuais.unshift(novoProjeto);
    const projetosDeduplicados = deduplicarProjetosLocais(projetosAtuais);

    localStorage.setItem(storageKey, JSON.stringify(projetosDeduplicados));
    if (userId) {
      localStorage.setItem('vestibular_projetos_guest', JSON.stringify(projetosDeduplicados));
    }

    ultimoProjetoCriado = { chave: chaveProjeto, timestamp: agora, id: idProjeto };

    if (botaoElemento) {
      botaoElemento.textContent = '✓ Projeto no Dashboard!';
      botaoElemento.disabled = true;
      botaoElemento.dataset.processado = 'true';
    }

    // Feedback visual direto no chat
    const row = document.createElement('div');
    row.className = 'msg-row msg-row-tutor';
    row.innerHTML = `
      <div class="msg-bubble msg-tutor" style="border: 1px solid #3b82f6; box-shadow: 0 4px 20px rgba(59,130,246,0.25);">
        <div style="font-weight:700; color:#38bdf8; margin-bottom:6px;">🎯 Projeto de Estudos Criado!</div>
        <p style="margin-bottom:8px; font-size:0.9rem;"><strong>${novoProjeto.titulo}</strong> (${novoProjeto.materia}) foi adicionado ao seu painel com ${novoProjeto.tarefas.length} tarefas e prazo para ${info.prazoData}.</p>
        <a class="btn" href="./dashboard.html?projeto=${novoProjeto.id}" style="background:var(--gradient-primary); color:#fff; text-decoration:none; font-size:0.85rem; padding:8px 16px; border-radius:var(--radius-full); display:inline-flex; align-items:center; gap:6px;">
          📊 Ver no Dashboard
        </a>
      </div>
    `;
    mensagensEl.appendChild(row);
    rolarParaFinal();
  } catch (err) {
    console.error('Erro ao criar projeto:', err);
  }
}

function renderCarregando() {
  const row = document.createElement('div');
  row.className = 'msg-row msg-row-tutor';
  row.id = 'msg-carregando';

  const nomeTutor = materiaAtiva.nome ? `Tutor de ${materiaAtiva.nome}` : 'Tutor';
  const icone = materiaAtiva.nome ? materiaAtiva.icone : '🤖';

  row.innerHTML = `
    <div class="msg-typing-box">
      <span>${icone}</span>
      <span>${nomeTutor} está digitando</span>
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;

  mensagensEl.appendChild(row);
  rolarParaFinal();
}

function removerCarregando() {
  document.getElementById('msg-carregando')?.remove();
}

function renderErro(texto) {
  const row = document.createElement('div');
  row.className = 'msg-row msg-row-erro';
  row.innerHTML = `
    <div class="msg-erro">
      <span>⚠️</span>
      <span>${texto}</span>
    </div>
  `;
  mensagensEl.appendChild(row);
  rolarParaFinal();
}

// Envio para a Edge Function do Supabase
async function enviarMensagem(mensagem) {
  // 1. Verifica cota antes de processar
  try {
    const { data: checagem } = await supabase.rpc('consultar_uso_diario', { p_tipo: 'chat' });
    const limiteOficial = getPlanLimit('chat_dia', planoInfo.nome) || 5;

    if (checagem && checagem.permitido === false) {
      const limiteExibido = checagem.limite || limiteOficial;
      if (planoInfo.isUltimate || planoInfo.ordem >= 3) {
        renderErro(`Você atingiu o limite diário de ${limiteExibido} perguntas do Chat IA no plano Ultimate. O contador reseta à meia-noite.`);
      } else {
        renderErro(`Você atingiu o limite diário de perguntas do Chat IA (${limiteExibido} perguntas/dia) para o seu plano. Faça upgrade para continuar!`);
        const linkUpgrade = document.createElement('div');
        linkUpgrade.style.margin = '10px 0 0 28px';
        linkUpgrade.innerHTML = `<a href="./precos.html?upgrade=chat" class="btn btn-primary" style="display:inline-flex; padding:8px 16px; font-size:0.9rem;">Fazer upgrade do plano</a>`;
        mensagensEl.appendChild(linkUpgrade);
      }
      rolarParaFinal();
      return;
    }
  } catch (errCheck) {
    console.warn('[Chat IA] Erro ao consultar cota prévia:', errCheck);
  }

  renderMensagem('user', mensagem);
  historico.push({ role: 'usuario', texto: mensagem });
  renderCarregando();


  const msgLower = (mensagem || '').toLowerCase();
  const solicitouFlashcards = /\b(flashcards?|cards?)\b/i.test(msgLower) && /\b(cri[ae]|ger[ae]|fa[çz]|mont[ae]|elabor[ae]|10|5|quantos)\b/i.test(msgLower);
  // Regex expandido: detecta "quero aprender X em Y dias", "crie um plano para Z", "me ajude a estudar W", etc.
  const solicitouProjeto = (
    /\b(projeto|plano|cronograma|roteiro|guia)\b/i.test(msgLower) &&
    /\b(cri[ae]|ger[ae]|fa[çz]|mont[ae]|elabor[ae]|organiz[ae]|precis[ao])\b/i.test(msgLower)
  ) || (
    /\b(quero|preciso|me ajud[ae]|vou)\b/i.test(msgLower) &&
    /\b(aprender|estudar|dominar|entender|focar)\b/i.test(msgLower)
  );

  // Detecta matéria da mensagem do usuário com alta prioridade
  const matsDetectadas = classificarMateriasTexto(mensagem);
  let materiaEnvio = (materiaAtiva.nome && materiaAtiva.nome !== 'Todas as matérias') ? materiaAtiva.nome : undefined;

  if (matsDetectadas.length === 1 && matsDetectadas[0].isExato) {
    materiaEnvio = matsDetectadas[0].nome;
    // Se o filtro atual não estava na matéria específica, seleciona a matéria detectada
    if (!materiaAtiva.nome || materiaAtiva.nome === 'Todas as matérias') {
      selecionarMateriaPorNome(matsDetectadas[0].nome);
    }
  }

  try {
    let data = null;
    let error = null;
    let statusErro = null;
    let corpoErro = null;

    // Retry com backoff exponencial para sobrecarga temporária (máximo 2 tentativas: 1s, 2s)
    const MAX_TENTATIVAS = 2;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      const resposta = await supabase.functions.invoke('chat-ia', {
        body: {
          mensagem,
          historico,
          materia: materiaEnvio || undefined,
        },
      });

      data = resposta.data;
      error = resposta.error;

      if (data?.resposta) {
        break; // Sucesso
      }

      if (error) {
        // Tenta ler o status e corpo do erro
        try {
          if (error.context && typeof error.context.json === 'function') {
            corpoErro = await error.context.clone().json();
          }
          if (error.context?.status) {
            statusErro = error.context.status;
          }
        } catch (_) {
          try {
            if (error.context && typeof error.context.text === 'function') {
              const textoErro = await error.context.clone().text();
              corpoErro = { raw: textoErro };
            }
          } catch (__) {}
        }

        const isRateLimit = statusErro === 429 ||
          error.message?.includes('429') ||
          corpoErro?.erro === 'rate_limit' ||
          corpoErro?.code === 429;

        // Se for erro de rate limit temporário e ainda tiver tentativas, espera com backoff
        if (isRateLimit && tentativa < MAX_TENTATIVAS) {
          const esperaMs = tentativa * 1500;
          console.warn(`[Chat IA] Rate limit temporário detectado (429). Tentativa ${tentativa}/${MAX_TENTATIVAS}. Aguardando ${esperaMs}ms...`);
          await new Promise(r => setTimeout(r, esperaMs));
          continue;
        }

        // Se for outro erro ou esgotou tentativas, interrompe o loop
        break;
      }
    }

    removerCarregando();

    if (data?.resposta) {
      renderMensagem('tutor', data.resposta);
      historico.push({ role: 'assistente', texto: data.resposta });

      // Registra consumo da cota diária no banco APENAS após resposta bem-sucedida da IA
      supabase.rpc('verificar_e_registrar_uso', { p_tipo: 'chat' }).then(({ data: usoRes }) => {
        if (usoRes) {
          const limiteOficial = getPlanLimit('chat_dia', planoInfo.nome) || 5;
          definirBadge(usoRes.usado ?? 0, usoRes.limite ?? limiteOficial);
        }
      }).catch((errUso) => {
        console.warn('[Chat IA] Erro ao registrar uso no banco:', errUso);
      });

      if (solicitouFlashcards) {
        integrarChatParaFlashcards(data.resposta);
      }
      if (solicitouProjeto) {
        integrarChatParaProjeto(data.resposta, mensagem);
      }

      if (data?.uso) {
        definirBadge(data.uso.usado, data.uso.limite);
      }
    } else if (error) {
      // Diagnóstico detalhado no console
      console.error('[Chat IA] Falha na Edge Function chat-ia:', {
        status: statusErro,
        error,
        corpo: corpoErro,
      });

      // Diferenciação clara entre:
      // a) Limite legítimo do plano do usuário (cota comercial atingida)
      // b) Rate limit técnico do provedor de IA / Edge Function (429)
      // c) Falha de autenticação (401)
      // d) Erro genérico de conexão/servidor

      const isRateLimit = statusErro === 429 ||
        error.message?.includes('429') ||
        corpoErro?.erro === 'rate_limit' ||
        corpoErro?.code === 429;

      const isAuthError = statusErro === 401 ||
        corpoErro?.erro === 'nao_autenticado' ||
        error.message?.includes('401');

      const isCotaExcedida = corpoErro?.motivo === 'limite_diario' ||
        corpoErro?.permitido === false;

      if (isCotaExcedida) {
        const limite = corpoErro?.limite || getPlanLimit('chat_dia', planoInfo.nome) || 5;
        if (planoInfo.isUltimate || planoInfo.ordem >= 3) {
          renderErro(`Você atingiu o limite diário de ${limite} perguntas do Chat IA no seu plano Ultimate. O contador reseta à meia-noite.`);
        } else {
          renderErro(`Você atingiu o limite diário de perguntas do Chat IA (${limite} perguntas/dia) para o seu plano. Faça upgrade para continuar!`);
          const linkUpgrade = document.createElement('div');
          linkUpgrade.style.margin = '10px 0 0 28px';
          linkUpgrade.innerHTML = `<a href="./precos.html?upgrade=chat" class="btn btn-primary" style="display:inline-flex; padding:8px 16px; font-size:0.9rem;">Fazer upgrade do plano</a>`;
          mensagensEl.appendChild(linkUpgrade);
        }
      } else if (isAuthError) {
        renderErro('Sua sessão expirou ou não foi reconhecida. Por favor, recarregue a página ou faça login novamente.');
      } else if (isRateLimit) {
        renderErro('O Tutor IA está recebendo muitas requisições no momento. Aguarde alguns segundos e tente novamente.');
      } else {
        const mensagemAmigavel = corpoErro?.mensagem || corpoErro?.error || 'Não consegui consultar o Tutor IA agora. Tente novamente em alguns segundos.';
        renderErro(mensagemAmigavel);
      }
    } else {
      renderErro('Não recebi uma resposta válida do tutor. Tente novamente em alguns segundos.');
    }
  } catch (err) {
    removerCarregando();
    console.error('[Chat IA] Erro inesperado ao comunicar com o Tutor IA:', err);
    renderErro('Não consegui consultar o Tutor IA agora. Verifique sua conexão e tente novamente em alguns segundos.');
  }
}



// Configuração das sugestões na tela inicial
function configurarSugestoesIniciais() {
  sugestoesGrid?.querySelectorAll('.sugestao-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (enviando) return;
      const pergunta = btn.dataset.pergunta;
      inputEl.value = pergunta;
      ajustarAlturaTextarea();
      inputEl.focus();
      formEl.requestSubmit();
    });
  });
}

function ajustarAlturaTextarea() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
}

function limparConversaAtual() {
  historico = [];
  mensagensEl.innerHTML = '';
  if (emptyStateEl) {
    emptyStateEl.style.display = 'flex';
    mensagensEl.appendChild(emptyStateEl);
  }
  inputEl.value = '';
  ajustarAlturaTextarea();
  conversaAtualId = gerarIdSessao();
  inputEl.focus();
}

// =========================================================
// SISTEMA DE HISTÓRICO DE CONVERSAS (LOCALSTORAGE + SUPABASE READY)
// =========================================================
function gerarIdSessao() {
  return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function obterHistoricoSalvo() {
  try {
    const key = `${STORAGE_HISTORICO_KEY}_${userId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (err) {
    return [];
  }
}

function salvarConversaNoHistorico() {
  if (!historico.length || !userId) return;

  try {
    const key = `${STORAGE_HISTORICO_KEY}_${userId}`;
    const lista = obterHistoricoSalvo();
    const primeiraMensagem = historico.find(h => h.role === 'usuario')?.texto || 'Conversa com Tutor';
    const titulo = primeiraMensagem.slice(0, 36) + (primeiraMensagem.length > 36 ? '...' : '');

    const index = lista.findIndex(item => item.id === conversaAtualId);
    const dadosSessao = {
      id: conversaAtualId,
      titulo,
      materia: materiaAtiva.nome || 'Geral',
      materia_icone: materiaAtiva.icone || '📚',
      atualizado_em: new Date().toISOString(),
      mensagens: historico
    };

    if (index >= 0) {
      lista[index] = dadosSessao;
    } else {
      lista.unshift(dadosSessao);
    }

    localStorage.setItem(key, JSON.stringify(lista.slice(0, 30))); // Mantém até 30 conversas
  } catch (err) {
    console.warn('Erro ao salvar histórico de chat:', err);
  }
}

function carregarSessaoHistorico(sessao) {
  conversaAtualId = sessao.id;
  historico = [];
  mensagensEl.innerHTML = '';

  if (sessao.materia && sessao.materia !== 'Geral') {
    selecionarMateriaPorNome(sessao.materia);
  }

  sessao.mensagens.forEach(msg => {
    if (msg.role === 'usuario') {
      renderMensagem('user', msg.texto);
      historico.push(msg);
    } else {
      renderMensagem('tutor', msg.texto);
      historico.push(msg);
    }
  });

  fecharDrawer();
}

function renderizarDrawerHistorico() {
  if (!drawerListaHistorico) return;
  const lista = obterHistoricoSalvo();

  if (!lista.length) {
    drawerListaHistorico.innerHTML = '<p class="empty-state" style="font-size:0.85rem;">Nenhuma conversa anterior salva.</p>';
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const itensHoje = [];
  const itensAnteriores = [];

  lista.forEach(item => {
    const itemData = (item.atualizado_em || '').slice(0, 10);
    if (itemData === hoje) itensHoje.push(item);
    else itensAnteriores.push(item);
  });

  let html = '';

  if (itensHoje.length) {
    html += '<div class="historico-grupo-titulo">Hoje</div>';
    itensHoje.forEach(item => { html += renderItemHistoricoHtml(item); });
  }

  if (itensAnteriores.length) {
    html += '<div class="historico-grupo-titulo" style="margin-top:12px;">Anteriores</div>';
    itensAnteriores.forEach(item => { html += renderItemHistoricoHtml(item); });
  }

  drawerListaHistorico.innerHTML = html;

  drawerListaHistorico.querySelectorAll('.historico-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-conversa')) return;
      const id = el.dataset.id;
      const sessao = lista.find(s => s.id === id);
      if (sessao) carregarSessaoHistorico(sessao);
    });
  });

  drawerListaHistorico.querySelectorAll('.btn-del-conversa').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      removerSessaoHistorico(id);
    });
  });
}

function renderItemHistoricoHtml(item) {
  return `
    <div class="historico-item ${item.id === conversaAtualId ? 'active' : ''}" data-id="${item.id}">
      <span>${item.materia_icone || '💬'}</span>
      <span class="historico-item-texto" title="${item.titulo}">${item.titulo}</span>
      <button type="button" class="btn-del-conversa" data-id="${item.id}" title="Excluir conversa">✕</button>
    </div>
  `;
}

function removerSessaoHistorico(id) {
  const key = `${STORAGE_HISTORICO_KEY}_${userId}`;
  const lista = obterHistoricoSalvo().filter(item => item.id !== id);
  localStorage.setItem(key, JSON.stringify(lista));
  if (conversaAtualId === id) {
    limparConversaAtual();
  }
  renderizarDrawerHistorico();
}

function abrirDrawer() {
  renderizarDrawerHistorico();
  drawerOverlay?.classList.add('active');
  historicoDrawer?.classList.add('active');
}

function fecharDrawer() {
  drawerOverlay?.classList.remove('active');
  historicoDrawer?.classList.remove('active');
}

function configurarDrawerHistorico() {
  btnHistorico?.addEventListener('click', abrirDrawer);
  btnFecharDrawer?.addEventListener('click', fecharDrawer);
  drawerOverlay?.addEventListener('click', fecharDrawer);
}

// Configuração geral de eventos UI
function configurarEventosUI() {
  inputEl.addEventListener('input', ajustarAlturaTextarea);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = inputEl.value.trim();
    if (!texto || enviando) return;

    enviando = true;
    btnEnviar.disabled = true;
    inputEl.disabled = true;
    inputEl.value = '';
    ajustarAlturaTextarea();

    try {
      await enviarMensagem(texto);
    } finally {
      enviando = false;
      btnEnviar.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  });

  // Botão de limpar conversa com modal de confirmação
  btnNovoChat?.addEventListener('click', () => {
    if (historico.length > 0) {
      modalConfirmOverlay?.classList.add('active');
    } else {
      limparConversaAtual();
    }
  });

  btnCancelarLimpar?.addEventListener('click', () => {
    modalConfirmOverlay?.classList.remove('active');
  });

  btnConfirmarLimpar?.addEventListener('click', () => {
    modalConfirmOverlay?.classList.remove('active');
    limparConversaAtual();
  });

  // Botão de anexo preparado
  btnAnexo?.addEventListener('click', () => {
    inputAnexoFile?.click();
  });

  inputAnexoFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      inputEl.value = `[Arquivo anexado: ${file.name}] ` + inputEl.value;
      ajustarAlturaTextarea();
      inputEl.focus();
    }
  });
}

// Inicializa a aplicação
iniciar();
