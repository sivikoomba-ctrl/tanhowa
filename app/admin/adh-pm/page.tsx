"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { CheckCircle2, XCircle, Clock, BadgeCheck } from "lucide-react";

type Member = { id: string; name: string; email: string; phone: string; district: string };
type Data = {
  summary: { now_pm: number; said_no: number; no_reply: number };
  now_pm: Member[];
  said_no: Member[];
  no_reply: Member[];
};

function MemberTable({ members }: { members: Member[] }) {
  if (members.length === 0) return <EmptyState icon={Clock} title="None" description="No members in this group." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-3 w-8">#</th>
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">District</th>
            <th className="py-2 pr-3">Phone</th>
            <th className="py-2 pr-3">Email</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => (
            <tr key={m.id} className="border-b last:border-0">
              <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
              <td className="py-1.5 pr-3 font-medium">{m.name || "—"}</td>
              <td className="py-1.5 pr-3">{m.district || "—"}</td>
              <td className="py-1.5 pr-3 font-mono text-xs">{m.phone || "—"}</td>
              <td className="py-1.5 pr-3 text-xs text-muted-foreground">{m.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdhPmPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/adh-pm")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BadgeCheck className="text-primary" /> ADH (PM) Query
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Responses to the &ldquo;Are you an Assistant Director of Horticulture (PM)?&rdquo; email.
          &ldquo;Now ADH (PM)&rdquo; also includes members already on that designation before the campaign.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Now ADH (PM)" value={loading ? "…" : data?.summary.now_pm ?? 0} icon={CheckCircle2} borderColor="border-l-green-500" loading={loading} />
        <MetricCard label="Said No" value={loading ? "…" : data?.summary.said_no ?? 0} icon={XCircle} borderColor="border-l-red-500" loading={loading} />
        <MetricCard label="No reply yet" value={loading ? "…" : data?.summary.no_reply ?? 0} icon={Clock} borderColor="border-l-amber-500" loading={loading} />
      </div>

      {data && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2 text-green-700"><CheckCircle2 size={18} /> Now ADH (PM) ({data.now_pm.length})</CardTitle></CardHeader>
            <CardContent><MemberTable members={data.now_pm} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2 text-red-700"><XCircle size={18} /> Said No ({data.said_no.length})</CardTitle></CardHeader>
            <CardContent><MemberTable members={data.said_no} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2 text-amber-700"><Clock size={18} /> No reply yet ({data.no_reply.length})</CardTitle></CardHeader>
            <CardContent><MemberTable members={data.no_reply} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
