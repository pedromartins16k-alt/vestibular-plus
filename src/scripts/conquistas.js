import { supabase } from '../lib/supabaseClient.js';
import { xpParaProximoNivel } from '../utils/xp.js';

// Converte um timestamp para "YYYY-MM-DD" no fuso de São Paulo (pra agrupar por dia certo).
function diaSP(dataIso) {
  return new Date(dataIso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Retorna a hora (0-23) de um timestamp no fuso de São Paulo.
function horaSP(dataIso) {
  const str = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
  }).format(new Date(dataIso));
  return parseInt(str, 10);
}

function maiorSequenciaDeDias(datasCriadoEm) {
  const dias = [...new Set(datasCriadoEm.map(diaSP))].sort();
  let maior = 0;
  let atual = 0;
  let anterior = null;

  for (const dia of dias) {
    if (anterior) {
      const diffDias = (new Date(dia) - new Date(anterior)) / 86400000;
      atual = diffDias === 1 ? atual + 1 : 1;
    } else {
      atual = 1;
    }
    maior = Math.max(maior, atual);
    anterior = dia;
  }
  return maior;
}

function diasComMetaBatida(sessoes, metaDiaria) {
  const minutosPorDia = {};
  sessoes.forEach(s => {
    const dia = diaSP(s.criado_em);
    minutosPorDia[dia] = (minutosPorDia[dia] || 0) + (s.duracao_minutos || 0);
  });
  return Object.values(minutosPorDia).filter(min => min >= metaDiaria).length;
}

async function concederXpConquista(userId, xpGanho) {
  if (!xpGanho) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('xp, nivel')
    .eq('id', userId)
    .single();
  if (!profile) return;

  let novoXp = profile.xp + xpGanho;
  let novoNivel = profile.nivel;
  while (novoXp >= xpParaProximoNivel(novoNivel)) {
    novoXp -= xpParaProximoNivel(novoNivel);
    novoNivel++;
  }

  await supabase.from('profiles').update({ xp: novoXp, nivel: novoNivel }).eq('id', userId);
}

/**
 * Verifica todas as conquistas de um usuário e desbloqueia as que ele já cumpriu.
 * Chamar depois de qualquer ação que gere progresso (responder questão, revisar
 * flashcard, terminar simulado, ler resumo) e também ao abrir o dashboard.
 * Retorna a lista de conquistas recém-desbloqueadas nesta chamada (pode ser vazia).
 */
export async function verificarConquistas(userId) {
  if (!userId) return [];

  const [
    { data: conquistas },
    { data: jaConquistadas },
    { data: sessoes },
    { data: simulados },
    { data: profile },
  ] = await Promise.all([
    supabase.from('conquistas').select('id, nome, xp_recompensa'),
    supabase.from('usuario_conquistas').select('conquista_id').eq('user_id', userId),
    supabase.from('sessoes_estudo').select('criado_em, tipo, acertou, duracao_minutos').eq('user_id', userId),
    supabase.from('simulado_respostas').select('nota').eq('user_id', userId),
    supabase.from('profiles').select('meta_diaria_minutos').eq('id', userId).single(),
  ]);

  if (!conquistas || !conquistas.length) return [];

  const idsConquistados = new Set((jaConquistadas || []).map(c => c.conquista_id));
  const listaSessoes = sessoes || [];
  const listaSimulados = simulados || [];
  const metaDiaria = profile?.meta_diaria_minutos || 60;

  const criterios = {
    'Primeiro Passo': () => listaSessoes.length >= 1,
    'Madrugador': () => listaSessoes.some(s => horaSP(s.criado_em) < 7),
    'Coruja': () => listaSessoes.some(s => horaSP(s.criado_em) >= 23),
    'Mestre das Questões': () =>
      listaSessoes.filter(s => s.tipo === 'questoes' && s.acertou === true).length >= 100,
    'Rei dos Flashcards': () => listaSessoes.filter(s => s.tipo === 'flashcards').length >= 200,
    'Simulado Perfeito': () => listaSimulados.some(s => s.nota === 100),
    'Maratonista': () => maiorSequenciaDeDias(listaSessoes.map(s => s.criado_em)) >= 7,
    'Constante': () => diasComMetaBatida(listaSessoes, metaDiaria) >= 30,
  };

  const desbloqueadasAgora = [];

  for (const c of conquistas) {
    if (idsConquistados.has(c.id)) continue;
    const check = criterios[c.nome];
    if (check && check()) desbloqueadasAgora.push(c);
  }

  for (const c of desbloqueadasAgora) {
    await supabase.from('usuario_conquistas').insert({ user_id: userId, conquista_id: c.id });
    await supabase.from('notificacoes').insert({
      user_id: userId,
      titulo: '🏅 Nova conquista desbloqueada!',
      mensagem: `Você desbloqueou "${c.nome}" e ganhou ${c.xp_recompensa} XP.`,
    });
    await concederXpConquista(userId, c.xp_recompensa);
  }

  return desbloqueadasAgora;
}
