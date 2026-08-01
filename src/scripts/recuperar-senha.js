import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('recuperar-form');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');
const authCard = document.getElementById('auth-card');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  const email = document.getElementById('email').value.trim();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/pages/nova-senha.html`,
  });

  if (error) {
    errorMsg.textContent = 'Não foi possível enviar o link. Verifique o e-mail digitado.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar link';
    return;
  }

  authCard.innerHTML = `
    <div class="auth-logo"><div class="dot">V+</div><strong>Vestibular+</strong></div>
    <h1 class="auth-title">E-mail enviado ✉️</h1>
    <p class="success-msg">Se existir uma conta com o e-mail <strong>${email}</strong>,
    você vai receber um link para redefinir sua senha.</p>
    <p class="auth-footer" style="margin-top:24px;">
      <a href="./login.html" style="color:var(--color-primary-500); font-weight:600;">Voltar ao login</a>
    </p>
  `;
});
