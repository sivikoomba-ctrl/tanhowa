import { redirect } from "next/navigation";

export default function VerifyPaymentsRedirect() {
  redirect("/admin/verify-payments");
}
