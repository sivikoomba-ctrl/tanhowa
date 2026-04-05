"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

interface AnalyticsEvent {
  event_type: "page_view" | "click";
  page_path: string;
  element_id?: string;
  element_text?: string;
  device_type: string;
  screen_width: number;
  screen_height: number;
  user_agent: string;
  referrer: string;
  session_id: string;
  user_id?: string;
}

const FLUSH_INTERVAL = 3000;
const MAX_BATCH = 10;

export function AnalyticsTracker() {
  const pathname = usePathname();
  const queue = useRef<AnalyticsEvent[]>([]);
  const sessionId = useRef<string>("");
  const userId = useRef<string | null>(null);
  const userFetched = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getDeviceType = useCallback(() => {
    return typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop";
  }, []);

  const getBase = useCallback((): Omit<AnalyticsEvent, "event_type" | "page_path"> => ({
    device_type: getDeviceType(),
    screen_width: typeof window !== "undefined" ? window.innerWidth : 0,
    screen_height: typeof window !== "undefined" ? window.innerHeight : 0,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    session_id: sessionId.current,
    ...(userId.current ? { user_id: userId.current } : {}),
  }), [getDeviceType]);

  const flush = useCallback(() => {
    if (queue.current.length === 0) return;
    const events = queue.current.splice(0);
    const body = JSON.stringify(events);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/analytics", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  }, []);

  const queueEvent = useCallback((event: AnalyticsEvent) => {
    queue.current.push(event);
    if (queue.current.length >= MAX_BATCH) flush();
  }, [flush]);

  // Init session ID + fetch user ID
  useEffect(() => {
    let sid = sessionStorage.getItem("_at_sid");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("_at_sid", sid);
    }
    sessionId.current = sid;

    if (!userFetched.current) {
      userFetched.current = true;
      fetch("/api/users/me")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.user?.id) userId.current = d.user.id; })
        .catch(() => {});
    }

    // Flush timer
    timerRef.current = setInterval(flush, FLUSH_INTERVAL);

    // Flush on page unload
    const handleUnload = () => flush();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("beforeunload", handleUnload);
      flush();
    };
  }, [flush]);

  // Track page views
  useEffect(() => {
    if (!sessionId.current) return;
    queueEvent({ event_type: "page_view", page_path: pathname, ...getBase() });
  }, [pathname, queueEvent, getBase]);

  // Track clicks (delegated)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const el = target.closest("button, a, [data-track]") as HTMLElement | null;
      if (!el) return;

      const text = (el.textContent || "").trim().slice(0, 100);
      const id = el.getAttribute("data-track") || el.id || el.tagName.toLowerCase();
      if (!text && !id) return;

      queueEvent({
        event_type: "click",
        page_path: pathname,
        element_id: id,
        element_text: text,
        ...getBase(),
      });
    }

    document.addEventListener("click", handleClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname, queueEvent, getBase]);

  return null;
}
