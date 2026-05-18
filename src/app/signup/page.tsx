'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function SignupForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const email        = searchParams.get('email') ?? ''
  const name         = searchParams.get('name')  ?? ''
  const role         = searchParams.get('role')  ?? 'external'

  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email)            { setError('Lien invalide (email manquant). Demande à ton contact admin de te renvoyer le lien.'); return }
    if (password.length < 6) { setError('Mot de passe trop court (6 caractères minimum).'); return }
    if (password !== password2) { setError('Les deux mots de passe ne correspondent pas.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, display_name: name || email.split('@')[0] } },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    router.push('/')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, margin: '0 auto 14px',
          }}>🏗</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Bienvenue {name && `, ${name.split(' ')[0]}`}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Crée ton mot de passe pour accéder à Planify</div>
        </div>

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: 24, boxShadow: 'var(--shadow)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Email</label>
              <input type="email" value={email} disabled style={{ ...inp, opacity: .7, cursor: 'not-allowed' }} />
            </div>
            <div>
              <label style={lbl}>Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" placeholder="••••••••" style={inp} />
            </div>
            <div>
              <label style={lbl}>Confirmer le mot de passe</label>
              <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} required autoComplete="new-password" placeholder="••••••••" style={inp} />
            </div>
            {error && (
              <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-l)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: 12, borderRadius: 10, border: 'none',
              background: loading ? 'var(--muted)' : 'var(--primary)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", marginTop: 4,
            }}>{loading ? 'Création…' : 'Créer mon compte'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return <Suspense fallback={null}><SignupForm /></Suspense>
}

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
  letterSpacing: '.06em', display: 'block', marginBottom: 6,
}
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
