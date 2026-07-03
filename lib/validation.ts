import { z } from "zod";
import { SERVICE_REQUEST_CATEGORIES, GRIEVANCE_CATEGORIES, LEGACY_GRIEVANCE_CATEGORIES } from "@/lib/grievances";

// Reusable primitives
const trimmedString = z.string().trim();
const nonEmptyString = trimmedString.min(1, "Required");
const safeString = trimmedString.max(5000); // Prevent huge payloads
const uuidSchema = z.string().uuid();

// Grievances / Suggestions / Service Requests (shared table + route)
export const grievanceCreateSchema = z.object({
  subject: nonEmptyString.max(500),
  description: safeString.max(10000),
  category: z.enum([
    ...GRIEVANCE_CATEGORIES,
    ...LEGACY_GRIEVANCE_CATEGORIES,
    "Suggestion",
    ...SERVICE_REQUEST_CATEGORIES,
  ]),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export const grievanceUpdateSchema = z.object({
  id: uuidSchema,
  status: z.enum(["pending", "in_progress", "resolved", "rejected"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  admin_remarks: safeString.max(5000).optional(),
});

// Announcements
export const announcementCreateSchema = z.object({
  title: nonEmptyString.max(500),
  content: nonEmptyString.max(50000),
  published: z.boolean().optional(),
  scheduled_at: z.string().optional().nullable(),
  send_email: z.boolean().optional(),
});

// Events
export const eventCreateSchema = z.object({
  title: nonEmptyString.max(500),
  date: z.string().min(1),
  description: safeString.max(10000).optional(),
  location: safeString.max(500).optional(),
  image_url: z.string().url().optional().or(z.literal("")),
});

// Subscriptions
export const subscriptionUpdateSchema = z.object({
  id: uuidSchema,
  status: z.enum(["pending", "paid", "overdue", "hold", "rejected"]).optional(),
  remarks: safeString.max(2000).optional(),
  paid_at: z.string().optional(),
  transaction_id: safeString.max(200).optional(),
  payment_method: safeString.max(100).optional(),
  paid_amount: z.number().positive().max(1000000).optional(),
  payment_proof_url: z.string().max(1000).optional(),
  payment_group_id: z.string().uuid().optional(),
  amount: z.number().min(0).max(1000000).optional(),
});

// Todos / Tasks
export const todoCreateSchema = z.object({
  title: nonEmptyString.max(500),
  description: safeString.max(10000).optional(),
  urgent: z.boolean().optional(),
  important: z.boolean().optional(),
  due_date: z.string().optional(),
  assigned_team_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  timebox_hours: z.number().min(0).max(10000).optional(),
});

// Polls
export const pollCreateSchema = z.object({
  title: nonEmptyString.max(500),
  options: z.array(nonEmptyString.max(500)).min(2).max(6),
  expires_at: z.string().optional().nullable(),
});

export const pollVoteSchema = z.object({
  poll_id: uuidSchema,
  option_index: z.number().int().min(0).max(5),
});

// Resolutions
export const resolutionCreateSchema = z.object({
  title: nonEmptyString.max(500),
  description: nonEmptyString.max(10000),
  category: safeString.max(200).optional(),
});

// Wishlist Ideas
export const wishlistCreateSchema = z.object({
  title: nonEmptyString.max(500),
  description: nonEmptyString.max(5000),
  category: z.enum(["Training", "Infrastructure", "Events", "Digital Tools", "Policy", "Welfare", "Communication", "Other"]),
});

// FAQs
export const faqCreateSchema = z.object({
  question: nonEmptyString.max(1000),
  answer: nonEmptyString.max(10000),
  category: safeString.max(200).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  published: z.boolean().optional(),
});

// Vouchers
export const voucherCreateSchema = z.object({
  title: nonEmptyString.max(500),
  amount: z.number().positive().max(10000000),
  description: safeString.max(5000).optional(),
  invoice_number: safeString.max(200).optional(),
  vendor_name: safeString.max(500).optional(),
  expense_date: z.string().optional().nullable(),
  expense_event: safeString.max(500).optional(),
  category: z.enum(["Travel", "Printing", "Food & Refreshments", "Stationery", "Communication", "Venue & Hall", "Transport", "Miscellaneous"]).optional(),
  receipt_url: z.string().max(1000).optional().nullable(),
  // Payment-proof fields (optional) — extracted from a payment screenshot
  // via /api/upload/payment-proof/extract-date. Either bill or payment proof
  // is sufficient; both can be attached.
  payment_proof_url: z.string().max(1000).optional().nullable(),
  payment_method: safeString.max(100).optional(),
  payment_transaction_id: safeString.max(200).optional(),
  payment_date: z.string().optional().nullable(),
  paid_to: safeString.max(500).optional(),
  submitted_by: z.string().uuid().optional(),
});

// Messages (new)
export const messageCreateSchema = z.object({
  to: uuidSchema,
  content: nonEmptyString.max(5000),
});

// Trainings
export const trainingCreateSchema = z.object({
  title: nonEmptyString.max(500),
  trainer_name: nonEmptyString.max(300),
  trainer_type: z.enum(["internal", "external"]).optional(),
  date: z.string().min(1),
  duration: safeString.max(200).optional(),
  mode: z.enum(["online", "offline", "hybrid"]).optional(),
  meeting_link: z.string().url().optional().or(z.literal("")),
  max_participants: z.number().int().min(1).max(100000).optional(),
  materials_url: z.string().url().optional().or(z.literal("")),
  description: safeString.max(10000).optional(),
});

// Field Diary
export const fieldDiaryEntrySchema = z.object({
  report_text: nonEmptyString.max(20000),
  is_success_story: z.boolean().optional(),
});

export const fieldDiaryEntryUpdateSchema = z.object({
  id: uuidSchema,
  report_text: nonEmptyString.max(20000).optional(),
  is_success_story: z.boolean().optional(),
});

// Search
export const searchSchema = z.object({
  q: trimmedString.min(2).max(200),
});

// Helper to validate and return parsed data or error response
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const firstError = result.error.issues[0];
  return { success: false, error: `${firstError.path.join(".")}: ${firstError.message}` };
}
