import assert from "node:assert/strict";
import { test } from "node:test";
import { THEMES } from "./themes";
import { NO_FX, POWER, mergeCopy, powerFx, safeHref, wrapText } from "./util";

test("safeHref only lets http and https links through", () => {
    (globalThis as unknown as { window: unknown }).window = { location: { href: "https://site.test/" } };
    assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
    assert.equal(safeHref("/next"), "https://site.test/next");
    assert.equal(safeHref("javascript:alert(1)"), null);
    assert.equal(safeHref(" JavaScript:alert(1)"), null);
    assert.equal(safeHref("data:text/html,<script>alert(1)</script>"), null);
});

test("wrapText breaks on spaces, chops long words, keeps blank lines", () => {
    assert.deepEqual(wrapText("aaa bbb ccc", 7), ["aaa bbb", "ccc"]);
    assert.deepEqual(wrapText("aaa bbb", 7), ["aaa bbb"]); // exactly the width, no extra line
    assert.deepEqual(wrapText("abcdefghij", 4), ["abcd", "efgh", "ij"]);
    assert.deepEqual(wrapText("one\n\ntwo", 10), ["one", "", "two"]);
    assert.deepEqual(wrapText("", 10), [""]);
});

test("mergeCopy keeps db values that fit the theme and drops the rest", () => {
    const base = THEMES.scipnet.copy;
    const out = mergeCopy(base, { title: null, rateLimited: "x", boot: [1], help: ["ok"], prompt: "$ ", nope: "x" });
    assert.equal(out.title, base.title);
    assert.equal(out.rateLimited, base.rateLimited);
    assert.deepEqual(out.boot, base.boot);
    assert.deepEqual(out.help, ["ok"]);
    assert.equal(out.prompt, "$ ");
    assert.equal("nope" in out, false);
    assert.equal(mergeCopy(base, null), base);
});

test("powerFx starts and ends on the full screen, dark in the middle", () => {
    assert.deepEqual(powerFx(0), NO_FX);
    assert.deepEqual(powerFx(POWER.end), NO_FX);
    assert.equal(powerFx((POWER.dot + POWER.dark) / 2).sx, 0);
});
