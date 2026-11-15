import { createContext, useContext } from 'react'
import type { Category } from './api'

/** Who owns a category, as a label — but only while a share shows both
 *  members' categories. Null means "no label needed": unshared, or a share that
 *  shows one member's set, where every category is the same person's and a
 *  label would be noise. Carried in context because the category pickers sit
 *  several components below the dashboard and all need the same answer. */
export type CategoryOwners = { labelFor: (c: Category) => string | null }

export const CategoryOwnersContext = createContext<CategoryOwners>({ labelFor: () => null })

export const useCategoryOwners = () => useContext(CategoryOwnersContext)

/** "Groceries · You" when labelled, the bare name otherwise. Both people will
 *  often have a category with the same name, so the name alone is ambiguous. */
export const categoryDisplayName = (c: Category, label: string | null) =>
  label ? `${c.name} · ${label}` : c.name
