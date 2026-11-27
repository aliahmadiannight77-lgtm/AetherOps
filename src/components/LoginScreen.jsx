import { useEffect, useRef, useState } from 'react'
import { ArrowUpLeft, Check, ChevronRight, LockKeyhole, Moon, Send, ShieldCheck, Sparkles, Sun } from 'lucide-react'
import { api } from '@/lib/api'
import { rtlLanguages, translate as t } from '@/lib/i18n.js'
import { getLoginCopy } from '@/lib/login-copy.js'
import LanguagePicker from './LanguagePicker.jsx'
import './login.css'

const channelUrl = 'https://t.me/PythonCodingAcademy'

export default function LoginScreen({
  onAuthenticated,
  language = 'fa',
  onLanguageChange = () => {},
  theme = 'dark',
  onThemeChange = () => {},
}) {
  const tr = (key) => t(language, key)
  const [initData, setInitData] = useState('')
  const [miniApp, setMiniApp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const authInFlight = useRef(false)
  const missingInitData = miniApp && !initData

  async function authenticateWithTelegram(rawInitData = initData) {
    if (!rawInitData || authInFlight.current) return
    authInFlight.current = true
    setBusy(true)
    setMessage('')
    try {
      const result = await api('/api/auth/telegram', { method: 'POST', body: { initData: rawInitData } })
      onAuthenticated(result.user)
    } catch (cause) {
      setMessage(cause.message)
    } finally {
      authInFlight.current = false
      setBusy(false)
    }
  }

  async function startCodeLogin() {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api('/api/auth/telegram/start', { method: 'POST', body: {} })
      setChallenge(result)
      setCode('')
    } catch (cause) {
      setMessage(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function verifyLoginCode(event) {
    event.preventDefault()
    if (!challenge?.state || !/^\d{8}$/.test(code) || busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api('/api/auth/telegram/verify', { method: 'POST', body: { state: challenge.state, code } })
      onAuthenticated(result.user)
    } catch (cause) {
      setMessage(cause.code === 'telegram_login_invalid' ? getLoginCopy(language, 'invalidCode') : cause.code === 'telegram_login_expired' ? getLoginCopy(language, 'expired') : cause.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return
    webApp.ready?.()
    webApp.expand?.()
    setMiniApp(true)
    setInitData(webApp.initData || '')
  }, [])

  useEffect(() => {
    if (initData) authenticateWithTelegram(initData)
  }, [initData])

  const toggleTheme = () => onThemeChange(theme === 'dark' ? 'light' : 'dark')

  return <div className="login-shell" data-theme={theme} dir={rtlLanguages.has(language) ? 'rtl' : 'ltr'}>
    <div className="login-ambient ambient-a" />
    <div className="login-ambient ambient-b" />
    <div className="login-ambient ambient-c" />
    <div className="login-top-controls">
      <LanguagePicker value={language} onChange={onLanguageChange} label={tr('language')} />
      <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span>{theme === 'dark' ? 'LIGHT' : 'DARK'}</span>
      </button>
    </div>

    <main className="login-layout">
      <section className="login-hero">
        <a className="login-brand" href="/" aria-label="AetherOps home">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>AETHER<span>OPS</span><small>EDGE INTELLIGENCE</small></span>
        </a>
        <div className="hero-signal"><i /> PRIVATE AI · CLOUDFLARE EDGE</div>
        <h1>{tr('welcome')}</h1>
        <p className="login-hero-copy">{tr('welcomeCopy')}</p>

        <div className="hero-orbit" aria-hidden="true">
          <div className="hero-orbit-grid" />
          <div className="hero-orbit-ring hero-orbit-ring-a" />
          <div className="hero-orbit-ring hero-orbit-ring-b" />
          <div className="hero-orbit-core"><Sparkles size={28} /></div>
          <span className="hero-orbit-node node-a" />
          <span className="hero-orbit-node node-b" />
          <span className="hero-orbit-node node-c" />
          <div className="hero-float-card float-card-top"><span className="float-pulse" />WORKERS AI <b>ONLINE</b></div>
          <div className="hero-float-card float-card-bottom"><ShieldCheck size={14} /> PRIVATE BY DESIGN</div>
        </div>

        <div className="hero-proof-row">
          <span><Check size={14} /> {tr('edgeProcessing')}</span>
          <i />
          <span><LockKeyhole size={13} /> {tr('secureLogin')}</span>
        </div>
      </section>

      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card-orbit"><span /><span /><div><Sparkles size={20} /></div></div>
        <div className="eyebrow"><span /> TELEGRAM MINI APP</div>
        <h2 id="login-title">{tr('login')}</h2>
        <p className="login-description">
          {miniApp
            ? (busy ? 'Checking your Telegram sign-in securely…' : 'Continue with your signed Telegram session or request a browser code.')
            : 'Start in the AetherOps bot, then enter its one-time code here to open your workspace.'}
        </p>

        {miniApp && <div className={`miniapp-status ${message || missingInitData ? 'is-error' : busy ? 'is-pending' : 'is-ready'}`}>
          <span className="miniapp-status-icon">{message || missingInitData ? <ShieldCheck size={17} /> : busy ? <span className="mini-spinner" /> : <Check size={17} />}</span>
          <div>
            <b>{message || missingInitData ? 'Open from the AetherOps bot' : busy ? 'Verifying your account' : 'Secure Telegram session'}</b>
            <small>{message || (missingInitData ? getLoginCopy(language, 'miniAppHint') : 'Telegram’s signed Mini App data is checked by the Cloudflare Worker.')}</small>
          </div>
        </div>}

        {(missingInitData || !miniApp) && !challenge && <>
          <button className="login-submit" type="button" disabled={busy} onClick={startCodeLogin}>
            <Send size={16} />
            <span>{busy ? 'Preparing secure sign-in…' : getLoginCopy(language, 'start')}</span>
            <ArrowUpLeft size={16} className="login-submit-arrow" />
          </button>
          <div className="login-join-note">
            <span className="join-note-icon"><LockKeyhole size={14} /></span>
            <span>{getLoginCopy(language, 'codeHint')}</span>
          </div>
        </>}

        {challenge && <div className="login-code-flow">
          <div className="login-step-heading"><span>01</span><div><b>{getLoginCopy(language, 'openBot')}</b><small>PythonCodingAcademy · 10 min</small></div><ChevronRight size={16}/></div>
          <a className="bot-open-link" href={challenge.botUrl} target="_blank" rel="noreferrer"><Send size={15}/>{getLoginCopy(language, 'openBot')}<ArrowUpLeft size={14}/></a>
          <form className="login-code-form" onSubmit={verifyLoginCode}>
            <label htmlFor="telegram-login-code">{getLoginCopy(language, 'codeLabel')}</label>
            <div className="login-code-input-row"><input id="telegram-login-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{8}" maxLength="8" placeholder="00000000" aria-describedby="telegram-code-hint" required/><span>{code.length}/8</span></div>
            <small id="telegram-code-hint">{getLoginCopy(language, 'codeHint')}</small>
            <button className="login-code-submit" type="submit" disabled={busy || code.length !== 8}><ShieldCheck size={15}/>{busy ? 'Verifying…' : getLoginCopy(language, 'submit')}</button>
            <button className="login-code-refresh" type="button" disabled={busy} onClick={startCodeLogin}>Get a fresh link</button>
          </form>
        </div>}

        {message && <div className="login-error" role="alert">{message}</div>}
        {miniApp && missingInitData && <a className="login-retry" href="https://t.me/AetherOpsChatBot" target="_blank" rel="noreferrer"><Send size={15} />{getLoginCopy(language, 'openBot')}</a>}
        {miniApp && message && initData && <button className="secondary-button login-retry" type="button" disabled={busy || !initData} onClick={() => authenticateWithTelegram()}>
          <Check size={15} /> Try again
        </button>}

        <div className="login-channel-row">
          <span><ShieldCheck size={15} /> عضویت کانال الزامی است</span>
          <a href={channelUrl} target="_blank" rel="noreferrer">PythonCodingAcademy</a>
        </div>
        <div className="login-foot"><span><LockKeyhole size={12} /> {tr('secureLogin')}</span><i /> <span>Cloudflare Workers</span></div>
      </section>
    </main>

    <div className="login-footer">AETHEROPS <span>·</span> PRIVATE AI, AT THE EDGE</div>
  </div>
}
