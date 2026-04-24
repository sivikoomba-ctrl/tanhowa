"use client";

import { lazy, Suspense, useState } from "react";
import { SectionTabs, SectionTabsContent } from "@/components/section-tabs";
import { BarChart3, IndianRupee, Receipt, Award, Users, ClipboardCheck } from "lucide-react";
import { OverviewTab } from "./_components/overview-tab";
import { ExpensesTab } from "./_components/expenses-tab";
import { SubscriptionsTab } from "./_components/subscriptions-tab";
import { ContributionsTab } from "./_components/contributions-tab";

const MembersTab = lazy(() => import("./_components/members-tab").then(m => ({ default: m.MembersTab })));
const PerformanceTab = lazy(() => import("./_components/performance-tab").then(m => ({ default: m.PerformanceTab })));

export default function ReportsPage() {
  // SectionTabs requires a controlled value/onValueChange pair, so the
  // page moves from the previously-uncontrolled `defaultValue="overview"`
  // to a useState. Same initial value; no behavioral difference for users.
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <SectionTabs
        value={tab}
        onValueChange={setTab}
        aria-label="Reports dashboard sections"
        tabs={[
          { value: "overview", label: "Overview", icon: BarChart3 },
          { value: "subscriptions", label: "Subscriptions", icon: IndianRupee },
          { value: "expenses", label: "Expenses", icon: Receipt },
          { value: "contributions", label: "Contributions", icon: Award },
          { value: "members", label: "Members", icon: Users },
          { value: "performance", label: "Performance", icon: ClipboardCheck },
        ]}
      >
        <SectionTabsContent value="overview" className="mt-4">
          <OverviewTab />
        </SectionTabsContent>

        <SectionTabsContent value="subscriptions" className="mt-4">
          <SubscriptionsTab />
        </SectionTabsContent>

        <SectionTabsContent value="expenses" className="mt-4">
          <ExpensesTab />
        </SectionTabsContent>

        <SectionTabsContent value="contributions" className="mt-4">
          <ContributionsTab />
        </SectionTabsContent>

        <SectionTabsContent value="members" className="mt-4">
          <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <MembersTab />
          </Suspense>
        </SectionTabsContent>

        <SectionTabsContent value="performance" className="mt-4">
          <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <PerformanceTab />
          </Suspense>
        </SectionTabsContent>
      </SectionTabs>
    </div>
  );
}
