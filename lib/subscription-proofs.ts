export async function fetchSignedPaymentProofUrl(subscriptionId: string, filePath?: string): Promise<string> {
  const response = await fetch("/api/upload/payment-proof/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription_id: subscriptionId,
      ...(filePath ? { file_path: filePath } : {}),
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.url) {
    throw new Error(data?.error || "Failed to load proof");
  }

  return data.url as string;
}
