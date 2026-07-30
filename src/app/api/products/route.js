import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fallbackData from '@/lib/shopee_fallback.json';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const shopId = url.searchParams.get('shop') || '';
    const brand = url.searchParams.get('brand') || '';
    const sortBy = url.searchParams.get('sort') || 'name'; // 'name', 'price_asc', 'price_desc', 'rating', 'sold'
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    
    const offset = (page - 1) * limit;

    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-supabase-project-id.supabase.co' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder-project.supabase.co';

    if (isSupabaseConfigured) {
      try {
        let query = supabase.from('products').select('*', { count: 'exact' });
        
        if (search) {
          query = query.ilike('product_name', `%${search}%`);
        }
        if (shopId) {
          query = query.eq('shop_id', shopId);
        }
        if (brand) {
          query = query.ilike('brand', `%${brand}%`);
        }
        
        // Sorting
        if (sortBy === 'price_asc') {
          query = query.order('price', { ascending: true });
        } else if (sortBy === 'price_desc') {
          query = query.order('price', { ascending: false });
        } else if (sortBy === 'rating') {
          query = query.order('rating', { ascending: false });
        } else if (sortBy === 'sold') {
          query = query.order('monthly_sold_value', { ascending: false });
        } else {
          query = query.order('product_name', { ascending: true });
        }
        
        // Pagination
        query = query.range(offset, offset + limit - 1);
        
        const { data, count, error } = await query;
        if (error) throw error;
        
        return NextResponse.json({
          products: data,
          total: count,
          page,
          limit
        });
      } catch (e) {
        console.error('Supabase query error, falling back to local JSON:', e);
      }
    }

    // Local JSON Fallback filtering
    let filtered = [...fallbackData.products];
    
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p => p.product_name.toLowerCase().includes(q));
    }
    
    if (shopId) {
      filtered = filtered.filter(p => p.shop_id === shopId);
    }
    
    if (brand) {
      const b = brand.toLowerCase();
      filtered = filtered.filter(p => (p.brand || '').toLowerCase().includes(b));
    }
    
    // Sort local JSON
    filtered.sort((a, b) => {
      if (sortBy === 'price_asc') {
        return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
      } else if (sortBy === 'price_desc') {
        return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
      } else if (sortBy === 'rating') {
        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      } else if (sortBy === 'sold') {
        return (parseFloat(b.monthly_sold_value) || 0) - (parseFloat(a.monthly_sold_value) || 0);
      } else {
        return a.product_name.localeCompare(b.product_name);
      }
    });
    
    const paginated = filtered.slice(offset, offset + limit);
    
    return NextResponse.json({
      products: paginated,
      total: filtered.length,
      page,
      limit
    });

  } catch (error) {
    console.error('API Products Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
