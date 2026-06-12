import { SupabaseClient } from "@supabase/supabase-js";

const INTERNAL_DOCUMENT_URL_TTL_SECONDS = 300;

export function isExternalDocumentUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isSafeExternalDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isInternalDocumentPath(value: string): boolean {
  if (!value || isExternalDocumentUrl(value)) return false;
  if (value.length > 1000) return false;
  if (/[\u0000-\u001f\\]/.test(value)) return false;

  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return false;
  return true;
}

export function isAllowedDocumentReference(value: string): boolean {
  return isInternalDocumentPath(value) || isSafeExternalDocumentUrl(value);
}

export async function createInternalDocumentSignedUrl(supabase: SupabaseClient, value: string): Promise<string | null> {
  if (!isInternalDocumentPath(value)) return null;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(value, INTERNAL_DOCUMENT_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function resolveDocumentUrl(supabase: SupabaseClient, value: string): Promise<string> {
  if (!value || isExternalDocumentUrl(value)) {
    return value;
  }

  return (await createInternalDocumentSignedUrl(supabase, value)) || value;
}
