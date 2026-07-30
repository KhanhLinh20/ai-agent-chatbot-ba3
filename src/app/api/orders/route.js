import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase/admin';
import fs from 'fs';
import path from 'path';

const ORDERS_FILE_PATH = path.join(process.cwd(), 'src', 'lib', 'orders.json');

// Helper to read orders from local file
function readLocalOrders() {
  try {
    if (!fs.existsSync(ORDERS_FILE_PATH)) {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(ORDERS_FILE_PATH), { recursive: true });
      fs.writeFileSync(ORDERS_FILE_PATH, '[]', 'utf-8');
      return [];
    }
    const data = fs.readFileSync(ORDERS_FILE_PATH, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (e) {
    console.error('Error reading local orders:', e);
    return [];
  }
}

// Helper to write orders to local file
function writeLocalOrders(orders) {
  try {
    fs.mkdirSync(path.dirname(ORDERS_FILE_PATH), { recursive: true });
    fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error writing local orders:', e);
    return false;
  }
}

export async function GET() {
  try {
    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-supabase-project-id.supabase.co' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder-project.supabase.co';

    if (isSupabaseConfigured) {
      try {
        const database = createAdminClient() ?? supabase;
        const { data, error } = await database
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        return NextResponse.json(data);
      } catch (e) {
        console.error('Supabase query error, falling back to local JSON:', e);
      }
    }

    // Local JSON
    const orders = readLocalOrders();
    // Sort by created_at desc
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return NextResponse.json(orders);

  } catch (error) {
    console.error('API GET Orders Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { customer_name, customer_phone, customer_address, items, total_amount } = body;
    
    if (!customer_name || !customer_phone || !customer_address || !items || !total_amount) {
      return NextResponse.json({ error: 'Missing required order fields' }, { status: 400 });
    }

    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-supabase-project-id.supabase.co' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder-project.supabase.co';

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .insert({
            customer_name,
            customer_phone,
            customer_address,
            items,
            total_amount
          })
          .select()
          .single();
          
        if (error) throw error;
        return NextResponse.json(data);
      } catch (e) {
        console.error('Supabase insert error, falling back to local JSON:', e);
      }
    }

    // Local JSON Fallback
    const orders = readLocalOrders();
    const mockId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const newOrder = {
      order_id: mockId,
      customer_name,
      customer_phone,
      customer_address,
      items,
      total_amount,
      status: 'Pending',
      created_at: new Date().toISOString()
    };
    
    orders.push(newOrder);
    writeLocalOrders(orders);
    
    return NextResponse.json(newOrder);

  } catch (error) {
    console.error('API POST Order Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();
    const { order_id, status } = body;
    
    if (!order_id || !status) {
      return NextResponse.json({ error: 'order_id and status are required' }, { status: 400 });
    }

    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-supabase-project-id.supabase.co' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder-project.supabase.co';

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .update({ status })
          .eq('order_id', order_id)
          .select()
          .single();
          
        if (error) throw error;
        return NextResponse.json(data);
      } catch (e) {
        console.error('Supabase update error, falling back to local JSON:', e);
      }
    }

    // Local JSON Fallback
    const orders = readLocalOrders();
    const orderIdx = orders.findIndex(o => o.order_id === order_id);
    
    if (orderIdx === -1) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    
    orders[orderIdx].status = status;
    writeLocalOrders(orders);
    
    return NextResponse.json(orders[orderIdx]);

  } catch (error) {
    console.error('API PUT Order Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
