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

export type Category = {
  id: number
  userId: number
  name: string
  createdAt: string
}

/** A spending limit *in effect* for one category in one month — not
 *  necessarily a row set for that month. `month` is the month the limit was
 *  set for and `inherited` says whether that differs from the month asked
 *  about, because editing an inherited limit writes a new row for the viewed
 *  month rather than rewriting history. */
export type Budget = {
  categoryId: number
  amount: string // DECIMAL(10,2), see Receipt.totalAmount
  month: string // YYYY-MM
  inherited: boolean
}

export type Transaction = {
  id: number
  userId: number
  receiptId: number | null
  date: string // YYYY-MM-DD — when the money was spent, not when the row was made
  merchantName: string
  amount: string // DECIMAL(10,2), see Receipt.totalAmount
  categoryId: number | null
  /** The category's name, flattened from the relation. Null means the category
   *  was deleted — the API requires one on create, so this is never "the user
   *  didn't pick". Render it as "Uncategorised". */
  category: string | null
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

/** `range` is inclusive at both ends and optional — omitting it still means
 *  "every transaction". The month view is a preset over this one filter. */
export const getTransactions = (token: string, range?: { from: string; to: string }) =>
  request<Transaction[]>(
    `/api/transactions${range ? `?from=${range.from}&to=${range.to}` : ''}`,
    {},
    token,
  )

export const createTransaction = (
  token: string,
  body: {
    merchantName: string
    amount: string
    categoryId: number
    date: string
    receiptId?: number | null
  },
) => request<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(body) }, token)

/** Partial by design: only the fields present are written. Omitting a field
 *  leaves it alone; sending `receiptId: null` or `categoryId: null` explicitly
 *  clears it. Do not "helpfully" send the whole object. */
export const updateTransaction = (
  token: string,
  id: number,
  patch: Partial<{
    merchantName: string
    amount: string
    categoryId: number | null
    date: string
    receiptId: number | null
  }>,
) =>
  request<Transaction>(
    `/api/transactions/${id}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    token,
  )

/** 204, no body — so this one cannot go through `request`, which always parses
 *  JSON. Hard delete: there is no trash to restore from. */
export async function deleteTransaction(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/transactions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new ApiError(
      res.status,
      `DELETE /api/transactions/${id} failed: ${res.status}${detail?.error ? ` — ${detail.error}` : ''}`,
    )
  }
}

export const getCategories = (token: string) => request<Category[]>('/api/categories', {}, token)

/** Find-or-create on the server: sending a name that already exists (in any
 *  case) returns the existing row rather than failing, so the caller can always
 *  treat the response as "the category to select". */
export const createCategory = (token: string, name: string) =>
  request<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }, token)

// --- budgets ---------------------------------------------------------------

/** Effective limits for `month`: one entry per category that has one, so a
 *  category absent from the result has no limit yet — which is not the same as
 *  a limit of zero. */
export const getBudgets = (token: string, month: string) =>
  request<Budget[]>(`/api/budgets?month=${month}`, {}, token)

/** Has this user ever set a budget, at all — independent of which month is in
 *  view. Used once for the first-run nudge; see the route's own comment for
 *  why `GET /?month=` can't answer the same question. */
export const getBudgetsExist = (token: string) =>
  request<{ exists: boolean }>('/api/budgets/exists', {}, token)

/** Upsert of one (categoryId, month) row. PUT, not POST: setting the same
 *  limit twice has to mean the same as setting it once. */
export const putBudget = (
  token: string,
  body: { categoryId: number; month: string; amount: string },
) => request<Budget>('/api/budgets', { method: 'PUT', body: JSON.stringify(body) }, token)

/** Removes the row set *for that exact month*. The category then falls back to
 *  whatever earlier month it inherits from — which may be another number, not
 *  "no budget". 204, so it cannot go through `request`. */
export async function deleteBudget(token: string, categoryId: number, month: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/budgets/${categoryId}?month=${month}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new ApiError(
      res.status,
      `DELETE /api/budgets/${categoryId} failed: ${res.status}${detail?.error ? ` — ${detail.error}` : ''}`,
    )
  }
}
