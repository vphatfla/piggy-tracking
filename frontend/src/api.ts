// Base URL of the backend running in docker-compose. Override with VITE_API_URL
// in frontend/.env.local if you expose the backend on a different port/host.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** The user as the API returns it. `googleId` is deliberately not included —
 *  the backend strips it. */
export type UserProfile = {
  id: number
  firstName: string
  lastName: string
  email: string
  phoneNumber: string | null
  location: string | null
  yearOfBirth: number | null
  createdAt: string
}

export type Session = {
  /** Short-lived. Held in React state only — never localStorage, where any XSS
   *  could read it and where it would outlive the tab. */
  accessToken: string
  user: UserProfile
}

export type Receipt = {
  id: number
  userId: number
  date: string // YYYY-MM-DD
  totalAmount: string // DECIMAL(10,2) — a string so cents never round through a float
  receiptFileName: string | null
  createdAt: string
}

export type Transaction = {
  id: number
  userId: number
  receiptId: number | null
  merchantName: string
  amount: string // DECIMAL(10,2), see Receipt.totalAmount
  category: string
  createdAt: string
}

export class ApiError extends Error {
  // Declared and assigned rather than a constructor parameter property, which
  // the frontend's `erasableSyntaxOnly` tsconfig disallows.
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new ApiError(
      res.status,
      `${init.method ?? 'GET'} ${path} failed: ${res.status}${detail?.error ? ` — ${detail.error}` : ''}`,
    )
  }
  return res.json() as Promise<T>
}

// --- auth ------------------------------------------------------------------
// `credentials: 'include'` is what makes the browser send and store the
// httpOnly refresh cookie across the :5173 -> :3000 origin boundary. Without
// it the cookie is silently dropped and every session lasts 15 minutes.
const authRequest = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    credentials: 'include',
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

export const signInWithGoogle = (idToken: string) =>
  authRequest<Session>('/api/auth/google', { idToken })

/** Silent login: succeeds only if a valid refresh cookie survived from a
 *  previous visit. Throws ApiError(401) when there is no session to restore. */
export const refreshSession = () => authRequest<Session>('/api/auth/refresh')

export const logout = () => authRequest<{ ok: boolean }>('/api/auth/logout')

export const logoutEverywhere = (token: string) =>
  request<{ ok: boolean; revoked: number }>(
    '/api/auth/logout-all',
    { method: 'POST', credentials: 'include' },
    token,
  )

// --- data (all require an access token) ------------------------------------
// None of these take a userId any more: the backend scopes every query to the
// user the access token identifies.

export const getHealth = () => request<{ status: string; uptime: number }>('/api/health')

export const getMe = (token: string) => request<UserProfile>('/api/users/me', {}, token)

export const getReceipts = (token: string) => request<Receipt[]>('/api/receipts', {}, token)

export const getTransactions = (token: string) =>
  request<Transaction[]>('/api/transactions', {}, token)

export const createTransaction = (
  token: string,
  body: { merchantName: string; amount: string; category: string; receiptId?: number | null },
) => request<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(body) }, token)
