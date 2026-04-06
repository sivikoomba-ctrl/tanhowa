// @ts-expect-error -- no type declarations for web-push
import webpush from "web-push";
import { getServiceClient } from "@/lib/supabase";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = "mailto:tanhowaadmin@tanhowa.in";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Send push notification to a specific user (fire-and-forget).
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data?.endpoint) return;

    await webpush.sendNotification(
      { endpoint: data.endpoint, keys: data.keys },
      JSON.stringify(payload),
    );
  } catch {
    // Silent — subscription may be expired
  }
}

/**
 * Send push notification to all subscribed users (fire-and-forget).
 */
export async function sendPushToAll(payload: PushPayload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  try {
    const supabase = getServiceClient();
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys, user_id");

    if (!subs || subs.length === 0) return;

    const promises = subs.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        )
        .catch(() => {
          // Remove expired subscriptions
          supabase.from("push_subscriptions").delete().eq("user_id", sub.user_id).then(() => {});
        }),
    );

    await Promise.allSettled(promises);
  } catch {
    // Silent
  }
}
