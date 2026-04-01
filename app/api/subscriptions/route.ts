import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { sendSubscriptionApprovedEmail, notifyPaymentVerified, sendSubscriptionNotification } from "@/lib/mail";

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
    const districtFilter = url.searchParams.get("district");

    if ((isAdminGet || isDistrictOfficialGet || isStateOfficialGet) && me !== "true") {
      // Auto-sync only when explicitly requested (admin only)
      if (sync === "true" && isAdminGet) {
        try {
          const [{ data: allMembers }, { data: allSubs }] = await Promise.all([
            supabase.from("users").select("id").eq("status", "approved").neq("role", "super_admin"),
            supabase.from("subscriptions").select("user_id, period, amount, due_date").order("created_at", { ascending: false }),
          ]);

          if (allMembers && allSubs && allSubs.length > 0) {
            const periodMap = new Map<string, { amount: number; due_date: string | null }>();
            for (const s of allSubs) {
              if (!periodMap.has(s.period)) {
                periodMap.set(s.period, { amount: s.amount, due_date: s.due_date });
              }
            }

            const existingSet = new Set(allSubs.map((s: { user_id: string; period: string }) => `${s.user_id}::${s.period}`));

            const missing: { user_id: string; period: string; amount: number; due_date: string | null; status: string }[] = [];
            for (const member of allMembers) {
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

      // Build query — fetch subscriptions and stats in parallel
      let query = supabase
        .from("subscriptions")
        .select("*, users!subscriptions_user_id_fkey(name, email, phone), approver:users!subscriptions_approved_by_fkey(name)")
        .order("created_at", { ascending: false });

      if (period) query = query.eq("period", period);
      if (status && status !== "all") query = query.eq("status", status);

      const [{ data: subscriptions, error: subError }, paidRes, pendingRes, overdueRes, totalAmountRes] = await Promise.all([
        query,
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "paid"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("subscriptions").select("amount").eq("status", "paid"),
      ]);

      if (subError) {
        await logError({ type: "api", message: subError.message, path: "/api/subscriptions", method: "GET", status_code: 200, metadata: { context: "subscription-query" } });
      }

      const totalCollected = (totalAmountRes.data || []).reduce((sum: number, r: { amount: number }) => sum + (r.amount || 0), 0);

      return NextResponse.json({
        subscriptions: subscriptions || [],
        stats: {
          paid: paidRes.count || 0,
          pending: pendingRes.count || 0,
          overdue: overdueRes.count || 0,
          totalCollected,
        },
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

    const supabase = getServiceClient();
    const body = await req.json();

    if (body.action === "bulk-create") {
      // Get all approved members including admins (exclude super_admin)
      const { data: users } = await supabase
        .from("users")
        .select("id")
        .eq("status", "approved")
        .neq("role", "super_admin");

      if (!users || users.length === 0) {
        return NextResponse.json({ error: "No approved members found" }, { status: 400 });
      }

      // Get existing subscriptions for this period
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("period", body.period);

      const existingIds = new Set((existing || []).map((s: { user_id: string }) => s.user_id));
      const newUsers = users.filter((u: { id: string }) => !existingIds.has(u.id));

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

    const body = await req.json();
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

    const updates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (body.status) {
      updates.status = body.status;
      if (body.status === "paid") {
        updates.paid_at = body.paid_at || new Date().toISOString();
        updates.approved_by = session.userId;
        updates.approved_at = new Date().toISOString();
      } else {
        // Clear approval info when reverting
        updates.approved_by = null;
        updates.approved_at = null;
      }
    }
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.payment_method !== undefined) updates.payment_method = body.payment_method;
    if (body.transaction_id !== undefined) updates.transaction_id = body.transaction_id;
    if (body.remarks !== undefined) updates.remarks = body.remarks;
    if (body.payment_proof_url !== undefined) updates.payment_proof_url = body.payment_proof_url;
    if (body.payment_group_id !== undefined) updates.payment_group_id = body.payment_group_id;

    const { error } = await supabase
      .from("subscriptions")
      .update(updates)
      .eq("id", body.id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

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

    // Send email notification when subscription is approved (marked as paid)
    if (body.status === "paid") {
      try {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("period, amount, user_id, users!subscriptions_user_id_fkey(name, email)")
          .eq("id", body.id)
          .single();

        if (sub?.users) {
          const user = sub.users as unknown as { name: string; email: string };
          await sendSubscriptionApprovedEmail(
            user.email,
            user.name || "Member",
            sub.period,
            sub.amount || 0
          );
          // Broadcast to all members
          notifyPaymentVerified(user.name || "Member", sub.period);
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
