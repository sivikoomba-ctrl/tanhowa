import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getOfficialInfo, isFinanceTeamMember, DEFAULT_ADMIN_EMAIL } from "@/lib/auth";
import { validate, subscriptionUpdateSchema } from "@/lib/validation";

// Emails excluded from subscription dues (test/system accounts)
const SUBSCRIPTION_EXEMPT_EMAILS = [DEFAULT_ADMIN_EMAIL, "tanhowa19791@gmail.com"];
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { sendSubscriptionApprovedEmail, notifyPaymentVerified, sendSubscriptionNotification, sendPaymentRejectionAlertEmail, notifyAdminProofSubmitted } from "@/lib/mail";
import { notifyPaymentRejected } from "@/lib/telegram";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { writeLimiter } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const period = url.searchParams.get("period");
    const status = url.searchParams.get("status");

    const officialGet = await getOfficialInfo(session.userId);
    const isAdminGet = officialGet.role === "admin" || officialGet.role === "super_admin";
    const isDistrictOfficialGet = officialGet.official_type === "district" && !!officialGet.district;
    const isStateOfficialGet = officialGet.official_type === "state";
    const sync = url.searchParams.get("sync");
    const me = url.searchParams.get("me");
    if ((isAdminGet || isDistrictOfficialGet || isStateOfficialGet) && me !== "true") {
      // Auto-sync only when explicitly requested (admin only)
      if (sync === "true" && isAdminGet) {
        try {
          const [{ data: allMembers }, { data: allSubs }] = await Promise.all([
            supabase.from("users").select("id, email").eq("status", "approved").neq("role", "super_admin"),
            supabase.from("subscriptions").select("user_id, period, amount, due_date").order("created_at", { ascending: false }),
          ]);

          if (allMembers && allSubs && allSubs.length > 0) {
            const periodMap = new Map<string, { amount: number; due_date: string | null }>();
            for (const s of allSubs) {
              // Only auto-sync annual periods (year strings like "2025", "2026").
              // Special/one-off periods must be created explicitly by admins.
              if (!periodMap.has(s.period) && /^\d{4}$/.test(s.period)) {
                periodMap.set(s.period, { amount: s.amount, due_date: s.due_date });
              }
            }

            const existingSet = new Set(allSubs.map((s: { user_id: string; period: string }) => `${s.user_id}::${s.period}`));

            const missing: { user_id: string; period: string; amount: number; due_date: string | null; status: string }[] = [];
            const eligibleMembers = allMembers.filter((m: { email: string }) => !SUBSCRIPTION_EXEMPT_EMAILS.includes(m.email));
            for (const member of eligibleMembers) {
              for (const [p, info] of periodMap) {
                if (!existingSet.has(`${member.id}::${p}`)) {
                  missing.push({ user_id: member.id, period: p, amount: info.amount || 0, due_date: info.due_date, status: "pending" });
                }
              }
            }

            if (missing.length > 0) {
              await supabase.from("subscriptions").insert(missing);
            }
          }
        } catch {
          // Don't fail the GET if sync fails
        }
      }

      // Member-scoped lookup — admin viewing a single member's full subscription history
      const memberUserId = url.searchParams.get("user_id");
      if (memberUserId && isAdminGet) {
        const { data: memberSubs, error: memberSubError } = await supabase
          .from("subscriptions")
          .select("id, period, amount, status, due_date, remarks, payment_proof_url, paid_amount, created_at, paid_at, transaction_id, payment_method, approved_at, approver:users!subscriptions_approved_by_fkey(name)")
          .eq("user_id", memberUserId)
          .order("created_at", { ascending: false });
        if (memberSubError) {
          await logError({ type: "api", message: memberSubError.message, path: "/api/subscriptions", method: "GET", status_code: 200, metadata: { context: "member-sub-lookup" } });
        }
        return NextResponse.json({ subscriptions: memberSubs || [] });
      }

      // Build query — fetch subscriptions and stats in parallel
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 2000);
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const hasProof = url.searchParams.get("has_proof") === "true";
      const notPaid = url.searchParams.get("not_paid") === "true";

      let query = supabase
        .from("subscriptions")
        .select("*, users!subscriptions_user_id_fkey(name, email, phone, posting_details), approver:users!subscriptions_approved_by_fkey(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (period) query = query.eq("period", period);
      if (status && status !== "all") query = query.eq("status", status);
      if (notPaid) query = query.in("status", ["pending", "overdue"]);
      if (hasProof) query = query.gt("payment_proof_url", "").in("status", ["pending", "overdue"]).not("remarks", "ilike", "Verified by%").not("remarks", "ilike", "Provisionally approved.%").not("remarks", "ilike", "Approved.%");

      const [{ data: subscriptions, count: totalCount, error: subError }, paidRes, pendingRes, overdueRes, rejectedRes, holdRes, proofUploadedRes] = await Promise.all([
        query,
        supabase.from("subscriptions").select("amount").eq("status", "paid"),
        supabase.from("subscriptions").select("amount").eq("status", "pending"),
        supabase.from("subscriptions").select("amount").eq("status", "overdue"),
        supabase.from("subscriptions").select("amount").eq("status", "rejected"),
        supabase.from("subscriptions").select("amount").eq("status", "hold"),
        supabase.from("subscriptions").select("amount").gt("payment_proof_url", "").in("status", ["pending", "overdue"]).not("remarks", "ilike", "Verified by%").not("remarks", "ilike", "Provisionally approved.%").not("remarks", "ilike", "Approved.%"),
      ]);

      if (subError) {
        await logError({ type: "api", message: subError.message, path: "/api/subscriptions", method: "GET", status_code: 200, metadata: { context: "subscription-query" } });
      }

      let visibleSubscriptions = subscriptions || [];
      if (isDistrictOfficialGet && !isAdminGet && !isStateOfficialGet) {
        visibleSubscriptions = visibleSubscriptions.filter((sub) => {
          const user = sub.users as { posting_details?: { regular_district?: string } | null } | null;
          return user?.posting_details?.regular_district === officialGet.district;
        });
      }

      const sumOf = (rows: { amount: number }[] | null) => (rows || []).reduce((s, r) => s + (r.amount || 0), 0);

      const totalCollected = isDistrictOfficialGet && !isAdminGet && !isStateOfficialGet
        ? visibleSubscriptions.filter((sub) => sub.status === "paid").reduce((sum, sub) => sum + (sub.amount || 0), 0)
        : sumOf(paidRes.data as { amount: number }[]);

      const isDist = isDistrictOfficialGet && !isAdminGet && !isStateOfficialGet;
      const dsExclude = (sub: { remarks?: string | null }) => !(sub.remarks && (sub.remarks.startsWith("Verified by") || sub.remarks.startsWith("Provisionally approved.") || sub.remarks.startsWith("Approved.")));

      const stats = isDist
        ? {
            paid: visibleSubscriptions.filter((s) => s.status === "paid").length,
            paidAmount: visibleSubscriptions.filter((s) => s.status === "paid").reduce((t, s) => t + (s.amount || 0), 0),
            pending: visibleSubscriptions.filter((s) => s.status === "pending").length,
            pendingAmount: visibleSubscriptions.filter((s) => s.status === "pending").reduce((t, s) => t + (s.amount || 0), 0),
            overdue: visibleSubscriptions.filter((s) => s.status === "overdue").length,
            overdueAmount: visibleSubscriptions.filter((s) => s.status === "overdue").reduce((t, s) => t + (s.amount || 0), 0),
            rejected: visibleSubscriptions.filter((s) => s.status === "rejected").length,
            rejectedAmount: visibleSubscriptions.filter((s) => s.status === "rejected").reduce((t, s) => t + (s.amount || 0), 0),
            hold: visibleSubscriptions.filter((s) => s.status === "hold").length,
            holdAmount: visibleSubscriptions.filter((s) => s.status === "hold").reduce((t, s) => t + (s.amount || 0), 0),
            proofUploaded: visibleSubscriptions.filter((s) => s.payment_proof_url && s.payment_proof_url !== "" && ["pending", "overdue"].includes(s.status) && dsExclude(s)).length,
            proofUploadedAmount: visibleSubscriptions.filter((s) => s.payment_proof_url && s.payment_proof_url !== "" && ["pending", "overdue"].includes(s.status) && dsExclude(s)).reduce((t, s) => t + (s.amount || 0), 0),
            totalCollected,
          }
        : {
            paid: (paidRes.data || []).length,
            paidAmount: sumOf(paidRes.data as { amount: number }[]),
            pending: (pendingRes.data || []).length,
            pendingAmount: sumOf(pendingRes.data as { amount: number }[]),
            overdue: (overdueRes.data || []).length,
            overdueAmount: sumOf(overdueRes.data as { amount: number }[]),
            rejected: (rejectedRes.data || []).length,
            rejectedAmount: sumOf(rejectedRes.data as { amount: number }[]),
            hold: (holdRes.data || []).length,
            holdAmount: sumOf(holdRes.data as { amount: number }[]),
            proofUploaded: (proofUploadedRes.data || []).length,
            proofUploadedAmount: sumOf(proofUploadedRes.data as { amount: number }[]),
            totalCollected,
          };

      return NextResponse.json({
        subscriptions: visibleSubscriptions,
        stats,
        total: totalCount ?? visibleSubscriptions.length,
      });
    } else {
      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", session.userId)
        .order("created_at", { ascending: false });

      return NextResponse.json({ subscriptions: subscriptions || [] });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const supabase = getServiceClient();
    const body = await req.json();

    // Validate period for all create actions
    if (body.period && (!body.period.trim() || body.period.length > 100)) {
      return NextResponse.json({ error: "Invalid period (max 100 chars)" }, { status: 400 });
    }

    if (body.action === "bulk-create") {
      // Get all approved members including admins (exclude super_admin)
      const { data: allUsers } = await supabase
        .from("users")
        .select("id, email")
        .eq("status", "approved")
        .neq("role", "super_admin");
      const users = (allUsers || []).filter((u: { email: string }) => !SUBSCRIPTION_EXEMPT_EMAILS.includes(u.email));

      if (!users || users.length === 0) {
        return NextResponse.json({ error: "No approved members found" }, { status: 400 });
      }

      // Get existing subscriptions for this period
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("period", body.period);

      const existingIds = new Set((existing || []).map((s: { user_id: string }) => s.user_id));

      // For special subscriptions (period starts with "For "), also exclude members
      // who already have any pending/active special subscription — only one allowed at a time.
      const isSpecialPeriod = /^special amount$/i.test(body.period || "");
      let alreadyHasSpecialIds = new Set<string>();
      if (isSpecialPeriod) {
        const { data: activeSpecials } = await supabase
          .from("subscriptions")
          .select("user_id")
          .ilike("period", "Special Amount")
          .in("status", ["pending", "overdue", "hold"]);
        alreadyHasSpecialIds = new Set((activeSpecials || []).map((s: { user_id: string }) => s.user_id));
      }

      const newUsers = users.filter((u: { id: string }) => !existingIds.has(u.id) && !alreadyHasSpecialIds.has(u.id));

      if (newUsers.length === 0) {
        return NextResponse.json({ error: "All members already have subscriptions for this period" }, { status: 400 });
      }

      const rows = newUsers.map((u: { id: string }) => ({
        user_id: u.id,
        period: body.period,
        amount: parseFloat(body.amount) || 0,
        due_date: body.due_date || null,
        status: "pending",
      }));

      const { error } = await supabase.from("subscriptions").insert(rows);

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "POST", status_code: 500 });
        return NextResponse.json({ error: "Failed to create subscriptions" }, { status: 500 });
      }

      return NextResponse.json({ message: `Created ${newUsers.length} subscriptions`, count: newUsers.length });
    } else if (body.action === "past-create") {
      // Create subscriptions for selected members (past year entries)
      const userIds: string[] = body.user_ids;
      if (!userIds || userIds.length === 0) {
        return NextResponse.json({ error: "No members selected" }, { status: 400 });
      }
      if (!body.period) {
        return NextResponse.json({ error: "Year is required" }, { status: 400 });
      }

      // Filter out members who already have a subscription for this period
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("period", body.period)
        .in("user_id", userIds);

      const existingIds = new Set((existing || []).map((s: { user_id: string }) => s.user_id));
      const newUserIds = userIds.filter((id: string) => !existingIds.has(id));

      if (newUserIds.length === 0) {
        return NextResponse.json({ error: "All selected members already have subscriptions for this period" }, { status: 400 });
      }

      const isPaid = body.status === "paid";
      const rows = newUserIds.map((uid: string) => ({
        user_id: uid,
        period: body.period,
        amount: parseFloat(body.amount) || 0,
        due_date: body.due_date || null,
        status: isPaid ? "paid" : "pending",
        paid_at: isPaid ? (body.paid_at || new Date().toISOString()) : null,
        remarks: body.remarks || null,
        payment_proof_url: body.payment_proof_url || null,
        approved_by: isPaid ? session.userId : null,
        approved_at: isPaid ? new Date().toISOString() : null,
      }));

      const { error } = await supabase.from("subscriptions").insert(rows);

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "POST", status_code: 500 });
        return NextResponse.json({ error: "Failed to create subscriptions" }, { status: 500 });
      }

      const skipped = userIds.length - newUserIds.length;
      return NextResponse.json({
        message: `Created ${newUserIds.length} subscription(s)${skipped > 0 ? ` (${skipped} already existed)` : ""}`,
        count: newUserIds.length,
        skipped,
      });
    } else if (body.action === "notify-member") {
      if (!body.subscription_id || !body.message) {
        return NextResponse.json({ error: "Subscription ID and message are required" }, { status: 400 });
      }

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("period, amount, users!subscriptions_user_id_fkey(name, email)")
        .eq("id", body.subscription_id)
        .single();

      if (!sub?.users) {
        return NextResponse.json({ error: "Subscription or member not found" }, { status: 404 });
      }

      const user = sub.users as unknown as { name: string; email: string };
      try {
        await sendSubscriptionNotification(
          user.email,
          user.name || "Member",
          sub.period,
          sub.amount || 0,
          body.message,
        );
      } catch (mailErr) {
        const mailMsg = mailErr instanceof Error ? mailErr.message : "Unknown email error";
        await logError({ type: "api", message: `Notify failed: ${mailMsg}`, path: "/api/subscriptions", method: "POST", status_code: 500 });
        return NextResponse.json({ error: `Failed to send notification: ${mailMsg}` }, { status: 500 });
      }

      return NextResponse.json({ message: `Notification sent to ${user.email}` });
    } else {
      // Check for existing subscription for this user/period
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", body.user_id)
        .eq("period", body.period)
        .maybeSingle();

      if (existingSub) {
        return NextResponse.json({ error: "A subscription already exists for this member and period" }, { status: 400 });
      }

      // For special subscriptions, block if member already has any pending/active special amount
      if (/^special amount$/i.test(body.period || "")) {
        const { data: existingSpecial } = await supabase
          .from("subscriptions")
          .select("id, period")
          .eq("user_id", body.user_id)
          .ilike("period", "Special Amount")
          .in("status", ["pending", "overdue", "hold"])
          .maybeSingle();
        if (existingSpecial) {
          return NextResponse.json({ error: `Member already has a special amount subscription (${existingSpecial.period})` }, { status: 400 });
        }
      }

      const { data, error } = await supabase
        .from("subscriptions")
        .insert({
          user_id: body.user_id,
          period: body.period,
          amount: body.amount || 0,
          due_date: body.due_date || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "POST", status_code: 500 });
        return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
      }

      return NextResponse.json({ subscription: data });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();

    const v = validate(subscriptionUpdateSchema, body);
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 });

    const supabase = getServiceClient();

    const officialInfo = await getOfficialInfo(session.userId);
    const isAdminRole = officialInfo.role === "admin" || officialInfo.role === "super_admin";
    const isDistrictOfficial = officialInfo.official_type === "district" && !!officialInfo.district;
    const isStateOfficial = officialInfo.official_type === "state";
    const canVerify = isAdminRole || isDistrictOfficial || isStateOfficial;

    if (!canVerify) {
      // Regular member — can only update own subscription (payment proof, method, etc.)
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("id", body.id)
        .single();

      if (!sub || sub.user_id !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const memberUpdates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
      if (body.payment_method !== undefined) memberUpdates.payment_method = body.payment_method;
      if (body.transaction_id !== undefined) memberUpdates.transaction_id = body.transaction_id;
      if (body.remarks !== undefined) memberUpdates.remarks = body.remarks;
      if (body.payment_proof_url !== undefined) memberUpdates.payment_proof_url = body.payment_proof_url;

      // Allow members to set amount on voluntary subscriptions
      if (body.amount !== undefined) {
        const { data: fullSub } = await supabase
          .from("subscriptions")
          .select("period")
          .eq("id", body.id)
          .single();
        if (fullSub?.period?.toLowerCase().startsWith("volunteer")) {
          memberUpdates.amount = parseFloat(body.amount) || 0;
        }
      }

      const { error } = await supabase
        .from("subscriptions")
        .update(memberUpdates)
        .eq("id", body.id);

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "PUT", status_code: 500 });
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
      }

      if (body.payment_proof_url !== undefined) {
        logContribution(session.userId, "payment_proof_uploaded", "Uploaded payment proof");
      }

      // Submit for review: reset overdue → pending and notify admins
      if (body.submit_for_review) {
        const { data: fullSub } = await supabase
          .from("subscriptions")
          .select("status, period, amount, users!subscriptions_user_id_fkey(name)")
          .eq("id", body.id)
          .single();
        if (fullSub?.status === "overdue") {
          await supabase.from("subscriptions").update({ status: "pending" }).eq("id", body.id);
        }
        const memberName = (fullSub?.users as { name?: string } | null)?.name || "Member";
        notifyAdminProofSubmitted(memberName, fullSub?.period || "", fullSub?.amount || 0).catch(() => {});
      }

      return NextResponse.json({ message: "Updated" });
    }

    // District official: verify they can only approve members in their district
    if (isDistrictOfficial && !isAdminRole && body.status) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id, users!subscriptions_user_id_fkey(posting_details)")
        .eq("id", body.id)
        .single();

      if (sub) {
        const memberPd = (sub.users as unknown as { posting_details: { regular_district?: string } | null })?.posting_details;
        const memberDistrict = memberPd?.regular_district || "";
        if (memberDistrict !== officialInfo.district) {
          return NextResponse.json({ error: "You can only verify payments for members in your district" }, { status: 403 });
        }
      }
    }

    // Validate status value
    const VALID_STATUSES = ["pending", "paid", "overdue", "hold", "rejected"];
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Validate input lengths
    if (body.remarks && body.remarks.length > 2000) {
      return NextResponse.json({ error: "Remarks too long (max 2000 chars)" }, { status: 400 });
    }

    // Validate amount is a valid number
    if (body.amount !== undefined && (isNaN(Number(body.amount)) || Number(body.amount) < 0)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (body.paid_amount !== undefined && (isNaN(Number(body.paid_amount)) || Number(body.paid_amount) < 0)) {
      return NextResponse.json({ error: "Invalid paid amount" }, { status: 400 });
    }

    // Final approval (status=paid) restricted to Finance Team members or super_admin
    if (body.status === "paid") {
      const isSuperAdminRole = officialInfo.role === "super_admin";
      const isFinanceMember = await isFinanceTeamMember(session.userId);
      if (!isSuperAdminRole && !isFinanceMember) {
        return NextResponse.json({ error: "Only Finance Team members can give final payment approval" }, { status: 403 });
      }
    }

    const updates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (body.status) {
      updates.status = body.status;
      if (body.status === "paid") {
        updates.paid_at = body.paid_at || new Date().toISOString();
        updates.approved_by = session.userId;
        updates.approved_at = new Date().toISOString();
        // Auto-append Finance Team approval remark (preserve existing DB remarks)
        const { data: approver } = await supabase.from("users").select("name").eq("id", session.userId).single();
        const approverName = approver?.name || "Unknown";
        const financeRemark = `Final approval by ${approverName}, Finance Team, TANHOWA.`;
        const { data: currentSub } = await supabase.from("subscriptions").select("remarks").eq("id", body.id).single();
        const dbRemarks = (currentSub?.remarks || "").trim();
        const extraRemarks = (body.remarks || "").trim();
        const combined = [dbRemarks, extraRemarks].filter(Boolean).join("\n");
        updates.remarks = combined ? `${combined}\n${financeRemark}` : financeRemark;
      } else {
        // Clear approval info when reverting
        updates.approved_by = null;
        updates.approved_at = null;
      }
    }
    if (body.paid_amount !== undefined) updates.paid_amount = body.paid_amount;
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.payment_method !== undefined) updates.payment_method = body.payment_method;
    if (body.transaction_id !== undefined) updates.transaction_id = body.transaction_id;
    if (body.remarks !== undefined && body.status !== "paid") updates.remarks = body.remarks;
    if (body.payment_proof_url !== undefined) updates.payment_proof_url = body.payment_proof_url;
    if (body.payment_group_id !== undefined) updates.payment_group_id = body.payment_group_id;

    // Before updating, capture who approved it (for rejection alerts)
    let previousApprover: { id: string; name: string; email: string; telegram_chat_id?: string } | null = null;
    if (body.status === "rejected") {
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("approved_by, approver:users!subscriptions_approved_by_fkey(id, name, email, telegram_chat_id)")
        .eq("id", body.id)
        .single();
      if (existingSub?.approver) {
        previousApprover = existingSub.approver as unknown as { id: string; name: string; email: string; telegram_chat_id?: string };
      }
    }

    const { error } = await supabase
      .from("subscriptions")
      .update(updates)
      .eq("id", body.id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    logAudit(session.userId, body.status ? `subscription_${body.status}` : "subscription_update", "subscription", body.id, body);

    // Log contribution for status changes
    if (body.status === "paid") {
      const { data: sub } = await supabase.from("subscriptions").select("period").eq("id", body.id).single();
      logContribution(session.userId, "payment_verified", "Verified payment for " + (sub?.period || "unknown period"));
    } else if (body.status === "rejected") {
      const { data: sub } = await supabase.from("subscriptions").select("period").eq("id", body.id).single();
      logContribution(session.userId, "payment_rejected", "Rejected payment for " + (sub?.period || "unknown period"));
    } else if (body.status === "hold") {
      logContribution(session.userId, "payment_hold", "Put payment on hold");
    }

    // Alert the DS/DJS who approved the payment when it gets rejected
    if (body.status === "rejected" && previousApprover && previousApprover.id !== session.userId) {
      (async () => {
        try {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("period, amount, user_id, users!subscriptions_user_id_fkey(name)")
            .eq("id", body.id)
            .single();
          const memberName = (sub?.users as unknown as { name: string })?.name || "Unknown Member";
          const { data: rejector } = await supabase.from("users").select("name").eq("id", session.userId).single();
          const rejectedBy = rejector?.name || "Admin";

          // Send email alert (bypasses HOLD_MEMBER_EMAILS)
          sendPaymentRejectionAlertEmail(
            previousApprover!.email,
            previousApprover!.name || "Official",
            memberName,
            sub?.period || "Unknown",
            sub?.amount || 0,
            rejectedBy,
            body.remarks,
          ).catch((e) => logError({ type: "api", message: `Rejection email failed: ${e?.message || e}`, path: "/api/subscriptions", method: "PUT", status_code: 500 }));

          // Send Telegram alert
          if (previousApprover!.telegram_chat_id) {
            notifyPaymentRejected(
              previousApprover!.telegram_chat_id,
              memberName,
              sub?.period || "Unknown",
              sub?.amount || 0,
              rejectedBy,
              body.remarks,
            ).catch((e) => logError({ type: "api", message: `Rejection Telegram failed: ${e?.message || e}`, path: "/api/subscriptions", method: "PUT", status_code: 500 }));
          }
        } catch (e) { logError({ type: "api", message: `Rejection alert failed: ${e instanceof Error ? e.message : String(e)}`, path: "/api/subscriptions", method: "PUT", status_code: 500 }); }
      })();
    }

    // Send receipt email when subscription is approved (marked as paid)
    if (body.status === "paid") {
      try {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("period, amount, paid_at, approved_at, payment_method, transaction_id, user_id, users!subscriptions_user_id_fkey(name, email, phone, notification_prefs)")
          .eq("id", body.id)
          .single();

        if (sub?.users) {
          const user = sub.users as unknown as { name: string; email: string; phone?: string; notification_prefs?: { whatsapp?: boolean } | null };
          await sendSubscriptionApprovedEmail(
            user.email,
            user.name || "Member",
            sub.period,
            sub.amount || 0,
            {
              phone: user.phone,
              payment_method: sub.payment_method,
              transaction_id: sub.transaction_id,
              paid_at: sub.paid_at,
              approved_at: sub.approved_at,
            },
          );
          // Broadcast to all members
          notifyPaymentVerified(user.name || "Member", sub.period);
          // WhatsApp payment confirmation — only if the member opted in (no-op
          // until the Cloud API env vars + approved "payment_confirmed" template
          // exist). Template body params: {{1}} name, {{2}} period, {{3}} amount.
          if (user.notification_prefs?.whatsapp) {
            sendWhatsAppTemplate(user.phone, "payment_confirmed", [
              user.name || "Member",
              String(sub.period),
              `Rs. ${(sub.amount || 0).toLocaleString("en-IN")}`,
            ]).catch(() => {});
          }
        }
      } catch (emailErr) {
        // Log but don't fail the request — approval is already done
        const emailMsg = emailErr instanceof Error ? emailErr.message : "Email send failed";
        await logError({ type: "api", message: emailMsg, path: "/api/subscriptions", method: "PUT", status_code: 200, metadata: { context: "subscription-approval-email", subscription_id: body.id } });
      }
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("subscriptions").delete().eq("id", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
