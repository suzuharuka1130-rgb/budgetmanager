# Haruka ChiChan Kakeibo

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
- Receipt/statement image upload with **Gemini Vision** auto-extraction of amount and note
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
| 支出入力リマインダー | 25th of month, 9:00 JST | Reminder to log expenses |
| クレジット入力リマインダー | Last day of month, 9:00 JST | Reminder to enter credit card amounts |

Each user can enable/disable notifications individually in **Settings → LINE通知**.

Test sends route to the requester's own LINE account based on login email.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion, Recharts |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Notifications | LINE Messaging API |
| AI | Google Gemini 2.5 Flash (receipt analysis) |
| Hosting | Vercel (frontend) |

## Project structure

```
├── src/
│   ├── pages/          # ThisMonth, MonthlyReport, YearlySummary, Trends, Settings, Login
│   ├── components/     # EntryForms, Ui, Modal, MasterManager
│   └── lib/            # api.js, supabase.js, helpers.js, meta.jsx
├── supabase/
│   ├── functions/      # Edge Functions (monthly-report, reminders, analyze-receipt, etc.)
│   ├── cron.sql        # pg_cron schedule for LINE notifications
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
npx supabase functions deploy monthly-reminder
npx supabase functions deploy credit-input-reminder
npx supabase functions deploy send-line-message
npx supabase functions deploy analyze-receipt
```

Set secrets in Supabase (Settings → Edge Functions → Secrets):

| Secret | Description |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API channel access token |
| `LINE_USER_ID_ME` | Your LINE user ID |
| `LINE_USER_ID_WIFE` | Partner's LINE user ID |
| `USER_EMAIL_ME` | Your login email (default: suzu.haruka1130@gmail.com) |
| `USER_EMAIL_WIFE` | Partner's login email |
| `GEMINI_API_KEY` | Google Gemini API key (for receipt analysis) |

### 5. LINE notification cron (optional)

Edit placeholders in `supabase/cron.sql` and run in SQL Editor to schedule automatic notifications.

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
