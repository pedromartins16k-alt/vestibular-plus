-- =============================================================================
-- schema_patch_planos_v2.sql
-- Vestibular+ — Correção das stored functions de controle de uso
-- Aplica limites REAIS por plano (não apenas free)
-- Execute este arquivo no Supabase SQL Editor
-- =============================================================================

-- 1. Atualiza os limites oficiais por plano (fonte única de verdade)
UPDATE public.planos SET
  limite_questoes_dia     = 15,
  limite_resumos_dia      = 10,
  limite_simulados_semana = 5,
  limite_chat_dia         = 5
WHERE nome = 'free';

UPDATE public.planos SET
  limite_questoes_dia     = NULL,   -- ilimitado
  limite_resumos_dia      = NULL,   -- ilimitado
  limite_simulados_semana = 5,
  limite_chat_dia         = 15
WHERE nome = 'basic';

UPDATE public.planos SET
  limite_questoes_dia     = NULL,   -- ilimitado
  limite_resumos_dia      = NULL,   -- ilimitado
  limite_simulados_semana = 10,
  limite_chat_dia         = 30
WHERE nome = 'pro';

UPDATE public.planos SET
  limite_questoes_dia     = NULL,   -- ilimitado
  limite_resumos_dia      = NULL,   -- ilimitado
  limite_simulados_semana = NULL,   -- ilimitado
  limite_chat_dia         = 100
WHERE nome IN ('premium', 'ultimate');

-- 2. Garante que a tabela de uso existe com estrutura correta
CREATE TABLE IF NOT EXISTS public.uso_recursos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  quantidade int NOT NULL DEFAULT 1,
  UNIQUE(user_id, tipo, data)
);

ALTER TABLE public.uso_recursos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_gerenciam_proprio_uso" ON public.uso_recursos;
CREATE POLICY "usuarios_gerenciam_proprio_uso" ON public.uso_recursos
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. consultar_uso_diario — verifica limite sem incrementar
--    Agora usa os limites reais do plano do usuário (basic, pro, premium/ultimate inclusos)
CREATE OR REPLACE FUNCTION public.consultar_uso_diario(p_tipo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_plano_nome text;
  v_limite     int;
  v_data_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_usado      int  := 0;
BEGIN
  -- Usuários anônimos não têm limite
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', 'anonimo');
  END IF;

  -- Obtém o nome do plano do usuário
  SELECT COALESCE(pl.nome, 'free') INTO v_plano_nome
  FROM public.profiles pr
  LEFT JOIN public.planos pl ON pl.id = pr.plano_id
  WHERE pr.id = v_user_id;

  IF v_plano_nome IS NULL THEN
    v_plano_nome := 'free';
  END IF;

  -- Busca o limite correto para este plano e tipo
  IF p_tipo = 'questao' THEN
    SELECT limite_questoes_dia INTO v_limite
    FROM public.planos WHERE nome = v_plano_nome;
  ELSIF p_tipo = 'resumo' THEN
    SELECT limite_resumos_dia INTO v_limite
    FROM public.planos WHERE nome = v_plano_nome;
  ELSIF p_tipo = 'simulado' THEN
    SELECT limite_simulados_semana INTO v_limite
    FROM public.planos WHERE nome = v_plano_nome;
  ELSIF p_tipo = 'chat' THEN
    SELECT limite_chat_dia INTO v_limite
    FROM public.planos WHERE nome = v_plano_nome;
  ELSE
    RETURN jsonb_build_object('permitido', true, 'plano', v_plano_nome);
  END IF;

  -- NULL significa ilimitado para este plano
  IF v_limite IS NULL THEN
    RETURN jsonb_build_object('permitido', true, 'plano', v_plano_nome, 'ilimitado', true);
  END IF;

  -- Consulta o uso atual do dia
  SELECT COALESCE(quantidade, 0) INTO v_usado
  FROM public.uso_recursos
  WHERE user_id = v_user_id AND tipo = p_tipo AND data = v_data_hoje;

  IF v_usado >= v_limite THEN
    RETURN jsonb_build_object(
      'permitido', false,
      'motivo', 'limite_diario',
      'usado', v_usado,
      'limite', v_limite,
      'plano', v_plano_nome
    );
  END IF;

  RETURN jsonb_build_object(
    'permitido', true,
    'usado', v_usado,
    'limite', v_limite,
    'plano', v_plano_nome
  );
END;
$$;

-- 4. verificar_e_registrar_uso — verifica limite E incrementa ao consumir
CREATE OR REPLACE FUNCTION public.verificar_e_registrar_uso(p_tipo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_plano_nome text;
  v_limite     int;
  v_data_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_usado      int  := 0;
BEGIN
  -- Usuários anônimos não têm limite
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', 'anonimo');
  END IF;

  -- Obtém o nome do plano do usuário
  SELECT COALESCE(pl.nome, 'free') INTO v_plano_nome
  FROM public.profiles pr
  LEFT JOIN public.planos pl ON pl.id = pr.plano_id
  WHERE pr.id = v_user_id;

  IF v_plano_nome IS NULL THEN
    v_plano_nome := 'free';
  END IF;

  -- Busca o limite correto para este plano e tipo
  IF p_tipo = 'questao' THEN
    SELECT limite_questoes_dia INTO v_limite
    FROM public.planos WHERE nome = v_plano_nome;
  ELSIF p_tipo = 'resumo' THEN
    SELECT limite_resumos_dia INTO v_limite
    FROM public.planos WHERE nome = v_plano_nome;
  ELSIF p_tipo = 'simulado' THEN
    SELECT limite_simulados_semana INTO v_limite
    FROM public.planos WHERE nome = v_plano_nome;
  ELSIF p_tipo = 'chat' THEN
    SELECT limite_chat_dia INTO v_limite
    FROM public.planos WHERE nome = v_plano_nome;
  ELSE
    RETURN jsonb_build_object('permitido', true, 'plano', v_plano_nome);
  END IF;

  -- NULL significa ilimitado para este plano — registra sem bloquear
  IF v_limite IS NULL THEN
    INSERT INTO public.uso_recursos (user_id, tipo, data, quantidade)
    VALUES (v_user_id, p_tipo, v_data_hoje, 1)
    ON CONFLICT (user_id, tipo, data)
    DO UPDATE SET quantidade = public.uso_recursos.quantidade + 1
    RETURNING quantidade INTO v_usado;

    RETURN jsonb_build_object(
      'permitido', true,
      'plano', v_plano_nome,
      'ilimitado', true,
      'usado', v_usado
    );
  END IF;

  -- Verifica o uso atual antes de incrementar
  SELECT COALESCE(quantidade, 0) INTO v_usado
  FROM public.uso_recursos
  WHERE user_id = v_user_id AND tipo = p_tipo AND data = v_data_hoje;

  IF v_usado >= v_limite THEN
    RETURN jsonb_build_object(
      'permitido', false,
      'motivo', 'limite_diario',
      'usado', v_usado,
      'limite', v_limite,
      'plano', v_plano_nome
    );
  END IF;

  -- Incrementa o contador
  INSERT INTO public.uso_recursos (user_id, tipo, data, quantidade)
  VALUES (v_user_id, p_tipo, v_data_hoje, 1)
  ON CONFLICT (user_id, tipo, data)
  DO UPDATE SET quantidade = public.uso_recursos.quantidade + 1
  RETURNING quantidade INTO v_usado;

  RETURN jsonb_build_object(
    'permitido', true,
    'usado', v_usado,
    'limite', v_limite,
    'plano', v_plano_nome
  );
END;
$$;

-- 5. Garante que usuario_tem_acesso também respeita premium/ultimate para favoritos
CREATE OR REPLACE FUNCTION public.usuario_tem_acesso(p_recurso text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_plano_nome text;
  v_plano_ordem int;
  v_ordem_minima int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(pl.nome, 'free'), COALESCE(pl.ordem, 0)
  INTO v_plano_nome, v_plano_ordem
  FROM public.profiles pr
  LEFT JOIN public.planos pl ON pl.id = pr.plano_id
  WHERE pr.id = v_user_id;

  IF v_plano_nome IS NULL THEN
    v_plano_nome := 'free';
    v_plano_ordem := 0;
  END IF;

  -- Ultimate/premium sempre tem tudo
  IF v_plano_nome IN ('premium', 'ultimate') OR v_plano_ordem >= 3 THEN
    RETURN true;
  END IF;

  -- Mapa de ordem mínima por recurso
  CASE p_recurso
    WHEN 'favoritos'            THEN v_ordem_minima := 1;
    WHEN 'cronograma'           THEN v_ordem_minima := 1;
    WHEN 'flashcards'           THEN v_ordem_minima := 1;
    WHEN 'metas'                THEN v_ordem_minima := 2;
    WHEN 'projetos'             THEN v_ordem_minima := 2;
    WHEN 'vestibulares_treineiro' THEN v_ordem_minima := 2;
    WHEN 'sou_treineiro'        THEN v_ordem_minima := 2;
    WHEN 'vestibulares_assunto' THEN v_ordem_minima := 3;
    WHEN 'dificuldade_genio'    THEN v_ordem_minima := 3;
    WHEN 'estatisticas_avancadas' THEN v_ordem_minima := 3;
    ELSE v_ordem_minima := 0;
  END CASE;

  RETURN v_plano_ordem >= v_ordem_minima;
END;
$$;

-- 6. Garante acesso de SELECT na tabela planos para usuários autenticados
GRANT SELECT ON public.planos TO authenticated;
GRANT SELECT ON public.planos TO anon;
