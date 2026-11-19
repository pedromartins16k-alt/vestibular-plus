import { createClient } from '@supabase/supabase-js';

const E2E_TEST_USER_ID = 'a3c88ff0-71b7-45d9-88f3-db8705b46195';
const E2E_TITLE_PREFIX = '[E2E_CORRECAO_TESTE:';

function responder(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return responder(res, 405, { error: 'Método não permitido.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return responder(res, 401, { error: 'Não autorizado.' });

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return responder(res, 503, { error: 'Serviço de limpeza de teste indisponível.' });
  }

  try {
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
    const user = authData?.user;

    if (authError || !user?.id) return responder(res, 401, { error: 'Sessão inválida.' });
    if (user.id !== E2E_TEST_USER_ID) return responder(res, 403, { error: 'Operação restrita à conta dedicada de teste.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const redacaoId = typeof body.redacaoId === 'string' ? body.redacaoId.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(redacaoId)) {
      return responder(res, 400, { error: 'ID de redação inválido.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
    const { data: redacao, error: erroConsulta } = await supabaseAdmin
      .from('redacoes')
      .select('id, titulo')
      .eq('id', redacaoId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (erroConsulta) {
      console.error('[e2e-cleanup] Falha ao localizar redação:', erroConsulta.code || 'erro');
      return responder(res, 500, { error: 'Não foi possível localizar a redação de teste.' });
    }

    if (!redacao) {
      return responder(res, 200, { sucesso: true, removidos: { avaliacoes: 0, redacoes: 0 } });
    }
    if (typeof redacao.titulo !== 'string' || !redacao.titulo.startsWith(E2E_TITLE_PREFIX)) {
      return responder(res, 403, { error: 'O registro não está marcado como dado criado pelo E2E.' });
    }

    const { data: avaliacoesRemovidas, error: erroAvaliacoes } = await supabaseAdmin
      .from('redacao_avaliacoes')
      .delete()
      .eq('redacao_id', redacaoId)
      .eq('user_id', user.id)
      .select('id');

    if (erroAvaliacoes) {
      console.error('[e2e-cleanup] Falha ao remover avaliações:', erroAvaliacoes.code || 'erro');
      return responder(res, 500, { error: 'Não foi possível remover a avaliação de teste.' });
    }

    const { data: redacoesRemovidas, error: erroRedacao } = await supabaseAdmin
      .from('redacoes')
      .delete()
      .eq('id', redacaoId)
      .eq('user_id', user.id)
      .eq('titulo', redacao.titulo)
      .select('id');

    if (erroRedacao) {
      console.error('[e2e-cleanup] Falha ao remover redação:', erroRedacao.code || 'erro');
      return responder(res, 500, { error: 'Não foi possível remover a redação de teste.' });
    }

    return responder(res, 200, {
      sucesso: true,
      removidos: {
        avaliacoes: avaliacoesRemovidas?.length || 0,
        redacoes: redacoesRemovidas?.length || 0
      }
    });
  } catch (erro) {
    console.error('[e2e-cleanup] Erro inesperado:', erro?.name || 'Error');
    return responder(res, 500, { error: 'Falha ao limpar os dados de teste.' });
  }
}
