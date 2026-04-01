const FROM_EMAIL = process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in";
const FROM_NAME = "TANHOWA";

// HOLD: All member-facing emails (except OTP) are temporarily disabled.
// Set to false to re-enable member emails.
const HOLD_MEMBER_EMAILS = true;

interface EmailAddress {
  address: string;
  name?: string;
}

interface ZeptoMailPayload {
  from: { address: string; name: string };
  to: { email_address: EmailAddress }[];
  subject: string;
  htmlbody: string;
  bcc?: { email_address: EmailAddress }[];
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

async function sendEmail(to: string, subject: string, htmlbody: string) {
  return sendZeptoMail({
    from: { address: FROM_EMAIL, name: FROM_NAME },
    to: [{ email_address: { address: to } }],
    subject,
    htmlbody,
  });
}

async function sendBccEmail(toSelf: string, bccAddresses: string[], subject: string, htmlbody: string) {
  return sendZeptoMail({
    from: { address: FROM_EMAIL, name: FROM_NAME },
    to: [{ email_address: { address: toSelf } }],
    bcc: bccAddresses.map((addr) => ({ email_address: { address: addr } })),
    subject,
    htmlbody,
  });
}

export async function sendSubscriptionApprovedEmail(to: string, memberName: string, period: string, amount: number) {
  if (HOLD_MEMBER_EMAILS) return;
  await sendEmail(to, `Your TANHOWA Subscription for ${period} is Approved!`, `
    <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fefae0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #2d6a4f; font-size: 28px; margin: 0;">TANHOWA</h1>
        <p style="color: #40916c; font-size: 14px; margin: 4px 0 0;">Tamil Nadu Horticultural Officers Welfare Association</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 24px;">
        <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Payment Approved!</h2>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
          Dear <strong>${memberName}</strong>,
        </p>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
          Thank you for your payment! We are pleased to confirm that your TANHOWA subscription has been verified and approved.
        </p>
        <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
          <table style="width: 100%; font-size: 14px; color: #333;">
            <tr>
              <td style="padding: 4px 0; color: #666;">Subscription Period</td>
              <td style="padding: 4px 0; font-weight: 600; text-align: right;">${period}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #666;">Amount</td>
              <td style="padding: 4px 0; font-weight: 600; text-align: right;">&#8377;${amount.toLocaleString("en-IN")}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #666;">Status</td>
              <td style="padding: 4px 0; font-weight: 600; text-align: right; color: #16a34a;">Approved</td>
            </tr>
          </table>
        </div>
        <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
          You can view your subscription details anytime by logging into the TANHOWA Portal.
        </p>
        <div style="text-align: center;">
          <a href="https://tanhowa.in/dashboard/subscriptions" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View My Subscriptions</a>
        </div>
        <p style="color: #666; font-size: 12px; margin: 20px 0 0; text-align: center;">
          Thank you for being a valued member of TANHOWA!
        </p>
      </div>
    </div>
  `);
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

// Send a branded notification email to all approved members using BCC batches
// ZeptoMail limits recipients per email, so we batch in groups of 40
export async function sendBroadcastEmail(subject: string, bodyHtml: string) {
  if (HOLD_MEMBER_EMAILS) return;
  const emails = await getAllMemberEmails();
  if (emails.length === 0) return;

  const BATCH_SIZE = 40;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    try {
      await sendBccEmail(FROM_EMAIL, batch, subject, wrapEmailTemplate(bodyHtml));
    } catch {
      // Continue with next batch if one fails
    }
  }
}

function wrapEmailTemplate(content: string): string {
  return `
    <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fefae0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
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
  const truncated = content.length > 200 ? content.substring(0, 200) + "..." : content;
  sendBroadcastEmail(
    `New Announcement: ${title}`,
    `
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">New Announcement</h2>
      <h3 style="color: #333; font-size: 16px; margin: 0 0 8px;">${title}</h3>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px; white-space: pre-line;">${truncated}</p>
      <div style="text-align: center;">
        <a href="https://tanhowa.in/dashboard/announcements" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Announcement</a>
      </div>
    `
  ).catch(() => {});
}

export function notifyPaymentVerified(memberName: string, period: string) {
  sendBroadcastEmail(
    `Payment Update: ${memberName} - ${period}`,
    `
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">Payment Verified</h2>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
        <strong>${memberName}</strong>'s subscription payment for <strong>${period}</strong> has been verified and approved.
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
  sendBroadcastEmail(
    `Welcome New Member: ${memberName}`,
    `
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">New Member Joined!</h2>
      <p style="color: #333; font-size: 14px; margin: 0 0 16px;">
        We are happy to welcome <strong>${memberName}</strong> as a new member of TANHOWA!
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
  const locationLine = location ? `<p style="color: #555; font-size: 14px; margin: 0 0 16px;">Location: <strong>${location}</strong></p>` : "";
  sendBroadcastEmail(
    `New Event: ${title}`,
    `
      <h2 style="color: #2d6a4f; font-size: 20px; margin: 0 0 12px;">New Event Announced</h2>
      <h3 style="color: #333; font-size: 16px; margin: 0 0 8px;">${title}</h3>
      <p style="color: #555; font-size: 14px; margin: 0 0 8px;">Date: <strong>${date}</strong></p>
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
    const { getServiceClient } = await import("@/lib/supabase");
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("users")
      .select("email")
      .in("role", ["admin", "super_admin"])
      .eq("status", "approved");
    const adminEmails = (data || []).map((u: { email: string }) => u.email).filter(Boolean);
    if (adminEmails.length === 0) return;

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

export async function sendOTPEmail(to: string, otp: string) {
  await sendEmail(to, "Your TANHOWA Login Code", `
    <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fefae0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
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
