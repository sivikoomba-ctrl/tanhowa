// Shared sanitizing markdown renderer for announcement content — used by both
// the member-facing announcements page and the admin announcements list, so
// birthday-greeting content (which embeds `![Name](photo_url)` + `**bold**`)
// renders the same way everywhere instead of showing raw markdown syntax.

// Allowlist for inline images — only profile-photo CDNs the project already trusts.
function isSafeImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return (
      h.endsWith(".supabase.co") ||
      h.endsWith(".fbcdn.net") ||
      h === "platform-lookaside.fbsbx.com" ||
      h.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeHttpUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function renderSimpleMarkdown(text: string): string {
  return escapeHtml(text)
    // Image syntax ![alt](url) — must run BEFORE link syntax so ! prefix is consumed
    .replace(/!\[([^\]]*)\]\((https:\/\/[^\s)"'<>]+)\)/g, (_m, alt: string, url: string) => {
      if (!isSafeImageUrl(url)) return "";
      return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" class="inline-block w-8 h-8 rounded-full object-cover align-middle mx-1 ring-1 ring-border" />`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)"'<>]+)\)/g, (_m, label: string, url: string) => {
      const safeUrl = safeHttpUrl(url);
      if (!safeUrl) return label;
      return `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${label}</a>`;
    })
    // Bare-URL autolink — must skip URLs that are already inside an HTML
    // attribute (the image/link replacements above emit `<img src="…">` and
    // `<a href="…">`). Negative lookbehind for `=`, `"`, `'` rules those out;
    // excluding `"` from the URL char-class also stops greedy matches from
    // swallowing the closing quote of an attribute.
    .replace(/(?<!["'=])(https?:\/\/[^\s<"')]+)/g, (_match, url: string) => {
      const safeUrl = safeHttpUrl(url);
      if (!safeUrl) return url;
      return `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${escapeHtml(url)}</a>`;
    });
}
