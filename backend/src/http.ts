import { Prisma } from './generated/prisma/client.ts'

/** Thrown by route handlers for client errors; mapped to a JSON body by the
 *  error middleware in app.ts. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (message: string) => new HttpError(400, message)

// --- request parsing -------------------------------------------------------

export function parseIdParam(raw: string, name = 'id'): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest(`${name} must be a positive integer`)
  }
  return id
}

export function requiredString(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${field} is required and must be a non-empty string`)
  }
  return value.trim()
}

export function optionalString(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`)
  return value.trim()
}

export function requiredInt(body: unknown, field: string): number {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (!Number.isInteger(value)) throw badRequest(`${field} is required and must be an integer`)
  return value as number
}

export function optionalInt(body: unknown, field: string): number | null {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value)) throw badRequest(`${field} must be an integer`)
  return value as number
}

/** Accepts a number or a numeric string and returns a Decimal-safe string with
 *  at most 2 decimal places, matching the DECIMAL(10,2) columns. */
export function requiredMoney(body: unknown, field: string): Prisma.Decimal {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw badRequest(`${field} is required and must be a number or numeric string`)
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw badRequest(`${field} must be a finite number`)
  }
  if (!/^-?\d{1,8}(\.\d{1,2})?$/.test(String(value))) {
    throw badRequest(`${field} must have at most 8 integer digits and 2 decimal places`)
  }
  return new Prisma.Decimal(value)
}

/** Parses a calendar date (YYYY-MM-DD) for the DATE column. Parsed as UTC so a
 *  local timezone can't shift the stored day. */
export function requiredDate(body: unknown, field: string): Date {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field} is required and must be a date in YYYY-MM-DD form`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} is not a valid date`)
  return date
}

/** Parses a budget month ("2026-09") for the VARCHAR(7) column. Kept as a
 *  string rather than a Date on purpose: it sorts lexicographically and
 *  compares with <= exactly as the budget inheritance lookup needs, and carries
 *  no timezone to convert wrongly. */
export function requiredMonth(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw badRequest(`${field} is required and must be a month in YYYY-MM form`)
  }
  return value
}

/** The optional twin of `requiredDate`, for a field that may be absent because
 *  something else supplies a default. Same UTC parse, same reason. */
export function optionalDate(body: unknown, field: string): Date | null {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (value === undefined || value === null || value === '') return null
  return requiredDate(body, field)
}

// --- response shaping ------------------------------------------------------

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10)

/** Decimal and DATE columns are normalised here so the JSON contract is
 *  explicit: money is a fixed-2dp string (never a lossy float), and a DATE is
 *  YYYY-MM-DD rather than a full timestamp. */
export const serializeReceipt = <T extends { date: Date; totalAmount: Prisma.Decimal }>(r: T) => ({
  ...r,
  date: toDateOnly(r.date),
  totalAmount: r.totalAmount.toFixed(2),
})

/** The joined category is flattened to a name rather than nested, because every
 *  other field on this contract is flat. `category` is null when the row's
 *  category was deleted — `categoryId` is SET NULL, and the spending survives
 *  without its label. Callers that did not `include` the relation get
 *  `category: null` too, which is the same thing as far as a client is
 *  concerned: no name to show. */
export const serializeTransaction = <
  T extends { amount: Prisma.Decimal; date: Date; category?: { name: string } | null },
>(
  t: T,
) => {
  const { category, ...rest } = t
  return {
    ...rest,
    date: toDateOnly(t.date),
    amount: t.amount.toFixed(2),
    category: category?.name ?? null,
  }
}

/** Strips `googleId` — it is an authentication identifier, and nothing outside
 *  the sign-in flow has any reason to see it. */
export const serializeUser = <T extends { googleId: string }>(user: T) => {
  const { googleId: _googleId, ...rest } = user
  return rest
}
