# AdBuzz — Meta Ad Account Spend Cap Manager

A full-stack web application for managing Meta (Facebook) ad account **Spend Caps**. Users top up their ad account budgets via wallet balance, and the Spend Cap is updated in real-time on the actual Meta ad account through the Marketing API. Built with **Next.js 16**, **React 19**, **MongoDB**, and **Firebase Auth**.

---

## Features

- **User Dashboard** — View ad accounts, wallet balance, budget (Spend Cap), and spend history
- **Wallet Top-Up** — Deposit balance, then top up ad accounts; Spend Cap is pushed to Meta via API
- **Admin Panel** — Manage users, ad accounts, deposits, withdrawals, Meta API settings
- **Meta API Integration** — Fetch accounts from Meta BM, sync spend/insights, auto-update Spend Cap at 95% utilization
- **Spend Cap as Budget** — The Meta Spend Cap is the single source of truth for ad account budgets
- **Real-Time Sync** — Spend Cap changes are reflected in both the local database and the actual Meta ad account

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| UI | [React 19](https://react.dev), [Tailwind CSS v4](https://tailwindcss.com) |
| Auth | [Firebase Auth](https://firebase.google.com/docs/auth) |
| Database | [MongoDB 7](https://www.mongodb.com) (native driver) |
| Icons | [Lucide React](https://lucide.dev) |
| Alerts | [SweetAlert2](https://sweetalert2.github.io) |
| API | Meta Graph API v22.0 |

---

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB instance (local or Atlas)
- Firebase project (for authentication)
- Meta Business Manager with ad accounts
- Meta App with Marketing API product

### 1. Clone & Install

```bash
git clone <repo-url>
cd ad-buzz
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/ad_buzz
MONGODB_DB_NAME=ad_buzz

NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 3. Meta API Configuration

See [AccessToken.md](./AccessToken.md) for a step-by-step guide on generating the required access token.

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
app/
├── (admin)/admin/         # Admin pages (protected by admin role)
│   ├── ad-accounts/       # Manage ad accounts, assign users
│   ├── meta-api/          # Meta API settings & sync
│   ├── reports/           # Reports & analytics
│   ├── deposits/          # Deposit verification
│   ├── withdrawals/       # Withdrawal management
│   ├── user-management/   # User CRUD
│   ├── balance-logs/      # Balance transaction history
│   └── settings/          # Site-wide settings
├── user-dashboard/        # User-facing pages (authenticated)
│   ├── ad-account/        # Ad account list & top-up
│   ├── balance/           # Wallet overview
│   ├── deposits/          # Deposit history & create
│   ├── withdrawals/       # Withdraw funds
│   ├── balance-history/   # Balance log
│   ├── profile/           # User profile
│   └── Payment-History/   # Payment transaction history
├── api/
│   ├── admin/             # Admin API routes
│   │   ├── ad-accounts/   # CRUD + assign/unassign
│   │   ├── meta-api/      # Settings + sync actions
│   │   └── ...
│   └── user/              # User API routes
│       └── ad-accounts/   # List, top-up, history
├── Component/
│   ├── Auth/              # Firebase AuthProvider, LoginForm
│   └── Settings/          # SettingsProvider
└── layout.js              # Root layout

lib/
├── mongodb.js             # MongoDB client singleton
├── adAccountModel.js      # Ad account CRUD operations
├── metaApiService.js      # Meta Graph API integration
├── metaSettingsModel.js   # Meta settings persistence
├── userModel.js           # User CRUD + balance operations
├── balanceLog.js          # Balance log queries
├── reportService.js       # Report aggregation queries
├── siteSettingsModel.js   # Site-wide settings
└── firebaseClient.js      # Firebase client init
```

---

## API Routes (Key Endpoints)

### User

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/user/ad-accounts?uid=` | List user's ad accounts (enriched with Meta data) |
| POST | `/api/user/ad-accounts/top-up` | Top up ad account (deducts wallet, updates Meta Spend Cap) |
| GET | `/api/user/ad-accounts/history?accountId=` | Top-up transaction history |
| GET | `/api/user/dashboard?uid=` | User dashboard data (balance, role) |

### Admin

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/ad-accounts` | List all ad accounts (enriched with Meta data) |
| PATCH | `/api/admin/ad-accounts` | Update ad account (converts budget → spendCap, pushes to Meta) |
| POST | `/api/admin/ad-accounts/assign` | Assign accounts to a user |
| GET/PUT | `/api/admin/meta-api` | Get/update Meta API settings |
| POST | `/api/admin/meta-api/sync` | Fetch accounts from Meta BM, sync spend data |

---

## Database Collections (`ad_buzz`)

- **`adAccounts`** — Ad accounts with `spendCap` (cents), `budget` (dollars, deprecated), `spent`, `status`, assignment info
- **`metaAdAccounts`** — Cached Meta ad account data (balance, spend cap, amount spent, status)
- **`metaSettings`** — Meta API credentials and flags (`autoSpendCapUpdate`, `autoSyncEnabled`)
- **`users`** — User profiles, roles, wallet `availableBalance`
- **`balanceLogs`** — All balance change transactions (top-ups, deposits, withdrawals)
- **`deposits`**, **`withdrawals`** — Payment request records
- **`syncLogs`** — Meta sync operation logs
- **`site_settings`** — Site-wide configuration

---

## Architecture Notes

- **Spend Cap as Budget**: The `spendCap` field on `adAccounts` (in cents) is the single source of truth for budgets. The old `budget` field (in dollars) is deprecated.
- **Top-Up Flow**: Wallet balance is deducted → Meta API `POST /act_{id}` is called → local `spendCap` and cache are updated → user sees the new value. If Meta API fails, the top-up is cancelled and wallet is not deducted.
- **Cache Consistency**: The `metaAdAccounts` collection serves as the display layer. Pages always read `metaSpendCap` from this cache, ensuring the displayed value matches the real Meta ad account. After any successful Meta API write, the cache is updated immediately.
- **Sync**: "Sync Spend Data" fetches fresh insights from Meta and updates `adAccounts.spendCap` from the cached Meta data, keeping everything consistent.

---

## License

MIT
