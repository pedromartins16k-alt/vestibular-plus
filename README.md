# Vestibular+ 🚀

Plataforma de estudos para ENEM e vestibulares — resumos, questões comentadas,
simulados, flashcards, cronograma, XP/níveis, ranking e conquistas.

## Stack
- HTML5 / CSS3 / JavaScript (Vite como bundler)
- Supabase (Postgres + Auth + Row Level Security)

## Estrutura do projeto
```
vestibular-platform/
├── database/
│   └── schema.sql          # todas as tabelas + RLS (rodar no Supabase)
├── public/assets/          # imagens e ícones estáticos
├── src/
│   ├── components/         # componentes reutilizáveis (a expandir)
│   ├── lib/
│   │   ├── supabaseClient.js
│   │   └── authGuard.js
│   ├── pages/               # login, cadastro, recuperar-senha, dashboard...
│   ├── scripts/             # JS específico de cada página
│   ├── styles/               # tokens.css (design system) + base.css
│   ├── utils/xp.js           # regras de gamificação
│   └── index.html            # landing page
├── .env.example
├── package.json
└── vite.config.js
```

## Como rodar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie `.env.example` para `.env` e preencha com as chaves do seu projeto Supabase:
   ```bash
   cp .env.example .env
   ```
3. Rode o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
4. Acesse `http://localhost:5173`.

## Configuração do Supabase (obrigatória)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute o conteúdo de `database/schema.sql`.
3. Em **Project Settings → API**, copie a `Project URL` e a `anon public key`
   para o seu `.env`.
4. Em **Authentication → Providers**, confirme que o provedor de e-mail está ativo.
5. Em **Authentication → URL Configuration**, defina a "Site URL" para a URL onde
   o site vai rodar (localhost em dev, e depois a URL de produção).

## Publicando no GitHub

```bash
git init
git add .
git commit -m "Setup inicial da plataforma Vestibular+"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/vestibular-plus.git
git push -u origin main
```

> **Importante:** o `.env` está no `.gitignore` e nunca deve ser commitado.
> Para deploy (Vercel/Netlify/GitHub Pages com build), configure as mesmas
> variáveis (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) no painel do
> serviço de hospedagem escolhido.

## Status atual / próximos passos

**Já implementado:**
- Landing page, cadastro, login, recuperação/redefinição de senha (Supabase Auth)
- Dashboard com XP, nível, estatísticas e progresso por matéria (dados reais do Supabase)
- Design system completo (dark/light, glassmorphism, gradientes, animações)
- Schema completo do banco com RLS

**Em construção (próximas entregas):**
- Telas de Resumos, Questões, Simulados (com correção automática) e Flashcards
- Cronograma inteligente e metas de estudo
- Sistema de conquistas e ranking em tempo real
- Área administrativa para gestão de conteúdo
- Sistema de notificações
