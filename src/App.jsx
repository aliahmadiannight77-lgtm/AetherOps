import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowUpLeft, Bot, Check, ChevronDown, CircleHelp, Command, Copy, Cpu, Ellipsis, Github, Globe2, LayoutDashboard, Link2, LockKeyhole, LogOut, Menu, MessageSquare, MoreHorizontal, Moon, PanelRightClose, Plus, Send, Settings2, ShieldCheck, Sparkles, Sun, Trash2, UserRound, X, Zap } from 'lucide-react'
import TokenDataTable from './components/TokenDataTable.jsx'
import { Spotlight } from './components/ui/spotlight.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import './components/security-ui.css'
import './components/future-ui.css'
import { api } from './lib/api.js'
import { languages, localeFor, rtlLanguages, translate as t } from './lib/i18n.js'

const models = [
  { name: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 · متعادل', detail: 'چندزبانه و چندرسانه‌ای' },
  { name: '@cf/qwen/qwen3.8-27b', label: 'Qwen 3.8 · پیشرفته', detail: 'استدلال و کدنویسی' },
]

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('aether_language') || 'fa')
  const [theme, setTheme] = useState(() => localStorage.getItem('aether_theme') || (window.Telegram?.WebApp?.colorScheme === 'light' ? 'light' : 'dark'))
  const tr = (key) => t(language, key)
  const changeLanguage = (value) => { setLanguage(value); localStorage.setItem('aether_language', value) }
  const changeTheme = (value) => { setTheme(value); localStorage.setItem('aether_theme', value) }
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = rtlLanguages.has(language) ? 'rtl' : 'ltr' }, [language])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const webApp = window.Telegram?.WebApp
    webApp?.setHeaderColor?.(theme === 'dark' ? '#0a0d17' : '#edf3ff')
    webApp?.setBackgroundColor?.(theme === 'dark' ? '#080b13' : '#edf3ff')
    webApp?.setBottomBarColor?.(theme === 'dark' ? '#0a0d17' : '#edf3ff')
  }, [theme])
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [chats, setChats] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(models[0])
  const [modelOpen, setModelOpen] = useState(false)
  const [view, setView] = useState('chat')
  const [tokenOpen, setTokenOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [telegramCode, setTelegramCode] = useState('')
  const [membership, setMembership] = useState(null)
  const [checkingMembership, setCheckingMembership] = useState(false)
  const [tokens, setTokens] = useState([])
  const [tokenSecret, setTokenSecret] = useState('')
  const [usage, setUsage] = useState(null)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const activeChat = chats.find((chat) => chat.id === active)
  const accountLabel = user?.displayName || 'AetherOps'
  const spent = usage?.totalTokens || 0
  const usageLimit = usage?.dailyTokenLimit || 20000
  const usagePercent = Math.min(100, Math.round((spent / usageLimit) * 100))

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2500)
  }

  const refreshMembership = async (showToast = false) => {
    setCheckingMembership(true)
    try {
      const result = await api('/api/channel/status')
      setMembership(result)
      setUser((current) => current ? { ...current, telegramLinked: result.telegramLinked } : current)
      if (showToast) notify(result.isMember ? 'عضویت کانال تأیید شد' : result.telegramLinked ? 'عضویت کانال تأیید نشد' : 'اول تلگرام را به حساب وصل کن')
      return result
    } catch (cause) {
      setMembership({ isMember: false, telegramLinked: Boolean(user?.telegramLinked), unavailable: true, message: cause.message })
      if (showToast) notify(cause.message)
      return null
    } finally {
      setCheckingMembership(false)
    }
  }

  useEffect(() => {
    let activeEffect = true
    api('/api/auth/me').then((result) => { if (activeEffect) setUser(result.user) }).catch(() => {}).finally(() => { if (activeEffect) setAuthLoading(false) })
    return () => { activeEffect = false }
  }, [])

  useEffect(() => {
    if (!user?.id) { setMembership(null); return }
    let activeEffect = true
    api('/api/channel/status').then((result) => { if (activeEffect) setMembership(result) }).catch((cause) => {
      if (activeEffect) setMembership({ isMember: false, telegramLinked: Boolean(user.telegramLinked), unavailable: true, message: cause.message })
    })
    return () => { activeEffect = false }
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    let activeEffect = true
    Promise.all([api('/api/chats'), api('/api/tokens'), api('/api/usage')]).then(([chatResult, tokenResult, usageResult]) => {
      if (!activeEffect) return
      const loadedChats = chatResult.chats.map((chat) => ({ ...chat, time: new Date(chat.updatedAt).toLocaleString(localeFor(language), { dateStyle: 'short', timeStyle: 'short' }), preview: '' }))
      setChats(loadedChats)
      setTokens(tokenResult.tokens.map((token) => ({ ...token, created: new Date(token.createdAt).toLocaleDateString(localeFor(language)) })))
      setUsage(usageResult)
    }).catch((cause) => { if (activeEffect) notify(cause.message) })
    return () => { activeEffect = false }
  }, [user?.id, language])

  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => api('/api/auth/me').then((result) => setUser(result.user)).catch(() => {}), 15_000)
    return () => window.clearInterval(timer)
  }, [user?.id])

  const newChat = async () => {
    try {
      const result = await api('/api/chats', { method: 'POST', body: { title: 'گفت‌وگوی تازه' } })
      const item = { ...result.chat, time: 'همین الان', preview: '' }
      setChats((old) => [item, ...old]); setActive(item.id); setMessages([]); setView('chat'); setMobileNav(false)
    } catch (cause) { notify(cause.message) }
  }

  const deleteChat = async (id, event) => {
    event?.stopPropagation()
    try { await api(`/api/chats/${id}`, { method: 'DELETE' }) } catch (cause) { notify(cause.message); return }
    setChats((old) => old.filter((chat) => chat.id !== id))
    if (active === id) { setActive(null); setMessages([]) }
    notify('گفت‌وگو حذف شد')
  }

  const openChat = async (id) => {
    setActive(id); setView('chat'); setMobileNav(false); setMessages([])
    try {
      const result = await api(`/api/chats/${id}`)
      setMessages(result.messages.map((message) => ({ role: message.role, text: message.content, model: message.model })))
    } catch (cause) { notify(cause.message) }
  }

  const sendMessage = async (text = prompt) => {
    if (!text.trim() || sending) return
    const currentText = text.trim()
    setMessages((old) => [...old, { role: 'user', text: currentText }]); setPrompt(''); setSending(true)
    try {
      const result = await api('/api/ai/chat', { method: 'POST', body: { chatId: active, message: currentText, model: model.name } })
      setMessages((old) => [...old, { role: 'assistant', text: result.answer, model: result.model }])
      setActive(result.chatId)
      setChats((old) => [{ id: result.chatId, title: result.title, channel: 'web', time: 'همین الان', preview: currentText }, ...old.filter((chat) => chat.id !== result.chatId)])
      api('/api/usage').then(setUsage).catch(() => {})
    } catch (cause) {
      setMessages((old) => [...old, { role: 'assistant', text: cause.message, error: true }])
    } finally { setSending(false) }
  }

  const createToken = (event) => {
    event.preventDefault()
    if (!tokenName.trim()) return
    api('/api/tokens', { method: 'POST', body: { name: tokenName.trim() } }).then((result) => {
      setTokens((old) => [{ ...result.token, created: 'همین الان' }, ...old]); setTokenSecret(result.secret); setTokenName(''); setTokenOpen(true); notify('توکن ساخته شد؛ آن را اکنون کپی کن')
    }).catch((cause) => notify(cause.message))
  }

  const revokeToken = async (id) => {
    try { await api(`/api/tokens/${id}`, { method: 'DELETE' }); setTokens((old) => old.filter((item) => item.id !== id)); notify('توکن لغو شد') }
    catch (cause) { notify(cause.message) }
  }

  const linkTelegram = async () => {
    try {
      const result = await api('/api/telegram/link-code', { method: 'POST', body: {} })
      setTelegramCode(result.code)
    } catch (cause) { notify(cause.message) }
  }

  const unlinkTelegram = async () => {
    try {
      await api('/api/telegram/link', { method: 'DELETE' })
      setUser((old) => ({ ...old, telegramLinked: false }))
      setMembership({ isMember: false, telegramLinked: false })
      notify('اتصال تلگرام قطع شد')
    } catch (cause) { notify(cause.message) }
  }

  const copyValue = async (value, label) => {
    try { await navigator.clipboard.writeText(value); notify(`${label} کپی شد`) }
    catch { notify('کپی خودکار در این مرورگر در دسترس نیست') }
  }

  const logoutUser = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch {}
    setUser(null); setChats([]); setTokens([]); setMessages([]); setActive(null); setUsage(null)
  }

  const suggestions = useMemo(() => [
    { icon: <Cpu size={17} />, title: 'کد بنویس', text: 'یک Worker ساده برای ثبت درخواست‌ها بنویس' },
    { icon: <Sparkles size={17} />, title: 'ایده‌پردازی کن', text: 'برای یک ابزار هوش مصنوعی اسم پیشنهاد بده' },
    { icon: <Command size={17} />, title: 'خلاصه کن', text: 'مفهوم مدل‌های زبانی را ساده توضیح بده' },
  ], [])

  if (authLoading) return <div className="login-shell" data-theme={theme} dir={rtlLanguages.has(language) ? 'rtl' : 'ltr'}><div className="login-card"><div className="login-brand"><span className="brand-mark"><Sparkles size={18}/></span><span>AETHER<span>OPS</span><small>EDGE INTELLIGENCE</small></span></div><p className="login-description">{tr('loading')}</p></div></div>
  if (!user) return <LoginScreen language={language} onLanguageChange={changeLanguage} theme={theme} onThemeChange={changeTheme} onAuthenticated={(nextUser) => { setUser(nextUser); setChats([]); setTokens([]); setActive(null); setMessages([]) }} />

  return <div className="app-shell" data-theme={theme} dir={rtlLanguages.has(language) ? 'rtl' : 'ltr'}>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="بستن منو" />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></div>
        <div className="brand-name">AETHER<span>OPS</span><small>EDGE INTELLIGENCE</small></div>
        <button className="icon-button close-nav" onClick={() => setMobileNav(false)} aria-label="بستن"><X size={17}/></button>
      </div>
      <button className="new-chat" onClick={newChat}><Plus size={17}/><span>{tr('newChat')}</span><kbd>⌘ K</kbd></button>
      <div className="nav-caption">{tr('workspace')}</div>
      <nav className="main-nav">
        <button className={view === 'chat' ? 'nav-item active' : 'nav-item'} onClick={() => setView('chat')}><MessageSquare size={17}/><span>{tr('smartChat')}</span><span className="nav-dot"/></button>
        <button className={view === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setView('overview')}><LayoutDashboard size={17}/><span>{tr('overview')}</span></button>
        <button className={view === 'tokens' ? 'nav-item active' : 'nav-item'} onClick={() => setView('tokens')}><LockKeyhole size={17}/><span>{tr('apiTokens')}</span><span className="nav-count">{tokens.length}</span></button>
      </nav>
      <div className="sidebar-separator" />
      <div className="history-heading"><span>{tr('recentChats')}</span><button className="icon-button tiny" onClick={newChat} aria-label={tr('newChat')}><Plus size={15}/></button></div>
      <div className="chat-history">
        {chats.map((chat) => <button className={`history-item ${active === chat.id && view === 'chat' ? 'selected' : ''}`} key={chat.id} onClick={() => openChat(chat.id)}>
          <MessageSquare size={15}/><span className="history-title">{chat.title}</span><span className="history-delete" onClick={(event) => deleteChat(chat.id, event)}><Trash2 size={14}/></span>
        </button>)}
        {!chats.length && <p className="empty-history">{tr('noChats')}</p>}
      </div>
      <div className="sidebar-bottom">
        <div className="plan-card"><div className="plan-card-top"><span className="plan-icon"><Zap size={14}/></span><span>{tr('dailyFree')}</span><span className="plan-value">{usagePercent}%</span></div><div className="progress-track"><span style={{ width: `${usagePercent}%` }}/></div><div className="plan-detail">{spent.toLocaleString(localeFor(language))} / {usageLimit.toLocaleString(localeFor(language))}</div></div>
        <button className="profile-row" onClick={logoutUser}><div className="avatar">{accountLabel.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{accountLabel}</b><span>{tr('freePlan')}</span></div><LogOut size={15} className="profile-more"/></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-title"><button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label={tr('workspace')}><Menu size={19}/></button><span className="breadcrumb">{tr('workspace')} <span>/</span> {view === 'chat' ? tr('smartChat') : view === 'tokens' ? tr('apiTokens') : tr('overview')}</span></div>
        <div className="topbar-actions"><div className="status-pill"><i/> {tr('edgeActive')}</div><button className="icon-button theme-toggle-app" type="button" onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}</button><select className="language-select" aria-label={tr('language')} value={language} onChange={(event) => changeLanguage(event.target.value)}>{languages.map(([code,name]) => <option value={code} key={code}>{name}</option>)}</select><button className="icon-button help-button" aria-label={tr('language')} onClick={() => notify(tr('helpSoon'))}><CircleHelp size={18}/></button><button className="avatar small-avatar" onClick={() => setView('overview')}>{accountLabel.slice(0, 1).toUpperCase()}</button></div>
      </header>

      {view === 'chat' && !membership?.isMember && <section className="chat-view channel-gate-wrap">
        <div className={`channel-gate ${membership?.unavailable ? 'gate-unavailable' : membership?.telegramLinked ? 'gate-pending' : 'gate-unlinked'}`}>
          <div className="channel-gate-orb"><LockKeyhole size={22}/></div>
          <div className="eyebrow"><span/> CHANNEL ACCESS</div>
          <h1>عضویت کانال برای ورود به چت لازم است</h1>
          <p>ابتدا عضو کانال PythonCodingAcademy شو. بعد ربات AetherOps عضویتت را بررسی می‌کند و دسترسی به چت را باز می‌کند.</p>
          <div className="channel-gate-status"><span className="status-light"/><b>{membership?.unavailable ? 'بررسی عضویت در دسترس نیست' : membership?.telegramLinked ? 'منتظر تأیید عضویت' : 'تلگرام هنوز به حساب وصل نیست'}</b></div>
          {membership?.unavailable && <p className="channel-gate-hint">برای بررسی اعضای کانال، ربات باید در کانال PythonCodingAcademy مدیر باشد.</p>}
          <div className="channel-gate-actions">
            <a className="primary-button channel-join-button" href="https://t.me/PythonCodingAcademy" target="_blank" rel="noreferrer"><Globe2 size={15}/> عضویت در کانال</a>
            {membership?.telegramLinked
              ? <button className="channel-verify-button" type="button" disabled={checkingMembership} onClick={() => refreshMembership(true)}><ShieldCheck size={15}/> {checkingMembership ? 'در حال بررسی…' : 'بررسی عضویت'}</button>
              : <button className="channel-connect-button" type="button" onClick={linkTelegram}><Send size={15}/> ساخت لینک اتصال تلگرام</button>}
          </div>
          <small className="channel-gate-note">حساب و گفت‌وگوها فقط بعد از بررسی سمت سرور باز می‌شوند.</small>
        </div>
      </section>}

      {view === 'chat' && membership?.isMember && <section className="chat-view">
        <div className="chat-toolbar"><div className="chat-meta"><div className="live-dot"/><span>{activeChat?.title || 'گفت‌وگوی جدید'}</span><span className="saved-label"><Check size={12}/> ذخیره شد</span></div><div className="toolbar-tools"><div className="model-wrap"><button className="model-select" onClick={() => setModelOpen(!modelOpen)}><span className="model-gem"><Sparkles size={13}/></span><span>{model.label}</span><ChevronDown size={14}/></button>{modelOpen && <div className="model-menu">{models.map((item) => <button key={item.name} onClick={() => { setModel(item); setModelOpen(false) }}><span className="model-option-icon"><Bot size={16}/></span><span><b>{item.label}</b><small>{item.detail}</small></span>{item.name === model.name && <Check size={15}/>}</button>)}<div className="model-note">مدل‌های Workers AI · رایگان تا سقف روزانه</div></div>}</div><button className="icon-button toolbar-icon" aria-label="تنظیمات" onClick={() => setView('overview')}><Settings2 size={17}/></button><button className="icon-button toolbar-icon" aria-label="بستن پنل" onClick={() => active && deleteChat(active)} disabled={!active}><Trash2 size={16}/></button></div></div>
        <div className="conversation-scroll">
          {messages.length === 0 ? <div className="welcome-block"><Spotlight fill="#9b7bea" className="welcome-spotlight"/><div className="welcome-orb"><div className="orb-core"><Sparkles size={25}/></div><span className="orb-ring ring-one"/><span className="orb-ring ring-two"/><span className="orb-spark spark-a"/><span className="orb-spark spark-b"/></div><div className="eyebrow"><span/> YOUR EDGE AI WORKSPACE</div><h1>{tr('welcome')}</h1><p className="welcome-copy">{tr('welcomeCopy')}</p><div className="suggestion-grid">{suggestions.map((suggestion) => <button className="suggestion-card" key={suggestion.title} onClick={() => sendMessage(suggestion.text)}><span className="suggestion-icon">{suggestion.icon}</span><span className="suggestion-copy"><b>{suggestion.title}</b><small>{suggestion.text}</small></span><ArrowUpLeft size={15} className="suggestion-arrow"/></button>)}</div></div> : <div className="message-list">{messages.map((message, i) => <div className={`message-row ${message.role}`} key={i}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={15}/> : 'ع'}</div><div className="message-content"><div className="message-role">{message.role === 'assistant' ? tr('assistant') : tr('yourQuestion')} <span>{message.role === 'assistant' ? (models.find((item) => item.name === message.model)?.label || 'AetherOps') : ''}</span></div><p>{message.text}</p>{message.role === 'assistant' && <div className="message-tools"><button onClick={() => copyValue(message.text, tr('copy'))}><Copy size={13}/> {tr('copy')}</button><span>{message.error ? 'Error' : 'Workers AI'}</span></div>}</div></div>)}</div>}
        </div>
        <div className="composer-wrap"><form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}><button className="attach-button" type="button" onClick={() => notify('')} aria-label="Attach"><Plus size={18}/></button><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder={tr('ask')} rows="1"/><div className="composer-bottom"><span className="composer-hint"><span className="tiny-spark">✳</span> {tr('answerReview')}</span><button className={`send-button ${prompt.trim() ? 'ready' : ''}`} type="submit" disabled={!prompt.trim() || sending} aria-label={tr('send')}><Send size={16}/></button></div></form><div className="composer-foot"><span><ShieldCheck size={12}/> {tr('edgeProcessing')}</span><span className="foot-separator">·</span><span>{tr('freeQuota')}</span><kbd>↵ {tr('send')}</kbd></div></div>
      </section>}

      {view === 'overview' && <section className="page-view">
        <div className="page-heading"><div><div className="eyebrow"><span/> ACCOUNT CENTER</div><h1>نمای کلی حساب</h1><p>وضعیت فضای کار و مصرف روزانه‌ات را بررسی کن.</p></div><button className="primary-button" onClick={newChat}><Plus size={16}/> گفت‌وگوی جدید</button></div>
        <div className={`membership-card ${membership?.isMember ? 'is-member' : membership?.unavailable ? 'is-unavailable' : 'is-required'}`}>
          <div className="membership-icon">{membership?.isMember ? <Check size={18}/> : <ShieldCheck size={18}/>}</div>
          <div className="membership-copy"><div className="membership-title">{membership?.isMember ? 'عضویت کانال تأیید شد' : 'عضویت در کانال الزامی است'}<span>{membership?.isMember ? 'ACTIVE' : membership?.unavailable ? 'CHECK UNAVAILABLE' : 'REQUIRED'}</span></div><p>{membership?.isMember ? 'حساب تلگرام به AetherOps وصل است و دسترسی چت فعال شده.' : membership?.unavailable ? 'ربات نمی‌تواند عضویت را بررسی کند؛ دسترسی مدیر کانال برای ربات لازم است.' : membership?.telegramLinked ? 'عضو کانال شو، سپس بررسی عضویت را بزن.' : 'عضو کانال شو و بعد حساب تلگرامت را وصل کن تا دسترسی فعال شود.'}</p></div>
          <div className="membership-actions"><a href="https://t.me/PythonCodingAcademy" target="_blank" rel="noreferrer" className="membership-join-link">عضویت در کانال</a>{membership?.telegramLinked ? <button type="button" className="membership-check-button" disabled={checkingMembership} onClick={() => refreshMembership(true)}>{checkingMembership ? 'بررسی…' : 'بررسی عضویت'}</button> : <button type="button" className="membership-connect-button" onClick={linkTelegram}>اتصال تلگرام</button>}</div>
        </div>
        <div className="stats-grid"><StatCard icon={<Activity size={18}/>} label="مصرف امروز" value={spent.toLocaleString('fa-IR')} unit="توکن تخمینی" change={`از ${usageLimit.toLocaleString('fa-IR')} سقف داخلی`} tone="violet"/><StatCard icon={<MessageSquare size={18}/>} label="گفت‌وگوها" value={chats.length.toLocaleString('fa-IR')} unit="گفت‌وگو" change="در فضای کار شما" tone="blue"/><StatCard icon={<LockKeyhole size={18}/>} label="توکن‌های فعال" value={tokens.length.toLocaleString('fa-IR')} unit="توکن" change="قابل لغو در هر زمان" tone="green"/></div>
        <div className="overview-grid"><div className="surface-card usage-card"><div className="surface-title"><div><h2>مصرف مدل‌ها</h2><p>شمارش تخمینی توکن‌های ورودی و خروجی امروز</p></div><span className="period-chip">امروز <ChevronDown size={13}/></span></div><div className="usage-number">{spent.toLocaleString('fa-IR')} <small>/ {usageLimit.toLocaleString('fa-IR')} توکن</small></div><div className="large-progress"><span style={{width:`${usagePercent}%`}}/></div><div className="legend-row"><span><i className="legend-purple"/> Workers AI</span><b>{usagePercent.toLocaleString('fa-IR')}٪</b></div><div className="daily-note"><span className="note-icon"><Zap size={15}/></span><span>سقف داخلی برای کنترل مصرف است؛ سهمیهٔ واقعی Workers AI برحسب neuron و در کل حساب Cloudflare محاسبه می‌شود.</span></div></div>
          <div className="surface-card account-card"><div className="surface-title"><div><h2>حساب کاربری</h2><p>تنظیمات و اتصال‌ها</p></div><button className="icon-button" onClick={() => notify('تنظیمات حساب به‌زودی')}><Settings2 size={17}/></button></div>
            <div className="account-line"><span className="account-line-icon"><UserRound size={16}/></span><div><b>{accountLabel}</b><small>{user.identityProvider === 'telegram' ? 'حساب تلگرام تأییدشده' : 'حساب قدیمی'}</small></div><span className="verified"><Check size={12}/> فعال</span></div>
            <div className="account-line"><span className="account-line-icon telegram-icon"><Send size={15}/></span><div><b>ربات تلگرام</b><small>{user.telegramLinked ? 'به حساب متصل است' : 'برای عضویت و ورود لازم است'}</small></div><a className="text-button" href="https://t.me/AetherOpsChatBot" target="_blank" rel="noreferrer">بازکردن ربات <ArrowUpLeft size={13}/></a></div>
            {!user.telegramLinked && <div className="account-telegram-connect"><button className="telegram-connect-button" onClick={linkTelegram}><Link2 size={15}/> ساخت کد اتصال یک‌بارمصرف</button><small>کد به این حساب اختصاص دارد، پس از یک‌بار استفاده حذف می‌شود و فقط ۱۰ دقیقه اعتبار دارد.</small></div>}
            <div className="account-line"><span className="account-line-icon"><Globe2 size={16}/></span><div><b>ناحیهٔ اجرا</b><small>Cloudflare Edge Network</small></div><span className="live-tag"><i/> فعال</span></div>
          </div></div>
        <div className="surface-card recent-card"><div className="surface-title"><div><h2>گفت‌وگوهای اخیر</h2><p>آخرین فعالیت‌ها در فضای کار</p></div><button className="text-button" onClick={() => setView('chat')}>مشاهدهٔ همه <ArrowUpLeft size={14}/></button></div><div className="recent-list">{chats.slice(0, 4).map((chat) => <button className="recent-row" key={chat.id} onClick={() => openChat(chat.id)}><span className="recent-chat-icon"><MessageSquare size={16}/></span><span className="recent-chat-title"><b>{chat.title}</b><small>{chat.channel === 'telegram' ? 'گفت‌وگوی تلگرام' : 'گفت‌وگوی ذخیره‌شده'}</small></span><span className="recent-time">{chat.time}</span><ArrowUpLeft size={15} className="recent-arrow"/></button>)}</div></div>
      </section>}

      {view === 'tokens' && <section className="page-view"><div className="page-heading"><div><div className="eyebrow"><span/> DEVELOPER SETTINGS</div><h1>توکن‌های API</h1><p>برای اتصال AetherOps به اپلیکیشن‌های خودت کلید بساز و مدیریت کن.</p></div><button className="primary-button" onClick={() => { setTokenSecret(''); setTokenOpen(true) }}><Plus size={16}/> ساخت توکن</button></div><div className="token-banner"><div className="banner-icon"><ShieldCheck size={21}/></div><div><b>کلیدها را امن نگه دار</b><p>توکن کامل فقط یک‌بار بعد از ساخت نمایش داده می‌شود. آن را در کد سمت کاربر قرار نده.</p></div><span className="banner-badge">محافظت‌شده</span></div><div className="surface-card token-card"><div className="surface-title"><div><h2>کلیدهای شما</h2><p>{tokens.length.toLocaleString('fa-IR')} توکن در این حساب</p></div><button className="icon-button" onClick={() => notify('راهنمای API به‌زودی')}><CircleHelp size={17}/></button></div>{tokens.length ? <TokenDataTable tokens={tokens} onRevoke={revokeToken}/> : <div className="empty-tokens"><span><LockKeyhole size={21}/></span><b>هنوز توکنی نساخته‌ای</b><p>یک توکن بساز تا از API در برنامه‌هایت استفاده کنی.</p><button className="secondary-button" onClick={() => { setTokenSecret(''); setTokenOpen(true) }}><Plus size={15}/> ساخت اولین توکن</button></div>}</div><div className="token-footnote"><LockKeyhole size={14}/> کلیدهای API و اطلاعات احراز هویت در نسخهٔ نهایی به‌صورت امن در Worker مدیریت می‌شوند.</div></section>}
    </main>

    {tokenOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setTokenOpen(false); setTokenSecret('') } }}><form className="modal" onSubmit={createToken}><button type="button" className="modal-close icon-button" onClick={() => { setTokenOpen(false); setTokenSecret('') }}><X size={17}/></button><div className="modal-icon"><LockKeyhole size={20}/></div><h2>{tokenSecret ? 'توکن ساخته شد' : 'ساخت توکن API'}</h2><p>{tokenSecret ? 'این مقدار فقط همین یک‌بار نمایش داده می‌شود؛ قبل از بستن پنجره آن را کپی کن.' : 'یک نام برای این کلید انتخاب کن تا بعداً راحت‌تر پیدایش کنی.'}</p>{tokenSecret ? <div className="secret-token-row"><code dir="ltr">{tokenSecret}</code><button type="button" className="icon-button" aria-label="کپی توکن" onClick={() => copyValue(tokenSecret, 'توکن')}><Copy size={16}/></button></div> : <><label htmlFor="token-name">نام توکن</label><input id="token-name" autoFocus value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="مثلاً: اپلیکیشن شخصی"/><div className="modal-warning"><ShieldCheck size={15}/> کلید کامل ذخیره نمی‌شود و فقط یک‌بار به تو نشان داده خواهد شد.</div></>}<div className="modal-actions">{tokenSecret ? <button type="button" className="primary-button" onClick={() => { setTokenOpen(false); setTokenSecret('') }}><Check size={15}/> کپی کردم</button> : <><button type="button" className="secondary-button" onClick={() => setTokenOpen(false)}>انصراف</button><button className="primary-button" type="submit" disabled={!tokenName.trim()}><Plus size={15}/> ساخت توکن</button></>}</div></form></div>}
    {telegramCode && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTelegramCode('') }}><div className="modal telegram-connect-modal"><button type="button" className="modal-close icon-button" onClick={() => setTelegramCode('')}><X size={17}/></button><div className="modal-icon telegram-modal-icon"><Send size={19}/></div><div className="eyebrow"><span/> PERSONAL LINK</div><h2>اتصال امن تلگرام</h2><p>این پیوند مخصوص همین حساب است. آن را باز کن تا ربات کد یک‌بارمصرف را دریافت و اتصال را ثبت کند.</p><div className="telegram-link-actions"><a className="telegram-open-button" href={`https://t.me/AetherOpsChatBot?start=${telegramCode}`} target="_blank" rel="noreferrer"><Send size={16}/> بازکردن ربات AetherOps</a><button className="telegram-copy-button" type="button" onClick={() => copyValue(`/start ${telegramCode}`, 'فرمان اتصال')}><Copy size={16}/></button></div><div className="secret-token-row telegram-command"><code dir="ltr">{telegramCode}</code><button type="button" className="icon-button" aria-label="کپی کد" onClick={() => copyValue(telegramCode, 'کد اتصال')}><Copy size={16}/></button></div><div className="telegram-code-state"><ShieldCheck size={15}/><span>۱۰ دقیقه اعتبار · فقط یک‌بار قابل استفاده · در پایگاه داده فقط هش کد نگهداری می‌شود</span></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => refreshMembership(true)} disabled={checkingMembership}>{checkingMembership ? 'در حال بررسی…' : 'بررسی اتصال و عضویت'}</button><button type="button" className="primary-button" onClick={() => setTelegramCode('')}>بستن</button></div></div></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    <a className="github-corner" href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub"><Github size={15}/><span>Open source</span></a>
  </div>
}

function StatCard({ icon, label, value, unit, change, tone }) {
  return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><div className="stat-number">{value}<small>{unit}</small></div><span className="stat-change">{change}</span><span className="stat-sparkline"><ArrowUpLeft size={14}/></span></div>
}

export default App
