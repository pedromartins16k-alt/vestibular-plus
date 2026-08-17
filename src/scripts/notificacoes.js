
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao, sair } from '../lib/authGuard.js';
import { iniciarBusca } from './busca-global.js';
import { iniciarNotificacoes } from './notificacoes-global.js';
import { aplicarCadeadosSidebar } from './plano-sidebar.js';

async function iniciarPagina() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome, nome_usuario')
    .eq('id', userId)
    .single();
  const nomeExibicao = profile?.nome_usuario || profile?.nome?.split(' ')[0] || 'Aluno(a)';
  document.getElementById('avatar-inicial').textContent = nomeExibicao[0]?.toUpperCase() || 'A';

  await carregarTodas(userId);

  document.getElementById('marcar-todas-btn').addEventListener('click', async () => {
    await supabase.from('notificacoes').update({ lida: true }).eq('user_id', userId).eq('lida', false);
    carregarTodas(userId);
  });

  document.getElementById('logout-btn').addEventListener('click', sair);
  aplicarCadeadosSidebar(userId);
}

async function carregarTodas(userId) {
  const lista = document.getElementById('notif-lista-completa');
  const { data } = await supabase
    .from('notificacoes')
    .select('id, titulo, mensagem, lida, criado_em')
    .eq('user_id', userId)
    .order('criado_em', { ascending: false });

  if (!data || !data.length) {
    lista.innerHTML = '<div class="empty-state">Você ainda não tem nenhuma notificação.</div>';
    return;
  }

  lista.innerHTML = data.map(n => `
    <div class="notif-linha ${n.lida ? '' : 'nao-lida'}" data-id="${n.id}">
      <div class="notif-linha-conteudo">
        <strong>${n.titulo}</strong>
        ${n.mensagem ? `<p>${n.mensagem}</p>` : ''}
        <span class="notif-data">${new Date(n.criado_em).toLocaleString('pt-BR')}</span>
      </div>
      <div class="notif-linha-acoes">
        ${n.lida ? '' : '<button class="notif-marcar" title="Marcar como lida">✓</button>'}
        <button class="notif-excluir" title="Excluir">🗑️</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('.notif-marcar').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.notif-linha').dataset.id;
      await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
      carregarTodas(userId);
    });
  });
  lista.querySelectorAll('.notif-excluir').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.notif-linha').dataset.id;
      await supabase.from('notificacoes').delete().eq('id', id);
      carregarTodas(userId);
    });
  });
}

function iniciarMenuAvatar() {
  const avatarBtn = document.getElementById('avatar-inicial');
  const dropdown = document.getElementById('user-dropdown');
  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== avatarBtn) {
      dropdown.classList.remove('open');
    }
  });
}

iniciarPagina();
iniciarMenuAvatar();
iniciarBusca();
iniciarNotificacoes();
