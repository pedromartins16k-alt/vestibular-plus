import { supabase } from '../lib/supabaseClient.js';
import {
  PLANOS_CONFIG,
  obterOrdemPlano,
  getPlanDisplayName
} from '../lib/permissions.js';

const grid = document.getElementById('planos-grid');
const banner = document.getElementById('upgrade-banner');
const backLink = document.getElementById('back-link');
const faqLista = document.getElementById('faq-lista');

const FAQ = [
  {
    p: 'Posso cancelar quando quiser?',
    r: 'Sim. Não tem fidelidade — você pode cancelar a qualquer momento e continua com acesso até o fim do período já pago.',
  },
  {
    p: 'O que acontece se eu ficar sem crédito no plano Grátis?',
    r: 'Você continua com acesso ao que já usou, mas os limites diários (questões, resumos, chat) resetam automaticamente todo dia. Pra estudar sem limite, é só fazer upgrade.',
  },
  {
    p: 'Dá pra trocar de plano depois?',
    r: 'Dá sim, a qualquer momento, direto por aqui — pra cima ou pra baixo.',
  },
  {
    p: 'Como funciona o pagamento?',
    r: 'O checkout via Mercado Pago está sendo finalizado. Por enquanto você pode conferir os planos e valores; o pagamento estará disponível em breve.',
  },
];

function formatarPreco(valor) {
  const n = Number(valor);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function criarCard(plano, planoAtualOrdem, usuarioAutenticado) {
  const isDestaque = Boolean(plano.destaque);
  const isAtual = usuarioAutenticado && planoAtualOrdem !== null && plano.ordem === planoAtualOrdem;
  const gratis = Number(plano.preco_mensal) === 0;

  // Lógica dos botões
  const isUpgrade = usuarioAutenticado && planoAtualOrdem !== null && plano.ordem > planoAtualOrdem;
  const isDowngrade = usuarioAutenticado && planoAtualOrdem !== null && plano.ordem < planoAtualOrdem;

  const card = document.createElement('div');
  card.className = `card plano-card${isDestaque && !isAtual ? ' destaque' : ''}${isAtual ? ' atual' : ''}`;

  const selo = isAtual
    ? '<div class="plano-selo atual-selo">Seu plano atual</div>'
    : (isDestaque ? '<div class="plano-selo">Mais popular</div>' : '');

  const precoHtml = gratis
    ? `<div class="plano-preco"><span class="valor">Grátis</span></div>`
    : `<div class="plano-preco"><span class="moeda">R$</span><span class="valor">${formatarPreco(plano.preco_mensal)}</span><span class="periodo">/mês</span></div>`;

  // Recursos canônicos com garantia de nunca ter undefined
  const recursosHtml = (plano.recursos || [])
    .map(r => `
      <div class="plano-recurso${r.ok ? '' : ' indisponivel'}">
        <span class="check">${r.ok ? '✓' : '✕'}</span><span>${r.texto}</span>
      </div>
    `).join('');

  // Nome do plano oficial (garantido nunca undefined)
  const nomeExibicao = plano.nome || getPlanDisplayName(plano.id);

  // Texto do botão de ação
  let btnTexto;
  if (isAtual) {
    btnTexto = 'Plano atual';
  } else if (isUpgrade) {
    btnTexto = 'Fazer upgrade';
  } else if (isDowngrade) {
    btnTexto = 'Fazer downgrade';
  } else if (gratis) {
    btnTexto = 'Começar grátis';
  } else {
    btnTexto = 'Assinar';
  }

  card.innerHTML = `
    ${selo}
    <div class="plano-nome">${nomeExibicao}</div>
    <div class="plano-desc">${plano.descricao || ''}</div>
    ${precoHtml}
    <div class="plano-preco-anual-obs">&nbsp;</div>
    <button class="btn ${isDestaque && !isAtual ? 'btn-primary' : 'btn-ghost'} plano-btn" data-plano="${plano.id}">
      ${btnTexto}
    </button>
    <div class="plano-recursos">${recursosHtml}</div>
  `;

  const btn = card.querySelector('.plano-btn');
  if (isAtual) {
    btn.disabled = true;
  } else {
    btn.addEventListener('click', () => tratarClique(plano));
  }

  return card;
}

async function tratarClique(plano) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = `./cadastro.html?plano=${plano.id}`;
    return;
  }

  if (Number(plano.preco_mensal) === 0) {
    window.location.href = './dashboard.html';
    return;
  }

  alert('O pagamento por Mercado Pago está sendo finalizado. Em breve você vai poder assinar direto por aqui!');
}

function montarFaq() {
  faqLista.innerHTML = FAQ.map((item, i) => `
    <div class="card faq-item" data-i="${i}">
      <div class="faq-pergunta">
        <span>${item.p}</span>
        <span class="faq-seta">▾</span>
      </div>
      <div class="faq-resposta">${item.r}</div>
    </div>
  `).join('');

  faqLista.querySelectorAll('.faq-item').forEach(item => {
    item.addEventListener('click', () => item.classList.toggle('open'));
  });
}

function mostrarBannerUpgrade() {
  const params = new URLSearchParams(window.location.search);
  const recurso = params.get('upgrade');
  if (!recurso) return;

  const nomes = {
    cronograma: 'o Cronograma',
    favoritos: 'os Favoritos',
    metas: 'as Metas',
    flashcards: 'os Flashcards',
    estatisticas: 'as Estatísticas avançadas',
    dificuldade_genio: 'o Nível Gênio',
    chat: 'mais perguntas no Chat com IA',
    treineiro: 'o módulo Sou Treineiro',
  };
  const nomeRecurso = nomes[recurso] || 'esse recurso';
  banner.textContent = `🔒 Pra desbloquear ${nomeRecurso}, escolha um plano abaixo.`;
  banner.classList.add('show');
}

async function iniciar() {
  mostrarBannerUpgrade();
  montarFaq();

  const { data: { session } } = await supabase.auth.getSession();
  let planoAtualOrdem = null;
  const usuarioAutenticado = Boolean(session);

  if (session) {
    backLink.href = './dashboard.html';
    backLink.textContent = '← Voltar ao dashboard';

    try {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('planos(nome, ordem)')
        .eq('id', session.user.id)
        .maybeSingle();

      if (perfil?.planos) {
        planoAtualOrdem = perfil.planos.ordem ?? obterOrdemPlano(perfil.planos.nome);
      } else {
        planoAtualOrdem = 0; // Default Free
      }
    } catch (err) {
      console.warn('Erro ao consultar plano atual:', err);
      planoAtualOrdem = 0;
    }
  }

  // A lista canônica dos 4 planos oficiais sempre ordenada de 0 a 3
  const planosOrdenados = [
    PLANOS_CONFIG.free,
    PLANOS_CONFIG.basic,
    PLANOS_CONFIG.pro,
    PLANOS_CONFIG.ultimate
  ];

  grid.innerHTML = '';
  planosOrdenados.forEach(plano => {
    grid.appendChild(criarCard(plano, planoAtualOrdem, usuarioAutenticado));
  });
}

iniciar();
