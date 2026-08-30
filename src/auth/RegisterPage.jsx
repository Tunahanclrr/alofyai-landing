import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthShell from './AuthShell'
import Input from '../components/Input'
import Button from '../components/Button'

export default function RegisterPage() {
  const { user, loading: authLoading, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!authLoading && user) {
    return <Navigate to={location.state?.from?.pathname ?? '/app/dashboard'} replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signUp(email, password, fullName, phone)
      navigate('/app/dashboard', { replace: true })
    } catch {
      setError('Kayıt oluşturulamadı. Lütfen bilgilerinizi kontrol edin.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Hemen başlayın"
      title="Hesap Oluştur"
      subtitle="İşletmenizi bir sonraki adımda tanımlayacaksınız."
      footer={
        <>
          Zaten hesabınız var mı?{' '}
          <Link to="/login" className="font-semibold text-teal hover:text-teal-dark">
            Giriş yapın
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input id="full-name" label="Ad Soyad" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input
          id="phone"
          label="Telefon"
          type="tel"
          placeholder="0555 000 00 00"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          id="email"
          label="E-posta"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          id="password"
          label="Şifre"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Oluşturuluyor…' : 'Hesap Oluştur'}
        </Button>
      </form>
    </AuthShell>
  )
}
