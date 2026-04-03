import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { notifyNewMemberRegistered } from "@/lib/mail";

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
            .filter((p: { period: string }) => !userPeriods.has(p.period))
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
      const { officialType } = body; // "state", "district", or null (to remove)
      if (officialType !== null && officialType !== "state" && officialType !== "district") {
        return NextResponse.json({ error: "Invalid official type" }, { status: 400 });
      }
      await supabase.from("users").update({ official_type: officialType }).eq("id", userId);
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

    await supabase.from("users").delete().eq("id", userId);

    return NextResponse.json({ message: "User deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/users", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
