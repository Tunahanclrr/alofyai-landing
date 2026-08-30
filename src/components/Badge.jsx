const STATUS_STYLES = {
  trial: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  suspended: 'bg-red-50 text-red-700 ring-red-600/20',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  invited: 'bg-blue-50 text-blue-700 ring-blue-600/20',
}

const STATUS_LABELS = {
  trial: 'Deneme',
  active: 'Aktif',
  suspended: 'Askıya Alındı',
  cancelled: 'İptal Edildi',
  invited: 'Davet Edildi',
}

export default function Badge({ status, children, className = '' }) {
  if (status) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.cancelled} ${className}`}
      >
        {STATUS_LABELS[status] ?? status}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-inset ring-slate-200 ${className}`}>
      {children}
    </span>
  )
}
