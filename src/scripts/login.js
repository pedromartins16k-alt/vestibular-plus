import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');
const googleBtn = document.getElementById('google-btn');
const googleBtnText = document.getElementById('google-btn-text');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Entrando...';

  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    errorMsg.textContent = traduzErro(error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';
    return;
  }

  window.location.href = './dashboard.html';
});

googleBtn.addEventListener('click', async () => {
  googleBtn.disabled = true;
  googleBtnText.textContent = 'Redirecionando...';

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      scopes: 'https://www.googleapis.com/auth/calendar.events',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    errorMsg.textContent = 'Não foi possível entrar com Google. Tente novamente.';
    googleBtn.disabled = false;
    googleBtnText.textContent = 'Entrar com Google';
  }
});

// Depois do redirect de volta do Google, o Supabase dispara SIGNED_IN aqui.
// Se vier com token de calendário, salva antes de mandar pro dashboard.
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event !== 'SIGNED_IN' || !session) return;
  if (!session.provider_refresh_token) return; // login normal por e-mail/senha, nada a fazer aqui

  await supabase.from('google_calendar_conexoes').upsert({
    user_id: session.user.id,
    refresh_token: session.provider_refresh_token,
    access_token: session.provider_token || null,
    token_expira_em: new Date(Date.now() + 3500 * 1000).toISOString(),
  });

  window.location.href = './dashboard.html';
});

function traduzErro(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  return 'Não foi possível entrar. Tente novamente.';
}
