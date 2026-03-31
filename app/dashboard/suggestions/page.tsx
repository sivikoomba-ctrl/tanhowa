"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Lightbulb, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";

const statusColors: Record<string, string> = {
  pending: "secondary",
  in_progress: "default",
  resolved: "outline",
  rejected: "destructive",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

interface Suggestion {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  admin_remarks: string;
  created_at: string;
  updated_at: string;
}

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [form, setForm] = useState({ subject: "", description: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  function load() {
    fetch("/api/grievances?type=suggestion")
      .then((r) => r.json())
      .then((d) => setSuggestions(d.grievances || []))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/grievances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, category: "Suggestion" }),
    });

    if (res.ok) {
      toast.success("Suggestion submitted successfully");
      setForm({ subject: "", description: "" });
      setDialogOpen(false);
      load();
    } else {
      toast.error("Failed to submit suggestion");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Suggestions</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              Submit Suggestion
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Suggestion</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Subject *</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Brief subject of your suggestion"
                  required
                />
              </div>
              <div>
                <Label>Description *</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe your suggestion in detail"
                  rows={4}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                {loading ? "Submitting..." : "Submit Suggestion"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {suggestions.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No suggestions submitted yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((g) => (
            <Card key={g.id}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0">
                    <Lightbulb className="w-5 h-5 text-secondary-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm">{g.subject}</h3>
                      <Badge variant={statusColors[g.status] as "default" | "secondary" | "outline" | "destructive"} className="text-xs">
                        {statusLabels[g.status] || g.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                    <span className="text-xs text-muted-foreground mt-1.5 block">
                      {formatDate(g.created_at)}
                    </span>
                    {g.admin_remarks && (
                      <div className="mt-2 p-2 bg-muted rounded-md">
                        <p className="text-xs font-medium text-muted-foreground">Admin Remarks:</p>
                        <p className="text-xs mt-0.5">{g.admin_remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
