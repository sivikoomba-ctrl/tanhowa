# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TANHOWA (Tamil Nadu Horticultural Officers Welfare Association) is a member portal for horticultural officers in Tamil Nadu, India. Members sign up via email OTP, complete their profile, get admin approval, then access announcements, events, documents, a member directory, subscriptions/payments, and grievance submission. Admins manage all content and users through a separate admin panel.

**Live URL:** https://tanhowa.in
**Deployment:** Vercel (auto-deploys from `main` branch)
**Domain DNS:** Cloudflare

## Contents

**Read first:** [Known Gotchas](#known-gotchas) · [API Route Patterns](#api-route-patterns) · [Common Tasks](#common-tasks)

**Setup & conventions:** [Tech Stack](#tech-stack) · [Key Directories](#key-directories) · [Development Commands](#development-commands) · [Git & Deployment](#git--deployment) · [Environment Variables](#environment-variables) · [UI & Styling Conventions](#ui--styling-conventions) · [Shared UI Components](#shared-ui-components) · [Loading & Error Patterns](#loading--error-patterns) · [UI Labels](#ui-labels) · [Cross-Component Communication](#cross-component-communication)

**Core architecture:** [Authentication Flow](#authentication-flow) · [Admin Auth Pattern](#admin-auth-pattern) · [Database](#database) · [Email System](#email-system-libmailts) · [Telegram Bot](#telegram-bot-integration) · [i18n](#internationalization-i18n) · [Content Auto-Translation](#content-auto-translation-enta) · [PWA & Service Worker](#pwa--service-worker) · [Cron Jobs](#cron-jobs) · [Activity Tracking](#activity-tracking) · [Audit Log](#audit-log) · [In-App Notifications](#in-app-notifications) · [Push Notifications](#push-notifications) · [Razorpay](#razorpay-integration) · [Global Search](#global-search) · [Notification Preferences](#notification-preferences)

**AI:** [AI Tools](#ai-tools-dashboardai-tools) · [Chatbot / Query Engine](#chatbot--query-engine) · [AI Payment Proof Extraction](#ai-powered-payment-proof-extraction--verification) · [Daily Greetings](#daily-greetings-libdaily-greetingsts) · [Auto Gender Detection](#auto-gender-detection)

**Member features:** [Member Dashboard Widgets](#member-dashboard-home-widgets) · [Suggestions & Grievances](#suggestions--grievances-split) · [Polls](#polls) · [Wishlist / IDEA BOARD](#wishlist--idea-board) · [Logo Vote](#logo-vote) · [Elections](#elections-posts-nominations--polling) · [Direct Messages](#direct-messages) · [Group Chat](#group-chat) · [Calendar & iCal](#calendar--ical-export) · [Event RSVP](#event-rsvp) · [Announcement Read Tracking](#announcement-read-tracking) · [Achievements / Badges](#achievements--badges) · [Contributions Tracking](#contributions-tracking) · [Member Directory Sorting](#member-directory-sorting) · [Digital Member ID Card](#digital-member-id-card) · [Profile Completeness](#profile-completeness) · [Mandatory Profile Completion](#mandatory-profile-completion) · [Location Sharing](#location-sharing--nearby-members) · [Trainings System](#trainings-system) · [TANHOWA History Timeline](#tanhowa-history-timeline) · [Member Feedback Loop](#member-feedback-loop--ai-pulse-super-admin-only) · [Service Requests](#service-requests) · [Volunteer Invites](#volunteer-invites)

**Subscriptions / Finance / Tasks:** [Subscription Auto-Sync](#subscription-auto-sync) · [Special Subscriptions](#special-subscriptions) · [Payment Group Linking](#payment-group-linking) · [Payment Status Transparency](#payment-status-transparency) · [Finance (Bank Reconciliation)](#finance-bank-reconciliation) · [Expense Vouchers](#expense-vouchers-officials-only) · [Task Management](#task-management-system) · [e-Resolutions](#e-resolutions-voting-system) · [Reports & Analytics](#reports--analytics-adminreports) · [District Benchmark](#district-benchmark) · [Engagement Analytics](#engagement-analytics)

**Roles & private spaces:** [Officials System](#officials-system) · [Team Lead & Legal Advisor](#team-lead-role--legal-advisor) · [Private Teams & Project H](#private-teams--project-h) · [Letters & Forms](#letters--forms-superadminonly) · [Why-Ministry Position Paper](#why-ministry-position-paper-super-admin-only) · [Owner-Only Admin Tools](#owner-only-admin-tools) · [Account Suspension](#account-suspension) · [Content Scheduling](#content-scheduling)

---

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
| Validation | zod | 4.x |
| Push | web-push (VAPID) | 3.6.x |
| Spreadsheets | xlsx (SheetJS) | 0.18.x |
| PDF (client) | jspdf + jspdf-autotable | 4.x / 5.x |

## Key Directories

- `app/` — Next.js App Router: pages (`dashboard/`, `admin/`, `onboarding/`, `verify/`, `pending/`) and API routes (`api/`)
- `app/api/` — Server-side API routes. Template: `app/api/grievances/route.ts`
- `components/ui/` — shadcn/ui auto-generated components (**do not manually edit**)
- `components/` — Custom shared components: `metric-card.tsx` (stat cards with border accent + skeleton), `status-badge.tsx` (universal status badge for all statuses), `empty-state.tsx` (empty content placeholder), `admin-contacts.tsx` (shared admin contacts card), `section-error.tsx` (per-section error with retry), `chatbot-widget.tsx`, `error-boundary.tsx`, `date-dropdowns.tsx` (responsive Day/Month/Year native selects with mobile abbreviations), `photo-crop-dialog.tsx` (image cropping for profile photos), `global-search.tsx` (cross-entity search UI), `payment-proof-preview-dialog.tsx`, `analytics-tracker.tsx`, `push-manager.tsx`, `finance-otp-gate.tsx`, `settings-popover.tsx` (language + font size + theme controls), `connect-telegram-banner.tsx` (dismissible CTA on `/dashboard` linking approved members to `@tanhowa_task_bot` with email pre-filled via `/start <email>` deeplink — hides if `telegram_chat_id` is set or user dismissed via `tanhowa-tg-banner-dismissed` localStorage key), `feedback-widget.tsx` (floating feedback button on every dashboard page; 1-5 star + comment + 7-day per-device cooldown), `re-engagement-modal.tsx` (one-shot "what kept you away" modal for members returning after 14+ day inactivity)
- `lib/` — Shared utilities: `supabase.ts`, `auth.ts`, `mail.ts`, `db.ts`, `telegram.ts`, `tn-districts.ts`, `error-logger.ts`, `gemini.ts`, `query-engine.ts`, `contributions.ts`, `chart-config.ts`, `payment-verification.ts`, `subscription-proofs.ts`, `audit.ts`, `audit-log.ts`, `razorpay.ts`, `rate-limit.ts`, `daily-greetings.ts`, `translate-content.ts`, `badges.ts`, `validation.ts`, `sms.ts`, `document-urls.ts`, `export-xlsx.ts`, `push.ts`, `api-perf.ts`, `request-ip.ts`, `utils.ts`, `feedback-token.ts` (30-day signed JWT for the inactive-nudge email's feedback link)
- `lib/i18n/` — Internationalization: `language-context.tsx` (React context + hooks), `translations.ts` (EN/TA dictionary), `index.ts` (barrel export)
- `lib/__tests__/` — Vitest tests (auth, contributions, error-logger, tn-districts, utils)
- `supabase/schema.sql` — Base database DDL (additional migrations documented below)
- `scripts/apply-sql.mjs` — One-shot helper that loads `.env.local` and applies a `supabase/*.sql` file via the existing `postgres` package + `DATABASE_URL`. Usage: `node scripts/apply-sql.mjs supabase/foo_schema.sql`. Avoids the web SQL-editor copy-paste step.

## Authentication Flow

1. User clicks "Continue with Google" on landing page (`/`)
2. `GET /api/auth/google` — redirects to Google OAuth consent screen (with CSRF state cookie)
3. Google redirects back to `GET /api/auth/google/callback` with authorization code
4. Callback exchanges code for tokens, fetches user info (email, name, picture), creates or finds user, sets JWT cookie
5. New user (no name/phone/occupation) → redirect to `/onboarding` for profile completion
6. Pending user → redirect to `/pending`
7. Approved user → redirect to `/dashboard`
8. Admin users can access `/admin` (role check in admin layout)

**Facebook OAuth:** Same flow as Google — `GET /api/auth/facebook` redirects to Facebook OAuth, callback at `/api/auth/facebook/callback`. Requires `FACEBOOK_APP_ID` and `FACEBOOK_REDIRECT_URI` env vars. Profile photos served from `*.fbcdn.net` (allowed in `next.config.ts`).

**Email OTP fallback:** Users without Google/Facebook accounts can click "Continue with Email" on the landing page, which expands an email input → sends OTP via `/api/auth/send-otp` → verifies on `/verify` page via `/api/auth/verify-otp`.

**Mobile SMS OTP:** Phone-based login via `/api/auth/send-mobile-otp` (rate limited: 5/15min) and `/api/auth/verify-mobile-otp`. Uses 2Factor.in SMS API (`lib/sms.ts`). Hidden/pending DLT registration.

**Session payload:** `{ userId, email, role: "member"|"admin"|"super_admin", status: "pending"|"approved"|"rejected" }`

**Session implementation:** JWT signed with HS256, stored in httpOnly cookie named `session`, 7-day expiry. Uses `jose` library (not jsonwebtoken) for Edge compatibility. The signing key comes from `lib/jwt-secret.ts:getJwtSecretKey()` — single source used by `lib/auth.ts`, `middleware.ts`, `lib/feedback-token.ts`, and `/api/feedback`; it throws if `JWT_SECRET` is unset (no silent `"change-me"` fallback).

**Edge Runtime on OAuth start routes:** `app/api/auth/google/route.ts` and `app/api/auth/facebook/route.ts` (the *start* routes, not the callbacks) export `runtime = "edge"` to drop cold-start from 1-3s to ~50ms — sign-in feels instant. Do NOT move the callback routes to Edge — they need Node-only modules (Supabase service client, etc.). Only the redirect-to-provider step is Edge-eligible.

**Blocked email keywords (`isBlockedEmail` in `lib/auth.ts`):** Government/official emails are rejected at sign-up so members keep portal access through transfers. Domain blocks: `tn.gov.in`, `nic.in`, `gov.in`. Keyword blocks (designation/institution): `adh, ddh, jdh, addh, ho, dho, ado, jdo, coe, tanhoda`. **Matching is word-boundary, not substring** — `localPart.split(/[._\-+0-9]+/)` then `segments.includes(kw)` — so `adh.kannan`, `kannan-adh`, `adh1234`, `coe_tnj` all match while `madhuri` / `padhma` correctly don't. Super-admin emails (`SUPER_ADMIN_EMAILS`) are exempt. When adding a keyword, prefer one that is unambiguous as a standalone word — never a fragment that appears inside legitimate names.

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

## Known Gotchas

Read these before writing code that touches email, PDFs, audit logs, translations, or DB writes from Python.

- **User photo:** DB column is `photo_url`, not `avatar_url`. Always use `photo_url` in TypeScript interfaces and code that reads user records.
- **`GET /api/subscriptions?me=true`** — forces user-scoped results even for admins. The member dashboard always appends `?me=true`; the admin panel omits it to receive all members' data.
- **jsPDF does NOT support emoji/Unicode.** Only ASCII and standard latin characters work. Emoji renders as garbled text (e.g., "Ø<ß?"). Use plain text in all PDF generation (`jspdf` + `jspdf-autotable`). For Tamil PDFs, use `window.print()` with a print-only stylesheet (browser fonts handle Tamil).
- **Error Logs:** Both UI sidebar and API (`/api/error-logs`) are restricted to `super_admin` only. Regular admins cannot access error logs.
- **Two `logAudit` libraries exist** — use the correct one: `lib/audit.ts` takes 1 object arg `({ userId, action, targetType, targetId, details })`, while `lib/audit-log.ts` takes 5 positional args `(userId, action, targetType, targetId, details)`. Both write to the same `audit_logs` table.
- **ZeptoMail token in `ZEPTOMAIL_TOKEN` must be the BARE key — NO `Zoho-enczapikey ` prefix.** All call sites prepend the prefix themselves (`Authorization: \`Zoho-enczapikey ${token}\``). Including the prefix in the env var causes a double prefix → ZeptoMail returns HTTP 500 silently → API accepts but never delivers. Caused the 2026-05-02 incident where OTPs vanished but birthday-cron emails still went out (only the daily-greetings code path used to omit the prefix in code, which masked the bug for that one path until it was fixed).
- **ZeptoMail BCC blasts trigger Gmail's `4.7.28` domain rate-limit.** Sending one email with 30+ BCC recipients (the old `sendBroadcastEmail` and `sendBcc` pattern) makes Gmail flag the entire `tanhowa.in` domain as bulk/spam and rate-limit ALL outbound mail — including transactional OTPs — for several hours. Always send broadcasts as one-to-one with throttling (~250ms between sends). Both `lib/mail.ts:sendBroadcastEmail` and `lib/daily-greetings.ts:sendIndividually` now do this; never re-introduce BCC for member-wide sends.
- **PostgREST direct writes bypass `translateContent()`** — the Python tools (which use `requests` against PostgREST because `supabase-py` rejects the new `sb_secret_*` key format) do NOT trigger EN→TA auto-translation. Backfill scripts must call Gemini themselves and upsert into `content_translations`.
- **API edits re-translate and overwrite hand-cached translations** — if you manually upsert a Tamil translation and then someone hits PUT on the same announcement, `translateContent()` will re-run EN→TA via Gemini and overwrite your hand edit. No "translation-locked" flag exists yet.
- **Inline component functions destroy textarea focus** — never define `const Foo = () => (...)` inside a page component (React remounts on every re-render). Use JSX variable assignments (`const fooJsx = (...)`) and reference with `{fooJsx}`. See group-chat for the canonical workaround.
- **A passing local build does NOT mean the Vercel deploy succeeded.** `git add <specific files>` can commit a file that imports helpers living in OTHER files you edited but didn't stage — local builds pass (working tree has everything) while every Vercel build fails on the missing exports, silently leaving production stale for days (happened 2026-06: `app/api/documents/route.ts` was committed importing from an uncommitted `lib/document-urls.ts`; all deploys failed until `8d8fc7d`). After pushing, verify with `npx vercel ls` (latest URL first) + `npx vercel inspect <url>` (status should be `● Ready`); get failure logs with `npx vercel inspect <url> --logs` (run via bash — PowerShell mangles the output). Also check `git status` for modified files your staged commit depends on.
- **Vercel runs serverless in UTC — always compute "today" in IST.** Naive `new Date().getMonth()` / `getDate()` / `getFullYear()` returns UTC calendar components, which lag IST by 5.5 hours every night. Members hitting the dashboard between midnight IST and 05:30 IST see yesterday's date for any "today" comparison (DOB, event_date, scheduled_at). IST has no DST, so a fixed +5:30 shift is reliable: `const ist = new Date(Date.now() + 5.5 * 3600 * 1000)` then read `ist.getUTCFullYear()` / `getUTCMonth()` / `getUTCDate()`. Anchor day-count math on `Date.UTC(year, month, date)` for both today and target so subtraction stays in the same frame. Crons firing at 01:30+ UTC don't trip this because by 07:00 IST both clocks agree on the date. Fixed pattern in `app/api/users/birthdays/route.ts` (commit `1a74a0f`); apply to any new "today" comparison.

## Database

**Provider:** Supabase PostgreSQL
**Base schema:** `supabase/schema.sql`

### Tables

One-line index. For column-level detail, jump to the matching feature section below.

| Table | Purpose |
|-------|---------|
| `users` | Members and admins (see Auth + Mandatory Profile Completion) |
| `otp_codes` | Temporary OTP storage |
| `announcements` | News/announcements |
| `events` | Calendar events |
| `documents` | Uploaded files (`visibility` = "all" / "selected") |
| `grievances` | Suggestions, service requests, and grievances split by category; `ticket_no` + `district` snapshot columns (see Suggestions, Grievances & Service Requests) |
| `ticket_counters` | Atomic per-prefix-per-year counters for GRV/SUG/SRQ ticket numbers |
| `admin_document_folders` | Folders for the owner-only Document Vault; `admin_documents.folder_id` FK (ON DELETE SET NULL → Unfiled) |
| `subscriptions` | Member payment tracking (see Payment Group Linking + Special Subscriptions) |
| `document_access` | Per-member/per-team document access (junction rows carry `user_id` or `team_id`; used by `visibility="specific"` and `visibility="team"` — both the Add Document and Manage Access dialogs support teams) |
| `error_logs` | Application error tracking |
| `site_settings` | Key-value site config (also holds atomic-claim cron locks) |
| `teams` / `team_members` | Member teams (see Team Lead Role) |
| `todos` / `todo_notes` / `todo_attachments` / `todo_vouchers` / `todo_time_entries` | Task management (see Task Management System) |
| `expense_vouchers` | Standalone expense claims for officials (see Expense Vouchers) |
| `finance_entries` | Manual ledger debits — cheques issued, with lifecycle status (see Finance) |
| `resolutions` / `resolution_votes` | e-Resolutions voting (see e-Resolutions) |
| `contributions` | Auto-logged portal actions (see Contributions Tracking) |
| `audit_logs` | Admin action audit trail |
| `notification_prefs` | Per-user notification settings |
| `polls` / `poll_votes` | Quick opinion polls (see Polls) |
| `faqs` | Admin-managed FAQ entries |
| `food_vendors` / `food_items` / `food_orders` / `food_order_items` | Food order system |
| `content_translations` | Cached auto-translations (see Content Auto-Translation) |
| `wishlist_ideas` / `wishlist_upvotes` | Community ideas board (see Wishlist / Ideas Board) |
| `trainings` / `training_enrollments` / `trainer_invites` / `training_materials` / `training_material_access` | Trainings (see Trainings System) |
| `messages` | Direct member-to-member messages |
| `chat_channels` / `chat_channel_members` / `chat_messages` / `chat_message_mentions` / `chat_message_reactions` | Group chat (see Group Chat) |
| `push_subscriptions` | Web Push notification subscriptions |
| `analytics_events` | Engagement tracking events |
| `achievements` | Earned member badges (see Achievements / Badges) |
| `event_rsvps` | Event RSVP tracking |
| `announcement_reads` | Tracks which members read announcements |
| `history_entries` | TANHOWA timeline milestones (super-admin curated) |
| `feedback` / `feedback_prompts_shown` | Member feedback loop (see Member Feedback Loop) |
| `logo_concepts` / `logo_votes` / `logo_comments` | New-logo selection vote (see Logo Vote) |
| `election_posts` / `election_candidates` / `election_votes` | Office-bearer elections: district-scoped posts, nominations, secret-ballot voting (see Elections) |
| `admin_tasks` | Owner-only private task list (see Owner-Only Admin Tools) |
| `admin_documents` | Owner-only private document vault (see Owner-Only Admin Tools) |

**Additional user columns:**
- `office_address` (TEXT), `last_active_at` (TIMESTAMPTZ, updated on every `/api/users/me` GET), `telegram_chat_id` (TEXT), `telegram_last_cmd_msg_id` (BIGINT — id of the bot's last command-response message; used by `sendTelegramMessageReplace` to delete the prior reply so command replies stack-replace instead of accumulating)
- `profile_nudge` (JSONB: `{ fields, message, requested_at, requested_by }`) — admin nudge for profile completion
- `posting_details` JSONB fields: `regular_district`, `regular_block`, `regular_farm` (optional — TN horticulture facility name, "Farms (if applicable)" dropdown — sourced from `TN_HORTICULTURE_FARMS_DATA` in `lib/tn-districts.ts`, grouped into 8 types: `SHF` / `Park` / `SCN` / `CCC` / `CoE` / `HRTC` / `QCLab` / `UnderDev`), `special_duty_district`, `special_duty_block`, `special_duty_place`, `special_designation` ("HO Tech (State Scheme)" / "HO Tech (GOI)" / "Farm Manager"), `special_farm` (TN horticulture farm name, shown when Farm Manager selected), `deputed_district`, `deputed_block`. When adding new subfields, update the `PostingDetails` interface and `emptyPosting` constant in both `app/onboarding/page.tsx` and `app/dashboard/profile/page.tsx` — no DB migration needed (JSONB).
- `social_links` JSONB also stores: `title`, `gender`, `qualification`, `specialisation`, `skill_sets` (object), `languages` (object), `experience` (array of `{ institution, from, to, designation }`), `current_interest_area`, `date_of_joining`

**Document columns:** `visibility` (TEXT, "all" or "selected") controls who can see each document.

### Migrations beyond base schema

The base `schema.sql` only covers `users`, `otp_codes`, `announcements`, `events`, `documents`, and `site_settings`. Additional tables (`grievances`, `error_logs`, `subscriptions`, `document_access`, `teams`, `team_members`, `todos`, `todo_notes`, `todo_attachments`, `todo_vouchers`, `audit_logs`, `notification_prefs`, `polls`, `poll_votes`, `faqs`, `food_vendors`, `food_items`, `food_orders`, `food_order_items`, `trainings`, `training_enrollments`, `trainer_invites`, `training_materials`, `training_material_access`, `messages`, `chat_channels`, `chat_channel_members`, `chat_messages`, `chat_message_mentions`, `chat_message_reactions`, `push_subscriptions`, `analytics_events`, `achievements`, `event_rsvps`, `announcement_reads`) and column additions (`posting_details`, `office_address`, `last_active_at`, `profile_nudge`, `approved_by/at` on subscriptions, `visibility` on documents, `priority` on grievances, `paid_amount` on subscriptions, `scheduled_at` on announcements/events) were applied separately via the Supabase SQL editor. SQL files: `supabase/faq_schema.sql`, `supabase/food_orders_schema.sql`, `supabase/trainings_schema.sql`, `supabase/messages_schema.sql`, `supabase/group_chat_schema.sql`, `supabase/group_chat_stage2_schema.sql`, `supabase/content_scheduling_schema.sql`, `supabase/analytics_schema.sql`, `supabase/history_schema.sql`, `supabase/feedback_schema.sql`, `supabase/logo_vote_schema.sql`, `supabase/telegram_last_cmd_msg.sql` (adds `users.telegram_last_cmd_msg_id`), `supabase/voucher_payment_proof_schema.sql` (adds `payment_proof_url`, `payment_method`, `payment_transaction_id`, `payment_date`, `paid_to` to `expense_vouchers`). See the Tables section above for current schema.

**Applying SQL files:** Use `node scripts/apply-sql.mjs <path-to-file.sql>` from `tanhowa/`. The script loads `.env.local`, connects via `DATABASE_URL`, runs the file, and reports success or failure. Beats copy-pasting into the web SQL editor each time. Idempotent files (`CREATE TABLE IF NOT EXISTS`) can be re-applied safely.

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
FACEBOOK_APP_ID=                # Facebook OAuth app ID (from Meta Developer Console)
FACEBOOK_REDIRECT_URI=          # Facebook OAuth callback URL (e.g. https://tanhowa.in/api/auth/facebook/callback)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # VAPID public key for Web Push notifications
VAPID_PRIVATE_KEY=              # VAPID private key for Web Push notifications
RAZORPAY_KEY_ID=                # Razorpay API key ID (online payments)
RAZORPAY_KEY_SECRET=            # Razorpay API key secret
FACEBOOK_APP_SECRET=            # Facebook OAuth app secret (token exchange in callback)
CRON_SECRET=                    # Bearer token for Vercel Cron job authorization
TELEGRAM_WEBHOOK_SECRET=        # Secret token to verify incoming Telegram webhook updates
TWOFACTOR_API_KEY=              # 2Factor.in API key for SMS OTP (lib/sms.ts)
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

### Card action button layout

Action buttons on cards (admin and member pages) must go **below** the content, not in a side column. The `flex items-start justify-between` + `flex flex-col shrink-0` side-column pattern squeezes content to a few characters wide on narrow screens.

Correct pattern:
```tsx
<div>
  {/* content — full width */}
  <div className="flex items-start gap-3">
    {/* avatar/icon */}
    <div className="flex-1 min-w-0">...</div>
  </div>
  {/* buttons — below content, wrap naturally */}
  <div className="flex flex-wrap gap-2 mt-3">
    <Button>Action 1</Button>
    <Button>Action 2</Button>
  </div>
</div>
```

Never use `shrink-0` on a button container next to flexible content. Applied across `admin/subscriptions`, `admin/resolutions`, `dashboard/subscriptions`.

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
npx vitest run lib/__tests__/auth.test.ts  # Run a single test file
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
- `sendPaymentRejectionAlertEmail(to, officialName, memberName, period, amount, rejectedBy, remarks?)` — Payment rejection alert to DS/DJS who originally approved (bypasses HOLD flag)
- `sendBroadcastEmail(subject, bodyHtml)` — Generic broadcast (BCC batched at 40 recipients per email)

**Flag:** `HOLD_MEMBER_EMAILS = true` disables all member-facing emails except OTP, receipts, and admin alerts.

**Admin registration alerts:** Limited to 3 hardcoded recipients (`tanhowaadmin@tanhowa.in`, `kannanhorts94@gmail.com`, `dhanarj23@gmail.com`) to prevent email floods.

## Admin Auth Pattern

- Use `isAdmin(session)` helper which checks DB role (not JWT which may be stale) — returns true for both `admin` and `super_admin`
- Use `isSuperAdmin(session)` to check specifically for super_admin role
- `DEFAULT_ADMIN_EMAIL = "tanhowaadmin@tanhowa.in"` is auto-assigned `super_admin` role on login — never goes through onboarding, cannot be demoted or deleted
- Regular admins can be promoted/demoted by any admin; super_admin role is only auto-assigned to the default admin email
- Admin user actions: approve, reject, nudge (profile completion), change role

## Daily Greetings (`lib/daily-greetings.ts`)

Birthday + festival greetings system. Triggered by `/api/cron/daily-greetings` (Vercel cron at 01:30 UTC — see the **Cron Jobs** section below for the full schedule + the lambda-killed fire-and-forget bug that drove the move from `/api/users/me` to a dedicated cron). Uses the atomic-claim lock pattern — `INSERT` into `site_settings` with key `daily_greetings_run_{YYYY-MM-DD}` so only one concurrent caller wins.

- **Birthday:** Finds members with matching DOB month/day, sends personalized email + Telegram + creates announcement (rich format: designation • block, district + per-member wish picked deterministically by `(hash * 31 + charCode)` from a 20-wish array)
- **Festival:** Checks 15+ Tamil Nadu/Indian festivals against today's date, sends broadcast email + Telegram + creates announcement (text-only by design — no per-person photo)
- **Birthday photos (2026-05-02):** All four birthday channels include the celebrant's photo (or initials fallback). Personal email gets a 96px circle at the top; broadcast email shows a 40px circle next to each name; Telegram personal DM uses `sendPhoto` with HTML caption (falls back to `sendMessage` when no/untrusted photo); the in-app announcement embeds `![Name](photo_url)` markdown which the dashboard renderer turns into an inline circular avatar. Trusted photo hosts: `*.supabase.co`, `*.fbcdn.net`, `*.googleusercontent.com`, `platform-lookaside.fbsbx.com` — same allowlist enforced in `lib/daily-greetings.ts:isTrustedPhotoUrl`, `tools/daily_greetings.py:is_trusted_photo_url`, and the announcement renderer's `isSafeImageUrl` in `app/dashboard/announcements/page.tsx`. Untrusted URLs are silently dropped.
- **Fallback:** Python tool `tools/daily_greetings.py` for manual/forced runs — shares the same atomic lock and the same rich birthday format including photos (synced 2026-05-02)
- **NOT fire-and-forget anymore:** previously called from `GET /api/users/me` on the first visitor each day, but Vercel killed the lambda mid-execution after the lock row was inserted — locking out the cron and skipping the day. Removed 2026-05-01. Errors now flow through `logError()` instead of silent catch.

## Auto Gender Detection

On profile save (`PUT /api/users/me`), `detectGender()` auto-detects gender from 130+ common Tamil/Indian female first names + suffix matching (LAKSHMI, DEVI, SELVI, MATHI, VALLI, AMMAL, RANI, PRIYA, NAYAKI). Also sets title (Mr./Mrs.) when not already set. Does not override existing gender.

## AI Tools (`/dashboard/ai-tools`)

7 agriculture-focused AI utilities for field officers, accessible from the dashboard sidebar (Sparkles icon).

| Tool | Component | API Route | Gemini Mode | Rate Limit |
|------|-----------|-----------|-------------|------------|
| Pest & Disease ID | `pest-identifier.tsx` | `/api/ai-tools/pest-identify` | Vision | 10/min |
| Crop Adviser | `crop-adviser.tsx` | `/api/ai-tools/crop-advice` | Text | 20/min |
| EN↔TA Translator | `translator.tsx` | `/api/ai-tools/translate` | Text | 20/min |
| OCR | `ocr-tool.tsx` | `/api/ai-tools/ocr` | Vision | 10/min |
| Voice Notes | `voice-notes.tsx` | — (browser only) | — | — |
| Weather Advisory | `weather-advisory.tsx` | `/api/ai-tools/weather-advisory` | Text | 10/min |
| Doc Summarize | — | `/api/ai-tools/doc-summarize` | Text | — |

- **Components:** `app/dashboard/ai-tools/_components/`
- **Rate limiting:** Shared `createRateLimiter()` from `lib/rate-limit.ts` (in-memory, per-IP)
- **Voice Notes** uses browser `SpeechRecognition` API (supports English `en-IN` and Tamil `ta-IN`), no backend needed
- **Weather Advisory** uses Open-Meteo API with hardcoded coordinates for all 38 Tamil Nadu districts, Gemini generates crop-specific advisory from weather data
- **Vision routes** accept FormData with image (10MB max), text routes accept JSON
- All API routes: session check → rate limit → Gemini call → `logContribution()` → response
- Contribution actions logged for all 5 tools

### AI Bookends on Tasks (Ship 3)

Two AI helpers at the start and end of a task lifecycle. Live at `/dashboard/todos`:

| Route | Purpose | Auth | Rate Limit |
|-------|---------|------|------------|
| `POST /api/todos/suggest-subtasks` | 3-5 subtask suggestions for a top-level task (rejects `parent_id != null`) | assignee / committer / team-member / admin | 10/min |
| `POST /api/todos/draft-report` | 2-3 paragraph first-person completion report from notes + time entries + vouchers | committer or admin only | 10/min |

- **Model:** `gemini-2.5-flash`. Strict JSON output prompt for suggestions; plain prose for draft (no markdown, no fabricated data).
- **UI:** amber Sparkles "AI Suggest" button in the Sub-Tasks tab; "AI Draft" button inside the completion-review dialog.
- **Inserts route through standard endpoints** (`/api/todos`, `/api/todos/notes`) so audit + event_id + Telegram notifications flow normally.

## Chatbot / Query Engine

AI-powered chatbot with live portal data access via Gemini function calling.

**Architecture:**
- `lib/gemini.ts` — `SYSTEM_PROMPT`, `QUERY_TOOLS` (13 FunctionDeclarationsTool definitions with SchemaType params), `getGemini()` singleton
- `lib/query-engine.ts` — `executeQuery()` dispatcher that maps function names to Supabase queries, 13 data-retrieval functions
- `app/api/chat/route.ts` — POST endpoint with function-calling loop (max 3 rounds), rate limited 20/min per IP
- `components/chatbot-widget.tsx` — Floating chat UI with 9 quick-query buttons, role-gated access (super_admin, state officials, whitelisted emails)

**13 Query Functions:**

| Function | Description |
|----------|-------------|
| `search_announcements` | Recent/search portal announcements |
| `search_events` | Upcoming/search events |
| `search_faqs` | FAQ knowledge base search |
| `search_members` | Member directory search |
| `search_documents` | Document library search |
| `search_trainings` | Training sessions search |
| `get_portal_stats` | Portal-wide statistics |
| `get_my_subscriptions` | Current user's payment status |
| `get_my_tasks` | Current user's assigned tasks |
| `search_resolutions` | Resolution search/status |
| `search_grievances` | Grievance/suggestion search |
| `get_my_achievements` | Current user's badges |
| `get_my_contributions` | Current user's activity log |

**How it works:**
1. User sends message → API builds chat history with system prompt
2. Gemini decides which query tools to call (if any)
3. `executeQuery()` runs Supabase queries, returns structured data
4. Gemini receives query results, generates natural language response
5. Loop repeats up to 3 rounds for multi-step queries

**User context:** Each query receives `{ userId, email, role }` — personal data queries (`get_my_*`) are scoped to the current user.

**Adding a new query function:**
1. Add FunctionDeclaration in `lib/gemini.ts` (QUERY_TOOLS array)
2. Add query implementation in `lib/query-engine.ts`
3. Add case to `executeQuery()` dispatcher in `query-engine.ts`

## UI Labels

- `super_admin` role displays as **"State-Admin"** in badges and UI
- District officials (`official_type=district`) display as **"District-Admin"**
- State-Admin approval remark: "Approved. - Name, Designation, TANHOWA."
- DS/DJS approval remark: "Provisionally approved. - Name, Designation, TANHOWA."

## Reports & Analytics (`/admin/reports`)

The reports page is organized into 6 tabs, each in its own component under `app/admin/reports/_components/`:

| Tab | Component | Data Source | Charts |
|-----|-----------|-------------|--------|
| Overview | `overview-tab.tsx` | `/api/reports/overview` | Stacked bar (collection by period), Task donut, Collection rate ring |
| Subscriptions | `subscriptions-tab.tsx` | `/api/reports/subscriptions` | District comparison horizontal bar |
| Expenses | `expenses-tab.tsx` | `/api/reports/expenses` | Category pie, Status bar |
| Contributions | `contributions-tab.tsx` | `/api/contributions?breakdown=true` | Monthly trend area, Action type pie + time bar |
| Members | `members-tab.tsx` | `/api/reports/members` | Registration trend area, District bar, Profile completion donut |
| Performance | `performance-tab.tsx` | `/api/reports/performance` | Team comparison bar, Task completion trend area. Period/team filters, ranked member table (top 3 gold/silver/bronze), PDF export |

**Charts:** Use recharts via the shadcn `chart` component (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`). Brand colors are defined in `lib/chart-config.ts` — use `CHART_COLORS` for status colors and `CATEGORY_PALETTE` for category/district breakdowns.

**PDF export:** Uses `jspdf` + `jspdf-autotable` for client-side PDF export. Pattern: create landscape doc → header text → autoTable for district summary → autoTable for member details → color-coded status text. Theme color: `fillColor: [45, 106, 79]` (deep green).

**Subscription receipts:** Both admin (`/admin/subscriptions`) and member (`/dashboard/subscriptions`) pages have `downloadReceipt()` using jsPDF. Receipts include a certification section ("Verified & Certified" with AI verification note + timestamp) and the slogan "Save a print, Save a Tree." in green.

## Subscription Auto-Sync

`GET /api/subscriptions?sync=true` (admin only) auto-creates missing subscription records for all approved members based on existing periods.

## AI-Powered Payment Proof Extraction & Verification

`POST /api/upload/payment-proof/extract-date` uses Gemini to extract date, time, transaction_id, payment_method, amount, paid_to, and paid_account from uploaded payment proof images. Available to all authenticated users (not admin-only).

**Payee verification:** The API checks extracted `paid_to` and `paid_account` against TANHOWA keywords (`"TAMILNADU THOTTAKALAI"`, `"THOTTAKALAI ALUVALARGAL"`, `"NALA SANGAM"`, `"TANHOWA"`, `"2486"`) and returns `is_tanhowa_payment` boolean. Admin subscription pages display green/red banners indicating whether payment went to TANHOWA account or appears to be person-to-person.

## Telegram Bot Integration

### Overview
A Telegram bot sends real-time notifications for task events. Users link their Telegram account by sending their registered email to the bot.

**Bot:** `@tanhowa_task_bot`

**Member-facing page:** `/dashboard/telegram` — permanent nav entry (Send icon, `nav.telegram` i18n key). Shows link status, benefits, and a `tg.*` command reference. Self-managed by the user; no admin equivalent.

**Key files:**
- `lib/telegram.ts` — `sendTelegramMessage()`, `sendTelegramMessageReplace()` (deletes the bot's previous command-reply for this chat before sending the new one — use for command responses, NOT for notifications/force-reply), `sendTelegramMessageWithKeyboard()`, `answerCallbackQuery()`, `sendForceReply()`, notification helpers (`notifyTaskAssigned`, `notifyTaskCommitted`, `notifyTaskStatusChanged`, `notifyVoucherAction`, `notifyNewNote`), `escapeHtml()`. Types: `InlineButton`, `InlineKeyboard`.
- `app/api/telegram/webhook/route.ts` — Webhook handler. Handles text commands, `callback_query` (inline keyboard taps), and `reply_to_message` (force_reply round-trips). Dispatches via `handleCommit`/`handleDone`/`handleBlocked`/`handleAddNote`/`handleEmailOtp`/`handleCallbackQuery`. Extend these instead of duplicating auth + event_id lookup.
  - **Event ID parsing is hyphen-optional** via `normalizeEventId()` — accepts `ET-022`, `ET022`, `E022`, `et 22`, etc. and canonicalises to `ET-022`. All command regexes use `(ET-?\d+(?:-\d+)*)` — keep this pattern when adding new commands; do not hard-require the hyphen.
  - **Examples in `/help` and the unknown-command fallback use real portal task IDs**, fetched per-chat via `getExampleEventId(supabase, chatId)` (member's own active task → portal-wide fallback → static `ET-001`). When extending help text, pass an example through `commandsHelp(exampleId)` / `helpDetailed(exampleId)` rather than hardcoding placeholders.
  - **`/mytasks` is strictly own-tasks only** (no team-membership branch) — same for the daily-briefing cron. Admins/super_admins do NOT see all members' tasks via Telegram; the bot is a personal interface.

**Text commands:** `/start [email]`, `/help`, `/status`, `/commit`, `/done`, `/blocked`, `/update`, `/report`

**Inline keyboard callbacks:** `done|blocked|update:ET-XXX` — sent from the daily-briefing cron's `[✅] [🚧] [📝] ET-XXX` buttons. `done` → marks complete. `blocked` / `update` → fires a `force_reply` prompt; the user's reply is matched against `"blocking ET-XXX <reason>"` / `"update for ET-XXX <text>"` and routed back through the standard handlers.

### Account Linking Flow
1. **Deeplink (preferred):** Connect Telegram banner on `/dashboard` opens `https://t.me/tanhowa_task_bot?start=<urlencoded-email>`. Webhook detects `/start <email>`, dispatches to `handleEmailOtp()`, OTP is sent — one-tap link.
2. **Manual:** User sends any email text to the bot
3. Webhook looks up email in `users` table
4. If found, stores `telegram_chat_id` on the user record
5. Future task notifications are sent to that chat ID

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
- **Payment rejected** → DS/DJS who originally approved the payment (via `notifyPaymentRejected`)

### Domain Note
`tanhowa.in` returns 307 redirect to `www.tanhowa.in`. Telegram doesn't follow redirects, so always use `https://www.tanhowa.in/api/telegram/webhook` as the webhook URL.

## Suggestions, Grievances & Service Requests (Shared Table)

Three features share the `grievances` table and `/api/grievances` route, split by category:
- **Suggestions** — `/dashboard/suggestions`, `/admin/suggestions` (category = "Suggestion")
- **Service Requests** — `/dashboard/service-requests`, `/admin/service-requests` (category in the 8-item service list)
- **Grievances** — `/dashboard/grievances`, `/admin/grievances` (every other category: Personal, District-All, District-Specific, Technical + legacy General/Administrative/Others)

**`lib/grievances.ts` is the single source of truth** for the category lists, `isGrievanceCategory()`, and `hasGrievanceAccess()`. The validation enum (`lib/validation.ts`), the route, and `reports/overview` all import it. The SQL trigger in `supabase/ticket_numbers.sql` mirrors the list — keep in sync when adding a category.

**Grievance access model** (suggestions/service-requests are plain admin-moderated):
- State officials + super_admin: see and work all grievances
- District admins (`official_type=district`): their district only, via the **`grievances.district` snapshot column** (set by DB trigger at insert from the submitter's `posting_details.regular_district`, so later profile edits don't move rows). No district set → API returns 403 "Set your district in your profile..."
- Members: own submissions only; the dashboard page shows an amber notice explaining who can see their grievances
- Single-row mutations go through `canActOnGrievance()` in the route (PUT and DELETE share it)

**API params:** `?type=suggestion|service-request|grievance`, `?status=`, `?mine=1` (always own-submissions — the three dashboard tracker pages pass it so officials don't see others' rows on their personal pages), `?lang=ta`.

**Ticket numbers:** `GRV-2026-0001` / `SUG-` / `SRQ-`, year-scoped (IST), assigned by a `BEFORE INSERT` trigger using the atomic `ticket_counters` table (`supabase/ticket_numbers.sql`, year fix in `supabase/grievance_district_fixes.sql`). Shown as a monospace badge on all six member/admin cards; submit toasts quote it.

## Officials System

Users can be designated as **state** or **district** officials via `official_type` column on `users` table. District officials (DS/DJS) also have `role=admin` for admin panel access.

- `isAdminOrOfficial(session)` — returns true for admins + officials
- `getOfficialType(userId)` — returns "state", "district", or null
- `getOfficialInfo(userId)` — returns `{ role, official_type, district }` for district-scoped authorization
- Admin manages officials at `/admin/officials` (set/remove via `PUT /api/admin/users` with `action: "set-official"`)
- Officials directory visible to all members at `/dashboard/officials`
- `posting_details.official_designation` — "District Secretary" or "District Joint Secretary" (shown as blue/teal badges)
- District officials can verify subscription payments for members in their district at `/admin/verify-payments`

### District-Level Payment Verification

District Secretaries (DS) and District Joint Secretaries (DJS) can approve/reject subscription payments for members posted in their district. State officials see pending payments across all districts with DS/DJS contact info for follow-up.

- **API:** `GET /api/subscriptions/district-pending` — pending payments grouped by district
- **Page:** `/admin/verify-payments` — district-scoped verification UI (moved from dashboard to admin panel)
- **Authorization:** Server validates `member.posting_details.regular_district === official.district`
- **Proof required:** Verify button is disabled until payment proof is uploaded. DS/DJS can upload proofs on behalf of members.
- **DS/DJS actions:** View Proof, Re-upload, Verify & Approve, Hold, Reject, Delete. Mark Overdue is admin-only.
- **Verification remark:** "Provisionally approved. [DS/DJS name], TANHOWA. (date)"
- **Admin filter:** Admin subscriptions page has a "DS/DJS Verified" status filter to find payments ready for final approval

## Expense Vouchers (Officials Only)

Standalone expense claims not tied to tasks. Table: `expense_vouchers`.

**Fields:** title, amount, description, invoice_number, vendor_name, expense_date, **expense_event** (free-text event the expense belongs to, `supabase/voucher_expense_event.sql`), category, receipt_url, status (pending/approved/rejected), remarks, **payment_proof_url, payment_method, payment_transaction_id, payment_date, paid_to** (schema: `supabase/voucher_payment_proof_schema.sql`)

**Categories:** Travel, Printing, Food & Refreshments, Stationery, Communication, Venue & Hall, Transport, Miscellaneous

- Officials submit at `/dashboard/vouchers` (sidebar hidden for non-officials)
- Admin reviews at `/admin/vouchers` — can also create on behalf of officials. The admin create dialog now has both scan buttons (previously had neither).
- API: `/api/vouchers` (GET/POST/PUT/DELETE) — POST requires `isAdminOrOfficial()`. GET resolves both `receipt_url` and `payment_proof_url` through `resolveDocumentUrl()` for signed-URL access.
- **AI Bill Scan:** "Scan Bill" button uploads receipt image to `/api/ai-tools/expense-ocr` (Gemini vision). Auto-fills vendor_name, amount, invoice_number, category, expense_date, description from extracted line items.
- **AI Payment Proof Scan:** "Scan Payment" button uploads UPI/bank screenshot to `/api/upload/payment-proof/extract-date` (the same Gemini extractor used by subscriptions). Auto-fills payment_method, payment_transaction_id, payment_date, paid_to. **Either bill or payment proof is sufficient — both are optional, and either can be attached without the other.** If the bill amount and payment amount differ by more than ₹0.5, a non-blocking amber mismatch warning appears. The scanned payment amount only populates `amount` when no bill amount has been scanned and the field is empty (never overwrites a bill-scanned amount).
- **Voucher PDF (admin):** includes Payment Method, Transaction ID, Payment Date, Paid To rows when present, alongside the existing bill fields. Generated via jspdf at `/admin/vouchers`.
- **Duplicate guards (POST, 409):** reused payment transaction ID (any submitter), same invoice number + vendor, or exact repeat (same submitter + title + amount + expense date). Rejected vouchers are excluded so a corrected resubmission works.
- **Field-level PUT authorization:** finance team + super admin can edit ALL content fields on any voucher (pencil edit dialog on the admin cards, works post-approval); submitters can edit content fields only on their own pending vouchers (pencil edit dialog on pending cards at `/dashboard/vouchers`) and can never change `receipt_url`/`payment_proof_url` (receipt-substitution fix).
- **Cheque settlement:** approved vouchers can be linked from a `finance_entries` cheque (see Finance section). Admin voucher cards show Settled/Unsettled badges; GET embeds `settlement: { cheque_no, status } | null`.

## e-Resolutions (Voting System)

Table: `resolutions` + `resolution_votes`. Members can propose resolutions that go through admin approval and member voting.

**Workflow:** Draft → Submitted → Approved (by admin) → Voting Open → Passed/Failed

- **Create:** Super Admin and State Officials only (`POST /api/resolutions`)
- **Vote:** All approved members can vote/unvote while voting is open
- **Quorum:** `votes_required = floor(total_members / 2) + 1` — recalculated when voting opens
- **Close voting:** Admin closes voting → auto-determines passed/failed based on vote count vs required
- **Resolution PDF:** Download button on passed/failed resolutions. Legal format with TANHOWA letterhead, resolution details table, full text, voter list (name, designation, district, vote date), legal certification, president's digital signature, date/time/place. API: `GET /api/resolutions?voters_for={id}` returns voter details.

**Statuses:** `draft`, `submitted`, `approved`, `rejected`, `voting_open`, `passed`, `failed`

**Access control:**
- Members see `voting_open`, `passed`, `failed` resolutions only
- Admins and officials see all statuses
- Cannot delete resolutions that have entered voting

## Polls

Tables: `polls` + `poll_votes`. Quick opinion polls for members.

- **Create:** Admins and officials (`isAdminOrOfficial`). 2-6 options, optional expiry date.
- **Vote:** All approved members can vote and change their vote while poll is active.
- **Member page:** `/dashboard/polls` — vote, see results after voting
- **Admin page:** `/admin/polls` — create, close/reopen, delete, view results with vote counts
- **API:** `/api/polls` (GET/POST/PUT/DELETE). PUT handles both voting (`poll_id`, `option_index`) and admin actions (`action: "close"|"reopen"`, `id`).
- **Statuses:** `active`, `closed`. Expired polls (past `expires_at`) auto-show results.

## Contributions Tracking

Table: `contributions`. Auto-logs portal actions with estimated time for each member.

- **Tracked actions:** Payment verification, member approval, task creation/updates, announcements, events, documents, grievances, vouchers, profile updates, document downloads (22 action types)
- **Member page:** `/dashboard/contributions` — personal activity feed grouped by date, award badges (Century, Half Century, Rising Star, Dedicated, All-Rounder)
- **Admin page:** `/admin/contributions` — leaderboard ranked by total contribution time
- **API:** `/api/contributions` (GET) — `?me=true` for own, `?period=week|month|all` filter, `?breakdown=true` for action-type aggregation + monthly trend (admin only). POST — client-side contribution logging (whitelisted actions: `document_downloaded`)
- **Lib:** `logContribution(userId, action, description?, metadata?)` from `lib/contributions.ts` — fire-and-forget

## Finance (Bank Reconciliation)

Financial ledger grouped by financial year (April-March). Credits are auto-derived from paid subscriptions; **debits are manual `finance_entries` rows** (first type: cheque issued).

- **Admin page:** `/admin/finance` — full ledger with member names, district/period/monthly summaries, filters, PDF/Excel export, **"Cheque Issued" button**
- **Member page:** `/dashboard/finance` — abstract summary only (totals, monthly collections with progress bars, by-period breakdown). No member names or transaction details.
- **API:** `GET /api/finance?year=2025-26` — role-based response:
  - Admins, state officials → full ledger (`abstract: false`) including debit rows
  - DS/DJS → district-scoped credits only (no association-level debits)
  - Regular members → summary only with `abstract: true` (+ `totalDebits`, `netBalance`)
- **Cheque entries** (`finance_entries` table, `supabase/finance_entries.sql`): entry_date, amount, cheque_no, payee, optional `voucher_id` FK (picker pre-fills amount/payee from an approved voucher), lifecycle status `issued → cleared | cancelled | bounced`. Cancelled/bounced rows stay in the ledger (struck-through) but stop reducing the balance. POST/PUT/DELETE on `/api/finance` are finance-team + super-admin only, audit-logged. Clicking a debit row opens the **manage dialog** — editable form (date/amount/cheque #/payee/remarks via PUT, validated server-side) + status buttons + delete.
- **Bulk entry via cheque page scan:** "Scan Cheque Page" button → `POST /api/finance/scan` (Gemini 2.5-flash, finance-gated, rate-limited) reads a cheque-book counterfoil/register page image and returns `{ entries: [...] }` (handles handwriting/Tamil, converts DD/MM dates to YYYY-MM-DD). The UI shows an editable review table, then `POST /api/finance` with `{ entries: [...] }` bulk-inserts — **cheque numbers that already exist are skipped** (response: `{ inserted, skipped }`).
- **Cheque Settlement tab** (`/admin/finance`, second tab): 1:1 cheque↔voucher matching on `finance_entries.voucher_id`. `GET /api/finance?matching=1` (finance-only, all-time) returns `{ unsettledVouchers, unlinkedCheques, matches }` — a voucher counts as settled only by an **active** (issued/cleared) cheque. Link/unlink via PUT `voucher_id`; both POST and PUT enforce one active cheque per voucher (409). Client-side suggestions: exact amount match, payee↔vendor/paid_to similarity = high confidence. Unlinked cheques sort by cheque number (numeric, no-number last). Each card has pencil edit buttons (same manage dialog) and a **PDF download** (unlinked cheques: cancelled/bounced greyed, total counts active only; unsettled vouchers: submitter/paid-to/event columns with total).
- **Running balance** = credits − active debits; response carries `totalCredits`, `totalDebits`, `netBalance`.
- **PDF export:** Landscape PDF with Credit/Debit/Balance columns (debit rows tinted red with status) + period & district summary tables (admin only)

## Special Subscriptions

Beyond yearly subscriptions (period = "2025", "2026"), admins can create special subscriptions:
- **Legal case fund:** e.g., "For UATT 2.0 Case 2025" at Rs.3000 — mandatory for all members
- **Voluntary contributions:** Period starts with "Volunteer" (e.g., "Volunteer Special Contribution 2026 (VSC 2026)") — members can set their own amount

Admin creates via "Special Subscription" button on `/admin/subscriptions`. District report column headers auto-shorten special periods (strips "For " prefix and " Case YYYY" suffix).

## Task Management System

### AI Task-to-Team Classification

Gemini-powered team assignment for tasks. API at `/api/todos/classify`:
- `action: "suggest"` — single task, returns team suggestion with confidence + reasoning (no DB write)
- `action: "bulk"` — classifies all unassigned tasks, applies assignments above 0.7 confidence threshold
- Teams fetched dynamically from DB — works with any team structure admin creates
- Batched at 20 tasks per Gemini call with 1.5s delay between batches
- Rate limited to 10/min via `createRateLimiter`
- UI: "AI Suggest" sparkles button on Create/Edit task dialogs, "AI Classify" bulk button on admin todos page header

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

### Overpaid Tracking

`subscriptions.paid_amount` tracks the actual amount paid (may differ from `amount` which is the subscription price). When `paid_amount > amount`, a "+Rs.X extra" badge appears on both admin and member subscription cards. `amount` is preserved for reporting accuracy.

### Auto-Approve Matching Payments

When one subscription is approved, the system auto-finds other pending subs with the same period that match by: (1) same transaction ID, (2) same payment proof URL, or (3) same DS/DJS provisional approval remark signature. All matches are auto-approved with the same verification details. The "Link other members" picker auto-expands when the payment amount covers multiple members.

### Finance Ledger Consolidation

Grouped payments (same `payment_group_id`) appear as single entries in the finance transaction ledger, matching actual bank transactions. Each consolidated entry shows the primary payer name with "(+N members)" suffix and has expandable detail rows showing individual member breakdowns. Period/district/month summaries still count individual subscriptions for accurate reporting.

## In-App Notifications

`GET /api/notifications` returns counts of items needing attention: new announcements since `last_active_at`, pending/overdue subscriptions, and active tasks assigned to the user. Dashboard layout fetches this on mount and shows a bell icon with total count badge. Clicking opens a dialog with categorized links.

## Member Dashboard Home Widgets

`/dashboard/page.tsx` is a stack of conditionally-rendered widget cards loaded in parallel by `loadData()`. Each widget hides when its data array is empty so the page never shows a half-loaded skeleton. Add new widgets to this same effect rather than spinning up a fresh fetch hook.

| Widget | Data source | Notes |
|--------|-------------|-------|
| Today's Focus | `GET /api/todos/today` | Top 3 active tasks for the user. Empty-state copy when none. |
| Quick Poll | `GET /api/polls` | Picks the first poll where `status === "active"` and `expires_at > now`. Inline vote with optimistic update; results revealed only after the user votes. |
| Activity Feed | `GET /api/contributions?feed=true&limit=8` | Cross-member portal-wide recent actions with avatars + relative time (`timeAgo()`). |
| Top Contributors | `GET /api/contributions?period=month` | First 3 get gold/silver/bronze emoji prefixes. |
| Upcoming Birthdays | `/api/birthdays/upcoming` | Today highlighted in pink. |
| Connect Telegram banner | `<ConnectTelegramBanner>` | Self-hides when `telegram_chat_id` is set or the user already dismissed via localStorage. |

`/dashboard/activity` is the deep-dive companion page (separate from the home feed): per-user contribution analytics — current streak, longest streak, week/month totals, top action types, badge progress. Sources `/api/contributions?me=true&period=all` and computes everything client-side.

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

`public/sw.js` (current: `tanhowa-v7` / `tanhowa-api-v4`) implements:
- **API cache** (`tanhowa-api-v4`): announcements, events, polls, documents, resolutions, and stats responses cached for offline viewing
- **Static cache** (`tanhowa-v7`): images, fonts, icons (cache-first)
- **Pages**: network-first, falls back to cached version or `/offline` page
- Bump BOTH `CACHE_NAME` and `API_CACHE` version strings when changing caching behavior — the `activate` handler drops anything not in the new whitelist, forcing all clients to refresh on next visit
- **Install banner:** Login page (`app/page.tsx`) shows a PWA install prompt with instructions for Chrome/Safari
- **Auth-sensitive skip list:** `AUTH_SENSITIVE_PATHS` (`/`, `/onboarding`, `/pending`, `/suspended`, `/verify`, `/feedback`) and `AUTH_SENSITIVE_PREFIXES` (`/admin`, `/dashboard`) bypass SW interception entirely — the fetch handler returns early so the browser hits the network directly and the new session cookie is always honored. Without this skip list, members hit "stuck sign-in" / "frozen UI" in regular Chrome (works in incognito because there's no SW). Add any new auth-flow route to the right list AND bump cache versions in the same commit. See `reference_sw_staleness_diagnostic.md`.
- **Trade-off:** PWA offline support is lost for the auth-flow routes. They never worked offline meaningfully (need live session/data), so practical impact is zero — keep the skip list aggressive rather than letting one stuck-sign-in regression slip through.

## Cross-Component Communication

Admin layout sidebar badges (pending users count, error count) refresh on page navigation. When a child page performs actions that change these counts (e.g., approving a user), it must dispatch a custom event so the layout can re-fetch:

```typescript
// In child page after an action that changes counts:
window.dispatchEvent(new Event("admin-users-changed"));

// The admin layout listens for this event and re-fetches badge counts
```

Use this pattern whenever a child page modifies data that the layout displays.

## Audit Log

Fire-and-forget to the `audit_logs` table. Admin page at `/admin/audit-logs` with search, action filter, and target type filter. Color-coded icons per target type.

## Razorpay Integration

`lib/razorpay.ts` provides: `isRazorpayConfigured()`, `getRazorpayKeyId()`, `createOrder()`, `verifySignature()`. Uses Web Crypto API (`crypto.subtle`) for HMAC SHA-256 signature verification (Edge-compatible, not Node.js `crypto`). API at `/api/payments` (POST: create order, PUT: verify payment). Structurally complete but needs `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` env vars.

## Notification Preferences

Per-user notification settings stored in `notification_prefs` table. API at `/api/notification-prefs` (GET/PUT). Toggle UI on profile page (`/dashboard/profile`) with Email, Telegram, and In-App channel toggles.

## Grievance/Suggestion Priority & SLA

Admin can set priority (Low/Medium/High) on grievances and suggestions. Days-pending SLA badge calculated from creation date: green (≤3 days), amber (≤7 days), red (>7 days). Priority stored in `grievances.priority` column.

## Profile Completeness

`UserCard` component shows an 8-field profile completeness score with color-coded progress bar (green 100%, blue ≥75%, amber ≥50%, red <50%). Missing fields appear as clickable amber pill badges that open the nudge dialog. The nudge dialog (`NudgeDialog.tsx`) is a draggable floating panel (not a modal) — uses mouse event listeners for drag with bounds checking.

## Internationalization (i18n)

React Context-based bilingual system (English/Tamil) with font size control.

**Files:**
- `lib/i18n/index.ts` — barrel export
- `lib/i18n/language-context.tsx` — `LanguageProvider` context, `useT()` and `useLang()` hooks
- `lib/i18n/translations.ts` — dictionary with 500+ keys (EN/TA pairs)

**Usage:**
```typescript
import { useT, useLang } from "@/lib/i18n";

const t = useT();           // t("nav.dashboard") → "Dashboard" or "டாஷ்போர்டு"
const { lang } = useLang(); // "en" or "ta"
```

**Key conventions:**
- Translation keys use dot notation by category: `nav.*`, `common.*`, `status.*`, `announce.*`, `poll.*`, etc.
- `useT()` supports parameter interpolation: `t("faq.showing", { filtered: "5", total: "20" })`
- Fallback chain: current lang → English → raw key
- `LanguageProvider` wraps the app in `app/layout.tsx` — all components using `useT()` must be inside it
- Language persists to localStorage key `tanhowa-lang`, font size to `tanhowa-font-size`
- Font sizes: `sm` (14px base), `md` (16px), `lg` (18px) — applied as CSS class on `<html>`

**Adding translations for a new page:**
1. Add keys to `lib/i18n/translations.ts` with `en` and `ta` values
2. Import `useT` in the component, replace hardcoded strings with `t()` calls
3. For content pages, also pass `?lang=ta` to API (see Content Auto-Translation below)

## Content Auto-Translation (EN↔TA)

User-generated content is auto-translated via Gemini when created/edited, cached in DB for fast retrieval.

**Files:**
- `lib/translate-content.ts` — `translateContent()` + `getTranslations()`
- `supabase/content_translations_schema.sql` — table DDL

**Table:** `content_translations` (source_table, source_id, field, lang, translated_text) with UNIQUE constraint for upsert.

**Content types translated:**

| Table | Fields |
|-------|--------|
| announcements | title, content |
| events | title, description, location |
| grievances | admin_remarks |
| faqs | question, answer |
| resolutions | title, description |
| polls | title, options (JSON array) |
| wishlist_ideas | title, description |

**API pattern:**
```typescript
// GET — merge translations when ?lang=ta
const lang = url.searchParams.get("lang");
if (lang === "ta") {
  const translations = await getTranslations("announcements", ids, "ta");
  // merge translated fields, fallback to original if missing
}

// POST/PUT — fire-and-forget translate after DB write
translateContent("announcements", data.id, { title, content });
```

**Frontend pattern:**
```typescript
const { lang } = useLang();
// Append ?lang=ta to fetch URL when Tamil selected
fetch(`/api/announcements${lang === "ta" ? "?lang=ta" : ""}`)
// Re-fetch when language changes
useEffect(() => { load(); }, [lang]);
```

**Tamil detection:** `isTamil()` heuristic (>30% Tamil Unicode chars U+0B80-U+0BFF) skips already-Tamil content.

**Preview-as-TA toggle:** Admin pages for announcements, events, resolutions, and grievances expose a "Preview as Tamil" toggle that flips the page state to fetch with `?lang=ta`, so curators can see how the auto-translated copy will render to Tamil-language members before publish (no DB write — pure read-side preview). When adding a new admin content type, mirror this pattern instead of inventing a new preview UX.

## Wishlist / IDEA BOARD

Community-driven idea board where members submit ideas, others upvote, and admins review + convert to tasks. UI label is **IDEA BOARD** (renamed from "Ideas Board" — `nav.wishlist` and `wishlist.title` i18n keys).

**Tables:** `wishlist_ideas` + `wishlist_upvotes`

**Pages:**
- Members: `/dashboard/wishlist` — submit ideas, upvote/unvote, search, category filter, sort by votes/newest
- Admin: `/admin/wishlist` — review ideas, set status, add remarks, convert to task, delete

**API:** `/api/wishlist` (GET/POST/PUT/DELETE)
- PUT actions: `upvote`/`unvote` (any member), `update_status` (admin), `convert_to_task` (admin — creates todo with auto-generated ET-XXX event_id, links via `linked_task_id`)
- Supports `?lang=ta` for Tamil translations
- Logs `idea_submitted` and `idea_upvoted` contributions

**Categories:** Training, Infrastructure, Events, Digital Tools, Policy, Welfare, Communication, Other

**Statuses:** `open` → `reviewing` → `approved` → `in_progress` → `completed` (or `rejected`)

**Voice capture (Tamil/English mixed → English):** Mic button on the create form opens `<VoiceCaptureDialog>` (`components/voice-capture-dialog.tsx`). MediaRecorder captures up to 60s and POSTs to `/api/ai-tools/transcribe-idea` (Gemini 2.5-flash audio, rate limit 5/min, 5MB cap, 2KB min). Gemini returns `{ title, description, category }` in clean English regardless of Tamil/English/mixed input — member can edit before submitting. The dialog pre-flights `navigator.permissions.query({ name: "microphone" })` and renders a 4-scenario help card (phone browser / Android PWA → Chrome site settings / iOS PWA → iOS Settings → TANHOWA / desktop) when state is `"denied"`. PWA mic permission isn't in Android app permissions — it lives in Chrome's site settings; see `reference_pwa_mic_permission_chain.md`. Logs `voice_idea_transcribed` contribution.

## Logo Vote

Time-boxed members-only vote on the new TANHOWA logo. Tables: `logo_concepts`, `logo_votes`, `logo_comments` (schema: `supabase/logo_vote_schema.sql`).

- **Member page:** `/dashboard/logo-vote` — 6 SVG concepts (`Bloom`, `Sprout T`, `Heraldic Shield`, `Monogram T`, `Laurel Wreath`, `Modern Crest`). Member picks one, can change any time before voting closes, can leave one editable comment. Peers' votes are anonymous; comments show author name + district publicly.
- **Admin page:** `/admin/logo-vote` — concept-level tally, comment moderation, open/close window.
- **API surface:** `/api/logo-vote` (current concepts + window state), `/api/logo-vote/vote` (POST/PUT current member's vote), `/api/logo-vote/comment` (POST/PUT/DELETE), `/api/logo-vote/admin` (super_admin tally + close).
- **Window:** stored as 3 `site_settings` rows — `logo_vote_open` (`true`/`false`), `logo_vote_started_at`, `logo_vote_ends_at`. Schema seeds a 7-day window on first install. Re-applying the schema (`node scripts/apply-sql.mjs supabase/logo_vote_schema.sql`) re-opens the window — be careful in prod.
- **Uniqueness:** `logo_votes.user_id` and `logo_comments.user_id` are both `UNIQUE` so each member has exactly one vote and one comment record (updates use UPSERT).

## Elections (Posts, Nominations & Polling)

Full TANHOWA office-bearer election system. Tables: `election_posts`, `election_candidates`, `election_votes` (schema: `supabase/elections_schema.sql`, `supabase/elections_district_schema.sql`, `supabase/election_votes_schema.sql`).

**Lifecycle** is driven entirely by each post's `status`: `draft → nominations_open → voting_open → closed`. The member-facing nomination and polling pages react to status changes automatically — there is no separate "open election" action, just move the post's status.

- **Officials management page:** `/dashboard/elections` (re-exported as `/admin/elections`) — create/delete posts, add/approve/withdraw candidates, set post status. Access: `super_admin`, **state officials** (`official_type=state`), and `sivikoomba@gmail.com`. Gated in three places that must stay in sync: `hasElectionAccess()` in `app/api/elections/route.ts`, the `/admin/elections` filter in `app/admin/layout.tsx`, and the `electionsOnly` nav flag in `app/dashboard/layout.tsx`.
- **District-scoped posts:** `election_posts.district` lets DS/DJS exist once per district — uniqueness is `UNIQUE(title, COALESCE(district,''))` (a unique index, NOT the original `UNIQUE(title)`; the migration drops `election_posts_title_key`). State posts (President, etc.) keep `district = NULL`. The Add-Post dialog shows a required district dropdown only for titles in `DISTRICT_SCOPED_TITLES` ("District Secretary", "District Joint Secretary"). Seed all 76 district posts via `supabase/elections_seed_district_posts.sql`.
- **Add-candidate member search:** the Name field is a typeahead against `GET /api/users?status=approved&search=` (debounced 250 ms); selecting a member links `election_candidates.user_id` and auto-fills district. Free-text names still work (user_id stays null).
- **Member self-nomination:** `/dashboard/nominate` + `/api/elections/nominate` (GET eligible open posts + own nominations, POST submit, DELETE withdraw). Only `nominations_open` posts appear; DS/DJS restricted to the member's own `regular_district`; name/district pulled from profile; lands as a candidate with `status=nominated` for official approval. One active nomination per post (409 on dupe). Visible to all approved members (ungated nav `nav.nominate`).
- **Polling dashboard:** `/dashboard/polling` + `/api/elections/vote` (GET dashboard, POST cast/change, DELETE retract). Shows `voting_open` + `closed` posts. **Secret ballot:** `election_votes` stores `voter_id` only to enforce `UNIQUE(post_id, voter_id)` and surface the caller's own selection — the API never returns who voted for whom, only tallies. **District-scoped:** members vote only in their own district's DS/DJS post (others are watch-only). **Live for everyone:** tallies + turnout (`votes / eligible`, eligible = approved members overall or per-district) refresh every 15 s; closed posts highlight the winner. Only `status=approved` candidates appear on the ballot.

## Payment Status Transparency

All logged-in members can view district-wise subscription payment status at `/dashboard/payment-status`.

- **API:** `GET /api/subscriptions/payment-status?period=2026` — any authenticated user (not admin-only)
- **Response:** `{ districts[], periods[], summary, topDistricts[] }` — members grouped by district with paid/pending/overdue status
- **UI:** 4 summary MetricCards, top 5 districts by payment rate with progress bars, district-wise expandable accordion with member names + StatusBadge, period selector, search filter
- **Sorting:** Members within each district sorted by designation hierarchy (ADDH → JDH → DDH → ADH → HO)
- **Excludes:** Test accounts (tanhowa19791@gmail.com, tanhowaadmin@tanhowa.in)

## Digital Member ID Card

On-screen TANHOWA-branded ID card displayed on the profile page + downloadable PDF.

- **On-screen:** CSS card with TANHOWA green gradient header, photo, name, designation, district/block, DS/DJS badge, member ID (first 8 chars of UUID), member since year, valid until end of current year, phone
- **PDF download:** `downloadIdCard()` using jsPDF, portrait 100×65mm custom size. Photo loaded via canvas→base64 for cross-origin images. TANHOWA branding header (RGB 45, 106, 79).
- **Location:** Profile page (`/dashboard/profile`) — ID card section at top

## Member Directory Sorting

Members page (`/dashboard/members`) sorts by designation hierarchy within each district:

```
ADDH (1) → JDH (2) → DDH (3) → ADH (4) → HO (5) → Retd (6) → Others (7)
```

`getDesignationRank()` function matches on `occupation` field substrings. Secondary sort by block name, tertiary by member name.

**Designation options:** "Others" (with custom input) and all 5 retired designation variants have been removed from both onboarding and profile pages. Only active designations remain: HO, ADH, DDH, JDH, ADDH, System Admin.

## Team Lead Role & Legal Advisor

- **Team Lead:** `team_members.role` column supports "lead" designation. Admin teams page has Crown toggle per member. Leads shown first with amber highlight and Crown icon on both admin and member teams pages. API payload uses `members_with_roles: [{ user_id, role }]`.
- **Legal Advisor:** Hardcoded card on `/dashboard/teams` (not from DB). Shows Thiru. S. Rajendiran (Advocate, B.Com., B.L.) with photo, address, phones, email. Photo at Supabase `avatars/legal-advisor-rajendiran.jpeg`. Appears below all team cards and also when no teams exist.

## Private Teams & Project H

- **`teams.is_private`** (boolean, default false) — when true, the team is hidden from non-members in `/dashboard/teams`. Filter happens in `GET /api/teams`: admins/officials always see everything; everyone else only sees public teams + private teams they belong to. Toggle lives on the create/edit team dialog in `/admin/teams`. Schema: `supabase/team_privacy_schema.sql`.
- **Project H** — restricted policy document vault for the **TT Team**. Page `/dashboard/project-h`, API `/api/project-h` (GET/POST/PUT/DELETE — file + metadata in a single multipart POST, max 50 MB), private bucket `project-h-documents` (auto-created on first upload), 5-min signed URLs for downloads. Categories: Policy Drafts, Position Papers, Cabinet Notes, Reports, Correspondence, Meeting Minutes, Other. DELETE is uploader-or-super_admin only. Schema: `supabase/project_h_schema.sql` (table `project_h_documents`).
- **Access gate:** `lib/auth.ts:isProjectHMember(userId)` checks for membership in the team named exactly `"TT Team"`. `/api/users/me` returns `is_project_h: boolean` (true for super_admin or any TT Team member). Dashboard sidebar reads this to conditionally show the Project H nav entry — gate uses `projectHOnly: true` flag on the navItem and the `isProjectH` state in `app/dashboard/layout.tsx`. Mirrors the `is_finance_team` pattern. Adding any future "team gives X powers" feature should reuse this exact pipeline.

## Letters & Forms (superAdminOnly)

3 government letter templates at `/dashboard/letters` — restricted to `tanhowa19791@gmail.com`:
- **Leave Application:** Leave type selector (7 types), date range with auto-calculated days, alternate officer
- **TA Bill:** Dynamic journey rows with fare/DA/halting/conveyance columns, grand total in words (Indian numbering)
- **Tour Diary:** Dynamic tour entries with distance, mode, purpose, certification

All auto-fill name, designation, district, block from user profile. Generate branded PDFs with TANHOWA footer using jsPDF + jspdf-autotable.

## Why-Ministry Position Paper (super-admin only)

Private bilingual workspace at `/admin/why-ministry` for the State-Admin to draft and maintain the *Why Farmers Need a Ministry of Horticulture* advocacy doc. **Strictly `tanhowa19791@gmail.com` only** — both API (`/api/why-ministry`) and the sidebar nav filter reject everyone else.

- **Storage:** single `site_settings` row, key `why_ministry_doc`, value = JSON `{ title_*, intro_*, sections: [...], updated_at }`. **No DB migration needed.**
- **Pre-seed:** first GET on an empty key returns 10 placeholder reason headings (specialised crop economics, post-harvest gap, climate-sensitive policy, exports, etc.) for the State-Admin to fill in.
- **Section cards:** add / delete / reorder (↑/↓). Each section has EN/TA fields side-by-side.
- **Hybrid translation (Option C):** server-side `autoTranslateBatch` runs Gemini EN→TA only on fields whose corresponding TA `_manual` flag is `false`. Typing in any TA field flips it to `_manual: true` so the server preserves the hand edit. A "Reset" button per TA field clears the flag and re-enables auto-translate on next save.
- **PDF export:** "Print / Save PDF" button uses `window.print()` with a print-only stylesheet so Tamil renders correctly via browser fonts (jsPDF cannot render Tamil without a heavy font embed).
- **Audit log:** every save writes `why_ministry_update` to `audit_logs`.

## TANHOWA History Timeline

Living history — admin-curated milestones backed by the `history_entries` table.

- **Member view:** `/dashboard/history` — vertical alternating timeline with date markers, image cards, descriptions. Mobile-responsive. Renders Tamil when language toggle is set to TA.
- **Curator view:** `/admin/history` — list + add/edit/delete dialog with date picker, title, description, image upload. Strictly `tanhowa19791@gmail.com` only (both API writes and sidebar visibility).
- **Image storage:** new public Supabase bucket `history-images` (auto-created on first upload via `app/api/history/upload/route.ts`), 5MB cap, image MIME only. Hashed filenames to avoid collisions.
- **Bilingual:** title + description auto-translate EN→TA via existing `translateContent()` on create/update; member GET honours `?lang=ta` and merges via `getTranslations("history_entries", ids, "ta")`.
- **Audit log:** create/update/delete logged.

## Member Feedback Loop & AI Pulse (super-admin only)

Four collection channels in, one owner-only summary out at `/admin/feedback-pulse`.

**Collection channels:**
- **Floating widget** — `<FeedbackWidget />` mounted in `app/dashboard/layout.tsx`, visible on every dashboard page. 1-5 star rating + comment + page URL captured. 7-day per-device cooldown via localStorage (`tanhowa-feedback-cooldown-until`).
- **Re-engagement modal** — `<ReEngagementModal daysInactive={N} />`, fires once when an approved member returns after 14+ days inactive (computed from `last_active_at` returned by `/api/users/me` BEFORE the route's fire-and-forget bump). Tracked in `feedback_prompts_shown` so it never re-shows. Dismiss = `POST /api/feedback/dismiss`.
- **Inactive-nudge email link** — `app/api/cron/inactive-nudge/route.ts` mints a 30-day signed JWT per user via `lib/feedback-token.ts:createFeedbackToken()` and includes a "Tell us what would bring you back" link in BOTH the personal email AND the Telegram message. Email is a new addition (cron was Telegram-only before).
- **Existing data** — grievances, suggestions, wishlist ideas (last 30 days) are pulled into the AI summary without any new member effort.

**APIs:**
- `POST /api/feedback` — accepts session-authenticated submissions (widget, re_engagement) AND token-authenticated submissions (inactive_email — JWT in body, verified against `JWT_SECRET` with `purpose: "feedback"` claim).
- `GET /api/feedback` — returns the current user's `feedback_prompts_shown` rows so the modal knows whether to fire.
- `POST /api/feedback/dismiss` — marks the re-engagement modal as shown without recording a response.
- `GET /api/admin/feedback-pulse` — owner-only. Returns the cached AI summary (1-hour TTL via `site_settings` key `feedback_pulse_cache`).
- `POST /api/admin/feedback-pulse` — owner-only. Deletes the cache to force a refresh.
- `PUT /api/admin/feedback-pulse` — owner-only. Returns last-200 raw `feedback` rows with member name+email joined.

**Public landing page:** `/feedback?t=<jwt>` — auth-less, accepts the token from the URL, shows reason radio + comment, submits via `/api/feedback`. Page route is NOT in `middleware.ts:ALLOWED_FOR_ALL` because middleware only matches `/api/*`; the API route allows token-auth even when the user has no session.

**AI pulse:** Gemini 2.5-flash. Combines all `feedback` rows + grievances + ideas from last 30 days into a compact list, asks for `themes` (up to 6), `highlights` (tagged praise/complaint/request, up to 8), and `recommended_actions` (up to 5). Generic advice is explicitly forbidden in the prompt — wants concrete feature-specific suggestions. Cache + 1-hour TTL avoids re-running on every page load.

**Mandatory profile-completion gate is unaffected** — the modal is mounted alongside the gate but only fires when daysInactive >= 14, after the gate clears.

## Mandatory Profile Completion

All approved members must complete 12 fields before accessing any dashboard section (admins/super_admins exempt):
- Fields: First Name, Last Name, Phone, Designation, District, Block, Profile Photo, DOB, Gender, Qualification, Date of Joining, Address
- Non-dismissible dialog blocks navigation (except `/dashboard/profile`)
- Polite bilingual message (EN/TA) with `Flower2` icon
- Warning banner on profile page shows missing fields
- Logic: `getMissingFields()` in `app/dashboard/layout.tsx`
- **Placeholder name detection:** `PLACEHOLDER_NAMES` Set in `app/dashboard/layout.tsx` rejects names where every word is a placeholder (`unnamed`, `user`, `test`, `guest`, `anonymous`, `no name`, `n/a`, `na`). So "unnamed", "user user", "test test" all count as missing — the member is forced to enter a real first + last name. Add new placeholders to the Set rather than altering the field check.

## Trainings System

Full training management with enrollment, trainer invitations, and multi-language materials.

### Core Trainings

Tables: `trainings` + `training_enrollments`. Schema in `supabase/trainings_schema.sql`.

- **Member page:** `/dashboard/trainings` — browse, enroll, cancel enrollment, QR check-in
- **Admin page:** `/admin/trainings` — create, edit, manage status, delete, attendance
- **API:** `/api/trainings` (GET/POST/PUT/DELETE), `/api/trainings/checkin` (POST)
- **Modes:** online, offline, hybrid (with meeting link)
- **Topics:** Horticulture, Pest Management, Organic Farming, Soil Health, Post-Harvest, Marketing, Technology, Legal, Administration, Other
- **Statuses:** `upcoming`, `ongoing`, `completed`, `cancelled`
- **Enrollment statuses:** `enrolled`, `cancelled`, `attended`
- **QR Check-in:** URL param `?checkin={training_id}` auto-checks-in enrolled members
- **iCal export:** "Export Calendar" button calls `/api/events/ical?type=trainings`

### Trainer Invite System

Table: `trainer_invites`. Admins can invite members or external trainers.

- **API:** `/api/trainings/invite` (GET/POST/PUT)
- **3 modes:** Manual entry (name/email), invite member (search by name), invite external (name + email + phone)
- **Flow:** Invite sent → email notification → member sees banner on `/dashboard/trainings` → accept/decline
- **On accept:** Auto-fills training's `trainer_name`, `trainer_type`, and contact from member profile
- **Email:** `sendTrainerInviteEmail()` in `lib/mail.ts`

### Training Materials (Multi-Language)

Tables: `training_materials` + `training_material_access`. Storage bucket: `training-materials` (private).

- **API:** `/api/trainings/materials` (GET/POST/PUT/DELETE)
- **Languages:** English (en), Tamil (ta), Kannada (kn), Telugu (te)
- **Access tiers:** `all` (any member), `enrolled` (enrolled members only), `selected` (specific members via junction table)
- **Storage:** Private bucket, signed URLs with 5-min TTL. Path: `{training_id}/{language}/{timestamp}-{filename}`
- **Upload:** FormData with file (50MB max), title, language, access level. Admin/official only.
- **Member UI:** Expandable `MaterialsSection` per training card with language filter pills and download links
- **Admin UI:** Materials dialog in training editor with upload form, language badges, access badges, delete

## Direct Messages

Table: `messages` (schema in `supabase/messages_schema.sql`). Member-to-member messaging with conversation threading.

- **Member page:** `/dashboard/messages` — conversation list, message thread, send/receive
- **API:** `/api/messages` (GET/POST)
  - `GET ?conversations=true` — list all conversations with last message preview + unread count
  - `GET ?with={userId}` — get message thread with specific user
  - `GET ?unread_count=true` — total unread count (used by nav badge)
  - `POST` — send message to recipient
- **Polling:** Conversations refresh every 15s, active thread refreshes every 5s
- **Mobile fix:** Poll skips when input is focused (`inputFocusedRef`) to prevent scroll jumps; thread poll uses change detection (compares last message ID) to avoid unnecessary re-renders

## Group Chat

Channel-based group chat where all members can interact and share files. Tables: `chat_channels`, `chat_channel_members`, `chat_messages` (schema: `supabase/group_chat_schema.sql`).

- **Member page:** `/dashboard/group-chat` — split-pane: 320px channel list (desktop) + message thread. Full-width toggle on mobile.
- **Admin page:** `/admin/group-chat` — channel CRUD (create/edit/archive/delete), member management (add/remove/toggle admin), message moderation.
- **APIs:**
  - `/api/chat/channels` — GET (user's channels with unread counts + last message preview), POST (admin create), PUT (update), DELETE (super_admin only)
  - `/api/chat/messages` — GET (cursor pagination via `?before=`, signed file URLs 1hr TTL, reply snippets, fire-and-forget `last_read_at` update), POST (text via JSON, files via FormData 10MB max), DELETE (soft-delete via `deleted_at`). Accepts both `?channel_id=` and `?channel=`.
  - `/api/chat/members` — GET (list with user info + `last_read_at` per member for read-receipt UI), PUT (actions: join/leave/mute/unmute/add/remove)
  - `/api/chat/unread` — GET (aggregate unread across non-muted channels, used by nav badge)
  - `/api/chat/typing` — POST `{ channel_id }` — broadcasts ephemeral `typing` event (`{ userId, userName, channelId }`) via `broadcastToChannel`. No DB write. Uses `writeLimiter`.
  - `/api/chat/read` — POST `{ channel_id }` — sets `chat_channel_members.last_read_at = now()` and broadcasts `read` event (`{ userId, userName, channelId, lastReadAt }`). Called on channel open + `window.focus` (not per message — the messages GET still does its own fire-and-forget `last_read_at` update).
  - `/api/chat/reactions` — emoji reactions. GET `?message_ids=id1,id2` returns `{ reactions: { [messageId]: [{ emoji, count, users: [{id,name}] }] } }`. POST `{ message_id, emoji }` adds (idempotent upsert on `(message_id,user_id,emoji)`), broadcasts `reaction_added`. DELETE `?message_id=...&emoji=...` removes the caller's reaction, broadcasts `reaction_removed`. Membership verified via message's `channel_id`; default channels allow non-members. Rate-limited via `writeLimiter`.
- **Reactions schema:** `chat_message_reactions (id, message_id, user_id, emoji TEXT<=16, created_at)` with `UNIQUE(message_id, user_id, emoji)` — one of each emoji per user per message. Schema in `supabase/group_chat_stage2_schema.sql`.
- **Reactions UI:** Hover on a message bubble reveals a `SmilePlus` button (alongside Reply/Delete). Clicking opens a quick-pick popover with 8 emojis (`👍 ❤️ 😂 🎉 🙏 🔥 👀 ✅`). Reaction chips render below each bubble showing `[emoji count]`; clicking a chip toggles the current user's reaction (add if absent, remove if present). The caller's own chips are highlighted (`bg-primary/15 border-primary/40`). Hover tooltip lists reactor names. Messages GET endpoint batch-embeds aggregated reactions per message. Realtime `reaction_added`/`reaction_removed` broadcasts update local state; self-echoes are skipped because the UI already applied an optimistic update.
- **Typing indicator UI:** Ref-backed map (`typingUsers: { userId: { name, timestamp } }`) pruned every 1s with 5s TTL. Textarea onChange POSTs `/api/chat/typing` at most once every 3s (throttled via `lastTypingEmitRef`). Text renders as "X is typing…", "X and Y are typing…", or "Several people are typing…" below the message thread. Entries for user X are cleared immediately when a `new_message` broadcast arrives from X. Typing state resets on channel switch.
- **Read receipts UI:** For own messages only — latest own message shows full `Read by X, Y, Z` (up to 3 names, then "+N more"); older own messages collapse to a small "•" with a hover tooltip listing readers. Readers computed by comparing each channel member's `last_read_at` to the message's `created_at`. Refreshed in realtime via the `read` broadcast handler updating `members[].last_read_at`.
- **Files:** Private Supabase Storage bucket `chat-files`. Path: `{channel_id}/{timestamp}-{filename}`. Signed URLs generated on GET.
- **Polling:** Messages 30s (fallback; Realtime handles the hot path), channels 15s. **Skips when input is focused** to avoid interrupting typing.
- **Realtime (Stage 2):** Supabase Broadcast via `lib/chat-broadcast.ts` — server sends, anon client subscribes to `chat:${channelId}` topic. Events: `new_message`, `message_deleted`, `reaction_added`, `reaction_removed`, `typing`, `read`. DB RLS not required — broadcast events live on the Realtime server, not in Postgres. Self-echo dedup via `knownMessageIdsRef` (messages) and `payload.userId === myIdRef.current` (others).
- **Critical UI rule:** Never define inline component functions inside the page (`const Foo = () => (...)`) — React remounts on every re-render and destroys textarea focus. Use JSX variable assignments (`const fooJsx = (...)`) and reference with `{fooJsx}`. See `feedback_no_inline_components.md`.
- **Textarea:** Multiline auto-resize — `e.target.style.height = "auto"` then `Math.min(e.target.scrollHeight, 120) + "px"` on every onChange. Same pattern applied to `/dashboard/messages`.
- **Supabase FK joins:** Use explicit hints (`sender:sender_id(name)`) instead of `users(name)` to avoid array/ambiguous type inference. Cast with `as unknown as { name: string }` when enriching.
- **Contributions:** `group_message_sent` (1 min), `chat_file_shared` (2 min).

## Content Scheduling

Announcements and events can be scheduled for future publication.

- **Schema:** `content_scheduling_schema.sql` adds `scheduled_at` TIMESTAMPTZ to announcements and events
- **Admin UI:** Schedule mode toggle with datetime picker on announcement/event create forms
- **Cron:** `/api/cron/publish-scheduled` auto-publishes content when `scheduled_at` has passed
- **Draft mode:** Unpublished content stays hidden from members until scheduled time or manual publish

## Account Suspension

Admins can suspend approved members. Status flow: `pending` → `approved` → `suspended` (or `rejected`).

- **Suspended users:** Redirected to `/suspended` page, blocked from all API routes except auth, `/api/users/me`, and `/api/subscriptions`
- **Admin actions:** Suspend/unsuspend via `/admin/users` page
- **Restricted to:** `tanhowa19791@gmail.com` (owner) only
- **Notifications:** Email sent on suspension/unsuspension

## Owner-Only Admin Tools

Four admin pages restricted to the owner (`tanhowa19791@gmail.com`). All four follow the same gating pattern: API route checks `session.email`, sidebar in `app/admin/layout.tsx` filters them out for everyone else. **Add owner-gated tools here, not as one-off pages.**

| Page | API | Storage | Purpose |
|------|-----|---------|---------|
| `/admin/special-tasks` | `/api/admin-tasks` | `admin_tasks` table | Private parallel task tracker (3 types: `internal`, `assigned`, `checklist`). Same priority/status vocabulary as the public `todos` system but lives in its own table so owner work doesn't pollute member-visible lists. |
| `/admin/special-documents` | `/api/admin-documents` + `/api/admin-documents/folders` | `admin_documents` + `admin_document_folders` tables + private storage bucket | Document vault for confidential files, organized in user-created folders (folder-card landing grid → drill into doc list; "Unfiled" for folder_id NULL; deleting a folder unfiles its docs). The old category dropdown is retired from the UI — `category` is a legacy column, new uploads store NULL. Hidden from regular members and admins. |
| `/admin/district-dues` | `/api/district-dues` | Reads `subscriptions` + writes `amount_paid` + `additional_money` per member | District-grouped dues calculator: shows pending across 2025, 2026, UATT case for every member, with inline edit of `amount_paid` / `additional_money`. Replaces an external spreadsheet that was previously emailed around. |
| `/admin/settings` | `/api/settings` | `site_settings` key/value table | Branding, payee bank details, payment QR upload (`/api/upload/qr-code`), contact info, feature toggles. Free-form key/value editor — be careful, no schema validation. |

**Owner check is the source of truth, not the role.** A district admin (`role=admin`) cannot reach these pages; a future second super_admin would need an explicit allowlist update if you ever stop hardcoding the email.

## Calendar & iCal Export

Unified calendar view combining events and trainings with iCal export.

- **Member page:** `/dashboard/calendar` — visual calendar with events and trainings
- **API:** `/api/events/ical` — generates iCalendar (.ics) format for external calendar apps
  - `?type=events` — events only
  - `?type=trainings` — trainings only
  - Default: both combined

## Push Notifications

Web Push API integration for real-time browser notifications.

- **Table:** `push_subscriptions` (user_id, endpoint, keys)
- **API:** `/api/push` (POST subscribe, DELETE unsubscribe)
- **Service worker:** Handles push events and displays native notifications

## District Benchmark

District performance comparison dashboard for admins.

- **Admin page:** `/admin/district-benchmark`
- **API:** `/api/reports/district-benchmark`
- **Metrics:** Payment rates, member activity, profile completion across districts

## Engagement Analytics

Detailed member engagement tracking restricted to owner (`tanhowa19791@gmail.com`).

- **Admin page:** `/admin/engagement`
- **Schema:** `analytics_schema.sql` with `analytics_events` table (event_type, page_path, device info, session_id)
- **Metrics:** Feature adoption (unique users, total uses, time), inactive members, churn risk, monthly active user trends

## Achievements / Badges

Automated badge system that awards badges based on member activity stats.

- **Table:** `achievements` (user_id, badge, earned_at)
- **Lib:** `lib/badges.ts` — 13 badge definitions, `checkAndAwardBadges()`, `BADGES` array
- **API:** `/api/achievements` (GET) — `?me=true` for own badges, `?leaderboard=true` for admin leaderboard
- **Member page:** `/dashboard/achievements` — personal badges display
- **Admin page:** `/admin/achievements` — badge leaderboard
- **Badges:** Century (100min), Half Century (50min), Dedicated (200min), All-Rounder (5+ action types), Task Master (10+ tasks), Task Starter (1st task), Payment Champion (all paid), Voice of Change (5+ grievances), Idea Factory (3+ ideas), Social Butterfly (5+ RSVPs), Loyal Member (6+ months), Pioneer (1+ year), Regular (50+ logins)

## Event RSVP

Members can RSVP to events (going/interested). Counts displayed on event cards.

- **Table:** `event_rsvps` (event_id, user_id, status)
- **API:** `/api/events/rsvp` (GET/POST) — GET returns counts + user's RSVPs, POST toggles RSVP

## Global Search

Cross-entity search across the portal (members, announcements, events, documents, tasks).

- **API:** `/api/search?q=query` — rate limited 20/min, uses zod validation from `lib/validation.ts`
- **Input validation:** `lib/validation.ts` — zod schemas for grievances, announcements, events, search, and more

## Announcement Read Tracking

Tracks which members have read announcements. Used by notification counts to show "new since last visit."

- **Table:** `announcement_reads` (announcement_id, user_id, read_at)
- **API:** `/api/announcements/read` (POST) — marks announcement as read for current user

## Cron Jobs

Vercel Cron-triggered endpoints (defined in `vercel.json`). All require `Authorization: Bearer {CRON_SECRET}` header — enforced via the shared `requireCronAuth(req)` helper in `lib/cron-auth.ts` (returns a 503/401 `NextResponse` to pass through, or `null` when authorized); use it in any new cron route instead of inlining the header check. Once-per-day jobs additionally use the atomic-claim lock pattern (`INSERT` into `site_settings` with key `{job}_run_{YYYY-MM-DD}`) so concurrent triggers don't double-run.

| Route | Schedule (UTC) | IST | Purpose |
|-------|---------------|-----|---------|
| `/api/cron/daily-briefing` | `0 0 * * *` | 05:30 | Per linked TG member: top 3 active tasks + Gemini-personalized 2-3 sentence briefing + inline keyboard rows `[✅] [🚧] [📝] ET-XXX` per task. Webhook handles the `callback_query` and `force_reply` round-trips. |
| `/api/cron/task-reminder` | `30 0 * * *` | 06:00 | Daily digest of due-soon + timebox-hot tasks per assignee/committer |
| `/api/cron/daily-greetings` | `30 1 * * *` | 07:00 | Birthday + festival greetings (see Daily Greetings section above for the lambda-killed fire-and-forget bug) |
| `/api/cron/inactive-nudge` | `30 2 * * *` | 08:00 | Email + Telegram nudge to members inactive 30+ days. Both channels include a "Tell us what would bring you back" link (30-day signed JWT minted via `lib/feedback-token.ts`) → public `/feedback?t=...` form → writes to `feedback` table with source `inactive_email`. |
| `/api/cron/stuck-tasks` | `0 4 * * *` | 09:30 | Flags silent (no notes 3+ days) / past-due / timebox-exceeded tasks. Per-committer DM + admin digest. |
| `/api/cron/publish-scheduled` | Periodic | — | Auto-publishes scheduled announcements/events past their `scheduled_at` time |

The three task crons (daily-briefing, task-reminder, stuck-tasks) overlap by design — they cover different signals. **Consolidation deferred until adoption data is available** (audit scheduled 2026-05-15). Don't preemptively merge them.

## Volunteer Invites

Invite non-members to volunteer for events/tasks.

- **API:** `/api/volunteer-invites` (GET/POST/PUT)

## Service Requests

Member service request submission system.

- **Member page:** `/dashboard/service-requests`
- **Admin page:** `/admin/service-requests`

## Common Tasks

### Adding a new dashboard feature

1. Write the schema as `supabase/<feature>_schema.sql` (use `CREATE TABLE IF NOT EXISTS` so it's idempotent), then apply via `node scripts/apply-sql.mjs supabase/<feature>_schema.sql` from `tanhowa/` — beats the web SQL editor copy-paste
2. Create API route at `app/api/<feature>/route.ts` — follow `app/api/grievances/route.ts` as a template
3. Create member page at `app/dashboard/<feature>/page.tsx`
4. Create admin page at `app/admin/<feature>/page.tsx`
5. Add nav item with icon to `app/dashboard/layout.tsx` (`navItems` array). If the feature is gated behind the 12-field mandatory profile completion check, no extra wiring needed — the layout already redirects incomplete profiles. If owner-only, gate it on `session.email === "tanhowa19791@gmail.com"`.
6. Add nav item with icon to `app/admin/layout.tsx` (`adminNavItems` array)
7. Add UI strings to `lib/i18n/translations.ts` (EN + TA) and consume via `useT()` — never hardcode user-visible text
8. For user-generated content: call `translateContent("<table>", id, { field1, field2 })` from POST/PUT handlers (fire-and-forget) and accept `?lang=ta` on GET via `getTranslations()`. See Content Auto-Translation
9. Add any needed shadcn components: `npx shadcn@latest add <component>`

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
