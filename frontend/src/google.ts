// Minimal typings for the slice of Google Identity Services we use. The library
// is loaded from Google's CDN at runtime, so there is no package to import
// types from — https://developers.google.com/identity/gsi/web/reference/js-reference
type CredentialResponse = { credential: string }

type GoogleIdentity = {
  accounts: {
    id: {
      initialize(options: {
        client_id: string
        callback: (response: CredentialResponse) => void
        auto_select?: boolean
      }): void
      renderButton(
        parent: HTMLElement,
        options: { theme?: string; size?: string; text?: string; shape?: string; width?: number },
      ): void
      /** Stops One Tap from silently signing the user straight back in. */
      disableAutoSelect(): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

// The placeholder from .env.example counts as unconfigured — a copied-but-not-
// edited .env.local should show the setup hint, not a button that 401s.
const PLACEHOLDER_CLIENT_ID = 'your-client-id.apps.googleusercontent.com'
const configured: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

/** Must match the GOOGLE_CLIENT_ID the backend verifies tokens against, or every
 *  sign-in fails the audience check. Empty when unconfigured — the UI says so
 *  rather than rendering a button that cannot work. */
export const GOOGLE_CLIENT_ID: string = configured === PLACEHOLDER_CLIENT_ID ? '' : configured

let loader: Promise<GoogleIdentity> | null = null

/** Injects Google's script on demand and resolves once `window.google` exists.
 *  Memoised, so React's double-invoked effects in StrictMode load it once. */
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  loader ??= new Promise((resolve, reject) => {
    if (window.google) {
      resolve(window.google)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () =>
      window.google
        ? resolve(window.google)
        : reject(new Error('Google Identity Services loaded but exposed no API'))
    script.onerror = () => reject(new Error('Could not load Google Identity Services'))
    document.head.appendChild(script)
  })
  return loader
}
