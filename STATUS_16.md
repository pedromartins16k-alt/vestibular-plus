# STATUS_16 — Vestibular+ (Pedro)

> Repositório: `pedromartins16k-alt/vestibular-plus` (público no GitHub)
> Deploy: `vestibular-plus.vercel.app` (Vercel)
> Supabase project ID: `jruyyzftoplcobketrsf` (região `sa-east-1`)
> Data: 18/08/2026

## 📌 O que foi feito nesta sessão

1. **Levantamento e Auditoria de Conteúdo do Banco**:
   - Total de **1.599 questões**, **442 resumos**, **334 flashcards**, **51 simulados** (1.156 questões vinculadas).
   - Identificado o motivo da contagem reduzida na interface: RLS da tabela `questoes` limita a amostra para contas Free (~30%), além da distribuição por nível (`facil`, `medio`, `dificil`, `genio`).

2. **Nova Definição de Distribuição de Questões por Tema**:
   - Padrão estabelecido: **3 Fáceis** (`facil`), **2 Médias** (`medio`), **3 Difíceis** (`dificil`), **3 Gênio** (`genio`) por aula/tema.
   - Criado o arquivo SQL `database/seed_questoes_niveladas.sql` para padronização e inserção no Supabase.

3. **Próximos Passos**:
   - Executar os scripts SQL no Supabase SQL Editor para popular os temas restantes.
   - Continuar a expansão dos blocos das demais matérias (Física, Química, Biologia, História, Geografia, Português, Redação).
