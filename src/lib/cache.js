/**
 * Sistema simples e seguro de Cache em Memória com TTL (Time-To-Live).
 * Armazena temporariamente dados não-sensíveis e estáticos (ex: matérias, conquistas, vestibulares)
 * para evitar requisições redundantes ao Supabase durante a sessão do navegador.
 */

const memoriaCache = new Map();

/**
 * Obtém um valor do cache se ainda for válido.
 * @param {string} chave 
 * @returns {any|null}
 */
export function getCache(chave) {
  const item = memoriaCache.get(chave);
  if (!item) return null;
  if (Date.now() > item.expiraEm) {
    memoriaCache.delete(chave);
    return null;
  }
  return item.valor;
}

/**
 * Armazena um valor no cache por um período determinado.
 * @param {string} chave 
 * @param {any} valor 
 * @param {number} ttlSegundos Tempo de vida em segundos (padrão: 300 = 5 minutos)
 */
export function setCache(chave, valor, ttlSegundos = 300) {
  memoriaCache.set(chave, {
    valor,
    expiraEm: Date.now() + (ttlSegundos * 1000)
  });
}

/**
 * Invalida uma entrada do cache ou limpa todo o cache.
 * @param {string} [chave] 
 */
export function limparCache(chave) {
  if (chave) {
    memoriaCache.delete(chave);
  } else {
    memoriaCache.clear();
  }
}
