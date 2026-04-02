"use client";

import { Badge } from "@/components/ui/badge";

export const statusStyles: Record<string, { label: string; color: string }> = {
  // Common statuses
  paid: { label: "Paid", color: "bg-green-100 text-green-700 border-green-300" },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-300" },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700 border-red-300" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-300" },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700 border-blue-300" },
  hold: { label: "On Hold", color: "bg-orange-100 text-orange-700 border-orange-300" },
  // Task statuses
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-300" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700 border-green-300" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-700 border-gray-300" },
  // Resolution statuses
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700 border-gray-300" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700 border-blue-300" },
  voting_open: { label: "Voting Open", color: "bg-purple-100 text-purple-700 border-purple-300" },
  passed: { label: "Passed", color: "bg-green-100 text-green-700 border-green-300" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700 border-red-300" },
  // Grievance statuses
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700 border-green-300" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
  customStyles?: Record<string, { label: string; color: string }>;
}

export function StatusBadge({ status, className = "", customStyles }: StatusBadgeProps) {
  const styles = customStyles || statusStyles;
  const config = styles[status] || { label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), color: "bg-gray-100 text-gray-700" };
  return (
    <Badge variant="outline" className={`text-xs ${config.color} ${className}`}>
      {config.label}
    </Badge>
  );
}
