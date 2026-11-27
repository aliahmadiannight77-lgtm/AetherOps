import { useState } from 'react'
import { ArrowLeft, ArrowUpLeft, Check, ChevronLeft, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { languages, rtlLanguages, translate as t } from '@/lib/i18n.js'
import './login.css'

export default function LoginScreen({ onAuthenticated, language = 'fa', onLanguageChange = () => {} }) {
  const tr = (key) => t(language, key)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState('email')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function requestCode(event) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      await api('/api/auth/request-code', { method: 'POST', body: { email } })
      setStage('code')
    } catch (cause) { setMessage(cause.message) }
    finally { setBusy(false) }
  }

  async function verify(event) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const result = await api('/api/auth/verify-code', { method: 'POST', body: { email, code } })
      onAuthenticated(result.user)
    } catch (cause) { setMessage(cause.message) }
    finally { setBusy(false) }
  }

  return <div className="login-shell" dir={rtlLanguages.has(language) ? 'rtl' : 'ltr'}><select className="login-language-select" aria-label={tr('language')} value={language} onChange={(event) => onLanguageChange(event.target.value)}>{languages.map(([code,name]) => <option value={code} key={code}>{name}</option>)}</select><div className="login-ambient ambient-a"/><div className="login-ambient ambient-b"/><div className="login-card">
    <a className="login-brand" href="#"><span className="brand-mark"><Sparkles size={18}/></span><span>AETHER<span>OPS</span><small>EDGE INTELLIGENCE</small></span></a>
    <div className="login-orb"><span className="login-orb-core"><Sparkles size={22}/></span><i/><b/></div>
    <div className="eyebrow"><span/> PRIVATE EDGE WORKSPACE</div>
    <h1>{stage === 'email' ? tr('login') : tr('checkEmail')}</h1>
    <p className="login-description">{stage === 'email' ? tr('emailPrompt') : <>{tr('emailSent')} <b dir="ltr">{email}</b>.</>}</p>
    {stage === 'email' ? <form className="login-form" onSubmit={requestCode}><label htmlFor="login-email">{tr('email')}</label><div className="login-input-wrap"><Mail size={16}/><input id="login-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" dir="ltr"/></div><button className="login-submit" disabled={busy}>{busy ? tr('sending') : tr('sendCode')}<ArrowUpLeft size={16}/></button></form> : <form className="login-form" onSubmit={verify}><label htmlFor="login-code">{tr('code')}</label><input className="otp-input" id="login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="00000000" dir="ltr"/><button className="login-submit" disabled={busy || code.length !== 8}>{busy ? tr('verifying') : tr('verify')}<ArrowUpLeft size={16}/></button><div className="login-inline-actions"><button type="button" onClick={() => { setStage('email'); setCode(''); setMessage('') }}><ArrowLeft size={13}/> {tr('changeEmail')}</button><button type="button" onClick={requestCode} disabled={busy}>{tr('resend')}</button></div></form>}
    {message && <div className="login-error" role="alert">{message}</div>}
    <div className="login-note"><ShieldCheck size={15}/><span>{tr('emailNotice')}</span></div>
    <div className="login-foot"><span><LockKeyhole size={12}/> {tr('secureLogin')}</span><i/> <span>Cloudflare Workers</span></div>
  </div><div className="login-footer">AETHEROPS <span>·</span> PRIVATE AI, AT THE EDGE</div></div>
}
