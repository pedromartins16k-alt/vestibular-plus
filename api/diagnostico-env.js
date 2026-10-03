/**
 * /api/diagnostico-env.js — Endpoint de diagnóstico seguro de variáveis de ambiente
 *
 * Retorna apenas a PRESENÇA (true/false) das variáveis necessárias ao backend.
 * NUNCA expõe os valores. Para uso exclusivo de diagnóstico em produção.
 *
 * Proteções:
 *   1. Requer Bearer Token válido do Supabase (sessão autenticada).
 *   2. Requer header X-VP-Diag: 1 para evitar chamadas acidentais de rastreadores/bots.
 *   3. Nunca expõe valores de chaves — apenas true/false.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido. Utilize GET.' });
  }

  // Proteção 1: header de intenção explícita (evita rastreadores e chamadas acidentais)
  const diagHeader = req.headers['x-vp-diag'];
  if (diagHeader !== '1') {
    return res.status(404).json({ error: 'Recurso não encontrado.' });
  }

  // Proteção 2: Bearer token obrigatório
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação obrigatório.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  // Se variáveis Supabase ausentes — reportar sem validar token
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(200).json({
      diagnostico: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
        SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
        VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        GROQ_API_KEY: !!process.env.GROQ_API_KEY,
        GROQ_MODEL: process.env.GROQ_MODEL || '(padrão: openai/gpt-oss-120b)',
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        cliente_insert_usara: 'INDETERMINADO (variáveis Supabase ausentes)'
      },
      aviso: 'Variáveis SUPABASE_URL ou SUPABASE_ANON_KEY ausentes — backend não funcional.'
    });
  }

  // Proteção 3: valida que o token é autêntico (sessão real do Supabase)
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData?.user?.id) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
  } catch (_) {
    return res.status(401).json({ error: 'Falha ao validar token.' });
  }

  const serviceKeyPresente = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return res.status(200).json({
    diagnostico: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
      supabase_url_prefixo: supabaseUrl
        ? 'https://' + supabaseUrl.replace(/^https?:\/\//, '').substring(0, 8) + '...'
        : null,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: serviceKeyPresente,
      GROQ_API_KEY: !!process.env.GROQ_API_KEY,
      GROQ_MODEL: process.env.GROQ_MODEL || '(padrão: openai/gpt-oss-120b)',
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      cliente_insert_usara: serviceKeyPresente
        ? 'service_role (admin — RLS bypassado)'
        : 'user_token (sujeito a RLS — INSERT pode falhar se policy não permitir)'
    },
    status: 'ok'
  });
}
