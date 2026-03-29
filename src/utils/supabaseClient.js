import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL: Supabase environment variables are missing. Check your .env file or build settings.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '')
