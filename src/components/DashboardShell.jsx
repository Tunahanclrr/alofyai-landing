import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import Logo from './Logo'

// Genel amaçlı responsive shell: masaüstünde sabit sidebar, mobilde
// hamburger→drawer. Hem AppLayout hem AdminLayout bunun üzerine kurulur.
export default function DashboardShell({ brand, navItems, headerExtra, footer, banner }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive ? 'bg-teal/10 text-teal-dark' : 'text-slate-600 hover:bg-mist hover:text-ink'
    }`

  const SidebarContent = (
    <>
      <div className="px-5 py-5">
        <Logo />
        {brand && <div className="mt-2 truncate text-xs font-medium text-slate-400">{brand}</div>}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {navItems.map((item) =>
          item.section ? (
            <div key={item.section} className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {item.section}
            </div>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={() => setDrawerOpen(false)}>
              {item.label}
            </NavLink>
          )
        )}
      </nav>
      {footer && <div className="border-t border-slate-100 p-3">{footer}</div>}
    </>
  )

  return (
    <div className="flex min-h-screen flex-col bg-mist">
      {banner}
      <div className="flex flex-1">
        {/* Masaüstü sidebar */}
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">{SidebarContent}</aside>

        {/* Mobil drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-soft">{SidebarContent}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
            <button
              type="button"
              className="rounded-md p-2 text-slate-600 hover:bg-mist lg:hidden"
              aria-label="Menüyü aç"
              onClick={() => setDrawerOpen(true)}
            >
              ☰
            </button>
            <div className="flex flex-1 items-center justify-end gap-4">{headerExtra}</div>
          </header>
          <main className="flex-1 px-4 py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
