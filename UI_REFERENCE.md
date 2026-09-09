# UI Reference

A single source of truth for this app's visual design, derived from the actual codebase
(`src/styles.css`, `src/components/`, `tailwind.config.js`, card/type config). Reference this
file in future prompts to keep the UI consistent.

> Stack: React + Vite, plain CSS (`src/styles.css`) with CSS variables, Tailwind (preflight **off**,
> utilities only) + a small shadcn-style `Button`, Framer Motion for animation, Recharts for charts.
> All UI text is Japanese.

---

## 1. Design Tokens

All chrome colors live as CSS variables. The app supports **light** and **dark** themes plus **auto** (follows the OS). Preference is stored in `localStorage` under `budget_theme`, and applied to `<html data-theme="light|dark">` (`style.colorScheme` is also set so native controls follow suit). See `src/lib/theme.jsx` + the inline FOUC script in `index.html`.

Always reach for `var(--…)` — never re-introduce raw chrome hex in JSX or new CSS rules; the only hardcoded hex that stay are the intentional status accents (income sky, positive/negative, card seeds — see §3).

### Colors (CSS variables)
| Variable | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#f7f7f5` | `#191919` | App background |
| `--surface` | `#ffffff` | `#2c2c2a` | Inputs, modal, list rows, active tab pill |
| `--block` | `#eeeeeb` | `#262625` | Cards / hero / chart cards / stat cards |
| `--hover` | `#e4e4df` | `#3a3a37` | Row hover background |
| `--border` | `#deded8` | `#3d3d3a` | All hairline borders |
| `--text` | `#37352f` | `#e8e7e3` | Primary text |
| `--muted` | `#787774` | `#9b9a97` | Secondary / caption / label text |
| `--primary` | `#166534` | `#22c55e` | Primary actions, active tab, focus ring, links/ok |
| `--primary-dark` | `#0f4d28` | `#16a34a` | Primary hover |
| `--on-primary` | `#ffffff` | `#0d1712` | Foreground on `--primary` |
| `--danger` / `--danger-hover` | `#dc2626` / `#b91c1c` | `#f87171` / `#ef4444` | Destructive |
| `--warning` | `#b45309` | `#f59e0b` | Warning text |
| `--income` | `#0ea5e9` | `#38bdf8` | Income accent (reference; charts still fill `#0ea5e9` directly) |
| `--frosted` / `--frosted-fade` | `rgba(247,247,245,0.82)` / same @ 0 | `rgba(25,25,25,0.82)` / same @ 0 | Header fill + its bottom fade-out gradient |
| `--overlay` | `rgba(15,15,15,0.4)` | `rgba(0,0,0,0.55)` | Modal overlay scrim (now also blurred, see Shadows) |
| `--glass-bg` | `rgba(255,255,255,0.6)` | `rgba(44,44,42,0.55)` | Liquid-glass panel fill: floating tab bar, modal/sheet |
| `--glass-border` | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.09)` | Glass panel edge (all sides) |
| `--glass-edge` | `rgba(255,255,255,0.9)` | `rgba(255,255,255,0.14)` | Glass "specular" highlight — 1px inset top/bottom |
| `--glass-shadow` | `rgba(15,15,15,0.14)` | `rgba(0,0,0,0.5)` | Soft shadow under floating glass panels |
| `--glass-chip-bg` | `rgba(255,255,255,0.55)` | `rgba(255,255,255,0.08)` | Glass-on-glass chip: the active tab pill inside the tab bar |
| `--glass-header-bg` | `rgba(255,255,255,0.38)` | `rgba(20,20,19,0.4)` | Modal's own sticky header — deliberately low-alpha; see §2 `Modal` for why |
| `--pending-bg` | `#fbfaf7` | `#242422` | Pending (未確定) row background |
| `--badge-warn-bg` / `--badge-warn-border` / `--badge-warn-text` | `#fef3c7` / `#fde68a` / `#b45309` | `#3f2d10` / `#6b4a1a` / `#fbbf24` | 未確定 pill |
| `--chart-grid` | `#e4e4df` | `#3d3d3a` | Recharts `CartesianGrid` stroke |
| `--chart-axis` | `#787774` | `#9b9a97` | Recharts axis stroke + tick fill |
| `--chip-fill-mix` | `white` | `#2c2c2a` | Base for `color-mix` chip/badge tints |

### Typography
- **Font family:** `ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', 'Segoe UI', sans-serif`
- **Base:** body `line-height: 1.5`, antialiased.
- **Font sizes (px):** `36` (hero amount), `26` (app title `h1`), `22` (page title / login title / stat value), `17` (modal header), `15` (form inputs/selects), `14` (body, buttons, section title, list rows), `13` (captions, quick-action buttons, field labels, `.small`), `12` (stat label, notes, group tag, ai label), `11` (tab label, entry-kind), `10` (未確定 badge).
- **Font weights:** `700` (titles, hero, stat value, amounts, badge, confirm btn), `600` (section title, active tab, modal header, chip, entry-label), `500` (`.btn`), `normal/400` (master list names, body).
- **Letter spacing:** `-0.01em` on titles (`h1`, `.page-title`, `.login-title`).

### Spacing scale (px, values actually in use)
`2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32` — gaps/padding/margins draw from this set.
Common: page section `gap: 6`; stat grid `gap: 8`; form `gap: 12`; card padding `16`; modal padding `0 20 24`; app-main padding `8 20` (bottom `112px + safe-area` to clear the floating tab bar — see Layout Rules).

### Border radius
- `--radius: 8px` — cards, blocks, stat cards, chart cards, lists, notices, login card.
- `6px` — buttons, inputs/selects, icon buttons, confirm button.
- `20px` — modal/sheet (top corners on mobile; all corners ≥600px); tab-bar items and its active pill.
- `28px` — the floating tab-bar container itself.
- `999px` — chips, 未確定 badge (pills).
- `4px` — color swatch (`.master-swatch`); `50%` — dots.

### Shadows & Liquid Glass
- **Content stays flat.** Cards, stat blocks, list rows, forms, chips, and buttons carry no shadow (`--shadow: none`) — depth there still comes only from `--border` hairlines and `--block` vs `--surface` contrast, same as before. Do not add box-shadows to these.
- **Chrome is liquid glass.** The app header, the bottom tab bar, modals/sheets, and chart tooltips are the four surfaces that get real glass treatment — translucent `--glass-bg` fill, `backdrop-filter: blur(...)` so scrolled/underlying content is visible-but-blurred, a 1px `--glass-border` on all sides, a `--glass-edge` inset highlight simulating light catching the glass rim, and (for the floating tab bar, the modal sheet, and the chart tooltip, since those three visually float above content) a soft `--glass-shadow`. See §2 `Modal` and §4 Tab navigation / Charts for the concrete values.
- This is a deliberate two-tier system: **glass chrome, flat content.** Don't extend glass to stat cards, entry rows, or form fields — blur-behind-content only reads as "glass" over something with color/motion behind it (the header and tab bar sit over scrolling colorful content; a stat card sitting over the static `--bg` would just look hazy).

### Theme control
- Settings has an **外観** card (directly above アカウント / ログアウト) with a segmented control: `ライト` / `ダーク` / `自動`.
- `自動` follows `matchMedia('(prefers-color-scheme: dark)')` live — no reload required.
- Reusable pattern: `.segmented` in `styles.css` — flat container, `--surface` background, per-button `--border` dividers, active state uses `--primary` + `--on-primary`.

---

## 2. Component Inventory (`src/components/`)

### `Modal` (`Modal.jsx`)
- **Props:** `open` (bool), `title` (string), `onClose` (fn), `children`.
- **Looks:** liquid-glass bottom sheet on mobile (slides up, rounded top `20px`), centered glass dialog ≥600px (all corners `20px`). Panel is `--glass-bg` (α`0.6`/`0.55`) + `backdrop-filter: blur(28px)`, 1px `--glass-border`, inset `--glass-edge` highlight, soft `--glass-shadow`. Overlay is `--overlay` scrim **+ `backdrop-filter: blur(3px)`** on the page behind it. Framer Motion fade + spring. Sticky header sits *on top of* the panel's own translucent fill, so it needs a **low-alpha** background of its own (`--glass-header-bg`, α`0.38`/`0.4`) plus its own `backdrop-filter: blur(20px)` — alpha layers compound multiplicatively (`1-(1-a₂)(1-a₁)`), so a header at the panel's own α`0.6` (or the header/tab-bar's α`0.82` `--frosted`) compounds to ~0.84–0.93 and reads as an opaque flat patch, no visible color through it — a bug hit twice while building this. Content *inside* the sheet (inputs, buttons, chips) stays flat `--surface` — only the sheet's own "glass" is translucent.
- **Use:** entry forms, confirm dialogs, receipt lightbox.
```jsx
<Modal open={open} title="カード支出入力" onClose={() => setOpen(false)}>
  <CardExpenseForm onSaved={handleSaved} />
</Modal>
```

### `Button` (`ui/button.jsx`)
- **Props:** `variant` (`default` | `outline` | `danger` | `ghost`), `size` (`default` | `sm` | `lg` | `icon`), `className`, plus all native button props. Tailwind/cva-based; `whileTap` scale 0.96.
- **Use:** shadcn-style button — currently used in Login, the delete-confirm dialog, and onboarding. (Note: most app buttons still use the plain `.btn` CSS class — see §4.)
```jsx
<Button variant="danger" className="flex-1" onClick={onDelete}>削除する</Button>
```

### `StatCard` (`Ui.jsx`)
- **Props:** `label` (string), `value` (string), `color` (hex), `accent` (bool → colored bottom border), `layout` (`'row'` for inline label/value).
- **Looks:** gray block, 3px bottom accent border in `color`, label `12px muted`, value `22px bold` (tinted by `color`).
```jsx
<StatCard label="入金合計" value={formatYen(total)} color="#0ea5e9" accent />
<StatCard label="今月の入金合計" value={formatYen(total)} color="#0ea5e9" accent layout="row" />
```

### `EntryList` (`Ui.jsx`)
- **Props:** `income[]`, `cards[]`, `others[]`, `onRefresh` (fn — enables delete/confirm/receipt actions).
- **Looks:** bordered list; each row = colored dot + kind/label + amount + (未確定 badge, 確定 btn, receipt icon, delete icon). Pending rows dimmed. Uses `useMeta()` for card/type names+colors. Framer Motion stagger + exit.
```jsx
<EntryList income={data.income} cards={data.cards} others={data.others} onRefresh={load} />
```

### `Loading` / `ErrorMsg` (`Ui.jsx`)
- `Loading` props: `text` (default `'読み込み中...'`). `ErrorMsg` props: `error`. Centered muted (error in red).

### `MonthHeading` (`Ui.jsx`)
- **Props:** `year`, `month`. Renders `YYYY年M月`.

### `MasterManager` (`MasterManager.jsx`)
- **Props:** `title`, `addLabel`, `items[]` (active rows), `api` (`{ add, update, deactivate, setOrder }`), `refresh` (fn), `deleteWarning` (string), `groupOptions` (optional `[{value,label}]` → shows a "LINEレポートカテゴリ" select with a "＋ 新しいグループを作成…" custom option).
- **Looks:** bordered list (matches notify toggles) of swatch + name (+ group tag) + ▲▼ reorder / ✎ edit / 🗑 delete; add button; modal form (name + color picker + optional group).
```jsx
<MasterManager title="カード管理" addLabel="＋ カードを追加" items={meta.activeCards}
  api={{ add: addCard, update: updateCard, deactivate: deactivateCard, setOrder: setCardOrder }}
  refresh={meta.refresh} deleteWarning="…" groupOptions={reportGroupOptions} />
```

### Entry forms (`EntryForms.jsx`)
- **Exports:** `IncomeForm`, `CardExpenseForm`, `OtherExpenseForm`, `BalanceForm` — each takes `onSaved` (fn).
- `CardExpenseForm` adds: receipt image upload (JPEG/PNG ≤10MB), preview, "AIで読み取る" (Gemini auto-fill), card **chip** selector.
- `OtherExpenseForm`: dynamic type `<select>`. Both read options from `useMeta()`.
- Internal field helpers: `MonthField` (対象月, `input[type=month]`), `AmountField` (comma-formatted numeric text), `NoteField`.

---

## 3. Color System

### Card colors (seed defaults; stored per-card in `cards.color`, user-editable)
| Card | Hex |
|---|---|
| STARTS（家賃・ガス・水道・電気） | `#2563eb` (blue) |
| Olive（生活費） | `#16a34a` (green) |
| Rakuten Pink（変動費） | `#db2777` (pink) |
| New-card form default | `#3b82f6` |
| その他支出タイプ (all seeds) | `#6b7280` (gray) |

Card/type colors are **data**, not hardcoded — read from `cards` / `other_expense_types` via `useMeta()`
(`cardColor(id)`, `typeColor(id)`). `OTHER_COLOR = #6b7280` (`src/lib/helpers.js`) is the only hardcoded
expense color, used for the aggregated "その他支出" stat.

### Status colors
| Meaning | Hex |
|---|---|
| Positive balance / income accent / success | income `#0ea5e9`; positive net `#16a34a`; ok text uses `--primary` `#166534` |
| Negative balance | `#dc2626` |
| Destructive (delete) | `#dc2626`, hover `#b91c1c`; soft hover bg `rgba(220,38,38,0.1)` |
| Warning text | `#b45309` |
| Pending (未確定) badge | text `#b45309`, bg `#fef3c7`, border `#fde68a`; pending row bg `#fbfaf7` |

> Note: income/positive uses **sky blue `#0ea5e9`** as an accent, while the green `#16a34a` is used for
> positive *net* figures (and is also the Olive card color). `--primary` `#166534` is a *darker* green for chrome.

### Background / surface / border
- Background `#f7f7f5`, surface `#ffffff`, gray block `#eeeeeb`, hover `#e4e4df`, border `#deded8`.

### Text
- Primary `#37352f`, muted/secondary `#787774`, on-primary/on-danger `#ffffff`.

---

## 4. UI Patterns

### Modal / dialog (liquid glass)
- Overlay `--overlay` + `backdrop-filter: blur(3px)`, `z-index:100`. Panel `--glass-bg` + `backdrop-filter: blur(28px)`, `1px --glass-border`, inset `--glass-edge` highlight, `--glass-shadow`, `max-width:480px`, `max-height:90vh`, scrollable.
- Mobile: anchored bottom, `border-radius:20px 20px 0 0`, no bottom border (flush with the overlay edge). ≥600px: centered, all corners `20px`, border on all sides.
- Header: sticky, its **own** glass layer using the dedicated `--glass-header-bg` token (not `--glass-bg` or `--frosted`) + its own `backdrop-filter: blur(20px)`, extended edge-to-edge past the panel's own `20px` side padding via negative margin, with a `1px --glass-border` bottom hairline. Title `17px/600` + `.icon-btn` `×`. `--glass-header-bg` is deliberately **low-alpha** (`0.38`/`0.4`) because it composites *on top of* the panel's own `--glass-bg` (α`0.6`/`0.55`) — the two alphas multiply, not add, so anything at the panel's own alpha or higher ends up ~0.84–0.93 combined and reads as flat/opaque with no color through it (a real bug, hit twice). When tuning this value, work out `1-(1-header_α)(1-panel_α)` before changing it — target the combined result a bit denser than the panel (currently ≈0.75/0.73), not equal to or denser than `--frosted`.
- Everything *inside* the sheet — fields, buttons, chips — stays flat `--surface`/`--block`; only the sheet chrome itself is glass.
- Confirm dialogs use `.confirm-body` + `.confirm-actions` (two `flex:1` buttons: outline cancel + danger confirm).

### Form fields
- Wrap each in `.field` (label `span` `13px muted` + control), forms use `.entry-form` (`gap:12`).
- `--muted` itself is redefined inside `.modal` (`--muted: color-mix(in srgb, var(--text) 82%, transparent)`) rather than the app-wide value, which stays tuned for opaque `--surface`/`--block` backgrounds. Every element that reads `var(--muted)` — field labels, `.txn-table th`, the muted date column, `.entry-detail dt`, hint notes, even the modal's own `.icon-btn` × close — automatically gets the darker, glass-legible value just by being inside `.modal`, with no per-selector patching needed. When adding a new muted-text element inside a modal, you don't need to do anything special for it to be legible; this is the mechanism that makes that true.
- Inputs/selects: `15px`, padding `9px 10px`, `1px var(--border)`, radius `6px`, white bg, `width:100%`. Focus → `border-color: var(--primary)`, no outline.
- States: `.form-error` (`#dc2626`), `.form-ok` (`--primary`), `.form-warning` (`#b45309`), `.ai-fill-label` (`--primary`, 12/600).
- Color picker: native `input[type=color]` via `.color-input` (56×36).

### Buttons
- **Primary** `.btn.primary`: bg `--primary`, white text, hover `--primary-dark`.
- **Secondary/default** `.btn`: white bg, `--border`, `--text`, hover `--block`. Weight 500, `14px`, radius 6.
- **Destructive** `.btn.danger`: `#dc2626`, hover `#b91c1c`.
- **Icon** `.icon-btn` (22px glyph) / `.icon-btn.sm` (14px). **Disabled:** opacity ~0.45.
- shadcn `Button` mirrors these via `variant` (default/outline/danger/ghost) for newer surfaces.

### Tab navigation (bottom, liquid glass)
- **Floating**, not edge-to-edge: fixed `bottom: 14px + safe-area`, inset `14px` from both sides, `max-width:692px` (centered within the 720px app), `border-radius:28px`. Glass panel: `--glass-bg` + `backdrop-filter: blur(24px) saturate(180%)`, `1px --glass-border` on all sides, inset `--glass-edge` top highlight, soft `--glass-shadow` drop shadow (it's floating above content, unlike the header). 5 tabs (今月/月次/年次/トレンド/設定), line-art SVG icons (22px) + `11px` label.
- Active tab: `--primary` text + a sliding **glass-on-glass** pill (`.tab-active-pill` — `--glass-chip-bg` + `--glass-border` + inset `--glass-edge`, `border-radius:20px`, Framer Motion `layoutId`). Inactive hover → a faint `color-mix(in srgb, var(--text) 6%, transparent)` tint (not `--block`, which would read as an opaque surface breaking the glass).
- `app-main` bottom padding is `112px + safe-area` (not the tab bar's own height) to clear the floating bar with room for its shadow.
- `index.html`'s viewport meta includes `viewport-fit=cover` so `env(safe-area-inset-bottom)` resolves on notched/home-indicator devices.

### Charts (Recharts)
- Income series/bar: `#0ea5e9`. Spending per-card: each card's stored `color`. "その他" segment: `#6b7280`.
- Conventions: `CartesianGrid strokeDasharray="3 3" vertical={false}`; axis font `11–12`; Y tick formatted `¥N万`; tooltip via `formatYen`; bar `radius={[4,4,0,0]}`; stacked spending via shared `stackId`; one line per card in Trends using card color.
- Charts sit in `.chart-card` (gray block) — the chart surface itself stays flat, per §1.
- **Tooltip is liquid glass** — the 4th chrome surface alongside header/tab bar/modal. All three `<Tooltip>` instances (`Trends.jsx` ×2, `YearlySummary.jsx` ×1) spread the shared `glassTooltipProps` object from `src/lib/helpers.js` (`contentStyle`/`labelStyle`/`itemStyle`) instead of each hand-rolling `contentStyle`: `--glass-bg` + `backdrop-filter: blur(20px) saturate(180%)`, `1px --glass-border`, `12px` radius, inset `--glass-edge` + `--glass-shadow`. It's a single glass layer with no other glass beneath it (unlike the modal header), so it safely uses the panel's own `--glass-bg` alpha directly — no compounding-alpha math needed here. Of every glass surface in the app this one shows the effect off best, since it always sits directly over saturated bar/line colors. When adding a new chart, reuse `glassTooltipProps` rather than restyling `contentStyle` by hand.

---

## 5. Layout Rules
- **App container:** `max-width: 720px`, centered (`.app` capped at 720; `.tab-bar` floats inset within it, capped at `692px`).
- **Main content padding:** `8px 20px`, with `padding-bottom: calc(112px + env(safe-area-inset-bottom))` to clear the floating tab bar.
- **Breakpoint:** single media query at **`min-width: 600px`** (modal becomes centered with full rounding; below it, modal is a bottom sheet). The app is mobile-first; there is no desktop-specific layout beyond this.
- **Tab bar:** fixed to bottom on all viewports (mobile-style bottom nav), floating liquid glass inset `14px` from the screen edges and bottom (see §4), centered on wide screens within the 720px app.
- **Section spacing:** page is a flex column `gap:6`; section titles add `margin: 18px 0 6px`; cards add `margin-bottom:12px`; stat grid is `repeat(auto-fill, minmax(150px, 1fr))` with `gap:8`.

---

## 6. Japanese Typography Conventions
- **All UI copy is Japanese.** English appears only in: brand/card names (STARTS, Olive, Rakuten Pink), the app title (e.g. "Haruka ChiChan Kakeibo"), and currency/number formatting.
- **Currency:** always `¥` + comma-grouped integers via `formatYen()` (e.g. `¥120,000`). Never show decimals.
- **Size hierarchy (largest → smallest):**
  | Role | Size / weight |
  |---|---|
  | Hero amount (今月の残額) | 36 / 700 |
  | App title (`h1`) | 26 / 700 |
  | Page title (`.page-title`) / login | 22 / 700 |
  | Stat value | 22 / 700 |
  | Modal header | 17 / 600 |
  | Form input value | 15 / 400 |
  | Body / list row / button / section title | 14 (section title 600) |
  | Caption / field label / `.small` | 13 |
  | Stat label / note / group tag | 12 |
  | Tab label / entry-kind | 11 |
  | Badge (未確定) | 10 / 700 |

---

## 7. Do's and Don'ts

**Do**
- Use **CSS variables** (`var(--…)`) for all chrome colors so light + dark themes both work; use **`formatYen()`** for every money value.
- When adding native controls, let `<html style="color-scheme">` (set by the theme provider) handle native form widget colors — don't hardcode `background: white` on inputs.
- Use **`#dc2626`** for destructive actions (delete), with `#b91c1c` hover; route deletes through a confirm Modal.
- Use **`--primary` `#166534`** for primary actions, active states, focus, and success text.
- Read card/type **names and colors from `useMeta()`** (data-driven); use a card's stored `color` for its chart series, dot, and stat accent.
- Keep **content flat**: cards, lists, forms, chips, buttons use borders + `--block`/`--surface` contrast for separation, no shadows.
- Reserve **liquid glass** (translucent `--glass-*` fill + `backdrop-filter` blur + edge highlight + shadow) for the four chrome surfaces only: header, floating tab bar, modal/sheet, chart tooltip. Don't extend it to stat cards, entry rows, chart bodies, or form fields.
- Stat values & amounts: **`font-weight:700`**; section titles **`14px / 600`**; muted captions **`#787774`**.
- New full-width buttons in modals/login: `.btn.primary` or `<Button>` with `w-full`/`flex-1`.
- Keep currency-bearing data **out of any HTTP response/log** that isn't the user's own (RLS + reports).

**Don't**
- **Don't add box-shadows to content surfaces** — `--shadow` is `none`; cards/lists/forms/buttons stay flat. Shadows exist only on the three glass chrome surfaces (header, tab bar, modal), via `--glass-shadow` — see §1 Shadows & Liquid Glass.
- **Don't reintroduce raw chrome hex** (e.g. `#fff`, `#111`, `rgba(247,247,245,…)`) — add or extend a CSS variable in `:root` + `[data-theme="dark"]` instead.
- **Don't hardcode card/expense colors** in components — they live in the `cards` / `other_expense_types` tables. The only allowed hardcoded expense color is `OTHER_COLOR` (`#6b7280`) for the aggregated その他.
- **Don't introduce new raw hex** for chrome; add/extend a CSS variable instead. (Status colors `#0ea5e9`/`#16a34a`/`#dc2626`/`#b45309` and the pending-badge palette are the established exceptions.)
- **Don't put English UI copy** in new screens — labels, buttons, messages are Japanese.
- **Don't break the 720px container** or shrink the `padding-bottom` that clears the floating tab bar (`112px + safe-area`, see §5).
- **Don't strip `min-width:0` / ellipsis** from flex text rows (prevents mobile overflow), or `-webkit-appearance:none` from `input[type=month]` (prevents iOS overflow).
