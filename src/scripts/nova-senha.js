import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('nova-senha-form');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');
const authCard = document.getElementById('auth-card');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Salvando...';

  const senha = document.getElementById('senha').value;
  const { error } = await supabase.auth.updateUser({ password: senha });

  if (error) {
    errorMsg.textContent = 'Não foi possível redefinir a senha. O link pode ter expirado.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Salvar nova senha';
    return;
  }

  authCard.innerHTML = `
    <div class="auth-logo"><div class="dot">V+</div><strong>Vestibular+</strong></div>
    <h1 class="auth-title">Senha redefinida ✅</h1>
    <p style="color:var(--text-secondary); text-align:center;">Agora você já pode entrar com sua nova senha.</p>
    <a class="btn btn-primary btn-full" style="margin-top:20px; text-align:center;" href="./login.html">Ir para o login</a>
  `;
});
