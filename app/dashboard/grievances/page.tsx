"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquareWarning, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";

const categories = ["General", "Administrative", "Technical", "Suggestion", "Others"];

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

interface Grievance {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  admin_remarks: string;
  created_at: string;
  updated_at: string;
}

export default function GrievancesPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [form, setForm] = useState({ subject: "", description: "", category: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  function load() {
    fetch("/api/grievances")
      .then((r) => r.json())
      .then((d) => setGrievances(d.grievances || []))
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
      body: JSON.stringify(form),
    });

    if (res.ok) {
      toast.success("Grievance submitted successfully");
      setForm({ subject: "", description: "", category: "" });
      setDialogOpen(false);
      load();
    } else {
      toast.error("Failed to submit grievance");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Grievances</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              Submit Grievance
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Grievance</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Subject *</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Brief subject of your grievance"
                  required
                />
              </div>
              <div>
                <Label>Description *</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe your grievance in detail"
                  rows={4}
                  required
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(val) => setForm({ ...form, category: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                {loading ? "Submitting..." : "Submit Grievance"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {grievances.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquareWarning className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No grievances submitted yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grievances.map((g) => (
            <Card key={g.id}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquareWarning className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm">{g.subject}</h3>
                      <Badge variant={statusColors[g.status] as "default" | "secondary" | "outline" | "destructive"} className="text-xs">
                        {statusLabels[g.status] || g.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {g.category && <Badge variant="outline" className="text-xs">{g.category}</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(g.created_at)}
                      </span>
                    </div>
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
