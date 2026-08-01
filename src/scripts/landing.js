const recursos = [
  { icone: '📚', titulo: 'Resumos por matéria', desc: 'Conteúdo direto ao ponto, organizado por disciplina e nível de dificuldade.' },
  { icone: '✅', titulo: 'Questões comentadas', desc: 'Resolva questões reais com explicação detalhada de cada alternativa.' },
  { icone: '⏱️', titulo: 'Simulados cronometrados', desc: 'Correção automática e estatísticas de desempenho após cada simulado.' },
  { icone: '🧠', titulo: 'Flashcards inteligentes', desc: 'Sistema de repetição espaçada para fixar o conteúdo de verdade.' },
  { icone: '📅', titulo: 'Cronograma adaptativo', desc: 'Planeje seus estudos com metas diárias e acompanhamento automático.' },
  { icone: '🏆', titulo: 'XP, níveis e ranking', desc: 'Ganhe pontos, suba de nível e compare seu progresso com outros alunos.' },
];

const grid = document.getElementById('features-grid');
if (grid) {
  grid.innerHTML = recursos.map(r => `
    <div class="card fade-up">
      <div class="feature-icon">${r.icone}</div>
      <h3>${r.titulo}</h3>
      <p>${r.desc}</p>
    </div>
  `).join('');
}
