import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement
  if (root.dataset.theme === theme) return
  // Bootstrap stays static; animate only an explicit change after styles exist.
  root.dataset.themeAnimated = ''
  getComputedStyle(root).getPropertyValue('--background')
  root.style.removeProperty('background-color')
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#181D21' : '#FAFBFC')
  window.dispatchEvent(new Event('ecic-theme-change'))
}

function subscribe(listener: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === 'ecic-theme' || event.key === null)) applyTheme(event.newValue === 'dark' ? 'dark' : 'light')
  }
  window.addEventListener('ecic-theme-change', listener)
  window.addEventListener('storage', sync)
  return () => {
    window.removeEventListener('ecic-theme-change', listener)
    window.removeEventListener('storage', sync)
  }
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === 'dark')
  const label = dark ? 'Activar modo claro' : 'Activar modo oscuro'
  return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} onClick={() => {
    const theme = dark ? 'light' : 'dark'
    try { localStorage.setItem('ecic-theme', theme) } catch { /* Keep the toggle usable without storage. */ }
    applyTheme(theme)
  }}>
    <span className="theme-toggle-icon"><Sun className="theme-toggle-sun" size={18} aria-hidden="true" /><Moon className="theme-toggle-moon" size={18} aria-hidden="true" /></span>
  </button>
}
