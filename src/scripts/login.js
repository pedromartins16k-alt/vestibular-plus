import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');

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

function traduzErro(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  return 'Não foi possível entrar. Tente novamente.';
}
