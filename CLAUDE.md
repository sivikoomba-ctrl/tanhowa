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

## Key Directories

- `app/` — Next.js App Router: pages (`dashboard/`, `admin/`, `onboarding/`, `verify/`, `pending/`) and API routes (`api/`)
- `app/api/` — Server-side API routes. Template: `app/api/grievances/route.ts`
- `components/ui/` — shadcn/ui auto-generated components (**do not manually edit**)
- `components/` — Custom components (`chatbot-widget.tsx`, `error-boundary.tsx`)
- `lib/` — Shared utilities: `supabase.ts`, `auth.ts`, `mail.ts`, `db.ts`, `telegram.ts`, `tn-districts.ts`, `error-logger.ts`, `gemini.ts`
- `supabase/schema.sql` — Base database DDL (additional migrations documented below)

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

**Session payload:** `{ userId, email, role: "member"|"admin"|"super_admin", status: "pending"|"approved"|"rejected" }`

**Session implementation:** JWT signed with HS256, stored in httpOnly cookie named `session`, 7-day expiry. Uses `jose` library (not jsonwebtoken) for Edge compatibility.

**`login_count` tracking:** Both auth routes (`google/callback` and `verify-otp`) increment `login_count` and update `last_login_at` on every login. **Auto-delete:** if `login_count >= 7` and `user.name` is empty and `role !== "admin"`, the account is deleted and the error `account_deleted_incomplete_profile` is returned. Warning banners appear on `/onboarding` at count ≥ 3 (amber) and ≥ 5 (red).

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
| `users` | Members and admins | email, name, phone, occupation, posting_details (JSONB), social_links (JSONB), role, status, last_active_at, profile_nudge (JSONB), telegram_chat_id |
| `otp_codes` | Temporary OTP storage | email, code, expires_at, used |
| `announcements` | News/announcements | title, content, author_id, published (boolean) |
| `events` | Calendar events | title, description, date, location, image_url |
| `documents` | Uploaded files | title, file_url, file_type, description, category, approved |
| `grievances` | Member complaints/suggestions | subject, description, category, status (pending/in_progress/resolved/rejected), admin_remarks, submitted_by |
| `subscriptions` | Member payment tracking | user_id, period, amount, due_date, status (pending/paid/overdue), payment_method, transaction_id, payment_proof_url, remarks, paid_at, approved_by, approved_at |
| `document_access` | Per-member document access | document_id, user_id (junction table for visibility="selected" documents) |
| `error_logs` | Application error tracking | type (api/client/auth), message, stack, path, method, status_code, user_id, metadata (JSONB) |
| `site_settings` | Key-value site config | key (unique), value |
| `teams` | Member teams | name, description, icon, sort_order, created_by |
| `team_members` | Team membership (junction) | team_id, user_id, role, added_by |
| `todos` | Tasks with Eisenhower Matrix | title, description, status, urgent, important, due_date, event_id, parent_id, submitted_by, assigned_to, assigned_team_id, committed_by, committed_at, estimated_time, estimated_amount, admin_remarks |
| `todo_notes` | Task messages/reports | todo_id, user_id, content, type (note/report/update) |
| `todo_attachments` | Task deliverable files | todo_id, user_id, file_url, file_name, file_type |
| `todo_vouchers` | Task cost/bill tracking | todo_id, submitted_by, title, amount, receipt_url, status (pending/approved/rejected), approved_by, remarks |

**Additional user columns:**
- `office_address` (TEXT), `last_active_at` (TIMESTAMPTZ, updated on every `/api/users/me` GET)
- `profile_nudge` (JSONB: `{ fields, message, requested_at, requested_by }`) — admin nudge for profile completion
- `posting_details` JSONB fields: `regular_district`, `regular_block`, `special_duty_district`, `special_duty_block`, `special_duty_place`, `special_designation` ("HO Tech (State Scheme)" / "HO Tech (GOI)" / "Farm Manager"), `special_farm` (TN horticulture farm name, shown when Farm Manager selected), `deputed_district`, `deputed_block`. When adding new subfields, update the `PostingDetails` interface and `emptyPosting` constant in both `app/onboarding/page.tsx` and `app/dashboard/profile/page.tsx` — no DB migration needed (JSONB).
- `social_links` JSONB also stores: `title`, `gender`, `qualification`, `specialisation`, `skill_sets` (object), `languages` (object), `experience` (array of `{ institution, from, to, designation }`), `current_interest_area`, `date_of_joining`

**Document columns:** `visibility` (TEXT, "all" or "selected") controls who can see each document.

### Migrations beyond base schema

The base `schema.sql` only covers `users`, `otp_codes`, `announcements`, `events`, `documents`, and `site_settings`. Additional tables (`grievances`, `error_logs`, `subscriptions`, `document_access`, `teams`, `team_members`, `todos`, `todo_notes`, `todo_attachments`, `todo_vouchers`) and column additions (`posting_details`, `office_address`, `last_active_at`, `profile_nudge`, `approved_by/at` on subscriptions, `visibility` on documents) were applied separately via the Supabase SQL editor. See the Tables section above for current schema.

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
TELEGRAM_BOT_TOKEN=             # Telegram Bot API token (for task notifications)
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
- **Landing page:** Bento mosaic grid layout with horticulture domain images flanking a centered login card
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

- Use `isAdmin(session)` helper which checks DB role (not JWT which may be stale) — returns true for both `admin` and `super_admin`
- Use `isSuperAdmin(session)` to check specifically for super_admin role
- `DEFAULT_ADMIN_EMAIL = "admintanhowa@tanhowa.in"` is auto-assigned `super_admin` role on login — never goes through onboarding, cannot be demoted or deleted
- Regular admins can be promoted/demoted by any admin; super_admin role is only auto-assigned to the default admin email
- Admin user actions: approve, reject, nudge (profile completion), change role

## Known Field Name Gotchas

- **User avatar:** DB column is `avatar_url`, not `photo_url`. Always use `avatar_url` in TypeScript interfaces and code that reads user records.
- **`GET /api/subscriptions?me=true`** — forces user-scoped results even for admins. The member dashboard always appends `?me=true`; the admin panel omits it to receive all members' data.

## PDF Generation (Admin Reports)

Uses `jspdf` + `jspdf-autotable` for client-side PDF export. Pattern: create landscape doc → header text → autoTable for district summary → autoTable for member details → color-coded status text. Theme color: `fillColor: [45, 106, 79]` (deep green).

## Subscription Auto-Sync

`GET /api/subscriptions?sync=true` (admin only) auto-creates missing subscription records for all approved members based on existing periods.

## AI-Powered Payment Proof Extraction

`POST /api/upload/payment-proof/extract-date` uses Gemini to extract date, time, transaction_id, and payment_method from uploaded payment proof images. Available to all authenticated users (not admin-only).

## Telegram Bot Integration

### Overview
A Telegram bot sends real-time notifications for task events. Users link their Telegram account by sending their registered email to the bot.

**Key files:**
- `lib/telegram.ts` — `sendTelegramMessage()`, notification helpers (`notifyTaskAssigned`, `notifyTaskCommitted`, `notifyTaskStatusChanged`, `notifyVoucherAction`, `notifyNewNote`), `escapeHtml()`
- `app/api/telegram/webhook/route.ts` — Webhook handler for bot commands (`/start`, `/help`, `/status`, `/update`, `/report`)

### Account Linking Flow
1. User sends any email text to the bot
2. Webhook looks up email in `users` table
3. If found, stores `telegram_chat_id` on the user record
4. Future task notifications are sent to that chat ID

### Notification Pattern
API routes use fire-and-forget async IIFE to send notifications without blocking the response:
```typescript
(async () => {
  try {
    // Look up relevant users, send notifications
    notifyTaskStatusChanged(chatId, title, eventId, status).catch(() => {});
  } catch { /* silent */ }
})();
```

### Notifications Sent
- **Task committed** → submitter + all admins
- **Task status changed** → submitter, committer, assignee (excluding the admin who changed it)
- **New note/report/update** → submitter, committer, assignee (excluding the author)
- **Voucher approved/rejected** → voucher submitter

### Domain Note
`tanhowa.in` returns 307 redirect to `www.tanhowa.in`. Telegram doesn't follow redirects, so always use `https://www.tanhowa.in/api/telegram/webhook` as the webhook URL.

## To-Do List / Task Management System

### Event ID Format
Every task gets a unique, human-readable Event ID auto-generated on creation:
- **Task:** `ET-001`, `ET-002`, ...
- **Sub-task:** `ET-001-01`, `ET-001-02`, ...
- **Sub-sub-task:** `ET-001-01-01` (max 2 levels of nesting enforced in API)

### Task Hierarchy
- `todos.parent_id` references `todos.id` for subtask relationships
- Top-level tasks have `parent_id = null`
- API enforces max depth of 2 (task → subtask → sub-subtask)

### Task Workflow
1. Member submits task → status `pending`
2. Admin sets Eisenhower priority (urgent/important), assigns to team/member, approves
3. Member **commits** to the task (PUT with `action: "commit"`) → sets `committed_by`, `committed_at`, optional `estimated_time` and `estimated_amount`, status becomes `in_progress`
4. Any member on the assigned team can add notes, upload deliverables, raise vouchers
5. On completion, member submits a report (as a note of type `report`)
6. If costs involved, member raises a voucher → Finance Team (admin) approves/rejects
7. Admin can **release commitment** (PUT with `action: "release_commitment"`) to reassign

### Eisenhower Matrix (Admin View)
2×2 grid based on `urgent` + `important` boolean flags:
- Do First (urgent + important, red)
- Schedule (not urgent + important, blue)
- Delegate (urgent + not important, amber)
- Eliminate (neither, gray)

### Task Detail View (Both Admin & Member)
Clicking a task opens detail view with 4 tabs:
- **Sub-Tasks** — nested tasks with their own Event IDs
- **Notes & Reports** — messages with types: `note`, `report`, `update`
- **Deliverables** — file uploads to `todo-attachments` Supabase Storage bucket
- **Vouchers/Bills** — cost tracking with Finance Team approval (pending/approved/rejected)

### Storage Bucket
`todo-attachments` — auto-created on first upload. Files stored as `todo-{todoId}/{userId}-{timestamp}.{ext}`.

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
