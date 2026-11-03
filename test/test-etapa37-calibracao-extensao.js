/**
 * test/test-etapa37-calibracao-extensao.js — ETAPA 37: Calibração Pedagógica e Extensão do Texto ENEM
 *
 * Cenários de Teste:
 *  1. analisarExtensaoRedacao: texto com < 20 palavras gera status 'embrionario_insuficiente'.
 *  2. analisarExtensaoRedacao: texto < 50 palavras em parágrafo único gera status 'potencialmente_insuficiente'.
 *  3. analisarExtensaoRedacao: texto < 50 palavras com 8 linhas explícitas NÃO é classificado como insuficiente/eliminatório.
 *  4. analisarExtensaoRedacao: texto < 50 palavras com 7 linhas explícitas NÃO é classificado como inferior a 7 linhas.
 *  5. analisarExtensaoRedacao: texto com ~249 palavras gera status 'abaixo_do_recomendado' no ENEM.
 *  6. analisarExtensaoRedacao: texto com ~310 palavras gera 'abaixo_do_recomendado' com aviso pedagógico reflexivo (não imperativo).
 *  7. analisarExtensaoRedacao: texto com 450 palavras gera status 'adequado'.
 *  8. analisarExtensaoRedacao: texto com 620 palavras (dentro da margem de tolerância) gera status 'adequado'.
 *  9. analisarExtensaoRedacao: texto com 700 palavras gera status 'acima_do_recomendado'.
 * 10. validarENormalizarResposta: retorna objeto `extensao` tipado e estruturado.
 * 11. Anti-contradição C1: nota 200 com 'construções repetitivas' gera nota_suspeita (com 5 competências válidas).
 * 12. Anti-contradição C4: nota 200 com 'pouca variedade de conectivos' gera nota_suspeita.
 * 13. Anti-contradição C5: nota 200 com 'detalhamento genérico' gera nota_suspeita.
 * 14. Anti-contradição C3: nota 200 com 'argumentos genéricos' gera nota_suspeita.
 * 15. Anti-contradição C2: nota 200 com 'repertório restrito' gera nota_suspeita.
 * 16. Falso positivo prevenido: sugestão estilística leve preserva nota 200 sem nota_suspeita.
 * 17. Catálogo de propostas estáticas carrega metadados oficiais da proposta ENEM 2024.
 * 18. Catálogo trata proposta inexistente com retorno null seguro.
 * 19. Prompt de correção inclui aviso de extensão de forma contextualizada sem anulação mecânica.
 * 20. Resolução lógica de pendência no client (Mock CASO 1: ID confirmado).
 * 21. Resolução lógica de pendência no client (Mock CASO 2: SILENT_REJECTION - 0 rows).
 * 22. Resolução lógica de pendência no client (Mock CASO 3: Erro Postgres capturado).
 */

import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import {
  analisarExtensaoRedacao,
  validarENormalizarResposta,
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

console.log('🧪 Iniciando Testes da ETAPA 37: Calibração Pedagógica e Extensão do Texto ENEM...\n');

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

// 1. Texto < 20 palavras gera status 'embrionario_insuficiente'
total++;
try {
  const textoEmbrionario = 'Apenas uma frase curta sem qualquer desenvolvimento dissertativo.';
  const analise = analisarExtensaoRedacao(textoEmbrionario, null, 'enem');
  assert.equal(analise.status, 'embrionario_insuficiente', 'Deve classificar como embrionario_insuficiente');
  assert.ok(analise.observacao_pedagogica.includes('embrionária'), 'Observação deve apontar extensão embrionária');
  pass('Cenário 1: Texto com menos de 20 palavras classificado como embrionario_insuficiente');
} catch (e) { fail('Cenário 1', e); }

// 2. Texto < 50 palavras em parágrafo único (estimativa digital < 7 linhas)
total++;
try {
  // 35 palavras em um único parágrafo sem quebras de linha
  const textoCurto1Paragrafo = Array.from({ length: 35 }, (_, i) => `palavra${i + 1}`).join(' ');
  const analise = analisarExtensaoRedacao(textoCurto1Paragrafo, null, 'enem');
  assert.equal(analise.status, 'potencialmente_insuficiente', 'Deve classificar como potencialmente_insuficiente');
  assert.ok(analise.observacao_pedagogica.includes('inferior a 7 linhas'), 'Deve citar estimativa inferior a 7 linhas');
  assert.ok(!analise.observacao_pedagogica.includes('nota zero automática'), 'Não deve forçar anulação automática no texto');
  pass('Cenário 2: Texto < 50 palavras em parágrafo único classificado como potencialmente_insuficiente (estimativa)');
} catch (e) { fail('Cenário 2', e); }

// 3. Texto < 50 palavras com 8 linhas explícitas NÃO é eliminatório
total++;
try {
  // 48 palavras distribuídas em 8 linhas (6 palavras por linha)
  const linhas = Array.from({ length: 8 }, (_, l) =>
    Array.from({ length: 6 }, (_, p) => `palavra_${l}_${p}`).join(' ')
  );
  const texto8Linhas = linhas.join('\n');
  const analise = analisarExtensaoRedacao(texto8Linhas, null, 'enem');
  assert.notEqual(analise.status, 'potencialmente_insuficiente', 'Não deve ser potencialmente_insuficiente pois tem 8 linhas reais');
  assert.notEqual(analise.status, 'embrionario_insuficiente', 'Não deve ser embrionario_insuficiente');
  assert.equal(analise.status, 'abaixo_do_recomendado', 'Deve ser classificado como abaixo_do_recomendado (< 320 palavras)');
  assert.equal(analise.total_linhas_estimadas >= 7, true, 'Linhas estimadas devem ser >= 7');
  pass('Cenário 3: Texto < 50 palavras com 8 linhas explícitas não é tratado como eliminatório');
} catch (e) { fail('Cenário 3', e); }

// 4. Texto < 50 palavras com 7 linhas explícitas NÃO é inferior a 7 linhas
total++;
try {
  // 42 palavras distribuídas em 7 linhas (6 palavras por linha)
  const linhas = Array.from({ length: 7 }, (_, l) =>
    Array.from({ length: 6 }, (_, p) => `termo_${l}_${p}`).join(' ')
  );
  const texto7Linhas = linhas.join('\n');
  const analise = analisarExtensaoRedacao(texto7Linhas, null, 'enem');
  assert.notEqual(analise.status, 'potencialmente_insuficiente', 'Não deve ser potencialmente_insuficiente com 7 linhas');
  assert.equal(analise.status, 'abaixo_do_recomendado', 'Classificado pedagogicamente como abaixo do recomendado');
  pass('Cenário 4: Texto < 50 palavras com 7 linhas explícitas preservado acima do corte de 7 linhas');
} catch (e) { fail('Cenário 4', e); }

// 5. Texto com 249 palavras gera status 'abaixo_do_recomendado'
total++;
try {
  const palavras = Array.from({ length: 249 }, (_, i) => `palavra${i + 1}`).join(' ');
  const analise = analisarExtensaoRedacao(palavras, { palavras_recomendadas: 'Entre 350 e 600 palavras (25 a 30 linhas)' }, 'enem');
  assert.equal(analise.status, 'abaixo_do_recomendado', 'Deve classificar como abaixo_do_recomendado');
  assert.equal(analise.total_palavras, 249, 'Total de palavras deve ser 249');
  assert.ok(analise.observacao_pedagogica.includes('abaixo da faixa recomendada'), 'Observação deve orientar sobre extensão');
  pass('Cenário 5: Texto com 249 palavras classificado como abaixo_do_recomendado');
} catch (e) { fail('Cenário 5', e); }

// 6. Texto com aproximadamente 310 palavras gera 'abaixo_do_recomendado' com tom reflexivo
total++;
try {
  const palavras310 = Array.from({ length: 310 }, (_, i) => `palavra${i + 1}`).join(' ');
  const analise = analisarExtensaoRedacao(palavras310, null, 'enem');
  assert.equal(analise.status, 'abaixo_do_recomendado', '310 palavras é abaixo_do_recomendado (< 320)');
  assert.ok(!analise.observacao_pedagogica.includes('nota zero'), 'Não deve sugerir nota zero');
  pass('Cenário 6: Texto com ~310 palavras classificado como abaixo_do_recomendado com orientação reflexiva');
} catch (e) { fail('Cenário 6', e); }

// 7. Texto com 450 palavras gera status 'adequado'
total++;
try {
  const palavras = Array.from({ length: 450 }, (_, i) => `palavra${i + 1}`).join(' ');
  const analise = analisarExtensaoRedacao(palavras, null, 'enem');
  assert.equal(analise.status, 'adequado', 'Deve classificar como adequado');
  assert.equal(analise.total_palavras, 450, 'Total de palavras deve ser 450');
  pass('Cenário 7: Texto de 450 palavras classificado como adequado');
} catch (e) { fail('Cenário 7', e); }

// 8. Texto com 620 palavras (dentro do intervalo de tolerância) gera status 'adequado'
total++;
try {
  const palavras620 = Array.from({ length: 620 }, (_, i) => `palavra${i + 1}`).join(' ');
  const analise = analisarExtensaoRedacao(palavras620, null, 'enem');
  assert.equal(analise.status, 'adequado', '620 palavras está dentro da margem de tolerância [320, 650]');
  pass('Cenário 8: Texto com 620 palavras classificado como adequado (tolerância)');
} catch (e) { fail('Cenário 8', e); }

// 9. Texto com 700 palavras gera status 'acima_do_recomendado'
total++;
try {
  const palavras = Array.from({ length: 700 }, (_, i) => `palavra${i + 1}`).join(' ');
  const analise = analisarExtensaoRedacao(palavras, null, 'enem');
  assert.equal(analise.status, 'acima_do_recomendado', 'Deve classificar como acima_do_recomendado');
  assert.ok(analise.observacao_pedagogica.includes('acima do limite'), 'Observação deve alertar para concisão');
  pass('Cenário 9: Texto de 700 palavras classificado como acima_do_recomendado');
} catch (e) { fail('Cenário 9', e); }

// 10. validarENormalizarResposta retorna objeto extensao devidamente preenchido
total++;
try {
  const payloadValido = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Excelente domínio da norma culta formal.' },
      { numero: 2, nota: 200, justificativa: 'Repertório legítimo e produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto estratégico.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada inter e intraparágrafos.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos.' }
    ]
  });
  const textoSimulado = Array.from({ length: 400 }, (_, i) => `palavra${i}`).join(' ');
  const res = validarENormalizarResposta(payloadValido, matrizEnem, 'mock-ia', textoSimulado, { palavras_recomendadas: 'Entre 350 e 600 palavras' }, 'enem');
  assert.ok(res.extensao, 'Objeto extensao deve estar presente na resposta');
  assert.equal(res.extensao.total_palavras, 400, 'Total de palavras no objeto extensao deve ser 400');
  assert.equal(res.extensao.status, 'adequado', 'Status deve ser adequado');
  pass('Cenário 10: validarENormalizarResposta retorna objeto extensao íntegro');
} catch (e) { fail('Cenário 10', e); }

// 11. Anti-contradição C1: nota 200 com 'construções repetitivas'
total++;
try {
  const payloadC1 = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'O candidato apresenta bom domínio, porém com construções repetitivas no desenvolvimento.' },
      { numero: 2, nota: 200, justificativa: 'Repertório legítimo e produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto estratégico.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada inter e intraparágrafos.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos.' }
    ]
  });
  const res = validarENormalizarResposta(payloadC1, matrizEnem, 'mock-ia', 'Texto teste');
  assert.equal(res.competencias[0].nota_suspeita, true, 'C1 com construções repetitivas deve ser nota_suspeita');
  assert.ok(res.competencias[0].aviso_contradicao.includes('construções repetitivas'), 'Aviso deve citar a contradição');
  pass('Cenário 11: Nota 200 em C1 com "construções repetitivas" detectada como nota_suspeita');
} catch (e) { fail('Cenário 11', e); }

// 12. Anti-contradição C4: nota 200 com 'pouca variedade de conectivos'
total++;
try {
  const payloadC4 = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Excelente domínio gramatical.' },
      { numero: 2, nota: 200, justificativa: 'Repertório legítimo e produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto estratégico.' },
      { numero: 4, nota: 200, justificativa: 'Uso satisfatório, contudo há pouca variedade de conectivos nos períodos.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos.' }
    ]
  });
  const res = validarENormalizarResposta(payloadC4, matrizEnem, 'mock-ia', 'Texto teste');
  assert.equal(res.competencias[3].nota_suspeita, true, 'C4 com pouca variedade de conectivos deve ser nota_suspeita');
  assert.ok(res.competencias[3].aviso_contradicao.includes('pouca variedade de conectivos'), 'Aviso deve citar a contradição');
  pass('Cenário 12: Nota 200 em C4 com "pouca variedade de conectivos" detectada como nota_suspeita');
} catch (e) { fail('Cenário 12', e); }

// 13. Anti-contradição C5: nota 200 com 'detalhamento genérico'
total++;
try {
  const payloadC5 = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Excelente domínio gramatical.' },
      { numero: 2, nota: 200, justificativa: 'Repertório legítimo e produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto estratégico.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada.' },
      { numero: 5, nota: 200, justificativa: 'Apresenta proposta completa, mas com detalhamento genérico e intervenção genérica.' }
    ]
  });
  const res = validarENormalizarResposta(payloadC5, matrizEnem, 'mock-ia', 'Texto teste');
  assert.equal(res.competencias[4].nota_suspeita, true, 'C5 com detalhamento genérico deve ser nota_suspeita');
  assert.ok(res.competencias[4].aviso_contradicao.includes('genérico') || res.competencias[4].aviso_contradicao.includes('genérica'), 'Aviso deve citar a contradição');
  pass('Cenário 13: Nota 200 em C5 com "detalhamento genérico" detectada como nota_suspeita');
} catch (e) { fail('Cenário 13', e); }

// 14. Anti-contradição C3: nota 200 com 'argumentos genéricos'
total++;
try {
  const payloadC3 = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Excelente domínio gramatical.' },
      { numero: 2, nota: 200, justificativa: 'Repertório legítimo e produtivo.' },
      { numero: 3, nota: 200, justificativa: 'Defende ponto de vista, porém com argumentos genéricos e pouco aprofundamento.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos.' }
    ]
  });
  const res = validarENormalizarResposta(payloadC3, matrizEnem, 'mock-ia', 'Texto teste');
  assert.equal(res.competencias[2].nota_suspeita, true, 'C3 com argumentos genéricos deve ser nota_suspeita');
  pass('Cenário 14: Nota 200 em C3 com "argumentos genéricos" detectada como nota_suspeita');
} catch (e) { fail('Cenário 14', e); }

// 15. Anti-contradição C2: nota 200 com 'repertório restrito'
total++;
try {
  const payloadC2 = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Excelente domínio gramatical.' },
      { numero: 2, nota: 200, justificativa: 'Aborda o tema com repertório restrito e pouco articulado.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto bom.' },
      { numero: 4, nota: 200, justificativa: 'Coesão diversificada.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos.' }
    ]
  });
  const res = validarENormalizarResposta(payloadC2, matrizEnem, 'mock-ia', 'Texto teste');
  assert.equal(res.competencias[1].nota_suspeita, true, 'C2 com repertório restrito deve ser nota_suspeita');
  pass('Cenário 15: Nota 200 em C2 com "repertório restrito" detectada como nota_suspeita');
} catch (e) { fail('Cenário 15', e); }

// 16. Falso positivo prevenido: sugestão estilística leve preserva nota 200
total++;
try {
  const payloadLeve = JSON.stringify({
    nota_total: 1000,
    competencias: [
      { numero: 1, nota: 200, justificativa: 'Excelente domínio da norma padrão. Como sugestão pedagógica para textos futuros, pode explorar sinônimos literários.' },
      { numero: 2, nota: 200, justificativa: 'Repertório legítimo e produtivo plenamente articulado.' },
      { numero: 3, nota: 200, justificativa: 'Projeto de texto impecável.' },
      { numero: 4, nota: 200, justificativa: 'Coesão fluida e rica.' },
      { numero: 5, nota: 200, justificativa: 'Proposta completa com os 5 elementos e detalhamento exemplar.' }
    ]
  });
  const res = validarENormalizarResposta(payloadLeve, matrizEnem, 'mock-ia', 'Texto teste');
  assert.equal(res.competencias[0].nota_suspeita, undefined, 'Sugestão estilística leve não deve gerar nota_suspeita');
  pass('Cenário 16: Sugestão pedagógica leve preserva nota máxima sem falso positivo');
} catch (e) { fail('Cenário 16', e); }

// 17. Catálogo de propostas estáticas lê dados oficiais
total++;
try {
  const caminhoJson = path.resolve('src/data/propostas-redacao.json');
  assert.ok(fs.existsSync(caminhoJson), 'Arquivo propostas-redacao.json deve existir');
  const catalogo = JSON.parse(fs.readFileSync(caminhoJson, 'utf8'));
  const prop2024 = catalogo.propostas.find(p => p.id === 'prop-enem-2024');
  assert.ok(prop2024, 'Proposta prop-enem-2024 deve existir');
  assert.ok(prop2024.palavras_recomendadas.includes('350 e 600'), 'Deve conter recomendação de 350 a 600 palavras');
  pass('Cenário 17: Catálogo de propostas estáticas validado com sucesso');
} catch (e) { fail('Cenário 17', e); }

// 18. Integração de catálogo: proposta inexistente retorna null sem erro
total++;
try {
  const caminhoJson = path.resolve('src/data/propostas-redacao.json');
  const catalogo = JSON.parse(fs.readFileSync(caminhoJson, 'utf8'));
  const mapa = new Map(catalogo.propostas.map(p => [p.id, p]));
  const propInexistente = mapa.get('prop-inexistente-999') || null;
  assert.equal(propInexistente, null, 'Proposta inexistente deve retornar null');
  pass('Cenário 18: Catálogo trata proposta inexistente com retorno null seguro');
} catch (e) { fail('Cenário 18', e); }

// 19. Integração de catálogo: inclusão formal no prompt sem anulação mecânica por palavras
total++;
try {
  const srcAi = fs.readFileSync('api/_ai-service.js', 'utf8');
  assert.ok(srcAi.includes('secaoProposta'), 'Prompt inclui secaoProposta');
  assert.ok(srcAi.includes('avisoExtensaoPrompt'), 'Prompt inclui avisoExtensaoPrompt');
  assert.ok(srcAi.includes('Não aplique anulação mecânica baseada apenas em estimativa de palavras'), 'Regra 5 não aplica anulação mecânica por palavras');
  pass('Cenário 19: Prompt inclui proposta e orientações contextuais sem penalização mecânica');
} catch (e) { fail('Cenário 19', e); }

// ─────────────────────────────────────────────────────────────────────────────
// CENÁRIOS 20, 21 e 22: Testes de Lógica de Resolução de Pendência no Client JS
// NOTA: Estes testes verificam estritamente as ramificações lógicas booleanas
// utilizadas no cliente JS para interpretar respostas de persistência.
// NÃO constituem teste de integração real com a infraestrutura Supabase/PostgREST.
// ─────────────────────────────────────────────────────────────────────────────

// 20. Resolução lógica no client: Caso 1 - Sucesso confirmado com ID
total++;
try {
  const mockInsertSucesso = { data: { id: 'aval-uuid-123' }, error: null };
  const persistido = !mockInsertSucesso.error && !!mockInsertSucesso.data?.id;
  assert.equal(persistido, true, 'CASO 1: ID retornado confirma persistência');
  pass('Cenário 20: Lógica Client CASO 1 (ID confirmado -> persistido_no_banco = true)');
} catch (e) { fail('Cenário 20', e); }

// 21. Resolução lógica no client: Caso 2 - Rejeição silenciosa (0 rows, sem erro)
total++;
try {
  const mockInsertSilencioso = { data: null, error: null };
  const persistido = !mockInsertSilencioso.error && !!mockInsertSilencioso.data?.id;
  const pendencia = (!mockInsertSilencioso.error && !mockInsertSilencioso.data?.id) ? { code: 'SILENT_REJECTION' } : null;
  assert.equal(persistido, false, 'CASO 2: persistido deve ser false');
  assert.equal(pendencia?.code, 'SILENT_REJECTION', 'CASO 2: pendência identificada como SILENT_REJECTION');
  pass('Cenário 21: Lógica Client CASO 2 (sem erro e sem ID -> SILENT_REJECTION)');
} catch (e) { fail('Cenário 21', e); }

// 22. Resolução lógica no client: Caso 3 - Erro explícito de RLS/banco
total++;
try {
  const mockInsertErro = { data: null, error: { code: '42501', message: 'permission denied for table redacao_avaliacoes' } };
  const persistido = !mockInsertErro.error && !!mockInsertErro.data?.id;
  const pendencia = mockInsertErro.error ? { code: mockInsertErro.error.code, message: mockInsertErro.error.message } : null;
  assert.equal(persistido, false, 'CASO 3: persistido deve ser false');
  assert.equal(pendencia?.code, '42501', 'CASO 3: código do Postgres capturado');
  pass('Cenário 22: Lógica Client CASO 3 (erro explícito capturado e repassado)');
} catch (e) { fail('Cenário 22', e); }

console.log(`\n========================================`);
console.log(`Resultado ETAPA 37: ${passados}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (passados !== total) {
  process.exit(1);
}
