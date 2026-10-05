# CLAUDE_DATABASE_PROMPT.md
# Prompt para Alteração Segura do Banco de Dados — Vestibular+

> **Para:** Claude (Anthropic) ou qualquer agente com acesso ao Supabase
> **De:** Antigravity (Google DeepMind)
> **Projeto:** Vestibular+
> **Data:** 2026-10-05
> **Urgência:** Executar quando houver janela segura de manutenção

---

## CONTEXTO GERAL

Você é responsável **exclusivamente** pela alteração segura e reversível do banco de dados do projeto **Vestibular+**.

O Vestibular+ é uma plataforma de estudos para vestibulares brasileiros, hospedada na Vercel. O backend é o **Supabase** (PostgreSQL gerenciado).

**Projeto Supabase:**
- Project ID: `jruyyzftoplcobketrsf`
- Região: `sa-east-1` (São Paulo)
- Acesse via: https://supabase.com/dashboard/project/jruyyzftoplcobketrsf

---

## PROBLEMA IDENTIFICADO NA ETAPA 22 — Fingerprint sem campo no banco

### Causa

O sistema de avaliação de redações foi aprimorado com um mecanismo de fingerprint/hash
para identificar reavaliações da mesma redação. O fingerprint é gerado no backend
(`api/_ai-service.js`) com base em:

- Conteúdo normalizado da redação (texto em minúsculas, sem espaços duplos)
- `proposta_id` da redação
- `vestibular_id`
- Versão da rubrica (`VERSAO_RUBRICA = 'enem-v4-2026'`)

Atualmente o fingerprint é retornado na resposta da API mas **não é persistido no banco**.
Isso significa que não é possível detectar server-side se o mesmo texto já foi avaliado anteriormente.

### Problema de Persistência

Em produção, a avaliação frequentemente aparece com aviso:

> "A gravação definitiva no banco não pôde ser confirmada"

Investigação identificou que o INSERT na tabela `redacao_avaliacoes` falha silenciosamente
(sem erro, sem ID retornado) em alguns casos, possivelmente por:

1. Coluna obrigatória ausente no payload
2. RLS bloqueando o service_role em certos cenários
3. Trigger ou constraint desconhecida no schema atual

---

## SCHEMA ATUAL (NÃO ALTERAR O QUE JÁ EXISTE)

```
Tabelas existentes confirmadas:

public.redacoes
  - id uuid (PK)
  - user_id uuid (FK → auth.users)
  - proposta_id text
  - vestibular_id text
  - titulo text
  - conteudo text (texto da redação)
  - status text ('aguardando_correcao', 'corrigida')
  - total_palavras integer
  - total_caracteres integer
  - total_linhas integer
  - tempo_segundos integer
  - finalizada_em timestamptz
  - created_at timestamptz
  - updated_at timestamptz

public.redacao_avaliacoes
  - id uuid (PK, default gen_random_uuid())
  - redacao_id uuid (FK → redacoes.id)
  - user_id uuid (FK → auth.users)
  - tipo_avaliacao text
  - modelo_ia text
  - nota_total integer
  - nota_maxima integer
  - competencias jsonb
  - pontos_fortes text[]
  - pontos_melhoria text[]
  - exemplos_trechos text[]
  - sugestoes text[]
  - prioridades_estudo text[]
  - feedback_geral text
  - status text
  - criado_em timestamptz (default now())
```

---

## ALTERAÇÕES SUGERIDAS

### ALTERAÇÃO 1 — Adicionar coluna `fingerprint` em `redacao_avaliacoes`

**Problema:** Sem esse campo, o sistema não pode detectar server-side se o mesmo texto já foi avaliado.

**SQL sugerido:**
```sql
ALTER TABLE public.redacao_avaliacoes
ADD COLUMN IF NOT EXISTS fingerprint text;

COMMENT ON COLUMN public.redacao_avaliacoes.fingerprint IS
  'Hash djb2 do conteúdo normalizado da redação + proposta_id + vestibular_id + versão da rubrica. Permite detectar reavaliações do mesmo texto sem alterar schema da tabela redacoes.';

CREATE INDEX IF NOT EXISTS idx_redacao_avaliacoes_fingerprint
  ON public.redacao_avaliacoes (fingerprint)
  WHERE fingerprint IS NOT NULL;
```

**Cuidados:**
- A coluna é NULLABLE — avaliações antigas continuam válidas sem fingerprint
- O índice é parcial (WHERE fingerprint IS NOT NULL) para não penalizar avaliações antigas
- Não é PK nem UNIQUE (o mesmo texto pode ser reavaliado e ambas as avaliações preservadas)

**Validação após aplicar:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'redacao_avaliacoes'
  AND column_name = 'fingerprint';
-- Deve retornar: fingerprint | text | YES
```

**Impacto esperado:** Permite ao backend usar `fingerprint` para alertar o aluno quando está reavaliando o mesmo texto.

---

### ALTERAÇÃO 2 — Adicionar coluna `rubrica_versao` em `redacao_avaliacoes`

**Problema:** Sem rastreabilidade da versão da rubrica, não é possível saber se duas avaliações usaram critérios diferentes.

**SQL sugerido:**
```sql
ALTER TABLE public.redacao_avaliacoes
ADD COLUMN IF NOT EXISTS rubrica_versao text;

COMMENT ON COLUMN public.redacao_avaliacoes.rubrica_versao IS
  'Versão da rubrica usada na avaliação (ex: enem-v4-2026). Permite identificar mudanças de critério entre avaliações.';
```

**Cuidados:**
- Nullable — retrocompatível com avaliações antigas

**Impacto esperado:** Permite filtrar avaliações por versão de rubrica e invalidar comparações entre rubrica antigas e novas.

---

### ALTERAÇÃO 3 — Diagnóstico: por que o INSERT falha silenciosamente

**Para investigar, execute:**
```sql
-- Verificar RLS da tabela redacao_avaliacoes
SELECT polname, polroles, polcmd, polqual
FROM pg_policies
WHERE tablename = 'redacao_avaliacoes';

-- Verificar se service_role tem bypass de RLS
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolname IN ('service_role', 'anon', 'authenticated');

-- Verificar constraints que possam causar falha silenciosa
SELECT conname, contype, conkey
FROM pg_constraint
WHERE conrelid = 'public.redacao_avaliacoes'::regclass;

-- Verificar triggers
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'redacao_avaliacoes';
```

**Se o problema for RLS bloqueando service_role:**
```sql
-- Opção 1: Garantir que service_role tem bypass
ALTER ROLE service_role BYPASSRLS;

-- Opção 2 (mais segura): Criar policy explícita para service_role
CREATE POLICY "service_role_full_access" ON public.redacao_avaliacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Cuidados:**
- Execute somente em janela de manutenção
- Verifique logs do Supabase antes e depois
- Teste com um INSERT manual antes de aplicar em produção:
```sql
INSERT INTO public.redacao_avaliacoes
  (redacao_id, user_id, tipo_avaliacao, modelo_ia, nota_total, nota_maxima, status)
VALUES
  (gen_random_uuid(), auth.uid(), 'ia', 'test', 500, 1000, 'calculada')
RETURNING id;
-- Se retornar id, o INSERT funciona para o role atual
```

---

## QUANDO APLICAR

1. Janela de manutenção de baixo tráfego
2. Após backup do banco
3. Testando em staging primeiro se disponível
4. Verificar que a Vercel tem `SUPABASE_SERVICE_ROLE_KEY` configurada (não apenas `VITE_SUPABASE_ANON_KEY`)

## QUANDO NÃO APLICAR

- Nunca aplicar SQL diretamente em produção sem testar em staging
- Nunca dropar colunas existentes
- Nunca alterar PKs ou FKs existentes
- Nunca alterar RLS sem entender o impacto completo

---

## IMPACTO ESPERADO APÓS AS ALTERAÇÕES

| Funcionalidade | Antes | Depois |
|---|---|---|
| Detectar reavaliação do mesmo texto | ❌ (só no frontend) | ✅ (server-side via fingerprint) |
| Rastrear versão da rubrica por avaliação | ❌ | ✅ |
| INSERT de avaliação sempre funciona | ⚠️ (falha silenciosa ocasional) | ✅ (após fix de RLS) |
| Comparar avaliações de diferentes versões de rubrica | ❌ | ✅ |
