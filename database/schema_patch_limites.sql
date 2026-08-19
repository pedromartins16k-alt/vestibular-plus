-- 1. Aumenta os limites do plano Free para 15 questões, 10 resumos e 5 simulados
UPDATE public.planos
SET 
  limite_questoes_dia = 15,
  limite_resumos_dia = 10,
  limite_simulados_semana = 5
WHERE nome = 'free';

-- 2. Tabela de controle de uso diário com fuso de Brasília
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

-- 3. Função para apenas CONSULTAR se o limite foi atingido (sem gastar/incrementar ao navegar)
CREATE OR REPLACE FUNCTION public.consultar_uso_diario(p_tipo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plano_nome text;
  v_limite int;
  v_data_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_usado int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', 'anonimo');
  END IF;

  SELECT COALESCE(pl.nome, 'free') INTO v_plano_nome
  FROM public.profiles pr
  LEFT JOIN public.planos pl ON pl.id = pr.plano_id
  WHERE pr.id = v_user_id;

  IF v_plano_nome IS NULL THEN
    v_plano_nome := 'free';
  END IF;

  IF v_plano_nome IN ('basic', 'pro', 'premium', 'ultimate') THEN
    RETURN jsonb_build_object('permitido', true, 'plano', v_plano_nome);
  END IF;

  IF p_tipo = 'questao' THEN
    SELECT COALESCE(limite_questoes_dia, 15) INTO v_limite FROM public.planos WHERE nome = 'free';
    IF v_limite IS NULL THEN v_limite := 15; END IF;
  ELSIF p_tipo = 'resumo' THEN
    SELECT COALESCE(limite_resumos_dia, 10) INTO v_limite FROM public.planos WHERE nome = 'free';
    IF v_limite IS NULL THEN v_limite := 10; END IF;
  ELSIF p_tipo = 'simulado' THEN
    SELECT COALESCE(limite_simulados_semana, 5) INTO v_limite FROM public.planos WHERE nome = 'free';
    IF v_limite IS NULL THEN v_limite := 5; END IF;
  ELSE
    RETURN jsonb_build_object('permitido', true);
  END IF;

  SELECT COALESCE(quantidade, 0) INTO v_usado
  FROM public.uso_recursos
  WHERE user_id = v_user_id AND tipo = p_tipo AND data = v_data_hoje;

  IF v_usado >= v_limite THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'limite_diario', 'usado', v_usado, 'limite', v_limite);
  END IF;

  RETURN jsonb_build_object('permitido', true, 'usado', v_usado, 'limite', v_limite);
END;
$$;

-- 4. Função para REGISTRAR o uso (só incrementa quando o aluno responde ou consome)
CREATE OR REPLACE FUNCTION public.verificar_e_registrar_uso(p_tipo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plano_nome text;
  v_limite int;
  v_data_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_usado int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', 'anonimo');
  END IF;

  SELECT COALESCE(pl.nome, 'free') INTO v_plano_nome
  FROM public.profiles pr
  LEFT JOIN public.planos pl ON pl.id = pr.plano_id
  WHERE pr.id = v_user_id;

  IF v_plano_nome IS NULL THEN
    v_plano_nome := 'free';
  END IF;

  IF v_plano_nome IN ('basic', 'pro', 'premium', 'ultimate') THEN
    RETURN jsonb_build_object('permitido', true, 'plano', v_plano_nome);
  END IF;

  IF p_tipo = 'questao' THEN
    SELECT COALESCE(limite_questoes_dia, 15) INTO v_limite FROM public.planos WHERE nome = 'free';
    IF v_limite IS NULL THEN v_limite := 15; END IF;
  ELSIF p_tipo = 'resumo' THEN
    SELECT COALESCE(limite_resumos_dia, 10) INTO v_limite FROM public.planos WHERE nome = 'free';
    IF v_limite IS NULL THEN v_limite := 10; END IF;
  ELSIF p_tipo = 'simulado' THEN
    SELECT COALESCE(limite_simulados_semana, 5) INTO v_limite FROM public.planos WHERE nome = 'free';
    IF v_limite IS NULL THEN v_limite := 5; END IF;
  ELSE
    RETURN jsonb_build_object('permitido', true);
  END IF;

  SELECT COALESCE(quantidade, 0) INTO v_usado
  FROM public.uso_recursos
  WHERE user_id = v_user_id AND tipo = p_tipo AND data = v_data_hoje;

  IF v_usado >= v_limite THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'limite_diario', 'usado', v_usado, 'limite', v_limite);
  END IF;

  INSERT INTO public.uso_recursos (user_id, tipo, data, quantidade)
  VALUES (v_user_id, p_tipo, v_data_hoje, 1)
  ON CONFLICT (user_id, tipo, data)
  DO UPDATE SET quantidade = public.uso_recursos.quantidade + 1
  RETURNING quantidade INTO v_usado;

  RETURN jsonb_build_object('permitido', true, 'usado', v_usado, 'limite', v_limite);
END;
$$;

-- 5. Reseta os contadores de hoje para destravar seu acesso imediatamente
DELETE FROM public.uso_recursos WHERE data = (now() AT TIME ZONE 'America/Sao_Paulo')::date;