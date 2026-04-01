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
| Database | Supabase (PostgreSQL) + direct `postgres` package | SDK 2.98.x / 3.4.x |
| Auth | Custom JWT sessions via `jose` (no Supabase Auth) | 6.1.x |
| Email | ZeptoMail API (Zoho transactional email) | REST API |
| AI Chatbot | Google Gemini API (`gemini-2.5-flash`) | 0.24.x |
| UI Components | shadcn/ui (new-york style) + Radix UI primitives | — |
| CSS | Tailwind CSS v4 + `tw-animate-css` | 4.x |
| Charts | recharts (via shadcn `chart` component) | 2.x |
| Icons | lucide-react | 0.575.x |
| Toasts | sonner | 2.0.x |

## Key Directories

- `app/` — Next.js App Router: pages (`dashboard/`, `admin/`, `onboarding/`, `verify/`, `pending/`) and API routes (`api/`)
- `app/api/` — Server-side API routes. Template: `app/api/grievances/route.ts`
- `components/ui/` — shadcn/ui auto-generated components (**do not manually edit**)
- `components/` — Custom shared components: `metric-card.tsx` (stat cards with border accent + skeleton), `status-badge.tsx` (universal status badge for all statuses), `empty-state.tsx` (empty content placeholder), `admin-contacts.tsx` (shared admin contacts card), `section-error.tsx` (per-section error with retry), `chatbot-widget.tsx`, `error-boundary.tsx`
- `lib/` — Shared utilities: `supabase.ts`, `auth.ts`, `mail.ts`, `db.ts`, `telegram.ts`, `tn-districts.ts`, `error-logger.ts`, `gemini.ts`, `contributions.ts`, `chart-config.ts`
- `lib/__tests__/` — Vitest tests (auth, contributions, error-logger, tn-districts, utils)
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
| `users` | Members and admins | email, name, phone, occupation, posting_details (JSONB), social_links (JSONB), role, status, official_type (state/district/null), last_active_at, profile_nudge (JSONB), telegram_chat_id |
| `otp_codes` | Temporary OTP storage | email, code, expires_at, used |
| `announcements` | News/announcements | title, content, author_id, published (boolean) |
| `events` | Calendar events | title, description, date, location, image_url |
| `documents` | Uploaded files | title, file_url, file_type, description, category, approved |
| `grievances` | Suggestions (category="Suggestion") and grievances (others) | subject, description, category, status (pending/in_progress/resolved/rejected), admin_remarks, submitted_by |
| `subscriptions` | Member payment tracking | user_id, period, amount, due_date, status (pending/paid/overdue/hold/rejected), payment_method, transaction_id, payment_proof_url, remarks, paid_at, approved_by, approved_at, payment_group_id (UUID, links bulk/split payments) |
| `document_access` | Per-member document access | document_id, user_id (junction table for visibility="selected" documents) |
| `error_logs` | Application error tracking | type (api/client/auth), message, stack, path, method, status_code, user_id, metadata (JSONB) |
| `site_settings` | Key-value site config | key (unique), value |
| `teams` | Member teams | name, description, icon, sort_order, created_by |
| `team_members` | Team membership (junction) | team_id, user_id, role, added_by |
| `todos` | Tasks with Eisenhower Matrix | title, description, status, urgent, important, due_date, event_id, parent_id, submitted_by, assigned_to, assigned_team_id, committed_by, committed_at, estimated_time, estimated_amount, timebox_hours, admin_remarks |
| `todo_notes` | Task messages/reports | todo_id, user_id, content, type (note/report/update) |
| `todo_attachments` | Task deliverable files | todo_id, user_id, file_url, file_name, file_type |
| `todo_vouchers` | Task cost/bill tracking | todo_id, submitted_by, title, amount, receipt_url, status (pending/approved/rejected), approved_by, remarks |
| `todo_time_entries` | Team time logging against tasks | todo_id, user_id, hours, description, logged_at |
| `expense_vouchers` | Standalone expense claims (officials) | submitted_by, title, amount, invoice_number, vendor_name, expense_date, category, receipt_url, status, approved_by, remarks |
| `resolutions` | Member-proposed resolutions | title, description, category, status (draft/submitted/approved/rejected/voting_open/passed/failed), submitted_by, approved_by, votes_required, total_members |
| `resolution_votes` | Individual votes on resolutions | resolution_id, user_id (unique per resolution) |
| `contributions` | Auto-logged portal actions | user_id, action, description, estimated_minutes, metadata (JSONB) |

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
ZEPTOMAIL_TOKEN=                # ZeptoMail Send Mail Token (from ZeptoMail Agent → SMTP/API tab)
ZEPTOMAIL_FROM_EMAIL=           # Sender email (default: tanhowaadmin@tanhowa.in)
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
- **Images:** Unsplash via `next/image` with `fill` + `object-cover`. Remote patterns for `images.unsplash.com` and `*.supabase.co` (storage buckets) configured in `next.config.ts`
- **Background images:** Subtle horticulture photos at 3-6% opacity on dashboard, admin, verify, onboarding, and pending pages
- **Landing page:** Bento mosaic grid layout with horticulture domain images flanking a centered login card
- **No dark mode** — light theme only

### shadcn/ui components in use
`button`, `input`, `card`, `dialog`, `table`, `badge`, `tabs`, `avatar`, `dropdown-menu`, `separator`, `sheet`, `textarea`, `label`, `select`, `sonner`, `chart`

## Development Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build — always run before pushing to verify
npm run start    # Start production server
npm run lint     # ESLint
```

```bash
npm test         # Run tests once (vitest run)
npm run test:watch  # Watch mode
```

Tests live in `lib/__tests__/`. Mocks for `next/headers` and `@/lib/supabase` are set up in each test file. `JWT_SECRET` is configured in `vitest.config.ts`.

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

Uses **ZeptoMail API** (Zoho's transactional email service) via REST — no SMTP, no nodemailer dependency. All emails go through `sendZeptoMail()` which calls `https://api.zeptomail.in/v1.1/email` (India region — NOT `.com`) with the `ZEPTOMAIL_TOKEN` env var.

- `sendOTPEmail(to, otp)` — OTP delivery
- `sendSubscriptionApprovedEmail(to, memberName, period, amount)` — Payment approval confirmation
- `sendSubscriptionNotification(to, memberName, period, amount, message)` — Custom admin→member notification
- `sendVoucherStatusEmail(to, officialName, title, amount, status, remarks?)` — Expense voucher approve/reject notification
- `notifyAdminNewRegistration(memberName, memberEmail)` — Alert admins of pending registrations
- `notifyNewAnnouncement(title, content)` — Broadcast to all members
- `notifyPaymentVerified(memberName, period)` — Broadcast payment verification
- `notifyNewMemberRegistered(memberName)` — Broadcast new member welcome
- `notifyNewEvent(title, date, location?)` — Broadcast event notification
- `sendBroadcastEmail(subject, bodyHtml)` — Generic broadcast (BCC batched at 40 recipients per email)

**Flag:** `HOLD_MEMBER_EMAILS = true` disables all member-facing emails except OTP.

## Admin Auth Pattern

- Use `isAdmin(session)` helper which checks DB role (not JWT which may be stale) — returns true for both `admin` and `super_admin`
- Use `isSuperAdmin(session)` to check specifically for super_admin role
- `DEFAULT_ADMIN_EMAIL = "tanhowaadmin@tanhowa.in"` is auto-assigned `super_admin` role on login — never goes through onboarding, cannot be demoted or deleted
- Regular admins can be promoted/demoted by any admin; super_admin role is only auto-assigned to the default admin email
- Admin user actions: approve, reject, nudge (profile completion), change role

## Known Field Name Gotchas

- **User photo:** DB column is `photo_url`, not `avatar_url`. Always use `photo_url` in TypeScript interfaces and code that reads user records.
- **`GET /api/subscriptions?me=true`** — forces user-scoped results even for admins. The member dashboard always appends `?me=true`; the admin panel omits it to receive all members' data.

## Reports & Analytics (`/admin/reports`)

The reports page is organized into 5 tabs, each in its own component under `app/admin/reports/_components/`:

| Tab | Component | Data Source | Charts |
|-----|-----------|-------------|--------|
| Overview | `overview-tab.tsx` | `/api/reports/overview` | Stacked bar (collection by period), Task donut, Collection rate ring |
| Subscriptions | `subscriptions-tab.tsx` | `/api/reports/subscriptions` | District comparison horizontal bar |
| Expenses | `expenses-tab.tsx` | `/api/reports/expenses` | Category pie, Status bar |
| Contributions | `contributions-tab.tsx` | `/api/contributions?breakdown=true` | Monthly trend area, Action type pie + time bar |
| Members | `members-tab.tsx` | `/api/reports/members` | Registration trend area, District bar, Profile completion donut |

**Charts:** Use recharts via the shadcn `chart` component (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`). Brand colors are defined in `lib/chart-config.ts` — use `CHART_COLORS` for status colors and `CATEGORY_PALETTE` for category/district breakdowns.

**PDF export:** Uses `jspdf` + `jspdf-autotable` for client-side PDF export. Pattern: create landscape doc → header text → autoTable for district summary → autoTable for member details → color-coded status text. Theme color: `fillColor: [45, 106, 79]` (deep green).

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

## Suggestions & Grievances (Split)

Previously a single page, now split into two:
- **Suggestions** — `/dashboard/suggestions`, `/admin/suggestions` (category = "Suggestion")
- **Grievances** — `/dashboard/grievances`, `/admin/grievances` (category ≠ "Suggestion")

Both use the same `grievances` table and `/api/grievances` route. The API accepts `?type=suggestion|grievance` to filter. Sidebar shows Lightbulb icon for Suggestions, MessageSquareWarning for Grievances.

## Officials System

Users can be designated as **state** or **district** officials via `official_type` column on `users` table. District officials (DS/DJS) also have `role=admin` for admin panel access.

- `isAdminOrOfficial(session)` — returns true for admins + officials
- `getOfficialType(userId)` — returns "state", "district", or null
- `getOfficialInfo(userId)` — returns `{ role, official_type, district }` for district-scoped authorization
- Admin manages officials at `/admin/officials` (set/remove via `PUT /api/admin/users` with `action: "set-official"`)
- Officials directory visible to all members at `/dashboard/officials`
- `posting_details.official_designation` — "District Secretary" or "District Joint Secretary" (shown as blue/teal badges)
- District officials can verify subscription payments for members in their district at `/dashboard/verify-payments`

### District-Level Payment Verification

District Secretaries (DS) and District Joint Secretaries (DJS) can approve/reject subscription payments for members posted in their district. State officials see pending payments across all districts with DS/DJS contact info for follow-up.

- **API:** `GET /api/subscriptions/district-pending` — pending payments grouped by district
- **Page:** `/dashboard/verify-payments` — district-scoped verification UI
- **Authorization:** Server validates `member.posting_details.regular_district === official.district`

## Expense Vouchers (Officials Only)

Standalone expense claims not tied to tasks. Table: `expense_vouchers`.

**Fields:** title, amount, description, invoice_number, vendor_name, expense_date, category, receipt_url, status (pending/approved/rejected), remarks

**Categories:** Travel, Printing, Food & Refreshments, Stationery, Communication, Venue & Hall, Transport, Miscellaneous

- Officials submit at `/dashboard/vouchers` (sidebar hidden for non-officials)
- Admin reviews at `/admin/vouchers` — can also create on behalf of officials
- API: `/api/vouchers` (GET/POST/PUT/DELETE) — POST requires `isAdminOrOfficial()`

## Resolutions (Voting System)

Table: `resolutions` + `resolution_votes`. Members can propose resolutions that go through admin approval and member voting.

**Workflow:** Draft → Submitted → Approved (by admin) → Voting Open → Passed/Failed

- **Create:** Super Admin and State Officials only (`POST /api/resolutions`)
- **Vote:** All approved members can vote/unvote while voting is open
- **Quorum:** `votes_required = floor(total_members / 2) + 1` — recalculated when voting opens
- **Close voting:** Admin closes voting → auto-determines passed/failed based on vote count vs required

**Statuses:** `draft`, `submitted`, `approved`, `rejected`, `voting_open`, `passed`, `failed`

**Access control:**
- Members see `voting_open`, `passed`, `failed` resolutions only
- Admins and officials see all statuses
- Cannot delete resolutions that have entered voting

## Contributions Tracking

Table: `contributions`. Auto-logs portal actions with estimated time for each member.

- **Tracked actions:** Payment verification, member approval, task creation/updates, announcements, events, documents, grievances, vouchers, profile updates (21 action types)
- **Member page:** `/dashboard/contributions` — personal activity feed grouped by date, award badges (Century, Half Century, Rising Star, Dedicated, All-Rounder)
- **Admin page:** `/admin/contributions` — leaderboard ranked by total contribution time
- **API:** `/api/contributions` (GET) — `?me=true` for own, `?period=week|month|all` filter, `?breakdown=true` for action-type aggregation + monthly trend (admin only)
- **Lib:** `logContribution(userId, action, description?, metadata?)` from `lib/contributions.ts` — fire-and-forget

## Special Subscriptions

Beyond yearly subscriptions (period = "2025", "2026"), admins can create special subscriptions:
- **Legal case fund:** e.g., "For UATT 2.0 Case 2025" at Rs.3000 — mandatory for all members
- **Voluntary contributions:** Period starts with "Volunteer" (e.g., "Volunteer Special Contribution 2026 (VSC 2026)") — members can set their own amount

Admin creates via "Special Subscription" button on `/admin/subscriptions`. District report column headers auto-shorten special periods (strips "For " prefix and " Case YYYY" suffix).

## Task Management System

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
1. Member or admin submits task → status `pending`
2. Admin sets Eisenhower priority (urgent/important), assigns to team/member, approves
3. Member **commits** to the task (PUT with `action: "commit"`) → sets `committed_by`, `committed_at`, `estimated_time`, `estimated_amount`, and optional `timebox_hours`, status becomes `in_progress`
4. Any member on the assigned team can add notes, upload deliverables, raise vouchers, and **log time entries**
5. On completion, member submits a report (as a note of type `report`)
6. If costs involved, member raises a voucher → Finance Team (admin) approves/rejects
7. Admin can **release commitment** (PUT with `action: "release_commitment"`) to reassign
8. Admin can **inline edit** task title by clicking it in the detail view
9. Member can **request completion review** (PUT with `action: "request_review"`) → status becomes `review` (purple)
10. Admin can **bulk update statuses** (PUT with `action: "bulk_status"`, `ids[]`, `status`)
11. Admin can **clone a task** (PUT with `action: "clone"`) — duplicates task with subtasks, generates new Event IDs

### Eisenhower Matrix (Admin View)
2×2 grid based on `urgent` + `important` boolean flags:
- Do First (urgent + important, red)
- Schedule (not urgent + important, blue)
- Delegate (urgent + not important, amber)
- Eliminate (neither, gray)

### Timeboxing & Team Time Tracking

Tasks can have a `timebox_hours` (numeric) set at commitment or by admin override. Team members log hours via the **Time Log** tab using `todo_time_entries` table.

- **Progress bar:** green (<75%), amber (75-100%), red (>100% = overdue)
- **API:** `/api/todos/time-entries` (GET/POST/DELETE) — authorized for assignee, submitter, team members, or admins
- **No auto-status changes** — timeboxing is advisory only
- Admin can adjust timebox via inline input in the task detail view

### Event ID Generation

Uses global `LIKE` query to find max existing suffix — prevents duplicate `event_id` unique constraint violations when tasks are deleted and re-created.

### Task Detail View (Both Admin & Member)
Clicking a task opens detail view with 5 tabs:
- **Sub-Tasks** — nested tasks with their own Event IDs + progress bar (completed/total)
- **Time Log** — log hours, view entries by contributor, timebox progress bar
- **Notes & Reports** — messages with types: `note`, `report`, `update`
- **Deliverables** — file uploads to `todo-attachments` Supabase Storage bucket
- **Vouchers/Bills** — cost tracking with Finance Team approval (pending/approved/rejected)

### Storage Bucket
`todo-attachments` — auto-created on first upload. Files stored as `todo-{todoId}/{userId}-{timestamp}.{ext}`.

## Location Sharing & Nearby Members

Opt-in location sharing via Browser Geolocation API. Members toggle sharing on/off from their profile page. Location is silently updated on app open if sharing is enabled.

- **API:** `PUT /api/location` (update coords / toggle sharing), `GET /api/location?lat=X&lng=Y&radius=25` (nearby search)
- **Pages:** `/dashboard/nearby` and `/admin/nearby` — find nearby members using Haversine formula
- **Storage:** `users.location` JSONB (`{ lat, lng, sharing, updated_at }`)
- **Privacy:** One-time prompt banner on first login (dismissable via localStorage), no tracking without consent

## Payment Group Linking

Bulk/split payments are linked via `subscriptions.payment_group_id` (UUID). When admin verifies related subscriptions together (same member multiple periods, or multiple members same period), all get the same group ID. Admin subscriptions page shows "Linked Payment (N total)" indicator with grouped member names.

## In-App Notifications

`GET /api/notifications` returns counts of items needing attention: new announcements since `last_active_at`, pending/overdue subscriptions, and active tasks assigned to the user. Dashboard layout fetches this on mount and shows a bell icon with total count badge. Clicking opens a dialog with categorized links.

## Shared UI Components

When building new pages, use these instead of duplicating patterns:
- `<MetricCard>` — stat card with `border-l-4` accent, skeleton loading state. Props: `label`, `value`, `icon`, `borderColor`, `loading`.
- `<StatusBadge>` — universal badge for any status string (paid, pending, overdue, in_progress, etc.). Handles color mapping internally.
- `<EmptyState>` — consistent "nothing here" placeholder with icon.
- `<AdminContacts>` — admin contacts list card (used in both member and admin dashboards).
- `<SectionError>` — per-section error card with retry button. Use when fetching per-section independently.

## Loading & Error Patterns

- Each major route has a `loading.tsx` file with skeleton loaders matching the page layout
- Dashboard fetches sections independently so one failure doesn't block others — use `SectionError` for failed sections
- Primary data fetches show `toast.error()` on failure; supplementary fetches (tickers, settings) fail silently

## PWA & Service Worker

`public/sw.js` (v3) implements:
- **API cache** (`tanhowa-api-v1`): announcements and events responses cached for offline viewing
- **Static cache** (`tanhowa-v3`): images, fonts, icons (cache-first)
- **Pages**: network-first, falls back to cached version or `/offline` page
- Bump `CACHE_NAME` version when changing caching behavior

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

Always include: session check, getServiceClient(), proper error handling with `logError()`, JSON responses, and `logContribution()` calls for trackable actions.
