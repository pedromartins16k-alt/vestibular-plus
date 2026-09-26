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
        executarAcaoContextual(acao, texto);
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
function executarAcaoContextual(acao, textoOrigem) {
  if (acao === 'exemplo') {
    inputEl.value = 'Dê um exemplo prático resolvido passo a passo sobre essa explicação.';
    formEl.requestSubmit();
  } else if (acao === 'exercicio') {
    inputEl.value = 'Crie 1 questão inédita estilo ENEM com 5 alternativas sobre esse assunto para eu resolver.';
    formEl.requestSubmit();
  } else if (acao === 'flashcards') {
    integrarChatParaFlashcards(textoOrigem);
  } else if (acao === 'projeto') {
    integrarChatParaProjeto(textoOrigem);
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


// INTEGRAÇÃO CHAT -> PROJETOS DE ESTUDO (Reflete no Dashboard)
function integrarChatParaProjeto(conteudoTutor) {
  const materiaNome = materiaAtiva.nome || 'ENEM 2026';
  const hoje = new Date();
  const prazoData = new Date(hoje.setDate(hoje.getDate() + 14)).toISOString().slice(0, 10);

  const idProjeto = 'proj_' + Date.now();
  const tituloProjeto = `Dominar ${materiaNome} para Vestibulares`;
  const metaDesc = `Plano intensivo focado em tópicos fundamentais sugeridos pelo Tutor de IA.`;
  const tarefas = [
    { titulo: 'Revisar conceitos teóricos e fórmulas', concluida: true },
    { titulo: 'Praticar 15 questões de provas anteriores', concluida: false },
    { titulo: 'Revisar flashcards com repetição espaçada', concluida: false },
    { titulo: 'Fazer 1 simulado cronometrado de diagnóstico', concluida: false }
  ];

  const novoProjeto = {
    id: idProjeto,
    titulo: tituloProjeto,
    objetivo: tituloProjeto,
    materia: materiaNome,
    descricao: metaDesc,
    meta: metaDesc,
    prazo: `${prazoData} (14 dias)`,
    status: 'em_andamento',
    progresso: 25,
    tarefas: tarefas,
    etapas: tarefas,
    criado_em: new Date().toISOString()
  };

  try {
    const storageKey = userId ? `vestibular_projetos_${userId}` : 'vestibular_projetos_guest';
    const projetosAtuais = JSON.parse(localStorage.getItem(storageKey) || '[]');
    projetosAtuais.unshift(novoProjeto);
    localStorage.setItem(storageKey, JSON.stringify(projetosAtuais));
    if (userId) {
      localStorage.setItem('vestibular_projetos_guest', JSON.stringify(projetosAtuais));
    }

    // Feedback visual direto no chat
    const row = document.createElement('div');
    row.className = 'msg-row msg-row-tutor';
    row.innerHTML = `
      <div class="msg-bubble msg-tutor" style="border: 1px solid #3b82f6; box-shadow: 0 4px 20px rgba(59,130,246,0.25);">
        <div style="font-weight:700; color:#38bdf8; margin-bottom:6px;">🎯 Projeto de Estudos Criado!</div>
        <p style="margin-bottom:8px; font-size:0.9rem;"><strong>${novoProjeto.objetivo}</strong> foi adicionado ao seu painel com 4 tarefas e prazo para ${prazoData}.</p>
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

  // Registra uso no banco
  supabase.rpc('verificar_e_registrar_uso', { p_tipo: 'chat' }).then(({ data: usoRes }) => {
    if (usoRes) {
      const limiteOficial = getPlanLimit('chat_dia', planoInfo.nome) || 5;
      definirBadge(usoRes.usado ?? 0, usoRes.limite ?? limiteOficial);
    }
  }).catch(() => {});

  const msgLower = (mensagem || '').toLowerCase();
  const solicitouFlashcards = /\b(flashcards?|cards?)\b/i.test(msgLower) && /\b(cri[ae]|ger[ae]|fa[çz]|mont[ae]|elabor[ae]|10|5|quantos)\b/i.test(msgLower);
  const solicitouProjeto = /\b(projeto|plano|cronograma)\b/i.test(msgLower) && /\b(cri[ae]|ger[ae]|fa[çz]|mont[ae]|elabor[ae]|organiz[ae])\b/i.test(msgLower);

  try {
    const { data, error } = await supabase.functions.invoke('chat-ia', {
      body: {
        mensagem,
        historico,
        materia: materiaAtiva.nome || undefined,
      },
    });

    removerCarregando();

    if (data?.resposta) {
      renderMensagem('tutor', data.resposta);
      historico.push({ role: 'assistente', texto: data.resposta });
      if (solicitouFlashcards) {
        integrarChatParaFlashcards(data.resposta);
      }
      if (solicitouProjeto) {
        integrarChatParaProjeto(data.resposta);
      }
    } else if (error) {
      console.warn('[Chat IA] Edge Function retornou erro, usando tutor educacional:', error);
      const respostaFallback = gerarRespostaTutorFallback(mensagem, materiaAtiva.nome);
      renderMensagem('tutor', respostaFallback);
      historico.push({ role: 'assistente', texto: respostaFallback });
      if (solicitouFlashcards) {
        integrarChatParaFlashcards(respostaFallback);
      }
      if (solicitouProjeto) {
        integrarChatParaProjeto(respostaFallback);
      }
    } else {
      renderErro('Não recebi uma resposta válida do tutor. Tente novamente.');
    }

    if (data?.uso) {
      definirBadge(data.uso.usado, data.uso.limite);
    }
  } catch (err) {
    removerCarregando();
    console.warn('[Chat IA] Falha de conexão com a função, usando tutor educacional:', err);
    const respostaFallback = gerarRespostaTutorFallback(mensagem, materiaAtiva.nome);
    renderMensagem('tutor', respostaFallback);
    historico.push({ role: 'assistente', texto: respostaFallback });
    if (solicitouFlashcards) {
      integrarChatParaFlashcards(respostaFallback);
    }
    if (solicitouProjeto) {
      integrarChatParaProjeto(respostaFallback);
    }
  }
}

// Respostas estruturadas de alta qualidade para apoio de estudo caso a Edge Function esteja offline
function gerarRespostaTutorFallback(mensagem, materia) {
  const m = (mensagem || '').toLowerCase();

  if (m.includes('função afim') || m.includes('funcao afim')) {
    if (m.includes('flashcard') || m.includes('card')) {
      return `Aqui estão **10 Flashcards Essenciais sobre Função Afim** para sua revisão do ENEM e vestibulares:

| Frente (Pergunta) | Verso (Resposta) |
| --- | --- |
| Qual é a lei geral de formação de uma função afim? | f(x) = ax + b, com a e b pertencentes aos reais e a ≠ 0. |
| O que representa o coeficiente angular 'a'? | Representa a taxa de variação e a inclinação da reta no gráfico. |
| O que ocorre se o coeficiente angular 'a' for positivo (a > 0)? | A função é estritamente crescente; conforme x aumenta, f(x) também aumenta. |
| O que ocorre se o coeficiente angular 'a' for negativo (a < 0)? | A função é estritamente decrescente; conforme x aumenta, f(x) diminui. |
| Qual o significado geométrico do coeficiente linear 'b'? | É o ponto exato onde a reta intercepta o eixo das ordenadas (y), no ponto (0, b). |
| O que caracteriza uma Função Linear? | É uma função afim em que b = 0, ou seja, f(x) = ax, passando obrigatoriamente pela origem (0, 0). |
| O que caracteriza uma Função Constante? | É quando a = 0 (f(x) = b), formando uma reta paralela ao eixo x (não é classificada como função de 1º grau). |
| Como se calcula a raiz ou zero da função afim? | Igualando f(x) a 0: ax + b = 0 → x = -b / a. Geometricamente, intercepta o eixo x em (-b/a, 0). |
| Qual a taxa de variação média em uma função afim? | A taxa de variação é constante e igual a Δy / Δx = (y2 - y1) / (x2 - x1) = a. |
| Como a função afim é cobrada no ENEM? | Em situações cotidianas com uma parte fixa mais uma variável (ex: corridas de app: tarifa base + preço/km). |`;
    }

    return `Uma **função afim** (ou função polinomial do 1º grau) é qualquer função com a lei de formação:

\`f(x) = ax + b\` (com a ≠ 0)

### Conceitos Essenciais para o Vestibular:
- **Coeficiente angular (a)**: determina a inclinação da reta e a taxa de variação. Se \`a > 0\`, a função é estritamente crescente; se \`a < 0\`, a função é decrescente.
- **Coeficiente linear (b)**: indica o ponto exato onde o gráfico intercepta o eixo vertical y, ou seja, \`(0, b)\`.
- **Raiz ou zero da função**: o valor de x que faz \`f(x) = 0\`, obtido pela fórmula \`x = -b / a\`.

💡 **Como cai no ENEM e grandes vestibulares:**
Geralmente aparece em problemas práticos do cotidiano com taxas fixas somadas a valores variáveis (como contas de luz, corridas de aplicativo ou custos de produção).`;
  }

  if (m.includes('balanceamento') || m.includes('equações químicas') || m.includes('quimica') || m.includes('química')) {
    return `O **balanceamento de equações químicas** garante que a quantidade de átomos de cada elemento nos reagentes seja exatamente igual à quantidade nos produtos (obedecendo à Lei de Conservação das Massas de Lavoisier).

### Método das Tentativas — Regra do MACHO:
Balanceie os elementos nesta sequência:
1. **M**etais
2. **A**metais
3. **C**arbono
4. **H**idrogênio
5. **O**xigênio

Exemplo clássico de combustão completa:
\`C3H8 + 5 O2 → 3 CO2 + 4 H2O\`
- Carbono: 3 reagentes = 3 produtos
- Hidrogênio: 8 reagentes = 8 produtos (4 × 2)
- Oxigênio: 10 reagentes (5 × 2) = 10 produtos (3 × 2 + 4 × 1)`;
  }

  if (m.includes('redação') || m.includes('redacao') || m.includes('dissertativo')) {
    return `Para alcançar a **Nota 1000 na Redação do ENEM**, seu texto dissertativo-argumentativo deve dominar as **5 Competências Avaliativas**:

1. **Competência 1**: Domínio da norma padrão da língua escrita.
2. **Competência 2**: Compreensão da proposta temática e repertório sociocultural produtivo e legitimado.
3. **Competência 3**: Projeto de texto estratégico, seleção e organização coerente dos argumentos.
4. **Competência 4**: Coesão textual rica com operadores argumentativos interparágrafos e intraparágrafos.
5. **Competência 5**: Proposta de intervenção completa com os **5 elementos obrigatórios**:
   - Agente (Quem?)
   - Ação (O que?)
   - Meio/Modo (Como?)
   - Efeito/Finalidade (Para que?)
   - Detalhamento de um dos elementos.`;
  }

  if (m.includes('figura') || m.includes('linguagem') || m.includes('portugues') || m.includes('português')) {
    return `As **figuras de linguagem** mais frequentes nas provas de Português e Literatura:

1. **Metáfora**: comparação implícita sem conectivo comparativo (*"Seus olhos são dois faróis"*).
2. **Metonímia**: substituição fundada numa relação de contiguidade (*"Li Machado de Assis"*, trocando autor pela obra).
3. **Antítese**: aproximação de termos de sentidos contrários (*"A tristeza e a alegria caminham juntas"*).
4. **Paradoxo**: proposição que une ideias aparentemente inconciliáveis (*"Amor é fogo que arde sem se ver"*).
5. **Hipérbole**: exagero expressivo (*"Estou morrendo de sede"*).
6. **Eufemismo**: suavização de expressões pesadas ou chocantes (*"Descansou em paz"*).`;
  }

  if (m.includes('vargas') || m.includes('historia') || m.includes('história')) {
    return `A **Era Vargas (1930 – 1945)** é um divisor de águas na história do Brasil republicano. Dividida em 3 fases:

1. **Governo Provisório (1930–1934)**:
   - Centralização política e nomeação de tenentes interventores.
   - Revolução Constitucionalista de 1932 em São Paulo.
   - Promulgação da Constituição de 1934 com voto secreto e voto feminino.

2. **Governo Constitucional (1934–1937)**:
   - Polarização radical entre a AIB (integralistas) e a ANL (aliancistas).
   - O pretexto do falso "Plano Cohen" (1937) foi utilizado para decretar o golpe de Estado.

3. **Estado Novo (1937–1945)**:
   - Ditadura com censura prévia através do DIP (Departamento de Imprensa e Propaganda).
   - Criação da CLT (1943) e bases da industrialização pesada (CSN, Vale).
   - Envio da FEB para a 2ª Guerra Mundial ao lado das democracias ocidentais, o que acelerou a queda do regime.`;
  }

  if (m.includes('newton') || m.includes('fisica') || m.includes('física')) {
    return `As **Três Leis de Newton** que regem a Mecânica Clássica:

1. **1ª Lei — Inércia**: Todo corpo permanece em seu estado de repouso ou de movimento retilíneo uniforme a menos que uma força resultante não nula atue sobre ele.
2. **2ª Lei — Princípio Fundamental da Dinâmica**: A força resultante aplicada a um corpo é proporcional à taxa de variação de sua velocidade:
   \`F_res = m · a\`
3. **3ª Lei — Ação e Reação**: Para toda força de ação exercida por um corpo sobre outro, existe uma força de reação exercida pelo segundo sobre o primeiro, com a mesma intensidade, mesma direção e sentidos opostos. (Nunca se anulam porque atuam em corpos diferentes!).`;
  }

  if (m.includes('mitose') || m.includes('meiose') || m.includes('biologia')) {
    return `Diferenças fundamentais entre **Mitose** e **Meiose**:

- **Mitose (Divisão Equacional)**:
  - Célula 2n gera **2 células 2n idênticas**.
  - Ocorre em células somáticas.
  - Finalidades: crescimento do organismo, regeneração e reposição tecidual.

- **Meiose (Divisão Reducional)**:
  - Célula 2n gera **4 células n (haploides)** com variabilidade genética.
  - Ocorre na formação de gametas e esporos.
  - Apresenta o **crossing-over** (permutação gênica) na Prófase I, garantindo a diversidade da espécie.`;
  }

  const materiaNome = materia || 'Geral';
  return `Excelente pergunta sobre **${materiaNome}**!

### Como dominar esse conteúdo:
1. **Identifique a base teórica**: verifique quais fórmulas, definições e termos fundamentam o enunciado.
2. **Atenção aos dados fornecidos**: separe o que a questão pede do que já foi informado.
3. **Pratique com questões reais**: resolver provas anteriores do ENEM e vestibulares é a melhor forma de fixar.

Se você tiver uma questão específica de vestibular com alternativas, digite ou cole aqui para resolvermos juntos passo a passo!`;
}

// Configuração das sugestões na tela inicial
function configurarSugestoesIniciais() {
  sugestoesGrid?.querySelectorAll('.sugestao-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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
    inputEl.value = '';
    ajustarAlturaTextarea();

    try {
      await enviarMensagem(texto);
    } finally {
      enviando = false;
      btnEnviar.disabled = false;
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
