import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Access client-side Supabase environment variables with live default project credentials
const supabaseUrl = 
  import.meta.env.VITE_SUPABASE_URL || 
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_URL || 
  'https://qczsdnmwtagwbofpvwle.supabase.co';

const supabaseAnonKey = 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  'sb_publishable_VwOh-u9h81jDepmpYj2EHQ_yprgrT7D';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

let supabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

// Export single shared client instance
export const supabase: SupabaseClient | null = supabaseInstance;

export const getSupabase = (): SupabaseClient | null => supabaseInstance;
