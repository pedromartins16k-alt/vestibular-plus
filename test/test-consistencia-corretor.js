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
 *   C3-A — Justificativa nega tese mas descreve argumentos presentes → nota_suspeita
 *   C3-B — Justificativa coerente (tese presente, sem negação) → sem nota_suspeita
 *   C3-C — Justificativa coerente de ausência de tese → sem nota_suspeita
 *   C3-D — Justificativa afirma tese ausente por não haver argumentos identificáveis → sem nota_suspeita
 *   C3-E — Justificativa nega tese mas afirma positivamente dois argumentos bem desenvolvidos → nota_suspeita
 *   C3-F — Justificativa com "tese implícita" com argumentos desenvolvidos → sem nota_suspeita
 *   C3-G — Frase "a tese não está ausente" nega ausência → sem nota_suspeita
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
import { validarENormalizarResposta } from '../api/_ai-service.js';

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
// GRUPO 3 — C5: Coerência entre status dos elementos e nota
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
// GRUPO 4 — Integração: C1 + C3 + C5 incoerentes ao mesmo tempo
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
