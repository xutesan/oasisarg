import "server-only";

// in-memory, one process only. won't hold on serverless
// TODO: move to redis/upstash if this ever runs on more than one instance
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 20;

const tries = new Map<string, number[]>();
let lastSweep = Date.now();

// retryAfter is whole seconds, 0 when allowed
export function rateLimit(key: string, now = Date.now()): { allowed: boolean; retryAfter: number } {
    const since = now - WINDOW_MS;

    if (now - lastSweep > WINDOW_MS) {
        for (const [k, times] of tries) {
            if (times[times.length - 1] <= since) tries.delete(k);
        }
        lastSweep = now;
    }

    const live = (tries.get(key) ?? []).filter((t) => t > since);

    if (live.length >= MAX_ATTEMPTS) {
        tries.set(key, live);
        return {
            allowed: false,
            retryAfter: Math.max(1, Math.ceil((live[0] + WINDOW_MS - now) / 1000)),
        };
    }

    live.push(now);
    tries.set(key, live);
    return { allowed: true, retryAfter: 0 };
}