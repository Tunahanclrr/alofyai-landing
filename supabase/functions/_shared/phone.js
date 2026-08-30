// SQL'deki normalize_tr_phone() ile BİREBİR aynı mantığın JS portu — Edge
// Function'ların customers.normalized_phone ile eşleşen bir değeri DB'ye
// gitmeden hesaplayıp sorgu/insert'te kullanabilmesi için (bkz. 0006_beauty_core.sql).
export function normalizeTrPhone(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  if (digits.slice(0, 2) === '90' && digits.length === 12) return `+${digits}`
  if (digits.slice(0, 1) === '0' && digits.length === 11) return `+90${digits.slice(1)}`
  if (digits.length === 10) return `+90${digits}`
  return `+${digits}`
}
