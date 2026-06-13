"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { DISTRICT_NAMES } from "@/lib/tn-districts";
import { toast } from "sonner";
import { Vote, Plus, Trash2, UserPlus, Lock, MapPin, Check } from "lucide-react";

// Titles that require a district (one post per district)
const DISTRICT_SCOPED_TITLES = ["District Secretary", "District Joint Secretary"];

interface Candidate {
  id: string;
  post_id: string;
  user_id: string | null;
  name: string;
  district: string | null;
  statement: string | null;
  status: string;
  created_at: string;
}

interface MemberLite {
  id: string;
  name: string;
  occupation: string | null;
  posting_details: { regular_district?: string } | null;
}

interface ElectionPost {
  id: string;
  title: string;
  description: string | null;
  district: string | null;
  display_order: number;
  status: string;
  created_at: string;
  candidates: Candidate[];
}

const POST_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  nominations_open: "Nominations Open",
  voting_open: "Voting Open",
  closed: "Closed",
};

const POST_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-300",
  nominations_open: "bg-blue-50 text-blue-700 border-blue-300",
  voting_open: "bg-green-50 text-green-700 border-green-300",
  closed: "bg-red-50 text-red-700 border-red-300",
};

const CANDIDATE_STATUS_COLORS: Record<string, string> = {
  nominated: "bg-amber-50 text-amber-700 border-amber-300",
  approved: "bg-green-50 text-green-700 border-green-300",
  withdrawn: "bg-gray-100 text-gray-500 border-gray-300",
};

export default function ElectionsPage() {
  const [posts, setPosts] = useState<ElectionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Create-post dialog
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postDescription, setPostDescription] = useState("");
  const [postDistrict, setPostDistrict] = useState("");

  const titleNeedsDistrict = DISTRICT_SCOPED_TITLES.includes(postTitle.trim());

  // Add-candidate dialog
  const [candidateDialogPost, setCandidateDialogPost] = useState<ElectionPost | null>(null);
  const [candName, setCandName] = useState("");
  const [candDistrict, setCandDistrict] = useState("");
  const [candStatement, setCandStatement] = useState("");
  const [candUserId, setCandUserId] = useState<string | null>(null);
  const [memberResults, setMemberResults] = useState<MemberLite[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [showMemberMenu, setShowMemberMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetCandidateForm = () => {
    setCandName("");
    setCandDistrict("");
    setCandStatement("");
    setCandUserId(null);
    setMemberResults([]);
    setShowMemberMenu(false);
  };

  const onCandNameChange = (value: string) => {
    setCandName(value);
    setCandUserId(null); // editing detaches any linked member
    setShowMemberMenu(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (q.length < 2) { setMemberResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        setMemberSearching(true);
        const res = await fetch(`/api/users?status=approved&search=${encodeURIComponent(q)}&limit=8`);
        const d = await res.json();
        setMemberResults(d.users || []);
      } catch {
        setMemberResults([]);
      } finally {
        setMemberSearching(false);
      }
    }, 250);
  };

  const selectMember = (m: MemberLite) => {
    setCandName(m.name || "");
    setCandUserId(m.id);
    if (m.posting_details?.regular_district) setCandDistrict(m.posting_details.regular_district);
    setMemberResults([]);
    setShowMemberMenu(false);
  };

  const load = async () => {
    try {
      const res = await fetch("/api/elections");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load");
      setPosts(d.posts || []);
    } catch {
      toast.error("Failed to load election data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createPost = async () => {
    if (!postTitle.trim()) return toast.error("Title is required");
    if (titleNeedsDistrict && !postDistrict) return toast.error("Select a district for this post");
    setSaving(true);
    try {
      const res = await fetch("/api/elections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: postTitle, description: postDescription, district: titleNeedsDistrict ? postDistrict : null, display_order: posts.length + 1 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to create post");
      toast.success("Post created");
      setPostDialogOpen(false);
      setPostTitle("");
      setPostDescription("");
      setPostDistrict("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create post");
    } finally {
      setSaving(false);
    }
  };

  const updatePostStatus = async (post: ElectionPost, status: string) => {
    try {
      const res = await fetch("/api/elections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id, status }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to update");
      toast.success(`${post.title}: ${POST_STATUS_LABELS[status]}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  const deletePost = async (post: ElectionPost) => {
    if (!confirm(`Delete post "${post.title}" and its ${post.candidates.length} candidate(s)?`)) return;
    try {
      const res = await fetch(`/api/elections?type=post&id=${post.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Post deleted");
      load();
    } catch {
      toast.error("Failed to delete post");
    }
  };

  const addCandidate = async () => {
    if (!candidateDialogPost) return;
    if (!candName.trim()) return toast.error("Candidate name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/elections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "candidate",
          post_id: candidateDialogPost.id,
          name: candName,
          district: candDistrict,
          statement: candStatement,
          user_id: candUserId,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to add candidate");
      toast.success("Candidate added");
      setCandidateDialogPost(null);
      resetCandidateForm();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add candidate");
    } finally {
      setSaving(false);
    }
  };

  const updateCandidateStatus = async (cand: Candidate, status: string) => {
    try {
      const res = await fetch("/api/elections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "candidate", id: cand.id, status }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to update");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update candidate");
    }
  };

  const deleteCandidate = async (cand: Candidate) => {
    if (!confirm(`Remove candidate "${cand.name}"?`)) return;
    try {
      const res = await fetch(`/api/elections?type=candidate&id=${cand.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Candidate removed");
      load();
    } catch {
      toast.error("Failed to remove candidate");
    }
  };

  if (forbidden) {
    return (
      <div className="p-6">
        <EmptyState icon={Lock} title="Restricted" description="This section is available to State-Admin only." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Vote className="text-primary" size={24} /> TANHOWA Election
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage election posts and candidates for various TANHOWA positions.
          </p>
        </div>
        <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl"><Plus size={16} className="mr-1" /> Add Post</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Election Post</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Post Title *</Label>
                <Input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="e.g. District Secretary" />
              </div>
              {titleNeedsDistrict && (
                <div className="space-y-2">
                  <Label>District *</Label>
                  <Select value={postDistrict} onValueChange={setPostDistrict}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select district" />
                    </SelectTrigger>
                    <SelectContent>
                      {DISTRICT_NAMES.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This title needs a district — each district has its own {postTitle.trim()} post.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={postDescription} onChange={(e) => setPostDescription(e.target.value)} placeholder="Role description, eligibility, tenure..." rows={3} />
              </div>
              <Button onClick={createPost} disabled={saving} className="w-full rounded-xl">
                {saving ? "Creating..." : "Create Post"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-24 animate-pulse bg-muted rounded-xl" /></CardContent></Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Vote} title="No election posts yet" description="Create the first post to start setting up the election." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {posts.map((post) => (
            <Card key={post.id} className="rounded-2xl">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{post.title}</h3>
                      {post.district && (
                        <Badge variant="outline" className="text-xs bg-secondary/10 text-secondary-foreground border-secondary/30">
                          <MapPin size={11} className="mr-0.5" /> {post.district}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-xs ${POST_STATUS_COLORS[post.status] || ""}`}>
                        {POST_STATUS_LABELS[post.status] || post.status}
                      </Badge>
                    </div>
                    {post.description && <p className="text-sm text-muted-foreground mt-1">{post.description}</p>}
                  </div>
                </div>

                {/* Candidates */}
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Candidates ({post.candidates.length})
                  </p>
                  {post.candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No candidates yet.</p>
                  ) : (
                    post.candidates.map((cand) => (
                      <div key={cand.id} className="flex items-center gap-2 p-2 rounded-xl border bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${cand.status === "withdrawn" ? "line-through text-muted-foreground" : ""}`}>
                            {cand.name}
                            {cand.district && <span className="text-xs text-muted-foreground font-normal"> — {cand.district}</span>}
                          </p>
                          {cand.statement && <p className="text-xs text-muted-foreground truncate">{cand.statement}</p>}
                        </div>
                        <Select value={cand.status} onValueChange={(v) => updateCandidateStatus(cand, v)}>
                          <SelectTrigger className={`h-7 w-[120px] text-xs rounded-lg ${CANDIDATE_STATUS_COLORS[cand.status] || ""}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nominated">Nominated</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="withdrawn">Withdrawn</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCandidate(cand)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {/* Actions — below content per card layout convention */}
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setCandidateDialogPost(post)}>
                    <UserPlus size={14} className="mr-1" /> Add Candidate
                  </Button>
                  <Select value={post.status} onValueChange={(v) => updatePostStatus(post, v)}>
                    <SelectTrigger className="h-8 w-[160px] text-xs rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(POST_STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="rounded-xl text-destructive" onClick={() => deletePost(post)}>
                    <Trash2 size={14} className="mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add candidate dialog */}
      <Dialog open={!!candidateDialogPost} onOpenChange={(o) => { if (!o) { setCandidateDialogPost(null); resetCandidateForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Candidate — {candidateDialogPost?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 relative">
              <Label>Name *</Label>
              <Input
                value={candName}
                onChange={(e) => onCandNameChange(e.target.value)}
                onFocus={() => { if (memberResults.length) setShowMemberMenu(true); }}
                placeholder="Type to search members…"
                autoComplete="off"
              />
              {candUserId && (
                <p className="text-xs text-green-700 flex items-center gap-1">
                  <Check size={12} /> Linked to member profile
                </p>
              )}
              {showMemberMenu && (memberSearching || memberResults.length > 0 || candName.trim().length >= 2) && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-56 overflow-auto rounded-xl border bg-popover shadow-md">
                  {memberSearching && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
                  {memberResults.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectMember(m)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-b-0"
                    >
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[m.occupation, m.posting_details?.regular_district].filter(Boolean).join(" • ")}
                      </p>
                    </button>
                  ))}
                  {!memberSearching && memberResults.length === 0 && candName.trim().length >= 2 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No members found — you can still type a free-text name.</div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>District</Label>
              <Input value={candDistrict} onChange={(e) => setCandDistrict(e.target.value)} placeholder="e.g. Madurai" />
            </div>
            <div className="space-y-2">
              <Label>Statement / Notes</Label>
              <Textarea value={candStatement} onChange={(e) => setCandStatement(e.target.value)} placeholder="Optional candidate statement or notes" rows={3} />
            </div>
            <Button onClick={addCandidate} disabled={saving} className="w-full rounded-xl">
              {saving ? "Adding..." : "Add Candidate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
