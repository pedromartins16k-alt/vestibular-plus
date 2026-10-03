/**
 * /api/diagnostico-env.js — Endpoint de diagnóstico seguro de variáveis de ambiente
 *
 * Retorna apenas a PRESENÇA (true/false) das variáveis necessárias ao backend.
 * NUNCA expõe os valores. Para uso exclusivo de diagnóstico em produção.
 *
 * Protegido por Bearer Token — apenas usuários autenticados podem acessar.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido. Utilize GET.' });
  }

  // Requer autenticação mínima (Bearer token)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação obrigatório.' });
  }

  // Valida que o token é autêntico (não necessariamente service_role)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(200).json({
      diagnostico: {
        SUPABASE_URL: false,
        VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
        SUPABASE_ANON_KEY: false,
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

  // Valida token sem expor erros internos
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
      supabase_url_efetivo: supabaseUrl ? supabaseUrl.replace(/\/\/.*?@/, '//***@').substring(0, 40) + '...' : null,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: serviceKeyPresente,
      GROQ_API_KEY: !!process.env.GROQ_API_KEY,
      GROQ_MODEL: process.env.GROQ_MODEL || '(padrão: openai/gpt-oss-120b)',
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      cliente_insert_usara: serviceKeyPresente ? 'service_role (admin — RLS bypassado)' : 'user_token (sujeito a RLS)'
    },
    status: 'ok'
  });
}
