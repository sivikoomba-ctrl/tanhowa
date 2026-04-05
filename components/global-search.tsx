"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Megaphone, Calendar, FileText, Users, HelpCircle } from "lucide-react";

interface SearchResult {
  type: "announcement" | "event" | "document" | "member" | "faq";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const typeIcons = {
  announcement: Megaphone,
  event: Calendar,
  document: FileText,
  member: Users,
  faq: HelpCircle,
};

const typeLabels = {
  announcement: "Announcement",
  event: "Event",
  document: "Document",
  member: "Member",
  faq: "FAQ",
};

const typeColors = {
  announcement: "text-orange-500",
  event: "text-blue-500",
  document: "text-green-500",
  member: "text-purple-500",
  faq: "text-teal-500",
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => setResults(d.results || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sidebar-border/30 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-colors text-xs"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] bg-sidebar-accent/20 px-1 py-0.5 rounded">
          Ctrl+K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setQuery(""); setResults([]); } }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 border-b">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search announcements, events, documents, members..."
              className="border-0 focus-visible:ring-0 text-sm h-12"
              autoFocus
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              </div>
            )}
            {!loading && query.length >= 2 && results.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No results found</p>
            )}
            {!loading && results.length > 0 && (
              <div className="py-2">
                {results.map((r) => {
                  const Icon = typeIcons[r.type];
                  const color = typeColors[r.type];
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => handleSelect(r)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      <Icon size={16} className={`shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        {r.subtitle && <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{typeLabels[r.type]}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {!loading && query.length < 2 && (
              <p className="text-xs text-muted-foreground text-center py-8">Type at least 2 characters to search</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
