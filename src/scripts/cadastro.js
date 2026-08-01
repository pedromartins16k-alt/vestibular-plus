import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('cadastro-form');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');
const authCard = document.getElementById('auth-card');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Criando conta...';

  const nome = document.getElementById('nome').value.trim();
  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;

  // O trigger "handle_new_user" no banco cria o profile automaticamente
  // usando o metadado "nome" enviado aqui.
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      data: { nome },
      emailRedirectTo: `${window.location.origin}/pages/login.html`,
    },
  });

  if (error) {
    errorMsg.textContent = traduzErro(error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Criar conta';
    return;
  }

  authCard.innerHTML = `
    <div class="auth-logo"><div class="dot">V+</div><strong>Vestibular+</strong></div>
    <h1 class="auth-title">Quase lá! 🎉</h1>
    <p class="success-msg">Enviamos um e-mail de confirmação para <strong>${email}</strong>.
    Clique no link para ativar sua conta e depois faça login.</p>
    <p class="auth-footer" style="margin-top:24px;">
      <a href="./login.html" style="color:var(--color-primary-500); font-weight:600;">Ir para o login</a>
    </p>
  `;
});

function traduzErro(msg) {
  if (msg.includes('already registered')) return 'Este e-mail já está cadastrado.';
  if (msg.includes('Password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
  return 'Não foi possível criar a conta. Tente novamente.';
}
