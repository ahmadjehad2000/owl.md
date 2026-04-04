// src/renderer/components/settings/SettingsModal.tsx
import React, { useEffect } from 'react'
import { useSettingsStore, type Theme, type FontFamily, type LineHeight } from '../../stores/settingsStore'
import styles from './SettingsModal.module.css'

const THEMES: {
  id: Theme; label: string; desc: string
  bg: string; sidebar: string; lines: [string, string, string]; accent: string; titlebar: string
}[] = [
  {
    id: 'default',
    label: 'Default',
    desc: 'Classic blue-purple nebula dark',
    bg:      '#080c14',
    titlebar:'rgba(255,255,255,0.03)',
    sidebar: 'rgba(255,255,255,0.05)',
    lines:   ['rgba(56,182,220,0.7)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.12)'],
    accent:  'rgba(56,182,220,0.85)',
  },
  {
    id: 'modern-dark',
    label: 'Full Modern Dark',
    desc: 'Pure black, high contrast',
    bg:      '#000000',
    titlebar:'rgba(255,255,255,0.02)',
    sidebar: 'rgba(255,255,255,0.04)',
    lines:   ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.14)'],
    accent:  'rgba(255,255,255,0.9)',
  },
  {
    id: 'modern-light',
    label: 'Full Modern Light',
    desc: 'Clean white, minimal',
    bg:      '#f5f6fa',
    titlebar:'rgba(0,0,0,0.04)',
    sidebar: 'rgba(0,0,0,0.06)',
    lines:   ['rgba(2,132,199,0.8)', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0.14)'],
    accent:  'rgba(2,132,199,0.9)',
  },
]

const FONTS: { id: FontFamily; label: string; sample: string; style: string }[] = [
  { id: 'system',       label: 'System Default', sample: 'The quick brown fox', style: '-apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'inter',        label: 'Inter',           sample: 'The quick brown fox', style: "'Inter', sans-serif" },
  { id: 'georgia',      label: 'Georgia',         sample: 'The quick brown fox', style: "'Georgia', serif" },
  { id: 'merriweather', label: 'Merriweather',    sample: 'The quick brown fox', style: "'Merriweather', serif" },
  { id: 'jetbrains',    label: 'JetBrains Mono',  sample: 'The quick brown fox', style: "'JetBrains Mono', monospace" },
]

const LINE_HEIGHTS: { id: LineHeight; label: string; desc: string }[] = [
  { id: 'compact',  label: 'Compact',  desc: '1.5' },
  { id: 'normal',   label: 'Normal',   desc: '1.8' },
  { id: 'relaxed',  label: 'Relaxed',  desc: '2.1' },
]

export function SettingsModal(): JSX.Element | null {
  const isOpen   = useSettingsStore(s => s.isOpen)
  const draft    = useSettingsStore(s => s.draft)
  const setDraft = useSettingsStore(s => s.setDraft)
  const save     = useSettingsStore(s => s.save)
  const discard  = useSettingsStore(s => s.discard)

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') discard() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, discard])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) discard() }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerIcon}>⚙️</span>
          <span className={styles.headerTitle}>Settings</span>
          <button className={styles.closeBtn} onClick={discard} title="Discard & close">✕</button>
        </div>

        <div className={styles.body}>
          {/* ── Themes ── */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Theme</div>
            <div className={styles.themeGrid}>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  className={`${styles.themeCard} ${draft.theme === t.id ? styles.themeCardActive : ''}`}
                  onClick={() => setDraft({ theme: t.id })}
                >
                  <div className={styles.themePreview} style={{ background: t.bg }}>
                    {/* Titlebar strip */}
                    <div className={styles.previewTitlebar} style={{ background: t.titlebar }} />
                    {/* Body: sidebar + content */}
                    <div className={styles.previewBody}>
                      <div className={styles.previewSidebar} style={{ background: t.sidebar }}>
                        <div className={styles.previewSidebarItem} style={{ background: t.accent, opacity: 0.9 }} />
                        <div className={styles.previewSidebarItem} style={{ background: t.lines[1] }} />
                        <div className={styles.previewSidebarItem} style={{ background: t.lines[2] }} />
                      </div>
                      <div className={styles.previewContent}>
                        <div className={styles.previewLine} style={{ width: '80%', background: t.lines[0] }} />
                        <div className={styles.previewLine} style={{ width: '55%', background: t.lines[1] }} />
                        <div className={styles.previewLine} style={{ width: '68%', background: t.lines[2] }} />
                      </div>
                    </div>
                  </div>
                  <div className={styles.themeInfo}>
                    <span className={styles.themeLabel}>{t.label}</span>
                    <span className={styles.themeDesc}>{t.desc}</span>
                  </div>
                  {draft.theme === t.id && <div className={styles.themeCheck}>✓</div>}
                </button>
              ))}
            </div>
          </section>

          {/* ── Font family ── */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Font Family</div>
            <div className={styles.fontList}>
              {FONTS.map(f => (
                <button
                  key={f.id}
                  className={`${styles.fontRow} ${draft.fontFamily === f.id ? styles.fontRowActive : ''}`}
                  onClick={() => setDraft({ fontFamily: f.id })}
                >
                  <div className={styles.fontDot} />
                  <div className={styles.fontInfo}>
                    <span className={styles.fontLabel} style={{ fontFamily: f.style }}>{f.label}</span>
                    <span className={styles.fontSample} style={{ fontFamily: f.style }}>{f.sample}</span>
                  </div>
                  {draft.fontFamily === f.id && <span className={styles.fontCheck}>✓</span>}
                </button>
              ))}
            </div>
          </section>

          {/* ── Line height ── */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Line Spacing</div>
            <div className={styles.lineHeightRow}>
              {LINE_HEIGHTS.map(l => (
                <button
                  key={l.id}
                  className={`${styles.lineBtn} ${draft.lineHeight === l.id ? styles.lineBtnActive : ''}`}
                  onClick={() => setDraft({ lineHeight: l.id })}
                >
                  <span className={styles.lineBtnLabel}>{l.label}</span>
                  <span className={styles.lineBtnDesc}>{l.desc}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.discardBtn} onClick={discard}>Discard</button>
          <button className={styles.saveBtn} onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  )
}
