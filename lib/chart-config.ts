import type { ChartConfig } from "@/components/ui/chart";

// TANHOWA brand-aligned chart colors using existing CSS theme variables
export const CHART_COLORS = {
  primary: "var(--color-chart-1)",       // deep green
  accent: "var(--color-chart-2)",        // terracotta
  secondary: "var(--color-chart-3)",     // gold
  primaryLight: "var(--color-chart-4)",  // medium green
  warm: "var(--color-chart-5)",          // warm yellow
  // Status-specific (direct hex for recharts fills)
  paid: "#16a34a",
  pending: "#d97706",
  overdue: "#dc2626",
  hold: "#6b7280",
  rejected: "#991b1b",
  approved: "#16a34a",
  completed: "#16a34a",
  in_progress: "#2563eb",
  cancelled: "#9ca3af",
} as const;

// Reusable chart configs for common patterns
export const subscriptionStatusConfig: ChartConfig = {
  paid: { label: "Paid", color: CHART_COLORS.paid },
  pending: { label: "Pending", color: CHART_COLORS.pending },
  overdue: { label: "Overdue", color: CHART_COLORS.overdue },
  hold: { label: "Hold", color: CHART_COLORS.hold },
  rejected: { label: "Rejected", color: CHART_COLORS.rejected },
};

export const taskStatusConfig: ChartConfig = {
  pending: { label: "Pending", color: CHART_COLORS.pending },
  approved: { label: "Approved", color: "#3b82f6" },
  in_progress: { label: "In Progress", color: CHART_COLORS.in_progress },
  completed: { label: "Completed", color: CHART_COLORS.completed },
  review: { label: "Review", color: "#8b5cf6" },
  cancelled: { label: "Cancelled", color: CHART_COLORS.cancelled },
};

export const expenseStatusConfig: ChartConfig = {
  approved: { label: "Approved", color: CHART_COLORS.approved },
  pending: { label: "Pending", color: CHART_COLORS.pending },
  rejected: { label: "Rejected", color: CHART_COLORS.rejected },
};

// Earth-tone palette for category/district breakdowns (up to 10 items)
export const CATEGORY_PALETTE = [
  "#2d6a4f", "#d4a017", "#c65d21", "#3b82f6", "#8b5cf6",
  "#0891b2", "#059669", "#ca8a04", "#dc2626", "#6b7280",
];
