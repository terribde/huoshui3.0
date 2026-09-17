import { supabase } from './lib/supabase'

export async function testSupabase() {
  if (!supabase) {
    console.warn('Supabase 未配置或未连接')
    return
  }

  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .limit(5)

  console.log('Supabase data:', data)
  console.log('Supabase error:', error)
}