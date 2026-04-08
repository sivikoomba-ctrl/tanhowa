import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";
import { sendTrainerInviteEmail } from "@/lib/mail";

/**
 * GET /api/trainings/invite
 * - Members: returns their pending trainer invites
 * - Admins: returns invites for a specific training (?training_id=xxx)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const trainingId = url.searchParams.get("training_id");

    if (trainingId && (await isAdmin(session))) {
      // Admin: get invites for a specific training
      const { data } = await supabase
        .from("trainer_invites")
        .select("*, user:users!trainer_invites_user_id_fkey(name, email, phone, photo_url)")
        .eq("training_id", trainingId)
        .order("created_at", { ascending: false });
      return NextResponse.json({ invites: data || [] });
    }

    // Member: get own pending trainer invites
    const { data } = await supabase
      .from("trainer_invites")
      .select("*, training:trainings!trainer_invites_training_id_fkey(title, date, location, mode, meeting_link, duration_hours), inviter:users!trainer_invites_invited_by_fkey(name)")
      .eq("user_id", session.userId)
      .eq("status", "pending");

    return NextResponse.json({ invites: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/trainings/invite", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch invites" }, { status: 500 });
  }
}

/**
 * POST /api/trainings/invite
 * Admin sends a trainer invite (member or external).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { training_id, user_id, external_name, external_email, external_phone, message } = body;

    if (!training_id) return NextResponse.json({ error: "Training ID required" }, { status: 400 });
    if (!user_id && !external_email) {
      return NextResponse.json({ error: "Member or external email required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Check training exists
    const { data: training } = await supabase
      .from("trainings")
      .select("id, title, date, location, mode, duration_hours, meeting_link")
      .eq("id", training_id)
      .single();
    if (!training) return NextResponse.json({ error: "Training not found" }, { status: 404 });

    // Check for existing pending invite on this training
    const existingQuery = supabase
      .from("trainer_invites")
      .select("id")
      .eq("training_id", training_id)
      .eq("status", "pending");

    if (user_id) {
      existingQuery.eq("user_id", user_id);
    } else {
      existingQuery.eq("external_email", external_email);
    }

    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "A pending invite already exists for this trainer" }, { status: 400 });
    }

    // Create invite
    const insertData: Record<string, unknown> = {
      training_id,
      invited_by: session.userId,
      message: message || "",
      status: "pending",
    };

    if (user_id) {
      insertData.user_id = user_id;
    } else {
      insertData.external_name = external_name || "";
      insertData.external_email = external_email;
      insertData.external_phone = external_phone || "";
    }

    const { data, error } = await supabase
      .from("trainer_invites")
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/trainings/invite", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
    }

    // Send email for external trainers
    if (!user_id && external_email) {
      const trainerName = external_name || "Trainer";
      sendTrainerInviteEmail(
        external_email,
        trainerName,
        training.title,
        training.date ? new Date(training.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "TBA",
        training.location || "TBA",
        training.mode || "offline",
        message || ""
      ).catch(() => {});
    }

    // If member, send email notification too
    if (user_id) {
      const { data: member } = await supabase.from("users").select("name, email").eq("id", user_id).single();
      if (member?.email) {
        sendTrainerInviteEmail(
          member.email,
          member.name || "Member",
          training.title,
          training.date ? new Date(training.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "TBA",
          training.location || "TBA",
          training.mode || "offline",
          message || ""
        ).catch(() => {});
      }
    }

    logAudit(session.userId, "trainer_invited", "training", training_id, { user_id, external_email });

    return NextResponse.json({ message: "Trainer invite sent", id: data.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/trainings/invite", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}

/**
 * PUT /api/trainings/invite
 * Member accepts/declines invite, or admin confirms external trainer.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { invite_id, action } = await req.json();
    if (!invite_id || (action !== "accept" && action !== "decline" && action !== "confirm_external")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: invite } = await supabase
      .from("trainer_invites")
      .select("id, training_id, user_id, external_name, external_email, external_phone, status")
      .eq("id", invite_id)
      .single();

    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    if (invite.status !== "pending") return NextResponse.json({ error: "Invite already responded" }, { status: 400 });

    // Member can only respond to their own invites
    if (action !== "confirm_external" && invite.user_id !== session.userId) {
      return NextResponse.json({ error: "Not your invite" }, { status: 403 });
    }

    // Admin can confirm external trainers
    if (action === "confirm_external" && !(await isAdmin(session))) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const newStatus = action === "decline" ? "declined" : "accepted";

    // Update invite
    await supabase
      .from("trainer_invites")
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq("id", invite_id);

    // On accept: update the training's trainer fields
    if (newStatus === "accepted") {
      const trainerUpdate: Record<string, unknown> = {};

      if (invite.user_id) {
        // Member trainer — pull details from profile
        const { data: user } = await supabase
          .from("users")
          .select("name, email, phone")
          .eq("id", invite.user_id)
          .single();
        if (user) {
          trainerUpdate.trainer_name = user.name;
          trainerUpdate.trainer_email = user.email;
          trainerUpdate.trainer_phone = user.phone || "";
          trainerUpdate.trainer_type = "member";
          trainerUpdate.trainer_user_id = invite.user_id;
        }
      } else {
        // External trainer
        trainerUpdate.trainer_name = invite.external_name;
        trainerUpdate.trainer_email = invite.external_email;
        trainerUpdate.trainer_phone = invite.external_phone || "";
        trainerUpdate.trainer_type = "external";
      }

      await supabase.from("trainings").update(trainerUpdate).eq("id", invite.training_id);
    }

    logAudit(session.userId, `trainer_invite_${newStatus}`, "trainer_invite", invite_id);

    const messages: Record<string, string> = {
      accept: "You have accepted the trainer invite!",
      decline: "Invite declined",
      confirm_external: "External trainer confirmed",
    };

    return NextResponse.json({ message: messages[action], status: newStatus });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/trainings/invite", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to respond" }, { status: 500 });
  }
}
