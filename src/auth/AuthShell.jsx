import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

const HIGHLIGHTS = ['7/24 hizmet', 'Kaçan çağrı yok', 'Size özel']

export default function AuthShell({ eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-mist">
      {/* Marka paneli — sadece geniş ekranlarda */}
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-gradient-to-br from-navy via-ink to-[#081a33] px-12 py-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-teal/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-teal/10 blur-3xl" />

        <Link to="/" className="relative z-10">
          <Logo variant="light" />
        </Link>

        <div className="relative z-10 max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal">İşletmeniz için akıllı asistan</p>
          <h2 className="mt-4 text-3xl font-bold leading-tight">
            Telefonunuz hiç susmasın, <span className="text-teal">siz işinize bakın.</span>
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {HIGHLIGHTS.map((item) => (
              <span key={item} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
                {item}
              </span>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/50">© {new Date().getFullYear()} AlofyAI. Tüm hakları saklıdır.</p>
      </div>

      {/* Form paneli */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 flex justify-center lg:hidden">
            <Logo />
          </Link>

          {eyebrow && <p className="text-xs font-semibold uppercase tracking-widest text-teal">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
