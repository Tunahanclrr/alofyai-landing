export default function EmptyState({ title, description, action, badge }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      {badge && (
        <span className="mb-3 inline-flex items-center rounded-full bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal-dark">
          {badge}
        </span>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
