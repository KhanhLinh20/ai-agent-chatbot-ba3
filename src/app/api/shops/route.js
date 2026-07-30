import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fallbackData from '@/lib/shopee_fallback.json';

export async function GET() {
  try {
    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-supabase-project-id.supabase.co' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder-project.supabase.co';

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('shops').select('*').order('shop_name');
        if (error) throw error;
        return NextResponse.json(data);
      } catch (e) {
        console.error('Supabase query error, falling back to local JSON:', e);
      }
    }

    // Fallback
    const sortedShops = [...fallbackData.shops];
    sortedShops.sort((a, b) => a.shop_name.localeCompare(b.shop_name));
    return NextResponse.json(sortedShops);

  } catch (error) {
    console.error('API Shops Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
