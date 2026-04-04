"use client";

import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, IndianRupee, Receipt, Award, Users, ClipboardCheck } from "lucide-react";
import { OverviewTab } from "./_components/overview-tab";
import { ExpensesTab } from "./_components/expenses-tab";
import { SubscriptionsTab } from "./_components/subscriptions-tab";
import { ContributionsTab } from "./_components/contributions-tab";
import { MembersTab } from "./_components/members-tab";

const PerformanceTab = lazy(() => import("./_components/performance-tab").then(m => ({ default: m.PerformanceTab })));

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="flex items-center gap-1.5"><BarChart3 size={14} /> Overview</TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex items-center gap-1.5"><IndianRupee size={14} /> Subscriptions</TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-1.5"><Receipt size={14} /> Expenses</TabsTrigger>
          <TabsTrigger value="contributions" className="flex items-center gap-1.5"><Award size={14} /> Contributions</TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-1.5"><Users size={14} /> Members</TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-1.5"><ClipboardCheck size={14} /> Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4">
          <SubscriptionsTab />
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab />
        </TabsContent>

        <TabsContent value="contributions" className="mt-4">
          <ContributionsTab />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <MembersTab />
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <PerformanceTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
