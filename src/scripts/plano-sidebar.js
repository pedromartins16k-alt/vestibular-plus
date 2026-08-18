import { supabase } from '../lib/supabaseClient.js';

// Ordem mínima do plano (planos.ordem) necessária pra cada recurso da sidebar.
// 0 = free, 1 = basic, 2 = pro, 3 = premium/ultimate.
const REQUISITOS_PLANO = {
  cronograma: 1,   // Basic
  favoritos: 1,    // Basic
  flashcards: 1,   // Basic — Free é Bloqueado
  metas: 2,        // Pro
  estatisticas: 3, // Ultimate
};

const CADEADO_CLASSE = { 1: 'cadeado-basic', 2: 'cadeado-pro', 3: 'cadeado-ultimate' };
const CADEADO_LABEL = { 1: 'Basic', 2: 'Pro', 3: 'Ultimate' };

function renderIconeCadeadoMini(ordem) {
  if (ordem === 3) {
    // Ultimate holográfico
    return `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="margin-left:auto; vertical-align:middle;">
        <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/>
        <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradUltMini)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        <circle cx="12" cy="15" r="1.5" fill="#34d399"/>
        <path d="M12 16.5V18.5" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="gradUltMini" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop stop-color="#f472b6"/>
            <stop offset="0.5" stop-color="#c084fc"/>
            <stop offset="1" stop-color="#60a5fa"/>
          </linearGradient>
        </defs>
      </svg>
    `;
  }
  if (ordem === 2) {
    // PRO roxo
    return `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="margin-left:auto; vertical-align:middle;">
        <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round"/>
        <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradProMini)" stroke="rgba(168,85,247,0.5)" stroke-width="1"/>
        <circle cx="12" cy="15" r="1.5" fill="#e9d5ff"/>
        <path d="M12 16.5V18.5" stroke="#e9d5ff" stroke-width="2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="gradProMini" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop stop-color="#7c3aed"/>
            <stop offset="1" stop-color="#a855f7"/>
          </linearGradient>
        </defs>
      </svg>
    `;
  }
  // Basic azul
  return `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="margin-left:auto; vertical-align:middle;">
      <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradBasicMini)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>
      <circle cx="12" cy="15" r="1.5" fill="#bae6fd"/>
      <path d="M12 16.5V18.5" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/>
      <defs>
        <linearGradient id="gradBasicMini" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0284c7"/>
          <stop offset="1" stop-color="#38bdf8"/>
        </linearGradient>
      </defs>
    </svg>
  `;
}

/**
 * Aplica os cadeados na sidebar de acordo com o plano do usuário logado.
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

    const span = document.createElement('span');
    span.className = `cadeado-mini ${CADEADO_CLASSE[ordemNecessaria]}`;
    span.innerHTML = renderIconeCadeadoMini(ordemNecessaria);
    span.title = `Disponível a partir do plano ${CADEADO_LABEL[ordemNecessaria]}`;
    item.appendChild(span);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = `./precos.html?upgrade=${recurso}`;
    });
  });
}
