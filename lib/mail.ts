import { LOGO_DATA_URI } from "./logo-base64";

const FROM_EMAIL = process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in";
const FROM_NAME = "TANHOWA";
const LOGO_URL = "https://www.tanhowa.in/logo.png";

// HOLD: All member-facing emails (except OTP) are temporarily disabled.
// Set to false to re-enable member emails.
const HOLD_MEMBER_EMAILS = true;

interface EmailAddress {
  address: string;
  name?: string;
}

interface ZeptoMailAttachment {
  content: string; // base64
  mime_type: string;
  name: string;
}

interface ZeptoMailPayload {
  from: { address: string; name: string };
  to: { email_address: EmailAddress }[];
  subject: string;
  htmlbody: string;
  bcc?: { email_address: EmailAddress }[];
  attachments?: ZeptoMailAttachment[];
}

async function sendZeptoMail(payload: ZeptoMailPayload) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) {
    throw new Error("ZEPTOMAIL_TOKEN not configured");
  }

  const res = await fetch("https://api.zeptomail.in/v1.1/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Zoho-enczapikey ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`ZeptoMail API error (${res.status}): ${errorText}`);
  }

  return res.json();
}

async function sendEmail(to: string, subject: string, htmlbody: string, attachments?: ZeptoMailAttachment[]) {
  return sendZeptoMail({
    from: { address: FROM_EMAIL, name: FROM_NAME },
    to: [{ email_address: { address: to } }],
    subject,
    htmlbody,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  });
}

/** Generate a PDF receipt as base64 string (server-side, same layout as client downloadReceipt) */
async function generateReceiptPdf(
  memberName: string,
  email: string,
  period: string,
  amount: number,
  details: { phone?: string; payment_method?: string; transaction_id?: string; paid_at?: string; approved_at?: string },
): Promise<string> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const paidDate = details.paid_at
    ? new Date(details.paid_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  // Header — logo + branding
  try {
    doc.addImage(LOGO_DATA_URI, "PNG", 90, 8, 30, 24);
  } catch {
    // If image fails for any reason, fall through to text-only header
  }
  doc.setFontSize(16);
  doc.setTextColor(45, 106, 79);
  doc.text("TANHOWA", 105, 40, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Tamil Nadu Horticultural Officers Welfare Association", 105, 46, { align: "center" });
  doc.setFontSize(10);
  doc.text("Payment Receipt", 105, 52, { align: "center" });

  // Divider
  doc.setDrawColor(45, 106, 79);
  doc.setLineWidth(0.5);
  doc.line(20, 56, 190, 56);

  // Receipt details
  doc.setFontSize(11);
  doc.setTextColor(0);
  let y = 66;
  const left = 25;
  const right = 90;

  const rows: [string, string][] = [
    ["Member Name", memberName],
    ["Email", email],
    ...(details.phone ? [["Phone", details.phone] as [string, string]] : []),
    ["Subscription Period", period],
    ["Amount", `Rs. ${amount.toLocaleString("en-IN")}`],
    ["Status", "Paid"],
    ...(details.payment_method ? [["Payment Method", details.payment_method] as [string, string]] : []),
    ...(details.transaction_id ? [["Transaction ID", details.transaction_id] as [string, string]] : []),
    ["Paid On", paidDate],
  ];

  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, right, y);
    y += 8;
  }

  // Footer
  y += 10;
  doc.setDrawColor(200);
  doc.line(20, y, 190, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated on ${today} from tanhowa.in`, 105, y, { align: "center" });
  doc.text("This is a computer-generated receipt and does not require a signature.", 105, y + 5, { align: "center" });

  // Return as base64
  const arrayBuffer = doc.output("arraybuffer");
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

export async function sendSubscriptionApprovedEmail(
  to: string,
  memberName: string,
  period: string,
  amount: number,
  details?: { phone?: string; payment_method?: string; transaction_id?: string; paid_at?: string; approved_at?: string },
) {
  if (HOLD_MEMBER_EMAILS) return;
  const d = details || {};

  // Generate PDF receipt
  const pdfBase64 = await generateReceiptPdf(memberName, to, period, amount, d);
  const fileName = `TANHOWA-Receipt-${period.replace(/\s+/g, "-")}.pdf`;

  await sendEmail(
    to,
    `TANHOWA Payment Receipt — ${period}`,
    `
    <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fefae0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${LOGO_URL}" alt="TANHOWA" width="88" style="display:block; margin: 0 auto 8px; max-width: 88px; height: auto;" />
        <h1 style="color: #2d6a4f; font-size: 28px; margin: 0;">TANHOWA</h1>
        <p style="color: #40916c; font-size: 14px; margin: 4px 0 0;">Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px;">
        <div style="text-align: center; margin-bottom: 16px;">
          <span style="display: inline-block; background: #f0fdf4; color: #16a34a; font-weight: 700; font-size: 13px; padding: 4px 16px; border-radius: 20px; border: 1px solid #bbf7d0;">&#10003; Payment Approved</span>
        </div>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
          Dear <strong>${memberName}</strong>,
        </p>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
          Your TANHOWA subscription payment for <strong>${period}</strong> (&#8377;${amount.toLocaleString("en-IN")}) has been verified and approved.
        </p>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
          Please find your payment receipt attached as a PDF.
        </p>
        <div style="text-align: center;">
          <a href="https://tanhowa.in/dashboard/subscriptions" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View My Subscriptions</a>
        </div>
        <p style="color: #666; font-size: 12px; margin: 20px 0 0; text-align: center;">
          Thank you for being a valued member of TANHOWA!
        </p>
      </div>
    </div>
  `,
    [{ content: pdfBase64, mime_type: "application/pdf", name: fileName }],
  );
}

/** Member-initiated receipt email — always sends (bypasses HOLD flag) */
export async function sendReceiptEmail(
  to: string,
  memberName: string,
  period: string,
  amount: number,
  details?: { phone?: string; payment_method?: string; transaction_id?: string; paid_at?: string },
) {
  const d = details || {};
  const pdfBase64 = await generateReceiptPdf(memberName, to, period, amount, d);
  const fileName = `TANHOWA-Receipt-${period.replace(/\s+/g, "-")}.pdf`;

  await sendEmail(
    to,
    `TANHOWA Payment Receipt — ${period}`,
    `
    <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fefae0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${LOGO_URL}" alt="TANHOWA" width="88" style="display:block; margin: 0 auto 8px; max-width: 88px; height: auto;" />
        <h1 style="color: #2d6a4f; font-size: 28px; margin: 0;">TANHOWA</h1>
        <p style="color: #40916c; font-size: 14px; margin: 4px 0 0;">Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px;">
        <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
          Dear <strong>${memberName}</strong>,
        </p>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
          Here is your payment receipt for <strong>${period}</strong> (&#8377;${amount.toLocaleString("en-IN")}). The PDF is attached.
        </p>
        <p style="color: #2d6a4f; font-size: 13px; font-style: italic; margin: 0 0 16px; text-align: center;">
          &#127793; Save a print, Save a Tree.
        </p>
        <div style="text-align: center;">
          <a href="https://tanhowa.in/dashboard/subscriptions" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View My Subscriptions</a>
        </div>
      </div>
    </div>
  `,
    [{ content: pdfBase64, mime_type: "application/pdf", name: fileName }],
  );
}

// Fetch all approved member emails from Supabase
async function getAllMemberEmails(): Promise<string[]> {
  const { getServiceClient } = await import("@/lib/supabase");
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("email")
    .eq("status", "approved");
  return (data || []).map((u: { email: string }) => u.email).filter(Boolean);
}

// Send a branded notification email to all approved members.
// Sends one-to-one with throttling (NOT BCC) — Gmail's `4.7.28 unusual rate
// of mail` filter rate-limits the whole tanhowa.in domain when many recipients
// are BCCed in a single message, which knocks out OTP delivery for hours.
// 250ms per send → ~4/sec, well under bulk-sender thresholds.
export async function sendBroadcastEmail(subject: string, bodyHtml: string) {
  if (HOLD_MEMBER_EMAILS) return;
  const emails = await getAllMemberEmails();
  if (emails.length === 0) return;

  const html = wrapEmailTemplate(bodyHtml);
  for (const addr of emails) {
    try {
      await sendEmail(addr, subject, html);
    } catch {
      // Continue with next recipient if one fails
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Exposes the master member-email kill-switch so callers (e.g. the weekly
 *  digest cron / its admin status page) can report whether sends are live. */
export function memberEmailsOnHold(): boolean {
  return HOLD_MEMBER_EMAILS;
}

/**
 * Throttled one-to-one send to an explicit recipient list (same anti-Gmail-bulk
 * pattern as sendBroadcastEmail — never BCC). Respects HOLD_MEMBER_EMAILS unless
 * `ignoreHold` is set (used by the owner-only digest preview, which sends only
 * to the owner). Returns delivery counts.
 */
export async function sendToRecipients(
  emails: string[],
  subject: string,
  bodyHtml: string,
  opts: { ignoreHold?: boolean } = {}
): Promise<{ sent: number; failed: number }> {
  if (HOLD_MEMBER_EMAILS && !opts.ignoreHold) return { sent: 0, failed: 0 };
  const html = wrapEmailTemplate(bodyHtml);
  let sent = 0, failed = 0;
  for (const addr of emails) {
    try {
      await sendEmail(addr, subject, html);
      sent++;
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { sent, failed };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapEmailTemplate(content: string): string {
  return `
    <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fefae0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${LOGO_URL}" alt="TANHOWA" width="88" style="display:block; margin: 0 auto 8px; max-width: 88px; height: auto;" />
        <h1 style="color: #2d6a4f; font-size: 28px; margin: 0;">TANHOWA</h1>
        <p style="color: #40916c; font-size: 14px; margin: 4px 0 0;">Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px;">
        ${content}
      </div>
      <p style="color: #999; font-size: 11px; text-align: center; margin: 16px 0 0;">
        You received this because you are a member of TANHOWA. <a href="https://tanhowa.in" style="color: #2d6a4f;">Visit Portal</a>
      </p>
    </div>
  `;
}

export function notifyNewAnnouncement(title: string, content: string) {
  const safeTitle = escapeHtml(title);
  const truncated = escapeHtml(content.length > 200 ? content.substring(0, 200) + "..." : content);
  sendBroadcastEmail(
    `New Announcement: ${safeTitle}`,
    `
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">New Announcement</h2>
      <h3 style="color: #333; font-size: 16px; margin: 0 0 8px;">${safeTitle}</h3>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px; white-space: pre-line;">${truncated}</p>
      <div style="text-align: center;">
        <a href="https://tanhowa.in/dashboard/announcements" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Announcement</a>
      </div>
    `
  ).catch(() => {});
}

export function notifyPaymentVerified(memberName: string, period: string) {
  const safeName = escapeHtml(memberName);
  const safePeriod = escapeHtml(period);
  sendBroadcastEmail(
    `Payment Update: ${safeName} - ${safePeriod}`,
    `
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Payment Verified</h2>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
        <strong>${safeName}</strong>'s subscription payment for <strong>${safePeriod}</strong> has been verified and approved.
      </p>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px;">
        Thank you for being a valued member of TANHOWA! If your payment is pending, please upload your proof in the portal.
      </p>
      <div style="text-align: center;">
        <a href="https://tanhowa.in/dashboard/subscriptions" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Subscriptions</a>
      </div>
    `
  ).catch(() => {});
}

export function notifyNewMemberRegistered(memberName: string) {
  const safeName = escapeHtml(memberName);
  sendBroadcastEmail(
    `Welcome New Member: ${safeName}`,
    `
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">New Member Joined!</h2>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
        We are happy to welcome <strong>${safeName}</strong> as a new member of TANHOWA!
      </p>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px;">
        Let us extend a warm welcome to our growing family. Together we grow stronger!
      </p>
      <div style="text-align: center;">
        <a href="https://tanhowa.in/dashboard/members" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Members</a>
      </div>
    `
  ).catch(() => {});
}

export function notifyNewEvent(title: string, date: string, location?: string) {
  const safeTitle = escapeHtml(title);
  const locationLine = location ? `<p style="color: #555; font-size: 14px; margin: 0 0 16px;">Location: <strong>${escapeHtml(location)}</strong></p>` : "";
  sendBroadcastEmail(
    `New Event: ${safeTitle}`,
    `
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">New Event Announced</h2>
      <h3 style="color: #333; font-size: 16px; margin: 0 0 8px;">${safeTitle}</h3>
      <p style="color: #555; font-size: 14px; margin: 0 0 8px;">Date: <strong>${escapeHtml(date)}</strong></p>
      ${locationLine}
      <div style="text-align: center;">
        <a href="https://tanhowa.in/dashboard/events" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Event</a>
      </div>
    `
  ).catch(() => {});
}

// Notify admin(s) when a new member completes onboarding and is awaiting approval
export async function notifyAdminNewRegistration(memberName: string, memberEmail: string) {
  try {
    // Only notify these 3 admins to avoid email flood (was 35 admins × N registrations)
    const REGISTRATION_ALERT_EMAILS = [
      "tanhowaadmin@tanhowa.in",
      "kannanhorts94@gmail.com",
      "dhanarj23@gmail.com",
    ];
    const adminEmails = REGISTRATION_ALERT_EMAILS;

    const htmlbody = wrapEmailTemplate(`
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">New Registration</h2>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
        <strong>${memberName}</strong> (${memberEmail}) has completed their profile and is awaiting your approval.
      </p>
      <div style="text-align: center;">
        <a href="https://tanhowa.in/admin/users" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">Review Pending Members</a>
      </div>
    `);

    for (const email of adminEmails) {
      try {
        await sendEmail(email, `New Member Pending Approval: ${memberName}`, htmlbody);
      } catch {
        // Continue to next admin
      }
    }
  } catch {
    // Don't fail the registration if notification fails
  }
}

export async function notifyAdminProofSubmitted(memberName: string, period: string, amount: number) {
  try {
    const ALERT_EMAILS = ["tanhowaadmin@tanhowa.in", "kannanhorts94@gmail.com", "dhanarj23@gmail.com"];
    const safeName = escapeHtml(memberName);
    const safePeriod = escapeHtml(period);
    const html = wrapEmailTemplate(`
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Payment Proof Submitted</h2>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
        <strong>${safeName}</strong> has submitted their payment proof for <strong>${safePeriod}</strong>
        (&#8377;${amount.toLocaleString("en-IN")}) and is requesting verification.
      </p>
      <div style="text-align: center;">
        <a href="https://tanhowa.in/admin/verify-payments" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">Verify Payment</a>
      </div>
    `);
    for (const email of ALERT_EMAILS) {
      try { await sendEmail(email, `Payment Proof Submitted: ${memberName} — ${period}`, html); } catch { /* continue */ }
    }
  } catch { /* silent */ }
}

/**
 * Branded one-to-one message email from an admin/official to a single member
 * (e.g. a thank-you sent via the assistant). Admin-initiated, so it bypasses
 * HOLD_MEMBER_EMAILS. Returns true on success.
 */
export async function sendMemberMessageEmail(to: string, memberName: string, subject: string, message: string): Promise<boolean> {
  try {
    await sendEmail(to, subject, wrapEmailTemplate(`
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">Dear <strong>${escapeHtml(memberName)}</strong>,</p>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px; white-space: pre-line;">${escapeHtml(message)}</p>
      <p style="color: #555; font-size: 13px; margin: 16px 0 0;">With warm regards,<br/>TANHOWA</p>
    `));
    return true;
  } catch {
    return false;
  }
}

export async function sendSubscriptionNotification(to: string, memberName: string, period: string, amount: number, message: string) {
  if (HOLD_MEMBER_EMAILS) return;
  await sendEmail(to, `TANHOWA Subscription Reminder — ${period}`, wrapEmailTemplate(`
    <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Subscription Notification</h2>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Dear <strong>${memberName}</strong>,
    </p>
    <div style="background: #fffbeb; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
      <table style="width: 100%; font-size: 14px; color: #333;">
        <tr>
          <td style="padding: 4px 0; color: #666;">Subscription Period</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right;">${period}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Amount</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right;">&#8377;${amount.toLocaleString("en-IN")}</td>
        </tr>
      </table>
    </div>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px; white-space: pre-line;">${message}</p>
    <div style="text-align: center;">
      <a href="https://tanhowa.in/dashboard/subscriptions" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View My Subscriptions</a>
    </div>
  `));
}

export async function sendPaymentRejectionAlertEmail(
  to: string,
  officialName: string,
  memberName: string,
  period: string,
  amount: number,
  rejectedBy: string,
  remarks?: string,
) {
  // Rejection alerts bypass HOLD_MEMBER_EMAILS — they're for officials, not regular members
  const remarksHtml = remarks ? `
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      <strong>Rejection Reason:</strong><br/><span style="white-space: pre-line;">${remarks}</span>
    </p>` : "";

  await sendEmail(to, `Payment Rejected: ${memberName} — ${period}`, wrapEmailTemplate(`
    <h2 style="color: #dc2626; font-size: 20px; margin: 0 0 12px;">Payment Rejection Alert</h2>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Dear <strong>${officialName}</strong>,
    </p>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      A payment you previously verified has been <strong style="color: #dc2626;">rejected</strong> by the admin.
    </p>
    <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
      <table style="width: 100%; font-size: 14px; color: #333;">
        <tr>
          <td style="padding: 4px 0; color: #666;">Member</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right;">${memberName}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Period</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right;">${period}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Amount</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right;">&#8377;${amount.toLocaleString("en-IN")}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Rejected By</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right;">${rejectedBy}</td>
        </tr>
      </table>
    </div>
    ${remarksHtml}
    <div style="text-align: center;">
      <a href="https://www.tanhowa.in/admin/verify-payments" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Payments</a>
    </div>
  `));
}

export async function sendVoucherStatusEmail(to: string, officialName: string, title: string, amount: number, status: "approved" | "rejected", remarks?: string) {
  if (HOLD_MEMBER_EMAILS) return;
  const isApproved = status === "approved";
  const statusColor = isApproved ? "#16a34a" : "#dc2626";
  const statusLabel = isApproved ? "Approved" : "Rejected";
  const bgColor = isApproved ? "#f0fdf4" : "#fef2f2";
  const remarksHtml = remarks ? `
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      <strong>Admin Remarks:</strong> ${remarks}
    </p>` : "";

  await sendEmail(to, `Expense Voucher ${statusLabel}: ${title}`, wrapEmailTemplate(`
    <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Expense Voucher ${statusLabel}</h2>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Dear <strong>${officialName}</strong>,
    </p>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Your expense voucher has been <strong style="color: ${statusColor}">${statusLabel.toLowerCase()}</strong> by the admin.
    </p>
    <div style="background: ${bgColor}; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
      <table style="width: 100%; font-size: 14px; color: #333;">
        <tr>
          <td style="padding: 4px 0; color: #666;">Expense</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right;">${title}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Amount</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right;">&#8377;${amount.toLocaleString("en-IN")}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Status</td>
          <td style="padding: 4px 0; font-weight: 600; text-align: right; color: ${statusColor};">${statusLabel}</td>
        </tr>
      </table>
    </div>
    ${remarksHtml}
    <div style="text-align: center;">
      <a href="https://tanhowa.in/dashboard/vouchers" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View My Vouchers</a>
    </div>
  `));
}

/**
 * Politely asks a member to re-upload a clear, high-resolution passport-size photo
 * after an official (or the AI pre-screen) flags their current photo as low quality.
 * Bypasses HOLD_MEMBER_EMAILS — it is human/official-initiated and sent one-to-one.
 */
export async function sendPhotoRejectionEmail(to: string, memberName: string, reason?: string) {
  const safeName = escapeHtml(memberName || "Member");
  const reasonHtml = reason
    ? `<div style="background: #fef2f2; border-radius: 8px; padding: 12px 16px; margin: 0 0 16px;">
         <p style="color: #b91c1c; font-size: 13px; margin: 0;"><strong>Why:</strong> ${escapeHtml(reason)}</p>
       </div>`
    : "";
  await sendEmail(to, "Please update your TANHOWA profile photo", wrapEmailTemplate(`
    <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">A small request about your profile photo</h2>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Dear <strong>${safeName}</strong>,
    </p>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Thank you for being part of TANHOWA. We noticed your current profile photo is not
      clear enough for your member records and digital ID card.
    </p>
    ${reasonHtml}
    <p style="color: #333; font-size: 14px; margin: 0 0 8px;">
      Kindly upload a <strong>clear, high-resolution passport-size photo</strong>:
    </p>
    <ul style="color: #555; font-size: 13px; margin: 0 0 16px; padding-left: 20px;">
      <li>Front-facing, your face clearly visible and well-lit</li>
      <li>Plain background, recent photo of just you</li>
      <li>Sharp and not blurry (a good phone camera is perfect)</li>
    </ul>
    <div style="text-align: center;">
      <a href="https://tanhowa.in/dashboard/profile" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">Update My Photo</a>
    </div>
    <p style="color: #999; font-size: 12px; margin: 16px 0 0; text-align: center;">
      It takes less than a minute. Thank you for helping us keep our records professional.
    </p>
  `));
}

export async function sendMemberWelcomeEmail(to: string, memberName: string) {
  const safeName = escapeHtml(memberName || "Member");
  await sendEmail(to, "Welcome to TANHOWA - your membership is approved", wrapEmailTemplate(`
    <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Welcome to TANHOWA, ${safeName}!</h2>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      We are delighted to confirm that your membership has been <strong>approved</strong>. You are now
      part of the Tamil Nadu Horticultural Officers Welfare Association family.
    </p>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Sign in to access announcements, events, the member directory, subscriptions, trainings,
      grievances, your digital ID card and much more.
    </p>
    <div style="text-align: center;">
      <a href="https://tanhowa.in/dashboard" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">Go to My Dashboard</a>
    </div>
    <p style="color: #999; font-size: 12px; margin: 16px 0 0; text-align: center;">Together we grow stronger!</p>
  `));
}

export async function sendTeamWelcomeEmail(to: string, memberName: string, teamName: string, isLead = false) {
  const safeName = escapeHtml(memberName || "Member");
  const safeTeam = escapeHtml(teamName || "a team");
  // Avoid "Team team" — don't append "team" when the name already ends in it.
  const endsWithTeam = /\bteam\s*$/i.test(teamName || "");
  const teamPhrase = endsWithTeam ? safeTeam : `${safeTeam} team`;
  const roleLine = isLead
    ? `You have been added as the <strong>Team Lead</strong> of <strong>${teamPhrase}</strong>.`
    : `You have been added to the <strong>${teamPhrase}</strong>.`;
  await sendEmail(to, `You have been added to ${teamName} - TANHOWA`, wrapEmailTemplate(`
    <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Welcome to the ${teamPhrase}!</h2>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">Dear <strong>${safeName}</strong>,</p>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">${roleLine} We look forward to your contributions.</p>
    <div style="text-align: center;">
      <a href="https://tanhowa.in/dashboard/teams" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View My Teams</a>
    </div>
    <p style="color: #999; font-size: 12px; margin: 16px 0 0; text-align: center;">Together we grow stronger!</p>
  `));
}

export async function sendBirthdayDigestEmail(to: string, dateStr: string, whatsappText: string) {
  const safeText = escapeHtml(whatsappText);
  await sendEmail(to, `Today's Birthdays (${dateStr}) - for the WhatsApp group`, wrapEmailTemplate(`
    <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Today's Birthday List</h2>
    <p style="color: #333; font-size: 14px; margin: 0 0 14px;">
      Please <strong>copy the message below</strong> and paste it into the TANHOWA WhatsApp group.
    </p>
    <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit; background: #f6faf6; border: 1px solid #d6e8d6; border-radius: 8px; padding: 14px 16px; font-size: 14px; line-height: 1.5; color: #222; margin: 0;">${safeText}</pre>
  `));
}

export async function generateVoucherPdf(voucher: {
  id: string;
  title: string;
  amount: number;
  description?: string;
  invoice_number?: string;
  vendor_name?: string;
  expense_date?: string | null;
  category?: string;
  status: string;
  remarks?: string;
  created_at: string;
  submitter_name?: string;
  submitter_email?: string;
  submitter_phone?: string;
  submitter_official_type?: string;
  approver_name?: string;
  approved_at?: string | null;
}): Promise<string> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const statusLabel = voucher.status === "approved" ? "APPROVED" : voucher.status === "rejected" ? "REJECTED" : "PENDING";

  // Header
  doc.setFontSize(20);
  doc.setTextColor(45, 106, 79);
  doc.setFont("helvetica", "bold");
  doc.text("TANHOWA", 105, 18, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("Tamil Nadu Horticultural Officers Welfare Association", 105, 25, { align: "center" });
  doc.setFontSize(12);
  doc.setTextColor(45, 106, 79);
  doc.setFont("helvetica", "bold");
  doc.text("EXPENSE VOUCHER", 105, 33, { align: "center" });

  // Voucher number & date
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`Voucher #: ${voucher.id.substring(0, 8).toUpperCase()}`, 25, 40);
  doc.text(`Date: ${today}`, 190, 40, { align: "right" });

  doc.setDrawColor(45, 106, 79);
  doc.setLineWidth(0.5);
  doc.line(20, 43, 190, 43);

  // Official details
  let y = 52;
  doc.setFontSize(9);
  doc.setTextColor(45, 106, 79);
  doc.setFont("helvetica", "bold");
  doc.text("SUBMITTED BY", 25, y);
  y += 7;

  doc.setFontSize(10);
  doc.setTextColor(0);
  const officialRows: [string, string][] = [];
  if (voucher.submitter_name) officialRows.push(["Name", voucher.submitter_name]);
  if (voucher.submitter_email) officialRows.push(["Email", voucher.submitter_email]);
  if (voucher.submitter_phone) officialRows.push(["Phone", voucher.submitter_phone]);
  if (voucher.submitter_official_type) officialRows.push(["Type", voucher.submitter_official_type === "state" ? "State Official" : "District Official"]);
  for (const [label, value] of officialRows) {
    doc.setFont("helvetica", "bold");
    doc.text(label, 25, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 80, y);
    y += 7;
  }

  // Expense details
  y += 3;
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(20, y, 190, y);
  y += 7;
  doc.setFontSize(9);
  doc.setTextColor(45, 106, 79);
  doc.setFont("helvetica", "bold");
  doc.text("EXPENSE DETAILS", 25, y);
  y += 7;

  doc.setFontSize(10);
  doc.setTextColor(0);
  const expenseRows: [string, string][] = [
    ["Title", voucher.title],
    ["Amount", `Rs. ${(voucher.amount || 0).toLocaleString("en-IN")}`],
  ];
  if (voucher.category) expenseRows.push(["Category", voucher.category]);
  if (voucher.invoice_number) expenseRows.push(["Invoice No.", voucher.invoice_number]);
  if (voucher.vendor_name) expenseRows.push(["Vendor / Payee", voucher.vendor_name]);
  if (voucher.expense_date) {
    expenseRows.push(["Expense Date", new Date(voucher.expense_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })]);
  }
  expenseRows.push(["Submitted On", new Date(voucher.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })]);
  expenseRows.push(["Status", statusLabel]);
  if (voucher.approver_name) expenseRows.push(["Approved By", voucher.approver_name]);
  if (voucher.approved_at) {
    expenseRows.push(["Approved Date", new Date(voucher.approved_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })]);
  }

  for (const [label, value] of expenseRows) {
    doc.setFont("helvetica", "bold");
    doc.text(label, 25, y);
    doc.setFont("helvetica", "normal");
    if (label === "Status") {
      if (voucher.status === "approved") doc.setTextColor(34, 139, 34);
      else if (voucher.status === "rejected") doc.setTextColor(220, 38, 38);
      else doc.setTextColor(180, 130, 0);
      doc.setFont("helvetica", "bold");
    }
    doc.text(value, 80, y);
    doc.setTextColor(0);
    y += 7;
  }

  // Description
  if (voucher.description) {
    y += 3;
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(20, y, 190, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("DESCRIPTION", 25, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    const descLines = doc.splitTextToSize(voucher.description, 160);
    for (const line of descLines) {
      doc.text(line, 25, y);
      y += 5;
    }
  }

  // Admin remarks
  if (voucher.remarks) {
    y += 3;
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(20, y, 190, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("ADMIN REMARKS", 25, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    const remarkLines = doc.splitTextToSize(voucher.remarks, 160);
    for (const line of remarkLines) {
      doc.text(line, 25, y);
      y += 5;
    }
  }

  // Signature
  y += 8;
  doc.setDrawColor(45, 106, 79);
  doc.setLineWidth(0.3);
  doc.line(20, y, 190, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(45, 106, 79);
  doc.setFont("helvetica", "bold");
  doc.text("President", 105, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Tamil Nadu Horticultural Officers Welfare Association", 105, y, { align: "center" });

  // Footer
  y += 12;
  doc.setDrawColor(200);
  doc.line(20, y, 190, y);
  y += 5;
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated on ${today} from tanhowa.in`, 105, y, { align: "center" });
  doc.text("This is a computer-generated document and does not require a signature.", 105, y + 4, { align: "center" });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer).toString("base64");
}

export async function sendVoucherReceiptEmail(
  to: string,
  officialName: string,
  voucher: Parameters<typeof generateVoucherPdf>[0],
) {
  const pdfBase64 = await generateVoucherPdf(voucher);
  const fileName = `TANHOWA-Voucher-${voucher.id.substring(0, 8).toUpperCase()}.pdf`;

  await sendEmail(
    to,
    `TANHOWA Expense Voucher — ${voucher.title}`,
    wrapEmailTemplate(`
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Expense Voucher</h2>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
        Dear <strong>${officialName}</strong>,
      </p>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
        Please find your expense voucher attached as PDF.
      </p>
      <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
        <table style="width: 100%; font-size: 14px; color: #333;">
          <tr>
            <td style="padding: 4px 0; color: #666;">Expense</td>
            <td style="padding: 4px 0; font-weight: 600; text-align: right;">${voucher.title}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Amount</td>
            <td style="padding: 4px 0; font-weight: 600; text-align: right;">&#8377;${(voucher.amount || 0).toLocaleString("en-IN")}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Status</td>
            <td style="padding: 4px 0; font-weight: 600; text-align: right;">${voucher.status.charAt(0).toUpperCase() + voucher.status.slice(1)}</td>
          </tr>
        </table>
      </div>
      <div style="text-align: center;">
        <a href="https://tanhowa.in/dashboard/vouchers" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View My Vouchers</a>
      </div>
    `),
    [{ content: pdfBase64, mime_type: "application/pdf", name: fileName }],
  );
}

export async function sendNudgeOfficialEmail(to: string, officialName: string, district: string, pendingCount: number, totalAmount: number) {
  // Nudge emails bypass HOLD_MEMBER_EMAILS — they're for officials, not regular members
  await sendEmail(to, `${pendingCount} Pending Payments in ${district} — Action Needed`, wrapEmailTemplate(`
    <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Payment Verification Reminder</h2>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Dear <strong>${officialName}</strong>,
    </p>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      There are <strong>${pendingCount} pending payment(s)</strong> totalling <strong>&#8377;${totalAmount.toLocaleString("en-IN")}</strong> from members in <strong>${district}</strong> awaiting your verification.
    </p>
    <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
      Please review and verify these payments at your earliest convenience.
    </p>
    <div style="text-align: center;">
      <a href="https://www.tanhowa.in/admin/verify-payments" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">Verify Payments</a>
    </div>
  `));
}

export async function sendOTPEmail(to: string, otp: string) {
  await sendEmail(to, "Your TANHOWA Login Code", `
    <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fefae0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${LOGO_URL}" alt="TANHOWA" width="88" style="display:block; margin: 0 auto 8px; max-width: 88px; height: auto;" />
        <h1 style="color: #2d6a4f; font-size: 28px; margin: 0;">TANHOWA</h1>
        <p style="color: #40916c; font-size: 14px; margin: 4px 0 0;">Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px; text-align: center;">
        <p style="color: #333; font-size: 16px; margin: 0 0 16px;">Your verification code is:</p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2d6a4f; padding: 16px; background: #f0fdf4; border-radius: 8px;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 13px; margin: 16px 0 0;">This code expires in 10 minutes. Do not share it with anyone.</p>
      </div>
    </div>
  `);
}

export async function sendSuspensionEmail(to: string, memberName: string, reason: string, remarks: string) {
  if (HOLD_MEMBER_EMAILS) return;
  return sendEmail(to, "TANHOWA — Membership Suspended", `
    <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 500px; margin: 0 auto;">
      <div style="background: #991b1b; padding: 16px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: #fff; margin: 0; font-size: 18px;">Membership Suspended</h2>
      </div>
      <div style="padding: 24px; background: #fff; border: 1px solid #fecaca; border-radius: 0 0 8px 8px;">
        <p style="color: #333; font-size: 15px;">Dear ${memberName},</p>
        <p style="color: #333; font-size: 14px;">Your TANHOWA membership has been suspended. Portal access is restricted during the suspension period.</p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin: 16px 0;">
          <p style="color: #991b1b; font-size: 13px; margin: 0 0 4px;"><strong>Reason:</strong> ${reason}</p>
          ${remarks ? `<p style="color: #7f1d1d; font-size: 12px; margin: 0;">${remarks}</p>` : ""}
        </div>
        <p style="color: #666; font-size: 13px;">If you believe this is an error, please contact the TANHOWA administration.</p>
        <p style="color: #999; font-size: 11px; margin-top: 16px;">TANHOWA — Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
    </div>
  `);
}

export async function sendTrainerInviteEmail(to: string, trainerName: string, trainingTitle: string, date: string, location: string, mode: string, message: string) {
  return sendEmail(to, `TANHOWA — You're Invited as a Trainer: ${trainingTitle}`, `
    <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 500px; margin: 0 auto;">
      <div style="background: #2d6a4f; padding: 16px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: #fff; margin: 0; font-size: 18px;">Trainer Invitation</h2>
      </div>
      <div style="padding: 24px; background: #fff; border: 1px solid #bbf7d0; border-radius: 0 0 8px 8px;">
        <p style="color: #333; font-size: 15px;">Dear ${trainerName},</p>
        <p style="color: #333; font-size: 14px;">You have been invited to be a <strong>Trainer</strong> for the following TANHOWA training session:</p>
        <div style="background: #f0fdf4; border-left: 4px solid #2d6a4f; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0 0 6px; font-size: 15px; font-weight: 600; color: #2d6a4f;">${trainingTitle}</p>
          <p style="margin: 2px 0; font-size: 13px; color: #555;">Date: ${date}</p>
          <p style="margin: 2px 0; font-size: 13px; color: #555;">Location: ${location}</p>
          <p style="margin: 2px 0; font-size: 13px; color: #555;">Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}</p>
        </div>
        ${message ? `<p style="color: #555; font-size: 13px; font-style: italic; margin: 12px 0;">Message: "${message}"</p>` : ""}
        <p style="color: #333; font-size: 14px;">Please log in to the TANHOWA portal to accept or decline this invitation.</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://www.tanhowa.in/dashboard/trainings" style="background: #2d6a4f; color: #fff; padding: 10px 24px; text-decoration: none; border-radius: 8px; font-size: 14px;">View Invitation</a>
        </div>
        <p style="color: #999; font-size: 11px; margin-top: 16px;">TANHOWA — Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
    </div>
  `);
}

export async function sendReinstatementEmail(to: string, memberName: string) {
  if (HOLD_MEMBER_EMAILS) return;
  return sendEmail(to, "TANHOWA — Membership Reinstated", `
    <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 500px; margin: 0 auto;">
      <div style="background: #2d6a4f; padding: 16px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: #fff; margin: 0; font-size: 18px;">Membership Reinstated</h2>
      </div>
      <div style="padding: 24px; background: #fff; border: 1px solid #bbf7d0; border-radius: 0 0 8px 8px;">
        <p style="color: #333; font-size: 15px;">Dear ${memberName},</p>
        <p style="color: #333; font-size: 14px;">Your TANHOWA membership has been reinstated. You can now access the portal with full functionality.</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://www.tanhowa.in" style="background: #2d6a4f; color: #fff; padding: 10px 24px; text-decoration: none; border-radius: 8px; font-size: 14px;">Login to Portal</a>
        </div>
        <p style="color: #999; font-size: 11px; margin-top: 16px;">TANHOWA — Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
    </div>
  `);
}

