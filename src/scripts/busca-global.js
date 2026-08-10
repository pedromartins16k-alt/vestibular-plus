import { supabase } from '../lib/supabaseClient.js';

// Busca global (dropdown com resumos, questões, flashcards, vestibulares e assuntos do Treineiro)
// Chame iniciarBusca() em qualquer página que tenha #busca-input e #busca-dropdown no HTML.
export function iniciarBusca() {
  const input = document.getElementById('busca-input');
  const dropdown = document.getElementById('busca-dropdown');
  if (!input || !dropdown) return; // página sem barra de busca: não faz nada

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
      ${g.dados.map(item => `<a class="busca-item" href="${g.href}">${g.texto(item)}</a>`).join('')}
    `).join('');
  dropdown.classList.add('open');
}
