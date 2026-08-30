// Tarayıcıdan (Super Admin paneli) çağrılan fonksiyonlar (vapi-provision) için
// gerekli. smart-endpoint sunucudan sunucuya (Vapi) çağrıldığı için CORS
// teknik olarak gerekmez ama zararı yok, tutarlılık için o da kullanıyor.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vapi-secret',
}
