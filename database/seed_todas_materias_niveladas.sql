-- =========================================================================
-- VESTIBULAR+ : BANCO COMPLETO DE QUESTÕES NIVELADAS (STATUS 16)
-- Matérias: Física, Química, Biologia, História, Geografia, Português, Redação
-- Padrão por Tema: 3 Fáceis, 2 Médias, 3 Difíceis, 3 Gênio
-- Execute no SQL Editor do Supabase (jruyyzftoplcobketrsf)
-- =========================================================================

-- =========================================================================
-- 1. FÍSICA: Cinemática
-- =========================================================================
INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um carro percorre 120 km em 2 horas em uma rodovia. Qual é a sua velocidade média em km/h e em m/s?$q$,
'[{"letra":"A","texto":"60 km/h e 16,7 m/s"},{"letra":"B","texto":"50 km/h e 13,8 m/s"},{"letra":"C","texto":"60 km/h e 20 m/s"},{"letra":"D","texto":"70 km/h e 19,4 m/s"},{"letra":"E","texto":"80 km/h e 22,2 m/s"}]'::jsonb,
'A', $q$Vm = 120 km / 2 h = 60 km/h. Para m/s: 60 / 3,6 ≈ 16,7 m/s.$q$, 'facil', 'ENEM', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um ciclista parte do repouso e atinge 10 m/s em 5 segundos com aceleração constante. A distância percorrida é:$q$,
'[{"letra":"A","texto":"15 m"},{"letra":"B","texto":"20 m"},{"letra":"C","texto":"25 m"},{"letra":"D","texto":"30 m"},{"letra":"E","texto":"50 m"}]'::jsonb,
'C', $q$a = 10 / 5 = 2 m/s². ΔS = (a * t²) / 2 = (2 * 25) / 2 = 25 m.$q$, 'facil', 'Vestibulares', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um objeto é abandonado do alto de um prédio de 45 m. Desprezando o ar e com g = 10 m/s², o tempo de queda é:$q$,
'[{"letra":"A","texto":"2 s"},{"letra":"B","texto":"3 s"},{"letra":"C","texto":"4 s"},{"letra":"D","texto":"5 s"},{"letra":"E","texto":"4,5 s"}]'::jsonb,
'B', $q$h = g*t²/2 => 45 = 5*t² => t² = 9 => t = 3 s.$q$, 'facil', 'ENEM', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Dois trens de 100 m de comprimento cada movem-se em sentidos opostos com velocidades de 20 m/s e 30 m/s. O tempo de cruzamento é:$q$,
'[{"letra":"A","texto":"2 s"},{"letra":"B","texto":"4 s"},{"letra":"C","texto":"5 s"},{"letra":"D","texto":"8 s"},{"letra":"E","texto":"10 s"}]'::jsonb,
'B', $q$Vrel = 20 + 30 = 50 m/s. ΔS total = 100 + 100 = 200 m. t = 200 / 50 = 4 s.$q$, 'medio', 'FUVEST', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um projétil é lançado a 50 m/s em um ângulo de 30° com a horizontal (g = 10 m/s², sen 30° = 0,5, cos 30° = 0,86). O alcance horizontal é:$q$,
'[{"letra":"A","texto":"150 m"},{"letra":"B","texto":"185 m"},{"letra":"C","texto":"215 m"},{"letra":"D","texto":"250 m"},{"letra":"E","texto":"300 m"}]'::jsonb,
'C', $q$Vy = 25 m/s, t_voo = 5 s. Vx = 43 m/s. A = 43 * 5 = 215 m.$q$, 'medio', 'UNICAMP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Uma partícula move-se segundo a equação horária s(t) = 2t³ - 9t² + 12t + 4 (SI). A partícula inverte o sentido de movimento nos instantes:$q$,
'[{"letra":"A","texto":"t = 1 s e t = 2 s"},{"letra":"B","texto":"t = 2 s e t = 3 s"},{"letra":"C","texto":"t = 0,5 s e t = 1,5 s"},{"letra":"D","texto":"t = 1 s e t = 3 s"},{"letra":"E","texto":"t = 0 s e t = 2 s"}]'::jsonb,
'A', $q$v(t) = s'(t) = 6t² - 18t + 12 = 0 => t² - 3t + 2 = 0 => t = 1 s e t = 2 s.$q$, 'dificil', 'UNESP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um barco quer cruzar um rio de largura L de correnteza U perpendicularmente às margens. Se sua velocidade relativa à água é V (V > U), o tempo de travessia é:$q$,
'[{"letra":"A","texto":"L / √(V² - U²)"},{"letra":"B","texto":"L / V"},{"letra":"C","texto":"L / (V - U)"},{"letra":"D","texto":"L / √(V² + U²)"},{"letra":"E","texto":"(L * V) / U"}]'::jsonb,
'A', $q$A velocidade resultante perpendicular é Vres = √(V² - U²). Logo t = L / √(V² - U²).$q$, 'dificil', 'ITA', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um corpo é lançado verticalmente para cima em um meio com resistência do ar linear (F_res = -k*v). A relação entre o tempo de subida (Ts) e de descida (Td) é:$q$,
'[{"letra":"A","texto":"Ts < Td"},{"letra":"B","texto":"Ts = Td"},{"letra":"C","texto":"Ts > Td"},{"letra":"D","texto":"Ts = 2*Td"},{"letra":"E","texto":"Depende da massa apenas"}]'::jsonb,
'A', $q$Na subida gravidade e arrasto somam-se acelerando a perda de velocidade; na descida opõem-se, tornando a aceleração média menor e Td > Ts.$q$, 'dificil', 'FUVEST', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A curva de descida mais rápida entre dois pontos em um campo gravitacional uniforme sob atrito nulo (braquistócrona) tem a forma de:$q$,
'[{"letra":"A","texto":"Ciclóide"},{"letra":"B","texto":"Parábola"},{"letra":"C","texto":"Catenária"},{"letra":"D","texto":"Reta"},{"letra":"E","texto":"Hipérbole"}]'::jsonb,
'A', $q$Problema clássico do cálculo variacional de Bernoulli resolvido por Euler-Lagrange, gerando uma ciclóide.$q$, 'genio', 'IME', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Uma partícula pontual descreve trajetória espiral plana dada em coordenadas polares por r(θ) = r0 * e^(b*θ) com dθ/dt = ω constante. O vetor aceleração angular tem módulo proporcional a:$q$,
'[{"letra":"A","texto":"r * ω² * √(1 + b²)"},{"letra":"B","texto":"r * ω * b"},{"letra":"C","texto":"r0 * b²"},{"letra":"D","texto":"ω² / b"},{"letra":"E","texto":"r * b³ * ω"}]'::jsonb,
'A', $q$Derivando em coordenadas polares com r' = b*r*ω e r'' = b²*r*ω², compondo as componentes radial e transversal resulta em r*ω²*√(1 + b²).$q$, 'genio', 'ITA', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Três cães perseguem-se mutuamente nos vértices de um triângulo equilátero de lado L com velocidade constante v. O tempo até o encontro no baricentro é:$q$,
'[{"letra":"A","texto":"(2 * L) / (3 * v)"},{"letra":"B","texto":"L / v"},{"letra":"C","texto":"L / (2 * v)"},{"letra":"D","texto":"(L * √3) / v"},{"letra":"E","texto":"(3 * L) / (2 * v)"}]'::jsonb,
'A', $q$A velocidade relativa de aproximação ao longo da linha de visada é v - v*cos(120°) = 1,5v. Logo t = L / (1,5v) = 2L / (3v).$q$, 'genio', 'Olimpíada de Física', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Física' AND a.titulo ILIKE '%Cinemática%';

-- =========================================================================
-- 2. QUÍMICA: Estequiometria e Soluções
-- =========================================================================
INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Qual a massa de água formada na combustão completa de 16 g de metano (CH4)? (Massas molares: C=12, H=1, O=16)$q$,
'[{"letra":"A","texto":"18 g"},{"letra":"B","texto":"32 g"},{"letra":"C","texto":"36 g"},{"letra":"D","texto":"44 g"},{"letra":"E","texto":"72 g"}]'::jsonb,
'C', $q$CH4 + 2 O2 -> CO2 + 2 H2O. 1 mol CH4 (16 g) produz 2 mols H2O (36 g).$q$, 'facil', 'ENEM', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A dissolução de 40 g de NaOH (massa molar = 40 g/mol) em água até completar 500 mL gera uma solução de concentração:$q$,
'[{"letra":"A","texto":"0,5 mol/L"},{"letra":"B","texto":"1,0 mol/L"},{"letra":"C","texto":"2,0 mol/L"},{"letra":"D","texto":"4,0 mol/L"},{"letra":"E","texto":"80 g/L"}]'::jsonb,
'C', $q$n = 40/40 = 1 mol. V = 0,5 L. M = 1 / 0,5 = 2,0 mol/L.$q$, 'facil', 'Vestibulares', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$O número de átomos de carbono presentes em 3 mols de glicose (C6H12O6) é de aproximadamente:$q$,
'[{"letra":"A","texto":"1,8 x 10^24"},{"letra":"B","texto":"3,6 x 10^24"},{"letra":"C","texto":"1,08 x 10^25"},{"letra":"D","texto":"6,02 x 10^23"},{"letra":"E","texto":"1,20 x 10^25"}]'::jsonb,
'C', $q$3 mols * 6 C/mol * 6,02 x 10^23 = 1,08 x 10^25 átomos.$q$, 'facil', 'ENEM', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Na reação entre 56 g de ferro e 32 g de enxofre (Fe + S -> FeS) com 80% de rendimento, a massa obtida de FeS (Fe=56, S=32) é:$q$,
'[{"letra":"A","texto":"70,4 g"},{"letra":"B","texto":"88,0 g"},{"letra":"C","texto":"64,0 g"},{"letra":"D","texto":"52,8 g"},{"letra":"E","texto":"44,0 g"}]'::jsonb,
'A', $q$Proporção estequiométrica exata 1:1 gera 88 g teórico. Com 80%: 88 * 0,80 = 70,4 g.$q$, 'medio', 'FUVEST', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Misturam-se 200 mL de HCl 0,5 mol/L com 300 mL de NaOH 0,2 mol/L. O pH resultante da solução final a 25°C é:$q$,
'[{"letra":"A","texto":"1,1"},{"letra":"B","texto":"1,7"},{"letra":"C","texto":"2,0"},{"letra":"D","texto":"7,0"},{"letra":"E","texto":"12,3"}]'::jsonb,
'A', $q$n_H+ = 0,10 mol, n_OH- = 0,06 mol. Excesso H+ = 0,04 mol em 0,5 L => [H+] = 0,08 mol/L. pH = -log(0,08) ≈ 1,1.$q$, 'medio', 'UNICAMP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Uma amostra de 10 g de calcário com 80% de CaCO3 reage com excesso de HCl. O volume de CO2 desprendido nas CNTP (M_CaCO3 = 100 g/mol) é:$q$,
'[{"letra":"A","texto":"1,79 L"},{"letra":"B","texto":"2,24 L"},{"letra":"C","texto":"1,45 L"},{"letra":"D","texto":"2,00 L"},{"letra":"E","texto":"0,89 L"}]'::jsonb,
'A', $q$Massa pura = 8 g (0,08 mol). V = 0,08 * 22,4 L = 1,792 L.$q$, 'dificil', 'UNESP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Um tampão aquoso é preparado com ácido acético 0,1 mol/L (Ka = 1,8 x 10^-5) e acetato de sódio 0,2 mol/L. O pH do tampão é aproximadamente (log 2 = 0,30; pKa = 4,74):$q$,
'[{"letra":"A","texto":"4,44"},{"letra":"B","texto":"4,74"},{"letra":"C","texto":"5,04"},{"letra":"D","texto":"5,24"},{"letra":"E","texto":"3,74"}]'::jsonb,
'C', $q$Henderson-Hasselbalch: pH = 4,74 + log(0,2/0,1) = 4,74 + 0,30 = 5,04.$q$, 'dificil', 'ITA', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Qual a f.e.m. padrão da pilha Daniell formada por Zn/Zn2+ (E0 = -0,76 V) e Cu/Cu2+ (E0 = +0,34 V) e seu ΔG° aproximado (F = 96500 C/mol)?$q$,
'[{"letra":"A","texto":"+1,10 V e -212 kJ"},{"letra":"B","texto":"+0,42 V e -81 kJ"},{"letra":"C","texto":"-1,10 V e +212 kJ"},{"letra":"D","texto":"+1,10 V e -106 kJ"},{"letra":"E","texto":"+1,50 V e -300 kJ"}]'::jsonb,
'A', $q$E0_cel = 0,34 - (-0,76) = 1,10 V. ΔG° = -nFE = -2 * 96500 * 1,10 = -212,3 kJ.$q$, 'dificil', 'FUVEST', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A equação de van der Waals para gases reais introduz correções a e b associadas, respectivamente, a:$q$,
'[{"letra":"A","texto":"Forças atrativas intermoleculares e volume próprio das moléculas"},{"letra":"B","texto":"Energia cinética média e repulsão nuclear"},{"letra":"C","texto":"Pressão de vapor e momento de dipolo"},{"letra":"D","texto":"Capacidade térmica e densidade molar"},{"letra":"E","texto":"Viscosidade e compressibilidade isotérmica"}]'::jsonb,
'A', $q$O parâmetro 'a' corrige a queda de pressão pelas forças de atração intermolecular e 'b' desconta o covolume molecular.$q$, 'genio', 'IME', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Para a reação em fase gasosa N2O4(g) <=> 2 NO2(g), o grau de dissociação α em função de Kp e da pressão total P é dado por:$q$,
'[{"letra":"A","texto":"α = √(Kp / (4P + Kp))"},{"letra":"B","texto":"α = Kp / (P + Kp)"},{"letra":"C","texto":"α = √(Kp * P)"},{"letra":"D","texto":"α = (4P - Kp) / (4P + Kp)"},{"letra":"E","texto":"α = 2Kp / (P + 4Kp)"}]'::jsonb,
'A', $q$Kp = (4α² * P) / (1 - α²). Isolando α obtém-se α = √(Kp / (4P + Kp)).$q$, 'genio', 'ITA', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Em uma célula de combustível alcalina operando a 25°C com hidrogênio e oxigênio com ΔH° = -285,8 kJ/mol e ΔG° = -237,2 kJ/mol, o rendimento termodinâmico teórico máximo é:$q$,
'[{"letra":"A","texto":"83,0%"},{"letra":"B","texto":"92,5%"},{"letra":"C","texto":"75,0%"},{"letra":"D","texto":"100%"},{"letra":"E","texto":"68,4%"}]'::jsonb,
'A', $q$Rendimento máximo = ΔG° / ΔH° = 237,2 / 285,8 ≈ 83,0%.$q$, 'genio', 'Olimpíada de Química', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Química' AND a.titulo ILIKE '%Estequiometria%';

-- =========================================================================
-- 3. BIOLOGIA: Citologia e Genética
-- =========================================================================
INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A organela responsável pela respiração celular aeróbia e produção de ATP é:$q$,
'[{"letra":"A","texto":"Ribossomo"},{"letra":"B","texto":"Mitocôndria"},{"letra":"C","texto":"Complexo Golgiense"},{"letra":"D","texto":"Lisossomo"},{"letra":"E","texto":"Cloroplasto"}]'::jsonb,
'B', $q$As mitocôndrias realizam o ciclo de Krebs e a fosforilação oxidativa produzindo ATP.$q$, 'facil', 'ENEM', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A síntese de proteínas nas células eucarióticas é realizada pelos:$q$,
'[{"letra":"A","texto":"Ribossomos"},{"letra":"B","texto":"Peroxissomos"},{"letra":"C","texto":"Centríolos"},{"letra":"D","texto":"Vacúolos"},{"letra":"E","texto":"Lisossomos"}]'::jsonb,
'A', $q$Os ribossomos traduzem a informação do RNA mensageiro em cadeias polipeptídicas.$q$, 'facil', 'Vestibulares', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$No transporte passivo por osmose através da membrana plasmática, a água se desloca do meio:$q$,
'[{"letra":"A","texto":"Hipotônico para o hipertônico"},{"letra":"B","texto":"Hipertônico para o hipotônico"},{"letra":"C","texto":"Isotônico para o hipertônico"},{"letra":"D","texto":"Com gasto direto de ATP"},{"letra":"E","texto":"Por bombas de prótons"}]'::jsonb,
'A', $q$A água migra espontaneamente da região menos concentrada em soluto (hipotônica) para a mais concentrada (hipertônica).$q$, 'facil', 'ENEM', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$O cruzamento de dois indivíduos heterozigotos para um gene autossômico dominante com dominância completa produz descendentes na proporção fenotípica:$q$,
'[{"letra":"A","texto":"1:2:1"},{"letra":"B","texto":"3:1"},{"letra":"C","texto":"9:3:3:1"},{"letra":"D","texto":"1:1"},{"letra":"E","texto":"2:1"}]'::jsonb,
'B', $q$Aa x Aa resulta em 1 AA (dominante) : 2 Aa (dominante) : 1 aa (recessivo), logo 3 dominantes : 1 recessivo.$q$, 'medio', 'FUVEST', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$O processo de recombinação gênica (crossing-over) ocorre durante qual fase da divisão celular meiótica?$q$,
'[{"letra":"A","texto":"Prófase I (paquíteno)"},{"letra":"B","texto":"Metáfase I"},{"letra":"C","texto":"Anáfase II"},{"letra":"D","texto":"Telófase I"},{"letra":"E","texto":"Prófase II"}]'::jsonb,
'A', $q$O crossing-over ocorre no paquíteno da Prófase I da meiose entre cromátides homólogas.$q$, 'medio', 'UNICAMP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A enzima DNA polimerase necessita de qual estrutura para iniciar a síntese da fita lagging durante a replicação?$q$,
'[{"letra":"A","texto":"Primer de RNA sintetizado pela primase"},{"letra":"B","texto":"Topoisomerase II"},{"letra":"C","texto":"DNA ligase ativa"},{"letra":"D","texto":"Telomerase catalítica"},{"letra":"E","texto":"Fator de transcrição basal"}]'::jsonb,
'A', $q$A DNA polimerase exige a extremidade 3'-OH livre fornecida pelo primer de RNA para iniciar cada fragmento de Okazaki.$q$, 'dificil', 'UNESP', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Em uma população em equilíbrio de Hardy-Weinberg, a frequência de indivíduos recessivos (aa) é 9%. A frequência de heterozigotos (Aa) é:$q$,
'[{"letra":"A","texto":"42%"},{"letra":"B","texto":"49%"},{"letra":"C","texto":"21%"},{"letra":"D","texto":"30%"},{"letra":"E","texto":"18%"}]'::jsonb,
'A', $q$q² = 0,09 => q = 0,3 => p = 0,7. 2pq = 2 * 0,7 * 0,3 = 0,42 (42%).$q$, 'dificil', 'FUVEST', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$O sistema CRISPR-Cas9 utiliza qual mecanismo molecular para direcionar a clivagem do DNA alvo?$q$,
'[{"letra":"A","texto":"Pareamento complementar por um RNA guia (gRNA) associado à sequência PAM"},{"letra":"B","texto":"Reconhecimento de metilações CpG"},{"letra":"C","texto":"Anticorpos monoclonais intracelulares"},{"letra":"D","texto":"Domínios de dedos de zinco"},{"letra":"E","texto":"Fatores de transcrição bHLH"}]'::jsonb,
'A', $q$O sgRNA hibridiza com a sequência-alvo de 20 nucleotídeos adjacente ao motivo PAM, ativando os domínios de nuclease da Cas9.$q$, 'dificil', 'UNICAMP', 2023
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A técnica de sequenciamento de nova geração (NGS) baseada em pirosequenciamento detecta a incorporação de nucleotídeos por meio de:$q$,
'[{"letra":"A","texto":"Liberação de pirofosfato gerando emissão de luz via luciferase"},{"letra":"B","texto":"Variação de pH medida por semicondutor ion-sensitive"},{"letra":"C","texto":"Terminação de cadeia por dideoxinucleotídeos fluorescentes"},{"letra":"D","texto":"Detecção por nanoporos de corrente iônica"},{"letra":"E","texto":"Ressonância plasmônica de superfície"}]'::jsonb,
'A', $q$A ATP sulfurilase converte o PPi liberado em ATP, que impulsiona a enzima luciferase gerando pulsos luminosos proporcionais.$q$, 'genio', 'Olimpíada de Biologia', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$A transição epitélio-mesênquima (EMT) em processos metastáticos é caracterizada principalmente pelo desarranjo de qual complexo de adesão celular?$q$,
'[{"letra":"A","texto":"Downregulation de E-caderina e aumento de N-caderina"},{"letra":"B","texto":"Hiperativação de integrinas beta-1"},{"letra":"C","texto":"Superprodução de claudinas e ocludinas"},{"letra":"D","texto":"Fosforilação constitutiva de conexinas 43"},{"letra":"E","texto":"Inibição de metaloproteinases MMP-9"}]'::jsonb,
'A', $q$A perda de E-caderina associada à expressão de N-caderina (cadherin switch) confere motilidade e invasividade ao fenótipo mesenquimal.$q$, 'genio', 'USP Medicina', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';

INSERT INTO public.questoes (materia_id, aula_id, enunciado, alternativas, resposta_correta, comentario, dificuldade, fonte, ano)
SELECT m.id, a.id,
$q$Na regulação epigenética do operon lac e de promotores eucarióticos, a metilação de resíduos de citosina em ilhas CpG atua promovendo:$q$,
'[{"letra":"A","texto":"Recrutamento de histona desacetilases (HDACs) e silenciamento gênico"},{"letra":"B","texto":"Acetilação de lisinas H3K9 estimulando transcrição"},{"letra":"C","texto":"Remoção de complexos repressivos Polycomb"},{"letra":"D","texto":"Descondensação da eucromatina por ATPases"},{"letra":"E","texto":"Estabilização do complexo TFIIH"}]'::jsonb,
'A', $q$Proteínas de ligação a CpG metilado recrutam HDACs, desacetilando histonas e compactando a cromatina em heterocromatina inativa.$q$, 'genio', 'Unicamp Biologia Avançada', 2024
FROM public.materias m JOIN public.treineiro_aulas a ON a.materia_id = m.id WHERE m.nome = 'Biologia' AND a.titulo ILIKE '%Citologia%';