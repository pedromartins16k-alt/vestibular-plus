-- =========================================================================
-- VESTIBULAR+ : SCRIPT DE QUESTÕES NIVELADAS POR TEMA E DIFICULDADE
-- Distribuição: 3 fáceis, 2 médias, 3 difíceis, 3 gênio
-- Execute no SQL Editor do Supabase (jruyyzftoplcobketrsf)
-- =========================================================================

-- MATEMÁTICA: Porcentagem e juros
INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um produto que custava R$ 200,00 sofreu um aumento de 15%. Qual o novo valor do produto?$q$,
'[{"letra":"A","texto":"R$ 215,00"},{"letra":"B","texto":"R$ 225,00"},{"letra":"C","texto":"R$ 230,00"},{"letra":"D","texto":"R$ 235,00"},{"letra":"E","texto":"R$ 240,00"}]'::jsonb,
'C', $q$15% de 200 = 30. Logo 200 + 30 = R$ 230,00.$q$, 'facil', 'ENEM', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Se uma loja oferece 20% de desconto à vista em uma camiseta de R$ 80,00, qual o valor a ser pago?$q$,
'[{"letra":"A","texto":"R$ 60,00"},{"letra":"B","texto":"R$ 64,00"},{"letra":"C","texto":"R$ 68,00"},{"letra":"D","texto":"R$ 70,00"},{"letra":"E","texto":"R$ 72,00"}]'::jsonb,
'B', $q$Desconto = 20% de 80 = 16. Valor final = 80 - 16 = R$ 64,00.$q$, 'facil', 'Vestibulares', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Uma quantia de R$ 1.000,00 aplicada a juros simples de 2% ao mês durante 5 meses rende quanto de juros?$q$,
'[{"letra":"A","texto":"R$ 50,00"},{"letra":"B","texto":"R$ 100,00"},{"letra":"C","texto":"R$ 150,00"},{"letra":"D","texto":"R$ 200,00"},{"letra":"E","texto":"R$ 250,00"}]'::jsonb,
'B', $q$J = C * i * t = 1000 * 0,02 * 5 = R$ 100,00.$q$, 'facil', 'ENEM', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um investidor aplica R$ 5.000,00 a juros compostos de 10% ao ano. Ao final de 2 anos, qual será o montante acumulado?$q$,
'[{"letra":"A","texto":"R$ 5.500,00"},{"letra":"B","texto":"R$ 6.000,00"},{"letra":"C","texto":"R$ 6.050,00"},{"letra":"D","texto":"R$ 6.100,00"},{"letra":"E","texto":"R$ 6.250,00"}]'::jsonb,
'C', $q$M = 5000 * (1,10)^2 = 5000 * 1,21 = R$ 6.050,00.$q$, 'medio', 'FUVEST', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Dois aumentos sucessivos de 20% e 30% equivalem a um único aumento de:$q$,
'[{"letra":"A","texto":"50%"},{"letra":"B","texto":"54%"},{"letra":"C","texto":"56%"},{"letra":"D","texto":"60%"},{"letra":"E","texto":"62%"}]'::jsonb,
'C', $q$Fator acumulado = 1,20 * 1,30 = 1,56 (aumento de 56%).$q$, 'medio', 'UNICAMP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Uma aplicação financeira rende juros compostos a uma taxa nominal de 12% ao ano com capitalização mensal. A taxa efetiva anual dessa aplicação é:$q$,
'[{"letra":"A","texto":"(1,01)^12 - 1"},{"letra":"B","texto":"(1,12)^12 - 1"},{"letra":"C","texto":"1,12 - 1"},{"letra":"D","texto":"(1,06)^2 - 1"},{"letra":"E","texto":"(1,01)^6 - 1"}]'::jsonb,
'A', $q$Taxa mensal = 12%/12 = 1% ao mês. Taxa efetiva anual = (1 + 0,01)^12 - 1.$q$, 'dificil', 'FGV', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um empréstimo de R$ 10.000,00 deve ser pago em duas parcelas anuais iguais pelo sistema Price, com juros compostos de 10% ao ano. O valor aproximado de cada parcela é:$q$,
'[{"letra":"A","texto":"R$ 5.500,00"},{"letra":"B","texto":"R$ 5.761,90"},{"letra":"C","texto":"R$ 6.000,00"},{"letra":"D","texto":"R$ 6.250,50"},{"letra":"E","texto":"R$ 5.238,10"}]'::jsonb,
'B', $q$10000 = P/(1,1) + P/(1,1)^2 => P = 12100 / 2,1 ≈ R$ 5.761,90.$q$, 'dificil', 'ITA', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Se a inflação acumulada do ano foi de 25% e o reajuste salarial nominal foi de 10%, a perda real do poder de compra foi de:$q$,
'[{"letra":"A","texto":"12%"},{"letra":"B","texto":"15%"},{"letra":"C","texto":"13,5%"},{"letra":"D","texto":"10%"},{"letra":"E","texto":"12,5%"}]'::jsonb,
'A', $q$(1 + r) = 1,10 / 1,25 = 0,88. Perda real = 1 - 0,88 = 12%.$q$, 'dificil', 'FUVEST', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um investidor aplica a juros contínuos de taxa r ao ano. Sabendo que o capital dobra em T anos, tem-se:$q$,
'[{"letra":"A","texto":"r * T = ln(2)"},{"letra":"B","texto":"r * T = log10(2)"},{"letra":"C","texto":"e^(r*T) = 1/2"},{"letra":"D","texto":"r = 2 * ln(T)"},{"letra":"E","texto":"T = 2 * e^r"}]'::jsonb,
'A', $q$M = C * e^(rT). Para M=2C: 2 = e^(rT) => r*T = ln(2).$q$, 'genio', 'IME', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Uma perpetuidade paga R$ 1.000,00 no 1º período e cresce 3% por período. Sob taxa de desconto de 8%, o valor presente é:$q$,
'[{"letra":"A","texto":"R$ 12.500,00"},{"letra":"B","texto":"R$ 20.000,00"},{"letra":"C","texto":"R$ 25.000,00"},{"letra":"D","texto":"R$ 33.333,33"},{"letra":"E","texto":"R$ 50.000,00"}]'::jsonb,
'B', $q$VP = D1 / (k - g) = 1000 / (0,08 - 0,03) = R$ 20.000,00.$q$, 'genio', 'Olimpíada', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Uma série uniforme de n pagamentos R sob juros compostos i, quando n tende a infinito, tem seu valor presente limite dado por:$q$,
'[{"letra":"A","texto":"R / ln(1 + i)"},{"letra":"B","texto":"R / i"},{"letra":"C","texto":"R * i / (1 + i)"},{"letra":"D","texto":"R * e^(-i)"},{"letra":"E","texto":"R / (e^i - 1)"}]'::jsonb,
'B', $q$O limite da anuidade quando n -> inf converge para a perpetuidade simples R / i.$q$, 'genio', 'ITA', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Porcentagem e juros: as contas do dia a dia';

-- MATEMÁTICA: Logaritmos
INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Qual é o valor de log2(32)?$q$,
'[{"letra":"A","texto":"3"},{"letra":"B","texto":"4"},{"letra":"C","texto":"5"},{"letra":"D","texto":"6"},{"letra":"E","texto":"8"}]'::jsonb,
'C', $q$2^5 = 32 => log2(32) = 5.$q$, 'facil', 'ENEM', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Sabendo que log(2) = 0,30, o valor de log(8) é:$q$,
'[{"letra":"A","texto":"0,60"},{"letra":"B","texto":"0,90"},{"letra":"C","texto":"1,20"},{"letra":"D","texto":"2,40"},{"letra":"E","texto":"0,80"}]'::jsonb,
'B', $q$log(8) = log(2^3) = 3 * 0,30 = 0,90.$q$, 'facil', 'ENEM', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Qual o valor de log10(1000) + log3(81)?$q$,
'[{"letra":"A","texto":"5"},{"letra":"B","texto":"6"},{"letra":"C","texto":"7"},{"letra":"D","texto":"8"},{"letra":"E","texto":"9"}]'::jsonb,
'C', $q$3 + 4 = 7.$q$, 'facil', 'Vestibulares', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A magnitude M de um sismo é M = (2/3)*log10(E/E0). Multiplicando E por 1000, o aumento na magnitude é:$q$,
'[{"letra":"A","texto":"1,0"},{"letra":"B","texto":"2,0"},{"letra":"C","texto":"3,0"},{"letra":"D","texto":"1,5"},{"letra":"E","texto":"2,5"}]'::jsonb,
'B', $q$ΔM = (2/3) * log10(1000) = (2/3) * 3 = 2,0.$q$, 'medio', 'FUVEST', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Resolva log2(x - 1) + log2(x + 1) = 3 nos reais:$q$,
'[{"letra":"A","texto":"x = 3"},{"letra":"B","texto":"x = 9"},{"letra":"C","texto":"x = √7"},{"letra":"D","texto":"x = 4"},{"letra":"E","texto":"x = 5"}]'::jsonb,
'A', $q$log2(x^2 - 1) = 3 => x^2 - 1 = 8 => x^2 = 9 => x = 3 (pois x > 1).$q$, 'medio', 'UNICAMP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Se loga(b) = 2 e logb(c) = 3, o valor de log(a*b)(b*c) é:$q$,
'[{"letra":"A","texto":"4/3"},{"letra":"B","texto":"8/3"},{"letra":"C","texto":"5/3"},{"letra":"D","texto":"7/3"},{"letra":"E","texto":"2"}]'::jsonb,
'B', $q$b = a^2, c = a^6 => ab = a^3, bc = a^8 => log_{a^3}(a^8) = 8/3.$q$, 'dificil', 'UNESP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$O conjunto solução da inequação log1/2(x^2 - 3x + 2) >= -1 é:$q$,
'[{"letra":"A","texto":"[0, 1) U (2, 3]"},{"letra":"B","texto":"(1, 2)"},{"letra":"C","texto":"[0, 3]"},{"letra":"D","texto":"(0, 1] U [2, 3)"},{"letra":"E","texto":"[-1, 4]"}]'::jsonb,
'A', $q$Condição x < 1 ou x > 2. Inequação x^2 - 3x + 2 <= 2 => x(x - 3) <= 0 => [0, 3]. Intersecção: [0, 1) U (2, 3].$q$, 'dificil', 'FUVEST', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A soma das soluções reais de x^(log2(x) - 1) = 16 é:$q$,
'[{"letra":"A","texto":"4,25"},{"letra":"B","texto":"4,5"},{"letra":"C","texto":"8,25"},{"letra":"D","texto":"16,5"},{"letra":"E","texto":"5,25"}]'::jsonb,
'A', $q$(log2(x) - 1)*log2(x) = 4 => log2(x) = 2 ou -1 => x = 4 ou 0,25. Soma = 4,25.$q$, 'dificil', 'ITA', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$O valor do somatório de n=1 até (e^100 - 1) de ln(1 + 1/n) é:$q$,
'[{"letra":"A","texto":"50"},{"letra":"B","texto":"100"},{"letra":"C","texto":"e^100"},{"letra":"D","texto":"100 * ln(2)"},{"letra":"E","texto":"e^50"}]'::jsonb,
'B', $q$Série telescópica: ln(n+1) - ln(n). A soma resulta em ln(e^100) - ln(1) = 100.$q$, 'genio', 'IME', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Para x, y > 0 com logx(y) + logy(x) = 10/3 e xy = 144, o valor de |x - y| é:$q$,
'[{"letra":"A","texto":"22√3"},{"letra":"B","texto":"60"},{"letra":"C","texto":"64"},{"letra":"D","texto":"70"},{"letra":"E","texto":"72"}]'::jsonb,
'A', $q$logx(y) = 3 => y = x^3 => x^4 = 144 => x = 2√3, y = 24√3 => |x - y| = 22√3.$q$, 'genio', 'ITA', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$O produto infinito P = (2^(1/2)) * (4^(1/4)) * (8^(1/8)) * ... converge para:$q$,
'[{"letra":"A","texto":"2"},{"letra":"B","texto":"4"},{"letra":"C","texto":"8"},{"letra":"D","texto":"√2"},{"letra":"E","texto":"16"}]'::jsonb,
'B', $q$P = 2^(S), onde S = sum n/2^n = 2. Logo P = 2^2 = 4.$q$, 'genio', 'IME', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Matemática' AND a.titulo = 'Logaritmos: a matemática que "desfaz" potências';
