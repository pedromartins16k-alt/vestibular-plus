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
    .select('duracao_minutos, tipo, materia_id, criado_em')
    .eq('user_id', userId);
  let totalMinutos = 0;
  if (sessoes) {
    totalMinutos = sessoes.reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);
    document.getElementById('stat-horas').textContent = `${Math.round(totalMinutos / 60)}h`;
    document.getElementById('stat-questoes').textContent =
      sessoes.filter(s => s.tipo === 'questoes').length;
    document.getElementById('stat-simulados').textContent =
      sessoes.filter(s => s.tipo === 'simulado').length;
    document.getElementById('stat-sequencia').textContent =
      calcularSequencia(sessoes.map(s => s.criado_em));
  }
  // ---- Matérias + progresso (% do tempo total de estudo dedicado a cada matéria) ----
  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');
  if (materias && materias.length) {
    const minutosPorMateria = {};
    (sessoes || []).forEach(s => {
      if (!s.materia_id) return;
      minutosPorMateria[s.materia_id] = (minutosPorMateria[s.materia_id] || 0) + (s.duracao_minutos || 0);
    });
    document.getElementById('materia-list').innerHTML = materias.map(m => {
      const minutos = minutosPorMateria[m.id] || 0;
      const percentual = totalMinutos > 0 ? Math.round((minutos / totalMinutos) * 100) : 0;
      return `
      <div class="materia-item">
        <span class="materia-dot" style="background:${m.cor}"></span>
        <span style="flex:0 0 90px;">${m.nome}</span>
        <div class="prog-track"><div class="prog-fill" style="width:${percentual}%; background:${m.cor}"></div></div>
      </div>
    `;
    }).join('');
  }
  // ---- Ranking (top 5 por XP) ----
  const { data: ranking } = await supabase
    .from('profiles')
    .select('id, nome, nome_usuario, xp')
    .order('xp', { ascending: false })
    .limit(5);
  if (ranking && ranking.length) {
    document.getElementById('ranking-list').innerHTML = ranking.map((p, i) => {
      const nome = p.nome_usuario || p.nome || 'Aluno(a)';
      return `
      <div class="ranking-item">
        <span class="ranking-pos">${i + 1}º</span>
        <span class="ranking-avatar-mini">${nome[0]?.toUpperCase() || 'A'}</span>
        <span style="flex:1;">${nome}${p.id === userId ? ' (você)' : ''}</span>
        <span style="font-weight:700;">${p.xp || 0} XP</span>
      </div>
    `;
    }).join('');
  }
  document.getElementById('logout-btn').addEventListener('click', sair);
}

// Conta os dias seguidos (até hoje ou ontem) em que o usuário teve pelo menos 1 sessão de estudo
function calcularSequencia(datasCriadoEm) {
  const dias = new Set(datasCriadoEm.map(d => new Date(d).toISOString().slice(0, 10)));
  const cursor = new Date();
  const hojeStr = cursor.toISOString().slice(0, 10);
  // se ainda não estudou hoje, a sequência de ontem pra trás ainda conta
  if (!dias.has(hojeStr)) cursor.setDate(cursor.getDate() - 1);
  let sequencia = 0;
  while (dias.has(cursor.toISOString().slice(0, 10))) {
    sequencia++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return sequencia;
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

// ---- Busca global (dropdown com resumos, questões, flashcards, vestibulares e assuntos do Treineiro) ----
function iniciarBusca() {
  const input = document.getElementById('busca-input');
  const dropdown = document.getElementById('busca-dropdown');
  let timeoutId = null;

  input.addEventListener('input', () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    if (termo.length < 2) {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      return;
    }
    timeoutId = setTimeout(() => buscarTudo(termo, dropdown), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== input) {
      dropdown.classList.remove('open');
    }
  });
}

async function buscarTudo(termo, dropdown) {
  const filtro = `%${termo}%`;

  const [resumos, questoes, flashcards, vestibulares, assuntos] = await Promise.all([
    supabase.from('resumos').select('id, titulo').ilike('titulo', filtro).limit(4),
    supabase.from('questoes').select('id, enunciado').ilike('enunciado', filtro).limit(4),
    supabase.from('flashcards').select('id, frente').ilike('frente', filtro).limit(4),
    supabase.from('vestibulares').select('id, nome, instituicao').or(`nome.ilike.${filtro},instituicao.ilike.${filtro}`).limit(4),
    supabase.from('treineiro_aulas').select('id, titulo').ilike('titulo', filtro).limit(4),
  ]);

  const grupos = [
    { titulo: '📚 Resumos', dados: resumos.data, texto: r => r.titulo, href: './resumos.html' },
    { titulo: '✅ Questões', dados: questoes.data, texto: q => q.enunciado.slice(0, 70) + (q.enunciado.length > 70 ? '…' : ''), href: './questoes.html' },
    { titulo: '🧠 Flashcards', dados: flashcards.data, texto: f => f.frente, href: './flashcards.html' },
    { titulo: '🎓 Vestibulares', dados: vestibulares.data, texto: v => `${v.nome} — ${v.instituicao}`, href: './vestibulares.html' },
    { titulo: '📖 Assuntos do Treineiro', dados: assuntos.data, texto: a => a.titulo, href: './vestibulares.html' },
  ];

  const temResultado = grupos.some(g => g.dados && g.dados.length);

  if (!temResultado) {
    dropdown.innerHTML = '<div class="busca-vazio">Nenhum resultado encontrado.</div>';
    dropdown.classList.add('open');
    return;
  }

  dropdown.innerHTML = grupos
    .filter(g => g.dados && g.dados.length)
    .map(g => `
      <div class="busca-grupo-titulo">${g.titulo}</div>
      ${g.dados.map(item => `<a class="busca-item" href="${g.href}">${item[Object.keys(item)[0] === 'id' ? (g.texto === undefined ? 'id' : '') : 'id'] !== undefined ? g.texto(item) : ''}</a>`).join('')}
    `).join('');
  dropdown.classList.add('open');
}

iniciarDashboard();
iniciarMenuAvatar();
iniciarBusca();
