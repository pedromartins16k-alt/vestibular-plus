// Regras de gamificação: XP necessário cresce a cada nível.
export function xpParaProximoNivel(nivel) {
  return 100 * nivel + (nivel - 1) * 50;
}

export function calcularProgressoNivel(xpAtual, nivel) {
  const necessario = xpParaProximoNivel(nivel);
  const percentual = Math.min(100, Math.round((xpAtual / necessario) * 100));
  return { necessario, percentual };
}

export const PONTOS_XP = {
  resumo_lido: 5,
  questao_correta: 10,
  questao_errada: 2,
  flashcard_revisado: 3,
  simulado_finalizado: 30,
  meta_diaria_batida: 15,
};
