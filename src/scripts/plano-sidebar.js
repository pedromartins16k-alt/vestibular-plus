import { supabase } from '../lib/supabaseClient.js';

// Ordem mínima do plano (planos.ordem) necessária pra cada recurso da sidebar.
// 0 = free, 1 = basic, 2 = pro, 3 = premium/ultimate.
// Recursos que não aparecem aqui são livres pra todo mundo (podem ter limite
// diário/semanal aplicado na própria tela, mas não ficam com cadeado na sidebar).
const REQUISITOS_PLANO = {
  cronograma: 1,   // Basic
  favoritos: 1,    // Basic
  flashcards: 1,   // Basic — Free é "Bloqueado" na tabela de planos
  metas: 2,        // Pro
  estatisticas: 3, // Ultimate — Pro continua bloqueado (era 2, bug)
};

const CADEADO_CLASSE = { 1: 'cadeado-prata', 2: 'cadeado-dourado', 3: 'cadeado-roxo' };
const CADEADO_LABEL = { 1: 'Basic', 2: 'Pro', 3: 'Ultimate' };

/**
 * Aplica os cadeados na sidebar de acordo com o plano do usuário logado.
 * Precisa ser chamada depois que a sidebar já está no DOM.
 * Os itens da sidebar que devem ser avaliados precisam ter o atributo
 * data-recurso="cronograma" (ou metas / favoritos / estatisticas / flashcards) no HTML.
 */
export async function aplicarCadeadosSidebar(userId) {
  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('planos(ordem)')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Erro ao verificar plano do usuário:', error);
    return;
  }

  const ordemUsuario = perfil?.planos?.ordem ?? 0;

  document.querySelectorAll('.nav-item[data-recurso]').forEach(item => {
    const recurso = item.dataset.recurso;
    const ordemNecessaria = REQUISITOS_PLANO[recurso];
    if (!ordemNecessaria || ordemUsuario >= ordemNecessaria) return;

    item.classList.add('nav-item-bloqueado');

    const cadeado = document.createElement('span');
    cadeado.className = `cadeado-mini ${CADEADO_CLASSE[ordemNecessaria]}`;
    cadeado.textContent = '🔒';
    cadeado.title = `Disponível no plano ${CADEADO_LABEL[ordemNecessaria]}`;
    item.appendChild(cadeado);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = `./precos.html?upgrade=${recurso}`;
    });
  });
}
