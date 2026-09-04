// Owns the app's theme choice. There is deliberately no "system"/OS-following
// option — the app always renders an explicit theme, defaulting to light, and
// the user's pick is the only thing that ever changes it. The storage key is
// read synchronously by an inline script in index.html *before* this module
// loads, so a page load never flashes the wrong theme; keep the two in sync
// if this contract changes.
export type ThemePreference = 'light' | 'dark'

const STORAGE_KEY = 'piggy-theme'
const DEFAULT_THEME: ThemePreference = 'light'

export function getStoredThemePreference(): ThemePreference {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME
}

export function applyThemePreference(pref: ThemePreference): void {
  document.documentElement.dataset.theme = pref
  localStorage.setItem(STORAGE_KEY, pref)
  // Mirrors the inline index.html script's #theme-color-meta update, so a
  // live switch (not just the next page load) moves the mobile browser
  // chrome color too.
  document
    .getElementById('theme-color-meta')
    ?.setAttribute('content', pref === 'dark' ? '#000000' : '#FFFFFF')
}
