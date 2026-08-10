import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao, sair } from '../lib/authGuard.js';
import { calcularProgressoNivel } from '../utils/xp.js';
async function iniciarDashboard() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;
  // ---- Perfil (nome, nível, XP) ----
  const { data: profile } = await supabase
    .from('profiles')
    .select('nome, nome_usuario, nivel, xp, meta_diaria_minutos')
    .eq('id', userId)
    .single();
  if (profile) {
    const nomeExibicao = profile.nome_usuario || profile.nome?.split(' ')[0] || 'Aluno(a)';
    document.getElementById('saudacao').textContent = `Olá, ${nomeExibicao}! 👋`;
    document.getElementById('avatar-inicial').textContent = nomeExibicao[0]?.toUpperCase() || 'A';
    const { necessario, percentual } = calcularProgressoNivel(profile.xp, profile.nivel);
    document.getElementById('nivel-info').textContent =
      `Nível ${profile.nivel} · ${profile.xp}/${necessario} XP para o próximo nível`;
    document.getElementById('xp-bar').style.width = `${percentual}%`;
  }
  // ---- Estatísticas (sessões de estudo) ----
  const { data: sessoes } = await supabase
    .from('sessoes_estudo')
    .select('duracao_minutos, tipo')
    .eq('user_id', userId);
  if (sessoes) {
    const totalMinutos = sessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);
    document.getElementById('stat-horas').textContent = `${Math.round(totalMinutos / 60)}h`;
    document.getElementById('stat-questoes').textContent =
      sessoes.filter(s => s.tipo === 'questoes').length;
    document.getElementById('stat-simulados').textContent =
      sessoes.filter(s => s.tipo === 'simulado').length;
  }
  // ---- Matérias + progresso (placeholder até haver dados reais de progresso) ----
  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');
  if (materias && materias.length) {
    document.getElementById('materia-list').innerHTML = materias.map(m => `
      <div class="materia-item">
        <span class="materia-dot" style="background:${m.cor}"></span>
        <span style="flex:0 0 90px;">${m.nome}</span>
        <div class="prog-track"><div class="prog-fill" style="width:0%; background:${m.cor}"></div></div>
      </div>
    `).join('');
  }
  document.getElementById('logout-btn').addEventListener('click', sair);
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

iniciarDashboard();
iniciarMenuAvatar();
