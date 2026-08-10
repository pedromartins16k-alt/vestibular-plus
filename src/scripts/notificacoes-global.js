import { supabase } from '../lib/supabaseClient.js';

// Notificações (sininho no topo com dropdown + badge de não lidas)
// Chame iniciarNotificacoes() em qualquer página que tenha #notif-btn, #notif-badge e #notif-dropdown no HTML.
export async function iniciarNotificacoes() {
  const btn = document.getElementById('notif-btn');
  const badge = document.getElementById('notif-badge');
  const dropdown = document.getElementById('notif-dropdown');
  if (!btn || !dropdown) return; // página sem sininho: não faz nada

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const userId = session.user.id;

  await atualizarBadge(userId, badge);
  await carregarLista(userId, dropdown, badge);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  // Atualização em tempo real (opcional — depende do Realtime estar habilitado
  // pra tabela public.notificacoes: painel do Supabase > Database > Replication).
  // Se não estiver habilitado, essa parte simplesmente não faz nada, sem quebrar o resto.
  supabase
    .channel('notificacoes-' + userId)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${userId}` },
      () => {
        atualizarBadge(userId, badge);
        carregarLista(userId, dropdown, badge);
      }
    )
    .subscribe();
}

async function atualizarBadge(userId, badge) {
  if (!badge) return;
  const { count } = await supabase
    .from('notificacoes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lida', false);
  if (count && count > 0) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

async function carregarLista(userId, dropdown, badge) {
  const { data } = await supabase
    .from('notificacoes')
    .select('id, titulo, mensagem, lida, criado_em')
    .eq('user_id', userId)
    .order('criado_em', { ascending: false })
    .limit(6);

  if (!data || !data.length) {
    dropdown.innerHTML = '<div class="notif-vazio">Nenhuma notificação por enquanto.</div>';
    return;
  }

  dropdown.innerHTML = `
    ${data.map(n => `
      <div class="notif-item ${n.lida ? '' : 'nao-lida'}" data-id="${n.id}">
        <strong>${n.titulo}</strong>
        ${n.mensagem ? `<p>${n.mensagem}</p>` : ''}
        <span class="notif-data">${formatarData(n.criado_em)}</span>
      </div>
    `).join('')}
    <a class="notif-ver-todas" href="./notificacoes.html">Ver todas</a>
  `;

  dropdown.querySelectorAll('.notif-item.nao-lida').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
      item.classList.remove('nao-lida');
      atualizarBadge(userId, badge);
    });
  });
}

function formatarData(dataStr) {
  const data = new Date(dataStr);
  const diffMin = Math.floor((new Date() - data) / 60000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;
  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 7) return `há ${diffDias}d`;
  return data.toLocaleDateString('pt-BR');
}
