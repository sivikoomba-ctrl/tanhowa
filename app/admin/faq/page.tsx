"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import {
  HelpCircle,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  published: boolean;
  created_at: string;
}

const DEFAULT_CATEGORIES = ["General", "Membership", "Subscriptions", "Payments", "Profile", "Officials", "Tasks", "AI Tools", "Technical"];

export default function AdminFAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editFaq, setEditFaq] = useState<FAQ | null>(null);
  const [form, setForm] = useState({ question: "", answer: "", category: "General", sort_order: "0" });

  const load = useCallback(() => {
    // Fetch all FAQs (including unpublished) - admin sees all
    fetch("/api/faq")
      .then((r) => r.json())
      .then((d) => setFaqs(d.faqs || []))
      .catch(() => toast.error("Failed to load FAQs"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditFaq(null);
    setForm({ question: "", answer: "", category: "General", sort_order: String(faqs.length) });
    setShowDialog(true);
  }

  function openEdit(faq: FAQ) {
    setEditFaq(faq);
    setForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      sort_order: String(faq.sort_order),
    });
    setShowDialog(true);
  }

  async function saveFaq() {
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error("Question and answer are required");
      return;
    }

    try {
      const method = editFaq ? "PUT" : "POST";
      const body = editFaq
        ? { id: editFaq.id, ...form, sort_order: parseInt(form.sort_order) || 0 }
        : { ...form, sort_order: parseInt(form.sort_order) || 0 };

      const res = await fetch("/api/faq", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      toast.success(editFaq ? "FAQ updated" : "FAQ created");
      setShowDialog(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function togglePublished(faq: FAQ) {
    try {
      const res = await fetch("/api/faq", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: faq.id, published: !faq.published }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(faq.published ? "FAQ hidden" : "FAQ published");
      load();
    } catch {
      toast.error("Failed to update");
    }
  }

  async function deleteFaq(id: string) {
    try {
      const res = await fetch(`/api/faq?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("FAQ deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  // Group by category
  const categories = [...new Set(faqs.map((f) => f.category))].sort();

  if (loading) {
    return (
      <div className="space-y-6 p-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-primary" />
            FAQ Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {faqs.length} FAQs across {categories.length} categories
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1">
          <Plus className="h-4 w-4" /> Add FAQ
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <Badge variant="outline" className="text-sm">
          Published: {faqs.filter((f) => f.published).length}
        </Badge>
        <Badge variant="secondary" className="text-sm">
          Hidden: {faqs.filter((f) => !f.published).length}
        </Badge>
      </div>

      {/* FAQ List by category */}
      {faqs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => {
            const catFaqs = faqs.filter((f) => f.category === cat);
            return (
              <div key={cat}>
                <h2 className="text-lg font-semibold text-primary mb-3 flex items-center gap-2">
                  {cat}
                  <Badge variant="outline" className="text-xs">{catFaqs.length}</Badge>
                </h2>
                <div className="space-y-2">
                  {catFaqs.map((faq) => (
                    <Card key={faq.id} className={!faq.published ? "opacity-50" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground">#{faq.sort_order}</span>
                              {!faq.published && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                            </div>
                            <p className="font-medium text-sm">{faq.question}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{faq.answer}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => togglePublished(faq)}>
                              {faq.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(faq)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteFaq(faq.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editFaq ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Question</label>
              <Textarea
                rows={2}
                placeholder="Enter the question..."
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Answer</label>
              <Textarea
                rows={5}
                placeholder="Enter the answer..."
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEFAULT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Sort Order</label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                />
              </div>
            </div>
            <Button className="w-full" onClick={saveFaq} disabled={!form.question.trim() || !form.answer.trim()}>
              {editFaq ? "Update" : "Create"} FAQ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
