import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    let query = supabase
      .from("trainings")
      .select("*, creator:created_by(name), trainer_user:trainer_user_id(name, email, phone)")
      .order("date", { ascending: true });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: trainings, error } = await query;
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/trainings", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch trainings" }, { status: 500 });
    }

    // Fetch enrollment counts and user's enrollment status
    const trainingIds = (trainings || []).map((t) => t.id);
    let enrollments: { training_id: string; user_id: string; status: string }[] = [];
    if (trainingIds.length > 0) {
      const { data: enrollData } = await supabase
        .from("training_enrollments")
        .select("training_id, user_id, status")
        .in("training_id", trainingIds);
      enrollments = enrollData || [];
    }

    const result = (trainings || []).map((t) => {
      const tEnrollments = enrollments.filter((e) => e.training_id === t.id);
      const enrolledCount = tEnrollments.filter((e) => e.status !== "cancelled").length;
      const userEnrollment = tEnrollments.find((e) => e.user_id === session.userId);
      return {
        ...t,
        enrolled_count: enrolledCount,
        user_enrolled: userEnrollment ? userEnrollment.status : null,
      };
    });

    return NextResponse.json({ trainings: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/trainings", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch trainings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.title?.trim() || !body.trainer_name?.trim()) {
      return NextResponse.json({ error: "Title and trainer name are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("trainings")
      .insert({
        title: body.title.trim(),
        description: body.description || "",
        topic: body.topic || "",
        trainer_name: body.trainer_name.trim(),
        trainer_email: body.trainer_email || "",
        trainer_phone: body.trainer_phone || "",
        trainer_type: body.trainer_type || "member",
        trainer_user_id: body.trainer_user_id || null,
        date: body.date || null,
        duration_hours: body.duration_hours || 1,
        location: body.location || "",
        mode: body.mode || "offline",
        meeting_link: body.meeting_link || "",
        max_participants: body.max_participants || 0,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/trainings", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create training" }, { status: 500 });
    }

    logContribution(session.userId, "training_created", "Created training: " + body.title);
    return NextResponse.json({ training: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/trainings", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create training" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Handle enrollment actions
    if (body.action === "enroll") {
      const supabase = getServiceClient();
      const { error } = await supabase
        .from("training_enrollments")
        .upsert({ training_id: body.training_id, user_id: session.userId, status: "enrolled" }, { onConflict: "training_id,user_id" });
      if (error) {
        return NextResponse.json({ error: "Failed to enroll" }, { status: 500 });
      }
      logContribution(session.userId, "training_enrolled", "Enrolled in training");
      return NextResponse.json({ message: "Enrolled" });
    }

    if (body.action === "cancel_enrollment") {
      const supabase = getServiceClient();
      const { error } = await supabase
        .from("training_enrollments")
        .update({ status: "cancelled" })
        .eq("training_id", body.training_id)
        .eq("user_id", session.userId);
      if (error) {
        return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
      }
      return NextResponse.json({ message: "Cancelled" });
    }

    // Admin: update training or mark attendance
    if (!(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (body.action === "mark_attendance") {
      const supabase = getServiceClient();
      const { user_id, training_id, attendance_status } = body;
      const { error } = await supabase
        .from("training_enrollments")
        .update({ status: attendance_status })
        .eq("training_id", training_id)
        .eq("user_id", user_id);
      if (error) {
        return NextResponse.json({ error: "Failed to update attendance" }, { status: 500 });
      }
      return NextResponse.json({ message: "Updated" });
    }

    // Update training details
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowedFields = ["title", "description", "topic", "trainer_name", "trainer_email", "trainer_phone", "trainer_type", "trainer_user_id", "date", "duration_hours", "location", "mode", "meeting_link", "max_participants", "status", "materials_url"];
    for (const f of allowedFields) {
      if (updates[f] !== undefined) updateData[f] = updates[f];
    }

    const { error } = await supabase.from("trainings").update(updateData).eq("id", id);
    if (error) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/trainings", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("trainings").delete().eq("id", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/trainings", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
