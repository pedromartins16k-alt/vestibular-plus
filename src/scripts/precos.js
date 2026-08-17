import { supabase } from '../lib/supabaseClient.js';

const grid = document.getElementById('planos-grid');
const banner = document.getElementById('upgrade-banner');
const backLink = document.getElementById('back-link');
const faqLista = document.getElementById('faq-lista');

const DESCRICOES = {
  free: 'Pra começar a estudar sem gastar nada.',
  basic: 'Todo o banco de questões liberado, sem limites diários.',
  pro: 'Pra quem quer estudar todo dia com IA no nível genial.',
  premium: 'A experiência completa, com o chat de IA sem limites.',
};

const DESTAQUE = 'pro'; // "Mais popular"

const FAQ = [
  {
    p: 'Posso cancelar quando quiser?',
    r: 'Sim. Não tem fidelidade — você pode cancelar a qualquer momento e continua com acesso até o fim do período já pago.',
  },
  {
    p: 'O que acontece se eu ficar sem crédito no plano Free?',
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

function montarRecursos(plano) {
  const recursos = [];

  recursos.push({
    ok: true,
    texto: plano.percentual_banco_liberado >= 100
      ? 'Banco de questões 100% liberado'
      : `${plano.percentual_banco_liberado}% do banco de questões liberado`,
  });

  recursos.push({
    ok: true,
    texto: plano.limite_questoes_dia
      ? `${plano.limite_questoes_dia} questões por dia`
      : 'Questões ilimitadas por dia',
  });

  recursos.push({
    ok: true,
    texto: plano.limite_resumos_dia
      ? `${plano.limite_resumos_dia} resumos por dia`
      : 'Resumos ilimitados por dia',
  });

  recursos.push({
    ok: true,
    texto: plano.limite_simulados_semana
      ? `${plano.limite_simulados_semana} simulados por semana`
      : 'Simulados ilimitados por semana',
  });

  recursos.push({
    ok: true,
    texto: `Chat com IA · ${plano.limite_chat_dia} perguntas/dia`,
  });

  recursos.push({ ok: plano.acesso_favoritos, texto: 'Favoritar resumos e questões' });
  recursos.push({ ok: plano.acesso_dificuldade_genio, texto: 'Nível de dificuldade Gênio' });
  recursos.push({ ok: plano.acesso_google_calendar, texto: 'Sincronização com Google Calendar' });
  recursos.push({ ok: plano.acesso_estatisticas_avancadas, texto: 'Estatísticas avançadas' });

  return recursos;
}

function criarCard(plano, planoAtualNome) {
  const isDestaque = plano.nome === DESTAQUE;
  const isAtual = plano.nome === planoAtualNome;
  const gratis = Number(plano.preco_mensal) === 0;

  const card = document.createElement('div');
  card.className = `card plano-card${isDestaque && !isAtual ? ' destaque' : ''}${isAtual ? ' atual' : ''}`;

  const selo = isAtual
    ? '<div class="plano-selo atual-selo">Seu plano atual</div>'
    : (isDestaque ? '<div class="plano-selo">Mais popular</div>' : '');

  const precoHtml = gratis
    ? `<div class="plano-preco"><span class="valor">Grátis</span></div>`
    : `<div class="plano-preco"><span class="moeda">R$</span><span class="valor">${formatarPreco(plano.preco_mensal)}</span><span class="periodo">/mês</span></div>`;

  const recursos = montarRecursos(plano)
    .map(r => `
      <div class="plano-recurso${r.ok ? '' : ' indisponivel'}">
        <span class="check">${r.ok ? '✓' : '✕'}</span><span>${r.texto}</span>
      </div>
    `).join('');

  card.innerHTML = `
    ${selo}
    <div class="plano-nome">${plano.nome_exibicao}</div>
    <div class="plano-desc">${DESCRICOES[plano.nome] || ''}</div>
    ${precoHtml}
    <div class="plano-preco-anual-obs">&nbsp;</div>
    <button class="btn ${isDestaque && !isAtual ? 'btn-primary' : 'btn-ghost'} plano-btn" data-plano="${plano.nome}">
      ${isAtual ? 'Plano atual' : (gratis ? 'Começar grátis' : 'Assinar')}
    </button>
    <div class="plano-recursos">${recursos}</div>
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
    window.location.href = `./cadastro.html?plano=${plano.nome}`;
    return;
  }

  if (Number(plano.preco_mensal) === 0) {
    window.location.href = './dashboard.html';
    return;
  }

  // Checkout via Mercado Pago ainda não integrado — aviso temporário.
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
    estatisticas: 'as Estatísticas avançadas',
  };
  const nomeRecurso = nomes[recurso] || 'esse recurso';
  banner.textContent = `🔒 Pra desbloquear ${nomeRecurso}, escolha um plano abaixo.`;
  banner.classList.add('show');
}

async function iniciar() {
  mostrarBannerUpgrade();
  montarFaq();

  const { data: { session } } = await supabase.auth.getSession();
  let planoAtualNome = null;

  if (session) {
    backLink.href = './dashboard.html';
    backLink.textContent = '← Voltar ao dashboard';

    const { data: perfil } = await supabase
      .from('profiles')
      .select('planos(nome)')
      .eq('id', session.user.id)
      .single();
    planoAtualNome = perfil?.planos?.nome ?? 'free';
  }

  const { data: planos, error } = await supabase
    .from('planos')
    .select('*')
    .order('ordem', { ascending: true });

  if (error || !planos) {
    grid.innerHTML = '<p class="empty-state">Não foi possível carregar os planos agora. Tente recarregar a página.</p>';
    return;
  }

  grid.innerHTML = '';
  planos.forEach(plano => grid.appendChild(criarCard(plano, planoAtualNome)));
}

iniciar();
