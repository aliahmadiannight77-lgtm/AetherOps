import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Globe2, Search } from 'lucide-react'
import { languages } from '@/lib/i18n.js'

export default function LanguagePicker({ value, onChange, label = 'Language' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const selected = languages.find(([code]) => code === value) || languages[0]
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return languages
    return languages.filter(([, nativeName, englishName]) => `${nativeName} ${englishName}`.toLocaleLowerCase().includes(term))
  }, [query])

  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    inputRef.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const choose = (code) => {
    onChange(code)
    setOpen(false)
    setQuery('')
  }

  return <div className="language-picker" ref={rootRef}>
    <button className={`language-picker-trigger ${open ? 'is-open' : ''}`} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <Globe2 size={15} />
      <span className="language-picker-current">{selected?.[1]}</span>
      <ChevronDown className="language-picker-chevron" size={13} />
    </button>
    {open && <div className="language-picker-menu" role="dialog" aria-label={label}>
      <div className="language-picker-heading">
        <div><b>{label}</b><small>{languages.length} languages</small></div>
        <span className="language-picker-count">{filtered.length}</span>
      </div>
      <label className="language-picker-search">
        <Search size={14} />
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && filtered[0]) choose(filtered[0][0]) }} placeholder="Search languages…" aria-label="Search languages" />
      </label>
      <div className="language-picker-options" role="listbox" aria-label={label}>
        {filtered.map(([code, nativeName, englishName]) => <button className={`language-option ${value === code ? 'selected' : ''}`} type="button" role="option" aria-selected={value === code} key={code} onClick={() => choose(code)}>
          <span className="language-option-code">{code.toUpperCase()}</span>
          <span className="language-option-label"><b>{nativeName}</b><small>{englishName}</small></span>
          {value === code && <Check size={15} className="language-option-check" />}
        </button>)}
        {!filtered.length && <p className="language-picker-empty">No languages found</p>}
      </div>
      <div className="language-picker-footer"><Globe2 size={12} /> AetherOps supports {languages.length} interface languages</div>
    </div>}
  </div>
}
