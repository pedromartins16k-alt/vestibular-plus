import { createClient } from '@supabase/supabase-js';

// As chaves vêm de variáveis de ambiente (arquivo .env na raiz do projeto).
// NUNCA coloque a chave "service_role" no frontend — apenas a "anon public".
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Variáveis de ambiente ausentes. Verifique o arquivo .env ' +
    '(VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
