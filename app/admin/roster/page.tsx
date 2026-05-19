"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DISTRICT_NAMES, getBlocks } from "@/lib/tn-districts";

interface ApprovedUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  posting_details: { regular_district?: string; regular_block?: string } | null;
}

interface RosterEntry {
  id: string;
  name: string;
  designation: string | null;
  district: string;
  block: string | null;
  phone: string | null;
  email: string | null;
}

interface Row {
  source: "registered" | "manual";
  id: string;
  name: string;
  designation: string;
  district: string;
  block: string;
  phone: string;
  email: string;
}

function rank(occupation: string): number {
  const o = (occupation || "").toLowerCase();
  if (o.includes("additional director")) return 1;
  if (o.includes("joint director")) return 2;
  if (o.includes("deputy director")) return 3;
  if (o.includes("assistant director")) return 4;
  if (o.includes("horticultural officer") && !o.includes("retd")) return 5;
  if (o.includes("retd")) return 6;
  return 7;
}

export default function AdminRosterPage() {
  const [approved, setApproved] = useState<ApprovedUser[]>([]);
  const [manual, setManual] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", designation: "", district: "", block: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        fetch("/api/users?status=approved").then((r) => r.json()),
        fetch("/api/roster").then((r) => r.json()),
      ]);
      setApproved(u.users || []);
      setManual(r.entries || []);
    } catch {
      toast.error("Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const u of approved) {
      out.push({
        source: "registered",
        id: u.id,
        name: u.name || "Unnamed",
        designation: u.occupation || "",
        district: u.posting_details?.regular_district || "—",
        block: u.posting_details?.regular_block || "",
        phone: u.phone || "",
        email: u.email || "",
      });
    }
    for (const m of manual) {
      out.push({
        source: "manual",
        id: m.id,
        name: m.name,
        designation: m.designation || "",
        district: m.district || "—",
        block: m.block || "",
        phone: m.phone || "",
        email: m.email || "",
      });
    }
    return out;
  }, [approved, manual]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (districtFilter !== "all" && r.district !== districtFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.designation.toLowerCase().includes(q) ||
        r.block.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
      );
    });
  }, [rows, search, districtFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      if (!map.has(r.district)) map.set(r.district, []);
      map.get(r.district)!.push(r);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ra = rank(a.designation);
        const rb = rank(b.designation);
        if (ra !== rb) return ra - rb;
        return (a.block || "").localeCompare(b.block || "");
      });
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.district) {
      toast.error("Name and district are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Member added");
      setAddOpen(false);
      setForm({ name: "", designation: "", district: "", block: "", phone: "", email: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this manual entry?")) return;
    try {
      const res = await fetch(`/api/roster?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const blocks = form.district ? getBlocks(form.district) : [];
  const totalApproved = approved.length;
  const totalManual = manual.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">District Roster</h1>
          <p className="text-sm text-muted-foreground">
            {totalApproved} registered · {totalManual} manual · grouped by district
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <UserPlus size={16} /> Add Member
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, designation, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={districtFilter} onValueChange={setDistrictFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All districts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All districts</SelectItem>
            {DISTRICT_NAMES.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members match the filter.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([district, list]) => (
            <div key={district} className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
                <h2 className="font-semibold">{district}</h2>
                <span className="text-xs text-muted-foreground">{list.length} members</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left w-12">S.No</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Designation</th>
                      <th className="px-3 py-2 text-left">Place of Posting</th>
                      <th className="px-3 py-2 text-left">Mobile</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r, i) => (
                      <tr key={`${r.source}-${r.id}`} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2">
                            <span>{r.name}</span>
                            {r.source === "manual" && (
                              <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 text-[10px]">
                                Manual
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">{r.designation || "—"}</td>
                        <td className="px-3 py-2">
                          {r.district}
                          {r.block ? ` / ${r.block}` : ""}
                        </td>
                        <td className="px-3 py-2">{r.phone || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.email || "—"}</td>
                        <td className="px-3 py-2 text-right">
                          {r.source === "manual" && (
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-destructive"
                              aria-label="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={18} /> Add Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Designation</Label>
              <Input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="HO / ADH / DDH / JDH / ADDH"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>District *</Label>
                <Select
                  value={form.district}
                  onValueChange={(v) => setForm({ ...form, district: v, block: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISTRICT_NAMES.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Block</Label>
                <Select
                  value={form.block}
                  onValueChange={(v) => setForm({ ...form, block: v })}
                  disabled={!form.district}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.district ? "Select" : "Pick district first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {blocks.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Mobile</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
