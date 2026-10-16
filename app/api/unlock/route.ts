import { rateLimit } from "@/lib/arg/rate-limit";
import { login, unlock } from "@/lib/arg/unlock";
import { MAX_PHRASE_LENGTH } from "@/components/terminal/config";

const MAX_BODY_BYTES = 4096; // 3 fields of 200 chars, even if every char is multi-byte, plus json

let warnedNoProxy = false;

// TODO: last hop in x-forwarded-for is only right with exactly one proxy in front
function clientKey(request: Request): string {
    const ip =
        request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (ip) return ip;
    // no proxy headers = everyone shares one bucket (20 tries a minute for the whole site)
    if (process.env.NODE_ENV === "production" && !warnedNoProxy) {
        warnedNoProxy = true;
        console.error("unlock: no x-real-ip or x-forwarded-for, is the proxy passing the client ip? see README");
    }
    return "unknown";
}

export async function POST(request: Request) {
    const rl = rateLimit(clientKey(request));
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Too many attempts.", retryAfter: rl.retryAfter },
            { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        );
    }

    // shortcut: a chunked body has no content-length and skips this, cap it at the proxy too
    if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
        return Response.json({ ok: false, error: "Body too large." }, { status: 413 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json(
            { ok: false, error: "Body must be JSON." },
            { status: 400 },
        );
    }

    const { phrase, username, password } = (body ?? {}) as Record<string, unknown>;
    const shortStr = (s: unknown): s is string => typeof s === "string" && s.length <= MAX_PHRASE_LENGTH;
    const isLogin = shortStr(username) && shortStr(password);
    if (!isLogin && !shortStr(phrase)) {
        return Response.json(
            { ok: false, error: `Send "phrase", or "username" and "password", as strings of ${MAX_PHRASE_LENGTH} characters or fewer.` },
            { status: 400 },
        );
    }

    let entry;
    try {
        // logins share the phrase rate limit on purpose, no faster password guessing
        entry = isLogin ? await login(username, password) : await unlock(phrase as string);
    } catch (err) {
        console.error(err);
        return Response.json({ ok: false, error: "Try again later." }, { status: 503 });
    }
    if (!entry) return Response.json({ ok: false }); // wrong guess is a normal 200, not an error

    return Response.json({ ok: true, entry });
}