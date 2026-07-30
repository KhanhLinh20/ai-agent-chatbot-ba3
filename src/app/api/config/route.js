import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    geminiConfigured: !!(
      process.env.GEMINI_API_KEY && 
      process.env.GEMINI_API_KEY !== 'your-gemini-api-key-here' &&
      process.env.GEMINI_API_KEY.trim() !== ''
    ),
    openaiConfigured: !!(
      process.env.OPENAI_API_KEY && 
      process.env.OPENAI_API_KEY !== 'your-openai-api-key-here' &&
      process.env.OPENAI_API_KEY.trim() !== ''
    ),
    supabaseConfigured: !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder-project.supabase.co' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-supabase-project-id.supabase.co'
    )
  });
}
