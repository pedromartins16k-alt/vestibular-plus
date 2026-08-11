import { supabase } from '../lib/supabaseClient.js';
import { exigirAdmin } from '../lib/adminGuard.js';
import { sair } from '../lib/authGuard.js';

let MATERIAS = [];
let AULAS = [];

async function iniciar() {
  const session = await exigirAdmin();
  if (!session) return;

  const { data: profile } = await supabase.from('profiles').select('nome, nome_usuario').eq('id', session.user.id).single();
  const nome = profile?.nome_usuario || profile?.nome?.split(' ')[0] || 'Admin';
  document.getElementById('avatar-inicial').textContent = nome[0]?.toUpperCase() || 'A';

  document.getElementById('logout-btn').addEventListener('click', sair);
  iniciarMenuAvatar();
  iniciarTabs();
  iniciarSubTabs();

  const { data: materias } = await supabase.from('materias').select('id, nome, cor').order('ordem');
  MATERIAS = materias || [];
  const { data: aulas } = await supabase.from('treineiro_aulas').select('id, titulo, materia_id').order('titulo');
  AULAS = aulas || [];
  preencherSelectsMaterias();

  carregarVisaoGeral();
  carregarUsuarios();
  carregarVestibulares();
  carregarConteudo();

  iniciarFormVestibular();
  iniciarLigacaoConteudo();
  iniciarFormResumo();
  iniciarFormQuestao();
  iniciarFormFlashcard();
  iniciarFormAula();
}

function preencherSelectsMaterias() {
  const opcoes = MATERIAS.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
  document.querySelectorAll('select[name="materia_id"]').forEach(sel => { sel.innerHTML = opcoes; });
}

function nomeMateria(id) {
  return MATERIAS.find(m => m.id === id)?.nome || '—';
}

function iniciarMenuAvatar() {
  const avatarBtn = document.getElementById('avatar-inicial');
  const dropdown = document.getElementById('user-dropdown');
  avatarBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('open'); });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== avatarBtn) dropdown.classList.remove('open');
  });
}

function iniciarTabs() {
  document.querySelectorAll('.admin-tab-btn, .sidebar .nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.sidebar .nav-item[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
    });
  });
}

function iniciarSubTabs() {
  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.sub;
      document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
      document.querySelectorAll('.sub-panel').forEach(p => p.classList.toggle('active', p.id === `sub-${sub}`));
    });
  });
}

// ===== Visão geral =====
async function carregarVisaoGeral() {
  const contagens = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('resumos').select('*', { count: 'exact', head: true }),
    supabase.from('questoes').select('*', { count: 'exact', head: true }),
    supabase.from('flashcards').select('*', { count: 'exact', head: true }),
    supabase.from('simulados').select('*', { count: 'exact', head: true }),
    supabase.from('vestibulares').select('*', { count: 'exact', head: true }),
    supabase.from('treineiro_aulas').select('*', { count: 'exact', head: true }),
    supabase.from('sessoes_estudo').select('*', { count: 'exact', head: true }),
  ]);
  const [usuarios, resumos, questoes, flashcards, simulados, vestibulares, aulas, sessoes] = contagens.map(r => r.count ?? 0);
  document.getElementById('stat-usuarios').textContent = usuarios;
  document.getElementById('stat-resumos').textContent = resumos;
  document.getElementById('stat-questoes').textContent = questoes;
  document.getElementById('stat-flashcards').textContent = flashcards;
  document.getElementById('stat-simulados').textContent = simulados;
  document.getElementById('stat-vestibulares').textContent = vestibulares;
  document.getElementById('stat-aulas').textContent = aulas;
  document.getElementById('stat-sessoes').textContent = sessoes;
}

// ===== Usuários =====
async function carregarUsuarios() {
  const { data } = await supabase.from('profiles').select('nome, nome_usuario, nivel, xp, criado_em').order('criado_em', { ascending: false });
  const tbody = document.getElementById('tbody-usuarios');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum usuário.</td></tr>'; return; }
  tbody.innerHTML = data.map(u => `
    <tr>
      <td>${escapeHtml(u.nome || '—')}</td>
      <td>${escapeHtml(u.nome_usuario || '—')}</td>
      <td>${u.nivel ?? '—'}</td>
      <td>${u.xp ?? 0}</td>
      <td>${new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
    </tr>
  `).join('');
}

// ===== Vestibulares =====
async function carregarVestibulares() {
  const { data: vestibulares } = await supabase.from('vestibulares').select('*').order('criado_em', { ascending: false });
  const { data: vinculos } = await supabase.from('vestibular_conteudo').select('vestibular_id, tipo');

  const contagemPorVestibular = {};
  (vinculos || []).forEach(v => {
    contagemPorVestibular[v.vestibular_id] = (contagemPorVestibular[v.vestibular_id] || 0) + 1;
  });

  const selectLink = document.getElementById('select-vestibular-link');
  selectLink.innerHTML = (vestibulares || []).map(v => `<option value="${v.id}">${escapeHtml(v.nome)}</option>`).join('');

  const lista = document.getElementById('lista-vestibulares');
  if (!vestibulares || !vestibulares.length) { lista.innerHTML = '<div class="empty-state">Nenhum vestibular cadastrado ainda.</div>'; return; }
  lista.innerHTML = vestibulares.map(v => `
    <div class="card vest-card">
      <h4>${escapeHtml(v.nome)} — ${escapeHtml(v.instituicao || '')}</h4>
      <div class="vest-meta">
        ${escapeHtml(v.cidade || '')}${v.estado ? '/' + escapeHtml(v.estado) : ''} ·
        ${escapeHtml(v.tipo_prova || 'sem tipo definido')} ·
        prova em ${v.data_prova ? new Date(v.data_prova).toLocaleDateString('pt-BR') : '—'} ·
        ${contagemPorVestibular[v.id] || 0} conteúdo(s) ligado(s)
      </div>
      <div class="vest-card-actions">
        <button class="btn-del" data-del-vestibular="${v.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('[data-del-vestibular]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este vestibular? Os vínculos de conteúdo também serão removidos.')) return;
      await supabase.from('vestibular_conteudo').delete().eq('vestibular_id', btn.dataset.delVestibular);
      await supabase.from('vestibulares').delete().eq('id', btn.dataset.delVestibular);
      carregarVestibulares();
      carregarVisaoGeral();
    });
  });
}

function iniciarFormVestibular() {
  document.getElementById('form-vestibular').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const payload = {
      nome: fd.get('nome'),
      instituicao: fd.get('instituicao'),
      cidade: fd.get('cidade') || null,
      estado: fd.get('estado') || 'SP',
      regiao: fd.get('regiao') || null,
      tipo_prova: fd.get('tipo_prova') || null,
      inscricao_inicio: fd.get('inscricao_inicio') || null,
      inscricao_fim: fd.get('inscricao_fim') || null,
      data_prova: fd.get('data_prova') || null,
      aceita_treineiro: fd.get('aceita_treineiro') === 'true',
      link_edital: fd.get('link_edital') || null,
      link_oficial: fd.get('link_oficial') || null,
      descricao: fd.get('descricao') || null,
    };
    const { error } = await supabase.from('vestibulares').insert(payload);
    const msg = document.getElementById('msg-vestibular');
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.className = 'msg-err'; return; }
    msg.textContent = 'Vestibular adicionado!'; msg.className = 'msg-ok';
    form.reset();
    carregarVestibulares();
    carregarVisaoGeral();
  });
}

function iniciarLigacaoConteudo() {
  document.getElementById('busca-resumo-link').addEventListener('input', async (e) => {
    const termo = e.target.value.trim();
    const resultados = document.getElementById('resultados-resumo-link');
    if (termo.length < 2) { resultados.innerHTML = ''; return; }
    const { data } = await supabase.from('resumos').select('id, titulo').ilike('titulo', `%${termo}%`).limit(15);
    resultados.innerHTML = (data || []).map(r => `
      <div class="link-search-item">
        <span>${escapeHtml(r.titulo)}</span>
        <button class="btn-add-link" data-link-tipo="resumo" data-link-id="${r.id}">+ ligar</button>
      </div>
    `).join('') || '<div class="empty-state">Nada encontrado.</div>';
    resultados.querySelectorAll('[data-link-id]').forEach(btn => btn.addEventListener('click', () => ligarConteudo(btn.dataset.linkTipo, btn.dataset.linkId)));
  });

  document.getElementById('busca-questao-link').addEventListener('input', async (e) => {
    const termo = e.target.value.trim();
    const resultados = document.getElementById('resultados-questao-link');
    if (termo.length < 2) { resultados.innerHTML = ''; return; }
    const { data } = await supabase.from('questoes').select('id, enunciado').ilike('enunciado', `%${termo}%`).limit(15);
    resultados.innerHTML = (data || []).map(q => `
      <div class="link-search-item">
        <span>${escapeHtml(q.enunciado.slice(0, 70))}...</span>
        <button class="btn-add-link" data-link-tipo="questao" data-link-id="${q.id}">+ ligar</button>
      </div>
    `).join('') || '<div class="empty-state">Nada encontrado.</div>';
    resultados.querySelectorAll('[data-link-id]').forEach(btn => btn.addEventListener('click', () => ligarConteudo(btn.dataset.linkTipo, btn.dataset.linkId)));
  });
}

async function ligarConteudo(tipo, referenciaId) {
  const vestibularId = document.getElementById('select-vestibular-link').value;
  if (!vestibularId) { alert('Cadastre um vestibular primeiro.'); return; }
  const { error } = await supabase.from('vestibular_conteudo').insert({ vestibular_id: vestibularId, tipo, referencia_id: referenciaId });
  if (error) { alert('Erro ao ligar: ' + error.message); return; }
  carregarVestibulares();
}

// ===== Conteúdo (resumos, questões, flashcards, aulas) =====
async function carregarConteudo() {
  carregarResumos();
  carregarQuestoes();
  carregarFlashcards();
  carregarAulas();
}

async function carregarResumos() {
  const { data } = await supabase.from('resumos').select('id, titulo, materia_id, nivel_dificuldade').order('criado_em', { ascending: false }).limit(100);
  const tbody = document.getElementById('tbody-resumos');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum resumo.</td></tr>'; return; }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td class="truncate">${escapeHtml(r.titulo)}</td>
      <td>${escapeHtml(nomeMateria(r.materia_id))}</td>
      <td>${r.nivel_dificuldade || '—'}</td>
      <td><button class="btn-del" data-del-resumo="${r.id}">Excluir</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-del-resumo]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Excluir este resumo?')) return;
    await supabase.from('resumos').delete().eq('id', btn.dataset.delResumo);
    carregarResumos(); carregarVisaoGeral();
  }));
}

function iniciarFormResumo() {
  document.getElementById('form-resumo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const { error } = await supabase.from('resumos').insert({
      materia_id: fd.get('materia_id'),
      titulo: fd.get('titulo'),
      conteudo: fd.get('conteudo'),
      fonte: fd.get('fonte') || null,
      nivel_dificuldade: fd.get('nivel_dificuldade'),
    });
    const msg = document.getElementById('msg-resumo');
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.className = 'msg-err'; return; }
    msg.textContent = 'Resumo adicionado!'; msg.className = 'msg-ok';
    form.reset();
    carregarResumos(); carregarVisaoGeral();
  });
}

async function carregarQuestoes() {
  const { data } = await supabase.from('questoes').select('id, enunciado, materia_id, dificuldade').order('id', { ascending: false }).limit(100);
  const tbody = document.getElementById('tbody-questoes');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma questão.</td></tr>'; return; }
  tbody.innerHTML = data.map(q => `
    <tr>
      <td class="truncate">${escapeHtml(q.enunciado)}</td>
      <td>${escapeHtml(nomeMateria(q.materia_id))}</td>
      <td>${q.dificuldade || '—'}</td>
      <td><button class="btn-del" data-del-questao="${q.id}">Excluir</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-del-questao]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Excluir esta questão?')) return;
    await supabase.from('questoes').delete().eq('id', btn.dataset.delQuestao);
    carregarQuestoes(); carregarVisaoGeral();
  }));
}

function preencherSelectAulasPorMateria(materiaId, selectEl) {
  const opcoesFiltradas = AULAS.filter(a => a.materia_id === materiaId);
  selectEl.innerHTML = '<option value="">— nenhuma —</option>' + opcoesFiltradas.map(a => `<option value="${a.id}">${escapeHtml(a.titulo)}</option>`).join('');
}

function iniciarFormQuestao() {
  const form = document.getElementById('form-questao');
  const selectMateria = form.querySelector('select[name="materia_id"]');
  const selectAula = form.querySelector('select[name="aula_id"]');
  selectMateria.addEventListener('change', () => preencherSelectAulasPorMateria(selectMateria.value, selectAula));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const alternativas = [
      { letra: 'A', texto: fd.get('alt_a') },
      { letra: 'B', texto: fd.get('alt_b') },
      { letra: 'C', texto: fd.get('alt_c') },
      { letra: 'D', texto: fd.get('alt_d') },
    ];
    const { error } = await supabase.from('questoes').insert({
      materia_id: fd.get('materia_id'),
      aula_id: fd.get('aula_id') || null,
      enunciado: fd.get('enunciado'),
      alternativas,
      resposta_correta: fd.get('resposta_correta'),
      comentario: fd.get('comentario') || null,
      fonte: fd.get('fonte') || null,
      ano: fd.get('ano') ? Number(fd.get('ano')) : null,
      dificuldade: fd.get('dificuldade'),
    });
    const msg = document.getElementById('msg-questao');
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.className = 'msg-err'; return; }
    msg.textContent = 'Questão adicionada!'; msg.className = 'msg-ok';
    form.reset();
    carregarQuestoes(); carregarVisaoGeral();
  });
}

async function carregarFlashcards() {
  const { data } = await supabase.from('flashcards').select('id, frente, materia_id').limit(100);
  const tbody = document.getElementById('tbody-flashcards');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhum flashcard.</td></tr>'; return; }
  tbody.innerHTML = data.map(f => `
    <tr>
      <td class="truncate">${escapeHtml(f.frente)}</td>
      <td>${escapeHtml(nomeMateria(f.materia_id))}</td>
      <td><button class="btn-del" data-del-flashcard="${f.id}">Excluir</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-del-flashcard]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Excluir este flashcard?')) return;
    await supabase.from('flashcards').delete().eq('id', btn.dataset.delFlashcard);
    carregarFlashcards(); carregarVisaoGeral();
  }));
}

function iniciarFormFlashcard() {
  document.getElementById('form-flashcard').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const { error } = await supabase.from('flashcards').insert({
      materia_id: fd.get('materia_id'),
      frente: fd.get('frente'),
      verso: fd.get('verso'),
    });
    const msg = document.getElementById('msg-flashcard');
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.className = 'msg-err'; return; }
    msg.textContent = 'Flashcard adicionado!'; msg.className = 'msg-ok';
    form.reset();
    carregarFlashcards(); carregarVisaoGeral();
  });
}

async function carregarAulas() {
  const { data } = await supabase.from('treineiro_aulas').select('id, titulo, materia_id').order('ordem');
  const tbody = document.getElementById('tbody-aulas');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhuma aula.</td></tr>'; return; }
  tbody.innerHTML = data.map(a => `
    <tr>
      <td class="truncate">${escapeHtml(a.titulo)}</td>
      <td>${escapeHtml(nomeMateria(a.materia_id))}</td>
      <td><button class="btn-del" data-del-aula="${a.id}">Excluir</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-del-aula]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Excluir esta aula?')) return;
    await supabase.from('treineiro_aulas').delete().eq('id', btn.dataset.delAula);
    carregarAulas(); carregarVisaoGeral();
    const { data: aulas } = await supabase.from('treineiro_aulas').select('id, titulo, materia_id').order('titulo');
    AULAS = aulas || [];
  }));
}

function iniciarFormAula() {
  document.getElementById('form-aula').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const { error } = await supabase.from('treineiro_aulas').insert({
      materia_id: fd.get('materia_id'),
      titulo: fd.get('titulo'),
      explicacao: fd.get('explicacao'),
      youtube_busca: fd.get('youtube_busca') || null,
      ordem: fd.get('ordem') ? Number(fd.get('ordem')) : 0,
    });
    const msg = document.getElementById('msg-aula');
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.className = 'msg-err'; return; }
    msg.textContent = 'Aula adicionada!'; msg.className = 'msg-ok';
    form.reset();
    carregarAulas(); carregarVisaoGeral();
    const { data: aulas } = await supabase.from('treineiro_aulas').select('id, titulo, materia_id').order('titulo');
    AULAS = aulas || [];
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

iniciar();
