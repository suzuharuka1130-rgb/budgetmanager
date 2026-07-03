# Kakeibo (Household Budget manager)

A personal household budget web app for tracking monthly income, card expenses, and account balance — with LINE notifications and receipt image analysis.

Built for two users to manage shared finances from mobile or desktop.

## Features

### Core budgeting
- **今月 (This Month)** — Quick entry for deposits, card expenses, and other spending; view monthly balance and auto-calculated account balance
- **月次 (Monthly Report)** — Month-by-month breakdown of income, expenses, and net balance
- **年次 (Yearly Summary)** — Annual totals with income vs. spending bar chart
- **トレンド (Trends)** — Balance trend, per-card spending, and variable expense charts

### Expense tracking
- Dynamic **card** and **other expense type** masters (manageable in Settings)
- Card statement screenshot upload with **Gemini Vision** auto-extraction — reads each individual
  transaction (name, amount, date) plus the total, all editable before saving; 金額 auto-sums the
  extracted transactions but can be overridden manually
- Click a card expense row in the 明細 list to view its saved transactions (and the original
  screenshot) in a read-only detail modal
- Future-month entries stay **pending** until confirmed (won't affect balance until confirmed)
- Delete entries from the detail list (hover on desktop, tap on mobile)

### Account balance
- Manual balance **snapshots** as anchor points
- Running balance auto-calculated from latest snapshot + monthly net (deposits − expenses)
- Balance trend reflected on the Trends page

### LINE notifications
Scheduled via Supabase `pg_cron` + Edge Functions:

| Notification | Schedule | Description |
|---|---|---|
| 月次レポート | 1st of month, 9:00 JST | Previous month's summary + current month's scheduled debits |
| Custom notifications | Daily check, 9:00 JST | User-defined reminders with custom text and send day (see below) |

Each user can enable/disable 月次レポート individually in **Settings → LINE通知**.

**Custom notifications** (通知管理, also under Settings → LINE通知) replace the old fixed-date
reminders — households can create any number of notifications with their own message and a
monthly send day (1–31 or 月末), edit or delete them at any time, and each member can opt in/out
of each notification individually. A single `custom-reminder` function runs daily and sends only
the notifications whose configured day matches today (JST).

Test sends route to the requester's own LINE account based on login email.

### Automated backup & restore
Nightly backup of all data to **Google Drive**, with one-click manual backup and restore in **Settings → バックアップ・復元**.

- `daily-backup` Edge Function runs via `pg_cron` every night at **1:00 JST** (`0 16 * * *` UTC)
- Exports **all tables** to a single timestamped JSON and uploads it to a `KakeiboBackups` Drive folder
- Keeps the **latest 30** backups; older files are deleted automatically
- Every run is logged to the `backup_logs` table (visible per-household via RLS)
- **今すぐバックアップ** triggers a backup on demand; **バックアップから復元** restores from an uploaded JSON
- Restore runs as a single-transaction RPC (`restore_household_data`) — fully atomic, so a failure rolls everything back (no partial restore). It overwrites the current household's data tables only; `households` / `household_members` are left untouched

Uploads use a **user OAuth refresh token** (not a service account) so files are owned by the user and use their normal Drive quota.

#### Backup file structure

Filename: `kakeibo-backup-YYYY-MM-DD.json`

```json
{
  "backup_date": "2026-06-24",
  "version": "1.0",
  "tables": {
    "monthly_income": [ ... ],
    "card_expenses": [ ... ],
    "other_expenses": [ ... ],
    "account_balance": [ ... ],
    "cards": [ ... ],
    "other_expense_types": [ ... ],
    "app_settings": [ ... ],
    "households": [ ... ],
    "household_members": [ ... ]
  }
}
```

Each key under `tables` holds the full row set for that table. On restore, only the data tables
(`cards`, `other_expense_types`, `monthly_income`, `card_expenses`, `other_expenses`,
`account_balance`, `app_settings`) are rewritten and reassigned to the current household.

> **Known limitation:** `card_expense_transactions` (per-transaction OCR detail) and the custom
> notification tables (`custom_notifications`, `custom_notification_prefs`) are not yet included
> in backup/restore. Restoring regenerates `card_expenses` row IDs, so transaction detail rows
> (keyed by the old ID) would be orphaned — this needs an ID-remap step before it can be added safely.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion, Recharts |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Notifications | LINE Messaging API |
| AI | Google Gemini 2.5 Flash (receipt analysis) |
| Backup | Google Drive API (user OAuth) |
| Hosting | Vercel (frontend) |

## Project structure

```
├── src/
│   ├── pages/          # ThisMonth, MonthlyReport, YearlySummary, Trends, Settings, Login
│   ├── components/     # EntryForms, Ui, Modal, MasterManager
│   └── lib/            # api.js, supabase.js, helpers.js, meta.jsx
├── supabase/
│   ├── functions/      # Edge Functions (monthly-report, custom-reminder, analyze-receipt, daily-backup, etc.)
│   ├── cron.sql        # pg_cron schedule for LINE notifications + daily backup
│   └── config.toml
├── migrations/         # Incremental SQL migrations
├── supabase_schema.sql # Full database schema (run in SQL Editor)
└── import_2026_jan_may.sql  # Sample data import
```

## Getting started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- (Optional) LINE Messaging API channel for notifications
- (Optional) Google Gemini API key for receipt analysis

### 1. Clone and install

```bash
git clone https://github.com/suzuharuka1130-rgb/budgetmanager.git
cd budgetmanager
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |

### 3. Database setup

Run in the Supabase SQL Editor:
1. `supabase_schema.sql` — creates all tables, RLS policies, and seed data
2. `migrations/*.sql` — any incremental migrations (if not already applied)

Create auth users for each person who will use the app (Authentication → Users).

### 4. Edge Functions (optional)

Deploy notification and receipt functions:

```bash
npx supabase functions deploy monthly-report
npx supabase functions deploy custom-reminder
npx supabase functions deploy send-line-message
npx supabase functions deploy analyze-receipt
npx supabase functions deploy daily-backup
```

Set secrets in Supabase (Settings → Edge Functions → Secrets):

| Secret | Description |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API channel access token |
| `LINE_USER_ID_ME` | Your LINE user ID |
| `LINE_USER_ID_WIFE` | Partner's LINE user ID |
| `USER_EMAIL_ME` | Your login email |
| `USER_EMAIL_WIFE` | Partner's login email |
| `GEMINI_API_KEY` | Google Gemini API key (for receipt analysis) |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID for Drive backup |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret for Drive backup |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | OAuth refresh token (scope `drive.file`) for Drive backup |
| `GOOGLE_DRIVE_FOLDER_ID` | *(optional)* target folder ID; auto-created if unset |

> The `daily-backup` function requires running `migrations/backup_logs.sql` first (creates the
> `backup_logs` table and the `restore_household_data` RPC). For obtaining the Google OAuth
> refresh token, see the setup comment at the top of `supabase/functions/daily-backup/index.ts`.

### 5. Cron jobs (optional)

Edit placeholders in `supabase/cron.sql` and run in SQL Editor to schedule the LINE notifications
and the nightly Google Drive backup (`daily-backup`, 1:00 JST).

### 6. Run locally

```bash
npm run dev
```

Open http://localhost:5173

### 7. Deploy to production

```bash
npm run build
```

Deploy `dist/` to Vercel (or any static host). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in your hosting dashboard.

## Usage notes

- **入金** = deposits recorded for the month
- **口座残高スナップショット** = manual bank balance entry; used as the starting point for auto-calculated balance
- Cards and expense types can be customized under **Settings**
- Future-month entries appear as pending and must be confirmed before they affect the balance

## License

Private project — not licensed for public use.
