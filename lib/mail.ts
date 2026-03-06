import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.ZOHO_SMTP_HOST;
  const port = Number(process.env.ZOHO_SMTP_PORT);
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(`SMTP not configured: host=${!!host}, user=${!!user}, pass=${!!pass}`);
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });
}

export async function sendSubscriptionApprovedEmail(to: string, memberName: string, period: string, amount: number) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"TANHOWA" <${process.env.ZOHO_SMTP_USER}>`,
    to,
    subject: `Your TANHOWA Subscription for ${period} is Approved!`,
    html: `
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
    `,
  });
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

// Send a branded notification email to all approved members (fire-and-forget per member)
export async function sendBroadcastEmail(subject: string, bodyHtml: string) {
  const emails = await getAllMemberEmails();
  if (emails.length === 0) return;

  const transporter = getTransporter();
  const from = `"TANHOWA" <${process.env.ZOHO_SMTP_USER}>`;

  for (const email of emails) {
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject,
        html: wrapEmailTemplate(bodyHtml),
      });
    } catch {
      // Continue sending to others even if one fails
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

export async function sendOTPEmail(to: string, otp: string) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"TANHOWA" <${process.env.ZOHO_SMTP_USER}>`,
    to,
    subject: "Your TANHOWA Login Code",
    html: `
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
    `,
  });
}
