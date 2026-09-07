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

**Theme switching is explicit, not OS-following.** There is no
`prefers-color-scheme` media query anywhere in this scheme — the app always
renders a theme it chose, defaulting to **light**, and only the user's own
pick in `AccountMenu` (see § Account menu below) ever changes it. This was a
deliberate reversal of an earlier design that tried to follow the OS by
default: that version had a bug where an explicit choice didn't survive a
reload, and the fix was to stop trying to track two sources of truth (OS state
+ stored override) and make the app's own default the only fallback. Define
the light values on plain `:root` — they **are** the default now, not a
"bright theme" alternative to some OS-driven baseline — and override them
under `:root[data-theme='dark']`. Because the tokens carry the theme,
components mostly need **no** `dark:` variants at all — reach for one only
when the *shape* differs, not the colour.

**The toggle lives in `AccountMenu`**, and it is the only thing that ever sets
`data-theme`. `src/theme.ts` owns the contract: `ThemePreference` is just
`"light" | "dark"`, `getStoredThemePreference()` reads `localStorage`'s
`piggy-theme` key and falls back to `"light"` for anything missing or invalid,
and `applyThemePreference()` always sets both `data-theme` and the storage key
— there is no "clear the override" branch, because there is no OS state to
fall back to. An inline `<script>` in `index.html`, placed before anything
else in `<head>`, mirrors that same default-to-light logic and applies it
synchronously before first paint — without it, a reload would flash light for
one frame before React mounts and re-applies a stored dark choice. Keep that
script and `theme.ts`'s contract in agreement if it ever changes.

Two supporting pieces that are easy to forget when changing colours:
`index.html` carries a static `<meta name="color-scheme" content="light dark">`
(so native controls don't assume light before CSS loads; the CSS `color-scheme`
property, which *is* theme-aware, wins once it does) and a single
`id="theme-color-meta"` `theme-color` tag that `theme.ts` updates alongside
`data-theme` — not a `prefers-color-scheme` media pair, since the mobile
browser chrome now follows the same explicit choice as the page, not the OS.
The manifest's own `theme_color` in `vite.config.ts` still just holds the
light base `#FFFFFF`, since that's the app's default.

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

`request()` always parses a JSON body, so a **204 route cannot go through it** —
`deleteTransaction` and `deleteBudget` are hand-written `fetch` calls that
duplicate its error handling and return `void`. A new endpoint answering 204
needs the same treatment; routing it through `request()` throws on the empty
body *after* the write has already happened, which reads as a failed delete that
actually succeeded.

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

Tapping a transaction expands it in place — there is no per-row edit icon
beyond the chevron affordance, and no detail route, because the app has no
router. The row is a real `<button>` with `aria-expanded`/`aria-controls`, so
keyboard activation comes for free; `EditPanel` renders only while open,
which is what makes Cancel and closing discard the drafts with no reset
logic. This row (`components/TransactionRow.tsx`) is shared verbatim by List
view and a budget drill-down (see Budgets below) — the two must never drift
apart, so a change to one is a change to both by construction.

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

## Budgets vs List — the view toggle

The section under the month total is one `<section>` with two views, switched
by `ViewToggle` (`components/ViewToggle.tsx`) — **Budgets is the default**;
List is the old always-visible transaction list, now opt-in. The toggle is
not persisted like theme: `useDashboard`'s `changeMonth` resets it to Budgets
on every month change, done from the stepper's own handler rather than a
`useEffect` keyed on `month` — the latter is a real `setState`-in-effect
lint trip, not just a style preference, since the reset is a response to the
event that changed the month, not a synchronization with an external system.

**Tapping a budget row drills into that category's transactions inline** —
same disclosure idiom as everything else here, no modal, no route. Only rows
with `spent > 0` are interactive (a limit with nothing spent this month has
nothing to drill into, so it stays a plain, non-tappable line); "Uncategorised"
drills in the same way, keyed by the sentinel `'uncategorised'` since it has
no real category id. Only one row's drill-down is open at a time
(`expandedCategoryId`), and three things collapse it: switching to List view,
opening a different row's drill-down, and opening the whole-section budget
editor (`onToggleBudgetEditor`) — the last because rows become input fields
while editing, so a drill-down open at the same time makes no sense. A
drill-down's own transaction list is always date-desc, no sort chips — it's
already a small, filtered subset, and List view is one tap away for anyone
who wants the full sortable list.

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

**Saving a changed limit that has a previous value asks forward-vs-once**, in
a `Sheet`-chrome action sheet styled like Calendar's own "This event / All
future events" prompt: "This month onward" is today's default insert
behavior; "Only {month}" writes a second row at next month carrying the
pre-edit value, so a one-off bump doesn't silently become the new baseline.
The choice is asked **once per Save press, for the whole batch** — not per
category — since `BudgetEditor` already saves every changed row in one action;
per-category confirmation would mean rebuilding it as row-by-row editing. The
sheet is skipped entirely when every changed field is a category's first-ever
budget (nothing to choose between — see `docs/budgets.md`'s "Only this
month" section for what "once" can't do in that case, and why).

Saving refetches budgets only — not `refresh()`, which would reshuffle the
pinned row order and collapse an open editor for a write that cannot touch a
transaction. The editor is keyed on `month`, so stepping months while it is open
re-seeds the drafts instead of carrying the old month's numbers into a new one.

**A first-run user sees a different empty state.** `hasAnyBudgets` (from
`useDashboard`, backed by `GET /api/budgets/exists`) is independent of which
month is in view — unlike `budgetRows.length === 0`, which is a normal state
for *any* month with nothing set. Only when `!hasAnyBudgets` does the section's
empty state swap its plain "No budgets set for {month}" line for a nudge plus
a button straight into the editor. This is a soft nudge, not a gate: the
dashboard renders as usual either way, and nothing blocks using the app
without ever setting a budget.

The bar is `aria-hidden`: it is a redraw of the two numbers directly above it,
so announcing it again is noise. It clamps at 100% when over budget — the "$620
over" line already says how far.

## Account menu

The header's top-right corner is a single 44×44 initials avatar
(`AccountMenu`), replacing what used to be a bare name-text-plus-"Sign out"
button. It opens a popover that does three jobs: identity, appearance, and
sign-out.

**"Account setting" is a read-only header inside the popover, not a screen.**
There is no router in this app — same reason the transaction edit panel is an
in-place disclosure rather than a detail route — so the menu's top rows just
show the signed-in name and email from data already in `Session`. Nothing
navigates.

**Appearance is a two-item `role="menuitemradio"` group** (Light / Dark, no
"System" — see § Two themes above for why), backed by `src/theme.ts`. Picking
an option calls `applyThemePreference` and does **not** close the menu, matching
how iOS keeps an inline radio group open
after a tap; only Sign out or a dismissal closes it.

**Dismissal is outside-click plus Escape**, both wired as `document` listeners
that exist only while `open` is true — the same "no listener while closed"
shape used everywhere else conditional effects appear in this file. Escape
returns focus to the trigger button rather than dropping it. The panel itself
renders only while open, so — like `EditPanel` and `BudgetEditor` — there is no
reset logic to write; closing it discards nothing because there's no draft
state to discard. That open/dismiss shape is `usePopoverMenu`, a small hook
factored out once `AddTransactionMenu` (below) needed the identical behaviour
— write a third popover against the hook, not by copying a component's
`useEffect`.

## App title and adding a transaction

The header's top row is `Piggy Tracking` on the left at `text-headline`
(17pt semibold — Apple's own compact nav-bar title size) paired with
`AccountMenu` on the right. It sits a full weight class below the Large Title
used for the month name just underneath, on purpose: the brand mark is a
quiet anchor, not competition for "the user's numbers are the loudest thing
on screen."

**`AddTransactionMenu` sits immediately beside the month total**, not inside
the transaction list further down — it's the one action the dashboard exists
to support, so it doesn't wait behind a scroll. It's a `usePopoverMenu`
popover, same shape as `AccountMenu`, listing all three ways a transaction can
get into the app even though only one is built:

- **Add manually** — opens the entry form (see below).
- **Scan a receipt** / **Upload a receipt** — real `role="menuitem"` rows with
  a "Soon" tag, not hidden and not real `<button disabled>` elements. A
  disabled control is skipped by VoiceOver's rotor as if it weren't there,
  which would silently drop the "Soon" label along with it; `aria-disabled`
  keeps the row announced without making it actionable. Naming the other two
  methods up front, rather than shipping a plain "+" that would have to grow
  a menu later, is deliberate — it's the honest shape of the feature.

**The entry form (`AddTransactionSheet`) rises in a bottom sheet
(`components/Sheet.tsx`), not an inline disclosure.** This is the one
exception to "disclosure, not a modal": `EditPanel` and `BudgetEditor` edit
something already on screen, so a disclosure opening right under the tapped
row is the correct place for it to appear. Adding a transaction isn't tied to
any row — it's a global action launched from the header — so on a month with
enough budget rows to push the trigger off screen, an inline disclosure
appended after the whole section would open somewhere the user isn't looking.
`Sheet` is the app's one true overlay primitive, kept generic (scrim + a
slide-up panel, no form-specific logic) so a later Scan/Upload flow can reuse
it without copying the chrome. It renders only while `open` is true (set by
choosing "Add manually"), and returns `null` while closed rather than
hiding-in-place — that makes every open a fresh mount, which is what makes
the slide-in transition replay each time rather than only once. No focus
trap: same "closes on outside click/Escape, doesn't fight the browser's own
tab order" shape the popover menus already use. The form inside is otherwise
unchanged: same fields, same close (×) button, same
`merchantInputRef` + `requestAnimationFrame` autofocus, and submitting still
does **not** close it — the existing "don't reset the category" behaviour
(see § Categories above) means consecutive entries stay fast, and closing on
every save would undo that.

**`AddTransactionMenu`'s trigger is solid (`bg-accent`), not tinted.** Every
other icon-only action on the dashboard (`SlidersIcon` for the budget editor,
inactive `SortChip`s) uses the `bg-accent/12` tint reserved for secondary
actions; the "+" is the one primary action the screen exists to support, so
it keeps the filled-pill treatment `EditPanel`'s Save button and the form's
own Add button already use, rather than sharing a visual weight with
secondary controls.

## File structure

`src/App.tsx` is just the session state machine now (`restoring` →
`anonymous` | `authenticated`) — everything Dashboard-shaped lives elsewhere:

```
src/
  App.tsx, SignIn.tsx          # session machine, sign-in screen
  api.ts, format.ts, month.ts, theme.ts, google.ts, sort.ts, budgetCalc.ts, ui.ts
  hooks/
    usePopoverMenu.ts          # open + outside-click/Escape dismissal, shared
    useDashboard.ts            # all of Dashboard's state, effects, and derived
                                # data — the requestId/sortRef guards live here
  components/
    Dashboard.tsx               # rendering only; calls useDashboard()
    AccountMenu.tsx, AddTransactionMenu.tsx, AddTransactionSheet.tsx,
    BudgetEditor.tsx, BudgetRow.tsx, CategorySelect.tsx, EditPanel.tsx,
    ErrorNotice.tsx, Sheet.tsx, SortChip.tsx, StepButton.tsx,
    TransactionRow.tsx, ViewToggle.tsx, icons.tsx
```

This split happened after the code had grown to one 1,390-line `App.tsx`
holding everything — the doc-comment history in git explains individual
pieces if a comment ever seems to be answering a question the surrounding
code doesn't ask. Keep new Dashboard-area UI in `components/`, cross-cutting
non-JSX logic in a root-level module (as `sort.ts`/`budgetCalc.ts` are), and
new Dashboard state/effects in `useDashboard.ts` rather than back in a
component body.

## App.tsx is a smoke screen, not the product

`src/App.tsx` plus `components/Dashboard.tsx` exist to prove the frontend →
backend → database path works end to end — sign in, list a month of your own
transactions, add one, edit or delete one, set a category budget, switch
appearance, sign out. `Dashboard.tsx` is placeholder UI and is meant to be
replaced; the session machinery in `App.tsx` around it is not. Its styling,
however, **is** the design language above — `Dashboard.tsx` and `SignIn.tsx`
are the reference for how the tokens, the grouped list and the 44px controls
are meant to be used, so extend that rather than starting a new visual idiom.
The seeded demo user cannot be logged into, because its `googleId` is a
made-up string rather than a real Google `sub`.

## Toolchain notes

- The linter is **oxlint**, not ESLint (`.oxlintrc.json`). It lints only; there
  is no formatter, so match surrounding style by hand — single quotes, no
  semicolons, 2-space indent.
- `npm run lint` exits 0 but has **one known standing warning**:
  `react(set-state-in-effect)` on the mount-time fetch in `hooks/useDashboard.ts`.
  It is expected — you did not introduce it. Any *other* diagnostic is yours to fix.
- `tsconfig.json` is a solution file with project references to
  `tsconfig.app.json` (browser code) and `tsconfig.node.json` (Vite config).
  Compiler options go in the referenced file, not the root one. `npm run build`
  runs `tsc -b`, so a type error fails the build.
- TypeScript is on the `~6.0.x` line and React on 19 — check the version before
  trusting older API guidance.
