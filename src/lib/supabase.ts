import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Access client-side Supabase environment variables with live default project credentials
const supabaseUrl = 
  import.meta.env.VITE_SUPABASE_URL || 
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_URL || 
  'https://qczsdnmwtagwbofpvwle.supabase.co';

const supabaseAnonKey = 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  'sb_publishable_VwOh-u9h81jDepmpYj2EHQ_yprgrT7D';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
};

// Export direct client helper (falls back gracefully if not configured)
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
