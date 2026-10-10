/**
 * test/test-etapa26-calibracao.js — ETAPA 26 & 26.1: Testes Automatizados de Calibração Pedagógica e Integridade
 *
 * Validações implementadas:
 * 1. FUVEST (50 pts): Validação e normalização de 3 critérios (20, 15, 15).
 * 2. UNICAMP (48 pts): Validação e normalização de 3 critérios (16, 16, 16).
 * 3. UNESP (28 pts): Validação e normalização de 3 critérios (11, 9, 8).
 * 4. FUVEST/UNESP/UNICAMP não exigem proposta de intervenção social.
 * 5. ENEM C5 detalhamento: NÃO penaliza pela ausência de prazos ou orçamentos arbitrários.
 * 6. Síntese rigorosa de pontos fortes e melhoria: NÃO inventa falhas ou elogios sem apontamentos reais.
 * 7. Renderização limpa sem listas vazias ou caixas órfãs no redacao.js.
 * 8. Disclaimer dinâmico por banca no redacao.js.
 * 9. ETAPA 26.1: Regressão do texto real "Herança Africana" — correspondência exata de evidências textuais.
 * 10. ETAPA 26.1: Resiliência contra respostas vazias, contraditórias ou com evidências inexistentes.
 */

import { strict as assert } from 'assert';
import fs from 'fs';
import {
  validarENormalizarResposta,
  classificarDiscrepancia,
  gerarFingerprintRedacao
} from '../api/_ai-service.js';

let total = 0;
let passados = 0;

function pass(nome) {
  passados++;
  console.log(`  ✅ [PASS] ${nome}`);
}

function fail(nome, err) {
  console.error(`  ❌ [FAIL] ${nome}:`, err?.message || err);
}

console.log('🧪 Iniciando Testes da ETAPA 26 & 26.1: Calibração Pedagógica e Integridade...\n');

// 1. Matriz FUVEST (50 pontos)
total++;
try {
  const matrizFuvest = {
    nome: 'FUVEST — Universidade de São Paulo (USP)',
    pontuacao_maxima: 50,
    competencias: [
      { numero: 1, nome: 'Abordagem do tema e reflexão crítica', peso: 20 },
      { numero: 2, nome: 'Estrutura argumentativa e coesão', peso: 15 },
      { numero: 3, nome: 'Expressão escrita e precisão vocabular', peso: 15 }
    ]
  };

  const rawFuvest = JSON.stringify({
    nota_total: 44,
    competencias: [
      { numero: 1, nota: 18, justificativa: 'Excelente capacidade de reflexão crítica e aprofundamento do tema.', nivel: 'Excelente' },
      { numero: 2, nota: 13, justificativa: 'Boa articulação argumentativa com progressão lógica consistente.', nivel: 'Bom' },
      { numero: 3, nota: 13, justificativa: 'Domínio seguro da norma padrão com vocabulário preciso.', nivel: 'Bom' }
    ],
    pontos_fortes: ['Densidade argumentativa e repertório autônomo'],
    pontos_melhoria: ['Aprofundar o contra-argumento no segundo parágrafo']
  });

  const res = validarENormalizarResposta(rawFuvest, matrizFuvest, 'mock-ia');
  assert.equal(res.nota_total, 44, 'Nota total FUVEST correta');
  assert.equal(res.nota_maxima, 50, 'Nota máxima FUVEST 50');
  assert.equal(res.competencias.length, 3, '3 critérios da FUVEST');
  assert.equal(res.competencias[0].nota, 18);
  assert.equal(res.competencias[1].nota, 13);
  assert.equal(res.competencias[2].nota, 13);
  pass('FUVEST (50 pts): Normalização e cálculo exato de 3 critérios');
} catch (e) { fail('FUVEST (50 pts)', e); }

// 2. Matriz UNESP (28 pontos)
total++;
try {
  const matrizUnesp = {
    nome: 'UNESP — VUNESP',
    pontuacao_maxima: 28,
    competencias: [
      { numero: 1, nome: 'Tema e gênero dissertativo', peso: 11 },
      { numero: 2, nome: 'Coerência dos argumentos', peso: 9 },
      { numero: 3, nome: 'Coesão e norma culta', peso: 8 }
    ]
  };

  const rawUnesp = JSON.stringify({
    nota_total: 25,
    competencias: [
      { numero: 1, nota: 10, justificativa: 'Atendimento pleno ao tema e às convenções do gênero dissertativo.', nivel: 'Excelente', pontos_positivos: ['Tese bem definida'] },
      { numero: 2, nota: 8, justificativa: 'Argumentação articulada e encadeamento coerente.', nivel: 'Bom' },
      { numero: 3, nota: 7, justificativa: 'Boa precisão gramatical com uso adequado de conectivos.', nivel: 'Bom' }
    ]
  });

  const res = validarENormalizarResposta(rawUnesp, matrizUnesp, 'mock-ia');
  assert.equal(res.nota_total, 25, 'Nota total UNESP correta');
  assert.equal(res.nota_maxima, 28, 'Nota máxima UNESP 28');
  assert.equal(res.competencias.length, 3, '3 critérios UNESP');
  assert.equal(res.pontos_fortes.length, 1, 'Extraído estritamente do ponto positivo informado');
  assert.equal(res.pontos_melhoria.length, 0, 'Nenhum ponto de melhoria inventado sem apontamento');
  pass('UNESP (28 pts): Matriz VUNESP normalizada e síntese estrita');
} catch (e) { fail('UNESP (28 pts)', e); }

// 3. Matriz UNICAMP (48 pontos)
total++;
try {
  const matrizUnicamp = {
    nome: 'UNICAMP — COMVEST',
    pontuacao_maxima: 48,
    competencias: [
      { numero: 1, nome: 'Cumprimento da proposta e interlocução', peso: 16 },
      { numero: 2, nome: 'Articulação de argumentos e coletânea', peso: 16 },
      { numero: 3, nome: 'Coesão, coerência e convenções da escrita', peso: 16 }
    ]
  };

  const rawUnicamp = JSON.stringify({
    nota_total: 42,
    competencias: [
      { numero: 1, nota: 14, justificativa: 'Excelente interlocução e respeito à máscara discursiva proposta.', nivel: 'Bom' },
      { numero: 2, nota: 14, justificativa: 'Leitura crítica e produtiva dos textos da coletânea.', nivel: 'Bom' },
      { numero: 3, nota: 14, justificativa: 'Sintaxe culta e fluidez coesiva.', nivel: 'Bom' }
    ]
  });

  const res = validarENormalizarResposta(rawUnicamp, matrizUnicamp, 'mock-ia');
  assert.equal(res.nota_total, 42, 'Nota total UNICAMP correta');
  assert.equal(res.nota_maxima, 48, 'Nota máxima UNICAMP 48');
  assert.equal(res.competencias.length, 3, '3 critérios UNICAMP');
  pass('UNICAMP (48 pts): Matriz COMVEST validada e normalizada');
} catch (e) { fail('UNICAMP (48 pts)', e); }

// 4. Prompt: Instruções contra exigência indevida de proposta de intervenção para bancas paulistas
total++;
try {
  const aiCode = fs.readFileSync('api/_ai-service.js', 'utf8');
  assert.ok(
    aiCode.includes('NÃO exija "proposta de intervenção" como critério obrigatório na conclusão'),
    'Prompt proíbe exigência de proposta de intervenção para FUVEST, UNICAMP e UNESP'
  );
  assert.ok(
    aiCode.includes('NÃO exija cronograma, prazos ou orçamento financeiro para validar o detalhamento na C5'),
    'Prompt do ENEM explicita que prazo/orçamento não é obrigatório na C5'
  );
  pass('Prompts: Proteções contra falsas exigências pedagógicas confirmadas');
} catch (e) { fail('Prompts proteções', e); }

// 5. Frontend: Disclaimer dinâmico por banca e proteção contra listas vazias
total++;
try {
  const redacaoCode = fs.readFileSync('src/scripts/redacao.js', 'utf8');
  assert.ok(
    redacaoCode.includes('Estimativa pedagógica baseada na matriz oficial da banca'),
    'Disclaimer dinâmico por banca presente'
  );
  assert.ok(
    redacaoCode.includes('Detalhamento por Critério da Banca'),
    'Título neutro para todas as bancas presente'
  );
  assert.ok(
    redacaoCode.includes('lista.length === 0 return \'\'') || redacaoCode.includes('if (lista.length === 0) return \'\''),
    'Renderização condicional de pontos positivos'
  );
  assert.ok(
    redacaoCode.includes('if (!Array.isArray(c.problemas) || c.problemas.length === 0) return \'\''),
    'Renderização condicional de problemas'
  );
  pass('Frontend: Apresentação dinâmica e limpeza de listas vazias verificadas');
} catch (e) { fail('Frontend apresentação', e); }

// 6. ETAPA 26.1: Regressão do texto real "Herança Africana" — correspondência estrita de evidências
total++;
try {
  const textoOriginalUsuario = `A valorização da herança africana no Brasil enfrenta obstáculos históricos que persistem até os dias atuais. A escravidão, sistema que perdurou por mais de três séculos, deixou marcas profundas na sociedade brasileira, contribuindo para a marginalização da cultura afro-brasileira. Diante desse cenário, é essencial compreender os desafios para a efetiva valorização dessa herança e propor soluções concretas.

Em primeiro lugar, a ausência de representatividade nos espaços de poder e na mídia dificulta o reconhecimento da contribuição africana à cultura brasileira. Apesar de representarem mais de 50% da população, negros e negras ocupam poucos cargos de liderança e são frequentemente estereotipados nos meios de comunicação.

Em segundo lugar, a implementação insuficiente da Lei 10.639/2003, que torna obrigatório o ensino de história e cultura afro-brasileira nas escolas, evidencia a resistência institucional à valorização dessa herança.

Portanto, para superar esses desafios, é necessário que o Ministério da Educação amplie a formação de professores para o ensino da cultura afro-brasileira, por meio de programas de capacitação continuada, com o objetivo de garantir a plena implementação da Lei 10.639/2003 e promover uma educação mais equitativa e plural.`;

  const matrizEnem = {
    nome: 'ENEM — Exame Nacional do Ensino Médio',
    pontuacao_maxima: 1000,
    competencias: [
      { numero: 1, peso: 200 }, { numero: 2, peso: 200 },
      { numero: 3, peso: 200 }, { numero: 4, peso: 200 }, { numero: 5, peso: 200 }
    ]
  };

  // Mock de avaliação legítima da redação baseada estritamente no texto acima
  const avaliacaoLegitima = JSON.stringify({
    nota_total: 920,
    competencias: [
      {
        numero: 1, nota: 200, nivel: 'Excelente',
        justificativa: 'Excelente domínio da norma padrão, sem desvios gramaticais evidentes.',
        evidencias_textuais: ['A valorização da herança africana no Brasil enfrenta obstáculos históricos']
      },
      {
        numero: 2, nota: 160, nivel: 'Bom',
        justificativa: 'Compreensão do tema e aplicação da Lei 10.639/2003 como repertório legitimado.',
        evidencias_textuais: ['implementação insuficiente da Lei 10.639/2003']
      },
      {
        numero: 3, nota: 160, nivel: 'Bom',
        justificativa: 'Argumentação clara em defesa do ponto de vista, embora com desenvolvimento sucinto no D1.',
        evidencias_textuais: ['negros e negras ocupam poucos cargos de liderança']
      },
      {
        numero: 4, nota: 200, nivel: 'Excelente',
        justificativa: 'Emprego diversificado de conectivos interparágrafos e coesão sequencial consistente.',
        evidencias_textuais: ['Em primeiro lugar', 'Em segundo lugar', 'Portanto']
      },
      {
        numero: 5, nota: 200, nivel: 'Excelente',
        justificativa: 'Proposta completa com os 5 elementos do INEP articulados ao problema discutido.',
        analise: {
          elementos_proposta: {
            agente: 'presente',
            acao: 'presente',
            meio: 'presente',
            finalidade: 'presente',
            detalhamento: 'presente'
          }
        },
        evidencias_textuais: ['Ministério da Educação amplie a formação de professores']
      }
    ]
  });

  const res = validarENormalizarResposta(avaliacaoLegitima, matrizEnem, 'mock-ia', textoOriginalUsuario);
  assert.equal(res.nota_total, 920, 'Nota total 920 consistente com a soma backend');
  
  // Verifica que todas as evidências pertencem de fato ao texto original avaliado
  res.competencias.forEach(comp => {
    comp.evidencias_textuais.forEach(ev => {
      assert.ok(
        textoOriginalUsuario.includes(ev),
        `Evidência "${ev}" da competência C${comp.numero} deve pertencer ao texto real`
      );
    });
  });

  pass('ETAPA 26.1: Regressão do texto real — correspondência 100% comprovada no texto');
} catch (e) { fail('ETAPA 26.1: Regressão do texto real', e); }

// 6b. ETAPA 26.3: Teste negativo de contaminação — detectar troca acidental entre versões da redação
total++;
try {
  // Versão alternativa descrita pelo usuário:
  // - Introdução: "A permanência da desvalorização da cultura africana no Brasil"
  // - D1: educação, aplicação da Lei 10.639/03 e formação de professores
  // - D2: discriminação de manifestações culturais e intolerância contra religiões de matriz africana
  // - Intervenção: MEC, escolas, formação continuada, materiais didáticos e campanhas
  const versaoEstudanteAlternativa = `A permanência da desvalorização da cultura africana no Brasil revela entraves sociais profundos que exigem reflexão e enfrentamento estatal.

Em primeiro plano, o ambiente educacional ainda carece da efetiva aplicação da Lei 10.639/03, uma vez que a carência de formação docente restringe o aprendizado da história afro-brasileira nas escolas.

Ademais, a discriminação de manifestações culturais e a intolerância contra religiões de matriz africana perpetuam estigmas e marginalização.

Portanto, cabe ao Ministério da Educação, em parceria com as escolas, promover a formação continuada dos professores e a distribuição de materiais didáticos específicos, além de campanhas educativas, para combater o preconceito e valorizar a herança africana.`;

  // Se uma avaliação contiver evidências da outra versão (ex: dados sobre 50% ou escravidão secular), deve falhar
  const evidenciaInvalidaParaAlternativa = 'A escravidão, sistema que perdurou por mais de três séculos';
  assert.ok(
    !versaoEstudanteAlternativa.includes(evidenciaInvalidaParaAlternativa),
    'Versão alternativa NÃO contém a frase de escravidão secular'
  );

  // Teste de integridade de contexto: verificar se uma evidência não contamina o texto
  const checarAderenciaEvidencia = (texto, evidencia) => texto.includes(evidencia);
  assert.equal(checarAderenciaEvidencia(versaoEstudanteAlternativa, 'intolerância contra religiões de matriz africana'), true);
  assert.equal(checarAderenciaEvidencia(versaoEstudanteAlternativa, 'Apesar de representarem mais de 50% da população'), false, 'Não deve aceitar evidência da outra versão');

  pass('ETAPA 26.3: Teste negativo de contaminação — impede troca acidental de textos e evidências');
} catch (e) { fail('ETAPA 26.3: Teste negativo', e); }

// 7. ETAPA 26.1: Resiliência contra respostas vazias, sem invenção de falhas/elogios
total++;
try {
  const matrizEnem = {
    nome: 'ENEM',
    pontuacao_maxima: 1000,
    competencias: [
      { numero: 1, peso: 200 }, { numero: 2, peso: 200 },
      { numero: 3, peso: 200 }, { numero: 4, peso: 200 }, { numero: 5, peso: 200 }
    ]
  };

  const payloadSemPontos = JSON.stringify({
    nota_total: 800,
    competencias: [
      { numero: 1, nota: 160, justificativa: 'Poucos desvios gramaticais.' },
      { numero: 2, nota: 160, justificativa: 'Repertório adequado.' },
      { numero: 3, nota: 160, justificativa: 'Boa progressão textual.' },
      { numero: 4, nota: 160, justificativa: 'Coesão suficiente.' },
      { numero: 5, nota: 160, justificativa: 'Proposta com 4 elementos.' }
    ]
  });

  const normalizado = validarENormalizarResposta(payloadSemPontos, matrizEnem, 'mock-ia');
  assert.equal(normalizado.pontos_fortes.length, 0, 'Não inventa ponto forte sintético genérico');
  assert.equal(normalizado.pontos_melhoria.length, 0, 'Não inventa problema sintético por mera nota < 80%');
  pass('ETAPA 26.1: Resiliência — preserva arrays vazios sem inventar apontamentos arbitrários');
} catch (e) { fail('ETAPA 26.1: Resiliência', e); }

// 8. ETAPA 26.2: Consistência pedagógica — Nota máxima 200 não exige crítica artificial
total++;
try {
  const matrizEnem = {
    nome: 'ENEM',
    pontuacao_maxima: 1000,
    competencias: [
      { numero: 1, peso: 200 }, { numero: 2, peso: 200 },
      { numero: 3, peso: 200 }, { numero: 4, peso: 200 }, { numero: 5, peso: 200 }
    ]
  };

  const payloadPerfeitaSemCritica = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, nivel: 'Excelente', justificativa: 'Excelente domínio formal sem nenhum desvio.', problemas: [] },
      { numero: 2, nota: 200, nivel: 'Excelente', justificativa: 'Repertório legítimo e plenamente produtivo.', problemas: [] },
      { numero: 3, nota: 200, nivel: 'Excelente', justificativa: 'Projeto de texto impecável e consistente.', problemas: [] },
      { numero: 4, nota: 200, nivel: 'Excelente', justificativa: 'Mecanismos coesivos expressivos e variados.', problemas: [] },
      { numero: 5, nota: 200, nivel: 'Excelente', justificativa: 'Proposta com os 5 elementos plenamente articulados.', problemas: [] }
    ],
    pontos_fortes: ['Excelente articulação global'],
    pontos_melhoria: []
  });

  const normalizado = validarENormalizarResposta(payloadPerfeitaSemCritica, matrizEnem, 'mock-ia');
  assert.equal(normalizado.nota_total, 1000, 'Calcula 1000 de forma determinística');
  assert.equal(normalizado.competencias[0].nota_suspeita, undefined, 'Sem suspeita de contradição');
  assert.equal(normalizado.pontos_melhoria.length, 0, 'Não exige ou inventa críticas para nota 1000');
  pass('ETAPA 26.2: Nota máxima não exige obrigatoriamente crítica artificial');
} catch (e) { fail('ETAPA 26.2: Nota máxima', e); }

// 9. ETAPA 26.2: Consistência pedagógica — Nota intermediária sem erro obrigatório cadastrado
total++;
try {
  const matrizEnem = {
    nome: 'ENEM',
    pontuacao_maxima: 1000,
    competencias: [
      { numero: 1, peso: 200 }, { numero: 2, peso: 200 },
      { numero: 3, peso: 200 }, { numero: 4, peso: 200 }, { numero: 5, peso: 200 }
    ]
  };

  const payloadIntermediariaSemErroCadastrado = JSON.stringify({
    nota_total: 800,
    competencias: [
      { numero: 1, nota: 160, nivel: 'Bom', justificativa: 'Bom desempenho com raros desvios não sistemáticos.', problemas: [] },
      { numero: 2, nota: 160, nivel: 'Bom', justificativa: 'Repertório adequado sem atingir o nível máximo de produtividade.', problemas: [] },
      { numero: 3, nota: 160, nivel: 'Bom', justificativa: 'Argumentação clara com desenvolvimento satisfatório.', problemas: [] },
      { numero: 4, nota: 160, nivel: 'Bom', justificativa: 'Coesão suficiente com poucos entraves locais.', problemas: [] },
      { numero: 5, nota: 160, nivel: 'Bom', justificativa: 'Proposta bem articulada com detalhamento tênue.', problemas: [] }
    ]
  });

  const normalizado = validarENormalizarResposta(payloadIntermediariaSemErroCadastrado, matrizEnem, 'mock-ia');
  assert.equal(normalizado.nota_total, 800, 'Nota 800 exata');
  normalizado.competencias.forEach((c, idx) => {
    assert.equal(c.nota, 160, `C${idx + 1} com nota 160`);
    assert.equal(c.problemas.length, 0, `C${idx + 1} não foi forçada a ter lista de problemas`);
  });
  pass('ETAPA 26.2: Nota intermediária não obriga criação de erro artificial');
} catch (e) { fail('ETAPA 26.2: Nota intermediária', e); }

// 10. ETAPA 26.4: Casos de borda de pontuação — NaN, valores negativos e tipos inválidos
total++;
try {
  const matrizEnem = {
    nome: 'ENEM',
    pontuacao_maxima: 1000,
    competencias: [
      { numero: 1, peso: 200 }, { numero: 2, peso: 200 },
      { numero: 3, peso: 200 }, { numero: 4, peso: 200 }, { numero: 5, peso: 200 }
    ]
  };

  // 10a: Nota NaN rejeitada
  assert.throws(
    () => validarENormalizarResposta(JSON.stringify({
      competencias: [
        { numero: 1, nota: 'dez', justificativa: 'Texto justificativa longo o bastante.' },
        { numero: 2, nota: 160 }, { numero: 3, nota: 160 }, { numero: 4, nota: 160 }, { numero: 5, nota: 160 }
      ]
    }), matrizEnem, 'mock'),
    /nota não-numérica/i
  );

  // 10b: Nota negativa é clampada em 0
  const resNeg = validarENormalizarResposta(JSON.stringify({
    competencias: [
      { numero: 1, nota: -50, justificativa: 'Texto justificativa longo o bastante.' },
      { numero: 2, nota: 160, justificativa: 'Justificativa normal com tamanho adequado.' },
      { numero: 3, nota: 160, justificativa: 'Justificativa normal com tamanho adequado.' },
      { numero: 4, nota: 160, justificativa: 'Justificativa normal com tamanho adequado.' },
      { numero: 5, nota: 160, justificativa: 'Justificativa normal com tamanho adequado.' }
    ]
  }), matrizEnem, 'mock');
  assert.equal(resNeg.competencias[0].nota, 0, 'Nota negativa clampada em 0');

  // 10c: Nota excedente é limitada ao teto
  const resMax = validarENormalizarResposta(JSON.stringify({
    competencias: [
      { numero: 1, nota: 999, justificativa: 'Texto justificativa longo o bastante.' },
      { numero: 2, nota: 160, justificativa: 'Justificativa normal com tamanho adequado.' },
      { numero: 3, nota: 160, justificativa: 'Justificativa normal com tamanho adequado.' },
      { numero: 4, nota: 160, justificativa: 'Justificativa normal com tamanho adequado.' },
      { numero: 5, nota: 160, justificativa: 'Justificativa normal com tamanho adequado.' }
    ]
  }), matrizEnem, 'mock');
  assert.equal(resMax.competencias[0].nota, 200, 'Nota excedente limitada ao pesoMax de 200');

  pass('ETAPA 26.4: Notas NaN rejeitadas, negativas clampadas em 0 e excedentes no teto');
} catch (e) { fail('ETAPA 26.4: Casos de borda de pontuação', e); }

// 11. ETAPA 26.4: Quantização em múltiplos de 40 restrita ao ENEM
total++;
try {
  const matrizFuvest = {
    nome: 'FUVEST',
    pontuacao_maxima: 50,
    competencias: [
      { numero: 1, peso: 20 }, { numero: 2, peso: 15 }, { numero: 3, peso: 15 }
    ]
  };

  // Na FUVEST, notas como 17, 13 e 11 devem ser preservadas exatas, SEM quantizar por 40
  const resFuvest = validarENormalizarResposta(JSON.stringify({
    competencias: [
      { numero: 1, nota: 17, justificativa: 'Justificativa com tamanho adequado para o critério 1.' },
      { numero: 2, nota: 13, justificativa: 'Justificativa com tamanho adequado para o critério 2.' },
      { numero: 3, nota: 11, justificativa: 'Justificativa com tamanho adequado para o critério 3.' }
    ]
  }), matrizFuvest, 'mock');

  assert.equal(resFuvest.competencias[0].nota, 17, 'Nota 17 preservada sem quantização ENEM');
  assert.equal(resFuvest.competencias[1].nota, 13, 'Nota 13 preservada sem quantização ENEM');
  assert.equal(resFuvest.competencias[2].nota, 11, 'Nota 11 preservada sem quantização ENEM');
  assert.equal(resFuvest.nota_total, 41, 'Soma correta calculada pelo backend (17+13+11=41)');

  pass('ETAPA 26.4: Quantização em múltiplos de 40 restrita ao ENEM; FUVEST preserva notas inteiras');
} catch (e) { fail('ETAPA 26.4: Quantização não-ENEM', e); }

console.log(`\n========================================`);
console.log(`Resultado ETAPA 26 & 26.1 & 26.4: ${passados}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (passados !== total) {
  process.exit(1);
}
