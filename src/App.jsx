import { useState, useEffect } from 'react'
import './App.css'

const phoneNumber = '0555 165 95 02'

const icons = {
  clock: <path d="M12 7v5l3 2m7-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 5.2 2 2 0 0 1 4.11 3h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 10.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  sparkle: <><path d="m12 3-1.4 4.6L6 9l4.6 1.4L12 15l1.4-4.6L18 9l-4.6-1.4L12 3ZM19 15l-.7 2.3L16 18l2.3.7L19 21l.7-2.3L22 18l-2.3-.7L19 15ZM5 15l-.5 1.5L3 17l1.5.5L5 19l.5-1.5L7 17l-1.5-.5L5 15Z" /></>,
  building: <><path d="M3 21h18M5 21V5l7-3 7 3v16M9 21v-4h6v4M9 8h.01M15 8h.01M9 12h.01M15 12h.01" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8.5 7.5 12 7M8.5 16.5l12-7" /></>,
  heart: <path d="M20.8 8.6a5.5 5.5 0 0 0-7.8 0L12 9.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 24l7.8-6.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
  hotel: <><path d="M3 21V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v16M3 10h18M7 7h.01M11 7h.01M15 7h.01M7 14h3v3H7zM14 14h3v3h-3z" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><path d="m12 3 2.5 5-2.5 3-4-.5-2.5-3M12 11l3 3-1 5M8 10l-2 6m9-10 4 2" /></>,
  tooth: <path d="M7.5 3C5 3 3 5 3 7.5c0 3 1.5 4.5 2 7 .6 4.2 1.5 6.5 3 6.5s1.6-2.5 3-2.5 1.5 2.5 3 2.5 2.4-2.3 3-6.5c.5-2.5 2-4 2-7C19 5 17 3 14.5 3 13 3 12 4 12 4S11 3 7.5 3Z" />,
  car: <><path d="m5 17-1 3m15-3 1 3M3 17v-5l2-5h14l2 5v5M3 14h18M6 17h.01M18 17h.01" /><path d="m7 7 1-2h8l1 2" /></>,
  dumbbell: <><path d="M6 4v16M18 4v16M3 8v8M21 8v8M6 12h12M3 10h3M18 10h3M3 14h3M18 14h3" /></>,
}

function Icon({ name, size = 22, className = '' }) {
  return <svg aria-hidden="true" className={className} fill="none" height={size} viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{icons[name]}</svg>
}

const features = [
  ['clock', '7/24 Kesintisiz Hizmet', 'Gece yarısı, tatil günü, mesai dışı fark etmez. Telefonunuz hiç kapanmaz.'],
  ['users', 'Aynı Anda Birden Fazla Müşteri', 'Onlarca aramayı eş zamanlı karşılar, hiçbir müşteriniz meşgul sesi duymaz.'],
  ['phone', 'Hiç Kaçan Çağrı Yok', 'Telefonu her açan bir potansiyel müşteridir. Her arama, işletmeniz için yeni bir fırsattır.'],
  ['bell', 'Anlık Randevu Bildirimleri', 'Yeni randevu, değişiklik ve iptallerden anında haberdar olun; tüm akışı canlı takip edin.'],
  ['sparkle', 'İşletmenize Özel', 'Konuşma tarzı, hizmetleriniz, saatleriniz ve personel bilginiz size özel tanımlanır.'],
  ['building', 'Kurumsallaşmanın İlk Adımı', 'Büyük zincirlerin çağrı merkezi kalitesini, uygun maliyetle işletmenize taşıyın.'],
  ['sparkle', 'Size özel domainli yönetim paneli', 'Kişiselleştirilmiş yönetim panelinizde randevu, arama ve müşteri yönetimini kendi alan adınızla yapın.'],
]

const sectors = [
  ['scissors', 'Berberler ve Kuaförler'], ['heart', 'Güzellik Salonları'], ['hotel', 'Oteller ve Pansiyonlar'], ['ball', 'Halı Sahalar'],
  ['tooth', 'Diş Klinikleri ve Sağlık Merkezleri'], ['car', 'Oto Ekspertiz Firmaları'], ['dumbbell', 'Spor Salonları'], ['cafe', 'Kafe ve Restoranlar'], ['building', 'Randevu ile çalışan her işletme'],
]

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('anasayfa')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const ids = ['anasayfa', 'nasil-calisir', 'ozellikler', 'kimler-icin', 'neden', 'iletisim']
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id)
        })
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const closeMenu = () => setMenuOpen(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen overflow-hidden bg-white text-ink">
      <div className="topbar"><div className="page-width flex items-center justify-center gap-2 px-5 py-2 text-center text-xs font-semibold tracking-wide text-white sm:text-sm"><span className="pulse-dot" /> Telefonunuz 7/24 açık kalsın: <a href="tel:05551659502" className="underline underline-offset-4">{phoneNumber}</a></div></div>
      <header className={`topbar-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="page-width flex items-center justify-between px-5 py-4 lg:px-8">
          <a href="#anasayfa" onClick={closeMenu} className="brand-lockup" aria-label="AlofyAI ana sayfa">
            <img src="/logo.png" alt="AlofyAI logo" className="brand-logo" />
            <span className="logo-word">Alofy<span>AI</span></span>
          </a>
          <button className={`menu-button lg:hidden ${scrolled ? 'menu-button-dark' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={menuOpen}>{menuOpen ? '×' : '☰'}</button>
          <nav className={`${menuOpen ? 'mobile-nav-open' : ''} nav-links`} aria-label="Ana menü" aria-expanded={menuOpen}>
            {menuOpen && <button type="button" className="mobile-close" onClick={closeMenu} aria-label="Menüyü kapat">×</button>}
            <a href="#anasayfa" onClick={closeMenu} className={active === 'anasayfa' ? 'nav-active' : ''}>Ana Sayfa</a>
            <a href="#nasil-calisir" onClick={closeMenu} className={active === 'nasil-calisir' ? 'nav-active' : ''}>Nasıl Çalışır?</a>
            <a href="#ozellikler" onClick={closeMenu} className={active === 'ozellikler' ? 'nav-active' : ''}>Özellikler</a>
            <a href="#kimler-icin" onClick={closeMenu} className={active === 'kimler-icin' ? 'nav-active' : ''}>Kimler İçin?</a>
            <a href="#neden" onClick={closeMenu} className={active === 'neden' ? 'nav-active' : ''}>Neden AlofyAI?</a>
            <a href="#iletisim" onClick={closeMenu} className="nav-call"><Icon name="phone" size={16} /> Bizi Arayın</a>
          </nav>
        </div>
      </header>

      <main id="anasayfa">
        <section className="hero-section">
          <div className="page-width relative grid items-center gap-14 px-5 pb-20 pt-32 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:pb-28 lg:pt-24">
            <div className="relative z-10 max-w-2xl animate-rise">
              <div className="eyebrow"><span className="eyebrow-line" /> İşletmeniz için akıllı telefon asistanı</div>
              <h1>Telefonunuz hiç susmasın, <span>siz işinize bakın.</span></h1>
              <p className="hero-copy">AlofyAI, işletmenizin telefonunu sizin için cevaplar. Müşterilerinizle doğal bir şekilde konuşur, randevularınızı yönetir ve hiçbir çağrının kaçmasına izin vermez.</p>
              <div className="hero-actions"><a className="primary-button" href="#iletisim">Fiyat ve Bilgi Al <Icon name="arrow" size={18} /></a><a className="text-link" href="tel:05551659502"><span className="phone-circle"><Icon name="phone" size={16} /></span> {phoneNumber}</a></div>
              <div className="trust-row"><span><Icon name="check" size={15} /> 7/24 hizmet</span><span><Icon name="check" size={15} /> Kaçan çağrı yok</span><span><Icon name="check" size={15} /> Size özel</span></div>
            </div>
            <div className="hero-art" aria-label="Telefon asistanı görseli">
              <div className="art-glow" /><div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="assistant-card"><div className="assistant-top"><span className="online-dot" /> AlofyAI Asistan <span className="mini-time">Şimdi</span></div><div className="voice-visual"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="assistant-caption">Sizi dinliyorum<span className="typing">...</span></div></div>
              <div className="floating-card floating-call"><div className="float-icon teal-bg"><Icon name="phone" size={18} /></div><div><small>Gelen arama</small><strong>Yeni müşteri arıyor</strong></div><span className="call-wave">◌</span></div>
              <div className="floating-card floating-booking"><div className="float-icon navy-bg"><Icon name="check" size={18} /></div><div><small>Randevu oluşturuldu</small><strong>Bugün · 14:30</strong></div></div>
              <div className="art-badge"><span>7/24</span><small>Hizmet</small></div>
            </div>
          </div>
          <div className="hero-bottom-shape" />
        </section>

        <section className="problem-section section-pad"><div className="page-width grid gap-12 px-5 lg:grid-cols-[.9fr_1.1fr] lg:items-end lg:px-8"><div><div className="section-kicker">Sizi çok iyi anlıyoruz</div><h2>Her cevapsız arama,<br /><span>kaybedilen bir müşteridir.</span></h2></div><div className="problem-copy"><p>Mesai bittiğinde telefonlar susmuyor. Aynı anda iki müşteri aradığında biri bekliyor. Personeliniz müsait olmadığında randevular kaçıyor.</p><p className="strong-copy">AlofyAI, işletmenizin başında her an hazır bekleyen, yorulmayan bir ekip arkadaşınız gibi çalışır.</p></div></div></section>

        <section id="nasil-calisir" className="how-section section-pad"><div className="page-width px-5 lg:px-8"><div className="section-heading"><div><div className="section-kicker">Karmaşık değil, çok basit</div><h2>Nasıl çalışır?</h2></div><p>İşletmenizin telefon trafiğini üç kolay adımda düzene sokar.</p></div><div className="steps-grid"><div className="step-line" />{[['01', 'Müşteri arar', 'Müşteriniz alıştığı numaradan sizi arar.'], ['02', 'AlofyAI karşılar', 'Sorularını yanıtlar, randevu alır veya işlemi gerçekleştirir.'], ['03', 'Siz anında bilirsiniz', 'Bildirim gelir, randevu otomatik olarak sisteme işlenir.']].map(([number, title, text]) => <div className="step-card" key={number}><div className="step-number">{number}</div><h3>{title}</h3><p>{text}</p><div className="step-arrow"><Icon name="arrow" size={17} /></div></div>)}</div></div></section>

        <section id="ozellikler" className="features-section section-pad"><div className="page-width px-5 lg:px-8"><div className="center-heading"><div className="section-kicker">İşletmenizin yeni çalışma arkadaşı</div><h2>Her çağrıya cevap,<br /><span>her gün daha çok fırsat.</span></h2><p>AlofyAI sadece telefonu açmaz; işletmenizin daha düzenli, daha ulaşılabilir ve daha profesyonel görünmesini sağlar. Size özel domain içeren kişiselleştirilmiş yönetim panelinizle çağrı ve randevu takibini tek yerden yönetin.</p></div><div className="features-grid">{features.map(([icon, title, text]) => <article className="feature-card" key={title}><div className="feature-icon"><Icon name={icon} size={23} /></div><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

        <section id="kimler-icin" className="sectors-section section-pad"><div className="page-width px-5 lg:px-8"><div className="section-heading sectors-heading"><div><div className="section-kicker">Sizin işletmeniz için de hazır</div><h2>Kimler kullanabilir?</h2></div><p><strong>Telefonla randevu alan, telefonla sipariş alan ya da telefonla soru cevaplayan her işletme için.</strong></p></div><div className="sectors-grid">{sectors.map(([icon, title]) => <div className="sector-card" key={title}><span className="sector-icon"><Icon name={icon} size={22} /></span><span>{title}</span><Icon name="arrow" size={17} className="sector-arrow" /></div>)}</div></div></section>

        <section id="neden" className="why-section section-pad"><div className="page-width grid gap-12 px-5 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:px-8"><div className="why-visual"><div className="why-circle" /><div className="compare-card compare-human"><div className="compare-icon"><Icon name="users" size={23} /></div><div><small>Geleneksel yöntem</small><strong>Çalışma saatleriyle sınırlı</strong></div></div><div className="compare-card compare-ai"><div className="compare-icon"><Icon name="sparkle" size={23} /></div><div><small>AlofyAI</small><strong>Her an, her çağrıya hazır</strong></div><span className="best-choice">En iyi seçenek</span></div></div><div className="why-copy"><div className="section-kicker">Daha çok ulaşılabilirlik</div><h2>Büyük görünmek için<br /><span>büyük bir ekip gerekmez.</span></h2><p>Tam zamanlı bir resepsiyonistin maliyetinin çok altında, 7/24 çalışan profesyonel bir telefon deneyimine sahip olun.</p><div className="why-list"><div><Icon name="check" size={17} /> Daha profesyonel bir işletme imajı</div><div><Icon name="check" size={17} /> Daha az kaçan randevu, daha çok memnuniyet</div><div><Icon name="check" size={17} /> İşinize odaklanmanız için daha fazla zaman</div></div><a className="primary-button" href="#iletisim">AlofyAI ile tanışın <Icon name="arrow" size={18} /></a></div></div></section>

        <section id="iletisim" className="contact-section section-pad"><div className="page-width grid gap-12 px-5 lg:grid-cols-[.9fr_1.1fr] lg:px-8"><div className="contact-intro"><div className="section-kicker light-kicker">Birlikte başlayalım</div><h2>Telefonunuzun<br /><span>yeni sesi AlofyAI.</span></h2><p>İşletmenize en uygun çözüm ve fiyatlandırma için bizi arayın veya formu doldurun. Size kısa sürede dönüş yapalım.</p><a href="tel:05551659502" className="big-phone"><span><Icon name="phone" size={21} /></span>{phoneNumber}</a><div className="contact-note"><Icon name="clock" size={18} /> Hafta içi ve hafta sonu bize ulaşabilirsiniz.</div></div><form className="contact-form" onSubmit={handleSubmit}><div className="form-head"><h3>Bilgi almak istiyorum</h3><p>Formu doldurun, sizi arayalım.</p></div>{submitted ? <div className="success-message"><div><Icon name="check" size={28} /></div><h3>Talebiniz bize ulaştı.</h3><p>En kısa sürede sizi arayacağız. İlginiz için teşekkür ederiz.</p><button type="button" onClick={() => setSubmitted(false)} className="reset-button">Yeni bir form doldur</button></div> : <><div className="form-grid"><label>İsim Soyisim<input required placeholder="Adınız Soyadınız" /></label><label>İşletme Adı<input required placeholder="İşletmenizin adı" /></label><label>Telefon Numaranız<input required type="tel" placeholder="0555 000 00 00" /></label><label>Sektörünüz<select required defaultValue=""><option value="" disabled>Seçiniz</option><option>Berber / Kuaför</option><option>Güzellik Salonu</option><option>Otel / Pansiyon</option><option>Sağlık Merkezi</option><option>Diğer</option></select></label></div><button className="form-button" type="submit">Fiyat ve Bilgi Al <Icon name="arrow" size={18} /></button><small className="form-privacy">Bilgileriniz yalnızca size ulaşmak için kullanılır.</small></>}</form></div></section>
      </main>
      <footer><div className="page-width flex flex-col gap-6 px-5 py-9 sm:flex-row sm:items-center sm:justify-between lg:px-8"><div className="footer-brand"><div className="brand-lockup"><span className="logo-symbol"><Icon name="sparkle" size={18} /></span><span className="logo-word">Alofy<span>AI</span></span></div><span>İşletmenizin hiç susmayan yardımcısı.</span></div><div className="footer-right"><a href="tel:05551659502"><Icon name="phone" size={15} /> {phoneNumber}</a><span>Tüm hakları saklıdır.</span></div></div></footer><a href="tel:05551659502" className="sticky-call"><Icon name="phone" size={18} /> <span>Bizi Arayın</span></a>
    </div>
  )
}

export default App
