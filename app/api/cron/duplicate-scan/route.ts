import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { requireCronAuth } from "@/lib/cron-auth";

// Where the weekly duplicate digest goes.
const REPORT_RECIPIENTS = ["tanhowaadmin@tanhowa.in", "tanhowa19791@gmail.com"];
// Owner/admin pair legitimately shares a phone — never flag them.
const EXEMPT_EMAILS = new Set(["tanhowaadmin@tanhowa.in", "sivikoomba@gmail.com"]);

interface U {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  status: string;
  posting_details: { regular_district?: string } | null;
}

function normName(n: string | null): string {
  return (n || "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}
function digits(p: string | null): string {
  const d = (p || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}
function district(u: U): string {
  return (u.posting_details?.regular_district || "").trim();
}
function esc(s: string): string {
  return (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));
}

/**
 * Weekly safety net for the "one account per person" rule. The DB unique index
 * (users_phone_unique) already makes duplicate PHONES impossible, so this scan
 * surfaces the cases the index can't catch — same person under two emails with
 * different/empty phones — by flagging same-name accounts that ALSO share a
 * strong signal (same DOB, same district, same phone, or one-incomplete +
 * one-complete). Different-district, different-DOB same-name pairs are treated
 * as distinct people and ignored to keep the digest low-noise.
 * Emails a digest to REPORT_RECIPIENTS only when something is found.
 */
export async function GET(req: NextRequest) {
  const auth = requireCronAuth(req);
  if (auth) return auth;

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("users")
      .select("id,name,email,phone,dob,status,posting_details")
      .in("status", ["pending", "approved", "suspended"]);
    if (error) throw new Error(error.message);

    const users = (data || []) as U[];
    const groups = new Map<string, U[]>();
    for (const u of users) {
      const nm = normName(u.name);
      if (!nm || nm.length <= 3) continue;
      if (EXEMPT_EMAILS.has((u.email || "").toLowerCase())) continue;
      const list = groups.get(nm);
      if (list) list.push(u);
      else groups.set(nm, [u]);
    }

    type Flag = { name: string; reasons: string[]; accounts: U[] };
    const flagged: Flag[] = [];
    for (const [nm, accts] of groups) {
      if (accts.length < 2) continue;
      const phones = accts.map((a) => digits(a.phone)).filter(Boolean);
      const dobs = accts.map((a) => a.dob).filter(Boolean);
      const dists = accts.map(district).filter(Boolean);
      const reasons: string[] = [];
      if (new Set(phones).size < phones.length) reasons.push("same phone");
      if (new Set(dobs).size < dobs.length) reasons.push("same DOB");
      if (new Set(dists).size < dists.length) reasons.push("same district");
      if (accts.some((a) => district(a)) && accts.some((a) => !district(a)))
        reasons.push("incomplete + completed");
      if (reasons.length) flagged.push({ name: nm, reasons, accounts: accts });
    }

    flagged.sort((a, b) => a.name.localeCompare(b.name));

    let emailed = false;
    if (flagged.length) {
      const rows = flagged
        .map((f) => {
          const accts = f.accounts
            .map(
              (a) =>
                `<div style="margin:2px 0">${esc(a.email || "—")} &middot; ${esc(
                  district(a) || "no district"
                )} &middot; ${a.phone ? esc(digits(a.phone)) : "no phone"} &middot; ${esc(a.status)}</div>`
            )
            .join("");
          return `<tr><td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top"><strong>${esc(
            f.name
          )}</strong><br/><span style="color:#b46f1e;font-size:12px">${f.reasons.join(", ")}</span></td><td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;color:#444">${accts}</td></tr>`;
        })
        .join("");
      const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px"><h2 style="color:#2d6a4f;margin:0 0 4px">TANHOWA — Possible Duplicate Accounts</h2><p style="color:#666;font-size:13px;margin:0 0 16px">${flagged.length} name(s) with 2+ accounts sharing a strong signal. Phone-duplicates are already blocked by the system; review these for same-person-under-two-emails and merge/delete in Admin &rarr; Manage Users.</p><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f1f8f2"><th style="text-align:left;padding:8px">Name / why flagged</th><th style="text-align:left;padding:8px">Accounts</th></tr></thead><tbody>${rows}</tbody></table></div>`;

      const token = process.env.ZEPTOMAIL_TOKEN;
      if (token) {
        const r = await fetch("https://api.zeptomail.in/v1.1/email", {
          method: "POST",
          headers: { Authorization: `Zoho-enczapikey ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: { address: process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in", name: "TANHOWA" },
            to: REPORT_RECIPIENTS.map((address) => ({ email_address: { address } })),
            subject: `TANHOWA: ${flagged.length} possible duplicate account(s) to review`,
            htmlbody: html,
          }),
        });
        emailed = r.ok;
      }
    }

    return NextResponse.json({ scanned: users.length, flagged: flagged.length, emailed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/cron/duplicate-scan", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
