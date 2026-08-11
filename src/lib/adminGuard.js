import { exigirAutenticacao } from './authGuard.js';

// UUID fixo do admin (só o Pedro por enquanto).
const ADMIN_USER_ID = '36b9ad91-73ac-45bb-8cbb-f8ad6f16c50d';

// Garante que há sessão E que é o admin. Se não for, manda pro dashboard normal.
export async function exigirAdmin() {
  const session = await exigirAutenticacao();
  if (!session) return null;
  if (session.user.id !== ADMIN_USER_ID) {
    window.location.href = './dashboard.html';
    return null;
  }
  return session;
}
