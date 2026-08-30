import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-mist px-6 text-center">
      <h1 className="text-3xl font-bold text-ink">404</h1>
      <p className="text-sm text-slate-500">Aradığınız sayfa bulunamadı.</p>
      <Link to="/" className="text-sm font-semibold text-teal hover:text-teal-dark">
        Ana sayfaya dön
      </Link>
    </div>
  )
}
