import type { Copy } from "./themes";

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export type Fx = { sx: number; sy: number; flash: number };
export const NO_FX: Fx = { sx: 1, sy: 1, flash: 0 };

// power cycle timings in ms: hold, squash to a line, shrink to a dot, dark (screen swaps), line, open up
export const POWER = { hold: 400, squash: 560, dot: 700, dark: 900, line: 1050, end: 1500 };
const LINE = 0.006;

// off: sweep dies faster and faster, ends as a dot (afterglow fades it). on: snaps wide, eases open
export function powerFx(t: number): Fx {
    const k = (from: number, to: number) => clamp((t - from) / (to - from), 0, 1);
    if (t < POWER.dot) {
        const v = k(POWER.hold, POWER.squash) ** 3;
        const d = k(POWER.squash, POWER.dot) ** 2;
        return { sx: Math.max(LINE, 1 - d), sy: 1 - v * (1 - LINE), flash: v };
    }
    if (t < POWER.dark) return { sx: 0, sy: 0, flash: 0 };
    if (t < POWER.line) return { sx: Math.max(LINE, 1 - (1 - k(POWER.dark, POWER.line)) ** 3), sy: LINE, flash: 1 };
    const v = k(POWER.line, POWER.end);
    return { sx: 1, sy: LINE + (1 - LINE) * (1 - (1 - v) ** 3), flash: (1 - v) ** 2 };
}

// word wrap, too-long words get chopped
export function wrapText(text: string, cols: number): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
        let rest = para;
        while (rest.length > cols) {
            let cut = rest.lastIndexOf(" ", cols);
            if (cut <= 0) cut = cols;
            out.push(rest.slice(0, cut));
            rest = rest.slice(cut).replace(/^ /, "");
        }
        out.push(rest);
    }
    return out;
}

// links come from the db, only allow http(s) (javascript: etc would run on click)
export function safeHref(href: string): string | null {
    try {
        const url = new URL(href, window.location.href);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

// copy comes from the db too. only take values shaped like the theme's,
// a stray {"title": null} would crash every frame
export function mergeCopy(base: Copy, extra: unknown): Copy {
    if (!extra || typeof extra !== "object") return base;
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(extra)) {
        if (!Object.hasOwn(base, key)) continue;
        const current = merged[key];
        const fits =
            typeof current === "string"
                ? typeof value === "string"
                : Array.isArray(current) && Array.isArray(value) && value.every((v) => typeof v === "string");
        if (fits) merged[key] = value;
        else console.warn(`ignored copy.${key}, it should be ${Array.isArray(current) ? "a list of strings" : typeof current}`);
    }
    return merged as Copy;
}
