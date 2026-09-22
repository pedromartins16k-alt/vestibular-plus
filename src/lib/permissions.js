import { supabase } from './supabaseClient.js';

/**
 * ============================================================================
 * VESTIBULAR+ — SISTEMA CENTRAL DE PLANOS, PERMISSÕES E DIFICULDADES
 * FONTE ÚNICA DE VERDADE PARA TODO O PROJETO
 * ============================================================================
 */

// 1. Hierarquia oficial dos planos
export const PLANOS_HIERARQUIA = {
  free: 0,
  gratis: 0,
  basic: 1,
  pro: 2,
  premium: 3,
  ultimate: 3
};

// 2. Nomes de exibição padronizados (nunca undefined, null ou termos internos)
export const PLAN_DISPLAY_NAMES = {
  free: 'Grátis',
  gratis: 'Grátis',
  basic: 'Basic',
  pro: 'Pro',
  premium: 'Ultimate',
  ultimate: 'Ultimate'
};

export const LABELS_PLANO = PLAN_DISPLAY_NAMES;

// 3. Hierarquia oficial de dificuldades
export const DIFICULDADE_HIERARQUIA = {
  facil: 0,
  medio: 1,
  dificil: 2,
  genio: 3
};

export const DIFICULDADE_LABELS = {
  facil: 'Fácil',
  medio: 'Médio',
  dificil: 'Difícil',
  genio: 'Gênio'
};

// 4. Limites oficiais por plano
export const PLAN_LIMITS = {
  free: {
    questoes_dia: 15,
    resumos_dia: 10,
    simulados_semana: 5,
    chat_dia: 5
  },
  basic: {
    questoes_dia: null, // ilimitado
    resumos_dia: null,  // ilimitado
    simulados_semana: 5,
    chat_dia: 15
  },
  pro: {
    questoes_dia: null, // ilimitado
    resumos_dia: null,  // ilimitado
    simulados_semana: 10,
    chat_dia: 30
  },
  premium: {
    questoes_dia: null, // ilimitado
    resumos_dia: null,  // ilimitado
    simulados_semana: null, // ilimitado
    chat_dia: 100       // 100 perguntas/dia (Ultimate NÃO é ilimitado no chat)
  },
  ultimate: {
    questoes_dia: null, // ilimitado
    resumos_dia: null,  // ilimitado
    simulados_semana: null, // ilimitado
    chat_dia: 100       // 100 perguntas/dia (Ultimate NÃO é ilimitado no chat)
  }
};

// 5. Configuração canônica completa dos 4 planos oficiais
export const PLANOS_CONFIG = {
  free: {
    id: 'free',
    nome: 'Grátis',
    ordem: 0,
    preco_mensal: 0,
    descricao: 'Pra começar a estudar sem gastar nada.',
    limite_questoes_dia: 15,
    limite_resumos_dia: 10,
    limite_simulados_semana: 5,
    limite_chat_dia: 5,
    acesso_favoritos: false,
    acesso_dificuldade_genio: false,
    acesso_estatisticas_avancadas: false,
    dificuldade_maxima: 0,
    recursos: [
      { ok: true, texto: '15 questões por dia' },
      { ok: true, texto: '10 resumos por dia' },
      { ok: true, texto: '5 simulados por semana' },
      { ok: true, texto: 'Chat com IA · 5 perguntas/dia' },
      { ok: true, texto: 'Nível Fácil liberado' },
      { ok: false, texto: 'Favoritar resumos e questões' },
      { ok: false, texto: 'Níveis Médio, Difícil e Gênio' },
      { ok: false, texto: 'Estatísticas avançadas' }
    ]
  },
  basic: {
    id: 'basic',
    nome: 'Basic',
    ordem: 1,
    preco_mensal: 9.90,
    descricao: 'Todo o banco de questões liberado, sem limites diários.',
    limite_questoes_dia: null,
    limite_resumos_dia: null,
    limite_simulados_semana: 5,
    limite_chat_dia: 15,
    acesso_favoritos: true,
    acesso_dificuldade_genio: false,
    acesso_estatisticas_avancadas: false,
    dificuldade_maxima: 1,
    recursos: [
      { ok: true, texto: 'Questões ilimitadas por dia' },
      { ok: true, texto: 'Resumos ilimitados por dia' },
      { ok: true, texto: '5 simulados por semana' },
      { ok: true, texto: 'Chat com IA · 15 perguntas/dia' },
      { ok: true, texto: 'Níveis Fácil e Médio liberados' },
      { ok: true, texto: 'Favoritar resumos e questões' },
      { ok: false, texto: 'Níveis Difícil e Gênio' },
      { ok: false, texto: 'Estatísticas avançadas' }
    ]
  },
  pro: {
    id: 'pro',
    nome: 'Pro',
    ordem: 2,
    preco_mensal: 19.90,
    destaque: true,
    descricao: 'Pra quem quer estudar todo dia com simulados ampliados.',
    limite_questoes_dia: null,
    limite_resumos_dia: null,
    limite_simulados_semana: 10,
    limite_chat_dia: 30,
    acesso_favoritos: true,
    acesso_dificuldade_genio: false,
    acesso_estatisticas_avancadas: false,
    dificuldade_maxima: 2,
    recursos: [
      { ok: true, texto: 'Questões ilimitadas por dia' },
      { ok: true, texto: 'Resumos ilimitados por dia' },
      { ok: true, texto: '10 simulados por semana' },
      { ok: true, texto: 'Chat com IA · 30 perguntas/dia' },
      { ok: true, texto: 'Níveis Fácil, Médio e Difícil liberados' },
      { ok: true, texto: 'Favoritar resumos e questões' },
      { ok: true, texto: 'Módulo Sou treineiro liberado' },
      { ok: false, texto: 'Nível de dificuldade Gênio' },
      { ok: false, texto: 'Estatísticas avançadas' }
    ]
  },
  ultimate: {
    id: 'ultimate',
    nome: 'Ultimate',
    ordem: 3,
    preco_mensal: 39.90,
    descricao: 'A experiência completa com simulados ilimitados e nível Gênio.',
    limite_questoes_dia: null,
    limite_resumos_dia: null,
    limite_simulados_semana: null,
    limite_chat_dia: 100, // IMPORTANTE: Ultimate tem exatamente 100 perguntas/dia, NÃO ilimitado
    acesso_favoritos: true,
    acesso_dificuldade_genio: true,
    acesso_estatisticas_avancadas: true,
    dificuldade_maxima: 3,
    recursos: [
      { ok: true, texto: 'Questões ilimitadas por dia' },
      { ok: true, texto: 'Resumos ilimitados por dia' },
      { ok: true, texto: 'Simulados ilimitados por semana' },
      { ok: true, texto: 'Chat com IA · 100 perguntas/dia' },
      { ok: true, texto: 'Todos os níveis (Fácil, Médio, Difícil e Gênio)' },
      { ok: true, texto: 'Favoritar resumos e questões' },
      { ok: true, texto: 'Módulos Treineiro e Por assunto' },
      { ok: true, texto: 'Estatísticas avançadas' }
    ]
  }
};

// 6. Requisitos mínimos de plano por recurso da plataforma
export const REQUISITOS_RECURSO = {
  cronograma: 1,             // Basic+
  favoritos: 1,              // Basic+
  flashcards: 1,             // Basic+
  vestibulares: 0,           // Grátis (Aba SP)
  vestibulares_treineiro: 2, // Pro+ (Pro e Ultimate liberados)
  sou_treineiro: 2,          // Pro+ (Pro e Ultimate liberados)
  metas: 2,                  // Pro+
  projetos: 2,               // Pro+
  vestibulares_assunto: 3,   // Ultimate (exclusivo)
  dificuldade_genio: 3,      // Ultimate (exclusivo)
  estatisticas_avancadas: 3  // Ultimate (exclusivo)
};

/**
 * Normaliza o identificador do plano e retorna a ordem correspondente (0 a 3).
 */
export function obterOrdemPlano(planoNomeOuOrdem) {
  if (typeof planoNomeOuOrdem === 'number') {
    return Math.max(0, Math.min(3, Math.floor(planoNomeOuOrdem)));
  }
  if (!planoNomeOuOrdem) return 0;
  const normalizado = String(planoNomeOuOrdem).toLowerCase().trim();
  return PLANOS_HIERARQUIA[normalizado] ?? 0;
}

/**
 * Normaliza o identificador de dificuldade e retorna a ordem correspondente (0 a 3).
 */
export function obterOrdemDificuldade(dificuldadeNomeOuOrdem) {
  if (typeof dificuldadeNomeOuOrdem === 'number') {
    return Math.max(0, Math.min(3, Math.floor(dificuldadeNomeOuOrdem)));
  }
  if (!dificuldadeNomeOuOrdem) return 0;
  const normalizado = String(dificuldadeNomeOuOrdem).toLowerCase().trim();
  return DIFICULDADE_HIERARQUIA[normalizado] ?? 0;
}

/**
 * Verifica se o plano atual atende ao plano mínimo necessário pela hierarquia:
 * planoAtual >= planoNecessario
 */
export function hasPlanAccess(currentPlan, requiredPlan) {
  const ordemAtual = obterOrdemPlano(currentPlan);
  const ordemNecessaria = obterOrdemPlano(requiredPlan);
  return ordemAtual >= ordemNecessaria;
}

/**
 * Verifica acesso a um nível de dificuldade de acordo com a regra central:
 * ordemDificuldade <= ordemPlano
 *
 * Grátis (0)   -> Fácil (0)
 * Basic (1)    -> Fácil (0), Médio (1)
 * Pro (2)      -> Fácil (0), Médio (1), Difícil (2)
 * Ultimate (3) -> Fácil (0), Médio (1), Difícil (2), Gênio (3)
 */
export function canAccessDifficulty(planoNomeOuOrdem, dificuldadeNomeOuOrdem) {
  const ordemPlano = obterOrdemPlano(planoNomeOuOrdem);
  const ordemDificuldade = obterOrdemDificuldade(dificuldadeNomeOuOrdem);
  return ordemDificuldade <= ordemPlano;
}

export const getDifficultyAccess = canAccessDifficulty;

/**
 * Retorna as informações do plano mínimo necessário para desbloquear determinada dificuldade.
 */
export function getPlanoMinimoParaDificuldade(dificuldade) {
  const ordemDif = obterOrdemDificuldade(dificuldade);
  if (ordemDif === 3) {
    return {
      nome: 'Ultimate',
      ordem: 3,
      id: 'ultimate',
      classe: 'ultimate',
      gradiente: 'linear-gradient(135deg, #f472b6, #c084fc, #60a5fa)',
      corTexto: '#ffffff',
      desc: 'no nível Gênio'
    };
  }
  if (ordemDif === 2) {
    return {
      nome: 'Pro',
      ordem: 2,
      id: 'pro',
      classe: 'pro',
      gradiente: 'linear-gradient(135deg, #7c3aed, #a855f7)',
      corTexto: '#e9d5ff',
      desc: 'no nível Difícil'
    };
  }
  if (ordemDif === 1) {
    return {
      nome: 'Basic',
      ordem: 1,
      id: 'basic',
      classe: 'basic',
      gradiente: 'linear-gradient(135deg, #0284c7, #38bdf8)',
      corTexto: '#bae6fd',
      desc: 'no nível Médio'
    };
  }
  return {
    nome: 'Grátis',
    ordem: 0,
    id: 'free',
    classe: 'free',
    gradiente: 'linear-gradient(135deg, #10b981, #059669)',
    corTexto: '#d1fae5',
    desc: 'no nível Fácil'
  };
}

/**
 * Retorna o nome oficial de exibição para um plano.
 */
export function getPlanDisplayName(planoNome) {
  const normalizado = (planoNome || 'free').toLowerCase().trim();
  return PLAN_DISPLAY_NAMES[normalizado] || 'Grátis';
}

/**
 * Retorna o limite de um recurso específico para um plano.
 */
export function getPlanLimit(recurso, planoNome) {
  const normalizado = (planoNome || 'free').toLowerCase().trim();
  const limites = PLAN_LIMITS[normalizado] || PLAN_LIMITS.free;
  return limites[recurso] ?? null;
}

/**
 * Verifica se o usuário tem o plano Ultimate (nível máximo 3).
 */
export function isUltimate(planoNomeOuOrdem) {
  const ordem = obterOrdemPlano(planoNomeOuOrdem);
  return ordem >= 3;
}

/**
 * Verifica se um plano possui acesso a determinado recurso.
 * Ultimate sempre tem acesso a tudo que Pro e Basic têm.
 */
export function hasFeature(recurso, planoNomeOuOrdem) {
  const ordem = obterOrdemPlano(planoNomeOuOrdem);
  if (ordem >= 3) return true;

  const ordemMinima = REQUISITOS_RECURSO[recurso];
  if (ordemMinima === undefined) return true;

  return ordem >= ordemMinima;
}

export const canUseFeature = hasFeature;
export const hasFeatureAccess = hasFeature;

/**
 * Busca o plano atual do usuário diretamente no Supabase com fallback seguro.
 */
export async function obterPlanoUsuario(userId) {
  if (!userId) {
    return { nome: 'free', ordem: 0, isUltimate: false, label: 'Grátis' };
  }

  try {
    const { data: perfil, error } = await supabase
      .from('profiles')
      .select('planos(nome, ordem)')
      .eq('id', userId)
      .maybeSingle();

    if (error || !perfil?.planos) {
      return { nome: 'free', ordem: 0, isUltimate: false, label: 'Grátis' };
    }

    const nome = (perfil.planos.nome || 'free').toLowerCase().trim();
    const ordem = perfil.planos.ordem ?? PLANOS_HIERARQUIA[nome] ?? 0;
    const ultimateFlag = ordem >= 3 || nome === 'ultimate' || nome === 'premium';

    return {
      nome: ultimateFlag ? 'ultimate' : nome,
      ordem,
      isUltimate: ultimateFlag,
      label: getPlanDisplayName(nome)
    };
  } catch (err) {
    console.warn('[permissions] Erro ao obter plano do usuário:', err);
    return { nome: 'free', ordem: 0, isUltimate: false, label: 'Grátis' };
  }
}
