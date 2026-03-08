# TANHOWA - Codebase Guide

## Project Overview

TANHOWA (Tamil Nadu Horticultural Officers Welfare Association) is a member portal for horticultural officers in Tamil Nadu, India. Members sign up via email OTP, complete their profile, get admin approval, then access announcements, events, documents, a member directory, subscriptions/payments, and grievance submission. Admins manage all content and users through a separate admin panel.

**Live URL:** https://tanhowa.in
**Deployment:** Vercel (auto-deploys from `main` branch)
**Domain DNS:** Cloudflare

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, TypeScript) | 15.5.x |
| React | React with `"use client"` directives | 19.2.x |
| Database | Supabase (PostgreSQL) | SDK 2.98.x |
| Auth | Custom JWT sessions via `jose` (no Supabase Auth) | 6.1.x |
| Email | Zoho Mail SMTP via `nodemailer` | 8.0.x |
| AI Chatbot | Google Gemini API (`gemini-2.5-flash`) | 0.24.x |
| UI Components | shadcn/ui (new-york style) + Radix UI primitives | — |
| CSS | Tailwind CSS v4 + `tw-animate-css` | 4.x |
| Icons | lucide-react | 0.575.x |
| Toasts | sonner | 2.0.x |

## Directory Structure

```
tanhowa/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (Poppins font, ErrorBoundary, ChatbotWidget, Toaster)
│   ├── page.tsx                # Landing page — overlapping image collage + email login
│   ├── globals.css             # Tailwind + horticulture theme (oklch colors)
│   ├── favicon.ico
│   ├── verify/page.tsx         # OTP verification page
│   ├── onboarding/page.tsx     # Profile completion form (new users)
│   ├── pending/page.tsx        # Awaiting admin approval page
│   ├── dashboard/              # Member dashboard (sidebar layout)
│   │   ├── layout.tsx          # Auth check, status redirect, sidebar nav
│   │   ├── page.tsx            # Overview with stats
│   │   ├── profile/page.tsx    # Edit own profile
│   │   ├── members/page.tsx    # Member directory
│   │   ├── announcements/page.tsx
│   │   ├── events/page.tsx
│   │   ├── documents/page.tsx  # View/download documents
│   │   ├── subscriptions/page.tsx # View/pay subscriptions
│   │   └── grievances/page.tsx # Submit grievances
│   ├── admin/                  # Admin panel (sidebar layout, role-gated)
│   │   ├── layout.tsx          # Admin role check, sidebar nav
│   │   ├── page.tsx            # Admin dashboard stats
│   │   ├── users/page.tsx      # Manage users (approve/reject/view details)
│   │   ├── announcements/page.tsx
│   │   ├── events/page.tsx
│   │   ├── documents/page.tsx  # Upload/manage documents
│   │   ├── subscriptions/page.tsx # Subscription payments (bulk create, verify, district report)
│   │   ├── grievances/page.tsx # Review/respond to grievances
│   │   ├── error-logs/page.tsx # Application error log viewer
│   │   └── settings/page.tsx   # Site settings (community name, tagline, about)
│   └── api/                    # API routes (all server-side)
│       ├── auth/
│       │   ├── send-otp/route.ts    # POST: generate 6-digit OTP, send via Zoho SMTP
│       │   ├── verify-otp/route.ts  # POST: verify OTP, create/find user, set JWT cookie
│       │   └── logout/route.ts      # POST: delete session cookie
│       ├── users/
│       │   ├── route.ts             # GET: list users (admin sees all fields)
│       │   └── me/route.ts          # GET: current user info, PUT: update own profile
│       ├── admin/
│       │   └── users/route.ts       # GET/POST: admin user management (approve/reject/role)
│       ├── announcements/route.ts   # GET/POST/PUT/DELETE
│       ├── events/route.ts          # GET/POST/PUT/DELETE
│       ├── documents/route.ts       # GET/POST/PUT/DELETE
│       ├── grievances/route.ts      # GET/POST/PUT/DELETE
│       ├── subscriptions/
│       │   ├── route.ts             # GET/POST/PUT/DELETE (auto-sync, bulk-create, verify)
│       │   ├── bulk-verify/route.ts # POST: bulk verify payments
│       │   ├── recent-payments/route.ts # GET: recent verified payments
│       │   └── district-report/route.ts # GET: district-wise collection report
│       ├── error-logs/route.ts      # GET/POST/DELETE (POST = client error submission)
│       ├── upload/
│       │   ├── avatar/route.ts            # POST: upload user avatar to Supabase Storage
│       │   ├── document/route.ts          # POST: upload document file to Supabase Storage
│       │   ├── qr-code/route.ts           # POST: upload QR code image for subscriptions
│       │   └── payment-proof/
│       │       ├── route.ts               # POST: upload payment proof image
│       │       ├── signed-url/route.ts    # POST: get signed URL for payment proof
│       │       └── extract-date/route.ts  # POST: extract date from payment proof via Gemini
│       ├── chat/route.ts            # POST: Gemini AI chatbot
│       ├── settings/route.ts        # GET/POST site settings
│       └── stats/route.ts           # GET dashboard statistics
├── components/
│   ├── ui/                     # shadcn/ui components (DO NOT manually edit)
│   │   ├── button.tsx, input.tsx, card.tsx, dialog.tsx
│   │   ├── table.tsx, badge.tsx, tabs.tsx, avatar.tsx
│   │   ├── dropdown-menu.tsx, separator.tsx, sheet.tsx
│   │   ├── textarea.tsx, label.tsx, select.tsx, sonner.tsx
│   │   └── (all auto-generated by shadcn CLI)
│   ├── chatbot-widget.tsx      # Floating AI chatbot (Gemini-powered, multi-turn)
│   └── error-boundary.tsx      # React ErrorBoundary + GlobalErrorCatcher (window.onerror)
├── lib/
│   ├── supabase.ts             # getSupabase() (anon client) + getServiceClient() (service role)
│   ├── auth.ts                 # createSession, getSession, deleteSession (JWT + httpOnly cookie)
│   ├── mail.ts                 # sendOTPEmail(), sendSubscriptionApprovedEmail(), notifyPaymentVerified() via Zoho SMTP
│   ├── gemini.ts               # getGemini() + SYSTEM_PROMPT for chatbot
│   ├── error-logger.ts         # logError() — server-side error logging to Supabase
│   ├── db.ts                   # getSQL() — direct PostgreSQL via `postgres` package (requires DATABASE_URL)
│   ├── tn-districts.ts         # TN_DISTRICTS, DISTRICT_NAMES, getBlocks() — 38 TN districts + blocks
│   └── utils.ts                # cn() — clsx + tailwind-merge utility
├── supabase/
│   └── schema.sql              # Base database schema (run in Supabase SQL editor)
├── public/                     # Static assets (SVGs, favicon)
├── next.config.ts              # Remote image patterns (images.unsplash.com)
├── tsconfig.json               # TypeScript config (strict, @/* path alias)
├── postcss.config.mjs          # PostCSS with @tailwindcss/postcss
├── components.json             # shadcn/ui config (new-york style, lucide icons)
├── vercel.json                 # Vercel framework config
├── eslint.config.mjs           # ESLint config
├── package.json
└── .env.local                  # Environment variables (gitignored)
```

## Authentication Flow

1. User clicks "Continue with Google" on landing page (`/`)
2. `GET /api/auth/google` — redirects to Google OAuth consent screen (with CSRF state cookie)
3. Google redirects back to `GET /api/auth/google/callback` with authorization code
4. Callback exchanges code for tokens, fetches user info (email, name, picture), creates or finds user, sets JWT cookie
5. New user (no name/phone/occupation) → redirect to `/onboarding` for profile completion
6. Pending user → redirect to `/pending`
7. Approved user → redirect to `/dashboard`
8. Admin users can access `/admin` (role check in admin layout)

**Email OTP fallback:** Users without Google accounts can click "Continue with Email" on the landing page, which expands an email input → sends OTP via `/api/auth/send-otp` → verifies on `/verify` page via `/api/auth/verify-otp`.

**Session payload:** `{ userId, email, role: "member"|"admin", status: "pending"|"approved"|"rejected" }`

**Session implementation:** JWT signed with HS256, stored in httpOnly cookie named `session`, 7-day expiry. Uses `jose` library (not jsonwebtoken) for Edge compatibility.

## API Route Patterns

All API routes follow this consistent pattern:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  // 1. Auth check
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. DB operation with service client
  const supabase = getServiceClient();
  const { data } = await supabase.from("table").select("*");

  // 3. Return JSON response
  return NextResponse.json({ data: data || [] });
}
```

**Conventions:**
- Always use `getServiceClient()` (service role key) for DB operations — never the anon client in API routes
- Always check `getSession()` first for auth (except `POST /api/error-logs` which is public)
- Admin-only operations: check `session.role !== "admin"` → return 403
- Members see their own data; admins see all (filtered via `.eq("submitted_by", session.userId)`)
- Standard HTTP methods: GET (list/read), POST (create), PUT (update), DELETE (remove)
- Error responses: `{ error: "message" }` with appropriate status code
- Use `logError()` from `lib/error-logger.ts` in catch blocks for server-side error tracking

## Database

**Provider:** Supabase PostgreSQL
**Base schema:** `supabase/schema.sql`

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Members and admins | email, name, phone, occupation, posting_details (JSONB), social_links (JSONB), role, status, last_active_at, profile_nudge (JSONB) |
| `otp_codes` | Temporary OTP storage | email, code, expires_at, used |
| `announcements` | News/announcements | title, content, author_id, published (boolean) |
| `events` | Calendar events | title, description, date, location, image_url |
| `documents` | Uploaded files | title, file_url, file_type, description, category, approved |
| `grievances` | Member complaints/suggestions | subject, description, category, status (pending/in_progress/resolved/rejected), admin_remarks, submitted_by |
| `subscriptions` | Member payment tracking | user_id, period, amount, due_date, status (pending/paid/overdue), payment_method, transaction_id, payment_proof_url, remarks, paid_at, approved_by, approved_at |
| `document_access` | Per-member document access | document_id, user_id (junction table for visibility="selected" documents) |
| `error_logs` | Application error tracking | type (api/client/auth), message, stack, path, method, status_code, user_id, metadata (JSONB) |
| `site_settings` | Key-value site config | key (unique), value |

**Additional user columns:**
- `office_address` (TEXT), `last_active_at` (TIMESTAMPTZ, updated on every `/api/users/me` GET)
- `profile_nudge` (JSONB: `{ fields, message, requested_at, requested_by }`) — admin nudge for profile completion
- `posting_details` includes `regular_district` used for district-wise reports
- `social_links` JSONB also stores: `title`, `gender`, `qualification`, `specialisation`, `skill_sets` (object), `languages` (object), `experience` (array of `{ institution, from, to, designation }`), `current_interest_area`, `date_of_joining`

**Document columns:** `visibility` (TEXT, "all" or "selected") controls who can see each document.

### Migrations beyond base schema

The base `schema.sql` only covers `users`, `otp_codes`, `announcements`, `events`, `documents`, and `site_settings`. The following must be applied separately:

```sql
-- Users posting details
ALTER TABLE users ADD COLUMN IF NOT EXISTS posting_details JSONB DEFAULT '{}';

-- Documents extras
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false;

-- Grievances table
CREATE TABLE IF NOT EXISTS grievances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  admin_remarks TEXT DEFAULT '',
  submitted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT DEFAULT 'api',
  message TEXT NOT NULL,
  stack TEXT,
  path TEXT,
  method TEXT,
  status_code INTEGER,
  user_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  transaction_id TEXT,
  payment_proof_url TEXT,
  remarks TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document access control
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'all';
CREATE TABLE IF NOT EXISTS document_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

-- Office address
ALTER TABLE users ADD COLUMN IF NOT EXISTS office_address TEXT DEFAULT '';

-- Activity tracking & admin nudge
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_nudge JSONB DEFAULT NULL;

-- Subscription approval tracking
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
```

## Environment Variables

Required in `.env.local` (and Vercel dashboard → Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anonymous/public key
SUPABASE_SERVICE_ROLE_KEY=      # Supabase service role key (server-only, never expose)
JWT_SECRET=                     # Random secret for signing JWT tokens
ZOHO_SMTP_HOST=                 # smtp.zoho.in
ZOHO_SMTP_PORT=                 # 465
ZOHO_SMTP_USER=                 # admin@tanhowa.in
ZOHO_SMTP_PASS=                 # Zoho app password
GOOGLE_GEMINI_API_KEY=          # Google Generative AI API key
GOOGLE_CLIENT_ID=               # Google OAuth client ID (from Google Cloud Console)
GOOGLE_CLIENT_SECRET=           # Google OAuth client secret
GOOGLE_REDIRECT_URI=            # OAuth callback URL (e.g. https://tanhowa.in/api/auth/google/callback)
DATABASE_URL=                   # Direct PostgreSQL connection string (used by lib/db.ts)
```

## UI & Styling Conventions

### Theme
Custom horticulture theme using oklch colors defined in `app/globals.css`:
- **Primary:** deep green `oklch(0.45 0.15 155)` — used for branding, buttons, links
- **Secondary:** golden/amber `oklch(0.72 0.14 55)` — used for highlights
- **Accent:** terracotta/orange `oklch(0.65 0.18 40)` — used for emphasis
- **Sidebar:** dark green background `oklch(0.3 0.1 155)` with light text
- **Background:** warm off-white `oklch(0.98 0.01 95)`

### Component conventions
- **Component library:** shadcn/ui (new-york style). Add via `npx shadcn@latest add <name>`
- **Icons:** lucide-react exclusively — import from `lucide-react`
- **Font:** Poppins (loaded in root layout via `next/font/google`)
- **Toasts:** sonner — the `<Toaster />` is already in root layout

### Design rules
- **Border radius:** Clean rounded corners only — use `rounded-2xl` for cards, `rounded-xl` for inputs/buttons. **Never use blob, egg, or organic shapes.**
- **Images:** Unsplash via `next/image` with `fill` + `object-cover`. Remote pattern for `images.unsplash.com` is configured in `next.config.ts`
- **Background images:** Subtle horticulture photos at 3-6% opacity on dashboard, admin, verify, onboarding, and pending pages
- **Landing page:** Overlapping image collage with negative margins, subtle rotations (1-2 degrees), and stacking z-index for a rich, layered horticulture feel
- **No dark mode** — light theme only

### shadcn/ui components in use
`button`, `input`, `card`, `dialog`, `table`, `badge`, `tabs`, `avatar`, `dropdown-menu`, `separator`, `sheet`, `textarea`, `label`, `select`, `sonner`

## Development Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build — always run before pushing to verify
npm run start    # Start production server
npm run lint     # ESLint
```

## Git & Deployment

- **Remote:** GitHub (`origin`)
- **Branch mapping:** Local `main` → remote `main` (also push to `master` for legacy)
- **Push command:** `git push origin HEAD:main HEAD:master`
- **Auto-deploy:** Vercel watches `main` and deploys on every push
- **Environment vars:** Must also be set in Vercel dashboard for production
- **Domain:** tanhowa.in and www.tanhowa.in (DNS managed in Cloudflare)
  - A record: `216.198.79.1` (Vercel)
  - CNAME for www: points to Vercel DNS

## Activity Tracking

`/api/users/me` GET silently updates `last_active_at` via fire-and-forget (no `await`). Admin users page sorts by most recently active and shows online count (active within 5 minutes).

## Email System (`lib/mail.ts`)

- `sendOTPEmail(to, otp)` — OTP delivery
- `sendSubscriptionApprovedEmail(to, memberName, period, amount)` — Payment approval confirmation
- `sendSubscriptionNotification(to, memberName, period, amount, message)` — Custom admin→member notification
- `notifyAdminNewRegistration(memberName, memberEmail)` — Alert admins of pending registrations
- `notifyNewAnnouncement(title, content)` — Broadcast to all members
- `notifyPaymentVerified(memberName, period)` — Broadcast payment verification
- `notifyNewMemberRegistered(memberName)` — Broadcast new member welcome
- `notifyNewEvent(title, date, location?)` — Broadcast event notification
- `sendBroadcastEmail(subject, bodyHtml)` — Generic broadcast (BCC batched at 40 recipients per email for Zoho limits)

**Flag:** `HOLD_MEMBER_EMAILS = true` disables all member-facing emails except OTP.

## Admin Auth Pattern

- Use `isAdmin(session)` helper which checks DB role (not JWT which may be stale)
- `DEFAULT_ADMIN_EMAIL = "tanhowaadmin@tanhowa.in"` is auto-approved as admin on first login
- Admin user actions: approve, reject, nudge (profile completion), change role

## PDF Generation (Admin Reports)

Uses `jspdf` + `jspdf-autotable` for client-side PDF export. Pattern: create landscape doc → header text → autoTable for district summary → autoTable for member details → color-coded status text. Theme color: `fillColor: [45, 106, 79]` (deep green).

## Subscription Auto-Sync

`GET /api/subscriptions?sync=true` (admin only) auto-creates missing subscription records for all approved members based on existing periods.

## AI-Powered Payment Proof Extraction

`POST /api/upload/payment-proof/extract-date` uses Gemini to extract date, time, transaction_id, and payment_method from uploaded payment proof images. Available to all authenticated users (not admin-only).

## Key Conventions

1. **All pages are client components** — every page.tsx has `"use client"` at the top. This project does not use React Server Components for pages.
2. **API routes are server-only** — always use `getServiceClient()` for Supabase, `getSession()` for auth.
3. **No middleware** — auth checks happen in page layouts via `useEffect` + fetch to `/api/users/me`, then redirect with `router.push()`.
4. **Error logging** — use `logError()` from `lib/error-logger.ts` in API route catch blocks. Client errors auto-report via `GlobalErrorCatcher` component.
5. **Status-based routing** — dashboard layout redirects `pending` users to `/pending`. Admin layout redirects non-admins to `/dashboard`.
6. **Member vs Admin data scoping** — API routes filter by `session.userId` for members, return all records for admins.
7. **Gemini model** — use `gemini-2.5-flash` (earlier models like `gemini-1.5-flash` and `gemini-2.0-flash` are deprecated for new users).
8. **No dark mode** — single light theme only.

## Cross-Component Communication

Admin layout sidebar badges (pending users count, error count) refresh on page navigation. When a child page performs actions that change these counts (e.g., approving a user), it must dispatch a custom event so the layout can re-fetch:

```typescript
// In child page after an action that changes counts:
window.dispatchEvent(new Event("admin-users-changed"));

// The admin layout listens for this event and re-fetches badge counts
```

Use this pattern whenever a child page modifies data that the layout displays.

## Common Tasks

### Adding a new dashboard feature

1. Create the Supabase table via SQL editor
2. Create API route at `app/api/<feature>/route.ts` — follow `app/api/grievances/route.ts` as a template
3. Create member page at `app/dashboard/<feature>/page.tsx`
4. Create admin page at `app/admin/<feature>/page.tsx`
5. Add nav item with icon to `app/dashboard/layout.tsx` (`navItems` array)
6. Add nav item with icon to `app/admin/layout.tsx` (`adminNavItems` array)
7. Add any needed shadcn components: `npx shadcn@latest add <component>`

### Adding a shadcn component

```bash
npx shadcn@latest add dialog    # Example
```

Components are generated into `components/ui/`. Do not manually edit these files.

### Adding a new API route

```bash
# Create the route file
mkdir -p app/api/<feature>
# Follow the pattern in app/api/grievances/route.ts
```

Always include: session check, getServiceClient(), proper error handling with `logError()`, and JSON responses.
