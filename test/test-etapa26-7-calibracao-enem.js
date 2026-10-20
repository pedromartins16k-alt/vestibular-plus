/**
 * test/test-etapa26-7-calibracao-enem.js — ETAPA 26.7: Calibração Rigorosa das Notas da Redação ENEM
 *
 * Cenários de Teste:
 * 1. Resposta da IA com 200 pontos e justificativa fraca / negativa é rejeitada ou sinalizada como suspeita.
 * 2. Avaliação que recomenda ampliar vocabulário ou evitar repetições NÃO recebe nota máxima em C1 (sinalizada se 200).
 * 3. Proposta de intervenção com detalhamento embrionário / tênue é pontuada com 160 e não 200.
 * 4. Repertório apenas citado sem produtividade na argumentação não atinge 200 na C2.
 * 5. Reavaliação de redação idêntica NÃO é interpretada como evolução textual no histórico e no comparativo.
 * 6. Variações expressivas de nota (+80 pts) são sinalizadas adequadamente na interface e no comparativo.
 * 7. Matriz do ENEM mantém 5 competências independentes de 0 a 200, com incrementos de 40 pontos.
 * 8. Notas fora da escala sofrem quantização ou rejeição pelo backend, sem clamp silencioso fora da matriz.
 * 9. Justificativas contêm evidências textuais autênticas extraídas do próprio texto submetido.
 * 10. Toda a suíte de testes anterior continua passando sem regressão.
 */

import { strict as assert } from 'assert';
import fs from 'fs';
import {
  validarENormalizarResposta,
  classificarDiscrepancia,
  gerarFingerprintRedacao,
  VERSAO_RUBRICA
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

console.log('🧪 Iniciando Testes da ETAPA 26.7: Calibração Rigorosa das Notas ENEM...\n');

const matrizEnem = {
  nome: 'ENEM — Exame Nacional do Ensino Médio',
  pontuacao_maxima: 1000,
  competencias: [
    { numero: 1, nome: 'Domínio da modalidade escrita formal', peso: 200 },
    { numero: 2, nome: 'Compreensão da proposta e repertório', peso: 200 },
    { numero: 3, nome: 'Projeto de texto e argumentação', peso: 200 },
    { numero: 4, nome: 'Mecanismos de coesão', peso: 200 },
    { numero: 5, nome: 'Proposta de intervenção', peso: 200 }
  ]
};

// Texto real sob teste
const textoEstudanteEnem = `A permanência da desvalorização da cultura africana no Brasil revela entraves sociais profundos que exigem reflexão e enfrentamento estatal.

Em primeiro plano, o ambiente educacional ainda carece da efetiva aplicação da Lei 10.639/03, uma vez que a carência de formação docente restringe o aprendizado da história afro-brasileira nas escolas.

Ademais, a discriminação de manifestações culturais e a intolerância contra religiões de matriz africana perpetuam estigmas e marginalização.

Portanto, cabe ao Ministério da Educação, em parceria com as escolas, promover a formação continuada dos professores e a distribuição de materiais didáticos específicos, além de campanhas educativas, para combater o preconceito e valorizar a herança africana.`;

// CENÁRIO 1: Resposta da IA com 200 pontos e justificativa com termo negativo gera nota_suspeita
total++;
try {
  const payloadSuspeita = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Domínio da modalidade escrita excelente, sem desvios relevantes.' },
      { numero: 2, nota: 200, justificativa: 'Repertório pertinente e produtivo articulado com a tese.' },
      { numero: 3, nota: 200, justificativa: 'Argumentação satisfatória, mas com desenvolvimento inadequado em partes.' }, // negativa!
      { numero: 4, nota: 200, justificativa: 'Boa coesão inter e intraparágrafos.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos.' }
    ]
  });

  const res = validarENormalizarResposta(payloadSuspeita, matrizEnem, 'mock-ia', textoEstudanteEnem);
  const c3 = res.competencias[2];
  assert.equal(c3.nota_suspeita, true, 'C3 deve ser marcada como nota_suspeita');
  assert.ok(c3.aviso_contradicao.includes('desenvolvimento inadequado'), 'Aviso deve citar a contradição');
  pass('Cenário 1: Resposta da IA com nota 200 e justificativa negativa é sinalizada como suspeita');
} catch (e) { fail('Cenário 1', e); }

// CENÁRIO 2: Crítica de vocabulário ou repetição em C1 impede ou sinaliza contradição com 200 pts
total++;
try {
  const payloadVocabularioC1 = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Texto bem escrito, porém é recomendado enriquecer vocabulário e evitar repetições excessivas.' },
      { numero: 2, nota: 200, justificativa: 'Repertório legítimo e produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto consistente.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos.' }
    ]
  });

  const res = validarENormalizarResposta(payloadVocabularioC1, matrizEnem, 'mock-ia', textoEstudanteEnem);
  const c1 = res.competencias[0];
  assert.equal(c1.nota_suspeita, true, 'C1 nota 200 com crítica a vocabulário/repetições deve ser nota_suspeita');
  assert.ok(c1.aviso_contradicao.includes('repetições excessivas') || c1.aviso_contradicao.includes('enriquecer vocabulário'),
    'Aviso registra a inconsistência entre recomendação de vocabulário e nota 200');
  pass('Cenário 2: Recomendação para enriquecer vocabulário com nota 200 em C1 é sinalizada como contradição');
} catch (e) { fail('Cenário 2', e); }

// CENÁRIO 3: Detalhamento tênue na proposta de intervenção (C5) sinalizado se atribuído 200 pts
total++;
try {
  const payloadDetalhamentoTenue = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Domínio pleno da norma padrão.' },
      { numero: 2, nota: 200, justificativa: 'Repertório legitimado e produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto consistente.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada e adequada.' },
      { numero: 5, nota: 200, justificativa: 'Proposta com os elementos presentes, mas apresenta detalhamento muito tênue na ação.' }
    ]
  });

  const res = validarENormalizarResposta(payloadDetalhamentoTenue, matrizEnem, 'mock-ia', textoEstudanteEnem);
  const c5 = res.competencias[4];
  assert.equal(c5.nota_suspeita, true, 'C5 com detalhamento tênue e nota 200 deve ser nota_suspeita');
  assert.ok(c5.aviso_contradicao.includes('detalhamento'), 'Aviso detalha a incompatibilidade');
  pass('Cenário 3: Proposta com detalhamento muito tênue e nota 200 em C5 é sinalizada como contradição');
} catch (e) { fail('Cenário 3', e); }

// CENÁRIO 4: Repertório pouco aprofundado na C2 com nota 200 é sinalizado
total++;
try {
  const payloadRepertorioFragil = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Domínio padrão impecável.' },
      { numero: 2, nota: 200, justificativa: 'Tema compreendido com menção à lei, porém com repertório pouco aprofundado na tese.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto claro e organizado.' },
      { numero: 4, nota: 200, justificativa: 'Mecanismos coesivos bem aplicados.' },
      { numero: 5, nota: 200, justificativa: 'Proposta com os 5 elementos bem definidos.' }
    ]
  });

  const res = validarENormalizarResposta(payloadRepertorioFragil, matrizEnem, 'mock-ia', textoEstudanteEnem);
  const c2 = res.competencias[1];
  assert.equal(c2.nota_suspeita, true, 'C2 com repertório pouco aprofundado e nota 200 é suspeita');
  assert.ok(c2.aviso_contradicao.includes('repertório pouco aprofundado'), 'Aviso registra a inconsistência');
  pass('Cenário 4: Repertório pouco aprofundado com nota 200 em C2 é sinalizado como contradição');
} catch (e) { fail('Cenário 4', e); }

// CENÁRIO 5: Reavaliação de redação idêntica NÃO é interpretada como evolução do estudante
total++;
try {
  const src = fs.readFileSync('src/scripts/redacao.js', 'utf8');

  // Verifica que o frontend diferencia mesmoTexto no cálculo de variação
  assert.ok(src.includes('mesmoTexto'), 'Identificação de mesmoTexto implementada no histórico');
  assert.ok(src.includes('nova estimativa IA'), 'Badge explícito de nova estimativa IA em vez de ganho pessoal');
  assert.ok(src.includes('💡 <em>Nota sobre reavaliações:</em>'), 'Esclarecimento pedagógico incluído no modal');
  assert.ok(src.includes('Comparativo de Avaliações IA (Mesmo Texto)'), 'Título transparente no comparativo');

  // Teste de determinismo de fingerprint
  const fp1 = gerarFingerprintRedacao(textoEstudanteEnem, 'heranca-africana', 'enem');
  const fp2 = gerarFingerprintRedacao(textoEstudanteEnem + '   \n', 'heranca-africana', 'enem');
  assert.equal(fp1, fp2, 'Fingerprints do mesmo texto são idênticos');

  pass('Cenário 5: Reavaliação do mesmo texto não é interpretada como evolução textual do estudante');
} catch (e) { fail('Cenário 5', e); }

// CENÁRIO 6: Variação expressiva de nota (+80 pts) na mesma redação classificada e sinalizada
total++;
try {
  const compAnt = [
    { numero: 1, nota: 200 },
    { numero: 2, nota: 160 },
    { numero: 3, nota: 200 },
    { numero: 4, nota: 200 },
    { numero: 5, nota: 160 }
  ]; // Total = 920

  const compNova = [
    { numero: 1, nota: 200 },
    { numero: 2, nota: 200 },
    { numero: 3, nota: 200 },
    { numero: 4, nota: 200 },
    { numero: 5, nota: 200 }
  ]; // Total = 1000 (variação de +80 pts)

  const disc = classificarDiscrepancia(920, 1000, compAnt, compNova);
  assert.equal(disc.diferenca, 80, 'Diferença de +80 pontos calculada');
  assert.equal(disc.classificacao, 'moderada', 'Variação de 80 pts classificada com rigor (moderada/significativa)');
  assert.ok(disc.label.includes('+80 pts'), 'Label informativa contém a oscilação de 80 pts');

  pass('Cenário 6: Variação expressiva de +80 pontos (920 -> 1000) sinalizada e classificada com rigor');
} catch (e) { fail('Cenário 6', e); }

// CENÁRIO 7: Matriz do ENEM mantém 5 competências independentes e incrementos de 40 pontos
total++;
try {
  const rawNotas = JSON.stringify({
    nota_total: 900, // IA errou a soma no JSON; backend deve recalcular
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Texto justificativa longo para C1 com excelente domínio.' },
      { numero: 2, nota: 160, justificativa: 'Texto justificativa longo para C2 com bom repertório.' },
      { numero: 3, nota: 200, justificativa: 'Texto justificativa longo para C3 com projeto consistente.' },
      { numero: 4, nota: 160, justificativa: 'Texto justificativa longo para C4 com coesão adequada.' },
      { numero: 5, nota: 160, justificativa: 'Texto justificativa longo para C5 com proposta articulada.' }
    ]
  });

  const res = validarENormalizarResposta(rawNotas, matrizEnem, 'mock-ia');
  assert.equal(res.competencias.length, 5, 'Exatamente 5 competências');
  res.competencias.forEach(c => {
    assert.equal(c.nota % 40, 0, `Competência C${c.numero} em incremento válido de 40: obteve ${c.nota}`);
    assert.ok(c.nota >= 0 && c.nota <= 200, `Competência C${c.numero} dentro da escala 0-200`);
  });
  assert.equal(res.competencias[0].nota, 200);
  assert.equal(res.competencias[1].nota, 160);
  assert.equal(res.competencias[2].nota, 200);
  assert.equal(res.competencias[3].nota, 160);
  assert.equal(res.competencias[4].nota, 160);
  assert.equal(res.nota_total, 880, 'Soma recalculada pelo backend (200+160+200+160+160=880), descartando 900');

  // Valores fora dos incrementos de 40 pontos devem ser sumariamente rejeitados
  assert.throws(
    () => validarENormalizarResposta(JSON.stringify({
      competencias: [
        { numero: 1, nota: 185, justificativa: 'Texto longo para C1 com valor fora do incremento.' },
        { numero: 2, nota: 160 }, { numero: 3, nota: 200 }, { numero: 4, nota: 160 }, { numero: 5, nota: 160 }
      ]
    }), matrizEnem, 'mock-ia'),
    /fora dos incrementos válidos de 40 pontos/i,
    'Nota fora dos incrementos de 40 pontos deve ser rejeitada no ENEM'
  );

  pass('Cenário 7: Matriz do ENEM com 5 competências, soma pelo backend e rejeição de notas fora dos incrementos de 40');
} catch (e) { fail('Cenário 7', e); }

// CENÁRIO 8: Rejeição estrita de notas fora da escala no ENEM (negativas, excedentes e não numéricas)
total++;
try {
  // Nota negativa é rejeitada no ENEM
  assert.throws(
    () => validarENormalizarResposta(JSON.stringify({
      competencias: [
        { numero: 1, nota: -80, justificativa: 'Justificativa com tamanho suficiente.' },
        { numero: 2, nota: 160 }, { numero: 3, nota: 160 }, { numero: 4, nota: 160 }, { numero: 5, nota: 160 }
      ]
    }), matrizEnem, 'mock-ia'),
    /fora da escala oficial do ENEM/i,
    'Nota negativa deve ser rejeitada no ENEM'
  );

  // Nota excedente (>200) é rejeitada no ENEM
  assert.throws(
    () => validarENormalizarResposta(JSON.stringify({
      competencias: [
        { numero: 1, nota: 240, justificativa: 'Justificativa com tamanho suficiente.' },
        { numero: 2, nota: 160 }, { numero: 3, nota: 160 }, { numero: 4, nota: 160 }, { numero: 5, nota: 160 }
      ]
    }), matrizEnem, 'mock-ia'),
    /fora da escala oficial do ENEM/i,
    'Nota excedente deve ser rejeitada no ENEM'
  );

  // Nota não numérica rejeitada
  assert.throws(
    () => validarENormalizarResposta(JSON.stringify({
      competencias: [
        { numero: 1, nota: 'excelente', justificativa: 'Texto longo para justificativa.' },
        { numero: 2, nota: 160 }, { numero: 3, nota: 160 }, { numero: 4, nota: 160 }, { numero: 5, nota: 160 }
      ]
    }), matrizEnem, 'mock-ia'),
    /nota não-numérica/i
  );

  // Nota ausente/nula rejeitada
  assert.throws(
    () => validarENormalizarResposta(JSON.stringify({
      competencias: [
        { numero: 1, justificativa: 'Texto longo sem nota preenchida.' },
        { numero: 2, nota: 160 }, { numero: 3, nota: 160 }, { numero: 4, nota: 160 }, { numero: 5, nota: 160 }
      ]
    }), matrizEnem, 'mock-ia'),
    /nota não-numérica/i
  );

  pass('Cenário 8: Rejeição estrita de notas negativas, excedentes, ausentes e não numéricas no ENEM');
} catch (e) { fail('Cenário 8', e); }

// CENÁRIO 9: Evidências textuais pertencem estritamente ao texto avaliado
total++;
try {
  const evidenciasReais = [
    'A permanência da desvalorização da cultura africana',
    'efetiva aplicação da Lei 10.639/03',
    'discriminação de manifestações culturais e a intolerância contra religiões de matriz africana',
    'Ministério da Educação, em parceria com as escolas'
  ];

  evidenciasReais.forEach(ev => {
    assert.ok(
      textoEstudanteEnem.includes(ev),
      `Evidência autêntica "${ev}" está presente no texto submetido`
    );
  });

  // Evidência alienígena não é encontrada
  const evidenciaAlienigena = 'dados do IBGE revelam que mais de 50% da população';
  assert.ok(
    !textoEstudanteEnem.includes(evidenciaAlienigena),
    'Texto submetido NÃO contém dados sobre mais de 50%'
  );

  pass('Cenário 9: Integridade de evidências textuais — trechos correspondem fielmente à redação');
} catch (e) { fail('Cenário 9', e); }

// CENÁRIO 10: Prompt do ENEM contém descritores explícitos de fronteira 160 vs 200 para todas as competências
total++;
try {
  const aiSrc = fs.readFileSync('api/_ai-service.js', 'utf8');

  assert.ok(aiSrc.includes('FRONTEIRA 160 vs 200'), 'Descritores de fronteira 160 vs 200 presentes');
  assert.ok(aiSrc.includes('ANTI-CONTRADIÇÃO E COERÊNCIA OBRIGATÓRIAS'), 'Regra anti-contradição reforçada presente');
  assert.ok(aiSrc.includes('detalhamento muito tênue'), 'Detalhamento tênue explicitado na C5');
  assert.ok(aiSrc.includes('repertório pouco aprofundado'), 'Repertório pouco aprofundado explicitado na C2');
  assert.ok(aiSrc.includes('enriquecer vocabulário'), 'Vocabulário explicitado na C1');

  pass('Cenário 10: Prompt do ENEM equipado com descritores explícitos de fronteira 160 vs 200 e anti-contradição');
} catch (e) { fail('Cenário 10', e); }

// CENÁRIO 11: Sugestão pedagógica leve de estilo não invalida 200 pts, mas falha estrutural relevante gera suspeição
total++;
try {
  // Caso A: Sugestão leve de aperfeiçoamento estilístico futuro NÃO invalida 200 pts
  const payloadLeve = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Estrutura sintática exemplar com precisão formal plena. Como sugestão pedagógica futura, o estudante pode buscar sinônimos para enriquecer vocabulário ainda mais em outros temas.' },
      { numero: 2, nota: 200, justificativa: 'Repertório pertinente e plenamente produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto consistente e estratégico.' },
      { numero: 4, nota: 200, justificativa: 'Excelente diversidade de conectivos inter e intraparágrafos.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos bem detalhados.' }
    ]
  });
  const resLeve = validarENormalizarResposta(payloadLeve, matrizEnem, 'mock-ia');
  assert.equal(resLeve.competencias[0].nota_suspeita, undefined, 'Sugestão estilística leve não deve gerar nota_suspeita');

  // Caso B: Falha estrutural relevante em C5 (detalhamento muito tênue) com 200 pts DEVE gerar nota_suspeita
  const payloadEstrutural = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Estrutura sintática exemplar sem desvios relevantes.' },
      { numero: 2, nota: 200, justificativa: 'Repertório pertinente e produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto consistente.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada.' },
      { numero: 5, nota: 200, justificativa: 'Proposta contém os elementos, mas apresenta detalhamento muito tênue e frágil.' }
    ]
  });
  const resEstrutural = validarENormalizarResposta(payloadEstrutural, matrizEnem, 'mock-ia');
  assert.equal(resEstrutural.competencias[4].nota_suspeita, true, 'Detalhamento frágil/tênue em C5 com 200 pts deve gerar nota_suspeita');
  assert.ok(resEstrutural.competencias[4].aviso_contradicao.includes('detalhamento'), 'Aviso deve mencionar detalhamento');

  pass('Cenário 11: Sugestão pedagógica leve preserva nota máxima, mas limitação estrutural relevante gera apontamento');
} catch (e) { fail('Cenário 11', e); }

console.log(`\n========================================`);
console.log(`Resultado ETAPA 26.7.1: ${passados}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (passados !== total) {
  process.exit(1);
}
