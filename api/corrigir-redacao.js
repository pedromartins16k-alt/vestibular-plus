/**
 * /api/corrigir-redacao.js — Endpoint Serverless Vercel Seguro
 * 
 * Responsabilidades:
 *  - Aceita apenas POST.
 *  - Valida o token JWT do Supabase recebido no header Authorization.
 *  - Confirma a propriedade da redação (impede acessar redação de outro usuário).
 *  - Obtém os dados confiáveis da redação (texto, título, vestibular) exclusivamente do banco de dados.
 *  - Invoca o serviço desacoplado de IA no servidor com matriz de critérios da banca.
 *  - Normaliza e valida a resposta da IA.
 *  - Tenta persistir a avaliação em public.redacao_avaliacoes se a tabela existir.
 *  - Retorna relatório completo com transparência pedagógica e de persistência.
 */

import { createClient } from '@supabase/supabase-js';
import { avaliarRedacaoComIA } from './_ai-service.js';

// Matrizes de bancas oficiais para servir de referência no servidor
const CRITERIOS_BANCAS = {
  enem: {
    nome: 'ENEM — Exame Nacional do Ensino Médio',
    tipo_genero: 'Dissertativo-argumentativo em prosa',
    pontuacao_maxima: 1000,
    competencias: [
      { numero: 1, nome: 'Domínio da norma culta escrita', peso: 200, descricao: 'Demonstrar domínio da modalidade escrita formal da língua portuguesa.' },
      { numero: 2, nome: 'Compreensão da proposta e aplicação de repertório', peso: 200, descricao: 'Compreender a proposta e aplicar conceitos das várias áreas do conhecimento dentro da estrutura dissertativa.' },
      { numero: 3, nome: 'Seleção, organização e interpretação de argumentos', peso: 200, descricao: 'Selecionar, relacionar, organizar e interpretar informações em defesa de um ponto de vista.' },
      { numero: 4, nome: 'Demonstração de recursos coesivos', peso: 200, descricao: 'Demonstrar conhecimento dos mecanismos linguísticos necessários para a argumentação.' },
      { numero: 5, nome: 'Proposta de intervenção social', peso: 200, descricao: 'Elaborar proposta de intervenção para o problema abordado respeitando os direitos humanos.' }
    ]
  },
  fuvest: {
    nome: 'FUVEST — Universidade de São Paulo (USP)',
    tipo_genero: 'Dissertativo-argumentativo em prosa',
    pontuacao_maxima: 50,
    competencias: [
      { numero: 1, nome: 'Abordagem do tema e capacidade de reflexão crítica', peso: 20, descricao: 'Compreensão da tese em debate, densidade reflexiva e autonomia intelectual sem clichês.' },
      { numero: 2, nome: 'Estrutura argumentativa e coesão textual', peso: 15, descricao: 'Progressão lógica do raciocínio, articulação coerente entre premissas e conclusões.' },
      { numero: 3, nome: 'Domínio da expressão escrita e precisão vocabular', peso: 15, descricao: 'Correção gramatical, concisão, clareza, variedade lexical e registro culto.' }
    ]
  },
  unicamp: {
    nome: 'UNICAMP — Universidade Estadual de Campinas',
    tipo_genero: 'Gêneros discursivos situados',
    pontuacao_maxima: 48,
    competencias: [
      { numero: 1, nome: 'Cumprimento da proposta e interlocução do gênero', peso: 16, descricao: 'Construção da voz autoral, interlocutor específico e adequação integral à máscara discursiva.' },
      { numero: 2, nome: 'Articulação de argumentos e uso da coletânea', peso: 16, descricao: 'Leitura crítica dos textos motivadores sem cópia mecânica, com posicionamento substantivo.' },
      { numero: 3, nome: 'Coesão, coerência e convenções da escrita', peso: 16, descricao: 'Fluidez dos elos sintáticos e sintaxe conforme a norma padrão.' }
    ]
  },
  unesp: {
    nome: 'UNESP — Universidade Estadual Paulista',
    tipo_genero: 'Dissertativo-argumentativo em prosa',
    pontuacao_maxima: 28,
    competencias: [
      { numero: 1, nome: 'Tema e gênero dissertativo', peso: 11, descricao: 'Adequação ao tema proposto e aos elementos do gênero dissertativo.' },
      { numero: 2, nome: 'Coerência dos argumentos e articulação', peso: 9, descricao: 'Coerência entre os argumentos e progressão textual.' },
      { numero: 3, nome: 'Coesão e domínio da norma culta', peso: 8, descricao: 'Correção gramatical, pontuação, acentuação e vocabulário formal.' }
    ]
  }
};

/**
 * Helper para responder de forma consistente e segura
 */
function responderJson(res, statusCode, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.status(statusCode).json(body);
}

export default async function handler(req, res) {
  // 1. Apenas POST permitido
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return responderJson(res, 405, { error: 'Método não permitido. Utilize POST.' });
  }

  try {
    // 2. Extração do Bearer Token
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    if (!token) {
      return responderJson(res, 401, {
        error: 'Não autorizado: token de autenticação não fornecido no cabeçalho Authorization.'
      });
    }

    // 3. Validação das variáveis do Supabase no ambiente
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return responderJson(res, 500, {
        error: 'Erro de configuração do servidor: variáveis do Supabase ausentes.'
      });
    }

    // Cliente com o token do usuário para checar identidade
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return responderJson(res, 401, {
        error: 'Sessão inválida ou expirada. Faça login novamente no Vestibular+.'
      });
    }

    const authenticatedUserId = userData.user.id;

    // 4. Validação dos dados recebidos no body
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        return responderJson(res, 400, { error: 'Corpo da requisição inválido (JSON malformado).' });
      }
    }

    const redacaoId = body?.redacaoId;
    if (!redacaoId || typeof redacaoId !== 'string') {
      return responderJson(res, 400, {
        error: 'Parâmetro obrigatório ausente: "redacaoId" deve ser uma string identificadora.'
      });
    }

    // 5. Consulta da redação no Supabase com validação estrita de propriedade
    // Usa supabaseUser (respeita RLS) e/ou consulta com serviceKey para verificar existência e propriedade
    const { data: redacao, error: redacaoError } = await supabaseUser
      .from('redacoes')
      .select('*')
      .eq('id', redacaoId)
      .maybeSingle();

    if (redacaoError) {
      console.error('[corrigir-redacao] Erro ao consultar redação:', redacaoError.message);
      return responderJson(res, 500, { error: 'Falha ao consultar a redação no banco de dados.' });
    }

    // Se não encontrou pelo token do usuário, verifica se ela existe com outro user_id (se tiver serviceKey)
    if (!redacao) {
      if (supabaseServiceKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false }
        });
        const { data: outraRedacao } = await supabaseAdmin
          .from('redacoes')
          .select('id, user_id')
          .eq('id', redacaoId)
          .maybeSingle();

        if (outraRedacao && outraRedacao.user_id !== authenticatedUserId) {
          return responderJson(res, 403, {
            error: 'Acesso negado: a redação informada pertence a outro usuário.'
          });
        }
      }
      return responderJson(res, 404, { error: 'Redação não encontrada no banco de dados.' });
    }

    // Garantia dupla de propriedade
    if (redacao.user_id !== authenticatedUserId) {
      return responderJson(res, 403, {
        error: 'Acesso negado: a redação informada não pertence ao usuário autenticado.'
      });
    }

    const textoRedacao = redacao.conteudo || redacao.texto || '';
    if (!textoRedacao || textoRedacao.trim().length < 50) {
      return responderJson(res, 400, {
        error: 'O texto da redação é insuficiente para avaliação por competências (mínimo de 50 caracteres).'
      });
    }

    // 6. Matriz de critérios da banca
    const bancaId = (redacao.vestibular_id || redacao.banca || 'enem').toLowerCase();
    const matriz = CRITERIOS_BANCAS[bancaId] || CRITERIOS_BANCAS.enem;
    const tema = redacao.titulo || redacao.titulo_proposta || 'Tema de vestibular';

    // 7. Chamada ao provedor de IA desacoplado no servidor
    let avaliacaoIA;
    try {
      avaliacaoIA = await avaliarRedacaoComIA({
        tema,
        vestibular: bancaId,
        matriz,
        texto: textoRedacao
      });
    } catch (errIA) {
      console.error('[corrigir-redacao] Erro na chamada de IA:', errIA.message);
      if (errIA.isConfigError) {
        return responderJson(res, 503, {
          error: errIA.message,
          tipo: 'CONFIGURACAO_IA_PENDENTE'
        });
      }
      return responderJson(res, 502, {
        error: `Não foi possível obter a correção do provedor de IA: ${errIA.message}`
      });
    }

    // 8. Persistência na tabela public.redacao_avaliacoes
    // O INSERT é feito no backend após validação estrita de token, identidade e propriedade da redação.
    // O user_id é sempre o authenticatedUserId do JWT validado, nunca confiado ao cliente.
    // Se supabaseServiceKey estiver disponível, utiliza o cliente administrativo para garantir a gravação segura no backend.
    let persistidoNoBanco = false;
    let avaliacaoIdBanco = null;
    let pendenciaPersistencia = null;

    try {
      const payloadAvaliacao = {
        redacao_id: redacao.id,
        user_id: authenticatedUserId,
        tipo_avaliacao: 'ia',
        modelo_ia: avaliacaoIA.modelo_utilizado,
        nota_total: avaliacaoIA.nota_total,
        nota_maxima: avaliacaoIA.nota_maxima,
        competencias: avaliacaoIA.competencias,
        pontos_fortes: avaliacaoIA.pontos_fortes,
        pontos_melhoria: avaliacaoIA.pontos_melhoria,
        exemplos_trechos: avaliacaoIA.exemplos_trechos || [],
        sugestoes: avaliacaoIA.sugestoes,
        prioridades_estudo: avaliacaoIA.prioridades_estudo || [],
        feedback_geral: avaliacaoIA.feedback_geral,
        status: 'concluida'
      };

      // Cliente apropriado para a gravação no backend
      const supabaseDb = supabaseServiceKey
        ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
        : supabaseUser;

      const { data: insertedAvaliacao, error: insertAvaliacaoError } = await supabaseDb
        .from('redacao_avaliacoes')
        .insert(payloadAvaliacao)
        .select('id')
        .maybeSingle();

      if (!insertAvaliacaoError && insertedAvaliacao?.id) {
        persistidoNoBanco = true;
        avaliacaoIdBanco = insertedAvaliacao.id;

        // Atualização opcional do status da redação na tabela public.redacoes
        // Nota: O schema aceita os status 'rascunho', 'aguardando_correcao', 'corrigida'
        // e utiliza a coluna 'updated_at' (não 'atualizado_em').
        // Esta operação é tratada de forma estritamente isolada: caso a política RLS
        // ou constraints impeçam o update, a avaliação gravada NÃO é comprometida.
        try {
          const { error: errUpdateRedacao } = await supabaseDb
            .from('redacoes')
            .update({
              status: 'corrigida',
              updated_at: new Date().toISOString()
            })
            .eq('id', redacao.id);

          if (errUpdateRedacao) {
            console.warn(
              '[corrigir-redacao] Aviso: Não foi possível atualizar status em redacoes:',
              errUpdateRedacao.code || errUpdateRedacao.message
            );
          }
        } catch (errStatus) {
          console.warn('[corrigir-redacao] Exceção ao atualizar status em redacoes:', errStatus?.message);
        }
      } else {
        pendenciaPersistencia = insertAvaliacaoError?.message || 'Tabela redacao_avaliacoes não acessível';
        console.warn(
          '[corrigir-redacao] Falha na persistência de redacao_avaliacoes:',
          insertAvaliacaoError?.code || insertAvaliacaoError?.message
        );
      }
    } catch (errPersist) {
      pendenciaPersistencia = errPersist?.message || 'Erro inesperado na persistência';
      console.warn('[corrigir-redacao] Exceção ao persistir avaliação:', errPersist?.message);
    }

    // 9. Resposta de sucesso estruturada
    return responderJson(res, 200, {
      sucesso: true,
      redacao_id: redacao.id,
      avaliacao_id: avaliacaoIdBanco,
      persistido_no_banco: persistidoNoBanco,
      pendencia_persistencia: pendenciaPersistencia,
      banca: {
        id: bancaId,
        nome: matriz.nome,
        pontuacao_maxima: matriz.pontuacao_maxima
      },
      avaliacao: avaliacaoIA
    });

  } catch (errGeral) {
    console.error('[corrigir-redacao] Erro inesperado:', errGeral);
    return responderJson(res, 500, {
      error: 'Ocorreu um erro interno ao processar a solicitação de correção.'
    });
  }
}
