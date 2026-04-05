import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logContribution } from "@/lib/contributions";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { training_id } = await req.json();
    if (!training_id) {
      return NextResponse.json({ error: "Training ID required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Verify training exists and is ongoing
    const { data: training } = await supabase
      .from("trainings")
      .select("id, title, status")
      .eq("id", training_id)
      .single();

    if (!training) {
      return NextResponse.json({ error: "Training not found" }, { status: 404 });
    }

    if (training.status !== "ongoing" && training.status !== "upcoming") {
      return NextResponse.json({ error: "Training is not active" }, { status: 400 });
    }

    // Upsert enrollment with attended status
    const { error } = await supabase
      .from("training_enrollments")
      .upsert(
        { training_id, user_id: session.userId, status: "attended" },
        { onConflict: "training_id,user_id" }
      );

    if (error) {
      return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
    }

    logContribution(session.userId, "training_enrolled", `Attended training: ${training.title}`);

    return NextResponse.json({ message: "Checked in successfully", training: training.title });
  } catch {
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
