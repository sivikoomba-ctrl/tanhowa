import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { notifyNewMemberRegistered, sendSuspensionEmail, sendReinstatementEmail } from "@/lib/mail";
import { sendTelegramMessage } from "@/lib/telegram";

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { userId, action, role } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    if (action === "approve") {
      // Get user details before updating
      const { data: userData } = await supabase.from("users").select("name, email, occupation").eq("id", userId).single();

      // Block approval if name is missing
      if (!userData?.name?.trim()) {
        return NextResponse.json({ error: "Cannot approve: member has not filled their name" }, { status: 400 });
      }

      await supabase.from("users").update({ status: "approved" }).eq("id", userId);

      // Auto-assign existing subscription periods to the new member
      try {
        // Get all distinct periods with their latest amount and due_date
        const { data: existingPeriods } = await supabase
          .from("subscriptions")
          .select("period, amount, due_date")
          .order("created_at", { ascending: false });

        if (existingPeriods && existingPeriods.length > 0) {
          // Get unique periods (first occurrence = latest)
          const seen = new Set<string>();
          const uniquePeriods = existingPeriods.filter((p: { period: string }) => {
            if (seen.has(p.period)) return false;
            seen.add(p.period);
            return true;
          });

          // Check which periods the user already has
          const { data: userSubs } = await supabase
            .from("subscriptions")
            .select("period")
            .eq("user_id", userId);
          const userPeriods = new Set((userSubs || []).map((s: { period: string }) => s.period));

          const newRows = uniquePeriods
            .filter((p: { period: string }) => !userPeriods.has(p.period) && /^\d{4}$/.test(p.period))
            .map((p: { period: string; amount: number; due_date: string | null }) => ({
              user_id: userId,
              period: p.period,
              amount: p.amount || 0,
              due_date: p.due_date || null,
              status: "pending",
            }));

          if (newRows.length > 0) {
            await supabase.from("subscriptions").insert(newRows);
          }
        }
      } catch {
        // Don't fail the approval if subscription creation fails
      }

      // Notify all members about the new member (fire-and-forget)
      notifyNewMemberRegistered(userData?.name || userData?.email || "New Member");

      logContribution(session.userId, "member_approved", "Approved member: " + (userData?.name || userData?.email || "Unknown"));
    } else if (action === "reject") {
      await supabase.from("users").update({ status: "rejected" }).eq("id", userId);
      logContribution(session.userId, "member_rejected", "Rejected member");
    } else if (action === "set-role" && role) {
      // Prevent changing a super_admin's role
      const targetRole = await getDbRole(userId);
      if (targetRole === "super_admin") {
        return NextResponse.json({ error: "Cannot change Super Admin role" }, { status: 403 });
      }
      // Prevent promoting to super_admin (only auto-assigned to default admin email)
      if (role === "super_admin") {
        return NextResponse.json({ error: "Cannot assign Super Admin role" }, { status: 403 });
      }
      await supabase.from("users").update({ role }).eq("id", userId);
    } else if (action === "set-official") {
      const { officialType } = body; // "state", "district", "volunteer", or null (to remove)
      if (officialType !== null && officialType !== "state" && officialType !== "district" && officialType !== "volunteer") {
        return NextResponse.json({ error: "Invalid official type" }, { status: 400 });
      }

      // District officials (DS/DJS) can only assign/remove "volunteer" type, and only within their district
      const callerInfo = await getOfficialInfo(session.userId);
      const isDistrictOfficial = callerInfo.official_type === "district" && callerInfo.role === "admin";
      const isSuperOrStateAdmin = callerInfo.role === "super_admin" || callerInfo.official_type === "state";

      if (isDistrictOfficial && !isSuperOrStateAdmin) {
        // DS/DJS can only set/remove volunteer
        if (officialType !== null && officialType !== "volunteer") {
          return NextResponse.json({ error: "District officials can only assign Volunteer Admin role" }, { status: 403 });
        }
        // Verify target member is in the same district
        const { data: targetUser } = await supabase.from("users").select("posting_details, official_type").eq("id", userId).single();
        const targetDistrict = (targetUser?.posting_details as { regular_district?: string } | null)?.regular_district;
        if (targetDistrict !== callerInfo.district) {
          return NextResponse.json({ error: "You can only assign volunteers in your district" }, { status: 403 });
        }
        // Cannot remove non-volunteer officials
        if (officialType === null && targetUser?.official_type !== "volunteer") {
          return NextResponse.json({ error: "You can only remove Volunteer Admin designation" }, { status: 403 });
        }
      }

      await supabase.from("users").update({ official_type: officialType }).eq("id", userId);
    } else if (action === "set-tanhowa-designation") {
      // Only super_admin or state officials can set TANHOWA designations
      const callerInfo = await getOfficialInfo(session.userId);
      if (callerInfo.role !== "super_admin" && callerInfo.official_type !== "state") {
        return NextResponse.json({ error: "Only TANHOWA Admin can assign TANHOWA designations" }, { status: 403 });
      }

      const { designation } = body;
      const validDesignations = ["President", "State Secretary", "Treasurer", "District Secretary", "District Joint Secretary", "Volunteer Member", "Member", "TANHOWA Admin", ""];
      if (typeof designation !== "string" || !validDesignations.includes(designation)) {
        return NextResponse.json({ error: "Invalid TANHOWA designation" }, { status: 400 });
      }

      // Get current posting_details and update official_designation
      const { data: targetUser } = await supabase.from("users").select("posting_details").eq("id", userId).single();
      const postingDetails = (targetUser?.posting_details || {}) as Record<string, unknown>;
      if (designation) {
        postingDetails.official_designation = designation;
      } else {
        delete postingDetails.official_designation;
      }
      await supabase.from("users").update({ posting_details: postingDetails }).eq("id", userId);
    } else if (action === "edit-profile") {
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = typeof body.name === "string" ? body.name.trim().toUpperCase() : body.name;
      if (body.phone !== undefined) updates.phone = body.phone;
      if (body.occupation !== undefined) updates.occupation = body.occupation;
      if (body.address !== undefined) updates.address = body.address;
      if (body.office_address !== undefined) updates.office_address = body.office_address;
      if (body.dob !== undefined) updates.dob = body.dob;
      if (body.posting_details !== undefined) updates.posting_details = body.posting_details;
      if (body.social_links !== undefined) updates.social_links = body.social_links;

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      await supabase.from("users").update(updates).eq("id", userId);
      logContribution(session.userId, "member_profile_edited", "Edited profile for user: " + userId);
    } else if (action === "suspend") {
      // Only tanhowa19791@gmail.com can suspend members
      if (session.email !== "tanhowa19791@gmail.com") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { reason, remarks } = body;
      const validReasons = ["non_payment", "disciplinary", "voluntary", "transfer", "retirement", "other"];
      if (!reason || !validReasons.includes(reason)) {
        return NextResponse.json({ error: "Valid suspension reason required" }, { status: 400 });
      }

      // Cannot suspend admins
      const targetRole = await getDbRole(userId);
      if (targetRole === "super_admin") {
        return NextResponse.json({ error: "Cannot suspend a super admin" }, { status: 400 });
      }

      const suspensionDetails = {
        reason,
        remarks: remarks || "",
        suspended_by: session.userId,
        suspended_at: new Date().toISOString(),
      };

      await supabase.from("users").update({
        status: "suspended",
        suspension_details: suspensionDetails,
      }).eq("id", userId);

      // Send notifications (fire-and-forget)
      const { data: targetUser } = await supabase.from("users").select("name, email, telegram_chat_id").eq("id", userId).single();
      if (targetUser) {
        const reasonLabels: Record<string, string> = {
          non_payment: "Non-payment of subscriptions",
          disciplinary: "Disciplinary action",
          voluntary: "Voluntary withdrawal",
          transfer: "Transfer out of TN Horticulture",
          retirement: "Retirement",
          other: "Administrative decision",
        };
        sendSuspensionEmail(targetUser.email, targetUser.name || "Member", reasonLabels[reason], remarks || "").catch(() => {});
        if (targetUser.telegram_chat_id) {
          sendTelegramMessage(targetUser.telegram_chat_id, `⚠️ <b>Membership Suspended</b>\n\nYour TANHOWA membership has been suspended.\n<b>Reason:</b> ${reasonLabels[reason]}${remarks ? `\n<b>Remarks:</b> ${remarks}` : ""}\n\nPlease contact admin for queries.`).catch(() => {});
        }
      }
    } else if (action === "reinstate") {
      // Only tanhowa19791@gmail.com can reinstate members
      if (session.email !== "tanhowa19791@gmail.com") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await supabase.from("users").update({
        status: "approved",
        suspension_details: null,
      }).eq("id", userId);

      // Send notifications (fire-and-forget)
      const { data: targetUser } = await supabase.from("users").select("name, email, telegram_chat_id").eq("id", userId).single();
      if (targetUser) {
        sendReinstatementEmail(targetUser.email, targetUser.name || "Member").catch(() => {});
        if (targetUser.telegram_chat_id) {
          sendTelegramMessage(targetUser.telegram_chat_id, `✅ <b>Membership Reinstated</b>\n\nYour TANHOWA membership has been reinstated. You can now access the portal.\n\n🌐 <a href="https://www.tanhowa.in">tanhowa.in</a>`).catch(() => {});
        }
      }
    } else if (action === "nudge") {
      const { fields, message } = body;
      if (!fields || !Array.isArray(fields) || fields.length === 0) {
        return NextResponse.json({ error: "At least one field is required" }, { status: 400 });
      }
      // Merge with existing nudge fields instead of overwriting
      const { data: existingUser } = await supabase.from("users").select("profile_nudge").eq("id", userId).single();
      const existing = (existingUser?.profile_nudge as { fields?: string[] } | null)?.fields || [];
      const mergedFields = [...new Set([...existing, ...fields])];
      await supabase
        .from("users")
        .update({
          profile_nudge: {
            fields: mergedFields,
            message: message || "",
            requested_at: new Date().toISOString(),
            requested_by: session.userId,
          },
        })
        .eq("id", userId);
    } else if (action === "remove-photo") {
      // Restricted to super-admins and state officials (district admins excluded).
      const callerInfo = await getOfficialInfo(session.userId);
      if (callerInfo.role !== "super_admin" && callerInfo.official_type !== "state") {
        return NextResponse.json({ error: "Only super-admins and state officials can remove member photos" }, { status: 403 });
      }
      await supabase.from("users").update({ photo_url: "" }).eq("id", userId);
    }

    logAudit(session.userId, action, "user", userId, { role, ...body });

    return NextResponse.json({ message: "User updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/users", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === session.userId) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Prevent deleting a super_admin
    const targetRole = await getDbRole(userId);
    if (targetRole === "super_admin") {
      return NextResponse.json({ error: "Cannot delete Super Admin" }, { status: 403 });
    }

    // Capture identity + district before delete so the audit row is self-contained
    // (target_id will point to a row that no longer exists)
    const { data: target } = await supabase
      .from("users")
      .select("name, email, posting_details")
      .eq("id", userId)
      .single();
    const district = (target?.posting_details as { regular_district?: string } | null)?.regular_district ?? null;

    await supabase.from("users").delete().eq("id", userId);

    logAudit(session.userId, "delete", "user", userId, {
      name: target?.name ?? null,
      email: target?.email ?? null,
      district,
    });

    return NextResponse.json({ message: "User deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/users", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
