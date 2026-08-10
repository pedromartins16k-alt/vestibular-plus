// ===== assuntos por matéria (completo, sem cortes) =====
const TODOS_ASSUNTOS = {
  "Português": [
    "Crase, regência e concordância: os pontos que mais derrubam candidato",
    "Figuras de linguagem mais cobradas no ENEM",
    "Funções da linguagem: identificando a intenção do texto",
    "Gêneros textuais e coesão: como os textos se conectam",
    "Gramática: sintaxe e morfologia que mais caem na prova",
    "Interpretação de texto: como não cair em pegadinha",
    "Literatura brasileira: os principais movimentos literários",
    "Semântica e ambiguidade: quando o texto quer dizer mais de uma coisa",
    "Variação linguística: por que não existe \"jeito errado\" de falar"
  ],
  "Biologia": [
    "Botânica: como as plantas vivem e se reproduzem",
    "Citologia: as partes da célula que mais caem",
    "Ecologia: cadeias e teias alimentares",
    "Evolução: como Darwin explica a diversidade da vida",
    "Fisiologia humana: como o corpo funciona por dentro",
    "Genética molecular: DNA, RNA e biotecnologia",
    "Histologia e embriologia: os tecidos e o desenvolvimento humano",
    "Imunologia: como o corpo se defende",
    "Leis de Mendel: a base da genética",
    "Microbiologia: vírus, bactérias e fungos que mais caem",
    "Saúde pública e epidemiologia: temas que caem na redação e em biologia",
    "Zoologia: os grandes grupos de animais e suas características"
  ],
  "Química": [
    "Ácidos, bases e pH: a química do dia a dia",
    "Cinética química: o que acelera ou freia uma reação",
    "Eletroquímica: pilhas e eletrólise explicadas",
    "Equilíbrio químico: quando a reação não para, mas se estabiliza",
    "Estequiometria: a \"regra de três\" da química",
    "Estrutura atômica e tabela periódica: organizando os elementos",
    "Funções orgânicas: reconhecendo pelo grupo funcional",
    "Isomeria: moléculas iguais, mas diferentes",
    "Ligações químicas: por que os átomos se juntam",
    "Química ambiental: poluição e sustentabilidade na prova",
    "Soluções: concentração, diluição e misturas",
    "Termoquímica: energia liberada e absorvida nas reações"
  ],
  "Matemática": [
    "Conjuntos numéricos: dos naturais aos reais",
    "Equações e inequações: resolvendo passo a passo",
    "Funções: o que são e pra que servem",
    "Geometria analítica: retas e circunferências no plano cartesiano",
    "Geometria espacial: volumes e áreas de sólidos",
    "Geometria plana: áreas e perímetros na prática",
    "Logaritmos: a matemática que \"desfaz\" potências",
    "Porcentagem e juros: as contas do dia a dia",
    "Probabilidade e estatística: a matemática das chances",
    "Progressões: PA e PG na prática",
    "Sistemas lineares e matrizes: organizando informações em tabelas",
    "Trigonometria: seno, cosseno e tangente sem decoreba"
  ],
  "Redação": [
    "Coesão e coerência: o que faz o texto \"fluir\"",
    "Erros mais comuns na redação: o que derruba sua nota",
    "Estrutura da redação nota 1000 do ENEM",
    "Gêneros textuais na redação: além da dissertação",
    "Proposta de intervenção: como fechar a redação com nota alta",
    "Repertório sociocultural: como usar sem enfeitar à toa",
    "Tipos de argumentação: como defender seu ponto de vista"
  ],
  "Geografia": [
    "Agropecuária e uso da terra no Brasil",
    "Biomas: as paisagens naturais do Brasil e do mundo",
    "Cartografia: como ler mapas, escalas e projeções",
    "Climas e vegetação do Brasil",
    "Geopolítica mundial: conflitos e blocos de poder",
    "Globalização e blocos econômicos",
    "Hidrografia e recursos hídricos: rios, bacias e a crise da água",
    "Indústria e matriz energética: de onde vem a energia que usamos",
    "Mudanças climáticas e meio ambiente: o tema que mais cresce nas provas",
    "População e demografia: como os países crescem (ou não)",
    "Regiões do Brasil: a divisão regional e suas características",
    "Urbanização brasileira e seus problemas"
  ],
  "História": [
    "Antiguidade Clássica: Grécia e Roma, as bases do Ocidente",
    "Brasil Colônia: como começou a história do país",
    "Ditadura Militar brasileira: contexto, resistência e redemocratização",
    "Era Vargas: por que cai tanto no ENEM",
    "Guerra Fria e o Brasil: como isso nos afetou",
    "História da África: dos reinos antigos à diáspora",
    "História da América: colonização espanhola e independências",
    "Idade Média: feudalismo, Igreja e as Cruzadas",
    "Idade Moderna: das Grandes Navegações ao Iluminismo",
    "Primeira e Segunda Guerra Mundial: os conflitos que mudaram o século 20",
    "República Velha à Nova República: a história política do Brasil moderno",
    "Revolução Francesa: liberdade, igualdade e o fim do Antigo Regime",
    "Revolução Industrial: o que mudou no mundo do trabalho"
  ],
  "Física": [
    "As três Leis de Newton sem decoreba",
    "Cinemática: velocidade e aceleração no dia a dia",
    "Eletricidade básica: corrente, tensão e resistência",
    "Eletromagnetismo: campo magnético e indução na prática",
    "Física moderna: efeito fotoelétrico e radioatividade sem mistério",
    "Gravitação universal: por que os planetas giram",
    "Hidrostática: pressão, empuxo e por que as coisas flutuam",
    "Ondulatória: o que ondas sonoras e de água têm em comum",
    "Óptica geométrica: como a luz forma as imagens que vemos",
    "Termologia: calor, temperatura e as leis dos gases",
    "Trabalho e energia: a física por trás do movimento"
  ]
};

// as 5 chaves têm que bater 100% com vestibulares.nome no banco
const ASSUNTOS_POR_VESTIBULAR = {
  "Vestibular Unicamp 2027": TODOS_ASSUNTOS,
  "ENEM 2026": TODOS_ASSUNTOS,
  "Fuvest 2027 (USP)": TODOS_ASSUNTOS,
  "Vestibular Unesp 2027": TODOS_ASSUNTOS,
  "Vestibular PUC-Campinas": TODOS_ASSUNTOS
};

// ===== leitura obrigatória por vestibular =====
const LEITURA_OBRIGATORIA_POR_VESTIBULAR = {
  "Vestibular Unicamp 2027": {
    obras: [
      { titulo: "A Vida Não É Útil", autor: "Ailton Krenak", ano: "2020" },
      { titulo: "Prosas Seguidas de Odes Mínimas", autor: "José Paulo Paes", ano: "1992" },
      { titulo: "Morangos Mofados (6 contos: Diálogo; Além do Ponto; Terça-Feira Gorda; Pêra, Uva ou Maçã?; O Dia em que Júpiter Encontrou Saturno; Aqueles Dois)", autor: "Caio Fernando Abreu", ano: "1982" },
      { titulo: "Vida e Morte de M. J. Gonzaga de Sá", autor: "Lima Barreto", ano: "1919" },
      { titulo: "No Seu Pescoço", autor: "Chimamanda Ngozi Adichie", ano: "2009" },
      { titulo: "Olhos d'Água", autor: "Conceição Evaristo", ano: "2014" },
      { titulo: "Memórias Póstumas de Brás Cubas", autor: "Machado de Assis", ano: "1881" },
      { titulo: "Os Funerais da Mamãe Grande", autor: "Gabriel García Márquez", ano: "1962" },
      { titulo: "Canções Escolhidas (14 canções selecionadas)", autor: "Paulo César Pinheiro", ano: "" }
    ],
    obs: "Lista oficial da Comvest para o vestibular 2027."
  },
  "Fuvest 2027 (USP)": {
    obras: [
      { titulo: "Nebulosas", autor: "Narcisa Amália", ano: "1872" },
      { titulo: "Opúsculo Humanitário", autor: "Nísia Floresta", ano: "1853" },
      { titulo: "Memórias de Martha", autor: "Júlia Lopes de Almeida", ano: "1888" },
      { titulo: "Caminho de Pedras", autor: "Rachel de Queiroz", ano: "1937" },
      { titulo: "Geografia", autor: "Sophia de Mello Breyner Andresen", ano: "1967" },
      { titulo: "A Paixão Segundo G.H.", autor: "Clarice Lispector", ano: "1964" },
      { titulo: "Balada de Amor ao Vento", autor: "Paulina Chiziane", ano: "1990" },
      { titulo: "Canção para Ninar Menino Grande", autor: "Conceição Evaristo", ano: "2018" },
      { titulo: "A Visão das Plantas", autor: "Djaimilia Pereira de Almeida", ano: "2019" }
    ],
    obs: "Lista oficial da Fuvest para 2027 — pela primeira vez, as 9 obras são todas de autoras mulheres de língua portuguesa."
  },
  "Vestibular Unesp 2027": {
    obras: [],
    obs: "A Unesp não adota lista de leitura obrigatória (diferente da Unicamp e da Fuvest) — cobra literatura de forma geral, sem obras fixas pré-definidas."
  },
  "ENEM 2026": {
    obras: [],
    obs: "O ENEM não tem lista de obras obrigatórias; a redação é um tema dissertativo-argumentativo definido no dia da prova, sem base literária fixa."
  },
  "Vestibular PUC-Campinas": {
    obras: [],
    obs: "Não encontrei divulgação de lista oficial de leitura obrigatória para a PUC-Campinas — vale confirmar direto no edital/manual do candidato quando ele sair."
  }
};
