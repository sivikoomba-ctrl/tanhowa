"use client";

import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import {
  HelpCircle,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  created_at: string;
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const t = useT();

  useEffect(() => {
    fetch("/api/faq")
      .then((r) => r.json())
      .then((d) => setFaqs(d.faqs || []))
      .catch(() => toast.error("Failed to load FAQs"))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = [...new Set(faqs.map((f) => f.category))].sort();
    return ["All", ...cats];
  }, [faqs]);

  const filtered = useMemo(() => {
    let list = faqs;
    if (activeCategory !== "All") {
      list = list.filter((f) => f.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
      );
    }
    return list;
  }, [faqs, activeCategory, search]);

  // Group by category for display
  const grouped = useMemo(() => {
    const map: Record<string, FAQ[]> = {};
    for (const faq of filtered) {
      if (!map[faq.category]) map[faq.category] = [];
      map[faq.category].push(faq);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (loading) {
    return (
      <div className="space-y-6 p-6 animate-pulse">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-10 w-full bg-muted rounded-xl" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" />
          {t("faq.title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("faq.subtitle")}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("faq.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category pills */}
      {categories.length > 2 && (
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              className="cursor-pointer text-sm px-3 py-1"
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
              {cat !== "All" && (
                <span className="ml-1 opacity-60">
                  ({faqs.filter((f) => f.category === cat).length})
                </span>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* FAQ List */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <div key={category}>
              {activeCategory === "All" && (
                <h2 className="text-lg font-semibold text-primary mb-3">{category}</h2>
              )}
              <div className="space-y-2">
                {items.map((faq) => {
                  const isOpen = openId === faq.id;
                  return (
                    <div
                      key={faq.id}
                      className={`border rounded-xl overflow-hidden transition-all ${
                        isOpen ? "border-primary/30 shadow-sm bg-primary/[0.02]" : "border-border hover:border-primary/20"
                      }`}
                    >
                      <button
                        className="w-full flex items-start justify-between p-4 text-left"
                        onClick={() => setOpenId(isOpen ? null : faq.id)}
                      >
                        <span className="font-medium text-sm pr-4">{faq.question}</span>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 -mt-1">
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {faq.answer}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Count */}
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {t("faq.showing", { filtered: String(filtered.length), total: String(faqs.length) })}
        </p>
      )}
    </div>
  );
}
