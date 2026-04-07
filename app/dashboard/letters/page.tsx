"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Download, Plane, Calculator, BookOpen, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ───────────────────────────────────────────────────────────────────
interface UserData {
  name: string;
  occupation: string;
  phone: string;
  posting_details?: {
    regular_district?: string;
    regular_block?: string;
    official_designation?: string;
  };
}

interface TourEntry {
  date: string;
  from_place: string;
  to_place: string;
  distance_km: string;
  purpose: string;
  mode: string;
}

interface TARow {
  date: string;
  from_place: string;
  to_place: string;
  mode: string;
  distance_km: string;
  fare: string;
  da: string;
  halting: string;
  conveyance: string;
}

type LetterType = "leave" | "ta_bill" | "tour_diary" | null;

const LEAVE_TYPES = ["Casual Leave (CL)", "Earned Leave (EL)", "Medical Leave (ML)", "Compensatory Leave", "Special Casual Leave", "Maternity Leave", "Paternity Leave", "Other"];
const TRAVEL_MODES = ["Bus", "Train", "Car", "Two Wheeler", "Auto", "Taxi", "Air", "Walk", "Other"];

const BRAND_GREEN: [number, number, number] = [45, 106, 79];

function calcDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function LettersPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [activeForm, setActiveForm] = useState<LetterType>(null);
  const t = useT();

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {activeForm ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setActiveForm(null)} className="gap-1.5 -ml-2">
            <ArrowLeft size={16} /> Back to Letters
          </Button>
          {activeForm === "leave" && <LeaveForm user={user} />}
          {activeForm === "ta_bill" && <TABillForm user={user} />}
          {activeForm === "tour_diary" && <TourDiaryForm user={user} />}
        </>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold">{t("letters.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("letters.subtitle")}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <LetterCard
              icon={Plane}
              title={t("letters.leave_application")}
              description={t("letters.leave_desc")}
              color="text-blue-600 bg-blue-50"
              onClick={() => setActiveForm("leave")}
            />
            <LetterCard
              icon={Calculator}
              title={t("letters.ta_bill")}
              description={t("letters.ta_desc")}
              color="text-amber-600 bg-amber-50"
              onClick={() => setActiveForm("ta_bill")}
            />
            <LetterCard
              icon={BookOpen}
              title={t("letters.tour_diary")}
              description={t("letters.tour_desc")}
              color="text-purple-600 bg-purple-50"
              onClick={() => setActiveForm("tour_diary")}
            />
          </div>
        </>
      )}
    </div>
  );
}

function LetterCard({ icon: Icon, title, description, color, onClick }: {
  icon: typeof FileText; title: string; description: string; color: string; onClick: () => void;
}) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-all hover:border-primary/20 group" onClick={onClick}>
      <CardContent className="pt-5">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${color}`}>
          <Icon size={22} />
        </div>
        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

// ─── Leave Application ───────────────────────────────────────────────────────
function LeaveForm({ user }: { user: UserData | null }) {
  const t = useT();
  const [form, setForm] = useState({
    to_officer: "",
    to_designation: "",
    leave_type: "",
    from_date: "",
    to_date: "",
    num_days: "",
    reason: "",
    address_during_leave: "",
    station_leave: "No",
    alternate_officer: "",
  });
  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    if (form.from_date && form.to_date) {
      update("num_days", String(calcDays(form.from_date, form.to_date)));
    }
  }, [form.from_date, form.to_date]);

  function generatePDF() {
    const doc = new jsPDF("p", "mm", "a4");
    const w = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("LEAVE APPLICATION", w / 2, y, { align: "center" });
    y += 12;

    // Date
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${formatDateStr(new Date().toISOString().split("T")[0])}`, w - 20, y, { align: "right" });
    y += 10;

    // To
    doc.text("To,", 20, y); y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(form.to_officer || "The Controlling Officer", 20, y); y += 6;
    doc.setFont("helvetica", "normal");
    if (form.to_designation) { doc.text(form.to_designation, 20, y); y += 6; }
    y += 4;

    doc.text("Sir / Madam,", 20, y); y += 8;

    // Body
    const name = user?.name || "_______________";
    const desg = user?.occupation || "_______________";
    const district = user?.posting_details?.regular_district || "_______________";
    const block = user?.posting_details?.regular_block || "";

    const bodyText = `Sub: ${form.leave_type || "Leave"} - Application for ${form.num_days || "___"} day(s) - Reg.`;
    doc.setFont("helvetica", "bold");
    doc.text(bodyText, 20, y); y += 10;
    doc.setFont("helvetica", "normal");

    const lines = [
      `I, ${name}, working as ${desg}, ${block ? block + ", " : ""}${district}, kindly request you to grant me ${form.leave_type || "leave"} for ${form.num_days || "___"} day(s) from ${formatDateStr(form.from_date)} to ${formatDateStr(form.to_date)}.`,
      "",
      `Reason: ${form.reason || "Personal"}`,
    ];

    if (form.address_during_leave) {
      lines.push(`Address during leave: ${form.address_during_leave}`);
    }
    if (form.station_leave === "Yes") {
      lines.push("Station leave is required.");
    }
    if (form.alternate_officer) {
      lines.push(`Alternate arrangement: ${form.alternate_officer}`);
    }

    lines.push("", "I request you to kindly grant me leave for the above period.");

    for (const line of lines) {
      if (line === "") { y += 4; continue; }
      const wrapped = doc.splitTextToSize(line, w - 40);
      doc.text(wrapped, 20, y);
      y += wrapped.length * 5;
    }

    y += 15;
    doc.text("Yours faithfully,", 20, y); y += 12;
    doc.setFont("helvetica", "bold");
    doc.text(name.toUpperCase(), 20, y); y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(desg, 20, y); y += 5;
    if (block) { doc.text(block + ", " + district, 20, y); y += 5; }
    else { doc.text(district, 20, y); y += 5; }
    if (user?.phone) { doc.text(`Phone: ${user.phone}`, 20, y); y += 5; }

    // Footer
    y += 15;
    doc.setDrawColor(...BRAND_GREEN);
    doc.line(20, y, w - 20, y);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("Generated via TANHOWA Portal (tanhowa.in)", w / 2, y, { align: "center" });

    doc.save(`Leave_Application_${user?.name?.replace(/\s+/g, "_") || "draft"}.pdf`);
    toast.success("PDF downloaded!");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <Plane size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t("letters.leave_application")}</h2>
          <p className="text-xs text-muted-foreground">Auto-filled from your profile</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>To (Officer Name)</Label>
              <Input value={form.to_officer} onChange={(e) => update("to_officer", e.target.value)} placeholder="e.g. The ADH / DDH" />
            </div>
            <div>
              <Label>Designation</Label>
              <Input value={form.to_designation} onChange={(e) => update("to_designation", e.target.value)} placeholder="e.g. Asst. Director of Horticulture" />
            </div>
          </div>

          <div>
            <Label>Leave Type *</Label>
            <Select value={form.leave_type} onValueChange={(v) => update("leave_type", v)}>
              <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((lt) => <SelectItem key={lt} value={lt}>{lt}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <Label>From Date *</Label>
              <Input type="date" value={form.from_date} onChange={(e) => update("from_date", e.target.value)} />
            </div>
            <div>
              <Label>To Date *</Label>
              <Input type="date" value={form.to_date} onChange={(e) => update("to_date", e.target.value)} />
            </div>
            <div>
              <Label>No. of Days</Label>
              <Input value={form.num_days} readOnly className="bg-muted" />
            </div>
          </div>

          <div>
            <Label>Reason *</Label>
            <Textarea value={form.reason} onChange={(e) => update("reason", e.target.value)} placeholder="Reason for leave" rows={2} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Address During Leave</Label>
              <Input value={form.address_during_leave} onChange={(e) => update("address_during_leave", e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label>Station Leave Required?</Label>
              <Select value={form.station_leave} onValueChange={(v) => update("station_leave", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Alternate Arrangement</Label>
            <Input value={form.alternate_officer} onChange={(e) => update("alternate_officer", e.target.value)} placeholder="Name of officer handling charge" />
          </div>

          {/* Auto-filled preview */}
          <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground/70">Auto-filled from profile:</p>
            <p>Name: <span className="font-medium text-foreground">{user?.name || "—"}</span></p>
            <p>Designation: <span className="font-medium text-foreground">{user?.occupation || "—"}</span></p>
            <p>Posting: <span className="font-medium text-foreground">{[user?.posting_details?.regular_block, user?.posting_details?.regular_district].filter(Boolean).join(", ") || "—"}</span></p>
          </div>

          <Button onClick={generatePDF} disabled={!form.leave_type || !form.from_date || !form.to_date} className="w-full sm:w-auto gap-2">
            <Download size={16} /> Download PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── TA Bill ─────────────────────────────────────────────────────────────────
function TABillForm({ user }: { user: UserData | null }) {
  const t = useT();
  const [form, setForm] = useState({
    bill_no: "",
    month: "",
    purpose: "",
    sanctioned_by: "",
    headquarters: "",
  });
  const [rows, setRows] = useState<TARow[]>([
    { date: "", from_place: "", to_place: "", mode: "", distance_km: "", fare: "", da: "", halting: "", conveyance: "" },
  ]);

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateRow(index: number, field: keyof TARow, value: string) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows((prev) => [...prev, { date: "", from_place: "", to_place: "", mode: "", distance_km: "", fare: "", da: "", halting: "", conveyance: "" }]);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function getTotal(field: "fare" | "da" | "halting" | "conveyance"): number {
    return rows.reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0);
  }

  function generatePDF() {
    const doc = new jsPDF("l", "mm", "a4");
    const w = doc.internal.pageSize.getWidth();
    let y = 15;

    const name = user?.name || "_______________";
    const desg = user?.occupation || "_______________";
    const district = user?.posting_details?.regular_district || "";
    const block = user?.posting_details?.regular_block || "";

    // Header
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("TRAVELLING ALLOWANCE BILL", w / 2, y, { align: "center" });
    y += 8;

    // Details row
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const details = [
      `Name: ${name}`,
      `Designation: ${desg}`,
      `Headquarters: ${form.headquarters || [block, district].filter(Boolean).join(", ")}`,
      form.bill_no ? `Bill No: ${form.bill_no}` : "",
      form.month ? `Month: ${form.month}` : "",
    ].filter(Boolean);
    doc.text(details.join("  |  "), 15, y);
    y += 4;
    if (form.purpose) {
      doc.text(`Purpose: ${form.purpose}`, 15, y);
      y += 4;
    }
    y += 2;

    // Table
    const tableData = rows.map((r) => [
      formatDateStr(r.date),
      r.from_place,
      r.to_place,
      r.mode,
      r.distance_km,
      r.fare ? `Rs.${r.fare}` : "",
      r.da ? `Rs.${r.da}` : "",
      r.halting ? `Rs.${r.halting}` : "",
      r.conveyance ? `Rs.${r.conveyance}` : "",
      `Rs.${((parseFloat(r.fare) || 0) + (parseFloat(r.da) || 0) + (parseFloat(r.halting) || 0) + (parseFloat(r.conveyance) || 0)).toFixed(2)}`,
    ]);

    const grandTotal = getTotal("fare") + getTotal("da") + getTotal("halting") + getTotal("conveyance");

    tableData.push([
      "", "", "", "", "TOTAL",
      `Rs.${getTotal("fare").toFixed(2)}`,
      `Rs.${getTotal("da").toFixed(2)}`,
      `Rs.${getTotal("halting").toFixed(2)}`,
      `Rs.${getTotal("conveyance").toFixed(2)}`,
      `Rs.${grandTotal.toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "From", "To", "Mode", "Km", "Fare", "DA", "Halting", "Conveyance", "Total"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 22 }, 4: { halign: "right" },
        5: { halign: "right" }, 6: { halign: "right" },
        7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
      },
      theme: "grid",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Grand Total: Rs.${grandTotal.toFixed(2)}`, 15, y);
    y += 5;
    doc.text(`(Rupees ${numberToWords(Math.round(grandTotal))} Only)`, 15, y);
    y += 15;

    // Signatures
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Signature of the Claimant", 15, y);
    doc.text("Countersigned", w / 2, y, { align: "center" });
    doc.text("Passed for Rs. ___________", w - 15, y, { align: "right" });
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.text(name.toUpperCase(), 15, y);
    if (form.sanctioned_by) { doc.text(form.sanctioned_by, w / 2, y, { align: "center" }); }
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(desg, 15, y);

    // Footer
    y += 12;
    doc.setDrawColor(...BRAND_GREEN);
    doc.line(15, y, w - 15, y);
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("Generated via TANHOWA Portal (tanhowa.in)", w / 2, y, { align: "center" });

    doc.save(`TA_Bill_${form.month || "draft"}_${name.replace(/\s+/g, "_")}.pdf`);
    toast.success("PDF downloaded!");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
          <Calculator size={20} className="text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t("letters.ta_bill")}</h2>
          <p className="text-xs text-muted-foreground">Travelling Allowance Bill</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label>Bill No.</Label>
              <Input value={form.bill_no} onChange={(e) => updateForm("bill_no", e.target.value)} placeholder="e.g. TA/01/2026" />
            </div>
            <div>
              <Label>Month/Period</Label>
              <Input value={form.month} onChange={(e) => updateForm("month", e.target.value)} placeholder="e.g. March 2026" />
            </div>
            <div>
              <Label>Headquarters</Label>
              <Input value={form.headquarters} onChange={(e) => updateForm("headquarters", e.target.value)} placeholder={[user?.posting_details?.regular_block, user?.posting_details?.regular_district].filter(Boolean).join(", ") || "e.g. Salem"} />
            </div>
            <div>
              <Label>Sanctioned By</Label>
              <Input value={form.sanctioned_by} onChange={(e) => updateForm("sanctioned_by", e.target.value)} placeholder="Controlling Officer" />
            </div>
          </div>

          <div>
            <Label>Purpose of Tour</Label>
            <Input value={form.purpose} onChange={(e) => updateForm("purpose", e.target.value)} placeholder="e.g. Official inspection / Meeting" />
          </div>

          {/* Journey Rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Journey Details</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1">
                <Plus size={14} /> Add Row
              </Button>
            </div>
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 rounded-xl bg-muted/30 border relative">
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(i)} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs hover:bg-destructive/80">
                      <Trash2 size={10} />
                    </button>
                  )}
                  <div>
                    <Label className="text-[10px]">Date</Label>
                    <Input type="date" value={row.date} onChange={(e) => updateRow(i, "date", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">From</Label>
                    <Input value={row.from_place} onChange={(e) => updateRow(i, "from_place", e.target.value)} className="h-8 text-xs" placeholder="Place" />
                  </div>
                  <div>
                    <Label className="text-[10px]">To</Label>
                    <Input value={row.to_place} onChange={(e) => updateRow(i, "to_place", e.target.value)} className="h-8 text-xs" placeholder="Place" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Mode</Label>
                    <Select value={row.mode} onValueChange={(v) => updateRow(i, "mode", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Mode" /></SelectTrigger>
                      <SelectContent>{TRAVEL_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Km</Label>
                    <Input type="number" value={row.distance_km} onChange={(e) => updateRow(i, "distance_km", e.target.value)} className="h-8 text-xs" placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Fare (Rs.)</Label>
                    <Input type="number" value={row.fare} onChange={(e) => updateRow(i, "fare", e.target.value)} className="h-8 text-xs" placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-[10px]">DA (Rs.)</Label>
                    <Input type="number" value={row.da} onChange={(e) => updateRow(i, "da", e.target.value)} className="h-8 text-xs" placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Halting (Rs.)</Label>
                    <Input type="number" value={row.halting} onChange={(e) => updateRow(i, "halting", e.target.value)} className="h-8 text-xs" placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Conveyance (Rs.)</Label>
                    <Input type="number" value={row.conveyance} onChange={(e) => updateRow(i, "conveyance", e.target.value)} className="h-8 text-xs" placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Row Total</Label>
                    <div className="h-8 flex items-center text-xs font-medium">
                      Rs.{((parseFloat(row.fare) || 0) + (parseFloat(row.da) || 0) + (parseFloat(row.halting) || 0) + (parseFloat(row.conveyance) || 0)).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex items-center justify-end gap-4 mt-3 text-sm">
              <Badge variant="outline" className="text-xs">Grand Total: Rs.{(getTotal("fare") + getTotal("da") + getTotal("halting") + getTotal("conveyance")).toFixed(2)}</Badge>
            </div>
          </div>

          {/* Auto-filled preview */}
          <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground/70">Auto-filled from profile:</p>
            <p>Name: <span className="font-medium text-foreground">{user?.name || "—"}</span></p>
            <p>Designation: <span className="font-medium text-foreground">{user?.occupation || "—"}</span></p>
            <p>Posting: <span className="font-medium text-foreground">{[user?.posting_details?.regular_block, user?.posting_details?.regular_district].filter(Boolean).join(", ") || "—"}</span></p>
          </div>

          <Button onClick={generatePDF} disabled={rows.every((r) => !r.date)} className="w-full sm:w-auto gap-2">
            <Download size={16} /> Download PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tour Diary ──────────────────────────────────────────────────────────────
function TourDiaryForm({ user }: { user: UserData | null }) {
  const t = useT();
  const [form, setForm] = useState({
    month: "",
    headquarters: "",
  });
  const [entries, setEntries] = useState<TourEntry[]>([
    { date: "", from_place: "", to_place: "", distance_km: "", purpose: "", mode: "" },
  ]);

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateEntry(index: number, field: keyof TourEntry, value: string) {
    setEntries((prev) => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  }

  function addEntry() {
    setEntries((prev) => [...prev, { date: "", from_place: "", to_place: "", distance_km: "", purpose: "", mode: "" }]);
  }

  function removeEntry(index: number) {
    if (entries.length <= 1) return;
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function generatePDF() {
    const doc = new jsPDF("p", "mm", "a4");
    const w = doc.internal.pageSize.getWidth();
    let y = 15;

    const name = user?.name || "_______________";
    const desg = user?.occupation || "_______________";
    const district = user?.posting_details?.regular_district || "";
    const block = user?.posting_details?.regular_block || "";

    // Header
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("TOUR DIARY", w / 2, y, { align: "center" });
    y += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${name}`, 20, y);
    doc.text(`Month: ${form.month || "___________"}`, w - 20, y, { align: "right" });
    y += 5;
    doc.text(`Designation: ${desg}`, 20, y);
    doc.text(`Headquarters: ${form.headquarters || [block, district].filter(Boolean).join(", ")}`, w - 20, y, { align: "right" });
    y += 8;

    // Table
    const tableData = entries.map((e, i) => [
      String(i + 1),
      formatDateStr(e.date),
      e.from_place,
      e.to_place,
      e.distance_km || "—",
      e.mode || "—",
      e.purpose,
    ]);

    const totalKm = entries.reduce((sum, e) => sum + (parseFloat(e.distance_km) || 0), 0);
    tableData.push(["", "", "", "", `${totalKm} km`, "", "TOTAL DISTANCE"]);

    autoTable(doc, {
      startY: y,
      head: [["S.No", "Date", "From", "To", "Km", "Mode", "Purpose of Visit / Work Done"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 22 },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 18 },
        6: { cellWidth: 60 },
      },
      theme: "grid",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Distance Travelled: ${totalKm} km`, 20, y);
    y += 5;
    doc.text(`Total Tour Days: ${entries.filter((e) => e.date).length}`, 20, y);
    y += 15;

    // Certification
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const cert = "I hereby certify that the above is a true and correct record of the tours performed by me during the above period in connection with official duties.";
    const certWrapped = doc.splitTextToSize(cert, w - 40);
    doc.text(certWrapped, 20, y);
    y += certWrapped.length * 5 + 10;

    // Signatures
    doc.text("Signature of the Officer", 20, y);
    doc.text("Countersigned by Controlling Officer", w - 20, y, { align: "right" });
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.text(name.toUpperCase(), 20, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(desg, 20, y);

    // Footer
    y += 12;
    doc.setDrawColor(...BRAND_GREEN);
    doc.line(20, y, w - 20, y);
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("Generated via TANHOWA Portal (tanhowa.in)", w / 2, y, { align: "center" });

    doc.save(`Tour_Diary_${form.month || "draft"}_${name.replace(/\s+/g, "_")}.pdf`);
    toast.success("PDF downloaded!");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
          <BookOpen size={20} className="text-purple-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t("letters.tour_diary")}</h2>
          <p className="text-xs text-muted-foreground">Daily tour record</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Month / Period</Label>
              <Input value={form.month} onChange={(e) => updateForm("month", e.target.value)} placeholder="e.g. March 2026" />
            </div>
            <div>
              <Label>Headquarters</Label>
              <Input value={form.headquarters} onChange={(e) => updateForm("headquarters", e.target.value)} placeholder={[user?.posting_details?.regular_block, user?.posting_details?.regular_district].filter(Boolean).join(", ") || "e.g. Salem"} />
            </div>
          </div>

          {/* Tour Entries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Tour Entries</Label>
              <Button type="button" size="sm" variant="outline" onClick={addEntry} className="gap-1">
                <Plus size={14} /> Add Entry
              </Button>
            </div>
            <div className="space-y-3">
              {entries.map((entry, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-muted/30 border relative">
                  {entries.length > 1 && (
                    <button onClick={() => removeEntry(i)} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs hover:bg-destructive/80">
                      <Trash2 size={10} />
                    </button>
                  )}
                  <div>
                    <Label className="text-[10px]">Date</Label>
                    <Input type="date" value={entry.date} onChange={(e) => updateEntry(i, "date", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">From</Label>
                    <Input value={entry.from_place} onChange={(e) => updateEntry(i, "from_place", e.target.value)} className="h-8 text-xs" placeholder="Place" />
                  </div>
                  <div>
                    <Label className="text-[10px]">To</Label>
                    <Input value={entry.to_place} onChange={(e) => updateEntry(i, "to_place", e.target.value)} className="h-8 text-xs" placeholder="Place" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Distance (Km)</Label>
                    <Input type="number" value={entry.distance_km} onChange={(e) => updateEntry(i, "distance_km", e.target.value)} className="h-8 text-xs" placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Mode</Label>
                    <Select value={entry.mode} onValueChange={(v) => updateEntry(i, "mode", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Mode" /></SelectTrigger>
                      <SelectContent>{TRAVEL_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-[10px]">Purpose / Work Done</Label>
                    <Input value={entry.purpose} onChange={(e) => updateEntry(i, "purpose", e.target.value)} className="h-8 text-xs" placeholder="Inspection, Meeting, etc." />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-4 mt-3 text-sm">
              <Badge variant="outline" className="text-xs">
                Total: {entries.reduce((s, e) => s + (parseFloat(e.distance_km) || 0), 0)} km | {entries.filter((e) => e.date).length} days
              </Badge>
            </div>
          </div>

          {/* Auto-filled preview */}
          <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground/70">Auto-filled from profile:</p>
            <p>Name: <span className="font-medium text-foreground">{user?.name || "—"}</span></p>
            <p>Designation: <span className="font-medium text-foreground">{user?.occupation || "—"}</span></p>
            <p>Posting: <span className="font-medium text-foreground">{[user?.posting_details?.regular_block, user?.posting_details?.regular_district].filter(Boolean).join(", ") || "—"}</span></p>
          </div>

          <Button onClick={generatePDF} disabled={entries.every((e) => !e.date)} className="w-full sm:w-auto gap-2">
            <Download size={16} /> Download PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDateStr(dateStr: string): string {
  if (!dateStr) return "___________";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convert(num: number): string {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " and " + convert(num % 100) : "");
    if (num < 100000) return convert(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + convert(num % 1000) : "");
    if (num < 10000000) return convert(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + convert(num % 100000) : "");
    return convert(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 ? " " + convert(num % 10000000) : "");
  }
  return convert(n);
}
