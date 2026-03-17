// 2Factor.in SMS OTP API helper
// API docs: https://2factor.in/CP/

const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY || "";
const BASE_URL = "https://2factor.in/API/V1";

interface TwoFactorResponse {
  Status: "Success" | "Error";
  Details: string;
}

/**
 * Send OTP to an Indian mobile number via 2Factor.in
 * Returns the session ID needed for verification
 */
export async function sendSmsOtp(phone: string): Promise<string> {
  if (!TWOFACTOR_API_KEY) {
    throw new Error("TWOFACTOR_API_KEY is not configured");
  }

  // Normalize: strip spaces, dashes, parentheses, and leading +91 or 91
  const digits = phone.replace(/[\s\-\+\(\)]/g, "");
  const normalized = digits.startsWith("91") && digits.length === 12
    ? digits.slice(2)
    : digits;

  if (!/^[6-9]\d{9}$/.test(normalized)) {
    throw new Error("Invalid Indian mobile number");
  }

  const res = await fetch(`${BASE_URL}/${TWOFACTOR_API_KEY}/SMS/${normalized}/AUTOGEN`, {
    method: "GET",
  });

  const data: TwoFactorResponse = await res.json();

  if (data.Status !== "Success") {
    throw new Error(data.Details || "Failed to send SMS OTP");
  }

  // Details contains the session ID
  return data.Details;
}

/**
 * Verify an OTP against a 2Factor session
 */
export async function verifySmsOtp(sessionId: string, otp: string): Promise<boolean> {
  if (!TWOFACTOR_API_KEY) {
    throw new Error("TWOFACTOR_API_KEY is not configured");
  }

  const res = await fetch(`${BASE_URL}/${TWOFACTOR_API_KEY}/SMS/VERIFY3/${sessionId}/${otp}`, {
    method: "GET",
  });

  const data: TwoFactorResponse = await res.json();

  return data.Status === "Success" && data.Details === "OTP Matched";
}
