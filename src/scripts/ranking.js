import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const podioEl = document.getElementById('podio');
const listaEl = document.getElementById('ranking-lista');

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;

  const { data: perfis } = await supabase
    .from('profiles')
    .select('id, nome, nivel, xp')
    .order('xp', { ascending: false });

  if (!perfis || !perfis.length) {
    listaEl.innerHTML = `<p class="empty-state">O ranking aparece assim que os alunos começarem a estudar 🚀</p>`;
    return;
  }

  renderPodio(perfis.slice(0, 3));
  renderLista(perfis, userId);
}

function iniciais(nome) {
  return (nome || '?').trim().charAt(0).toUpperCase();
}

function renderPodio(top3) {
  const medalhas = ['🥇', '🥈', '🥉'];
  const classes = ['primeiro', 'segundo', 'terceiro'];

  podioEl.innerHTML = top3.map((p, i) => `
    <div class="card podio-item ${classes[i]}">
      <div class="podio-medalha">${medalhas[i]}</div>
      <div class="podio-avatar">${iniciais(p.nome)}</div>
      <div class="podio-nome">${p.nome || 'Aluno'}</div>
      <div class="podio-xp">${p.xp || 0} XP</div>
    </div>
  `).join('');
}

function renderLista(perfis, userId) {
  listaEl.innerHTML = perfis.map((p, i) => `
    <div class="card ranking-row ${p.id === userId ? 'voce' : ''}">
      <div class="ranking-pos">${i + 1}º</div>
      <div class="ranking-avatar">${iniciais(p.nome)}</div>
      <div class="ranking-info">
        <div class="ranking-nome">${p.nome || 'Aluno'}${p.id === userId ? ' (você)' : ''}</div>
        <div class="ranking-nivel">Nível ${p.nivel || 1}</div>
      </div>
      <div class="ranking-xp">${p.xp || 0} XP</div>
    </div>
  `).join('');
}

iniciar();
