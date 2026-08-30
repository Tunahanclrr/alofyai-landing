export default function Input({ label, id, className = '', ...props }) {
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-400 transition-shadow focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 ${className}`}
        {...props}
      />
    </div>
  )
}
