/**
 * Razorpay integration for self-service subscription payments.
 *
 * Environment variables required:
 *   RAZORPAY_KEY_ID      — from Razorpay Dashboard > Settings > API Keys
 *   RAZORPAY_KEY_SECRET  — secret key (never expose to client)
 *
 * Flow:
 *   1. Member clicks "Pay Online" on their subscription
 *   2. Frontend calls POST /api/payments/create-order with subscription ID
 *   3. API creates a Razorpay order and returns order_id + key_id
 *   4. Frontend opens Razorpay checkout with order_id
 *   5. On success, frontend calls POST /api/payments/verify with payment details
 *   6. API verifies signature and marks subscription as paid
 */

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_API = "https://api.razorpay.com/v1";

function getAuthHeader() {
  return "Basic " + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
}

export function isRazorpayConfigured(): boolean {
  return !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

export function getRazorpayKeyId(): string {
  return RAZORPAY_KEY_ID;
}

export interface CreateOrderParams {
  amount: number; // in rupees (will be converted to paise)
  receipt: string; // subscription ID or reference
  notes?: Record<string, string>;
}

export async function createOrder(params: CreateOrderParams) {
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      amount: Math.round(params.amount * 100), // convert to paise
      currency: "INR",
      receipt: params.receipt,
      notes: params.notes || {},
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.description || "Failed to create Razorpay order");
  }

  return res.json();
}

export async function verifySignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  // Razorpay signature verification using Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(RAZORPAY_KEY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const body = orderId + "|" + paymentId;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expectedSignature = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expectedSignature === signature;
}
