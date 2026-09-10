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

// --- the live access token -------------------------------------------------
// The access token lives 15 minutes; the session behind it lives 30 days. This
// module holds the current one and renews it on the fly, so an expiry is never
// something a screen has to show the user.
//
// It is held *here* rather than pushed back into React state on every renewal:
// `Session.accessToken` is a dependency of the dashboard's fetch, so writing a
// new one into state would refetch the month and collapse whatever the user had
// open, twice an hour, for nothing. Callers keep passing the token they were
// given — `send` prefers this one when it has been renewed since.
let currentToken: string | null = null
let renewal: Promise<Session> | null = null
let onLost: (() => void) | null = null

export function setSessionToken(session: Session | null): void {
  currentToken = session?.accessToken ?? null
}

/** Called when a renewal fails, i.e. the refresh cookie is gone, expired, or
 *  already rotated: the session is over and only App.tsx can say so. */
export function onSessionLost(callback: () => void): void {
  onLost = callback
}

/** Single-flight, and that is load-bearing: refreshing *rotates*, so two
 *  concurrent renewals revoke each other and log the user out — the same race
 *  App.tsx's mount-effect ref guards against. The dashboard fires three calls
 *  in one Promise.all, so all three can expire together and must share one. */
function renew(): Promise<Session> {
  renewal ??= refreshSession()
    .then((session) => {
      currentToken = session.accessToken
      return session
    })
    .catch((e: unknown) => {
      currentToken = null
      onLost?.()
      throw e
    })
    .finally(() => {
      renewal = null
    })
  return renewal
}

const withAuth = (init: RequestInit, token?: string): RequestInit => ({
  ...init,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init.headers,
  },
})

/** Every request goes through here. A 401 on an authed call means the access
 *  token expired mid-session: renew once and replay the request. Auth routes
 *  are excluded because renewing *is* one of them — retrying there would
 *  recurse. A failed renewal returns the original 401 so the caller still sees
 *  a real error rather than hanging. */
async function send(path: string, init: RequestInit, token?: string): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, withAuth(init, currentToken ?? token))
  if (res.status !== 401 || !token || path.startsWith('/api/auth')) return res

  try {
    const session = await renew()
    // Once, never twice: a second 401 is a real one.
    return await fetch(`${API_URL}${path}`, withAuth(init, session.accessToken))
  } catch {
    return res
  }
}

async function failure(path: string, init: RequestInit, res: Response): Promise<ApiError> {
  const detail = await res.json().catch(() => null)
  return new ApiError(
    res.status,
    `${init.method ?? 'GET'} ${path} failed: ${res.status}${detail?.error ? ` — ${detail.error}` : ''}`,
  )
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await send(path, init, token)
  if (!res.ok) throw await failure(path, init, res)
  return res.json() as Promise<T>
}

/** For the 204 routes. `request` always parses a JSON body, so routing an empty
 *  response through it throws *after* the write has already happened — which
 *  reads as a failed delete that actually succeeded. */
async function requestVoid(path: string, init: RequestInit, token: string): Promise<void> {
  const res = await send(path, init, token)
  if (!res.ok) throw await failure(path, init, res)
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

/** 204, no body. Hard delete: there is no trash to restore from. */
export const deleteTransaction = (token: string, id: number) =>
  requestVoid(`/api/transactions/${id}`, { method: 'DELETE' }, token)

export const getCategories = (token: string) => request<Category[]>('/api/categories', {}, token)

/** Find-or-create on the server: sending a name that already exists (in any
 *  case) returns the existing row rather than failing, so the caller can always
 *  treat the response as "the category to select". */
export const createCategory = (token: string, name: string) =>
  request<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }, token)

/** Rename. 409 when the name already belongs to another of your categories,
 *  compared case-insensitively — the same rule `createCategory` matches on. */
export const updateCategory = (token: string, id: number, name: string) =>
  request<Category>(
    `/api/categories/${id}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
    token,
  )

/** Deletes the label, not the spending: this category's transactions survive
 *  with `categoryId: null` (they read as "Uncategorised" from then on) while
 *  its limits are removed in *every* month. 204. */
export const deleteCategory = (token: string, id: number) =>
  requestVoid(`/api/categories/${id}`, { method: 'DELETE' }, token)

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
 *  "no budget". 204. */
export const deleteBudget = (token: string, categoryId: number, month: string) =>
  requestVoid(`/api/budgets/${categoryId}?month=${month}`, { method: 'DELETE' }, token)
