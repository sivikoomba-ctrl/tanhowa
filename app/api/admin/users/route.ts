import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
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
      // Get user name before updating
      const { data: userData } = await supabase.from("users").select("name").eq("id", userId).single();
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
      notifyNewMemberRegistered(userData?.name || "New Member");
    } else if (action === "reject") {
      await supabase.from("users").update({ status: "rejected" }).eq("id", userId);
    } else if (action === "set-role" && role) {
      await supabase.from("users").update({ role }).eq("id", userId);
    }

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
    await supabase.from("users").delete().eq("id", userId);

    return NextResponse.json({ message: "User deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/users", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
