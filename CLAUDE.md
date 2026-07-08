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

**AI:** [AI Tools](#ai-tools-dashboardai-tools) · [AI Space (super-admin)](#ai-space-super-admin-only) · [Chatbot / Query Engine](#chatbot--query-engine) · [AI Payment Proof Extraction](#ai-powered-payment-proof-extraction--verification) · [Daily Greetings](#daily-greetings-libdaily-greetingsts) · [Auto Gender Detection](#auto-gender-detection)

**Member features:** [Member Dashboard Widgets](#member-dashboard-home-widgets) · [Field Diary](#field-diary) · [Suggestions & Grievances](#suggestions--grievances-split) · [Polls](#polls) · [Wishlist / IDEA BOARD](#wishlist--idea-board) · [Logo Vote](#logo-vote) · [Elections](#elections-posts-nominations--polling) · [Direct Messages](#direct-messages) · [Group Chat](#group-chat) · [Calendar & iCal](#calendar--ical-export) · [Event RSVP](#event-rsvp) · [Announcement Read Tracking](#announcement-read-tracking) · [Achievements / Badges](#achievements--badges) · [Contributions Tracking](#contributions-tracking) · [Member Directory Sorting](#member-directory-sorting) · [Digital Member ID Card](#digital-member-id-card) · [Profile Completeness](#profile-completeness) · [Mandatory Profile Completion](#mandatory-profile-completion) · [Location Sharing](#location-sharing--nearby-members) · [Trainings System](#trainings-system) · [TANHOWA History Timeline](#tanhowa-history-timeline) · [Member Feedback Loop](#member-feedback-loop--ai-pulse-super-admin-only) · [Service Requests](#service-requests) · [Volunteer Invites](#volunteer-invites)

**Subscriptions / Finance / Tasks:** [Subscription Auto-Sync](#subscription-auto-sync) · [Special Subscriptions](#special-subscriptions) · [Payment Group Linking](#payment-group-linking) · [District Dues](#district-dues-admin) · [Association Dues Summary](#association-dues-summary-member-dashboard) · [Payment Status Transparency](#payment-status-transparency) · [District Roster](#district-roster-admin) · [DC Representation](#dc-representation) · [Finance (Bank Reconciliation)](#finance-bank-reconciliation) · [Expense Vouchers](#expense-vouchers-officials-only) · [Task Management](#task-management-system) · [Task Gamification](#task-gamification) · [e-Resolutions](#e-resolutions-voting-system) · [Reports & Analytics](#reports--analytics-adminreports) · [District Benchmark](#district-benchmark) · [Engagement Analytics](#engagement-analytics)

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
- `lib/` — Shared utilities: `supabase.ts`, `supabase-helpers.ts` (`fetchAllRows()` paginator — page past the 1000-row cap; see Known Gotchas), `auth.ts`, `mail.ts`, `db.ts`, `telegram.ts`, `tn-districts.ts`, `error-logger.ts`, `gemini.ts`, `query-engine.ts`, `contributions.ts`, `chart-config.ts`, `payment-verification.ts`, `subscription-proofs.ts`, `subscriptions.ts` (`isFlexibleAmount()` — flexible/voluntary subscription detection), `audit.ts`, `audit-log.ts`, `razorpay.ts`, `rate-limit.ts`, `daily-greetings.ts`, `translate-content.ts`, `badges.ts`, `validation.ts`, `sms.ts`, `document-urls.ts`, `export-xlsx.ts`, `push.ts`, `api-perf.ts`, `request-ip.ts`, `utils.ts`, `feedback-token.ts` (30-day signed JWT for the inactive-nudge email's feedback link), `id-card.ts` (shared digital-ID-card PDF generator + `idCardName()` — reused by `/dashboard/profile` and `/admin/users`; only "Dr." honorific is shown on the card, all others dropped), `field-diary.ts` (IST date helpers + backfill-window validation), `field-diary-ai.ts` (Gemini success-story draft + voice-note transcription), `field-diary-export.ts` (client-side PDF/Word export with QR share link — see Field Diary)
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

- **User photo:** DB column is `photo_url`, not `avatar_url`. Always use `photo_url` in TypeScript interfaces and code that reads user records. **`photo_url` is often an empty string `''`, not NULL** (~204 of 618 approved members) — `photo_url IS NOT NULL` filters do NOT exclude these. Use `photo_url <> ''` (PostgREST `photo_url=neq.`) when you mean "has a real photo". Also, many `photo_url`s are **Google default monogram avatars** (`lh3.googleusercontent.com/a/ACg8oc…` — a colored letter, not a real face); real Google photos share the same URL prefix, so you cannot tell them apart by URL — only by inspecting the image (the AI photo scorer does this). See Profile Photo Review & Lock.
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
- **Posting/special-duty block dropdown data lives in `lib/tn-districts.ts`, and `TN_DISTRICTS` is consumed _indirectly_.** Nothing in `app/` imports `TN_DISTRICTS` (only the vitest does) — yet editing a district's block array IS what changes the dropdown. The chain: `TN_DISTRICTS` (district → blocks) → `ALL_TN_BLOCK_OPTIONS` (flattened, dedup-suffixed) → the `"Block"` group of `POSTING_LOCATION_GROUPS` → rendered by the `postingLocationGroupsJsx` variable in both `app/onboarding/page.tsx` and `app/dashboard/profile/page.tsx` (the "posting location" and "special duty" `Select`s, which write `posting_details.regular_block` / `special_duty_block`). The block lists are the official Panchayat Unions verified against TN **Rural Development (TNRD)** `*.nic.in` Block Development Offices directories (per-district path varies — usually `/department/block-development-office[s]/`, sometimes paginated). **Removing a block option orphans any member whose stored block equals that value** — query `posting_details->>regular_block` first and PostgREST-PATCH those members onto the correct block before deleting the option. Adding a block is always safe.
- **PostgREST caps reads at 1000 rows — never count or sum by fetching rows.** `supabase.from(t).select("col")` returns at most 1000 rows by default, so `.length` and client-side `reduce(sum)` silently truncate once a table passes 1000 rows. This produced wrong dashboard numbers (Pending subscriptions pinned at exactly 1000, home "Collected" undercounted from a 1000-row sample, Tasks total stuck at 1000). For **counts**, use `{ count: "exact", head: true }`. For **sums / breakdowns** that need the actual rows, page through everything via **`fetchAllRows()` in `lib/supabase-helpers.ts`** — it loops `.range(from, to)` in 1000-row pages until a short page returns. Applied in `app/api/reports/overview/route.ts` (subscriptions + todos) and the stats block of `app/api/subscriptions/route.ts`. Any new "total across all rows" stat on subscriptions/todos/contributions must use one of these, not a bare `select().length`.
- **Publishing a document to all members programmatically** (not via the UI — e.g. a Python/Node tool): `documents.file_url` stores the **storage object key** (e.g. `{userId}-{ts}.pdf`), NOT a URL — `resolveDocumentUrl()` (lib/document-urls.ts) signs it to a 5-min URL on read. To publish: (1) upload the bytes to the private `documents` Supabase Storage bucket (`POST {url}/storage/v1/object/documents/{key}` with the service key + `x-upsert: true`), then (2) INSERT a `documents` row with `file_url=<key>`, `visibility="all"`, `approved=true`, `uploaded_by=<admin id>`. Members then see it at `/dashboard/documents`. **Do not confuse this with the owner-only "Document Vault"** (`/admin/special-documents`, `admin_documents` table) — that one is gated to `tanhowa19791@gmail.com` and is NOT member-visible, so it's the wrong target when asked for something "accessible by all members".

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
| `documents` | Uploaded files (`visibility` = "all" / "specific" / "team"; `folder_id` → `document_folders`) |
| `document_folders` / `folder_access` | Member-facing Document Vault folders + their team/member access (see Document Folders) |
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
| `roster_entries` | Manual (non-registered) officer entries merged with approved users in the admin District Roster (see District Roster) |
| `admin_tasks` | Owner-only private task list (see Owner-Only Admin Tools) |
| `admin_documents` | Owner-only private document vault (see Owner-Only Admin Tools) |
| `task_points` | Task-gamification points ledger (see Task Gamification) |
| `field_diary_entries` / `field_diary_media` | Daily field-work log — text + photo/audio/video, AI success-story drafts (see Field Diary) |
| `dc_representation` / `dc_representation_media` | District Collector/DDH/JDA representation-letter tracker per district (see DC Representation) |

**Additional user columns:**
- `office_address` (TEXT), `last_active_at` (TIMESTAMPTZ, updated on every `/api/users/me` GET), `telegram_chat_id` (TEXT), `telegram_last_cmd_msg_id` (BIGINT — id of the bot's last command-response message; used by `sendTelegramMessageReplace` to delete the prior reply so command replies stack-replace instead of accumulating)
- `profile_nudge` (JSONB: `{ fields, message, requested_at, requested_by }`) — admin nudge for profile completion
- `posting_details` JSONB fields: `regular_district`, `regular_block`, `regular_posting_date` (date the member started at their current regular posting, optional, not part of the mandatory-completion gate), `regular_farm` (optional — TN horticulture facility name, "Farms (if applicable)" dropdown — sourced from `TN_HORTICULTURE_FARMS_DATA` in `lib/tn-districts.ts`, grouped into 8 types: `SHF` / `Park` / `SCN` / `CCC` / `CoE` / `HRTC` / `QCLab` / `UnderDev`), `special_duty_district`, `special_duty_block`, `special_duty_place`, `special_designation` ("HO Tech (State Scheme)" / "HO Tech (GOI)" / "Farm Manager"), `special_farm` (TN horticulture farm name, shown when Farm Manager selected), `deputed_district`, `deputed_block`. **`app/onboarding/page.tsx` does NOT set `posting_details` at all** (onboarding only collects name/phone/occupation/gender/title — posting is filled later on the Profile page). When adding new subfields, update the `PostingDetails` interface and `emptyPosting` constant in `app/dashboard/profile/page.tsx` (and any admin-side duplicate interface in `app/admin/users/_components/` if it needs to read/edit the new field) — no DB migration needed (JSONB). Note: `PostingDetails` is independently redeclared per-file (not a shared type) in `app/admin/users/page.tsx`, `app/admin/users/_components/{EditUserDialog,UserCard}.tsx`, `app/dashboard/members/page.tsx`, and `app/api/logo-vote/route.ts` — a new subfield only needs adding where it's actually read/edited.
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
SH_CLIENT_ID=                    # Copernicus Data Space Ecosystem OAuth client ID (AI Space -> Satellite Field Analysis)
SH_CLIENT_SECRET=                # Copernicus Data Space Ecosystem OAuth client secret
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

### Preview as role (`lib/preview-role.ts`)

Super-admin-only, **client-side-only** sidebar simulation (a `<select>` in the `app/admin/layout.tsx` sidebar header) letting a super-admin see the admin nav as it would render for Member/District Official/State Official/Super-admin, without changing any real permissions. Stored in `sessionStorage` (`tanhowa-preview-role` key), never sent to the server. `previewToUserFields()` swaps only the `{role, official_type, email}` object that `isNavItemVisible()` checks read — email is blanked during any active preview so per-person allowlist checks (e.g. owner-only gates) don't leak the real account's identity through the simulation. Page data still loads under the real account; this is nav-visibility preview only, not impersonation. An amber banner shows while a non-default preview is active, with an "Exit preview" button.

## Daily Greetings (`lib/daily-greetings.ts`)

Birthday + festival greetings system. Triggered by `/api/cron/daily-greetings` (Vercel cron at 01:30 UTC — see the **Cron Jobs** section below for the full schedule + the lambda-killed fire-and-forget bug that drove the move from `/api/users/me` to a dedicated cron). Uses the atomic-claim lock pattern — `INSERT` into `site_settings` with key `daily_greetings_run_{YYYY-MM-DD}` so only one concurrent caller wins.

- **Birthday:** Finds members with matching DOB month/day, sends personalized email + Telegram + creates announcement (rich format: designation • block, district + per-member wish picked deterministically by `(hash * 31 + charCode)` from a 20-wish array)
- **Festival:** Checks 15+ Tamil Nadu/Indian festivals against today's date, sends broadcast email + Telegram + creates announcement (text-only by design — no per-person photo)
- **Birthday photos (2026-05-02):** All four birthday channels include the celebrant's photo (or initials fallback). Personal email gets a 96px circle at the top; broadcast email shows a 40px circle next to each name; Telegram personal DM uses `sendPhoto` with HTML caption (falls back to `sendMessage` when no/untrusted photo); the in-app announcement embeds `![Name](photo_url)` markdown which the dashboard renderer turns into an inline circular avatar. Trusted photo hosts: `*.supabase.co`, `*.fbcdn.net`, `*.googleusercontent.com`, `platform-lookaside.fbsbx.com` — same allowlist enforced in `lib/daily-greetings.ts:isTrustedPhotoUrl`, `tools/daily_greetings.py:is_trusted_photo_url`, and the announcement renderer's `isSafeImageUrl` in `app/dashboard/announcements/page.tsx`. Untrusted URLs are silently dropped.
- **Fallback:** Python tool `tools/daily_greetings.py` for manual/forced runs — shares the same atomic lock and the same rich birthday format including photos (synced 2026-05-02)
- **NOT fire-and-forget anymore:** previously called from `GET /api/users/me` on the first visitor each day, but Vercel killed the lambda mid-execution after the lock row was inserted — locking out the cron and skipping the day. Removed 2026-05-01. Errors now flow through `logError()` instead of silent catch.

## Auto Gender Detection

On profile save (`PUT /api/users/me`), `detectGender()` auto-detects gender from 130+ common Tamil/Indian female first names + suffix matching (LAKSHMI, DEVI, SELVI, MATHI, VALLI, AMMAL, RANI, PRIYA, NAYAKI). Also sets title (Mr./Mrs.) when not already set. Does not override existing gender.

**Honorific stripping (same route):** after gender detection, a leading honorific is stripped from the stored `name` and moved into `social_links.title` (`TITLE_MAP`: MR/MRS/MISS/MS/DR/PROF/ER/THIRU/TMT/SELVI/SMT — note **Sri/Shri are deliberately excluded** since they're name components like "Srividhya", not titles). This keeps `name` clean everywhere it's shown (ID card, directory, emails, chatbot). Gender detection still runs on the pre-strip name because it keys off the title prefix. The chatbot greeting applies the same logic read-side via its own `firstName()` helper. Existing rows were one-time backfilled by `scripts/strip-honorific-names.mjs` (dry-run default, `--execute` to apply).

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

## AI Space (super-admin only)

Consolidated hub at `/admin/ai-space` gathering every AI-powered capability in the app in one place, gated to `role === "super_admin"` (same `superAdminOnly` array pattern as `/admin/pest-training` — nav link hidden via `isNavItemVisible` in `app/admin/layout.tsx`; **pages don't re-check role client-side, only the underlying API routes 403 non-super-admins**, matching the rest of the admin panel's convention).

- **`/admin/ai-space`** — card hub linking to everything below (no data of its own).
- **`/admin/ai-space/tools`** — admin-side view of the same 7 member AI Tools (reuses the exact components from `app/dashboard/ai-tools/_components/` — no duplicated logic; the underlying `/api/ai-tools/*` routes are unchanged and still member-accessible from `/dashboard/ai-tools` too).
- **`/admin/ai-space/satellite-ndvi`** — pulls a Sentinel-2 NDVI (or Sentinel-1 RVI, cloud-penetrating radar) time series for an uploaded/pasted field-boundary KML from the Copernicus Data Space Ecosystem, detects rise-peak-fall crop cycles, and charts it. TypeScript port of the `field-ndvi-analysis` skill's Python scripts (`tools/fetch_ndvi.py` / `tools/fetch_s1_rvi.py` at the project root, one level up from `tanhowa/`) — **`lib/sentinel-hub.ts`** (`parseKmlPolygon`, `fetchNdviTimeSeries`, `fetchRviTimeSeries`, `findCropCycles` — a JS approximation of `scipy.signal.find_peaks(prominence=...)`) + **`POST /api/ai-tools/satellite-ndvi`** (super_admin-gated, rate-limited 10/min, `SH_CLIENT_ID`/`SH_CLIENT_SECRET` required in `.env.local` + Vercel). Contribution action: `used_ai_satellite_ndvi`.
  - **Data Source has 3 modes**, default `combined`: `ndvi` (optical only), `rvi` (radar only), and **`combined`** — fetches NDVI for the full range, finds gaps ≥21 days via `findDataGaps()`, then radar-checks the largest gaps (≥40 days, capped at 6 per run) via `fetchRadarGapFills()` to confirm whether/roughly-when a crop cycle occurred during cloud cover. Radar peaks use a range-relative prominence (`findRadarPeaks()`, 20% of the segment's own value spread) since RVI has no absolute major/minor scale like NDVI's 0.6 cutoff — they're reported as "confirmed" dates, not classified major/minor. Chart shades gap windows (`ReferenceArea`); a separate card lists each gap with its radar verdict (confirmed / no signal / not checked — short gaps below the 40-day threshold aren't worth a radar round-trip).
  - **KML upload UX:** raw KML text is hidden by default after upload (just a filename chip) — "Edit raw KML" toggles the textarea for pasting/inspecting manually.
  - **Dates display dd-mm** (chart axis) or **dd-mm-yyyy** (peak/gap lists) via local `ddmm()`/`ddmmyyyy()` helpers — not ISO — since this is an India-only field-ops tool.
- Existing pages just linked from the hub, not moved: **Pest AI Training Review** (`/admin/pest-training`), **AI Photo Quality Review** (`/admin/photo-review`), **AI Feedback Pulse** (`/admin/feedback-pulse`), **AI Task Classification** (bulk-classify button lives on `/admin/todos` — no standalone page exists for it).
- i18n keys under `aispace.*` and `ndvi.*` in `lib/i18n/translations.ts`.

## Chatbot / Query Engine

AI-powered chatbot with live portal data access via Gemini function calling.

**Architecture:**
- `lib/gemini.ts` — `SYSTEM_PROMPT`, `QUERY_TOOLS` (FunctionDeclarationsTool definitions with SchemaType params), `getGemini()` singleton
- `lib/query-engine.ts` — `executeQuery()` dispatcher (`QUERY_MAP`) mapping function names to Supabase queries; ~16 read functions + ~24 action functions
- `app/api/chat/route.ts` — POST endpoint with function-calling loop (max 3 rounds), rate limited 20/min per IP. **Multimodal:** accepts an optional `image` (`{ data: base64, mimeType }`) and forwards it as an `inlineData` part (gemini-2.5-flash is vision-capable).
- `components/chatbot-widget.tsx` — Floating chat UI with quick-query buttons. **Open to all approved members** (not role-gated). Mounted once in the root layout (`app/layout.tsx`) but **only renders/fetches on `/dashboard` and `/admin` routes** (gated via `usePathname()` → `onAppRoute`) — never on public landing/auth pages, so it can't leak the previous member's session after logout. **Auto-opens once** per session; ✕ sets `sessionStorage["tanhowa-assistant-dismissed"]`. Greeting uses a honorific-stripped first name (`firstName()`).
  - **Dismissable FAB:** a small × on the floating button hides it for the session (`sessionStorage["tanhowa-assistant-fab-hidden"]`); the auto-open effect respects it. The `<FeedbackWidget>` pill has the same per-session × (`tanhowa-feedback-dismissed`).
  - **Sidebar entry point:** both sidebars (`app/dashboard/layout.tsx` *Help & Tools*, `app/admin/layout.tsx` *Overview*) have a "TANHOWA Assistant" item (`nav.assistant`, Flower2 icon) rendered via an `assistantAction` nav-sentinel (same pattern as `feedbackGroup`). Clicking it dispatches a `window` `"open-tanhowa-assistant"` event; the widget listens, un-hides its FAB, and opens. Use this event to open the assistant from anywhere.

**Read/query functions (no side effects):** `search_announcements`, `search_events`, `search_faqs`, `search_members`, `search_documents`, `search_trainings`, `search_resolutions`, `get_portal_stats`, `get_my_profile`, `get_my_subscriptions` (includes voluntary-fund summary), `get_my_tasks`, `get_my_achievements`, `get_my_contributions`, `get_my_adh_pm_status`. Admin reads: `get_member_payments` (any member's dues/contributions by name), `get_adh_pm_stats` (ADH(PM) campaign totals — mirrors `/admin/adh-pm`, state-admin/state only).

**How it works:** message → chat history + system prompt → Gemini picks tools → `executeQuery()` runs Supabase queries → Gemini turns results into prose → loop ≤3 rounds. Personal `get_my_*` queries are scoped to `{ userId, email, role }`.

**Adding a new query/action function:** (1) FunctionDeclaration in `lib/gemini.ts` `QUERY_TOOLS`; (2) implementation in `lib/query-engine.ts`; (3) entry in the `QUERY_MAP` dispatcher; (4) for actions, list it in the SYSTEM_PROMPT MEMBER/ADMIN/OWNER ACTIONS block (otherwise Gemini refuses to act).

### Action tools (side effects)

The chatbot is a full ops console — ~24 action tools that write/notify, every one re-checking authority from the DB and audit-logging `via: assistant`. Tiers:

| Tier | Tools |
|------|-------|
| **Member self-service** (own data only, no confirm) | `rsvp_event` (RSVP/cancel own event), `vote_poll` (by title + option), `add_wishlist_idea`, `submit_grievance` (grievance/suggestion/service-request — category auto-derived from `kind`; ticket # by trigger), `enroll_training`, `set_notification_pref` (email/telegram/in-app/digest/whatsapp), `add_contribution` (pending voluntary contribution to a flexible fund the member is in), `update_my_task` (commit / submit-for-review own task; awards points), `get_telegram_connect` (returns `t.me/tanhowa_task_bot?start=email` deep link), `update_my_profile` (phone/home/office address only — name/designation/district stay on the Profile page's full-replace form) |
| **Admin / official** | `send_member_email`, `nudge_member`, `approve_registration`, `assign_task` (member or team), `create_announcement`, `create_event`, `create_poll`, `send_member_telegram`, `create_subscription` (one member), `set_payment_status`, `set_voucher_status` |
| **State-Admin** | `set_official` (make/remove DS/DJS — grants admin access) |
| **Owner only** (`tanhowa19791@gmail.com`) | `suspend_member` (suspend/reinstate), `create_finance_entry` (manual cheque debit) |

Member self-service tools act only on the caller's own data, so they use `ctx.userId` directly (no `resolveActor`/confirm) and mirror their REST route exactly (same insert shape, dup guards, `logContribution`). New `ContributionAction`: `poll_voted`.

**Two-step confirm (preview → `confirm:true`)** — financial/role/destructive actions never execute on the first call; they return a preview, the assistant asks the user to confirm, then re-calls with `confirm:true`: `set_payment_status`, `set_voucher_status`, `set_official`, `create_subscription`, `suspend_member`, `create_finance_entry`.

**Action-tool foundation (`lib/query-engine.ts`)** — reuse instead of re-inlining:
- `resolveActor(ctx)` — re-fetches role/official_type/district from the DB (JWT role can be stale); returns `{ isAdmin, isState, isDistrict, canAdminAct, district, ... }`.
- `resolveMember(name, actor)` — name search + district scoping (district officials see only their own district) + disambiguation; returns `{ member }` or `{ fail }` (returned verbatim so the assistant asks the user to pick).
- Owner gate is a literal `ctx.email === "tanhowa19791@gmail.com"` check (mirrors the admin Users route); finance gate is `super_admin || isFinanceTeamMember()`.

### Voice (hands-free)

`components/chatbot-widget.tsx` adds voice I/O via the browser Web Speech API:
- **Voice input (mic button):** before starting `SpeechRecognition`, it calls `navigator.mediaDevices.getUserMedia({audio:true})` to trigger the browser's permission prompt — **SpeechRecognition alone never prompts on Android Chrome / the installed PWA**, it just fails with `not-allowed`. Transcribes (lang `ta-IN`/`en-IN`) and auto-sends on completion.
- **Spoken replies (speaker toggle):** `SpeechSynthesis` reads each new bot reply (markdown/emoji stripped); persists in `localStorage["tanhowa-assistant-tts"]`.

> **Mic gotcha:** voice requires `Permissions-Policy: microphone=(self)` in `next.config.ts`. It was `microphone=()` (disabled for ALL origins incl. self), which blocked `getUserMedia`/`SpeechRecognition` at the policy level — no prompt could ever appear regardless of browser settings.

### Attach chooser (📎)

The paperclip opens a **chooser** (`attachChoice` message) instead of force-routing to payment proof. Three routes:
- **Payment proof** → `startProofUpload()` (also still on the amber "Upload proof" strip).
- **Expense bill** → navigates to `/dashboard/vouchers` (AI bill scan).
- **Show the assistant** → pick any image; it's held as `pendingImage` (thumbnail in the user bubble) and sent to the chat backend as an `inlineData` part so Gemini vision can answer (pest ID, read/summarize a document, describe a receipt). Send is enabled with an image even when the text box is empty.

`sendMessage` still locally intercepts genuine upload *intent* (`PROOF_INTENT` regex) but **skips questions** (`QUESTION_RX`) and skips when an image is attached, so "how much did X pay?" reaches the assistant instead of the uploader.

### Help discovery

So members discover what's possible: a **"What can I do here?"** chip is the first entry in `QUICK_QUERIES` (`chatbot-widget.tsx`; i18n key `chat.q_help`, en+ta). The SYSTEM_PROMPT has a **HELP block** — on "help" / "what can you do" / "options" it returns a grouped, scannable menu (**Ask me** = reads; **I can do for you** = actions), and only surfaces admin/owner capabilities when the caller is an admin/official.

## UI Labels

- `super_admin` role displays as **"State-Admin"** in badges and UI
- District officials (`official_type=district`) display as **"District-Admin"**
- State-Admin approval remark: "Approved. - Name, Designation, TANHOWA."
- DS/DJS approval remark: "Provisionally approved. - Name, Designation, TANHOWA."

## Reports & Analytics (`/admin/reports`)

The reports page is organized into 7 tabs, each in its own component under `app/admin/reports/_components/`:

| Tab | Component | Data Source | Charts |
|-----|-----------|-------------|--------|
| Overview | `overview-tab.tsx` | `/api/reports/overview` | Stacked bar (collection by period), Task donut, Collection rate ring |
| Subscriptions | `subscriptions-tab.tsx` | `/api/reports/subscriptions` | District comparison horizontal bar |
| Expenses | `expenses-tab.tsx` | `/api/reports/expenses` | Category pie, Status bar |
| Contributions | `contributions-tab.tsx` | `/api/contributions?breakdown=true` | Monthly trend area, Action type pie + time bar |
| Members | `members-tab.tsx` | `/api/reports/members` | Registration trend area, District bar, Profile completion donut |
| Performance | `performance-tab.tsx` | `/api/reports/performance` | Team comparison bar, Task completion trend area. Period/team filters, ranked member table (top 3 gold/silver/bronze), PDF export |
| Field Diary | `field-diary-tab.tsx` | `/api/reports/field-diary?days=7\|30\|90` | Metric cards (members/entries/compliance rate/stories published), per-district compliance horizontal bars, recent highlights feed |

**Charts:** Use recharts via the shadcn `chart` component (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`). Brand colors are defined in `lib/chart-config.ts` — use `CHART_COLORS` for status colors and `CATEGORY_PALETTE` for category/district breakdowns.

**PDF export:** Uses `jspdf` + `jspdf-autotable` for client-side PDF export. Pattern: create landscape doc → header text → autoTable for district summary → autoTable for member details → color-coded status text. Theme color: `fillColor: [45, 106, 79]` (deep green). **autoTable overflow gotcha:** default `bodyStyles.overflow: "ellipsize"` silently truncates long values (e.g. "MR. SIVAKUMA…" in the Expenses report's Official column). Use `overflow: "linebreak"` (wrap) when full data must be visible, and widen fixed `columnStyles` cellWidths for name-bearing columns — fixed in `expenses-tab.tsx`.

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

## Field Diary

Mandatory-in-spirit daily field-work log for members — text report + optional photo/audio/video, self-published with no approval gate. **Not the same feature as the "Tour Diary" under Letters & Forms** (that's an unrelated, owner-only, client-side monthly travel-claim PDF with zero DB persistence).

**Tables:** `field_diary_entries` (member_id, entry_date, report_text, is_success_story, district/block — trigger-snapshotted same pattern as `assign_grievance_district()`, `story_status` none→queued→drafted→dismissed/published, story draft fields, `published_announcement_id`) + `field_diary_media` (entry_id, media_type photo/video/audio, file_path, mime_type, file_size, `transcript` for voice notes). Schema: `supabase/field_diary_schema.sql` + `field_diary_multi_entry.sql` (drops the original `UNIQUE(member_id, entry_date)` — **multiple entries per day are now allowed**, every POST inserts a fresh row rather than upserting) + `field_diary_voice_transcript.sql`.

- **Member page:** `/dashboard/field-diary` — compose box for today's entry or a backfilled past date (`BACKFILL_WINDOW_DAYS=7`, `lib/field-diary.ts:isValidBackfillDate`/`isValidEntryEditDate` — editing an existing entry's date allows today, creating a new backdated one doesn't), attach up to 6 photos / 2 audio / 1 video per entry, interactive zoom/pan photo lightbox (wheel/double-click/drag, up to 6×), inline edit/delete on past entries including moving an entry's date. **PDF export** (all members) and **Word export** (owner-only, `tanhowa19791@gmail.com` — "still being polished") via `lib/field-diary-export.ts`, both embedding a QR code that links to a shareable copy of the file uploaded to the public `field-diary-exports` bucket, filename `{YYYYMMDD} {Name}_{Designation}_Field_Diary.{ext}`.
- **Media upload (`/api/field-diary/media`):** goes straight through the Next.js route (no separate signed-upload flow), private bucket `field-diary-media` (auto-created). `MEDIA_RULES` has a wide audio MIME allowlist + extension fallback (`isAllowedMedia`) to tolerate real phone-recording quirks (iPhone `x-m4a`, Android `3gpp`/`amr`, codec-suffixed `webm;codecs=opus`) — a narrow exact-match whitelist previously rejected real-world voice notes. Uploading a photo fires `maybeQueueStory()`; uploading audio fires `transcribeAndAppendVoiceNote()` (Gemini transcribes Tamil/English → English, saves to `field_diary_media.transcript`, and **appends** it to the entry's `report_text` so it flows into exports/story drafts too).
- **Export photo CORS fix:** `POST /api/field-diary/export/photos` fetches photo bytes **server-side** and returns base64 data URIs — the original client-side approach (`<img crossOrigin>` + canvas) silently produced blank/missing photos whenever Supabase's signed-URL response lacked browser-acceptable CORS headers for pixel access. Any new "bake a remote image into a client-generated PDF/DOCX" feature should fetch server-side, not canvas-decode client-side.
- **AI success-story pipeline (`lib/field-diary-ai.ts`):** `maybeQueueStory()` auto-queues an entry when `is_success_story` is checked or `report_text.length > 800` (atomic `none→queued` claim to dedupe concurrent callers); `generateSuccessStoryDraft()` (Gemini 2.5-flash) drafts a `{title, body}` from the text + up to 3 photos, saved as `story_status='drafted'`. Review queue: `/admin/field-diary-stories` + `GET/POST/PUT /api/field-diary/stories` — state officials see everything, district officials scoped to their own district (403 if no district set). `PUT action:"publish"` inserts a real `announcements` row (mirrors `POST /api/announcements`), sends `notifyNewAnnouncement`, back-fills `published_announcement_id`, and awards points/contributions to the original member.
- **Compliance dashboard:** `/admin/field-diary-compliance` + `GET /api/field-diary/compliance?date=` — today's submission rate, per-district breakdown (state-level only), not-submitted list, and a "missed 3+ consecutive days" list. Same state-all / district-scoped authority split as the story queue. **Read-only — never gates or blocks a member's own submission.**
- **Nightly cron** `/api/cron/field-diary-compliance` (`30 18 * * *` UTC = 00:00 IST, `vercel.json`): (1) atomic-claim locked nudge — emails + Telegrams every approved member with no entry for yesterday; (2) retries any `story_status='queued'` entry stuck >10 min (killed serverless invocation) by re-running `generateSuccessStoryDraft`.
- **Reports tab:** `app/admin/reports/_components/field-diary-tab.tsx` (`GET /api/reports/field-diary?days=7|30|90`) — members/entries/compliance-rate/stories-published metric cards, per-district compliance bars, recent highlights feed.
- **Gamification hooks:** `awardTaskPoints` gained a 5th optional `ref?: {type, id}` param alongside the legacy `todoId` — `todo_id` has a hard FK into `todos` and can't be reused for a diary entry's id, so a new unique index on `(user_id, ref_type, ref_id, reason)` backs `diary_entry` (+10) and `diary_success_story` (+15) awards. **Reuse the `ref` param, not `todoId`, for any future non-todo point source.** Contributions: `diary_entry_submitted` (5 min), `diary_success_story_published` (10 min). Badge: **Field Reporter** (10+ entries) in `lib/badges.ts`.
- **Nav:** member sidebar under *My Activity* (`nav.field_diary`, no gating); admin sidebar has `nav.field_diary_stories` (Content section) and `nav.field_diary_compliance` (Reports section), both visible to `super_admin` + state/district officials only.

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

- **Tracked actions:** Payment verification, member approval, task creation/updates, announcements, events, documents, grievances, vouchers, profile updates, document downloads, AI tool usage, training/idea/chat/logo-vote/poll/Project H actions, field diary entries + published success stories (46 action types — see the `ContributionAction` union in `lib/contributions.ts` for the current exhaustive list rather than trusting this count to stay in sync)
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

Admin creates via the single **"New Subscription"** button on `/admin/subscriptions` — one dialog with a **Yearly / Special** toggle (`createType` state); Yearly → `handleBulkCreate`, Special → `handleSpecialCreate` (the two were merged from separate buttons). District report column headers auto-shorten special periods (strips "For " prefix and " Case YYYY" suffix).

**Scope — all vs one member:** a second **All members / Specific member** toggle (`createScope`) sits under the Yearly/Special tabs and applies to both. "Specific member" reveals a **server-side** name search (300ms-debounced `GET /api/subscriptions?member_search=` → top-20 approved, admin-only — do NOT derive the picker from loaded subscriptions, which are paginated and miss members without a row on the page). Picking a member POSTs `action: "member-create"` (one pending row for that `user_id`, approved-only, dup-period guarded) instead of `bulk-create`. The chatbot's `create_subscription` does the same per-member create by name.

The create dialog also has an optional **Description** (`subscriptions.description`, shown on the member's subscription card) and a **Flexible amount** checkbox (`subscriptions.flexible_amount`). Schema: `supabase/subscription_description_flexible.sql`. Flexibility is resolved by **`lib/subscriptions.ts:isFlexibleAmount(sub)`** = `flexible_amount === true` OR period starts with "Volunteer" (backward compat) — use this helper everywhere instead of re-checking the period string; when flexible, members may enter any amount and the amount-mismatch warning is suppressed (member edit allowed server-side in the PUT handler gated on the same helper).

### Voluntary funds — pay any amount, any number of times (`REFUNDABLE (Emergency Fund)`)

A flexible fund is a **recurring voluntary contribution**, NOT a fixed due. The Emergency Fund's 600+ rows are `flexible_amount=true` with `amount=0` (unpaid) so nothing reads as "owed". Key rules:
- **A flexible row is a contribution, never a due.** Treat `isFlexibleAmount()` rows as paid contributions (sum only); never count them as pending/overdue. Guards live in: member "Due" metric (`/dashboard/subscriptions`), `/api/notifications` (uses `amount>0` to skip the ₹0 placeholder), `/api/subscriptions/payment-status` (excludes flexible periods from the period selector), and the chatbot pending tally.
- **On paid approval of a flexible sub, the PUT handler sets `amount = paid_amount`** so amount-based totals reflect the actual contribution (a zeroed row approved with `paid_amount>0` otherwise stays `amount=0` and shows a bogus "+extra" badge).
- **`add-contribution`** (POST action, member-allowed) creates a NEW pending flexible row → a *ledger* of contributions (pay multiple times). Member page shows a purple per-fund "Add Contribution" card with the total contributed.
- **`split-payment`** (POST action, member-allowed) links several of the member's own unpaid dues + an optional flexible contribution under one `payment_group_id`, one proof/txn, submitted together. Member "Combine Payment" dialog. Admin adjusts each row amount before approving (existing per-row edit + auto-match cascade — no separate admin UI).
- Auto-sync (`?sync=true`) only touches 4-digit year periods, so it never recreates a fund row.

## ADH (PM) Designation Query

One-off campaign to tag members who serve as **ADH (PM)** specifically (a literal occupation distinct from plain ADH). Members were emailed "Are you an Assistant Director of Horticulture (PM)?" with one-click Yes/No.
- **`GET /api/adh-pm-confirm?t=<jwt>&a=yes|no`** — token-auth (HS256 `{ userId, purpose: "adh_pm" }`, 60-day), no login. Yes → sets occupation to `Assistant Director of Horticulture (PM)`; No → sets `social_links.adh_pm_optout=true` (excluded from re-asks). Returns a branded bilingual HTML page.
- **Admin tracker:** `/admin/adh-pm` + `GET /api/admin/adh-pm` (super_admin + state officials) — groups members into Now ADH(PM) / Said No / No reply.
- **Chatbot:** `get_my_adh_pm_status` reports whether the caller's own response was recorded; `get_adh_pm_stats` (state-admin/state only) reports the campaign totals (Now PM / Said No / No reply).

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

**Phone-number change tracking (2026-07-05):** `logPhoneChange(actorUserId, targetUserId, oldPhone, newPhone, changedBy)` in `lib/audit-log.ts` — no-ops when the number didn't actually change (skips routine profile saves). Writes an `audit_logs` row (`action: "phone_number_changed"`, `target_type: "user"`, `details: {old_phone, new_phone, changed_by: "self"|"admin"}`) and stamps `users.phone_changed_at` (schema: `supabase/phone_changed_at_schema.sql`, same pattern as `photo_uploaded_at`) for a fast "last changed" glance on the admin member card (`UserCard.tsx`, under the Phone field). Wired into both write paths: `PUT /api/users/me` (self-service — fetches the pre-update phone via the existing `currentUser` lookup) and `PUT /api/admin/users` `action=edit-profile` (admin edit — fetches the target's pre-update phone only when `body.phone` is present). Forward-only: no backfill of changes from before this shipped, since prior values were already overwritten. Full old/new history is only in `audit_logs`, not on the user row — the column is a pointer, not the record.

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

**Lifecycle** is driven entirely by each post's `status`: `draft → nominations_open → voting_open → closed`. The nomination and polling pages react to status changes automatically — there is no separate "open election" action, just move the post's status.

- **The ENTIRE Elections area is restricted** to `super_admin`, **state officials** (`official_type=state`), and the owner `sivikoomba@gmail.com` — management, nomination, AND polling. Regular members and district admins see nothing election-related. The single source of truth is **`hasElectionAccess(session)` in `lib/auth.ts`**; keep these four gates in sync with it: all `/api/elections*` routes (`route.ts`, `nominate/route.ts`, `vote/route.ts`), the `/admin/elections` filter in `app/admin/layout.tsx`, the `electionsOnly` nav flag + the election-route redirect effect in `app/dashboard/layout.tsx`. **To reopen elections to members, relax this one helper** (and the nav/redirect checks that mirror it). *(Note: nomination/voting were originally member-facing and the eligibility logic still computes per-district member scoping — it's just gated off at the door for now.)*
- **Officials management page:** `/dashboard/elections` (re-exported as `/admin/elections`) — create/delete posts, add/approve/withdraw candidates, set post status.
- **District-scoped posts:** `election_posts.district` lets DS/DJS exist once per district — uniqueness is `UNIQUE(title, COALESCE(district,''))` (a unique index, NOT the original `UNIQUE(title)`; the migration drops `election_posts_title_key`). State posts (President, etc.) keep `district = NULL`. The Add-Post dialog shows a required district dropdown only for titles in `DISTRICT_SCOPED_TITLES` ("District Secretary", "District Joint Secretary"). Seed all 76 district posts via `supabase/elections_seed_district_posts.sql`.
- **Add-candidate member search:** the Name field is a typeahead against `GET /api/users?status=approved&search=` (debounced 250 ms); selecting a member links `election_candidates.user_id` and auto-fills district. Free-text names still work (user_id stays null).
- **Member self-nomination:** `/dashboard/nominate` + `/api/elections/nominate` (GET eligible open posts + own nominations, POST submit, DELETE withdraw). Only `nominations_open` posts appear; DS/DJS restricted to the member's own `regular_district`; name/district pulled from profile; lands as a candidate with `status=nominated` for official approval. One active nomination per post (409 on dupe). **Now gated by `hasElectionAccess()` (GET/POST/DELETE) — not member-facing while elections are restricted.**
- **Polling dashboard:** `/dashboard/polling` + `/api/elections/vote` (GET dashboard, POST cast/change, DELETE retract). Shows `voting_open` + `closed` posts. **Secret ballot:** `election_votes` stores `voter_id` only to enforce `UNIQUE(post_id, voter_id)` and surface the caller's own selection — the API never returns who voted for whom, only tallies. **District-scoped:** voters see only their own district's DS/DJS post (others are watch-only). Tallies + turnout (`votes / eligible`, eligible = approved members overall or per-district) refresh every 15 s; closed posts highlight the winner. Only `status=approved` candidates appear on the ballot. **Now gated by `hasElectionAccess()` (GET/POST/DELETE) — not member-facing while elections are restricted.**

## District Roster (admin)

Admin-only consolidated roster at `/admin/roster` + `/api/roster` (all handlers `isAdmin`-gated). Table: `roster_entries` (schema `supabase/roster_entries_schema.sql`).

- **Two sources merged:** every approved user (`source: "registered"`, from `/api/users?status=approved`) plus manual `roster_entries` rows (`source: "manual"`, for non-registered officers). Manual rows show a "Manual" badge and can be deleted; registered rows cannot.
- **Grouped by district**, members within a district sorted by designation rank (Additional Director → Joint → Deputy → Assistant → HO → Retd → other) via the page's local `rank()`, then block. Search + district filter apply to both sources.
- **Add Member** writes a manual `roster_entries` row (name + district required; designation/block/phone/email optional), audit-logged `roster_add` / `roster_delete`.
- **Export:** "Print" opens a clean grouped print view in a new window (browser dialog → print or Save-as-PDF, Unicode-safe via system fonts); "Save PDF" downloads a landscape jsPDF (`autoTable` per district). Both honor the active search + district filter. Names are Latin-script so jsPDF is safe; the Print path covers any Tamil.

## DC Representation

Tracks whether each of TN's 38 districts has delivered TANHOWA's representation letter to the **District Collector**, **DDH**, and **JDA** — one row per district+office. Self-reported by that district's DS/DJS, rolled up state-wide for the State-Admin.

- **Page:** `/admin/dc-representation` — district officials get a direct 3-office-card edit view for their own district; state/super-admin get a rollup table across all 38 districts with a drill-in dialog to edit any district.
- **API:** `/api/dc-representation` (GET rollup or single-district detail, PUT upsert status/date/remarks — district forced to the caller's own district for district officials) + `/api/dc-representation/media` (letter/photo uploads to the private `dc-representation-media` bucket, same signed-URL pattern as Field Diary media).
- **Tables:** `dc_representation` (district, office, status `given`/`not_given`, date_given, remarks, submitted_by — `UNIQUE(district, office)`) + `dc_representation_media` (entry_id FK, media_type `letter`/`photo`, cascade-deleted with the entry). Schema: `supabase/dc_representation_schema.sql`.
- **Caps:** 1 letter, 6 photos per district+office entry.

## Payment Status Transparency

All logged-in members can view district-wise subscription payment status at `/dashboard/payment-status`.

- **API:** `GET /api/subscriptions/payment-status?period=2026` — any authenticated user (not admin-only)
- **Response:** `{ districts[], periods[], summary, topDistricts[] }` — members grouped by district with paid/pending/overdue status
- **UI:** 4 summary MetricCards, top 5 districts by payment rate with progress bars, district-wise expandable accordion with member names + StatusBadge, period selector, search filter
- **Sorting:** Members within each district sorted by designation hierarchy (ADDH → JDH → DDH → ADH → HO)
- **Excludes:** Test accounts (tanhowa19791@gmail.com, tanhowaadmin@tanhowa.in)

## District Dues (admin)

Two related but distinct district-scoped dues tools, both open to admins, state officials, and district officials (DS/DJS see only their own district — `getOfficialInfo()` district-scoping pattern, not owner-gated):

- **`/admin/district-dues` + `/api/district-dues`** — the older calculator. District-grouped table with **inline-editable** `amount_paid` / `additional_money` per member, written into `users.social_links.dues_summary` — a manual, self-reported figure **not derived from real `subscriptions` rows**. Predates the verified-data approach below; kept for now but consider retiring once the newer tool covers the same ground.
- **`/admin/district-member-dues` + `/api/district-member-dues`** — the newer, verified-data tool for DS/DJS to see their district's members' dues. Built entirely from real `subscriptions` fields (`amount`, `paid_amount`, `payment_proof_url`) via `fetchAllRows()` — no `social_links` involved, read-only. District-grouped accordion → per-member drill-down showing the same `Description | Due Amount | Amount Paid | Extra Paid | Proof` breakdown as the member's own Association Dues Summary table (below), with a signed-URL proof preview reusing `fetchSignedPaymentProofUrl()` / `<PaymentProofPreviewDialog>`.

## Association Dues Summary (member dashboard)

Card on `/dashboard/subscriptions` (`t("subs.association_dues")`) showing each member their own dues broken down by fund, entirely from real `subscriptions` data (no self-report/Save flow — that was removed in favor of admin-verified figures). Rows: `Annual Subscription (up to 2025)`, `Annual Subscription (2026)`, then one `Special Fund – <label>` row per special period the member has (via `displayPeriod()`/label cleanup — see below). Columns: **Due Amount (₹) | Amount Paid (₹) | Extra Paid (₹) | Proof** — Amount Paid sums `paid_amount` for `status==="paid"` rows, Extra Paid is `max(0, paid − due)`, Proof opens a signed-URL preview of any subscription in that fund with a `payment_proof_url`. Table uses `border-separate` (not `border-collapse` — the latter breaks `position: sticky` on table cells, especially iOS Safari) with a sticky first (`Description`) column so the row label stays visible on mobile horizontal scroll.

**`lib/subscriptions.ts`** also exports `displayPeriod(period)` alongside `isFlexibleAmount()` — renders the stored period `"Special Amount"` as `"Special Fund"` for display everywhere (dashboard, admin pages, chatbot, calendar, receipts, AI assistant messages) while leaving the actual stored `period` value untouched, since it's used for dedup/matching (`.ilike("period", "Special Amount")` in `/api/subscriptions`). Use this helper — not a raw `sub.period` — anywhere a period is rendered as user-facing text.

## Digital Member ID Card

On-screen TANHOWA-branded ID card displayed on the profile page + downloadable PDF.

- **On-screen:** CSS card with TANHOWA green gradient header, photo, name, designation, district/block, DS/DJS badge, member ID (first 8 chars of UUID), member since year, valid until end of current year, phone
- **PDF download:** `downloadIdCard()` from `lib/id-card.ts` using jsPDF, credit-card size (85.6×54mm landscape). Photo loaded via canvas→base64 for cross-origin images. TANHOWA branding header (RGB 45, 106, 79).
- **Shared module:** both the PDF and the name formatting live in `lib/id-card.ts` (`downloadIdCard`, `idCardName`, `ID_CARD_MEMBER_ID`). `idCardName()` uses split `first_name`/`last_name` when present, else the single `name` field (admin records), and **shows only the "Dr." honorific** — Mr./Mrs./Miss/Ms./Thiru/Tmt/Selvi etc. are dropped. Edit the layout here, not in the page components.
- **Locations:** member self-view on the profile page (`/dashboard/profile`); admins view any member's card via the **"ID Card"** button on each card in `/admin/users` → `app/admin/users/_components/IdCardDialog.tsx` (on-screen preview + Download PDF).

## Member Directory Sorting

Members page (`/dashboard/members`) sorts by designation hierarchy within each district:

```
ADDH (1) → JDH (2) → DDH (3) → ADH (4) → HO (5) → Retd (6) → Others (7)
```

`getDesignationRank()` function matches on `occupation` field substrings. Secondary sort by block name, tertiary by member name.

**Designation options:** "Others" (with custom input) and all 5 retired designation variants have been removed from both onboarding and profile pages. Only active designations remain: HO, ADH, DDH, JDH, ADDH, System Admin.

## Team Lead Role & Legal Advisor

- **Team Lead:** `team_members.role` column supports "lead" designation. Admin teams page has Crown toggle per member. Leads shown first with amber highlight and Crown icon on both admin and member teams pages. API payload uses `members_with_roles: [{ user_id, role }]`.
- **WhatsApp group link:** `teams.whatsapp_link` (TEXT, schema `supabase/teams_whatsapp_schema.sql`) — optional per-team WhatsApp group invite URL, set in the admin create/edit dialog. Bare links are auto-prefixed with `https://` (`waHref()`). Admin card shows a solid green "WhatsApp" button when set / outlined "Add WhatsApp" when not; the member teams page shows a "Join WhatsApp Group" button. Accepted by `POST`/`PUT /api/teams`; `GET` returns it via `select("*")`.
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

## Profile Photo Review & Lock

Moderation + lock workflow for member profile photos. Restricted to **super-admin / state officials** (same authority that can lock). Schema: `supabase/photo_review_schema.sql` adds to `users`: `photo_status` (`pending|approved|rejected`, default `pending`), `photo_locked` (bool), `photo_reviewed_by`/`photo_reviewed_at`/`photo_review_note`, `photo_quality` (JSONB AI verdict).

- **Admin page:** `/admin/photo-review` — thumbnail grid with AI verdict chip (`good|borderline|poor` + score + issues), tabs (Pending/Rejected/Approved/All) with counts + search. **Approve → locks** the photo; **Reject** keeps the photo but flags it and emails the member a polite re-upload request (option 1b — photo is NOT cleared); **Unlock** re-opens it for member changes.
- **Zoom lightbox:** clicking any photo opens a full dialog with wheel/double-click/+− zoom (1×–4×), drag-to-pan, and Approve/Reject/Open-original inline.
- **Reject reason is pre-filled** from the AI verdict's `issues` tags (humanized, e.g. "busy background, not a portrait, low quality"), falling back to the verdict `reason`; editable before sending. Reject is **email-only** (`sendPhotoRejectionEmail`) — no Telegram/in-app channel; the reason renders in a red "Why:" box and is saved to `photo_review_note`.
- **Upload timestamp:** `POST /api/upload/avatar` stamps `users.photo_uploaded_at` (column added by `supabase/photo_uploaded_at_schema.sql`) on every upload, so "photos uploaded today" is countable without `updated_at` being masked by review actions. Existing rows are NULL until the member next uploads.
- **API:** `/api/admin/photo-review` (GET list + counts, PUT `approve|reject|lock|unlock`). Gated via `hasPhotoReviewAccess` (super_admin or `official_type==='state'`), audit-logged (`photo_approve|photo_reject|…`).
- **Lock enforcement:** `POST /api/upload/avatar` blocks a member from replacing their own photo when `photo_locked` is true, UNLESS the caller is super_admin/state. **Any successful re-upload resets review state** (`photo_status='pending'`, `photo_locked=false`, clears reviewed_*/quality) — a fresh photo needs fresh review.
- **Email:** `sendPhotoRejectionEmail(to, name, reason?)` in `lib/mail.ts` — bypasses `HOLD_MEMBER_EMAILS` (human/official-initiated, one-to-one).
- **AI scorer:** `tools/review_photos.py` — Gemini 2.5-flash via **REST** (not the SDK — grpc/cygrpc is blocked by an Application Control policy on the dev box, so the `google-generativeai` package can't import; call `generativelanguage.googleapis.com/.../generateContent` with `requests` instead). Dry-run by default (no writes/emails); `--execute` writes `photo_quality` to every photo and **auto-rejects only `verdict==poor`** (sets `rejected`, keeps photo, emails throttled at 0.3s; test accounts `tanhowa19791@gmail.com`/`tanhowaadmin@tanhowa.in` excluded). Flags: `--limit N`, `--rescore`, `--no-email`, `--score-only`. Skips empty `photo_url`. The verdict's `score` (not the loosely-applied `issues` labels — Gemini over-tags `not_a_portrait`) drives good/borderline/poor.

## Mandatory Profile Completion

All approved members must complete **8 identity-critical fields** before accessing any dashboard section (admins/super_admins exempt):
- Blocking fields: First Name, Last Name, Phone, Designation, District, Block, DOB, Gender, Address
- Non-dismissible dialog blocks navigation (except `/dashboard/profile`)
- Polite bilingual message (EN/TA) with `Flower2` icon
- Warning banner on profile page shows missing fields
- Logic: `getMissingFields()` in `app/dashboard/layout.tsx`
- **Placeholder name detection:** `PLACEHOLDER_NAMES` Set in `app/dashboard/layout.tsx` rejects names where every word is a placeholder (`unnamed`, `user`, `test`, `guest`, `anonymous`, `no name`, `n/a`, `na`). So "unnamed", "user user", "test test" all count as missing — the member is forced to enter a real first + last name. Add new placeholders to the Set rather than altering the field check.
- **Profile Photo / Qualification / Date of Joining were dropped from the blocking gate (2026-07-04).** A live-data check found ~47% of approved members (304/643) blocked from basic access (including payment-proof upload) over these three specifically — genuine profile gaps, not a save/persistence bug (verified against raw `users` rows; every flagged field really was empty). They're still shown on the Profile page's own 12-field completeness indicator (`getProfileCompletion()` in `app/dashboard/profile/page.tsx`, unchanged) as encouraged-but-not-blocking. Keep these two field lists in sync in spirit, but the layout gate is intentionally the smaller set.

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

## Document Folders (member-facing Document Vault)

Folder layer over the `documents` table with **folder-level access**. Tables: `document_folders` (name, description, `visibility` all/specific/team) + `folder_access` (folder_id, user_id|team_id) + `documents.folder_id`. Schema: `supabase/document_folders.sql`. API: `app/api/document-folders/route.ts` (GET/POST/PUT/DELETE, admin-gated except GET). Do **not** confuse with the owner-only `admin_documents` vault (`/admin/special-documents`).

- **Access model is "folder governs":** a member who can open a folder sees **every approved doc in it**, regardless of the doc's own `visibility`. Unfiled docs (`folder_id = NULL`) keep the legacy per-document `document_access` rules. The member GET in `app/api/documents/route.ts` first computes accessible folder IDs (folder `visibility=all` OR a `folder_access` user/team match), then a doc passes if `folder_id ∈ accessible` (foldered) or the old all/assigned check (unfiled).
- When a doc is placed in a folder, the admin UI stores `visibility="all"` and writes no per-doc `document_access` rows — access comes only from the folder. The Add-Document and Manage-Access dialogs both have a Folder picker; choosing one hides the per-doc visibility controls.
- **UI:** both `/admin/documents` and `/dashboard/documents` open to a folder grid → drill-in ("All Documents" + folder cards + "Unfiled"). Deleting a folder unfiles its docs (FK `ON DELETE SET NULL`), never deletes them.

## Account Suspension

Admins can suspend approved members. Status flow: `pending` → `approved` → `suspended` (or `rejected`).

- **Suspended users:** Redirected to `/suspended` page, blocked from all API routes except auth, `/api/users/me`, and `/api/subscriptions`
- **Admin actions:** Suspend/unsuspend via `/admin/users` page
- **Restricted to:** `tanhowa19791@gmail.com` (owner) only
- **Notifications:** Email sent on suspension/unsuspension

## Owner-Only Admin Tools

Three admin pages restricted to the owner (`tanhowa19791@gmail.com`). All three follow the same gating pattern: API route checks `session.email`, sidebar in `app/admin/layout.tsx` filters them out for everyone else. **Add owner-gated tools here, not as one-off pages.**

| Page | API | Storage | Purpose |
|------|-----|---------|---------|
| `/admin/special-tasks` | `/api/admin-tasks` | `admin_tasks` table | Private parallel task tracker (3 types: `internal`, `assigned`, `checklist`). Same priority/status vocabulary as the public `todos` system but lives in its own table so owner work doesn't pollute member-visible lists. |
| `/admin/special-documents` | `/api/admin-documents` + `/api/admin-documents/folders` | `admin_documents` + `admin_document_folders` tables + private storage bucket | Document vault for confidential files, organized in user-created folders (folder-card landing grid → drill into doc list; "Unfiled" for folder_id NULL; deleting a folder unfiles its docs). The old category dropdown is retired from the UI — `category` is a legacy column, new uploads store NULL. Hidden from regular members and admins. |
| `/admin/settings` | `/api/settings` | `site_settings` key/value table | Branding, payee bank details, payment QR upload (`/api/upload/qr-code`), contact info, feature toggles. Free-form key/value editor — be careful, no schema validation. |

**Owner check is the source of truth, not the role.** A district admin (`role=admin`) cannot reach these pages; a future second super_admin would need an explicit allowlist update if you ever stop hardcoding the email.

**Note:** `/admin/district-dues` is NOT owner-only despite its similar placement in earlier docs — its API (`/api/district-dues`) gates on `isAdmin || isState || isDistrict` (any admin, state official, or district official with a district set), same as regular admin tools. See District Dues below.

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
- **Lib:** `lib/badges.ts` — 14 badge definitions, `checkAndAwardBadges()`, `BADGES` array
- **API:** `/api/achievements` (GET) — `?me=true` for own badges, `?leaderboard=true` for admin leaderboard
- **Member page:** `/dashboard/achievements` — personal badges display
- **Admin page:** `/admin/achievements` — badge leaderboard
- **Badges:** Century (100min), Half Century (50min), Dedicated (200min), All-Rounder (5+ action types), Task Master (10+ tasks), Task Starter (1st task), Payment Champion (all paid), Voice of Change (5+ grievances), Idea Factory (3+ ideas), Social Butterfly (5+ RSVPs), Loyal Member (6+ months), Pioneer (1+ year), Regular (50+ logins), Field Reporter (10+ field diary entries)

## Task Gamification

Points-based gamification layered on the task system to motivate members. Table: `task_points` (schema `supabase/task_points_schema.sql`). **Distinct from Achievements/Badges** (those are milestone flags; this is a continuous points score + leaderboard).

- **Engine:** `lib/task-points.ts` — `TASK_POINTS` values, 5 `LEVELS` (🌱 Sprout 0 → 🌿 Gardener 100 → 🪴 Cultivator 300 → 🌳 Horticulturist 700 → 🏆 Master 1500), `getLevel(points)`, and **`awardTaskPoints(userId, reason, todoId?, overridePoints?, ref?)`** — idempotent (a partial unique index on `(user_id, todo_id, reason) WHERE todo_id IS NOT NULL` prevents double-awarding on todo-sourced points; conflict errors swallowed). Fire-and-forget; never blocks the caller.
- **Award hooks (already wired):** `first_task` +15 (one-time, self-guarded), `commit` +5, `deliverable` +5, `time_log` +2, `subtask_completed` +8, `task_completed` +20, `on_time_bonus` +10 (completed on/before `due_date`). Wired in `app/api/todos/route.ts` (POST create, PUT commit, PUT status=completed → awards to `committed_by ?? assigned_to ?? submitted_by`), `app/api/todos/attachments/route.ts`, `app/api/todos/time-entries/route.ts`. **Add new award points by calling `awardTaskPoints` at the event site** — don't recompute totals.
- **Non-todo point sources:** the 5th `ref?: {type, id}` param generalizes awarding beyond tasks — `todo_id` has a hard FK into `todos` so it can't be reused for e.g. a Field Diary entry's id; a separate unique index on `(user_id, ref_type, ref_id, reason)` backs these. `diary_entry` (+10) and `diary_success_story` (+15) use this path (see Field Diary). **Use `ref`, not `todoId`, for any future non-todo point source.**
- **API:** `GET /api/gamification?period=week|month|all&scope=overall|district` — returns the caller's `{ points, level, rank, streak, breakdown, recent }` + a leaderboard (lifetime points drive the level; period filters the board). Streak = consecutive 7-day windows ending today with ≥1 award. Test accounts excluded.
- **Member page:** `/dashboard/rewards` ("Rewards & Progress", under *My Activity*) — level progress hero, points breakdown, leaderboard with period/scope toggles. The whole UI lives in the shared **`components/gamification-panel.tsx`** (`<GamificationPanel showHeading?>`); `/dashboard/rewards` is a 4-line wrapper.
- **In the task areas:** both `/dashboard/todos` and `/admin/todos` embed `<GamificationPanel showHeading={false}>` inside a collapsible section toggled by a header **🏆 Rewards** button (open by default). Reuse this component anywhere the leaderboard/level/stats are wanted — don't re-fetch `/api/gamification` ad hoc.
- **Backfill:** `scripts/backfill-task-points.mjs` (dry-run default, `--execute`) seeds points from historical task activity. Idempotent (skips existing `user|todo|reason` keys).
- **Rewards redemption is intentionally deferred** (points-only). When building it: add `rewards` (admin catalog) + `reward_redemptions` (request → approve/deduct or reject/refund) tables; the points ledger already exists.

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
| `/api/cron/inactive-nudge` | `30 2 * * *` | 08:00 | Email + Telegram nudge to members inactive 30+ days. **Per-member 15-day cooldown** via the `users.last_inactive_nudge_at` column — the cron runs daily but only re-nudges a given member once per 15 days (filtered in JS, not SQL, since PostgREST won't reliably chain a second `.or()`; the column is stamped after any channel sends). Without this the daily run re-emailed the same ~329 inactive members every day (~10k/mo + bounce-driven sender-reputation damage); the cooldown cuts it ~8×. Both channels include a "Tell us what would bring you back" link (30-day signed JWT minted via `lib/feedback-token.ts`) → public `/feedback?t=...` form → writes to `feedback` table with source `inactive_email`. |
| `/api/cron/stuck-tasks` | `0 4 * * *` | 09:30 | Flags silent (no notes 3+ days) / past-due / timebox-exceeded tasks. Per-committer DM + admin digest. |
| `/api/cron/duplicate-scan` | `30 3 * * 1` | Mon 09:00 | Safety net for one-account-per-person. Phone-dupes are blocked by the `users_phone_unique` index; this flags same-name accounts sharing a strong signal (same DOB / district / phone, or incomplete+complete) and emails a digest to admins only when found. Different-district same-name pairs are treated as distinct people (ignored). |
| `/api/cron/publish-scheduled` | Periodic | — | Auto-publishes scheduled announcements/events past their `scheduled_at` time |
| `/api/cron/field-diary-compliance` | `30 18 * * *` | 00:00 (next day) | Nudges (email + Telegram) approved members with no Field Diary entry for the day just ended; also retries any AI success-story draft stuck `queued` >10 min |

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
5. Add nav item with icon to `app/dashboard/layout.tsx` — the member sidebar is grouped into labelled sections (`MEMBER_NAV_SECTIONS`); add the item to the relevant section's `items` array, not a flat list. Section headers auto-hide when no child is visible to the current role. If the feature is gated behind the 12-field mandatory profile completion check, no extra wiring needed — the layout already redirects incomplete profiles. If owner-only, gate it on `session.email === "tanhowa19791@gmail.com"`.
6. Add nav item with icon to `app/admin/layout.tsx` — the admin sidebar is likewise grouped (`NAV_SECTIONS`); add to the right section's `items`. Per-item visibility lives in `isNavItemVisible(href)` (admin) / `isItemVisible(item)` (member) — add a role/email check there if the item is restricted. The collapsible Feedback (and member-side Elections) sub-groups are rendered via `{ feedbackGroup: true }` / `{ electionsGroup: true }` sentinels inside a section's `items`.
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
