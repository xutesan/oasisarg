import type { UnlockedEntry } from "@/lib/arg/unlock";
import type { Line } from "./paint";
import type { Copy } from "./themes";
import { safeHref } from "./util";

export type ApiResponse =
    | { ok: true; entry: UnlockedEntry }
    | { ok: false; error?: string; retryAfter?: number };

// error comes back already worded for the player. fetchFn is only here so tests don't need a server
export async function askServer(
    body: object,
    copy: Copy,
    fetchFn: typeof fetch = fetch,
): Promise<{ reply: ApiResponse } | { error: string }> {
    try {
        const res = await fetchFn("/api/unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse | null;
        if (res.status === 429) {
            return { error: copy.rateLimited(json && !json.ok && json.retryAfter ? json.retryAfter : 60) };
        }
        if (res.status >= 500) return { error: copy.offline };
        if (!res.ok || !json) return { error: copy.rejected };
        return { reply: json };
    } catch {
        return { error: copy.offline };
    }
}

// what gets printed for an unlocked entry
export function entryLines(entry: UnlockedEntry): Line[] {
    const href = entry.link ? safeHref(entry.link) : null;
    const lines: Line[] = [
        { text: entry.title, tone: entry.kind === "hint" ? "hint" : "result" },
        { text: entry.body, tone: "text" },
    ];
    if (entry.link) lines.push({ text: entry.link, tone: href ? "link" : "text", href: href ?? undefined });
    lines.push({ text: "", tone: "text" });
    return lines;
}
