# CLAUDE_DATABASE_PROMPT.md
# Prompt para Alteração Segura do Banco de Dados — Vestibular+

> **Para:** Claude (Anthropic)
> **De:** Antigravity (Google DeepMind)
> **Projeto:** Vestibular+
> **Data:** 2026-09-29
> **Urgência:** Executar antes de ativar as funcionalidades listadas abaixo

---

## CONTEXTO

Você é responsável **exclusivamente** pela alteração segura e reversível do banco de dados do projeto **Vestibular+**.

O Vestibular+ é uma plataforma de estudos para vestibulares brasileiros, hospedada na Vercel. O backend é o **Supabase** (PostgreSQL gerenciado).

**Projeto Supabase:**
- Project ID: `jruyyzftoplcobketrsf`
- Região: `sa-east-1` (São Paulo)
- Acesse via: https://supabase.com/dashboard/project/jruyyzftoplcobketrsf

**Por que esta alteração é necessária:**
O Antigravity está implementando as seguintes funcionalidades novas:
1. **Objetivo do Aluno** — o aluno escolhe vestibular, curso, universidade e data-alvo
2. **Diagnóstico Inicial** — teste adaptativo que avalia o conhecimento inicial do aluno
3. **Revisão Espaçada** — sistema que agenda a revisão de questões erradas em intervalos crescentes

Essas funcionalidades precisam de estrutura no banco para persistir os dados.

---

## BANCO ATUAL (Schema Identificado — NÃO ALTERAR O QUE JÁ EXISTE)

```
Tabelas existentes (NÃO modificar, apenas preservar):

public.profiles
  - id uuid (PK, referencia auth.users)
  - nome text
  - avatar_url text
  - nivel int (default 1)
  - xp int (default 0)
  - meta_diaria_minutos int (default 60)
  - criado_em timestamptz
  - atualizado_em timestamptz

public.materias
  - id uuid (PK)
  - nome text
  - cor text
  - icone text
  - ordem int

public.resumos
  - id uuid (PK)
  - materia_id uuid (FK → materias)
  - titulo text
  - conteudo text (markdown)
  - fonte text
  - nivel_dificuldade text ('facil'|'medio'|'dificil')
  - criado_em timestamptz

public.questoes
  - id uuid (PK)
  - materia_id uuid (FK → materias)
  - enunciado text
  - alternativas jsonb (array [{letra, texto}])
  - resposta_correta text
  - comentario text
  - fonte text
  - ano int
  - dificuldade text ('facil'|'medio'|'dificil')

public.simulados
  - id uuid (PK)
  - titulo text
  - descricao text
  - tempo_limite_minutos int
  - criado_em timestamptz

+ patches aplicados:
  - schema_patch_limites.sql (sistema de planos/cotas)
  - schema_patch_planos_v2.sql (planos detalhados)
```

---

## ALTERAÇÕES NECESSÁRIAS

### 1. Adicionar campo `objetivo_json` na tabela `profiles`

**Por quê:** Armazenar o objetivo do aluno (vestibular escolhido, curso, data-alvo) diretamente no perfil, sem criar tabela separada.

**Estrutura do JSON salvo:**
```json
{
  "vestibular_id": "fuvest",
  "vestibular_nome": "FUVEST 2027",
  "universidade": "USP",
  "curso": "Engenharia de Computação",
  "data_prova": "2026-11-01",
  "modalidade": null,
  "configurado_em": "2026-09-29T10:00:00Z"
}
```

### 2. Criar tabela `diagnostico_resultados`

**Por quê:** Armazenar o resultado do diagnóstico inicial por matéria, para gerar plano de estudos personalizado.

### 3. Criar tabela `revisao_agendada`

**Por quê:** Sistema de revisão espaçada (spaced repetition) que agenda quando o aluno deve revisar cada questão que errou.

---

## SQL DE ALTERAÇÃO

**Execute as instruções abaixo no SQL Editor do Supabase:**
`https://supabase.com/dashboard/project/jruyyzftoplcobketrsf/sql`

```sql
-- ============================================================
-- VESTIBULAR+ — MIGRATION SEGURA
-- Data: 2026-09-29
-- Executar no SQL Editor do Supabase
-- ============================================================

-- PASSO 1: Verificar estado atual antes de alterar
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- ============================================================
-- ALTERAÇÃO 1: Campo objetivo_json em profiles
-- Usa IF NOT EXISTS via DO block para ser idempotente
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'objetivo_json'
  ) THEN
    ALTER TABLE public.profiles
    ADD COLUMN objetivo_json jsonb DEFAULT NULL;

    COMMENT ON COLUMN public.profiles.objetivo_json IS 
    'Objetivo do aluno: {vestibular_id, vestibular_nome, universidade, curso, data_prova, modalidade, configurado_em}';
    
    RAISE NOTICE 'Coluna objetivo_json adicionada com sucesso.';
  ELSE
    RAISE NOTICE 'Coluna objetivo_json já existe. Nenhuma alteração necessária.';
  END IF;
END $$;

-- ============================================================
-- ALTERAÇÃO 2: Tabela de diagnóstico inicial
-- ============================================================
CREATE TABLE IF NOT EXISTS public.diagnostico_resultados (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  realizado_em timestamptz DEFAULT now() NOT NULL,
  
  -- Resultados por matéria: {"Matematica": {"acertos": 3, "total": 5, "percentual": 60}, ...}
  resultados_por_materia jsonb NOT NULL DEFAULT '{}',
  
  -- Totais gerais
  total_questoes int NOT NULL DEFAULT 0,
  total_acertos int NOT NULL DEFAULT 0,
  
  -- Status
  concluido boolean NOT NULL DEFAULT false,
  
  -- Metadados
  criado_em timestamptz DEFAULT now() NOT NULL
);

-- Índice para buscar diagnósticos por usuário
CREATE INDEX IF NOT EXISTS idx_diagnostico_user_id 
ON public.diagnostico_resultados(user_id);

-- RLS (Row Level Security)
ALTER TABLE public.diagnostico_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_veem_proprio_diagnostico" ON public.diagnostico_resultados;
CREATE POLICY "usuarios_veem_proprio_diagnostico"
  ON public.diagnostico_resultados
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.diagnostico_resultados IS
'Resultados do diagnóstico inicial de cada aluno. Usado para gerar plano de estudos personalizado.';

-- ============================================================
-- ALTERAÇÃO 3: Tabela de revisão espaçada
-- ============================================================
CREATE TABLE IF NOT EXISTS public.revisao_agendada (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  questao_id uuid NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  
  -- Agendamento
  proxima_revisao date NOT NULL,
  intervalo_dias int NOT NULL DEFAULT 1,
  
  -- Histórico
  total_revisoes int NOT NULL DEFAULT 0,
  ultimo_resultado text CHECK (
    ultimo_resultado IN ('acerto_facil', 'acerto', 'dificuldade', 'erro')
  ),
  
  -- Timestamps
  criado_em timestamptz DEFAULT now() NOT NULL,
  atualizado_em timestamptz DEFAULT now() NOT NULL,
  
  -- Garante um registro por questão por usuário
  UNIQUE(user_id, questao_id)
);

-- Índice principal: buscar revisões do dia para um usuário
CREATE INDEX IF NOT EXISTS idx_revisao_user_data 
ON public.revisao_agendada(user_id, proxima_revisao);

-- RLS
ALTER TABLE public.revisao_agendada ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_veem_propria_revisao" ON public.revisao_agendada;
CREATE POLICY "usuarios_veem_propria_revisao"
  ON public.revisao_agendada
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.revisao_agendada IS
'Sistema de revisão espaçada. Registra quando cada questão deve ser revisada por cada aluno.';

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================

-- Confirmar que o campo foi adicionado
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Confirmar tabelas criadas
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_schema = 'public' AND c.table_name = table_name) as total_colunas
FROM information_schema.tables c
WHERE table_schema = 'public' 
AND table_name IN ('diagnostico_resultados', 'revisao_agendada')
ORDER BY table_name;

-- Confirmar RLS habilitado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('diagnostico_resultados', 'revisao_agendada');
```

---

## INSTRUÇÕES DE SEGURANÇA

1. **Antes de executar:** Tire um snapshot do banco via Supabase Dashboard → Settings → Backups
2. **A migration é segura:** Usa `IF NOT EXISTS` e `DO $$ BEGIN ... END $$` — idempotente
3. **Não apaga dados:** Nenhum `DROP TABLE`, `TRUNCATE` ou `DELETE` sem necessidade
4. **RLS ativado:** Cada usuário só acessa seus próprios dados
5. **Rollback possível:**
   ```sql
   -- Para desfazer (apenas se necessário):
   ALTER TABLE public.profiles DROP COLUMN IF EXISTS objetivo_json;
   DROP TABLE IF EXISTS public.diagnostico_resultados;
   DROP TABLE IF EXISTS public.revisao_agendada;
   ```

---

## APÓS EXECUTAR

Informe ao usuário exatamente:
1. ✅ O que foi alterado (coluna adicionada, tabelas criadas)
2. ✅ Resultado das consultas de verificação
3. ✅ Confirmação de que RLS está ativado
4. ❌ Qualquer erro encontrado e como foi resolvido

---

## STATUS (preencher após execução)

- [ ] Campo `objetivo_json` adicionado em `profiles`
- [ ] Tabela `diagnostico_resultados` criada com RLS
- [ ] Tabela `revisao_agendada` criada com RLS e índice
- [ ] Verificações finais executadas e aprovadas

---

# ETAPA 12: LABORATÓRIO DE REDAÇÃO (PERSISTÊNCIA SUPABASE)

> **Contexto:** O Laboratório de Redação do Vestibular+ foi implementado no frontend (`src/pages/redacao.html`, `src/scripts/redacao.js`).  
> O histórico e rascunhos são salvos com isolamento por usuário (`sessionUserId`) no `localStorage` e a sessão de estudo é registrada em `sessoes_estudo (tipo='redacao')`.  
> Para garantir persistência remota definitiva de redações finalizadas e histórico de correções oficiais, execute a migration abaixo no Supabase SQL Editor.

```sql
-- ==============================================================================
-- 1. TABELA DE REDAÇÕES ENTREGUES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.redacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposta_id TEXT NOT NULL,
  titulo_proposta TEXT NOT NULL,
  banca TEXT NOT NULL,
  ano INTEGER,
  texto TEXT NOT NULL,
  palavras INTEGER NOT NULL DEFAULT 0,
  caracteres INTEGER NOT NULL DEFAULT 0,
  linhas INTEGER NOT NULL DEFAULT 0,
  tempo_segundos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aguardando_correcao', -- 'rascunho', 'aguardando_correcao', 'corrigida'
  criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ativar RLS
ALTER TABLE public.redacoes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: Isolamento estrito por usuário
CREATE POLICY "Usuário acessa apenas suas próprias redações"
  ON public.redacoes FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Índices para consultas otimizadas
CREATE INDEX IF NOT EXISTS idx_redacoes_user_data ON public.redacoes(user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_redacoes_banca ON public.redacoes(user_id, banca);

-- ==============================================================================
-- 2. TABELA DE AVALIAÇÕES / CRITÉRIOS DE CORREÇÃO POR BANCA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.redacao_avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  redacao_id UUID NOT NULL REFERENCES public.redacoes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_avaliacao TEXT NOT NULL DEFAULT 'autoavaliacao', -- 'autoavaliacao', 'monitor', 'ia', 'banca_oficial'
  nota_total NUMERIC(6, 2),
  nota_maxima NUMERIC(6, 2) NOT NULL DEFAULT 1000,
  criterios_detalhe JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ "criterio": "C1", "nome": "...", "nota": 160, "max": 200, "comentario": "..." }]
  pontos_fortes TEXT[] DEFAULT '{}',
  pontos_melhoria TEXT[] DEFAULT '{}',
  comentario_geral TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ativar RLS
ALTER TABLE public.redacao_avaliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário acessa apenas avaliações de suas próprias redações"
  ON public.redacao_avaliacoes FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_redacao_avaliacoes_redacao ON public.redacao_avaliacoes(redacao_id);
```
