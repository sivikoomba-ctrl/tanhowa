// Shared TANHOWA digital ID-card helpers — used by the member profile page
// (/dashboard/profile) and the admin user panel (/admin/users). Keep the PDF
// layout here so both stay in sync.

export interface IdCardData {
  id: string;
  /** Honorific (Mr./Mrs./Dr.) — optional. */
  title?: string;
  first_name?: string;
  last_name?: string;
  /** Single display name fallback when first/last aren't split (admin records). */
  name?: string;
  /** Govt designation (occupation). */
  occupation?: string;
  phone?: string;
  email?: string;
  created_at?: string;
  /** TANHOWA designation, e.g. "District Secretary". */
  official_designation?: string;
  regular_district?: string;
}

/** Full display name, honorific first, uppercased. Falls back to `name`. */
export function idCardName(d: IdCardData): string {
  const split = [d.title, d.first_name, d.last_name].filter(Boolean).join(" ").trim();
  return (split || d.name || "").toUpperCase();
}

export const ID_CARD_MEMBER_ID = (id?: string) => (id || "").slice(0, 8).toUpperCase();

/** Generate + save the credit-card-size ID PDF (client-side, jsPDF). */
export async function downloadIdCard(d: IdCardData, photoUrl: string | null) {
  const { default: jsPDF } = await import("jspdf");
  // Standard ID card size: 85.6mm x 54mm (credit card, landscape)
  const w = 85.6, h = 54;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [h, w] });
  const green = [45, 106, 79] as [number, number, number];
  const darkGreen = [30, 70, 52] as [number, number, number];

  // Border
  doc.setDrawColor(...green);
  doc.setLineWidth(0.8);
  doc.rect(1.5, 1.5, w - 3, h - 3);

  // Header bar
  doc.setFillColor(...green);
  doc.rect(0, 0, w, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("TANHOWA", w / 2, 6.5, { align: "center" });
  doc.setFontSize(4.5);
  doc.setFont("helvetica", "normal");
  doc.text("Tamil Nadu Horticultural Officers Welfare Association", w / 2, 10, { align: "center" });

  // Thin accent line below header
  doc.setFillColor(200, 170, 80);
  doc.rect(0, 12, w, 0.6, "F");

  // Photo
  const photoX = 4, photoY = 15, photoW = 20, photoH = 24;
  if (photoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = photoUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 240;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 200, 240);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      doc.addImage(dataUrl, "JPEG", photoX, photoY, photoW, photoH);
      // Photo border
      doc.setDrawColor(...green);
      doc.setLineWidth(0.4);
      doc.rect(photoX, photoY, photoW, photoH);
    } catch {
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.rect(photoX, photoY, photoW, photoH);
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.text("Photo", photoX + photoW / 2, photoY + photoH / 2, { align: "center" });
    }
  } else {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(photoX, photoY, photoW, photoH);
  }

  // Name
  const infoX = 27;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const displayName = idCardName(d) || "MEMBER NAME";
  // Truncate long names
  const maxNameWidth = w - infoX - 4;
  const nameLines = doc.splitTextToSize(displayName, maxNameWidth);
  doc.text(nameLines[0], infoX, 18.5);

  // TANHOWA Designation (primary)
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkGreen);
  doc.text(d.official_designation || "Member", infoX, 23);

  // Govt Designation + District
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const govtLine = [d.occupation, d.regular_district].filter(Boolean).join(" - ");
  if (govtLine) doc.text(govtLine, infoX, 27);

  // Phone
  if (d.phone) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(6);
    doc.text("Ph: " + d.phone, infoX, 31);
  }

  // Email
  if (d.email) {
    doc.setFontSize(5);
    doc.setTextColor(100, 100, 100);
    const emailText = d.email.length > 35 ? d.email.slice(0, 34) + "..." : d.email;
    doc.text(emailText, infoX, 35);
  }

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(4, 40.5, w - 4, 40.5);

  // Bottom details row
  doc.setFontSize(5.5);

  // Member ID
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "normal");
  doc.text("ID:", 4, 44);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(ID_CARD_MEMBER_ID(d.id), 9, 44);

  // Member Since
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Since:", 30, 44);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(d.created_at ? new Date(d.created_at).getFullYear().toString() : "-", 40, 44);

  // Valid Until
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Valid:", 55, 44);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(`Dec ${new Date().getFullYear()}`, 64, 44);

  // Footer bar
  doc.setFillColor(...green);
  doc.rect(0, h - 5.5, w, 5.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.text("www.tanhowa.in", w / 2, h - 2, { align: "center" });

  const fileName = `TANHOWA_ID_${(d.first_name || d.name || "Member").replace(/\s/g, "_")}.pdf`;
  doc.save(fileName);
}
