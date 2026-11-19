/**
 * test/test-consistencia-corretor.js
 *
 * Testes determinísticos focados nas três inconsistências de coerência do
 * corretor de redação por IA, corrigidas em api/_ai-service.js.
 *
 * CASO SINTÉTICO DE REFERÊNCIA (NÃO USAR COMO NOTA HUMANA VALIDADA):
 * O tema "Desafios para a valorização da herança africana no Brasil" foi
 * mencionado no contexto de investigação de inconsistências; os textos usados
 * aqui são curtos e sintéticos, criados apenas para testar o comportamento do
 * validador. A nota de 500 pts foi gerada pelo assistente para demonstração e
 * NÃO é uma avaliação humana validada. Não usar como referência de calibração.
 *
 * Cobertura:
 *   C1-A — ERRO sem trecho_original nem citação → rebaixado para PONTO_DE_ATENCAO
 *   C1-B — ERRO com trecho_original (casos separados para existente vs inexistente na redação)
 *   C1-C — ERRO formato legado (casos separados para existente vs inexistente na redação)
 *   C1-D — Sugestão de estilo sem trecho → permanece SUGESTAO
 *   C1-E — "História da África" com maiúscula marcado como ERRO → reclassificado para SUGESTAO de estilo
 *   C3-A — Justificativa nega tese mas descreve argumentos presentes → nota_suspeita
 *   C3-B — Justificativa coerente (tese presente, sem negação) → sem nota_suspeita
 *   C3-C — Justificativa coerente de ausência de tese → sem nota_suspeita
 *   C3-D — Justificativa afirma tese ausente por não haver argumentos identificáveis → sem nota_suspeita
 *   C3-E — Justificativa nega tese mas afirma positivamente dois argumentos bem desenvolvidos → nota_suspeita
 *   C3-F — Justificativa com "tese implícita" com argumentos desenvolvidos → sem nota_suspeita
 *   C3-G — Frase "a tese não está ausente" nega ausência → sem nota_suspeita
 *   C4-A — Conectivos usados uma vez ("Além disso", "Portanto") não são descritos como recorrentes
 *   C4-B — Conectivo genuinamente repetido (3x) → crítica de repetição preservada
 *   C4-C — Conectivo citado 2× no texto → crítica de repetição excessiva removida
 *   C4-D — Problema independente de repetição vocabular preservado junto com remoção de falsa recorrência de conectivo
 *   C4-E — Alegação genérica de "conectivos recorrentes" sem conectivo identificável → sem invenção de contagem
 *   C5-A — detalhamento: 'insuficiente' + nota 200 → ajustado para 160
 *   C5-B — detalhamento: 'ausente' + nota 200 → ajustado para 160
 *   C5-C — Elementos completos + sugestão de refinamento futuro → mantém nota 200
 *   C5-D — detalhamento: 'presente' + nota 200, sem recomendação → mantido 200
 *   C5-E — detalhamento: 'insuficiente' + nota 160 → não altera (já 160)
 *   C5-F — crítica substantiva de detalhamento insuficiente + nota 200 → ajustado para 160
 *   C5-G — frase negativa "não há falta de detalhamento" + nota 200 → mantém nota 200
 *   C5-H — crítica afirmativa de "falta de detalhamento" + nota 200 → ajustado para 160
 *   INTEGRACAO — Avaliação com C1/C3/C5 incoerentes ao mesmo tempo: todos corrigidos
 */

import assert from 'node:assert/strict';
import { validarENormalizarResposta, analisarExtensaoRedacao } from '../api/_ai-service.js';

let totalTestes = 0;
let testesAprovados = 0;
let testesFalhados = 0;

function pass(nome) {
  testesAprovados++;
  console.log(`  ✅ [PASS] ${nome}`);
}

function fail(nome, err) {
  testesFalhados++;
  console.error(`  ❌ [FAIL] ${nome}`);
  console.error(`     Detalhe: ${err?.message || err}`);
}

// ─── Configuração da matriz e texto sintético ────────────────────────────────

const matrizEnem = {
  nome: 'ENEM — Exame Nacional do Ensino Médio',
  pontuacao_maxima: 1000,
  competencias: [
    { numero: 1, nome: 'Domínio da norma culta', peso: 200 },
    { numero: 2, nome: 'Compreensão da proposta', peso: 200 },
    { numero: 3, nome: 'Projeto de texto e argumentação', peso: 200 },
    { numero: 4, nome: 'Mecanismos coesivos', peso: 200 },
    { numero: 5, nome: 'Proposta de intervenção', peso: 200 }
  ]
};

// Texto sintético curto — apenas para teste de validação do backend.
// NÃO é uma redação real de estudante. NÃO usar como referência humana.
const textoSintetico = `A valorização da herança africana no Brasil enfrenta desafios históricos.
Dois problemas centrais são o pouco espaço nas escolas e o preconceito contra tradições africanas.
Cabe ao Ministério da Educação, em parceria com secretarias estaduais, implementar formação
continuada de professores por meio de programas específicos, a fim de garantir a aplicação
da Lei 10.639/2003 e combater o preconceito cultural.`;

/**
 * Monta um payload JSON completo com 5 competências ENEM.
 * As competências não especificadas recebem valores padrão neutros (160 pts, sem problemas).
 */
function montarPayload(overrides = {}) {
  const compsPadrao = [
    { numero: 1, nome: 'Domínio da norma culta', nota: 160, justificativa: 'Domínio satisfatório da modalidade escrita formal.', problemas: [], analise: { criterios_atendidos: ['Ortografia correta', 'Pontuação adequada'], criterios_parciais: [], criterios_ausentes: [] }, pontos_positivos: [], evidencias_textuais: ['A valorização da herança africana no Brasil enfrenta desafios históricos'] },
    { numero: 2, nome: 'Compreensão da proposta', nota: 160, justificativa: 'Compreensão do tema com repertório pertinente.', problemas: [], analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [] }, pontos_positivos: [], evidencias_textuais: [] },
    { numero: 3, nome: 'Projeto de texto e argumentação', nota: 160, justificativa: 'Argumentação clara com tese identificada na introdução.', problemas: [], analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [] }, pontos_positivos: [], evidencias_textuais: [] },
    { numero: 4, nome: 'Mecanismos coesivos', nota: 160, justificativa: 'Uso adequado de conectivos interparágrafos.', problemas: [], analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [] }, pontos_positivos: [], evidencias_textuais: [] },
    { numero: 5, nome: 'Proposta de intervenção', nota: 160, justificativa: 'Proposta com cinco elementos identificados.', problemas: [], analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [], elementos_proposta: { agente: 'presente', acao: 'presente', meio: 'presente', finalidade: 'presente', detalhamento: 'presente', relacao_com_problema: 'forte' } }, pontos_positivos: [], evidencias_textuais: [] }
  ];

  const comps = compsPadrao.map(c => {
    const override = (overrides.competencias || []).find(o => o.numero === c.numero);
    return override ? { ...c, ...override } : c;
  });

  const notaTotal = comps.reduce((acc, c) => acc + c.nota, 0);

  return JSON.stringify({
    nota_total: notaTotal,
    nota_maxima: 1000,
    competencias: comps,
    pontos_fortes: [],
    pontos_melhoria: [],
    exemplos_trechos: [],
    sugestoes: [],
    prioridades_estudo: [],
    feedback_geral: 'Avaliação sintética de teste.',
    aviso_educacional: 'Avaliação de teste — não usar como referência humana.'
  });
}

console.log('🧪 Testes de Consistência do Corretor de Redação por IA...');
console.log('   (dados sintéticos — sem chamadas reais à IA, sem PII)\n');

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 1 — C1: Erros gramaticais exigem trecho textual real
// ─────────────────────────────────────────────────────────────────────────────

totalTestes++;
try {
  // C1-A: ERRO sem trecho_original e sem trecho na descrição → deve ser rebaixado para PONTO_DE_ATENCAO
  const payload = montarPayload({
    competencias: [{
      numero: 1,
      nota: 160,
      justificativa: 'Texto com bom domínio gramatical, com recomendação de estilo.',
      problemas: [{
        tipo: 'ERRO',
        descricao: 'Recomendação de usar artigos definidos com mais precisão',
        trecho_original: '',   // sem trecho
        sugestao_reescrita: ''
      }],
      analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c1 = res.competencias[0];
  const problema = c1.problemas[0];
  assert.equal(problema.tipo, 'PONTO_DE_ATENCAO',
    `ERRO sem trecho deve ser rebaixado para PONTO_DE_ATENCAO, obteve: ${problema.tipo}`);
  assert.ok(problema._aviso_sem_trecho === true,
    'Deve ter flag _aviso_sem_trecho = true');
  assert.notEqual(c1.tipo_apontamento, 'ERRO',
    'tipo_apontamento de C1 não deve ser ERRO quando todos os problemas foram rebaixados');
  pass('C1-A: ERRO sem trecho_original rebaixado para PONTO_DE_ATENCAO');
} catch (err) { fail('C1-A: ERRO sem trecho rebaixado', err); }

totalTestes++;
try {
  // C1-B1: ERRO com trecho_original existente na redação → mantido como ERRO (legítimo)
  const payload = montarPayload({
    competencias: [{
      numero: 1,
      nota: 120,
      justificativa: 'Desvio de concordância nominal identificado no texto.',
      problemas: [{
        tipo: 'ERRO',
        descricao: 'Concordância nominal incorreta',
        trecho_original: 'pouco espaço nas escolas',  // trecho existe no textoSintetico
        sugestao_reescrita: 'pouco espaço nas escolas (revisar concordância)'
      }],
      analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const problema = res.competencias[0].problemas[0];
  assert.equal(problema.tipo, 'ERRO',
    'ERRO com trecho_original existente deve ser mantido como ERRO');
  assert.ok(!problema._aviso_sem_trecho,
    'Não deve ter flag _aviso_sem_trecho quando há trecho real existente');
  pass('C1-B (existente): ERRO com trecho_original existente na redação mantido como ERRO');
} catch (err) { fail('C1-B (existente): ERRO com trecho existente mantido', err); }

totalTestes++;
try {
  // C1-B2: ERRO com trecho_original inexistente na redação → rebaixado para PONTO_DE_ATENCAO
  const payload = montarPayload({
    competencias: [{
      numero: 1,
      nota: 120,
      justificativa: 'Desvio de concordância nominal apontado sem respaldo textual.',
      problemas: [{
        tipo: 'ERRO',
        descricao: 'Concordância nominal incorreta',
        trecho_original: 'usando a televisão e a internet',  // NÃO existe no textoSintetico
        sugestao_reescrita: 'usando a televisão e a internet (a construção está correta)'
      }],
      analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const problema = res.competencias[0].problemas[0];
  assert.equal(problema.tipo, 'PONTO_DE_ATENCAO',
    'ERRO com trecho_original inexistente na redação deve ser rebaixado para PONTO_DE_ATENCAO');
  assert.ok(problema._aviso_sem_trecho,
    'Deve conter sinalização _aviso_sem_trecho quando trecho não existe na redação');
  pass('C1-B (inexistente): ERRO com trecho_original ausente da redação rebaixado para PONTO_DE_ATENCAO');
} catch (err) { fail('C1-B (inexistente): ERRO com trecho inexistente rebaixado', err); }

totalTestes++;
try {
  // C1-C1: ERRO em formato legado (string) com trecho existente na redação → mantido como ERRO
  const rawLegado = JSON.stringify({
    nota_total: 800, nota_maxima: 1000,
    competencias: [
      { numero: 1, nota: 120, justificativa: 'Desvio de concordância identificado.', problemas: ['Erro de concordância nominal em "pouco espaço nas escolas"'], evidencias: [] },
      { numero: 2, nota: 160, justificativa: 'Repertório pertinente.', problemas: [], evidencias: [] },
      { numero: 3, nota: 160, justificativa: 'Argumentação clara.', problemas: [], evidencias: [] },
      { numero: 4, nota: 160, justificativa: 'Coesão adequada.', problemas: [], evidencias: [] },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com cinco elementos.', problemas: [], analise: { elementos_proposta: { agente: 'presente', acao: 'presente', meio: 'presente', finalidade: 'presente', detalhamento: 'presente' } }, evidencias: [] }
    ],
    pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
    feedback_geral: 'Avaliação de teste.', aviso_educacional: 'Aviso teste.'
  });
  const res = validarENormalizarResposta(rawLegado, matrizEnem, 'mock-ia', textoSintetico);
  const problema = res.competencias[0].problemas[0];
  assert.equal(problema.tipo, 'ERRO',
    'Formato legado com trecho existente na redação deve manter tipo ERRO');
  assert.ok(problema.descricao.includes('concordância'),
    'Descrição deve preservar o conteúdo original');
  pass('C1-C (legado existente): Formato legado com trecho existente na redação mantido como ERRO');
} catch (err) { fail('C1-C (legado existente): Legado com trecho existente', err); }

totalTestes++;
try {
  // C1-C2: ERRO em formato legado (string) com trecho inexistente na redação → rebaixado para PONTO_DE_ATENCAO
  const rawLegadoInexistente = JSON.stringify({
    nota_total: 800, nota_maxima: 1000,
    competencias: [
      { numero: 1, nota: 120, justificativa: 'Desvio de concordância identificado.', problemas: ['Erro de concordância nominal em "as alunos foram"'], evidencias: [] },
      { numero: 2, nota: 160, justificativa: 'Repertório pertinente.', problemas: [], evidencias: [] },
      { numero: 3, nota: 160, justificativa: 'Argumentação clara.', problemas: [], evidencias: [] },
      { numero: 4, nota: 160, justificativa: 'Coesão adequada.', problemas: [], evidencias: [] },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com cinco elementos.', problemas: [], analise: { elementos_proposta: { agente: 'presente', acao: 'presente', meio: 'presente', finalidade: 'presente', detalhamento: 'presente' } }, evidencias: [] }
    ],
    pontos_fortes: [], pontos_melhoria: [], exemplos_trechos: [], sugestoes: [], prioridades_estudo: [],
    feedback_geral: 'Avaliação de teste.', aviso_educacional: 'Aviso teste.'
  });
  const res = validarENormalizarResposta(rawLegadoInexistente, matrizEnem, 'mock-ia', textoSintetico);
  const problema = res.competencias[0].problemas[0];
  assert.equal(problema.tipo, 'PONTO_DE_ATENCAO',
    'Formato legado com trecho inexistente na redação deve ser rebaixado para PONTO_DE_ATENCAO');
  assert.ok(problema._aviso_sem_trecho,
    'Deve conter sinalização _aviso_sem_trecho');
  pass('C1-C (legado inexistente): Formato legado com trecho ausente da redação rebaixado para PONTO_DE_ATENCAO');
} catch (err) { fail('C1-C (legado inexistente): Legado com trecho inexistente rebaixado', err); }

totalTestes++;
try {
  // C1-D: SUGESTAO sem trecho → não deve ser alterada (downgrade só se aplica a ERRO)
  const payload = montarPayload({
    competencias: [{
      numero: 1,
      nota: 200,
      justificativa: 'Excelente domínio da norma culta. Como sugestão estilística, poderia variar as estruturas sintáticas.',
      problemas: [{
        tipo: 'SUGESTAO',
        descricao: 'Variar as estruturas sintáticas para enriquecer o texto',
        trecho_original: '',
        sugestao_reescrita: ''
      }],
      analise: { criterios_atendidos: ['Ortografia', 'Concordância', 'Pontuação'], criterios_parciais: [], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const problema = res.competencias[0].problemas[0];
  assert.equal(problema.tipo, 'SUGESTAO',
    'SUGESTAO sem trecho não deve ser alterada');
  assert.equal(res.competencias[0].nota, 200,
    'Nota 200 com sugestão estilística leve deve ser mantida');
  pass('C1-D: SUGESTAO sem trecho não alterada (apenas ERRO é rebaixado)');
} catch (err) { fail('C1-D: SUGESTAO sem trecho não alterada', err); }

totalTestes++;
try {
  // C1-E: "História da África" com maiúscula marcado como ERRO → reclassificado para SUGESTAO
  // Conforme Acordo Ortográfico (Base XIX, 2º, a), nomes de disciplinas e áreas do saber
  // têm inicial maiúscula facultativa e NÃO constituem erro gramatical obrigatório.
  const textoC1Disciplina = 'Nas escolas, a História da África costuma aparecer em poucos momentos do ano.';
  const payload = montarPayload({
    competencias: [{
      numero: 1,
      nota: 160,
      tipo_apontamento: 'ERRO',
      justificativa: 'Bom domínio da norma culta, com ressalva quanto ao uso de maiúscula.',
      problemas: [{
        tipo: 'ERRO',
        descricao: 'Uso indevido de letra maiúscula em "História da África"',
        trecho_original: 'História da África',
        sugestao_reescrita: 'história da África'
      }],
      analise: { criterios_atendidos: ['Sintaxe', 'Concordância'], criterios_parciais: [], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoC1Disciplina);
  const c1 = res.competencias[0];
  const problema = c1.problemas[0];
  assert.equal(problema.tipo, 'SUGESTAO',
    `Capitalização de disciplina deve ser reclassificada para SUGESTAO, obteve: ${problema.tipo}`);
  assert.ok(problema._aviso_capitalizacao_opcional === true,
    'Deve possuir a flag _aviso_capitalizacao_opcional');
  assert.notEqual(c1.tipo_apontamento, 'ERRO',
    'tipo_apontamento de C1 não deve permanecer ERRO quando o único apontamento é capitalização de disciplina');
  pass('C1-E: "História da África" com maiúscula marcado como ERRO reclassificado para SUGESTAO de estilo');
} catch (err) { fail('C1-E: Capitalização opcional de disciplina como SUGESTAO', err); }

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 2 — C3: Coerência entre tese e justificativa
// ─────────────────────────────────────────────────────────────────────────────

totalTestes++;
try {
  // C3-A: Justificativa diz "tese não está explicitamente formulada" mas descreve
  // dois argumentos/causas → contradição → nota_suspeita
  const payload = montarPayload({
    competencias: [{
      numero: 3,
      nota: 120,
      justificativa: 'A tese não está explicitamente formulada, embora a introdução identifique duas causas para o problema: pouco espaço nas escolas e o preconceito contra tradições africanas.',
      problemas: [],
      analise: { criterios_atendidos: [], criterios_parciais: ['tese não explicitada'], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c3 = res.competencias[2];
  assert.equal(c3.nota_suspeita, true,
    'Justificativa que nega tese mas descreve argumentos deve gerar nota_suspeita = true');
  assert.ok(c3.aviso_contradicao && c3.aviso_contradicao.includes('C3'),
    'aviso_contradicao deve mencionar C3');
  pass('C3-A: Justificativa nega tese mas descreve argumentos → nota_suspeita = true');
} catch (err) { fail('C3-A: Contradição C3 tese/argumentos', err); }

totalTestes++;
try {
  // C3-B: Justificativa coerente — reconhece tese presente e argumentação estruturada → sem nota_suspeita
  const payload = montarPayload({
    competencias: [{
      numero: 3,
      nota: 160,
      justificativa: 'O texto apresenta tese clara na introdução, com dois argumentos bem identificados sobre a Lei 10.639/2003 e o preconceito cultural, com desenvolvimento satisfatório.',
      problemas: [],
      analise: { criterios_atendidos: ['Tese presente', 'Dois desenvolvimentos'], criterios_parciais: ['Desdobramento sucinto'], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c3 = res.competencias[2];
  assert.ok(!c3.nota_suspeita,
    'Justificativa coerente não deve gerar nota_suspeita');
  pass('C3-B: Justificativa coerente não gera nota_suspeita');
} catch (err) { fail('C3-B: Coerência C3 sem nota_suspeita', err); }

totalTestes++;
try {
  // C3-C: Justificativa nega tese e descreve genuíno texto sem argumentação → sem nota_suspeita
  // (ausência real de argumentação — sem descrever argumentos)
  const payload = montarPayload({
    competencias: [{
      numero: 3,
      nota: 40,
      justificativa: 'A tese está ausente. O texto apresenta apenas citações desconexas sem defesa de ponto de vista. Não há encadeamento lógico.',
      problemas: [{ tipo: 'ERRO', descricao: 'Ausência de ponto de vista', trecho_original: 'citações desconexas', sugestao_reescrita: '' }],
      analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: ['Tese', 'Argumentação'] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c3 = res.competencias[2];
  // Análise coerente de ausência real de tese: não deve gerar nota_suspeita nem alterar a nota
  assert.ok(!c3.nota_suspeita,
    'Justificativa coerente de ausência de tese não deve gerar nota_suspeita');
  assert.notEqual(c3.nota_suspeita, true,
    'Justificativa coerente de ausência de tese não deve gerar nota_suspeita');
  assert.equal(c3.nota, 40,
    'Ajuste C3 não deve alterar a nota automaticamente');
  pass('C3-C: Justificativa coerente de ausência de tese não gera nota_suspeita');
} catch (err) { fail('C3-C: Ausência coerente de tese sem nota_suspeita', err); }

totalTestes++;
try {
  // C3-D: Justificativa afirma que a tese está ausente porque não há argumentos identificáveis
  // (incluindo a construção "não há dois argumentos")
  // A negação deve prevalecer: não pode interpretar "não há argumentos" ou "não há dois argumentos"
  // como prova positiva de argumentos, nem gerar nota_suspeita.
  const payload1 = montarPayload({
    competencias: [{
      numero: 3,
      nota: 40,
      justificativa: 'A tese está ausente porque não há argumentos identificáveis na redação.',
      problemas: [{ tipo: 'ERRO', descricao: 'Ausência de tese e argumentos', trecho_original: '', sugestao_reescrita: '' }],
      analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: ['Tese', 'Argumentos'] }
    }]
  });
  const res1 = validarENormalizarResposta(payload1, matrizEnem, 'mock-ia', textoSintetico);
  const c3_1 = res1.competencias[2];
  assert.ok(!c3_1.nota_suspeita,
    'Justificativa afirmando tese ausente por falta de argumentos identificáveis não deve gerar nota_suspeita');
  assert.notEqual(c3_1.nota_suspeita, true,
    'nota_suspeita não deve ser true');
  assert.equal(c3_1.nota, 40,
    'Nota da redação sem tese deve permanecer 40');

  // Variação explícita com "não há dois argumentos":
  const payload2 = montarPayload({
    competencias: [{
      numero: 3,
      nota: 40,
      justificativa: 'A tese está ausente porque não há dois argumentos identificáveis na estrutura dissertativa.',
      problemas: [],
      analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [] }
    }]
  });
  const res2 = validarENormalizarResposta(payload2, matrizEnem, 'mock-ia', textoSintetico);
  const c3_2 = res2.competencias[2];
  assert.ok(!c3_2.nota_suspeita,
    'Construção "não há dois argumentos identificáveis" não deve gerar falso positivo de argumentos');
  assert.notEqual(c3_2.nota_suspeita, true,
    'nota_suspeita não deve ser true quando argumentos são negados');

  pass('C3-D: Tese ausente por não haver argumentos identificáveis → sem nota_suspeita');
} catch (err) { fail('C3-D: Tese ausente por falta de argumentos sem nota_suspeita', err); }

totalTestes++;
try {
  // C3-E: Justificativa afirma ausência de tese mas afirma positivamente que há dois argumentos bem desenvolvidos
  // Contradição real mantida: nega tese e simultaneamente afirma que há dois argumentos bem desenvolvidos → nota_suspeita = true
  const payload = montarPayload({
    competencias: [{
      numero: 3,
      nota: 120,
      justificativa: 'A tese está ausente na introdução, mas há dois argumentos bem desenvolvidos ao longo do texto.',
      problemas: [],
      analise: { criterios_atendidos: ['Desenvolvimento'], criterios_parciais: ['Tese ausente'], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c3 = res.competencias[2];
  assert.equal(c3.nota_suspeita, true,
    'Afirmação positiva de dois argumentos bem desenvolvidos combinada com tese ausente deve gerar nota_suspeita');
  assert.ok(c3.aviso_contradicao && c3.aviso_contradicao.includes('C3'),
    'aviso_contradicao deve mencionar C3');
  pass('C3-E: Tese ausente mas com dois argumentos bem desenvolvidos → nota_suspeita = true');
} catch (err) { fail('C3-E: Contradição C3 preservada com afirmação positiva de dois argumentos', err); }

totalTestes++;
try {
  // C3-F: Justificativa com "tese implícita" e argumentos desenvolvidos
  // Dizer que a tese é implícita significa que ela existe (não está ausente).
  // Portanto, NÃO deve gerar nota_suspeita como se fosse contradição.
  const payload = montarPayload({
    competencias: [{
      numero: 3,
      nota: 160,
      justificativa: 'A tese é implícita, mas há dois argumentos bem desenvolvidos ao longo do texto.',
      problemas: [],
      analise: { criterios_atendidos: ['Argumentação desenvolvida'], criterios_parciais: ['Tese implícita'], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c3 = res.competencias[2];
  assert.ok(!c3.nota_suspeita,
    'Justificativa com "tese implícita" não deve gerar nota_suspeita');
  assert.notEqual(c3.nota_suspeita, true,
    'nota_suspeita não deve ser true para tese implícita');
  pass('C3-F: Tese implícita com argumentos desenvolvidos → sem nota_suspeita');
} catch (err) { fail('C3-F: Tese implícita sem nota_suspeita', err); }

totalTestes++;
try {
  // C3-G: Justificativa com a frase "a tese não está ausente" e presença de argumentos
  // A frase nega a ausência de tese (ou seja, tese está presente), portanto NÃO deve ser
  // classificada como afirmação de ausência nem gerar nota_suspeita.
  const payload = montarPayload({
    competencias: [{
      numero: 3,
      nota: 160,
      justificativa: 'A tese não está ausente; o texto desenvolve dois argumentos bem fundamentados nos parágrafos dissertativos.',
      problemas: [],
      analise: { criterios_atendidos: ['Tese identificada', 'Dois argumentos'], criterios_parciais: [], criterios_ausentes: [] }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c3 = res.competencias[2];
  assert.ok(!c3.nota_suspeita,
    'Frase "a tese não está ausente" não deve gerar nota_suspeita');
  assert.notEqual(c3.nota_suspeita, true,
    'nota_suspeita não deve ser true quando ausência de tese é negada');
  pass('C3-G: Frase "a tese não está ausente" não afirma ausência → sem nota_suspeita');
} catch (err) { fail('C3-G: Negação de ausência de tese sem nota_suspeita', err); }

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 3 — C4: Contagem real de conectivos antes de alegar recorrência
// ─────────────────────────────────────────────────────────────────────────────

totalTestes++;
try {
  // C4-A: Conectivos citados ("Além disso" e "Portanto") ocorrem uma única vez no texto
  // e a redação utiliza outros mecanismos coesivos adequados ("Mesmo assim", "Assim", "Com isso", "embora").
  // O validador não deve permitir alegar que são termos recorrentes nem manter problema de recorrência.
  const textoC4Variado = `Nas escolas, a História da África costuma aparecer em poucos momentos do ano.
Além disso, faltam materiais pedagógicos adequados para aprofundar o debate.
Mesmo assim, docentes buscam alternativas criativas no cotidiano escolar.
Assim, iniciativas pontuais ganham relevância formativa.
Com isso, os estudantes ampliam a consciência crítica, embora persistam desafios estruturais.
Portanto, são necessárias políticas públicas permanentes para essa área do saber.`;

  const payload = montarPayload({
    competencias: [{
      numero: 4,
      nota: 160,
      justificativa: 'Estrutura coesiva com emprego de conectivos, porém "Além disso" e "Portanto" são termos recorrentes.',
      problemas: [{
        tipo: 'PONTO_DE_ATENCAO',
        descricao: 'Termos recorrentes: "Além disso" e "Portanto" são conectivos recorrentes na redação',
        trecho_original: 'Além disso',
        sugestao_reescrita: ''
      }],
      analise: {
        criterios_atendidos: ['Conectores interparágrafos'],
        criterios_parciais: ['Termos recorrentes'],
        criterios_ausentes: []
      }
    }]
  });

  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoC4Variado);
  const c4 = res.competencias[3];

  // 1. A justificativa não deve conter alegação de termos recorrentes
  assert.ok(!c4.justificativa.toLowerCase().includes('recorrente'),
    `Justificativa de C4 não deve descrever termos de ocorrência única como recorrentes; obteve: "${c4.justificativa}"`);
  // 2. Problemas que apontavam falsa recorrência devem ter sido removidos
  const probRecorrentes = c4.problemas.filter(p => /(?:recorrente|repetid)/i.test(p.descricao || ''));
  assert.equal(probRecorrentes.length, 0,
    'Problemas com alegação de falsa recorrência de conectivos únicos devem ser removidos');
  // 3. Critérios parciais não devem conter alegação de termos recorrentes
  if (c4.analise?.criterios_parciais) {
    const critRecorrentes = c4.analise.criterios_parciais.filter(c => /(?:recorrente|repetid)/i.test(String(c)));
    assert.equal(critRecorrentes.length, 0,
      'Critérios parciais não devem conter alegação de termos recorrentes');
  }

  pass('C4-A: Conectivos com ocorrência única ("Além disso", "Portanto") não são descritos como recorrentes');
} catch (err) { fail('C4-A: Conectivos com ocorrência única não descritos como recorrentes', err); }

totalTestes++;
try {
  // C4-B: Conectivo genuinamente repetido 3 vezes na redação ("Além disso")
  // A constatação factual de repetição deve ser preservada.
  const textoC4Repetido = `Em primeiro plano, a educação inclusiva enfrenta barreiras orçamentárias.
Além disso, a capacitação de professores permanece deficiente em diversas regiões.
Além disso, a falta de material pedagógico dificulta as atividades.
Além disso, a infraestrutura escolar precária amplia a desigualdade educacional.`;

  const payload = montarPayload({
    competencias: [{
      numero: 4,
      nota: 120,
      justificativa: 'Emprego excessivamente repetido de conectivo: "Além disso" é termo recorrente ao longo do texto.',
      problemas: [{
        tipo: 'PONTO_DE_ATENCAO',
        descricao: 'Repetição mecânica: "Além disso" é conectivo recorrente',
        trecho_original: 'Além disso',
        sugestao_reescrita: 'Ademais / Outrossim'
      }],
      analise: {
        criterios_atendidos: ['Conectores interparágrafos'],
        criterios_parciais: ['Repetição de conectivos'],
        criterios_ausentes: []
      }
    }]
  });

  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoC4Repetido);
  const c4 = res.competencias[3];

  // Como "Além disso" de fato aparece 3 vezes, a crítica factual deve ser mantida
  assert.ok(c4.problemas.length > 0,
    'Crítica de conectivo genuinamente repetido deve ser preservada na lista de problemas');
  assert.ok(c4.justificativa.toLowerCase().includes('recorrente') || c4.justificativa.toLowerCase().includes('repeti'),
    'Justificativa de repetição genuína deve ser preservada');

  pass('C4-B: Conectivo genuinamente repetido (3x) tem crítica de repetição preservada');
} catch (err) { fail('C4-B: Conectivo genuinamente repetido preservado', err); }

totalTestes++;
try {
  // C4-C: Conectivo citado 2 vezes no texto — abaixo do limiar de 3 ocorrências.
  // A rubrica diz: "duas ocorrências não justificam, por si sós, essa crítica."
  // O validador deve remover o problema e sanear a justificativa.
  const textoC4Dois = `A educação inclusiva ainda enfrenta grandes desafios.
Além disso, faltam políticas públicas robustas.
Além disso, a formação docente é precária em muitos municípios.
Por outro lado, algumas iniciativas locais são promissoras.`;

  const payload = montarPayload({
    competencias: [{
      numero: 4,
      nota: 160,
      justificativa: '"Além disso" é termo recorrente e aparece repetido ao longo do texto.',
      problemas: [{
        tipo: 'PONTO_DE_ATENCAO',
        descricao: 'Repetição: "Além disso" é conectivo recorrente no texto',
        trecho_original: 'Além disso',
        sugestao_reescrita: 'Outrossim'
      }],
      analise: {
        criterios_atendidos: ['Conectores interparágrafos'],
        criterios_parciais: ['Uso recorrente de "Além disso"'],
        criterios_ausentes: []
      }
    }]
  });

  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoC4Dois);
  const c4 = res.competencias[3];

  // O conectivo aparece 2 vezes — abaixo do limiar de 3 → crítica deve ser removida
  assert.equal(c4.problemas.filter(p => /recorrente|repetid/i.test(p.descricao || '')).length, 0,
    'Problema de recorrência para conectivo com 2 ocorrências deve ser removido');
  assert.ok(!c4.justificativa.toLowerCase().includes('recorrente'),
    `Justificativa não deve descrever como recorrente um conectivo com apenas 2 ocorrências; obteve: "${c4.justificativa}"`);

  pass('C4-C: Conectivo citado 2× no texto tem crítica de repetição excessiva removida');
} catch (err) { fail('C4-C: Conectivo citado 2× no texto → crítica removida', err); }

totalTestes++;
try {
  // C4-D: Um problema de repetição vocabular (não conectivo) coexiste com falsa alegação de
  // recorrência de conectivo. A remoção deve ser cirúrgica: remove só a falsa alegação de
  // "Portanto" recorrente (que aparece 1×), preserva o problema de repetição vocabular.
  const textoC4Misto = `A educação enfrenta barreiras estruturais no país.
A educação precisa de mais investimento para superar essas barreiras.
Portanto, é fundamental que o Estado priorize políticas públicas.
A educação de qualidade é um direito de todos.`;

  const payload = montarPayload({
    competencias: [{
      numero: 4,
      nota: 120,
      justificativa: 'Uso recorrente de "Portanto" e repetição vocabular de "educação" ao longo do texto.',
      problemas: [
        {
          tipo: 'PONTO_DE_ATENCAO',
          descricao: 'Conectivo recorrente: "Portanto" é termo repetido',
          trecho_original: 'Portanto',
          sugestao_reescrita: 'Por conseguinte'
        },
        {
          tipo: 'PONTO_DE_ATENCAO',
          descricao: 'Repetição vocabular: a palavra "educação" é repetida com frequência excessiva',
          trecho_original: 'educação',
          sugestao_reescrita: 'ensino / formação'
        }
      ],
      analise: {
        criterios_atendidos: [],
        criterios_parciais: ['Repetição de "Portanto"', 'Repetição vocabular de "educação"'],
        criterios_ausentes: []
      }
    }]
  });

  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoC4Misto);
  const c4 = res.competencias[3];

  // 1. O problema independente de repetição vocabular permanece
  assert.ok(c4.problemas.some(p => /educação/i.test(p.descricao || '') && /vocabular|palavra/i.test(p.descricao || '')),
    'Problema independente de repetição vocabular de "educação" deve ser preservado');

  // 2. A justificativa ainda contém a observação válida sobre o vocabulário
  assert.ok(/repetição\s+vocabular|educação/i.test(c4.justificativa),
    `A justificativa deve preservar a observação válida sobre o vocabulário; obteve: "${c4.justificativa}"`);

  // 3. O critério parcial sobre repetição vocabular permanece
  assert.ok(c4.analise?.criterios_parciais?.some(c => /vocabular|educação/i.test(String(c))),
    'O critério parcial sobre repetição vocabular deve ser preservado em analise.criterios_parciais');

  // 4. A falsa crítica de recorrência de "Portanto" é removida
  assert.equal(c4.problemas.filter(p => /portanto/i.test(p.descricao || '')).length, 0,
    'Problema de "Portanto" recorrente (1 ocorrência) deve ser removido');
  assert.ok(!c4.justificativa.toLowerCase().includes('portanto'),
    `A justificativa não deve mais acusar recorrência de "Portanto"; obteve: "${c4.justificativa}"`);
  assert.ok(!c4.analise?.criterios_parciais?.some(c => /portanto/i.test(String(c))),
    'O critério parcial sobre recorrência de "Portanto" deve ter sido removido');

  // 5. A saída não apresenta a nota como confirmada sem tratar a possível influência da crítica inválida
  assert.ok(c4.nota_suspeita === true || c4.nota_confirmada === false || c4.necessita_reavaliacao === true,
    'A saída deve sinalizar que a nota não está confirmada e requer reavaliação');
  assert.equal(c4.nota_confirmada, false,
    'A nota de C4 não deve ser apresentada como confirmada após descarte de crítica influente');
  assert.ok(typeof c4.aviso_contradicao === 'string' && c4.aviso_contradicao.length > 0,
    'Deve haver aviso explicando que a pontuação pode ter sido influenciada pela crítica descartada');
  assert.equal(c4.nota, 120,
    'A nota não deve ser alterada automaticamente sem fundamentação explícita');

  pass('C4-D: Problema independente de repetição vocabular, observação na justificativa e critério parcial preservados; falsa crítica removida e nota sinalizada para reavaliação');
} catch (err) { fail('C4-D: Problema de repetição vocabular preservado ao remover falsa recorrência', err); }

totalTestes++;
try {
  // C4-E: Justificativa genérica "usa conectivos recorrentes" sem citar nenhum conectivo específico.
  // Sem conectivo identificável, o validador não pode verificar contagem e não deve alterar nada.
  const textoC4Generico = `O texto desenvolve um argumento progressivo sobre desigualdade social.
No entanto, a proposta de intervenção carece de agente e detalhamento.
Por outro lado, o repertório sociocultural é bem empregado.
Em suma, a redação demonstra capacidade argumentativa.`;

  const payload = montarPayload({
    competencias: [{
      numero: 4,
      nota: 120,
      justificativa: 'O texto usa conectivos recorrentes, o que prejudica a diversidade coesiva.',
      problemas: [{
        tipo: 'PONTO_DE_ATENCAO',
        descricao: 'Uso recorrente de conectivos ao longo do texto prejudica a variação coesiva',
        trecho_original: '',   // sem conectivo específico citado
        sugestao_reescrita: ''
      }],
      analise: {
        criterios_atendidos: [],
        criterios_parciais: ['Diversidade coesiva limitada'],
        criterios_ausentes: []
      }
    }]
  });

  const problemasAntes = 1; // o payload declara exatamente 1 problema (veja acima)
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoC4Generico);
  const c4 = res.competencias[3];

  // Sem conectivo identificável, o validador não deve remover problemas nem inventar contagens
  assert.equal(c4.problemas.length, problemasAntes,
    'Sem conectivo identificável na alegação genérica, nenhum problema deve ser removido');
  // Critério de diversidade coesiva deve ser preservado
  assert.ok(c4.analise?.criterios_parciais?.some(c => /diversidade|coesiv/i.test(String(c))),
    'Critério de diversidade coesiva não deve ser apagado em alegação genérica sem conectivo');

  pass('C4-E: Alegação genérica de conectivos recorrentes sem conectivo identificável não altera problemas');
} catch (err) { fail('C4-E: Alegação genérica sem conectivo identificável → sem remoção', err); }

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 4 — C5: Coerência entre status dos elementos e nota
// ─────────────────────────────────────────────────────────────────────────────

totalTestes++;
try {
  // C5-A: elementos_proposta.detalhamento === 'insuficiente' + nota 200 → ajustado para 160
  const payload = montarPayload({
    competencias: [{
      numero: 5,
      nota: 200,
      justificativa: 'Proposta com cinco elementos presentes. O agente, ação, meio e finalidade estão claros.',
      problemas: [],
      analise: {
        criterios_atendidos: ['Agente presente', 'Ação definida', 'Meio especificado', 'Finalidade clara'],
        criterios_parciais: [],
        criterios_ausentes: [],
        elementos_proposta: {
          agente: 'presente',
          acao: 'presente',
          meio: 'presente',
          finalidade: 'presente',
          detalhamento: 'insuficiente',  // insuficiente + nota 200 = incoerente
          relacao_com_problema: 'forte'
        }
      }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c5 = res.competencias[4];
  assert.equal(c5.nota, 160,
    `Detalhamento 'insuficiente' + nota 200 deve ser ajustado para 160; obteve ${c5.nota}`);
  assert.equal(c5.tipo_apontamento, 'PONTO_DE_ATENCAO',
    'tipo_apontamento deve ser PONTO_DE_ATENCAO após ajuste');
  const problemasAjuste = c5.problemas.filter(p => p.descricao && p.descricao.includes('C5: nota ajustada'));
  assert.ok(problemasAjuste.length > 0,
    'Deve haver problema explicativo do ajuste na lista de problemas');
  pass('C5-A: detalhamento=insuficiente + nota 200 → ajustado para 160');
} catch (err) { fail('C5-A: Ajuste C5 detalhamento insuficiente', err); }

totalTestes++;
try {
  // C5-B: elementos_proposta.detalhamento === 'ausente' + nota 200 → ajustado para 160
  const payload = montarPayload({
    competencias: [{
      numero: 5,
      nota: 200,
      justificativa: 'Proposta com quatro elementos. O detalhamento específico não foi identificado.',
      problemas: [],
      analise: {
        criterios_atendidos: [],
        criterios_parciais: [],
        criterios_ausentes: [],
        elementos_proposta: {
          agente: 'presente',
          acao: 'presente',
          meio: 'presente',
          finalidade: 'presente',
          detalhamento: 'ausente',  // ausente + nota 200 = incoerente
          relacao_com_problema: 'media'
        }
      }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c5 = res.competencias[4];
  assert.equal(c5.nota, 160,
    `Detalhamento 'ausente' + nota 200 deve ser ajustado para 160; obteve ${c5.nota}`);
  pass('C5-B: detalhamento=ausente + nota 200 → ajustado para 160');
} catch (err) { fail('C5-B: Ajuste C5 detalhamento ausente', err); }

totalTestes++;
try {
  // C5-C: Elementos completos + sugestão de refinamento futuro → mantém nota 200
  const payload = montarPayload({
    competencias: [{
      numero: 5,
      nota: 200,
      justificativa: 'Proposta com cinco elementos presentes e articulados ao problema. Recomenda-se detalhar mais a proposta em revisões futuras para enriquecer o detalhamento.',
      problemas: [],
      analise: {
        criterios_atendidos: ['Agente', 'Ação', 'Meio', 'Finalidade', 'Detalhamento'],
        criterios_parciais: [],
        criterios_ausentes: [],
        elementos_proposta: {
          agente: 'presente',
          acao: 'presente',
          meio: 'presente',
          finalidade: 'presente',
          detalhamento: 'presente',  // todos elementos completos
          relacao_com_problema: 'forte'
        }
      }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c5 = res.competencias[4];
  assert.equal(c5.nota, 200,
    `Justificativa com sugestão de refinamento futuro e elementos completos deve manter nota 200; obteve ${c5.nota}`);
  pass('C5-C: Elementos completos + sugestão de refinamento futuro mantém nota 200');
} catch (err) { fail('C5-C: Sugestão opcional futura mantém nota 200', err); }

totalTestes++;
try {
  // C5-F: Crítica substantiva e concreta de detalhamento insuficiente + nota 200 → ajustado para 160
  const payload = montarPayload({
    competencias: [{
      numero: 5,
      nota: 200,
      justificativa: 'Proposta com quatro elementos identificados, porém o detalhamento é insuficiente para alcançar o nível máximo.',
      problemas: [],
      analise: {
        criterios_atendidos: ['Agente', 'Ação', 'Meio', 'Finalidade'],
        criterios_parciais: [],
        criterios_ausentes: []
      }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c5 = res.competencias[4];
  assert.equal(c5.nota, 160,
    `Crítica substantiva de detalhamento insuficiente com nota 200 deve ser ajustada para 160; obteve ${c5.nota}`);
  pass('C5-F: Crítica substantiva de detalhamento insuficiente + nota 200 → ajustado para 160');
} catch (err) { fail('C5-F: Crítica substantiva de detalhamento insuficiente ajustada para 160', err); }

totalTestes++;
try {
  // C5-D: detalhamento='presente' + nota 200, sem recomendação de melhoria → mantido 200
  const payload = montarPayload({
    competencias: [{
      numero: 5,
      nota: 200,
      justificativa: 'Proposta excelente com cinco elementos plenamente presentes: o Ministério da Educação (agente) deve implementar formação continuada (ação) por meio de programas específicos (meio) para garantir a aplicação da Lei 10.639/2003 (finalidade), incluindo capacitação de 50.000 professores até 2027 (detalhamento).',
      problemas: [],
      analise: {
        criterios_atendidos: ['Agente', 'Ação', 'Meio', 'Finalidade', 'Detalhamento específico'],
        criterios_parciais: [],
        criterios_ausentes: [],
        elementos_proposta: {
          agente: 'presente',
          acao: 'presente',
          meio: 'presente',
          finalidade: 'presente',
          detalhamento: 'presente',
          relacao_com_problema: 'forte'
        }
      }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c5 = res.competencias[4];
  assert.equal(c5.nota, 200,
    `C5 coerente com detalhamento presente e justificativa sem críticas deve manter nota 200; obteve ${c5.nota}`);
  pass('C5-D: Proposta coerente com detalhamento presente mantém nota 200');
} catch (err) { fail('C5-D: Manutenção de nota 200 coerente em C5', err); }

totalTestes++;
try {
  // C5-E: detalhamento='insuficiente' + nota 160 → não altera (já 160, ajuste só ocorre com 200)
  const payload = montarPayload({
    competencias: [{
      numero: 5,
      nota: 160,
      justificativa: 'Proposta com quatro elementos válidos. O detalhamento é insuficiente para o nível máximo.',
      problemas: [],
      analise: {
        criterios_atendidos: ['Agente', 'Ação', 'Meio', 'Finalidade'],
        criterios_parciais: ['Detalhamento frágil'],
        criterios_ausentes: [],
        elementos_proposta: {
          agente: 'presente',
          acao: 'presente',
          meio: 'presente',
          finalidade: 'presente',
          detalhamento: 'insuficiente',
          relacao_com_problema: 'media'
        }
      }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c5 = res.competencias[4];
  // Nota já é 160 — o ajuste de detalhamento só se aplica quando nota=200
  // O bloco criteriosNaoPlenos pode alterar por outro motivo, mas a nota deve permanecer ≤ 160
  assert.ok(c5.nota <= 160,
    `Nota já em 160 com detalhamento insuficiente não deve subir; obteve ${c5.nota}`);
  pass('C5-E: Ajuste C5 não aplica quando nota já é 160 (apenas 200 → 160)');
} catch (err) { fail('C5-E: Sem ajuste quando nota já é 160', err); }

totalTestes++;
try {
  // C5-G: Frase negativa "não há falta de detalhamento; a proposta está completa" + nota 200
  // Distinção de negação: a frase nega a existência da deficiência, portanto a nota 200 é legítima
  // e NÃO deve ser reduzida para 160.
  const payload = montarPayload({
    competencias: [{
      numero: 5,
      nota: 200,
      justificativa: 'Não há falta de detalhamento; a proposta está completa com todos os elementos articulados ao problema.',
      problemas: [],
      analise: {
        criterios_atendidos: ['Agente', 'Ação', 'Meio', 'Finalidade', 'Detalhamento'],
        criterios_parciais: [],
        criterios_ausentes: [],
        elementos_proposta: {
          agente: 'presente',
          acao: 'presente',
          meio: 'presente',
          finalidade: 'presente',
          detalhamento: 'presente',
          relacao_com_problema: 'forte'
        }
      }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c5 = res.competencias[4];
  assert.equal(c5.nota, 200,
    `Frase negativa "não há falta de detalhamento" não deve reduzir nota 200; obteve ${c5.nota}`);
  pass('C5-G: Frase negativa "não há falta de detalhamento" mantém nota 200');
} catch (err) { fail('C5-G: Negação de falta de detalhamento mantém nota 200', err); }

totalTestes++;
try {
  // C5-H: Crítica afirmativa com "há falta de detalhamento" + nota 200 → ajustado para 160
  // Quando há crítica substantiva afirmativa de falta de detalhamento, a nota 200 deve ser reduzida para 160.
  const payload = montarPayload({
    competencias: [{
      numero: 5,
      nota: 200,
      justificativa: 'A proposta apresenta agente e ação, porém há falta de detalhamento no modo de implementação da intervenção.',
      problemas: [],
      analise: {
        criterios_atendidos: ['Agente', 'Ação', 'Meio', 'Finalidade'],
        criterios_parciais: [],
        criterios_ausentes: []
      }
    }]
  });
  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c5 = res.competencias[4];
  assert.equal(c5.nota, 160,
    `Crítica afirmativa de "há falta de detalhamento" com nota 200 deve ajustar para 160; obteve ${c5.nota}`);
  assert.equal(c5.tipo_apontamento, 'PONTO_DE_ATENCAO',
    'tipo_apontamento de C5 deve ser PONTO_DE_ATENCAO após ajuste');
  pass('C5-H: Crítica afirmativa de "falta de detalhamento" + nota 200 → ajustado para 160');
} catch (err) { fail('C5-H: Crítica afirmativa de falta de detalhamento ajustada para 160', err); }

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 5 — Integração: Múltiplas inconsistências simultâneas
// ─────────────────────────────────────────────────────────────────────────────

totalTestes++;
try {
  // INTEGRACAO: Resposta simulada com os três problemas ao mesmo tempo:
  // - C1: ERRO sem trecho → downgrade para PONTO_DE_ATENCAO
  // - C3: "tese não está" + descreve argumentos → nota_suspeita
  // - C5: detalhamento=insuficiente + nota 200 → ajusta para 160
  const payload = montarPayload({
    competencias: [
      {
        numero: 1,
        nota: 160,
        justificativa: 'Bom domínio gramatical com recomendação de usar artigos definidos com mais precisão.',
        problemas: [{
          tipo: 'ERRO',
          descricao: 'Usar artigos definidos com mais precisão nos substantivos',  // sem trecho, sem citação
          trecho_original: '',
          sugestao_reescrita: ''
        }],
        analise: { criterios_atendidos: [], criterios_parciais: [], criterios_ausentes: [] }
      },
      {
        numero: 3,
        nota: 120,
        justificativa: 'A tese não está explicitamente formulada, embora a introdução identifique o problema e dois argumentos sobre causas distintas sejam apresentados nos parágrafos de desenvolvimento.',
        problemas: [],
        analise: { criterios_atendidos: [], criterios_parciais: ['tese implícita'], criterios_ausentes: [] }
      },
      {
        numero: 5,
        nota: 200,
        justificativa: 'Proposta com cinco elementos afirmados presentes.',
        problemas: [],
        analise: {
          criterios_atendidos: [],
          criterios_parciais: [],
          criterios_ausentes: [],
          elementos_proposta: {
            agente: 'presente',
            acao: 'presente',
            meio: 'presente',
            finalidade: 'presente',
            detalhamento: 'insuficiente',  // contradiz nota 200
            relacao_com_problema: 'forte'
          }
        }
      }
    ]
  });

  const res = validarENormalizarResposta(payload, matrizEnem, 'mock-ia', textoSintetico);
  const c1 = res.competencias[0];
  const c3 = res.competencias[2];
  const c5 = res.competencias[4];

  // C1: ERRO sem trecho → PONTO_DE_ATENCAO
  assert.equal(c1.problemas[0].tipo, 'PONTO_DE_ATENCAO',
    `C1 ERRO sem trecho deve ser PONTO_DE_ATENCAO; obteve ${c1.problemas[0].tipo}`);
  assert.ok(c1.problemas[0]._aviso_sem_trecho, 'C1 deve ter _aviso_sem_trecho');

  // C3: nota_suspeita por contradição tese/argumentos
  assert.equal(c3.nota_suspeita, true,
    'C3 deve ter nota_suspeita = true por contradição tese/argumentos');
  // Nota NÃO deve ser alterada automaticamente pelo ajuste C3
  assert.equal(c3.nota, 120, 'C3: nota não deve ser alterada automaticamente');

  // C5: nota ajustada de 200 para 160
  assert.equal(c5.nota, 160,
    `C5 deve ter nota ajustada para 160; obteve ${c5.nota}`);

  pass('INTEGRACAO: C1 rebaixado + C3 suspeita + C5 ajustado simultaneamente');
} catch (err) { fail('INTEGRACAO: Três inconsistências simultâneas', err); }

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 6 — Regressão e Rigor Pedagógico: Caso "Herança Africana" (202 palavras, 920 pts)
// ─────────────────────────────────────────────────────────────────────────────

const textoRegressao202 = `A valorização da herança africana no Brasil enfrenta obstáculos históricos que persistem na sociedade contemporânea e de fato exigem soluções urgentes e articuladas no atual cenário nacional. A marginalização da cultura afro-brasileira é reflexo direto de séculos de escravidão que moldaram as relações sociais e institucionais do país. Nesse contexto, torna-se imperativo analisar os entraves para a superação desse estigma e propor intervenções capazes de assegurar a igualdade e o respeito à diversidade cultural.

Em primeiro lugar, a representatividade insuficiente nos espaços de decisão e nos currículos escolares limita o reconhecimento das contribuições dos povos africanos para a identidade nacional. Embora a legislação determine a obrigatoriedade dessa temática, observa-se resistência na sua efetiva consolidação prática no cotidiano educacional.

Em segundo lugar, o preconceito estrutural reproduz desigualdades que restringem as oportunidades de ascensão social e visibilidade cultural. Sem iniciativas consistentes de conscientização, o silenciamento histórico se perpetua, inviabilizando a justiça social preconizada pela Constituição Federal de 1988.

Portanto, medidas são urgentes para mitigar essa problemática. As escolas devem falar mais do assunto e organizar atividades pedagógicas sobre a cultura afro-brasileira, enquanto o governo deve veicular campanhas na mídia, a fim de conscientizar a população e valorizar a memória africana na construção do Brasil.`;

totalTestes++;
try {
  // REG-1: Evidências literais são aceitas; evidências parafraseadas ou inventadas são descartadas
  const payloadEvidencias = montarPayload({
    competencias: [
      {
        numero: 1,
        nota: 200,
        justificativa: 'Excelente domínio formal demonstrado em "A valorização da herança africana no Brasil".',
        evidencias_textuais: [
          'A valorização da herança africana no Brasil', // LITERAL presente -> deve manter
          'O preconceito no Brasil é um grande problema social' // PARÁFRASE ausente -> deve descartar
        ]
      },
      {
        numero: 2,
        nota: 160,
        justificativa: 'Repertório pertinente baseado na legislação.',
        evidencias_textuais: [
          'A marginalização da cultura afro-brasileira é reflexo direto de séculos de escravidão' // LITERAL presente -> deve manter
        ]
      },
      {
        numero: 3,
        nota: 160,
        justificativa: 'Projeto de texto claro ao citar "representatividade insuficiente nos espaços de decisão".',
        evidencias_textuais: [
          'Os alunos não aprendem sobre os negros' // INVENTADA ausente -> deve descartar
        ]
      }
    ]
  });

  const res = validarENormalizarResposta(payloadEvidencias, matrizEnem, 'mock-ia', textoRegressao202);
  const c1 = res.competencias[0];
  const c2 = res.competencias[1];
  const c3 = res.competencias[2];

  assert.equal(c1.evidencias_textuais.length, 1, 'C1 deve manter apenas a evidência literal');
  assert.equal(c1.evidencias_textuais[0], 'A valorização da herança africana no Brasil');

  assert.equal(c2.evidencias_textuais.length, 1, 'C2 deve manter a evidência literal');
  assert.equal(c2.evidencias_textuais[0], 'A marginalização da cultura afro-brasileira é reflexo direto de séculos de escravidão');

  // C3 tinha apenas evidência inventada, mas cita entre aspas na justificativa
  assert.equal(c3.evidencias_textuais.length, 1, 'C3 deve recuperar a citação literal entre aspas da justificativa');
  assert.equal(c3.evidencias_textuais[0], 'representatividade insuficiente nos espaços de decisão');

  pass('REG-1: Evidências literais preservadas, paráfrases descartadas e citações literais recuperadas');
} catch (err) { fail('REG-1: Validação estrita de evidências textuais literais', err); }

totalTestes++;
try {
  // REG-2: C5 nota 200 com proposta genérica ("escolas falarem mais", "organizar atividades", "governo veicular campanhas")
  // sem explicação concreta de execução deve ser ajustada para 160 pts com nota_suspeita = true
  const payloadC5Generica = montarPayload({
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Excelente domínio da norma culta formal.' },
      { numero: 2, nota: 160, justificativa: 'Repertório pertinente com uso produtivo satisfatório.' },
      { numero: 3, nota: 160, justificativa: 'Projeto de texto organizado com pequenos deslizes de aprofundamento.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada inter e intraparágrafos.' },
      {
        numero: 5,
        nota: 200,
        justificativa: 'Proposta com agentes múltiplos e declaração de detalhamento específico nas ações.',
        analise: {
          criterios_atendidos: ['Agente presente', 'Ação presente', 'Meio presente', 'Efeito presente'],
          criterios_parciais: [],
          criterios_ausentes: [],
          elementos_proposta: {
            agente: 'presente',
            acao: 'presente',
            meio: 'presente',
            finalidade: 'presente',
            detalhamento: 'presente',
            elemento_detalhado: 'nenhum' // explicitamente sem detalhamento de execução autônomo
          }
        }
      }
    ]
  });

  const res = validarENormalizarResposta(payloadC5Generica, matrizEnem, 'mock-ia', textoRegressao202);
  const c5 = res.competencias[4];

  assert.equal(c5.nota, 160, 'C5 com ações genéricas sem detalhamento executivo deve ser ajustada para 160');
  assert.equal(c5.nota_suspeita, true, 'C5 deve ser marcada como nota_suspeita');
  assert.equal(c5.nota_confirmada, false, 'C5 deve ter nota_confirmada = false');
  assert.ok(c5.problemas.some(p => p.descricao.includes('160 pts')), 'Deve haver apontamento explicativo da rubrica INEP');

  pass('REG-2: C5 com ações genéricas e sem detalhamento executivo ajustada de 200 para 160 pts');
} catch (err) { fail('REG-2: C5 proposta genérica sem detalhamento concreto', err); }

totalTestes++;
try {
  // REG-3: C5 com proposta completa e detalhamento executivo autônomo comprovado mantém 200 pts
  const textoComDetalhamento = textoRegressao202.replace(
    'As escolas devem falar mais do assunto e organizar atividades pedagógicas sobre a cultura afro-brasileira, enquanto o governo deve veicular campanhas na mídia, a fim de conscientizar a população e valorizar a memória africana na construção do Brasil.',
    'Portanto, cabe ao Ministério da Educação implementar diretrizes curriculares integradas, por meio da capacitação continuada de professores em convênio com universidades públicas — mediante módulos específicos de história afro-brasileira no contraturno —, com o intuito de consolidar uma formação antirracista.'
  );

  const payloadC5Completa = montarPayload({
    competencias: [
      {
        numero: 5,
        nota: 200,
        justificativa: 'Proposta de intervenção completa, detalhada e plenamente articulada ao tema, com especificação autônoma do meio de capacitação docente.',
        analise: {
          criterios_atendidos: ['Agente', 'Ação', 'Meio', 'Efeito', 'Detalhamento autônomo'],
          criterios_parciais: [],
          criterios_ausentes: [],
          elementos_proposta: {
            agente: 'presente',
            acao: 'presente',
            meio: 'presente',
            finalidade: 'presente',
            detalhamento: 'presente',
            elemento_detalhado: 'meio'
          }
        }
      }
    ]
  });

  const res = validarENormalizarResposta(payloadC5Completa, matrizEnem, 'mock-ia', textoComDetalhamento);
  const c5 = res.competencias[4];

  assert.equal(c5.nota, 200, 'C5 com proposta detalhada comprovada deve manter 200 pts');
  assert.equal(c5.nota_suspeita, undefined, 'C5 detalhada não deve ter nota_suspeita');

  pass('REG-3: C5 com detalhamento autônomo demonstrado preserva 200 pts');
} catch (err) { fail('REG-3: C5 proposta detalhada mantém 200 pts', err); }

totalTestes++;
try {
  // REG-4: Análise de extensão do texto de 202 palavras: esclarecimento pedagógico da plataforma vs ENEM
  const diag = analisarExtensaoRedacao(textoRegressao202, null, 'enem');

  assert.equal(diag.status, 'abaixo_do_recomendado', 'Texto de 202 palavras deve ter status abaixo_do_recomendado');
  assert.ok(diag.total_palavras >= 195 && diag.total_palavras <= 210, `Contagem esperada ~202 palavras, obteve ${diag.total_palavras}`);
  assert.ok(diag.observacao_pedagogica.includes('abaixo da faixa recomendada'), 'Observação deve orientar sobre a faixa recomendada');
  assert.ok(diag.observacao_pedagogica.includes('NÃO uma regra oficial do ENEM') || diag.observacao_pedagogica.includes('não uma exigência oficial'), 'Observação deve esclarecer que é recomendação pedagógica interna');
  assert.ok(!diag.observacao_pedagogica.includes('nota zero'), 'Não deve indicar nota zero');

  pass('REG-4: Diagnóstico de extensão com esclarecimento de orientação pedagógica interna sem penalidade');
} catch (err) { fail('REG-4: Diagnóstico de extensão pedagógica', err); }

totalTestes++;
try {
  // REG-5: Caso de regressão 920 pts (C1 200, C2 160, C3 160, C4 200, C5 200 com C5 genérica)
  // Backend recalcula C5 para 160 e nota_total para 880 (200+160+160+200+160)
  const payload920 = montarPayload({
    nota_total: 920, // IA enviou 920
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Excelente domínio formal da língua culta.' },
      { numero: 2, nota: 160, justificativa: 'Repertório sociocultural legitimado e pertinente.' },
      { numero: 3, nota: 160, justificativa: 'Projeto de texto satisfatório com pequenas lacunas.' },
      { numero: 4, nota: 200, justificativa: 'Excelente repertório de conectivos inter e intraparágrafos.' },
      {
        numero: 5,
        nota: 200, // C5 declarou 200 mas proposta no texto só tem ações genéricas
        justificativa: 'Proposta genérica com intervenções múltiplas.',
        analise: {
          criterios_atendidos: ['Agente', 'Ação', 'Meio', 'Efeito'],
          criterios_parciais: [],
          criterios_ausentes: [],
          elementos_proposta: {
            agente: 'presente',
            acao: 'presente',
            meio: 'presente',
            finalidade: 'presente',
            detalhamento: 'insuficiente'
          }
        }
      }
    ]
  });

  const res = validarENormalizarResposta(payload920, matrizEnem, 'mock-ia', textoRegressao202);

  // Invariante estrita: nota_total é calculada pelo backend como soma exata
  const somaReal = res.competencias.reduce((acc, c) => acc + c.nota, 0);
  assert.equal(res.nota_total, somaReal, 'Invariante: nota_total DEVE ser a soma exata das competências');
  assert.equal(res.nota_total, 880, '920 pts ajustado para 880 com clamp de C5 em 160');
  assert.equal(res.competencias[4].nota, 160, 'C5 ajustada para 160');
  assert.equal(res.nota_suspeita, true, 'Objeto raiz de avaliação sinaliza nota_suspeita = true');
  assert.equal(res.nota_confirmada, false, 'Objeto raiz de avaliação sinaliza nota_confirmada = false');

  pass('REG-5: Invariante de soma estrita do backend e propagação de nota_suspeita no caso de 920 pts');
} catch (err) { fail('REG-5: Invariante de soma e propagação de suspeita', err); }

// ─────────────────────────────────────────────────────────────────────────────
// Relatório Final
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════');
if (testesFalhados === 0) {
  console.log(`Relatório da Suíte: ${testesAprovados}/${totalTestes} testes aprovados.`);
} else {
  console.warn(`⚠️  Relatório da Suíte: ${testesAprovados}/${totalTestes} aprovados, ${testesFalhados} falharam.`);
}
console.log('════════════════════════════════════════════════════════════\n');

if (testesFalhados > 0) process.exit(1);
