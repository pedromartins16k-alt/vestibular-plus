import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');
const googleBtn = document.getElementById('google-btn');
const googleBtnText = document.getElementById('google-btn-text');

// 1. Se já houver sessão ativa, redireciona diretamente ao Dashboard
async function checarSessaoExistente() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      window.location.href = './dashboard.html';
    }
  } catch (err) {
    console.warn('Erro ao verificar sessão existente:', err);
  }
}
checarSessaoExistente();

// 2. Trata parâmetros de retorno do OAuth na URL (ex: cancelamento ou erro do Google)
function checarRetornoOAuth() {
  try {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
    );

    const erro = params.get('error') || hashParams.get('error');
    const erroDescricao = params.get('error_description') || hashParams.get('error_description') || '';

    if (erro) {
      const textoCompleto = `${erro} ${erroDescricao}`.toLowerCase();
      const cancelou = textoCompleto.includes('access_denied') ||
                       textoCompleto.includes('user_cancelled') ||
                       textoCompleto.includes('popup_closed') ||
                       textoCompleto.includes('cancel');

      // Se o usuário cancelou o login, não exibe erro técnico
      if (!cancelou) {
        errorMsg.textContent = 'Não foi possível entrar com o Google. Tente novamente.';
      }

      // Limpa a URL para remover parâmetros de erro sem recarregar a página
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (errParams) {
    console.warn('Erro ao verificar parâmetros de retorno:', errParams);
  }
}
checarRetornoOAuth();

// 3. Login com E-mail e Senha tradicional (mantido 100% intacto)
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

// 4. Fluxo real do botão "Entrar com Google"
if (googleBtn) {
  googleBtn.addEventListener('click', async () => {
    errorMsg.textContent = '';
    googleBtn.disabled = true;
    if (googleBtnText) googleBtnText.textContent = 'Conectando com Google...';

    try {
      // URL absoluta canônica para retorno no Dashboard
      const redirectUrl = new URL('./dashboard.html', window.location.href).href;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        const msg = (error.message || '').toLowerCase();
        const cancelou = msg.includes('access_denied') ||
                         msg.includes('user_cancelled') ||
                         msg.includes('popup_closed') ||
                         msg.includes('cancel');

        if (!cancelou) {
          errorMsg.textContent = 'Não foi possível entrar com o Google. Tente novamente.';
        }

        googleBtn.disabled = false;
        if (googleBtnText) googleBtnText.textContent = 'Entrar com Google';
      }
    } catch (err) {
      console.error('Erro OAuth Google:', err);
      errorMsg.textContent = 'Não foi possível entrar com o Google. Tente novamente.';
      googleBtn.disabled = false;
      if (googleBtnText) googleBtnText.textContent = 'Entrar com Google';
    }
  });
}

// 5. Escuta evento de login e redireciona para o dashboard
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
