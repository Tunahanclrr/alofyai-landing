import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './cors.js'

// Servis rolüyle (RLS bypass) çalışan, sadece Edge Function içinde kullanılan
// güvenilir istemci. Bu dosya HİÇBİR ZAMAN frontend'e taşınmaz.
export function createSupabaseAdmin() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
}

// Çağıranın KENDİ JWT'siyle (RLS'e tabi) çalışan istemci — "bu isteği atan
// gerçekten super admin mi" gibi kontroller için.
export function createSupabaseAsCaller(authHeader) {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
