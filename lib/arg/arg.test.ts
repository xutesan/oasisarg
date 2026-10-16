import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { THEMES } from "../../components/terminal/themes";
import { rateLimit } from "./rate-limit";
import { buildIndex, buildLogins, cache, find, findLogin, normalise } from "./unlock";
import { POST } from "../../app/api/unlock/route";
import { MAX_PHRASE_LENGTH } from "../../components/terminal/config";

const entry = (id: string, phrase: string) => ({
    id,
    phrase,
    kind: "result" as const,
    title: id,
    body: "",
    link: null,
    theme: null,
    copy: null,
});

test("normalise ignores case, spacing, punctuation and accents", () => {
    assert.equal(normalise("  Example-Password! "), "example password");
    assert.equal(normalise("Café"), "cafe");
    assert.equal(normalise("Ørun"), "ørun");
    assert.equal(normalise("Москва"), "москва");
});

test("buildIndex finds entries by a sloppy version of their phrase", () => {
    const index = buildIndex([entry("a", "Night Shift"), entry("a", "other one"), entry("b", "second")]);
    assert.equal(find(index, " NIGHT-shift!! ")?.id, "a");
    assert.equal(find(index, "Other One")?.id, "a");
    assert.equal(find(index, "second")?.id, "b");
    assert.equal(find(index, "nope"), null);
});

test("buildIndex skips bad rows instead of failing", () => {
    const index = buildIndex([entry("a", "same"), entry("b", "SAME!"), entry("c", "  ")]);
    assert.equal(index.size, 1);
    assert.equal(find(index, "same")?.id, "a");
});

test("entries never carry their phrase", () => {
    const [stored] = buildIndex([entry("a", "secret")]).values();
    assert.equal("phrase" in stored, false);
});

test("logins ignore username case but not password case", () => {
    const logins = buildLogins([{ ...entry("d", ""), username: "Director", password: "Pa55" }]);
    assert.equal(findLogin(logins, " director ", "Pa55")?.id, "d");
    assert.equal(findLogin(logins, "director", "pa55"), null);
    assert.equal(findLogin(logins, "guest", "Pa55"), null);
    assert.equal("password" in findLogin(logins, "director", "Pa55")!, false);
});

test("the db's theme check allows exactly the themes in themes.ts", () => {
    const dir = "prisma/migrations";
    const latest = readdirSync(dir)
        .filter((name) => !name.includes("."))
        .sort()
        .map((name) => readFileSync(`${dir}/${name}/migration.sql`, "utf8"))
        .findLast((sql) => sql.includes(`"entries_theme_check" CHECK`))!;
    const allowed = latest.slice(latest.indexOf(`"entries_theme_check" CHECK`)).match(/IN \(([^)]*)\)/)![1];
    assert.deepEqual([...allowed.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), Object.keys(THEMES).sort());
});

test("every theme has a test login", () => {
    const sql = readFileSync("prisma/test-logins.sql", "utf8");
    for (const id of Object.keys(THEMES)) assert.match(sql, new RegExp(`\\('${id}', 'test', 'test-${id}'\\)`), id);
});

test("cache serves the last good data while the db is down", async () => {
    let t = 0;
    let down = false;
    let loads = 0;
    const get = cache(
        async () => {
            loads++;
            if (down) throw new Error("down");
            return loads;
        },
        30,
        () => t,
    );
    assert.equal(await get(), 1);
    assert.equal(await get(), 1);
    t = 31;
    down = true;
    assert.equal(await get(), 1);
    t = 62;
    down = false;
    assert.equal(await get(), 3);
});

test("cache throws when the db was never reachable", async () => {
    const get = cache(() => Promise.reject(new Error("down")), 30);
    await assert.rejects(get(), /down/);
});

const call = (body: string) =>
    POST(new Request("http://site.test/api/unlock", { method: "POST", body, headers: { "x-real-ip": "route-test" } }));

test("unlock route turns bad input away before touching the db", async () => {
    assert.equal((await call("not json")).status, 400);
    assert.equal((await call(JSON.stringify({ phrase: "x".repeat(MAX_PHRASE_LENGTH + 1) }))).status, 400);
    assert.equal((await call(JSON.stringify({ username: "director" }))).status, 400);
    assert.equal((await call(JSON.stringify({ phrase: 5 }))).status, 400);
});

test("unlock route turns away a body that says it is huge", async () => {
    const res = await POST(
        new Request("http://site.test/api/unlock", {
            method: "POST",
            body: "{}",
            headers: { "x-real-ip": "big-body-test", "content-length": "99999" },
        }),
    );
    assert.equal(res.status, 413);
});

test("unlock route answers 503 when the db can't be reached", async () => {
    const url = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    try {
        assert.equal((await call(JSON.stringify({ phrase: "anything" }))).status, 503);
    } finally {
        process.env.DATABASE_URL = url;
    }
});

test("rateLimit blocks the 21st attempt in a minute, then lets one through after it", () => {
    const t = 1_000_000;
    for (let i = 0; i < 20; i++) assert.equal(rateLimit("test-ip", t + i).allowed, true);
    const blocked = rateLimit("test-ip", t + 20);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfter, 60);
    assert.equal(rateLimit("other-ip", t + 20).allowed, true);
    assert.equal(rateLimit("test-ip", t + 60_001).allowed, true);
});
