// Client-side PDF/Word export for a member's Field Diary — takes freshly
// signed-URL'd entries (the caller must re-fetch right before exporting,
// since signed URLs are only valid for 5 minutes), writes a dated report per
// entry including the report text (voice-note transcripts are already
// appended into report_text at upload time), and uploads the finished file
// to a public bucket so a QR code on the cover page lets someone else open
// or download it on their phone.
//
// Photos are fetched through /api/field-diary/export/photos (server-side)
// rather than loaded client-side via <img crossOrigin="anonymous"> + canvas —
// that approach silently produced nothing whenever the storage response
// didn't carry CORS headers the browser would accept for pixel access. A
// same-origin API call sidesteps CORS entirely; the server fetches the
// signed URL itself (plain server-to-server fetch, no CORS concept there).
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } from "docx";

export interface ExportMedia {
  id: string;
  media_type: "photo" | "audio" | "video";
  file_name: string;
  signed_url: string;
  transcript?: string;
}

export interface ExportEntry {
  id: string;
  entry_date: string;
  report_text: string;
  is_success_story: boolean;
  media?: ExportMedia[];
}

export interface ExportResult {
  shareUrl: string | null; // null when the local file was produced fine but the share upload failed
}

interface FetchedPhoto {
  dataUrl: string;
  mimeType: string;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function attachmentSummary(media: ExportMedia[]): string {
  const photos = media.filter((m) => m.media_type === "photo").length;
  const audio = media.filter((m) => m.media_type === "audio").length;
  const video = media.filter((m) => m.media_type === "video").length;
  const parts: string[] = [];
  if (photos) parts.push(`${photos} photo${photos > 1 ? "s" : ""}`);
  if (audio) parts.push(`${audio} voice note${audio > 1 ? "s" : ""}`);
  if (video) parts.push(`${video} video${video > 1 ? "s" : ""}`);
  return parts.join(", ");
}

/** One batched call for every photo across every entry, instead of one request per photo. */
async function fetchPhotoDataUrls(entries: ExportEntry[]): Promise<Record<string, FetchedPhoto>> {
  const mediaIds = entries.flatMap((e) => (e.media || []).filter((m) => m.media_type === "photo").map((m) => m.id));
  if (mediaIds.length === 0) return {};
  try {
    const res = await fetch("/api/field-diary/export/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_ids: mediaIds }),
    });
    if (!res.ok) return {};
    const d = await res.json();
    return (d.photos || {}) as Record<string, FetchedPhoto>;
  } catch {
    return {}; // export still proceeds text-only rather than failing outright
  }
}

function pdfFormatFor(mimeType: string): "JPEG" | "PNG" | "WEBP" {
  if (mimeType.includes("png")) return "PNG";
  if (mimeType.includes("webp")) return "WEBP";
  return "JPEG";
}

/** docx only embeds jpg/png/gif/bmp — null means "skip this photo in Word" (still counted in the Attachments summary text). */
function docxTypeFor(mimeType: string): "jpg" | "png" | null {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return null;
}

function randomFilename(ext: "pdf" | "docx"): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${id}.${ext}`;
}

function publicExportUrl(filename: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return `${base}/storage/v1/object/public/field-diary-exports/${filename}`;
}

/** Best-effort: upload the finished file so the QR code on its cover resolves. Never throws — a failed upload must not lose the local download. */
async function uploadExportBestEffort(filename: string, blob: Blob): Promise<boolean> {
  try {
    const fd = new FormData();
    fd.append("file", blob, filename);
    fd.append("filename", filename);
    const res = await fetch("/api/field-diary/export", { method: "POST", body: fd });
    return res.ok;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportFieldDiaryPDF(entries: ExportEntry[], memberName: string): Promise<ExportResult> {
  const filename = randomFilename("pdf");
  const shareUrl = publicExportUrl(filename);
  const [qrDataUrl, photoMap] = await Promise.all([
    QRCode.toDataURL(shareUrl, { width: 240, margin: 1 }).catch(() => null),
    fetchPhotoDataUrls(entries),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const qrSize = 22;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Field Diary", margin, y + 4);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${memberName} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`, margin, y + 11);

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, "PNG", pageWidth - margin - qrSize, y - 2, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("Scan to view/download", pageWidth - margin - qrSize, y + qrSize + 1, { maxWidth: qrSize });
    doc.setTextColor(0, 0, 0);
  }
  y += qrDataUrl ? qrSize + 6 : 15;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  for (const entry of entries) {
    ensureSpace(16);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(fmtDate(entry.entry_date), margin, y);
    if (entry.is_success_story) {
      doc.setFontSize(9);
      doc.setTextColor(180, 120, 20);
      doc.text("★ Success Story", pageWidth - margin - 35, y);
      doc.setTextColor(0, 0, 0);
    }
    y += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(entry.report_text, pageWidth - margin * 2) as string[];
    for (const line of lines) {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += 5;
    }

    const media = entry.media || [];
    const photos = media.filter((m) => m.media_type === "photo" && photoMap[m.id]);
    if (media.length > 0) {
      ensureSpace(5);
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(`Attachments: ${attachmentSummary(media)}`, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }

    if (photos.length > 0) {
      const thumbSize = 45;
      const gap = 4;
      let x = margin;
      ensureSpace(thumbSize + 4);
      const rowStartY = y;
      for (const photo of photos) {
        if (x + thumbSize > pageWidth - margin) {
          x = margin;
          y += thumbSize + gap;
          ensureSpace(thumbSize + 4);
        }
        const fetched = photoMap[photo.id];
        try {
          const props = doc.getImageProperties(fetched.dataUrl);
          const ratio = props.width / props.height;
          const w = ratio >= 1 ? thumbSize : thumbSize * ratio;
          const h = ratio >= 1 ? thumbSize / ratio : thumbSize;
          doc.addImage(fetched.dataUrl, pdfFormatFor(fetched.mimeType), x, y, w, h);
        } catch {
          /* unsupported/corrupt image — skip, don't fail the export */
        }
        x += thumbSize + gap;
      }
      y = Math.max(y, rowStartY) + thumbSize + gap;
    }

    y += 4;
    ensureSpace(4);
    doc.setDrawColor(230);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
  }

  const blob = doc.output("blob");
  downloadBlob(blob, `TANHOWA_Field_Diary_${memberName.replace(/\s+/g, "_")}.pdf`);
  const uploaded = await uploadExportBestEffort(filename, blob);
  return { shareUrl: uploaded ? shareUrl : null };
}

export async function exportFieldDiaryDocx(entries: ExportEntry[], memberName: string): Promise<ExportResult> {
  const filename = randomFilename("docx");
  const shareUrl = publicExportUrl(filename);
  const [qrDataUrl, photoMap] = await Promise.all([
    QRCode.toDataURL(shareUrl, { width: 240, margin: 1 }).catch(() => null),
    fetchPhotoDataUrls(entries),
  ]);

  let qrBuffer: ArrayBuffer | null = null;
  if (qrDataUrl) {
    try {
      qrBuffer = await (await fetch(qrDataUrl)).arrayBuffer();
    } catch {
      qrBuffer = null;
    }
  }

  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: "Field Diary", bold: true, size: 32 })], spacing: { after: 60 } }),
    new Paragraph({ text: `${memberName} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`, spacing: { after: 150 } }),
  ];
  if (qrBuffer) {
    try {
      children.push(
        new Paragraph({
          children: [new ImageRun({ type: "png", data: qrBuffer, transformation: { width: 90, height: 90 } })],
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Scan to view/download on your phone", italics: true, size: 18, color: "666666" })],
          spacing: { after: 300 },
        })
      );
    } catch {
      /* QR embed failed — continue without it rather than fail the whole export */
    }
  }

  for (const entry of entries) {
    const headingRuns: TextRun[] = [new TextRun({ text: fmtDate(entry.entry_date), bold: true })];
    if (entry.is_success_story) {
      headingRuns.push(new TextRun({ text: "   ★ Success Story", color: "B47814", bold: true }));
    }
    children.push(new Paragraph({ children: headingRuns, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));

    for (const para of entry.report_text.split(/\n+/).filter(Boolean)) {
      children.push(new Paragraph({ text: para, spacing: { after: 120 } }));
    }

    const media = entry.media || [];
    if (media.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Attachments: ${attachmentSummary(media)}`, italics: true, color: "666666" })],
          spacing: { after: 150 },
        })
      );
    }

    const photos = media.filter((m) => m.media_type === "photo");
    for (const photo of photos) {
      const fetched = photoMap[photo.id];
      if (!fetched) continue;
      const type = docxTypeFor(fetched.mimeType);
      if (!type) continue; // e.g. webp — docx can't embed it, skip gracefully

      try {
        const buffer = await (await fetch(fetched.dataUrl)).arrayBuffer();
        // Fixed display box (docx just scales for display, no real pixel resize needed).
        const boxWidth = 280;
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 150 },
            children: [new ImageRun({ type, data: buffer, transformation: { width: boxWidth, height: boxWidth } })],
          })
        );
      } catch {
        /* corrupt/unreadable image — skip, don't fail the whole export */
      }
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `TANHOWA_Field_Diary_${memberName.replace(/\s+/g, "_")}.docx`);
  const uploaded = await uploadExportBestEffort(filename, blob);
  return { shareUrl: uploaded ? shareUrl : null };
}
