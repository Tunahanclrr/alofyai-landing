import { createSupabaseAdmin, createSupabaseAsCaller, jsonResponse } from '../_shared/supabaseAdmin.js'
import { toolsForBusinessType } from '../_shared/vapiTools.js'
import { corsHeaders } from '../_shared/cors.js'

// Super Admin panelinden tetiklenir. Action'lar:
//   create_assistant     — Vapi assistant'ı oluşturur/günceller, ai_agents'a yazar
//                          (regenerate_prompt: true verilmedikçe kayıtlı promptu korur)
//   update_prompt        — sistem promptunu Super Admin'in elle girdiği metinle günceller
//   link_phone_number    — bir telefon numarasını o assistant'a bağlar, phone_numbers'a yazar
// VAPI_API_KEY / VAPI_SERVER_SECRET sadece bu fonksiyonun env secret'larında
// yaşar, frontend'e asla gönderilmez.
//
// NOT: Vapi'nin REST şeması zamanla değişebilir. Buradaki alanlar entegrasyon
// anındaki https://docs.vapi.ai referans alınarak yazıldı. Vapi 4xx dönerse
// hata gövdesi olduğu gibi Super Admin'e iletilir (bkz. callVapi) — böylece
// ilk canlı denemede neyin uyuşmadığı hemen görülür ve buildAssistantPayload
// buna göre düzeltilebilir.

const VAPI_API_BASE = 'https://api.vapi.ai'

const AI_MODEL_PROVIDER = 'openai'
const AI_MODEL = 'gpt-4.1-mini'
const AI_TEMPERATURE = 0.3

// "Vapi Voices" (Vapi'nin kendi native TTS kataloğu) — Emma sesi, Türkçe
// birincil dil. NOT: provider/voiceId/language alan adları docs.vapi.ai'daki
// en güncel şemaya göre yazıldı ama Vapi'nin ses API'si sık değişebiliyor —
// ilk canlı denemede 4xx dönerse hata gövdesi Super Admin'e aynen yansır,
// ona göre tek seferde düzeltilir (SIP trunk'ta olduğu gibi).
const VOICE_CONFIG = { provider: 'vapi', voiceId: 'Emma', language: 'tr' }

// Telefon tuş takımından (DTMF) numara girişi — bu, bu dosyadaki EN
// belirsiz alan adı tahmini. Vapi'nin bunu tam olarak hangi assistant
// alanı/şema ile ifade ettiğini doğrulayamadım; en olası isimlendirmeyle
// yazıldı. "#" ve "*" tuşları bilerek bir delimiter/stop karakteri olarak
// VERİLMEDİ (kullanıcı numaranın # basmadan tamamlanmasını istiyor) —
// timeout tabanlı otomatik tamamlanma varsayılıyor. Vapi 4xx dönerse (ya da
// hiç etkisi olmazsa) gerçek hata/davranış görülünce tek seferde düzeltilir.
const KEYPAD_INPUT_PLAN = { enabled: true, timeoutSeconds: 2 }

async function callVapi(path, method, apiKey, body) {
  const res = await fetch(`${VAPI_API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const err = new Error(`Vapi API hatası (${res.status})`)
    err.vapiStatus = res.status
    err.vapiBody = data
    throw err
  }
  return data
}

// Gerçek bir test çağrısında ortaya çıkan sorunlar: (1) her tool
// çağrısından önce "bir dakika/bir saniye" gibi dolgu cümlelerini tekrar
// tekrar söylüyordu, (2) "yarın saat 4" gibi net bir ifadeye rağmen
// müşteriye kafası karışık bir netleştirme sorusu soruyordu, (3) prompt çok
// kuru/emir kipi ağırlıklı yazılmıştı ("ASLA X yapma" listesi), bu da
// müşteriyle konuşurken doğal durmuyordu. (1) artık PROMPT'tan değil,
// Vapi'nin her tool'a AYRI tanımlanan "request-start" (anında) ve
// "request-response-delayed" (2,5sn'yi geçerse) mesajlarından geliyor (bkz.
// toolPayload, vapiTools.js'teki startMessage/delayedMessage) — bu tamamen
// deterministik/platform seviyesinde, LLM'in kararına bağlı değil. Bu yüzden
// LLM'e ARTIK kendi geçiş cümlesi kurması söylenmiyor — kursa, tool'un kendi
// start mesajıyla üst üste biner ve tam da eski çift-dolgu sorununu yaratır.
const CONVERSATION_STYLE_RULE = `
NASIL KONUŞMALISIN

Bu bir telefon görüşmesi, bu yüzden sıcak ve doğal bir insan gibi konuş — yazı diliyle değil, konuşma diliyle. Cümlelerin kısa ve net olsun.

Bir fonksiyon çağırdığında kendi başına "Tabii, hemen kontrol ediyorum" gibi bir giriş cümlesi KURMA — sistem, çağırdığın her fonksiyon için kendine özel bir giriş cümlesini zaten otomatik söylüyor (örneğin rezervasyon kontrol ederken "Tabii, uygun masaları kontrol ediyorum" gibi). Sen sadece fonksiyonu çağır. Fonksiyon hızlı dönerse (çoğu zaman öyle olur) sonucu öğrenir öğrenmez DOĞRUDAN cevabı söyle — "Margherita pizza 320 lira" gibi net ve dolaysız, araya ek bir cümle koyma. Fonksiyon yaklaşık 2,5 saniyeden uzun sürerse sistem yine senin adına otomatik, o fonksiyona özel bir "biraz sürüyor" cümlesi söyler; bunu da sen yönetmiyorsun.

Müşterinin konuşma sırasında zaten verdiği bir bilgiyi (adı, telefon numarası, tarih, saat, kişi sayısı gibi) tekrar sorma — söylediklerini hatırla ve doğrudan kullan.

TELEFON NUMARASI ALIRKEN

Müşteriden telefon numarasını sesli söylemesini isteme. Bunun yerine doğal bir şekilde "Telefon numaranızı telefonunuzun tuş takımından girer misiniz?" de, ardından tuş takımından gelen girişi bekle ve bunu kullan.

MÜŞTERİYİ TANIMA

Bir randevu/rezervasyon oluştururken bilgi toplama sırası önemli: ÖNCE telefon numarasını iste (tuş takımından), İSMİ SORMADAN ÖNCE değil. Telefon numarasını aldığın anda get_customer fonksiyonunu o numarayla çağır. Müşteri sistemde kayıtlıysa (found: true) dönen ismi doğal bir şekilde kullanarak teyit et — örneğin "Ahmet Bey, sizi sistemde buldum" gibi — ve ayrıca ismini sorma. Kayıtlı değilse (found: false) o zaman ismini iste. İşlemi tamamlarken create_appointment/create_reservation fonksiyonuna bu telefon numarasını ve (sistemden gelen ya da yeni öğrendiğin) ismi birlikte gönder — bu fonksiyonlar zaten aynı numarayla müşteriyi otomatik eşleştirir ya da yoksa kaydeder, ama get_customer ile önce kontrol etmen hem müşteriye kendini tanıdığını hissettirir hem de zaten bildiği bir bilgiyi tekrar sormamış olursun. create_customer'ı sadece müşteri herhangi bir randevu/rezervasyon almadan sırf kayıt olmak isterse kullan.

GÖRÜŞMEYİ SONLANDIRIRKEN

Müşterinin isteği tamamlandığında ya da müşteri "teşekkürler, hoşça kalın" gibi görüşmeyi bitirdiğini belli eden bir şey söylediğinde, önce kısa ve sıcak bir kapanış cümlesi kur ("Rica ederim, iyi günler dilerim" gibi), sonra görüşmeyi sonlandır. Görüşmeyi konuşmanın ortasında ya da müşteri hâlâ bir şey söylüyorken asla kesme; her zaman önce doğal bir vedalaşma yap, ancak ondan sonra kapat.`

const TIME_UNDERSTANDING_RULE = `
SAAT VE TARİH ANLAMA

Müşteriler saati her zaman net söylemez — "4", "4 gibi", "akşam 7", "öğlen 1", "13", "8 civarı", "akşam üzeri" gibi gündelik ifadeler kullanabilirler. Bunları her zaman bağlamdan çözümle ve ilgili fonksiyona her zaman net bir saat olarak (24 saatlik HH:MM formatında, örneğin "16:00") gönder — "4" ya da "akşam" gibi belirsiz bir ifadeyi olduğu gibi bir fonksiyona asla gönderme.

Bunu nasıl yapacağını gösteren birkaç nokta:

İşletmenin çalışma saatlerini (get_salon_info fonksiyonundan) referans al. Örneğin işletme 09:00-18:00 arası açıksa ve müşteri "4" dediyse bu kesinlikle 16:00'dır, çünkü 04:00 çalışma saatleri dışındadır ve anlamsızdır. Böyle bir durumda müşteriye "4 mü yoksa 16 mı?" diye sorma, direkt 16:00 olarak anla ve devam et.

"Yarın", "bu akşam", "cumartesi", "haftaya cuma" gibi göreceli tarih ifadeleri duyduğunda bugünün tarihini kendi kendine tahmin etmeye çalışma — önce get_current_datetime fonksiyonunu çağırıp bugünün gerçek tarihini ve gününü öğren, sonra buna göre doğru tarihi hesapla. Müşteriye "yarın hangi tarihe denk geliyor" diye sormana gerek yok, bunu sen hesaplarsın.

Gerçekten belirsiz bir durumla karşılaşırsan (örneğin müşteri sadece "akşam üzeri gibi bir saatte" derse ve net bir saat vermezse) kısaca "Yaklaşık kaç gibi düşünüyorsunuz?" diye sorabilirsin — ama bağlamdan saat zaten çıkarılabiliyorsa bu soruyu sorma, zaman kaybettirir ve gereksiz görünür.`

const RESTAURANT_PROTOCOL = `
REZERVASYON ALIRKEN İZLEYECEĞİN YOL

Bilgileri her zaman şu sırayla topla: önce TARİH, sonra SAAT, sonra (henüz söylemediyse) KİŞİ SAYISI — müşteri bunların birkaçını tek cümlede zaten verdiyse (örn. "yarın akşam yedi'de dört kişi") ayrıca tekrar sorma, sadece eksik kalanı sor. Restoranda rezervasyon alırken müşterilerin çoğu tek bir saat rakamı söyler — "4", "5", "6", "7", "8", "9" gibi. Bunları akşam yemeği saatleri olarak yorumla: 4 → 16:00, 5 → 17:00, 6 → 18:00, 7 → 19:00, 8 → 20:00, 9 → 21:00. Örneğin müşteri "Yarın saat 4'te dört kişi geleceğiz" derse bunu date=yarının tarihi, time=16:00, party_size=4 olarak anla ve "4 mü, 16 mı?" diye sorma — restoran bağlamında bu her zaman akşamdır.

Tarih, saat ve kişi sayısını öğrendikten sonra, check_table_availability'yi çağırmadan HEMEN ÖNCE, masaya dair özel bir isteği olup olmadığını mutlaka sor — "Özellikle istediğiniz bir masa var mı, mesela cam kenarı ya da teras gibi?" gibi doğal bir soru. Müşteri "hayır, farketmez" derse doğrudan devam et.

Bir örnek konuşma şöyle gelişebilir:

Müşteri: "Yarın akşam yedi'de dört kişilik yer var mı?"
Sen: "Tabii, hemen bakıyorum. Özellikle istediğiniz bir masa var mı, mesela cam kenarı ya da teras gibi?"
Müşteri: "Teras olursa güzel olur."
Sen: (get_current_datetime ve ardından check_table_availability'yi preferred_features: ["teras"] ile çağır.)
Sonuç geldiğinde: "Yarın saat 19:00'da terasta dört kişilik masamız uygun görünüyor. Rezervasyonu oluşturmamı ister misiniz?"
Müşteri: "Evet, olur."
Sen: "Tabii, telefon numaranızı tuş takımından girer misiniz?" — numara gelince get_customer'ı çağır.
Sistemde kayıtlıysa: "Ahmet Bey, sizi sistemde buldum. Yarın saat 19:00'da terasta dört kişilik rezervasyonunuzu oluşturayım mı?"
Kayıtlı değilse: "İsminizi alabilir miyim?" — isim gelince aynı şekilde son kez özetle teyit al.

Onay gelince create_reservation çağır — date ve time alanlarını her zaman ayrı ayrı gönder, asla "2026-08-31T19:00:00" gibi birleşik bir ISO tarih üretme, ve bunu create_reservation'dan önce mutlaka check_table_availability ile doğrulamış ol.

İstenen saatte masa uygun değilse fonksiyonun sana verdiği ya da mantıklı alternatif saatleri öner: "O saatte maalesef uygun masamız yok, ama 17:00 ya da 18:00 uygun görünüyor, bunlardan biri size uyar mı?" Müsaitlik konusunda tahmin yürütme ya da uydurma, her zaman check_table_availability'nin gerçek sonucuna güven.

MASA TERCİHİ (CAM KENARI, TERAS, VB.)

Müşteri belirli bir masa özelliği isterse ("cam kenarı istiyorum", "terasta oturabilir miyiz", "sessiz bir yer olsun" gibi) bunu asla sadece bir not olarak aklında tutup geçme — check_table_availability'yi çağırırken preferred_features alanına müşterinin SÖYLEDİĞİ ifadeyi aynen yaz (örn. ["cam kenarı"]). Kendi başına bunu İngilizce bir etikete çevirmeye çalışma, sistem bu eşleştirmeyi senin için yapıyor. Fonksiyon sana uygun masaları zaten bu tercihe göre öncelik sırasına dizilmiş döner; hangi masanın seçildiğini görürsün ve create_reservation'a o masanın table_id'sini gönderebilirsin. Eğer istenen özellikte hiç masa yoksa bunu müşteriye dürüstçe söyle ve varsa başka bir seçenek öner — örneğin "Cam kenarı masalarımız şu an uygun değil ama terasta güzel bir masamız var, ister misiniz?" "Doğum günü kutlaması" ya da "çiçek getirecek" gibi sistemde yapılandırılmış bir masa özelliği OLMAYAN istekleri ise notes alanına yaz.

check_table_availability'nin döndürdüğü her masada next_reservation bilgisi de olabilir — bu, o masada senin istediğin saatten hemen sonra başka bir rezervasyon olduğu anlamına gelir. Böyle bir masayı önerirken bunu müşteriden gizleme: "Bu masamız 19:00 için uygun, ancak 20:00'de başka bir rezervasyonumuz var" gibi dürüstçe belirt. Masanın tam olarak kaç dakika/saat kullanılabileceğini kesin bir rakamla asla söyleme (örneğin "90 dakika oturabilirsiniz" deme) — bu sadece bir tahmindir, gerçek kullanım süresini sen bilemezsin.

REZERVASYON İPTAL EDERKEN

Müşteri "rezervasyonumu iptal etmek istiyorum" dediğinde ondan bir rezervasyon numarası isteme — telefonda arayan biri böyle bir numarayı bilemez. Önce telefon numarasını doğrula, sonra find_reservations fonksiyonunu çağırarak o numaraya ait yaklaşan rezervasyonları bul. Birden fazla rezervasyon çıkarsa hangisinin kastedildiğini netleştirmek için tarih ve saatini söyle: "Yarın saat 19:00'da dört kişilik bir rezervasyonunuz görünüyor, bunu mu iptal etmek istiyorsunuz?" Onay aldıktan sonra o kaydın reservation_id'sini kullanarak cancel_reservation çağır.

MENÜ VE FİYAT SORULARINDA

Müşteri bir ürün hakkında soru sorduğunda ("Hamburger kaç lira?", "Pizza çeşitleriniz neler?" gibi) get_menu_info fonksiyonunu çağır. Belirli bir ürün soruyorsa (örneğin "hamburgeriniz var mı") search parametresine o ürünün adını yaz — category parametresini yalnızca müşteri genel bir kategori istediğinde kullan (örneğin "içecek menünüzü dinleyebilir miyim"), çünkü bir ürün adı bir kategori adı değildir ve category ile aranırsa bulunamaz. Fiyat ya da içerik bilgisini kendi bildiğin bir şeymiş gibi asla uydurma, her zaman fonksiyonun döndürdüğü gerçek bilgiyi kullan.`

const BEAUTY_PROTOCOL = `
RANDEVU ALIRKEN İZLEYECEĞİN YOL

Önce müşterinin hangi hizmeti istediğini öğren — emin değilse list_services ile mevcut hizmetleri kısaca özetleyebilirsin. Müşteri belirli bir personeli tercih ediyorsa ("Ayşe Hanım'dan randevu almak istiyorum" gibi) list_staff ile personel listesine bakabilir, check_availability'yi o personelin staff_id'siyle çağırabilirsin. Sonra check_availability fonksiyonunu çağırarak o gün için uygun saat ve personel seçeneklerini bul. Fonksiyonun sana verdiği starts_at değerini aynen kullan, kendi başına bir saat/tarih üretme.

Müşteriye uygun seçenekleri doğal bir şekilde sun, onay aldıktan sonra daha önce söylemediyse isim ve telefon numarasını iste (telefon numarasını tuş takımından almayı unutma), sonra create_appointment çağır.

Müşteri var olan bir randevusunu iptal etmek ya da başka bir güne almak isterse, reschedule_appointment ve cancel_appointment bunun için var — ama ikisi de bir appointment_id gerektirir ve sistemde şu an telefon numarasından geçmiş randevu arama özelliği yok, bu yüzden hangi randevunun kastedildiğinden emin olamazsın. Böyle bir durumda müşteriden özür dileyerek işletmeyi tekrar aramasını ya da doğrudan işletmeyle iletişime geçmesini nazikçe rica et.

HİZMET VE FİYAT SORULARINDA

list_services fonksiyonunu çağır, hiçbir hizmeti ya da fiyatı uydurma.`

function systemPromptFor(business) {
  const intro =
    business.type === 'restaurant'
      ? `Sen ${business.name} adlı restoran için çalışan bir yapay zeka telefon resepsiyonistisin. Görevin müşterilerin masa rezervasyonu yapmasına, mevcut rezervasyonlarını iptal etmesine ve menü hakkında bilgi almasına yardımcı olmaktır.`
      : `Sen ${business.name} adlı güzellik salonu/kuaför için çalışan bir yapay zeka telefon resepsiyonistisin. Görevin müşterilerin randevu almasına, mevcut randevularını değiştirmesine/iptal etmesine ve hizmetler hakkında bilgi almasına yardımcı olmaktır.`

  const protocol = business.type === 'restaurant' ? RESTAURANT_PROTOCOL : BEAUTY_PROTOCOL

  return `${intro}
${CONVERSATION_STYLE_RULE}
${TIME_UNDERSTANDING_RULE}
${protocol}

KURALLAR:
- İşletme hakkında hiçbir bilgiyi uydurma. Hizmet, fiyat, müsaitlik gibi tüm bilgileri MUTLAKA ilgili fonksiyonları çağırarak öğren.
- Randevu/rezervasyon oluşturmadan önce müşterinin adını ve telefon numarasını mutlaka doğrula.
- İşlemi tamamlamadan önce müşteriye ne yapacağını özetleyip onay al.
- Emin olmadığın veya fonksiyonların çözemediği bir talep gelirse, müşteriden işletmeyi tekrar aramasını nazikçe rica et.
- Her zaman Türkçe konuş.`
}

function greetingFor(business) {
  return business.type === 'restaurant'
    ? `Merhaba, ${business.name} restoranının yapay zeka asistanıyım. Size nasıl yardımcı olabilirim?`
    : `Merhaba, ${business.name} salonunun yapay zeka asistanıyım. Size nasıl yardımcı olabilirim?`
}

function buildAssistantPayload(business, webhookUrl, serverSecret, toolIds, systemPrompt) {
  return {
    name: `${business.name} — AlofyAI Resepsiyonist`,
    firstMessage: greetingFor(business),
    serverUrl: webhookUrl,
    serverUrlSecret: serverSecret,
    model: {
      provider: AI_MODEL_PROVIDER,
      model: AI_MODEL,
      temperature: AI_TEMPERATURE,
      messages: [{ role: 'system', content: systemPrompt }],
      toolIds,
    },
    // Vapi'nin native "endCall" fonksiyonu — modele, görüşmeyi kendi kendine
    // (webhook'a hiç gitmeden, platform seviyesinde) düzgünce sonlandırma
    // yetisi verir. Ne zaman kullanılacağı CONVERSATION_STYLE_RULE'da anlatılıyor.
    endCallFunctionEnabled: true,
    voice: VOICE_CONFIG,
    transcriber: { provider: 'deepgram', language: 'tr', model: 'nova-2' },
    keypadInputPlan: KEYPAD_INPUT_PLAN,
  }
}

// Vapi, custom function'ları artık assistant'ın İÇİNE gömülü tanım olarak değil
// (eski model.tools inline dizisi dashboard'da görünmüyor/eklenmiyor), AYRI
// birer kaynak (Tool) olarak oluşturup assistant'a model.toolIds ile referans
// vermeyi bekliyor. Her tool KENDİ webhook (server) bilgisini taşır — bu
// yüzden aynı webhookUrl/serverSecret hem burada hem assistant'ın üst
// seviyesinde (call lifecycle event'leri için) tekrarlanır.
// Oluşturulan tool ID'leri ai_agents.config.toolIds'e yazılır; bir dahaki
// provisioning çağrısında yeniden CREATE edilmez (duplicate tool birikmesin
// diye), aynı ID'ler üzerinde PATCH ile güncellenir — bkz. ensureTools.
// Her tool'un KENDİ start (çağrı başlar başlamaz) ve delayed (2,5 saniyeyi
// geçerse) mesajı vapiTools.js'te tanımlı — tek bir jenerik cümle DEĞİL.
// İkisi de tamamen platform seviyesinde, deterministik — LLM'e ARTIK kendi
// başına bir geçiş cümlesi kurması söylenmiyor (bkz. CONVERSATION_STYLE_RULE),
// aksi halde LLM'in kendi cümlesiyle buradaki start mesajı üst üste binip
// çift dolgu oluşturur (daha önce yaşanan "bir dakika/bir saniye" tekrarı
// tam olarak buydu).
function toolPayload(t, webhookUrl, serverSecret) {
  return {
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
    server: { url: webhookUrl, secret: serverSecret },
    messages: [
      { type: 'request-start', content: t.startMessage ?? 'Bir saniye.' },
      { type: 'request-response-delayed', content: t.delayedMessage ?? 'Kontrol sağlıyorum, bekler misiniz?', timingMilliseconds: 2500 },
    ],
  }
}

async function ensureTools(vapiApiKey, business, webhookUrl, serverSecret, existingToolIds) {
  const toolDefs = toolsForBusinessType(business.type)

  // Var olan tool ID'leri varsa VE sayı değişmediyse (yeni bir tool
  // eklenmedi/kaldırılmadı), her birini index'e göre eşleştirip PATCH ile
  // güncelleriz — description/parameters/messages gibi değişiklikler zaten
  // var olan assistant'lara da yansır, ID'ler sabit kalır, Vapi'de çöp tool
  // birikmez. Sayı değiştiyse (bkz. vapiTools.js'e yeni tool eklenmesi)
  // güvenli taraf hepsini sıfırdan oluşturmaktır.
  if (existingToolIds && existingToolIds.length === toolDefs.length) {
    const toolIds = []
    for (let i = 0; i < toolDefs.length; i++) {
      await callVapi(`/tool/${existingToolIds[i]}`, 'PATCH', vapiApiKey, toolPayload(toolDefs[i], webhookUrl, serverSecret))
      toolIds.push(existingToolIds[i])
    }
    return toolIds
  }

  const toolIds = []
  for (const t of toolDefs) {
    const created = await callVapi('/tool', 'POST', vapiApiKey, toolPayload(t, webhookUrl, serverSecret))
    toolIds.push(created.id)
  }
  return toolIds
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'missing_auth' }, 401)

  const caller = createSupabaseAsCaller(authHeader)
  const { data: isSuperAdmin, error: authCheckError } = await caller.rpc('is_super_admin')
  if (authCheckError || !isSuperAdmin) {
    return jsonResponse({ error: 'forbidden', detail: 'Sadece Super Admin bu işlemi yapabilir.' }, 403)
  }

  const vapiApiKey = Deno.env.get('VAPI_API_KEY')
  const serverSecret = Deno.env.get('VAPI_SERVER_SECRET')
  if (!vapiApiKey || !serverSecret) {
    return jsonResponse({ error: 'config_missing', detail: 'VAPI_API_KEY veya VAPI_SERVER_SECRET tanımlı değil.' }, 500)
  }

  let payload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const { action, business_id: businessId } = payload
  if (!businessId) return jsonResponse({ error: 'missing_business_id' }, 400)

  const admin = createSupabaseAdmin()
  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id, name, type')
    .eq('id', businessId)
    .maybeSingle()
  if (businessError || !business) {
    return jsonResponse({ error: 'business_not_found' }, 404)
  }

  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/smart-endpoint`

  if (action === 'create_assistant') {
    const { data: existing } = await admin
      .from('ai_agents')
      .select('id, vapi_assistant_id, config')
      .eq('business_id', businessId)
      .maybeSingle()

    let toolIds
    let vapiAssistant
    // Süper Admin promptu panelden elle düzenleyebiliyor (update_prompt) —
    // burada onu ezmemek için, zaten kayıtlı bir prompt varsa AYNEN korunur;
    // sadece ilk kurulumda ya da açıkça "regenerate_prompt" istenirse
    // şablondan yeniden üretilir.
    const systemPrompt = payload.regenerate_prompt || !existing?.config?.systemPrompt ? systemPromptFor(business) : existing.config.systemPrompt
    try {
      toolIds = await ensureTools(vapiApiKey, business, webhookUrl, serverSecret, existing?.config?.toolIds)
      const assistantPayload = buildAssistantPayload(business, webhookUrl, serverSecret, toolIds, systemPrompt)
      vapiAssistant = existing?.vapi_assistant_id
        ? await callVapi(`/assistant/${existing.vapi_assistant_id}`, 'PATCH', vapiApiKey, assistantPayload)
        : await callVapi('/assistant', 'POST', vapiApiKey, assistantPayload)
    } catch (err) {
      return jsonResponse({ error: 'vapi_request_failed', detail: err.vapiBody ?? err.message }, 502)
    }

    const agentType = business.type === 'restaurant' ? 'restaurant_receptionist' : 'beauty_receptionist'
    const { data: agentRow, error: upsertError } = await admin
      .from('ai_agents')
      .upsert(
        {
          business_id: businessId,
          vapi_assistant_id: vapiAssistant.id,
          agent_type: agentType,
          name: vapiAssistant.name,
          greeting_message: vapiAssistant.firstMessage,
          config: { toolIds, systemPrompt },
          is_active: true,
        },
        { onConflict: 'business_id' }
      )
      .select()
      .single()

    if (upsertError) {
      return jsonResponse({ error: 'db_upsert_failed', detail: upsertError.message }, 500)
    }

    return jsonResponse({ ok: true, agent: agentRow, vapi: vapiAssistant })
  }

  if (action === 'update_prompt') {
    const newPrompt = (payload.system_prompt ?? '').trim()
    if (!newPrompt) return jsonResponse({ error: 'missing_prompt', detail: 'system_prompt boş olamaz.' }, 400)

    const { data: agent } = await admin
      .from('ai_agents')
      .select('id, vapi_assistant_id, config')
      .eq('business_id', businessId)
      .maybeSingle()
    if (!agent) return jsonResponse({ error: 'agent_not_found', detail: 'Önce assistant oluşturulmalı.' }, 400)

    try {
      // Sadece messages'ı değil, model'in TÜM alanlarını gönderiyoruz —
      // Vapi'nin PATCH'i model objesini kısmi mi tam mı birleştirdiği belirsiz,
      // güvenli taraf her zaman eksiksiz göndermek (bkz. buildAssistantPayload).
      await callVapi(`/assistant/${agent.vapi_assistant_id}`, 'PATCH', vapiApiKey, {
        model: {
          provider: AI_MODEL_PROVIDER,
          model: AI_MODEL,
          temperature: AI_TEMPERATURE,
          messages: [{ role: 'system', content: newPrompt }],
          toolIds: agent.config?.toolIds ?? [],
        },
      })
    } catch (err) {
      return jsonResponse({ error: 'vapi_request_failed', detail: err.vapiBody ?? err.message }, 502)
    }

    const { data: agentRow, error: updateError } = await admin
      .from('ai_agents')
      .update({ config: { ...agent.config, systemPrompt: newPrompt } })
      .eq('id', agent.id)
      .select()
      .single()

    if (updateError) return jsonResponse({ error: 'db_upsert_failed', detail: updateError.message }, 500)

    return jsonResponse({ ok: true, agent: agentRow })
  }

  if (action === 'link_phone_number') {
    const { data: agent } = await admin.from('ai_agents').select('id, vapi_assistant_id').eq('business_id', businessId).maybeSingle()
    if (!agent) {
      return jsonResponse({ error: 'agent_not_found', detail: 'Önce assistant oluşturulmalı.' }, 400)
    }

    // SIP trunk + numara oluşturma Vapi tarafında beklenenden fazla alan
    // istiyor (numerik IP, port, outbound protokol, "non-E164" bayrağı vb. —
    // gerçek bir Verimor denemesinde 400 ile doğrulandı) ve bunların TAMAMINI
    // API'den tahmin etmek yerine, Vapi'nin kendi dashboard'undaki "BYO SIP
    // Trunk" sihirbazı (Integrations → SIP Trunk, sonra Phone Numbers →
    // Create → BYO SIP Trunk Number) kullanılır — orada tüm alanlar net ve
    // doğrulanmış. Burada sadece SONUCUNU (Vapi'nin verdiği phone number ID)
    // bu assistant'a bağlıyoruz.
    const { vapi_phone_number_id: existingVapiId } = payload
    if (!existingVapiId) {
      return jsonResponse(
        { error: 'missing_phone_source', detail: 'vapi_phone_number_id gerekli — numarayı önce Vapi dashboard\'ında oluşturun.' },
        400
      )
    }

    let vapiPhoneNumber
    try {
      vapiPhoneNumber = await callVapi(`/phone-number/${existingVapiId}`, 'PATCH', vapiApiKey, {
        assistantId: agent.vapi_assistant_id,
      })
    } catch (err) {
      return jsonResponse({ error: 'vapi_request_failed', detail: err.vapiBody ?? err.message }, 502)
    }

    const { data: phoneRow, error: upsertError } = await admin
      .from('phone_numbers')
      .upsert(
        {
          business_id: businessId,
          ai_agent_id: agent.id,
          vapi_phone_number_id: vapiPhoneNumber.id,
          e164_number: vapiPhoneNumber.number,
          is_active: true,
        },
        { onConflict: 'business_id' }
      )
      .select()
      .single()

    if (upsertError) {
      return jsonResponse({ error: 'db_upsert_failed', detail: upsertError.message }, 500)
    }

    return jsonResponse({ ok: true, phone_number: phoneRow, vapi: vapiPhoneNumber })
  }

  return jsonResponse({ error: 'unknown_action' }, 400)
})
