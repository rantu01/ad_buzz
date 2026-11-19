📋 **Ad-Buzz — Project Overview **

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**১. প্রোজেক্ট পরিচিতি**

Ad-Buzz একটি **Meta (Facebook) Ad Account Spend Cap ম্যানেজমেন্ট সিস্টেম**। ইউজাররা তাদের ওয়ালেট ব্যালেন্স থেকে টাকা টপ-আপ করে Meta Ad Account-এর Spend Cap আপডেট করতে পারে — সবকিছু রিয়েল-টাইমে Meta Marketing API-র মাধ্যমে।

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**২. টেকনোলজি স্ট্যাক**

▸ Framework: Next.js 16 (App Router)
▸ Frontend: React 19 + Tailwind CSS v4 + Framer Motion
▸ Auth: Firebase Authentication (Email/Password + Google OAuth)
▸ Database: MongoDB 7 (Native Driver)
▸ Icons: Lucide React
▸ Alerts/Modals: SweetAlert2
▸ Meta API: Graph API v22.0
▸ Notification: WhatsApp Cloud API v22.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**৩. ইউজার ফিচারসমূহ (User Dashboard)**

✅ **Login/Register** — Email/Password ও Google দিয়ে sign-up/sign-in
✅ **Dashboard** — ওয়ালেট ব্যালেন্স, অ্যাকাউন্ট কাউন্ট, বাজেট ওভারভিউ
✅ **Ad Account Management** — অ্যাসাইন করা অ্যাকাউন্ট দেখা, টপ-আপ করা
✅ **Deposits** — ডিপোজিট রিকোয়েস্ট তৈরি করা (পেমেন্ট মেথড, স্ক্রিনশট সহ)
✅ **Balance History** — ব্যালেন্স পরিবর্তনের সম্পূর্ণ ইতিহাস (CSV এক্সপোর্ট)
✅ **Payment History** — সব ট্রানজেকশনের তালিকা
✅ **Profile Settings** — ব্যক্তিগত তথ্য আপডেট

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**৪. অ্যাডমিন ফিচারসমূহ (Admin Panel)**

✅ **Admin Dashboard** — Total Users, Ad Accounts, Pending Deposits/Withdrawals-এর স্ট্যাটিস্টিক্স
✅ **User Management** — ইউজার রোল পরিবর্তন, ব্যালেন্স এডজাস্ট, অ্যাকাউন্ট ফ্রিজ/আনফ্রিজ
✅ **Ad Account Management** — অ্যাড অ্যাকাউন্ট তৈরি, এডিট, অ্যাসাইন/আনঅ্যাসাইন, ডিলিট (সব Meta API-র সাথে সিঙ্ক)
✅ **Deposit Management** — ডিপোজিট অ্যাপ্রুভ/রিজেক্ট (WhatsApp নোটিফিকেশনসহ)

✅ **Meta API Settings** — BM ID, App ID, Access Token কনফিগার, কানেকশন টেস্ট, অ্যাকাউন্ট ফেচ, অটো সিঙ্ক
✅ **Reports** — Overview, Financial, User Activity, Ad Spend Report + CSV/PDF এক্সপোর্ট
✅ **Balance Logs** — সম্পূর্ণ ব্যালেন্স পরিবর্তনের লগ (ফিল্টার + এক্সপোর্ট)
✅ **Site Settings** — সাইটের নাম, কালার, লোগো পরিবর্তন (CSS variables-এ রিয়েল-টাইম ইফেক্ট)
✅ **WhatsApp Integration** — ফোন নম্বর আইডি, টোকেন কনফিগার, টেস্ট মেসেজ, নোটিফিকেশন লগ


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**৫. Meta API ইন্টিগ্রেশন**

🔹 Business Manager থেকে অ্যাড অ্যাকাউন্ট ফেচ করা
🔹 অ্যাড অ্যাকাউন্টের spend_cap, balance, amount_spent, status পড়া
🔹 অ্যাডভার্টাইজমেন্ট ইনসাইটস (spend, impressions, clicks, CPC, CTR, CPM)
🔹 Spend Cap আপডেট করা (টপ-আপ করার সময় API কল)
🔹 অটো স্পেন্ড ক্যাপ ফিচার — 95% ইউটিলাইজেশনে 20% বাড়িয়ে দেয়
🔹 Meta ডেটা লোকাল MongoDB-তে ক্যাশ করা (দ্রুত রিডের জন্য)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**৬. WhatsApp নোটিফিকেশন**

📱 নিম্নলিখিত ইভেন্টে ইউজারকে WhatsApp মেসেজ যায়:
▸ ডিপোজিট অ্যাপ্রুভড (পরিমাণ + নতুন ব্যালেন্স)
▸ ডিপোজিট রিজেক্টেড (কারণসহ)
▸ উইথড্রয়াল অ্যাপ্রুভড
▸ উইথড্রয়াল রিজেক্টেড (কারণসহ)

🔹 ইমেল/নম্বর থেকে ফোন নম্বর খুঁজে মেসেজ পাঠায়
🔹 প্রতি নোটিফিকেশন টাইপ আলাদাভাবে অন/অফ করা যায়
🔹 সব নোটিফিকেশন লগ করা হয় (sent/error/skipped)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**৭. সিকিউরিটি ফিচারসমূহ**

🔒 **Authentication:** Firebase Auth (Email/Password, Google OAuth)
🔒 **Authorization:** Role-based access control (User vs Admin)
🔒 **Server-side Validation:** সব API-তে ইনপুট ভ্যালিডেশন (amount > 0, required fields)
🔒 **MongoDB Security:** পাসওয়ার্ড কখনও স্টোর নয়; MongoDB URI .env-তে (git থেকে excluded)
🔒 **Meta Token Security:** Meta API টোকেন শুধু MongoDB-তে স্টোর, API response-এ কখনো টোকেন পাঠায় না (শুধু hasAccessToken boolean)
🔒 **WhatsApp Token Security:** একইভাবে Token শুধু MongoDB-তে, API-তে never exposed
🔒 **Balance Integrity:** ব্যালেন্স ডেবিট/ক্রেডিট সবসময় পরপর দুইটি operation (deduct + Meta API call / credit + log)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**৮. ডাটাবেজ স্কিমা**

📦 **Collections (MongoDB — ad_buzz):**
▸ `users` — ইউজার প্রোফাইল, ব্যালেন্স, রোল, স্ট্যাটাস
▸ `adAccounts` — অ্যাড অ্যাকাউন্ট (Meta info সহ)
▸ `metaAdAccounts` — Meta থেকে ক্যাশ করা ডেটা
▸ `metaSettings` — Meta API কনফিগারেশন
▸ `deposits` — ডিপোজিট রিকোয়েস্ট
▸ `balanceLogs` — ব্যালেন্স পরিবর্তনের অডিট ট্রেইল
▸ `syncLogs` — Meta API সিঙ্ক লগ
▸ `site_settings` — সাইট কনফিগ (নাম, কালার, লোগো)
▸ `whatsappSettings` — WhatsApp API কনফিগ
▸ `notificationLogs` — WhatsApp নোটিফিকেশন লগ

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**৯. API এন্ডপয়েন্ট সমূহ**

📡 Total **~40+ API Routes** (User, Admin, Auth, Public):

**User APIs:** Dashboard, Ad Accounts, Top-up, Deposit, Withdrawal, Balance Logs, Profile
**Admin APIs:** Users CRUD, Ad Accounts CRUD, Deposits Approve/Reject, Withdrawals Approve/Reject, Meta Settings, Reports, Balance Logs, Site Settings, WhatsApp Settings, Invitations
**Auth & Public:** Firebase User Sync, Site Settings (public)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**১০. আর্কিটেকচার Overview**

🏗️ **Pattern:** Next.js 16 App Router (Server + Client Components)
🔄 **Data Flow:** Firebase Auth → Client (uid) → API Routes (uid param) → MongoDB → JSON Response
📦 **Caching:** Meta data cached locally; after writes, cache updated immediately
🎨 **Styling:** Tailwind CSS v4 with CSS Variables for dynamic theming
📱 **Responsive:** Full responsive design (mobile + desktop)
🌐 **API Version:** Meta Graph API v22.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

