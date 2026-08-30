export default function Card({ className = '', ...props }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-card ${className}`} {...props} />
}
