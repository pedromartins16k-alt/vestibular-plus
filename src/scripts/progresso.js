import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const resumoEl = document.getElementById('progresso-resumo');
const listaEl = document.getElementById('progresso-lista');

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  const userId = session.user.id;

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  if (!materias || !materias.length) {
    resumoEl.innerHTML = '';
    listaEl.innerHTML = `<p class="empty-state">Nenhuma matéria cadastrada ainda.</p>`;
    return;
  }

  const { data: sessoes } = await supabase
    .from('sessoes_estudo')
    .select('materia_id, duracao_minutos, tipo')
    .eq('user_id', userId);

  const totalMinutos = (sessoes || []).reduce((soma, s) => soma + (s.duracao_minutos || 0), 0);

  resumoEl.innerHTML = `
    <div class="card resumo-card"><strong>${Math.round(totalMinutos / 60)}h</strong><span>Total estudado</span></div>
    <div class="card resumo-card"><strong>${(sessoes || []).length}</strong><span>Sessões registradas</span></div>
    <div class="card resumo-card"><strong>${materias.length}</strong><span>Matérias</span></div>
  `;

  // Agrupa minutos e contagem por tipo de sessão, por matéria
  const porMateria = {};
  (sessoes || []).forEach(s => {
    if (!s.materia_id) return;
    if (!porMateria[s.materia_id]) {
      porMateria[s.materia_id] = { minutos: 0, resumo: 0, questoes: 0, flashcards: 0, simulado: 0 };
    }
    porMateria[s.materia_id].minutos += s.duracao_minutos || 0;
    if (porMateria[s.materia_id][s.tipo] !== undefined) porMateria[s.materia_id][s.tipo]++;
  });

  listaEl.innerHTML = materias.map(m => {
    const dados = porMateria[m.id] || { minutos: 0, resumo: 0, questoes: 0, flashcards: 0, simulado: 0 };
    const percentual = totalMinutos > 0 ? Math.round((dados.minutos / totalMinutos) * 100) : 0;
    const horas = (dados.minutos / 60).toFixed(1).replace(/\.0$/, '');
    return `
      <div class="card progresso-item">
        <div class="progresso-topo">
          <div class="progresso-nome"><span class="materia-dot" style="background:${m.cor}"></span>${m.nome}</div>
          <div class="progresso-percentual">${percentual}%</div>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${percentual}%; background:${m.cor}"></div></div>
        <div class="progresso-meta">
          <span>${horas}h estudadas</span>
          <span>${dados.resumo} resumo${dados.resumo === 1 ? '' : 's'}</span>
          <span>${dados.questoes} questõe${dados.questoes === 1 ? '' : 's'}</span>
          <span>${dados.flashcards} flashcard${dados.flashcards === 1 ? '' : 's'}</span>
          <span>${dados.simulado} simulado${dados.simulado === 1 ? '' : 's'}</span>
        </div>
      </div>
    `;
  }).join('');
}

iniciar();
