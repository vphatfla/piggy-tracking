/** The starter set every new user gets at sign-up, so the category dropdown is
 *  never empty on a fresh account — and a required category never blocks the
 *  very first transaction behind a "create a category" detour.
 *
 *  Duplicated as a VALUES list in the add_category_table migration, which
 *  backfills the same names for users who predate the feature. A migration
 *  cannot import TypeScript; keep the two in step. */
export const DEFAULT_CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Bills',
  'Shopping',
  'Entertainment',
  'Health',
] as const
