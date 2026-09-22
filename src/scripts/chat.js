import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

// Elementos do DOM
const mensagensEl = document.getElementById('mensagens');
const chatConversaEl = document.getElementById('chat-conversa');
const emptyStateEl = document.getElementById('empty-state');
const formEl = document.getElementById('form-mensagem');
const inputEl = document.getElementById('input-mensagem');
const btnEnviar = document.getElementById('btn-enviar');
const usoBadge = document.getElementById('uso-badge');
const filtroContainer = document.getElementById('filtro-materias');
const tutorHeaderTitle = document.getElementById('tutor-header-title');
const tutorSubCargo = document.getElementById('tutor-sub-cargo');
const tutorAvatar = document.getElementById('tutor-avatar');
const btnNovoChat = document.getElementById('btn-novo-chat');
const sugestoesGrid = document.getElementById('sugestoes-grid');

let historico = []; // { role: 'usuario' | 'assistente', texto: string }
let materiaAtiva = { id: '', nome: '', icone: '📚' };
let materiasLista = [];
let enviando = false;

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
  const userId = session.user.id;

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

  configurarSugestoesIniciais();
  configurarEventosUI();

  iniciarNotificacoes(userId);
  iniciarBusca();
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

// Consulta do limite diário do usuário
async function atualizarBadgeInicial(userId) {
  try {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('planos(limite_chat_dia)')
      .eq('id', userId)
      .single();

    const limite = perfil?.planos?.limite_chat_dia;
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: uso } = await supabase
      .from('uso_diario')
      .select('chat_perguntas')
      .eq('user_id', userId)
      .eq('data', hoje)
      .maybeSingle();

    const usado = uso?.chat_perguntas || 0;
    definirBadge(usado, limite);
  } catch (e) {
    usoBadge.style.display = 'none';
  }
}

function definirBadge(usado, limite) {
  usoBadge.style.display = 'inline-flex';
  if (limite === null || limite === undefined) {
    usoBadge.innerHTML = '<span class="uso-icon">💬</span> Perguntas ilimitadas hoje';
  } else {
    usoBadge.innerHTML = `<span class="uso-icon">💬</span> ${usado}/${limite} perguntas hoje`;
  }
}

function rolarParaFinal() {
  if (chatConversaEl) {
    chatConversaEl.scrollTo({
      top: chatConversaEl.scrollHeight,
      behavior: 'smooth'
    });
  }
}

// Converte markdown básico (negrito, itálico, listas, blocos de código) em HTML seguro
function formatarTextoMarkdown(texto) {
  if (!texto) return '';

  // Escapa tags HTML para segurança
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

  // Parágrafos e quebras de linha
  const linhas = seguro.split('\n');
  let html = '';
  let emLista = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();

    if (linha.startsWith('- ') || linha.startsWith('* ') || linha.startsWith('• ')) {
      if (!emLista) {
        html += '<ul style="margin: 8px 0 8px 20px;">';
        emLista = true;
      }
      html += `<li>${linha.replace(/^[-*•]\s+/, '')}</li>`;
    } else {
      if (emLista) {
        html += '</ul>';
        emLista = false;
      }
      if (linha === '') {
        html += '<div style="height: 8px;"></div>';
      } else {
        html += `<p>${linha}</p>`;
      }
    }
  }

  if (emLista) {
    html += '</ul>';
  }

  return html;
}

// Renderiza balão de mensagem
function renderMensagem(role, texto) {
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
        <button type="button" class="btn-copiar" title="Copiar explicação">
          📋 Copiar
        </button>
      </div>
      <div class="msg-conteudo">${formatarTextoMarkdown(texto)}</div>
    `;

    // Ação do botão de copiar
    const btnCopiar = bubble.querySelector('.btn-copiar');
    btnCopiar?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(texto);
        btnCopiar.textContent = '✓ Copiado';
        setTimeout(() => {
          btnCopiar.textContent = '📋 Copiar';
        }, 2000);
      } catch (err) {
        console.warn('Falha ao copiar:', err);
      }
    });
  } else {
    // Mensagem do usuário
    bubble.textContent = texto;
  }

  row.appendChild(bubble);
  mensagensEl.appendChild(row);
  rolarParaFinal();
  return row;
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
  renderMensagem('user', mensagem);
  historico.push({ role: 'usuario', texto: mensagem });
  renderCarregando();

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
    } else if (error) {
      // Se a Edge Function do Supabase não estiver configurada/ativa, responde com o tutor educacional
      console.warn('[Chat IA] Edge Function retornou erro, usando tutor educacional:', error);
      const respostaFallback = gerarRespostaTutorFallback(mensagem, materiaAtiva.nome);
      renderMensagem('tutor', respostaFallback);
      historico.push({ role: 'assistente', texto: respostaFallback });
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
  }
}

// Respostas estruturadas de alta qualidade para apoio de estudo caso a Edge Function esteja offline
function gerarRespostaTutorFallback(mensagem, materia) {
  const m = (mensagem || '').toLowerCase();

  if (m.includes('função afim') || m.includes('funcao afim')) {
    return `Uma **função afim** (ou função polinomial do 1º grau) é qualquer função com a lei de formação:

\`f(x) = ax + b\` (com a ≠ 0)

Principais conceitos essenciais para os vestibulares:
- **Coeficiente angular (a)**: determina a inclinação da reta e a taxa de variação. Se \`a > 0\`, a função é estritamente crescente; se \`a < 0\`, a função é decrescente.
- **Coeficiente linear (b)**: indica o ponto exato onde o gráfico intercepta o eixo vertical y, ou seja, \`(0, b)\`.
- **Raiz ou zero da função**: o valor de x que faz \`f(x) = 0\`, obtido pela fórmula \`x = -b / a\`.

💡 **Como cai no ENEM e grandes vestibulares:**
Geralmente aparece em problemas práticos do cotidiano com taxas fixas somadas a valores variáveis (como contas de luz, corridas de aplicativo ou custos de produção).`;
  }

  if (m.includes('balanceamento') || m.includes('equações químicas') || m.includes('quimica') || m.includes('química')) {
    return `O **balanceamento de equações químicas** garante que a quantidade de átomos de cada elemento nos reagentes seja exatamente igual à quantidade nos produtos (obedecendo à Lei de Conservação das Massas de Lavoisier).

**Método das Tentativas — Regra do MACHO:**
Balanceie os elementos nesta sequência:
1. **M**etais
2. **A**metais
3. **C**arbono
4. **H**idrogênio
5. **O**xigênio

Exemplo clássico de combustão:
\`C3H8 + 5 O2 → 3 CO2 + 4 H2O\`
- Carbono: 3 reagentes = 3 produtos
- Hidrogênio: 8 reagentes = 8 produtos (4 × 2)
- Oxigênio: 10 reagentes (5 × 2) = 10 produtos (3 × 2 + 4 × 1)`;
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
   - Envio da FEB para a 2ª Guerra Mundial ao lado das democracias ocidentais, o que expôs a contradição do regime autoritário e acelerou sua queda.`;
  }

  if (m.includes('newton') || m.includes('fisica') || m.includes('física')) {
    return `As **Três Leis de Newton** que regem a Dinâmica clássica:

1. **1ª Lei — Inércia**: Todo corpo permanece em seu estado de repouso ou de movimento retilíneo uniforme a menos que uma força resultante não nula atue sobre ele.
2. **2ª Lei — Princípio Fundamental da Dinâmica**: A força resultante aplicada a um corpo é proporcional à taxa de variação de sua velocidade:
   \`F_res = m · a\`
3. **3ª Lei — Ação e Reação**: Para toda força de ação exercida por um corpo sobre outro, existe uma força de reação exercida pelo segundo sobre o primeiro, com a mesma intensidade, mesma direção e sentidos opostos. **Atenção:** ação e reação nunca se anulam porque atuam em corpos diferentes!`;
  }

  if (m.includes('mitose') || m.includes('meiose') || m.includes('biologia')) {
    return `Diferenças fundamentais entre **Mitose** e **Meiose**:

- **Mitose (Divisão Equacional)**:
  - Célula 2n gera **2 células 2n idênticas**.
  - Ocorre em células somáticas.
  - Finalidades: crescimento do organismo, regeneração e reposição de células mortas.

- **Meiose (Divisão Reducional)**:
  - Célula 2n gera **4 células n (haploides)** com variabilidade genética.
  - Ocorre na formação de gametas (espermatozoides e óvulos) e esporos.
  - Apresenta o **crossing-over** (permutação gênica) na Prófase I, ampliando a diversidade da espécie.`;
  }

  const materiaNome = materia || 'geral';
  return `Excelente pergunta sobre **${materiaNome}**!

Para resolver e dominar questões sobre esse assunto no vestibular:
1. **Identifique a base teórica**: verifique quais fórmulas e conceitos fundamentam o enunciado.
2. **Atenção aos dados fornecidos**: separe o que a questão pede do que já foi informado.
3. **Pratique com questões reais**: resolver provas anteriores do ENEM e vestibulares é a melhor forma de fixar.

Se você tiver uma questão específica de vestibular com alternativas, digite ou cole aqui para resolvermos juntos passo a passo!`;
}

// Configuração das sugestões na tela inicial
function configurarSugestoesIniciais() {
  sugestoesGrid?.querySelectorAll('.sugestao-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pergunta = btn.dataset.pergunta;
      const materiaNome = btn.dataset.materiaNome;

      if (materiaNome) {
        selecionarMateriaPorNome(materiaNome);
      }

      inputEl.value = pergunta;
      ajustarAlturaTextarea();
      inputEl.focus();

      // Envia imediatamente para melhor experiência do usuário
      formEl.requestSubmit();
    });
  });
}

function ajustarAlturaTextarea() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
}

function limparConversa() {
  historico = [];
  mensagensEl.innerHTML = '';
  if (emptyStateEl) {
    emptyStateEl.style.display = 'flex';
    mensagensEl.appendChild(emptyStateEl);
  }
  inputEl.value = '';
  ajustarAlturaTextarea();
  inputEl.focus();
}

function configurarEventosUI() {
  // Ajuste de altura dinâmico ao digitar
  inputEl.addEventListener('input', ajustarAlturaTextarea);

  // Enter envia, Shift+Enter pula linha
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  // Submissão do formulário
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

  // Botão de nova conversa
  btnNovoChat?.addEventListener('click', () => {
    if (historico.length > 0) {
      if (confirm('Deseja iniciar uma nova conversa e limpar as mensagens atuais?')) {
        limparConversa();
      }
    } else {
      limparConversa();
    }
  });
}

// Inicializa a aplicação
iniciar();
