import { useEffect, useState } from 'react'
import { ArrowUpLeft, Check, Globe2, LockKeyhole, Moon, Send, ShieldCheck, Sparkles, Sun } from 'lucide-react'
import { api } from '@/lib/api'
import { languages, rtlLanguages, translate as t } from '@/lib/i18n.js'
import './login.css'

const botUrl = 'https://t.me/AetherOpsChatBot'
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
  const missingInitData = miniApp && !initData

  async function authenticateWithTelegram(rawInitData = initData) {
    if (!rawInitData || busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api('/api/auth/telegram', { method: 'POST', body: { initData: rawInitData } })
      onAuthenticated(result.user)
    } catch (cause) {
      setMessage(cause.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return
    webApp.ready()
    webApp.expand()
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
      <label className="login-language-wrap">
        <Globe2 size={15} />
        <select className="login-language-select" aria-label={tr('language')} value={language} onChange={(event) => onLanguageChange(event.target.value)}>
          {languages.map(([code, name]) => <option value={code} key={code}>{name}</option>)}
        </select>
      </label>
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
            ? (busy ? 'در حال تأیید امن حساب تلگرام…' : 'نشست تلگرام شما به‌صورت امن بررسی می‌شود.')
            : 'برای ورود امن و ساخت فضای کار شخصی، از ربات AetherOps ادامه بده.'}
        </p>

        {miniApp ? <div className={`miniapp-status ${message || missingInitData ? 'is-error' : busy ? 'is-pending' : 'is-ready'}`}>
          <span className="miniapp-status-icon">{message || missingInitData ? <ShieldCheck size={17} /> : busy ? <span className="mini-spinner" /> : <Check size={17} />}</span>
          <div>
            <b>{message || missingInitData ? 'ورود از Mini App لازم است' : busy ? 'در حال اتصال' : 'در حال تأیید امن'}</b>
            <small>{message || (missingInitData ? 'این نشانی را از دکمهٔ «بازکردن Mini App» در ربات AetherOps باز کن.' : 'هویت از دادهٔ امضاشدهٔ Telegram بررسی می‌شود.')}</small>
          </div>
        </div> : <>
          <a className="login-submit" href={botUrl} target="_blank" rel="noreferrer">
            <Send size={16} />
            <span>{tr('telegramBot')}</span>
            <ArrowUpLeft size={16} className="login-submit-arrow" />
          </a>
          <div className="login-join-note">
            <span className="join-note-icon"><LockKeyhole size={14} /></span>
            <span>ربات ابتدا عضویت در کانال را بررسی می‌کند؛ بعد لینک ورود و Mini App را می‌دهد.</span>
          </div>
        </>}

        {message && <div className="login-error" role="alert">{message}</div>}
        {miniApp && (message || missingInitData) && <a className="login-retry" href={botUrl} target="_blank" rel="noreferrer">
          <Send size={15} /> بازکردن ربات AetherOps
        </a>}
        {miniApp && message && initData && <button className="secondary-button login-retry" type="button" disabled={busy || !initData} onClick={() => authenticateWithTelegram()}>
          <Check size={15} /> بررسی دوباره
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
