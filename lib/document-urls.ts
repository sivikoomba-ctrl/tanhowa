import { SupabaseClient } from "@supabase/supabase-js";

const INTERNAL_DOCUMENT_URL_TTL_SECONDS = 300;

export function isExternalDocumentUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function resolveDocumentUrl(supabase: SupabaseClient, value: string): Promise<string> {
  if (!value || isExternalDocumentUrl(value)) {
    return value;
  }

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(value, INTERNAL_DOCUMENT_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return value;
  }

  return data.signedUrl;
}
