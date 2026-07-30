import { createClient } from '@supabase/supabase-js';

// Use placeholder dummy values to prevent build-time crashes if environment variables are empty
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials are missing from environment variables (.env.local). Falling back to local JSON database simulation.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
