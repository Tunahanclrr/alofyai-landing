import EmptyState from './EmptyState'

export default function ComingSoonPage({ title, description, phase }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-6">
        <EmptyState
          badge={phase}
          title="Bu bölüm henüz aktif değil"
          description={description ?? 'Bu özellik sonraki geliştirme fazında burada aktif olacak.'}
        />
      </div>
    </div>
  )
}
