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

  try {
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
  } catch (err) {
    console.error('Erro ao efetuar login:', err);
    errorMsg.textContent = 'Erro ao conectar. Verifique sua conexão e tente novamente.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';
  }
});

if (googleBtn) {
  googleBtn.addEventListener('click', async () => {
    errorMsg.textContent = '';
    googleBtn.disabled = true;
    if (googleBtnText) googleBtnText.textContent = 'Redirecionando...';

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/pages/dashboard.html',
        },
      });

      if (error) {
        errorMsg.textContent = 'Não foi possível entrar com Google. ' + traduzErro(error.message);
        googleBtn.disabled = false;
        if (googleBtnText) googleBtnText.textContent = 'Entrar com Google';
      }
    } catch (err) {
      console.error('Erro OAuth Google:', err);
      errorMsg.textContent = 'Erro ao conectar com Google. Tente novamente.';
      googleBtn.disabled = false;
      if (googleBtnText) googleBtnText.textContent = 'Entrar com Google';
    }
  });
}

// Redireciona para o dashboard após login bem-sucedido
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    window.location.href = './dashboard.html';
  }
});

function traduzErro(msg) {
  if (!msg) return 'Não foi possível entrar. Tente novamente.';
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns instantes.';
  return 'Não foi possível entrar. Verifique os dados e tente novamente.';
}
