import assert from "node:assert/strict";
import { test } from "node:test";
import { askServer, entryLines } from "./session";
import { THEMES } from "./themes";

const copy = THEMES.scipnet.copy;
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test("askServer turns each failure into the player's wording", async () => {
    const limited = await askServer({}, copy, reply(429, { ok: false, retryAfter: 7 }));
    assert.deepEqual(limited, { error: copy.rateLimited(7) });
    // no retryAfter in the body, falls back to a minute
    assert.deepEqual(await askServer({}, copy, reply(429, null)), { error: copy.rateLimited(60) });
    assert.deepEqual(await askServer({}, copy, reply(503, { ok: false })), { error: copy.offline });
    assert.deepEqual(await askServer({}, copy, reply(400, { ok: false })), { error: copy.rejected });
    assert.deepEqual(await askServer({}, copy, (async () => { throw new Error("down"); }) as typeof fetch), { error: copy.offline });
});

test("askServer passes a good answer through, hit or miss", async () => {
    assert.deepEqual(await askServer({}, copy, reply(200, { ok: false })), { reply: { ok: false } });
});

test("entryLines prints title, body, link, then a blank line", () => {
    (globalThis as unknown as { window: unknown }).window = { location: { href: "https://site.test/" } };
    const entry = { id: "a", kind: "hint" as const, title: "T", body: "B", link: "https://x.test/", theme: null, copy: null };
    const lines = entryLines(entry);
    assert.deepEqual(lines.map((l) => l.tone), ["hint", "text", "link", "text"]);
    assert.equal(lines[2].href, "https://x.test/");
    // a javascript: link prints as plain text, no href
    const bad = entryLines({ ...entry, kind: "result", link: "javascript:alert(1)" });
    assert.equal(bad[0].tone, "result");
    assert.equal(bad[2].tone, "text");
    assert.equal(bad[2].href, undefined);
});
