"use client";

import { useEffect, useRef } from "react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Auto-subscribes to push notifications if permission is granted.
 * Runs once per session. Does nothing if VAPID key is not set.
 */
export function PushManager() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !VAPID_PUBLIC || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    done.current = true;

    (async () => {
      try {
        // Wait for service worker
        const reg = await navigator.serviceWorker.ready;

        // Check if already subscribed
        let sub = await reg.pushManager.getSubscription();

        if (!sub && Notification.permission === "granted") {
          // Auto-subscribe if permission already granted
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
          });
        }

        if (sub) {
          // Send subscription to server
          await fetch("/api/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          });
        }
      } catch {
        // Silent — push not supported or denied
      }
    })();
  }, []);

  return null;
}
