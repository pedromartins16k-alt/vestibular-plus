import { supabase } from './supabaseClient.js';

// Níveis de hierarquia dos planos no sistema
export const PLANOS_HIERARQUIA = {
  free: 0,
  basic: 1,
  pro: 2,
  premium: 3,
  ultimate: 3
};

// Requisitos mínimos de plano para recursos da plataforma
export const REQUISITOS_RECURSO = {
  cronograma: 1,           // Basic+
  favoritos: 1,            // Basic+
  flashcards: 1,           // Basic+
  metas: 2,                // Pro+
  projetos: 2,             // Pro+
  dificuldade_genio: 2,    // Pro+
  estatisticas_avancadas: 3, // Ultimate
  chat_ilimitado: 2        // Pro e Ultimate possuem chat ilimitado
};

// Nomes formatados dos planos
export const LABELS_PLANO = {
  free: 'Free',
  basic: 'Basic',
  pro: 'PRO',
  premium: 'Ultimate',
  ultimate: 'Ultimate'
};

/**
 * Normaliza o identificador do plano e retorna a ordem correspondente.
 */
export function obterOrdemPlano(planoNomeOuOrdem) {
  if (typeof planoNomeOuOrdem === 'number') return planoNomeOuOrdem;
  if (!planoNomeOuOrdem) return 0;
  const normalizado = String(planoNomeOuOrdem).toLowerCase().trim();
  return PLANOS_HIERARQUIA[normalizado] ?? 0;
}

/**
 * Verifica se o usuário tem o plano Ultimate/Premium (nível máximo).
 */
export function isUltimate(planoNomeOuOrdem) {
  const ordem = obterOrdemPlano(planoNomeOuOrdem);
  return ordem >= 3;
}

/**
 * Verifica se um plano possui acesso a determinado recurso.
 * @param {string} recurso
 * @param {string|number} planoNomeOuOrdem
 * @returns {boolean}
 */
export function hasFeature(recurso, planoNomeOuOrdem) {
  const ordem = obterOrdemPlano(planoNomeOuOrdem);
  
  // Ultimate sempre tem acesso irrestrito a todas as funcionalidades
  if (ordem >= 3) return true;

  const ordemMinima = REQUISITOS_RECURSO[recurso];
  if (ordemMinima === undefined) return true; // Se não houver restrição declarada, é público

  return ordem >= ordemMinima;
}

/**
 * Busca o plano atual do usuário diretamente no Supabase com cache seguro.
 */
export async function obterPlanoUsuario(userId) {
  if (!userId) return { nome: 'free', ordem: 0, isUltimate: false };

  try {
    const { data: perfil, error } = await supabase
      .from('profiles')
      .select('planos(nome, ordem)')
      .eq('id', userId)
      .maybeSingle();

    if (error || !perfil?.planos) {
      return { nome: 'free', ordem: 0, isUltimate: false };
    }

    const nome = (perfil.planos.nome || 'free').toLowerCase();
    const ordem = perfil.planos.ordem ?? PLANOS_HIERARQUIA[nome] ?? 0;

    return {
      nome,
      ordem,
      isUltimate: ordem >= 3 || nome === 'ultimate' || nome === 'premium',
      label: isUltimate(ordem) ? '✦ ULTIMATE' : (LABELS_PLANO[nome] || 'Free')
    };
  } catch (err) {
    console.warn('[permissions] Erro ao obter plano do usuário:', err);
    return { nome: 'free', ordem: 0, isUltimate: false };
  }
}
