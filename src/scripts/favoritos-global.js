import { supabase } from '../lib/supabaseClient.js';

export async function buscarFavoritos(tipo) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Set();
  const { data } = await supabase
    .from('favoritos')
    .select('referencia_id')
    .eq('user_id', session.user.id)
    .eq('tipo', tipo);
  return new Set((data || []).map(f => f.referencia_id));
}

export async function alternarFavorito(tipo, referenciaId, favoritadoAtualmente) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return favoritadoAtualmente;
  
  if (favoritadoAtualmente) {
    await supabase
      .from('favoritos')
      .delete()
      .eq('user_id', session.user.id)
      .eq('tipo', tipo)
      .eq('referencia_id', referenciaId);
    return false;
  }

  // Checa se o plano do aluno permite favoritar (a partir do Basic)
  const { data: temAcesso, error: erroAcesso } = await supabase.rpc('usuario_tem_acesso', {
    p_recurso: 'favoritos',
  });

  if (erroAcesso) {
    console.error('[favoritos] erro ao checar acesso', erroAcesso);
  } else if (!temAcesso) {
    mostrarModalUpgradeFavoritos();
    return false;
  }

  const { error } = await supabase
    .from('favoritos')
    .insert({ user_id: session.user.id, tipo, referencia_id: referenciaId });

  if (error) {
    console.error('[favoritos] insert recusado', error);
    mostrarModalUpgradeFavoritos();
    return false;
  }

  return true;
}

function mostrarModalUpgradeFavoritos() {
  let modalUpgrade = document.getElementById('modal-upgrade-alerta');
  if (!modalUpgrade) {
    modalUpgrade = document.createElement('div');
    modalUpgrade.id = 'modal-upgrade-alerta';
    modalUpgrade.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;backdrop-filter:blur(6px);animation:fadeIn .2s ease;';
    document.body.appendChild(modalUpgrade);
  }

  modalUpgrade.innerHTML = `
    <div style="background:var(--bg-card, #13111c);border:1px solid rgba(56,189,248,.5);border-radius:20px;max-width:440px;width:100%;padding:32px 24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.6);position:relative;">
      <button id="fechar-modal-fav" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-secondary,#a1a1aa);font-size:1.2rem;cursor:pointer;">✕</button>
      <div style="margin-bottom:14px;">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" style="filter:drop-shadow(0 6px 16px rgba(56,189,248,.4));">
          <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
          <rect x="4" y="10" width="16" height="12" rx="3" fill="url(#gradFavModal)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>
          <circle cx="12" cy="15" r="1.5" fill="#bae6fd"/>
          <path d="M12 16.5V18.5" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/>
          <defs>
            <linearGradient id="gradFavModal" x1="4" y1="10" x2="20" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#0284c7"/>
              <stop offset="1" stop-color="#38bdf8"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h3 style="font-size:1.35rem;font-family:'Sora',sans-serif;margin-bottom:10px;color:#fff;">
        Favoritos no Plano <span style="background:linear-gradient(135deg, #0284c7, #38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Basic</span>
      </h3>
      <p style="font-size:.92rem;color:var(--text-secondary,#a1a1aa);line-height:1.6;margin-bottom:24px;">
        Salvar resumos e questões em Favoritos para revisar depois é um recurso exclusivo dos planos pagos (Basic, Pro e Ultimate).
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="./precos.html?plano=basic" style="display:inline-block;padding:12px 20px;border-radius:12px;background:linear-gradient(135deg, #0284c7, #38bdf8);color:#fff;text-decoration:none;font-weight:700;font-size:.95rem;box-shadow:0 4px 18px rgba(14,165,233,.4);transition:transform .2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
          🚀 Desbloquear no Plano Basic
        </a>
        <button id="cancelar-fav" style="background:none;border:none;color:var(--text-secondary,#71717a);font-size:.85rem;cursor:pointer;padding:6px;">Continuar no plano Free</button>
      </div>
    </div>
  `;

  const fechar = () => { modalUpgrade.style.display = 'none'; };
  document.getElementById('fechar-modal-fav').onclick = fechar;
  document.getElementById('cancelar-fav').onclick = fechar;
  modalUpgrade.onclick = (e) => { if (e.target === modalUpgrade) fechar(); };

  modalUpgrade.style.display = 'flex';
}
