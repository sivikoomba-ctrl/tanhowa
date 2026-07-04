// Client-side PDF/Word export for a member's Field Diary — takes freshly
// signed-URL'd entries (the caller must re-fetch right before exporting,
// since signed URLs are only valid for 5 minutes), downscales each photo via
// canvas (normalizes webp/png/jpeg to one JPEG so both jsPDF and docx, which
// only supports jpg/png/gif/bmp, can embed it, and keeps file size sane),
// writes a dated report per entry including the report text (voice-note
// transcripts are already appended into report_text at upload time), and
// uploads the finished file to a public bucket so a QR code on the cover
// page lets someone else open/download it on their phone.
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

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

interface NormalizedImage {
  dataUrl: string;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

async function normalizeImage(url: string, maxDim = 900): Promise<NormalizedImage | null> {
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const buffer = await (await fetch(dataUrl)).arrayBuffer();
    return { dataUrl, buffer, width, height };
  } catch {
    return null; // e.g. a tainted canvas or an expired signed URL — skip this photo, don't fail the whole export
  }
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
  const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 240, margin: 1 }).catch(() => null);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const qrSize = 22;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("TANHOWA Field Diary", margin, y + 4);
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
    const photos = media.filter((m) => m.media_type === "photo");
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
        const img = await normalizeImage(photo.signed_url);
        if (img) {
          const ratio = img.width / img.height;
          const w = ratio >= 1 ? thumbSize : thumbSize * ratio;
          const h = ratio >= 1 ? thumbSize / ratio : thumbSize;
          try {
            doc.addImage(img.dataUrl, "JPEG", x, y, w, h);
          } catch {
            /* unsupported/corrupt image — skip, don't fail the export */
          }
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
  const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 240, margin: 1 }).catch(() => null);
  let qrBuffer: ArrayBuffer | null = null;
  if (qrDataUrl) qrBuffer = await (await fetch(qrDataUrl)).arrayBuffer();

  const headerChildren: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: "TANHOWA Field Diary", bold: true, size: 32 })], spacing: { after: 60 } }),
    new Paragraph({ text: `${memberName} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`, spacing: { after: 150 } }),
  ];
  if (qrBuffer) {
    headerChildren.push(
      new Paragraph({
        children: [new ImageRun({ type: "png", data: qrBuffer, transformation: { width: 90, height: 90 } })],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Scan to view/download on your phone", italics: true, size: 18, color: "666666" })],
        spacing: { after: 300 },
      })
    );
  }

  const children: Paragraph[] = [...headerChildren];

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
      const img = await normalizeImage(photo.signed_url);
      if (!img) continue;
      const maxW = 350;
      const scale = Math.min(1, maxW / img.width);
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 150 },
          children: [
            new ImageRun({
              type: "jpg",
              data: img.buffer,
              transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `TANHOWA_Field_Diary_${memberName.replace(/\s+/g, "_")}.docx`);
  const uploaded = await uploadExportBestEffort(filename, blob);
  return { shareUrl: uploaded ? shareUrl : null };
}
