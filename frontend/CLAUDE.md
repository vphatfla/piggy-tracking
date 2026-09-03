# Frontend guide

React 19 + Vite 8 + TypeScript, built as a **static SPA**. No SSR, no Next.js —
`npm run build` must keep producing a plain `dist/` that any static host serves.

**This app is not containerised and must stay that way.** It has no Dockerfile
and is absent from `docker-compose.yml`; it runs natively so HMR stays fast. The
backend is a separate origin (`:3000` vs `:5173`), which is why CORS exists.

## Commands

```bash
npm run dev        # http://localhost:5173 with HMR
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the production build
npm run lint       # oxlint (NOT eslint — see below)
```

`npm run dev` needs the backend up (`docker compose up` at the repo root) or
every request fails and the UI shows an error banner.

## Tailwind v4 — there is no config file

Tailwind is v4 via the `@tailwindcss/vite` plugin. **v4 is CSS-first: there is no
`tailwind.config.js`, and creating one will not do anything.** Configuration —
theme tokens, custom utilities — goes in `src/index.css` next to
`@import "tailwindcss"`, using `@theme`/`@utility`. The plugin scans sources
itself; there is no `content` array to maintain.

If you find yourself reaching for `tailwind.config.js`, you are following v3
instructions and they do not apply.

Styling is utility classes inline in JSX. No CSS modules, no styled-components,
and `src/App.css` was deliberately deleted — don't reintroduce per-component
stylesheets. The one thing that *does* belong in `src/index.css` is the design
system: the `@theme` token block and the dark-mode overrides described under
Design language below.

## Design language — Apple HIG

The UI follows Apple's **Human Interface Guidelines**. Not "inspired by": when a
question comes up — how big is the tap target, how heavy is the divider, what
does a pressed button do — the answer is whatever iOS/macOS does. Clean and
elegant over decorative. Content first, chrome last.

The five rules everything else follows from:

1. **Deference.** The interface recedes; the user's numbers are the loudest
   thing on screen. No gradients on text, no glows, no borders drawn just to
   show where a box ends.
2. **Clarity through hierarchy, not decoration.** Separate things with
   whitespace and type weight before reaching for a rule, a card, or a colour.
3. **One accent colour.** Orange is the app's tint and it appears sparingly —
   interactive things, the current selection, one key figure. A screen where
   three things are orange has no accent.
4. **Depth is subtle.** Elevation is a soft, low-opacity shadow and a lighter
   surface, never a hard border plus a drop shadow.
5. **Every control is at least 44×44 px** of hit area, whatever its visual size.

### Two themes, both first-class

| | Bright (daylight) | Dark (night) |
|---|---|---|
| Base background | `#FFFFFF` | `#000000` |
| Grouped page background | `#F2F2F7` | `#000000` |
| Elevated surface (cards, sheets) | `#FFFFFF` | `#1C1C1E` |
| Surface above that | `#F2F2F7` | `#2C2C2E` |
| Primary text | `#000000` | `#FFFFFF` |
| Secondary text | `rgb(60 60 67 / 0.60)` | `rgb(235 235 245 / 0.60)` |
| Tertiary text | `rgb(60 60 67 / 0.30)` | `rgb(235 235 245 / 0.30)` |
| Separator | `rgb(60 60 67 / 0.29)` | `rgb(84 84 88 / 0.65)` |
| **Accent (orange)** | `#FF9500` | `#FF9F0A` |
| Accent, text-safe | `#B45309` | `#FF9F0A` |
| Destructive / over budget | `#FF3B30` | `#FF453A` |
| Positive / income | `#34C759` | `#30D158` |
| Link / info | `#007AFF` | `#0A84FF` |

These are Apple's system colours, including the deliberate light/dark pairs —
dark mode is **not** the light palette dimmed. Apple brightens and desaturates
accents for dark backgrounds because a saturated colour on black vibrates; use
the dark column's values, not `opacity`.

Dark mode's base is true black on purpose: it is an OLED-friendly phone-first
app, and it makes `#1C1C1E` cards read as elevated without any border.

**The orange trap.** `#FF9500` on white is ~2.1:1 — it fails text contrast
badly. Orange is for **fills, glyphs, and accents**, not for body copy or small
labels on a light background. When orange must *be* the text in bright theme,
use the text-safe value. This is the single most likely way to make the app look
cheap and be inaccessible at the same time.

### Tokens, not hex

All of the above lives as CSS custom properties in an `@theme` block in
`src/index.css` (Tailwind v4 is CSS-first — see above). Components use the
**semantic** name, never the raw colour:

```
--color-bg, --color-bg-grouped, --color-surface, --color-surface-raised
--color-label, --color-label-secondary, --color-label-tertiary
--color-separator, --color-accent, --color-accent-text, --color-on-accent
--color-danger, --color-danger-text, --color-success, --color-link
```

so `className="bg-surface text-label-secondary"`, not `bg-white text-slate-500`.
Adding a colour means adding a token; a bare hex or a stock Tailwind palette
class (`slate-900`, `sky-400`) in a component is a bug.

The `-text` / `on-` pairs exist because orange and system red are **fill**
colours: white-on-orange is ~2:1 and red-on-white is ~3.1:1. A label *on* an
accent fill uses `text-on-accent` (dark, ~10:1); accent-coloured *text* on a
page uses `text-accent-text`. Reaching for `text-accent` on a light background
is the bug this pair prevents.

**Theme switching has three states**, matching how Apple does it: system,
explicitly light, explicitly dark. Define the light values on `:root`, override
them under `@media (prefers-color-scheme: dark)` guarded so an explicit light
choice wins, and override them again under an explicit `[data-theme="dark"]` on
`<html>`. Because the tokens carry the theme, components mostly need **no**
`dark:` variants at all — reach for one only when the *shape* differs, not the
colour.

The app **has no theme toggle and is not meant to grow one lightly**: the
`@media (prefers-color-scheme: dark)` block is the whole mechanism, so the UI
follows the OS appearance on desktop and phone with no JS and nothing persisted.
The `[data-theme]` blocks are written but inert — they are the hook a toggle
would use, and they are why the media query is guarded with
`:not([data-theme='light'])`.

Two supporting pieces that are easy to forget when changing colours:
`index.html` carries `<meta name="color-scheme" content="light dark">` plus a
**pair** of `theme-color` metas with `prefers-color-scheme` media attributes
(a manifest `theme_color` cannot be responsive, so the one in `vite.config.ts`
just holds the light base `#FFFFFF`).

One Tailwind v4 detail the whole scheme rests on: the mapping block is
`@theme inline`, not plain `@theme`. `inline` compiles `bg-surface` to
`background: var(--p-surface)` instead of baking today's hex into the utility —
without it, a class would be frozen to one theme and every component would need
`dark:` variants.

### Type

System font stack, so the app renders in SF on Apple platforms and the native UI
face elsewhere:

```
-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif
```

Use Apple's text styles rather than inventing sizes. Sizes in px, line height
after the slash:

| Style | Size/leading | Weight | Used for |
|---|---|---|---|
| Large Title | 34/41 | 700 | screen title, the big balance |
| Title 2 | 22/28 | 600 | section headers |
| Headline | 17/22 | 600 | row primary text |
| Body | 17/22 | 400 | default |
| Subheadline | 15/20 | 400 | row secondary text |
| Footnote | 13/18 | 400 | metadata, timestamps |
| Caption | 12/16 | 400 | the smallest thing allowed |

Tighten tracking on Large Title (`tracking-tight`); leave everything else alone.
Never go below 12px. Weight and colour carry hierarchy — do not use ALL CAPS
except for a grouped-list section header (Footnote, secondary colour).

**Money is tabular.** Amounts use `font-variant-numeric: tabular-nums` so
columns of figures line up. It is still a string end to end (see Backend calls);
formatting is a display concern and lives in `src/format.ts` — `formatMoney`
wraps `Intl.NumberFormat` (currency is a single constant there, currently USD,
because the API carries no currency code) and `sumMoney` adds in integer cents
so a total never drifts through float addition. Never feed their output back
into a request.

`formatDate` and `todayIso` live there too, and both exist because of the same
trap: `new Date('2026-09-02')` parses as **UTC midnight**, so formatting it
anywhere west of Greenwich renders the previous day. `formatDate` builds the
date from split parts to stay local, and `todayIso` reads the user's own clock —
the date input must default to *their* today, not the server's.

### Layout, shape, motion

- **8px rhythm**, 4px for tight pairs. Screen gutter 16px on phone, 20–24px on
  wide. List rows are 44px minimum, 60px when they carry two lines.
- **Continuous-feeling corners**: 10px on controls and inputs, 14px on cards and
  sheets, full pill on segmented controls and chips. Never square, never
  circles-for-cards.
- **Elevation** = surface colour change + `0 1px 3px rgb(0 0 0 / 0.08)` in
  bright, and surface colour change *only* in dark (shadows are invisible on
  black — a raised surface there is a lighter grey).
- Grouped lists are the default structure for data: rounded container, hairline
  separators **inset to the text**, not full-bleed.
- **Motion is 200–300ms, ease-out**, and only ever explains a change of state.
  Honour `prefers-reduced-motion: reduce` by dropping to an opacity fade.
- Interactive states are required, not optional: hover (pointer devices only),
  a visible pressed state, a `:focus-visible` ring in the accent colour, and a
  disabled state at reduced opacity that still passes contrast.

### Accessibility floor

4.5:1 for text under 18px, 3:1 for large text and for the boundary of any
control, in **both** themes — check the dark one separately, it is where this
usually breaks. Colour is never the only signal (an over-budget row needs a word
or a glyph, not just red). Everything reachable and operable by keyboard.

## PWA

`vite-plugin-pwa` is configured in `vite.config.ts` with `registerType: 'autoUpdate'`
and `devOptions.enabled` (so the service worker is live in dev too). It is
scaffolding for later work — the install prompt is not built out yet.

- `public/pwa-192x192.png` and `pwa-512x512.png` are **flat-colour placeholders**.
  Replace them with real icons before shipping; the manifest already references them.
- Dev builds emit `dev-dist/`. It is ignored by the **root** `.gitignore`, not
  this directory's — don't be surprised when it appears.
- A stale service worker is the usual reason a change "doesn't show up" in dev.
  Hard-reload or unregister it before debugging further.

## Backend calls

All HTTP goes through `src/api.ts`. **Add a typed function there rather than
calling `fetch` from a component.** Base URL is `import.meta.env.VITE_API_URL`,
defaulting to `http://localhost:3000`; override in `frontend/.env.local`.

Types in `src/api.ts` mirror the backend's serialization contract, so:

- **Money is a `string`, not a `number`** (`amount: "48.75"`). It is
  `DECIMAL(10,2)` in Postgres and stays a string end to end so cents can't drift
  through float rounding. Convert with `Number(...)` only for display arithmetic,
  and send strings back on POST.
- `Receipt.date` and `Transaction.date` are `"YYYY-MM-DD"`, not ISO timestamps.
  A transaction's `date` is when the money was spent; `createdAt` is only when
  the row was made, and is not what the UI shows.

Error bodies are `{ error: string }`; `request()` already unwraps them into the
thrown `ApiError`, which carries `.status` — the mount effect uses it to tell a
routine "no session" 401 from a real failure.

**Every data call takes the access token as its first argument.** None of them
take a `userId` any more: the backend derives it from the token, so there is no
id to pass and no way to ask for someone else's rows.

`ApiError` declares `status` as a field and assigns it in the constructor rather
than using a parameter property — `tsconfig.app.json` sets `erasableSyntaxOnly`,
which rejects the shorthand.

## Auth

`src/App.tsx` owns the session as a three-state machine: `restoring` →
`authenticated` | `anonymous`.

- On mount it calls `refreshSession()` (`POST /api/auth/refresh` with
  `credentials: 'include'`). A 401 is the normal "nothing to restore" answer, not
  an error — it just renders `<SignIn />`.
- **`credentials: 'include'` is mandatory on every `/api/auth` call.** Without it
  the browser neither sends nor stores the httpOnly refresh cookie, and sessions
  silently stop surviving a reload.
- **The access token lives in React state only.** Never `localStorage` or
  `sessionStorage` — anything an XSS can read, it can exfiltrate, and the token
  would outlive the tab.
- The mount effect is guarded by a `useRef` flag. This is not cosmetic:
  refreshing **rotates** the token, so StrictMode's double-invoked effect would
  present an already-revoked cookie on the second call and log the user out. Do
  not remove the guard.
- `src/google.ts` injects Google Identity Services from its CDN on demand and
  memoises the promise. `VITE_GOOGLE_CLIENT_ID` must equal the backend's
  `GOOGLE_CLIENT_ID`; when it is unset, `<SignIn />` says so rather than
  rendering a button that cannot work.
- Sign-out calls `google.accounts.id.disableAutoSelect()` before clearing state,
  or One Tap signs the user straight back in.

## The month is the unit of the screen

`src/month.ts` owns month arithmetic — `currentMonth`, `addMonths`,
`monthBounds`, `formatMonthLabel`. Months are `"YYYY-MM"` strings and every
helper does string/number maths: **nothing here parses a date out of a string**,
because `new Date('2026-09-01')` is UTC midnight and slides to the previous day
west of Greenwich. Same trap `formatDate` documents; `currentMonth` reads the
user's clock for the same reason `todayIso` does.

`monthBounds` feeds `getTransactions(token, { from, to })`, so the fetched list
*is* the month and the header total is simply `sumMoney` over it. That stays
true only while the fetch is month-scoped — a total over a partially-fetched
list would be silently wrong.

**Sorting is client-side on purpose.** The list is already bounded to one month,
so reordering is instant, costs no round trip, and leaves the API with exactly
one canonical order (`date desc, id desc`). Amount sorts on integer cents to
match `sumMoney`, and ties break on `id` descending so rows do not shuffle
between renders. **Move sorting server-side the day a month's rows get
paginated** — at that point the client no longer holds everything it is
ordering.

## Categories

`GET /api/categories` is fetched **once per session, in its own effect keyed on
the access token** — not inside `refresh()`. Categories do not change when the
month does, and folding them into the month fetch would put a third request
behind every press of the stepper.

The picker is a native `<select>`. On iOS that renders the system wheel picker,
which is both the HIG-correct control and free keyboard/VoiceOver support; the
only custom part is the chevron, because Tailwind's reset strips the platform
one. Its last option is a `+ New category…` sentinel that swaps the select for
an inline text field — Escape or an empty save cancels, and Enter is
intercepted so it saves the category rather than submitting the transaction
form it sits inside.

**The selected category is derived during render, not stored by an effect:** an
explicit pick wins, otherwise the most recent categorised transaction in the
fetched list, otherwise the first category alphabetically. That is why adding a
transaction does *not* reset the picker — consecutive entries are usually the
same kind of spending, and re-picking every time is the friction that stops
people logging at all.

`createCategory` is find-or-create on the server, so a name that already exists
in any case comes back as itself. The client can always treat the response as
"the category to select" and never has to handle a duplicate error.

A transaction whose `category` is `null` renders as "Uncategorised". That means
its category was deleted, never that the user skipped the field — the API
requires one on create. Such a row can be re-categorised by tapping it; see
below.

## Editing a row: the pinned order

Tapping a transaction expands it in place — there is no per-row edit icon, and
no detail route, because the app has no router. The row is a real `<button>`
with `aria-expanded`/`aria-controls`, so keyboard activation comes for free;
`EditPanel` renders only while open, which is what makes Cancel and closing
discard the drafts with no reset logic.

**The render order is state, not derived.** `order: number[]` holds the ids and
is recomputed *only* on a fetch and on a sort press — never during render:

```
saving an edit  → setTransactions only  → the row stays exactly where it was
```

If `sorted` were still computed from `transactions` on every render, editing a
date under the date sort would re-sort the list and throw the row out from under
the finger. `refresh()` reads the active sort through `sortRef`, which
`onSortPress` keeps in step, so `sort` never becomes a dependency of the fetch —
pressing a sort chip still must not refetch.

**Nothing refetches after a write.** A save PATCHes and patches local state; a
delete DELETEs and splices. Two consequences, both accepted rather than
overlooked:

- Editing a date across a month boundary leaves the row in the month it was
  fetched for, showing its new date, while the header total still counts its
  money. September's total can therefore include a row dated August until a
  reload or a month step refetches. Rare, self-correcting, and the alternative
  is a row that vanishes mid-edit.
- Editing an amount *does* move the total, since the total is `sumMoney` over
  `transactions`.

**State updates only after the server confirms.** With no refetch to correct it,
an optimistic update that failed would leave a wrong value on screen looking
saved. On error the panel stays open with the edits intact.

Delete is a two-step inline confirm rather than `window.confirm` — a native
modal blocks the page, and it is not the iOS idiom.

## Budgets

The section under the month total does two jobs at once: it is the per-category
breakdown of the month, and it is where limits are set.

**Spending per category is computed in the client**, by `spendByCategory` over
the month's transactions, which are already in memory — aggregating one bounded
month on the server would be a round trip for nothing. **Move it to
`GET /api/transactions/summary` the day a month's rows get paginated**, which is
the same day `sortTransactions` has to move server-side and for the same reason.
Nothing else in the code will hint at that.

The `null` key in that map is load-bearing. Spending whose category was deleted
sits outside every budget line, and it renders as an "Uncategorised" row with no
limit. Drop it and the rows visibly fail to add up to the month total.

`GET /api/budgets?month=` **does** ride along in `refresh()`, unlike categories:
the limit in force genuinely differs month to month, and in the `Promise.all` it
costs no extra latency.

### What the editor must keep true

One icon in the section header toggles the whole section into edit mode — every
category at once, rather than an edit control per row, because setting limits is
an occasional act that wants one screen. Every category gets a field including
ones with no limit, since this is the only place a budget can be added.

Three rules, all of them protecting the inheritance chain:

- **An inherited limit is seeded into its field as a real value**, not a
  placeholder. It *is* the number in force and should read as one.
- **An untouched field is not written.** Re-saving an inherited amount would pin
  it to the viewed month and silently break the chain it was inheriting through
  — the row would stop tracking later edits to its source. This is the rule
  most likely to be lost in a refactor, so it is asserted by comparing cents,
  not strings.
- **Clearing a field only deletes a row set for *this* month.** Blanking an
  inherited value has nothing local to delete; the limit lives in an earlier
  month, and a blank field is not a request to erase history.

Saving refetches budgets only — not `refresh()`, which would reshuffle the
pinned row order and collapse an open editor for a write that cannot touch a
transaction. The editor is keyed on `month`, so stepping months while it is open
re-seeds the drafts instead of carrying the old month's numbers into a new one.

The bar is `aria-hidden`: it is a redraw of the two numbers directly above it,
so announcing it again is noise. It clamps at 100% when over budget — the "$620
over" line already says how far.

## App.tsx is a smoke screen, not the product

`src/App.tsx` exists to prove the frontend → backend → database path works end to
end — sign in, list a month of your own transactions, add one, edit or delete
one, set a category budget, sign out. The `Dashboard`
half is placeholder UI and is meant to be replaced; the session machinery around
it is not. Its styling, however, **is** the design language above —
`App.tsx` and `SignIn.tsx` are the reference for how the tokens, the grouped
list and the 44px controls are meant to be used, so extend that rather than
starting a new visual idiom. The seeded demo user cannot be logged into, because
its `googleId` is a made-up string rather than a real Google `sub`.

## Toolchain notes

- The linter is **oxlint**, not ESLint (`.oxlintrc.json`). It lints only; there
  is no formatter, so match surrounding style by hand — single quotes, no
  semicolons, 2-space indent.
- `npm run lint` exits 0 but has **one known standing warning**:
  `react(set-state-in-effect)` on `Dashboard`'s mount-time fetch in `App.tsx`. It is
  expected — you did not introduce it. Any *other* diagnostic is yours to fix.
- `tsconfig.json` is a solution file with project references to
  `tsconfig.app.json` (browser code) and `tsconfig.node.json` (Vite config).
  Compiler options go in the referenced file, not the root one. `npm run build`
  runs `tsc -b`, so a type error fails the build.
- TypeScript is on the `~6.0.x` line and React on 19 — check the version before
  trusting older API guidance.
