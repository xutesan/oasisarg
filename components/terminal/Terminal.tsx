"use client";

import { useEffect, useRef, useState } from "react";
import type { UnlockedEntry } from "@/lib/arg/unlock";
import { askServer, entryLines, type ApiResponse } from "./session";
import { MAX_COLUMNS, MAX_PHRASE_LENGTH, TYPE_SPEED } from "./config";
import { createCrt, warp } from "./crt";
import { drawLock } from "./draw-lock";
import { drawTerminal } from "./draw-terminal";
import { boardArea, type LinkBox, type Line, type Metrics, type Paint, type Row, type Stage } from "./paint";
import { DEFAULT_THEME, THEMES, isThemeId, type Theme, type ThemeId, type Tone } from "./themes";
import { NO_FX, POWER, clamp, mergeCopy, powerFx, wrapText, type Fx } from "./util";
import { MIN_SIZE, newGame, step, tickMs, turn, type Dir, type Game } from "./snake";

// wasd and arrows
const SNAKE_KEYS: Record<string, Dir> = {
    ArrowUp: "up", w: "up", ArrowDown: "down", s: "down",
    ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right",
};

type Logged = Line & { id: number };

const MAX_LINES = 400; // scrollback, older stuff just falls off
const CARET_BLINK_MS = 530;

export default function Terminal({ fontFamily }: { fontFamily: string }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const screenRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<HTMLCanvasElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [log, setLog] = useState<Logged[]>([]);

    useEffect(() => {
        const wrap = wrapRef.current;
        const screen = screenRef.current;
        const view = viewRef.current;
        const input = inputRef.current;
        if (!wrap || !screen || !view || !input) return;

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let alive = true; // false after unmount
        let dirty = true; // redraw next frame

        const ctx = view.getContext("2d");
        if (!ctx) return;
        const crt = createCrt(view, () => {
            dirty = true;
        });

        let theme: Theme = THEMES[DEFAULT_THEME];
        let stage: Stage = "user";
        let username = "";
        let masked = "";
        let notice: { text: string; tone: Tone } | null = null;
        let power: { start: number; swap: () => void; swapped: boolean } | null = null;
        const lines: Logged[] = [];
        let lineId = 0;
        const queue: Line[] = [];
        let typing: { line: Line; shown: number } | null = null;
        let busy = false;
        let scroll = 0;
        let glitch = 0;
        let lastReply = "";
        const history: string[] = [];
        let histPos = -1;
        let links: LinkBox[] = [];
        let snake: { game: Game; acc: number } | null = null;

        // sizes, layout() refills on resize
        const m: Metrics = {
            w: 0, h: 0, dpr: 1, font: "", charW: 8, lineH: 18, charRatio: 0.5,
            padX: 20, padY: 20, barCols: 40, cols: 40, bodyRows: 10, maxScroll: 0,
        };

        const paint: Paint = { c: ctx, m, input, fontFamily };

        const publish = () => setLog(lines.slice());

        function commit(line: Line) {
            lines.push({ ...line, id: lineId++ });
            if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
            scroll = 0;
            dirty = true;
        }

        function say(text: string | string[], tone: Tone = "text", href?: string) {
            const texts = Array.isArray(text) ? text : [text];
            for (const t of texts) queue.push({ text: t, tone, href });
            // lock screen has no log, it shows the last error itself
            if (tone === "error") notice = { text: texts[0], tone };
        }

        function flush() {
            if (typing) commit(typing.line);
            typing = null;
            for (const line of queue) commit(line);
            queue.length = 0;
            publish();
        }

        const printing = () => typing !== null || queue.length > 0;

        const promptText = () =>
            stage === "user" ? theme.copy.loginUser : stage === "pass" ? theme.copy.loginPass : theme.copy.prompt;

        function setStage(next: typeof stage) {
            stage = next;
            // so screen readers and mobile keyboards treat it as a password
            input!.type = next === "pass" ? "password" : "text";
            input!.setAttribute("aria-label", next === "user" ? "Username" : next === "pass" ? "Password" : "Phrase");
            dirty = true;
        }

        function layout() {
            const rect = screen!.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            m.w = rect.width;
            m.h = rect.height;
            m.dpr = Math.min(window.devicePixelRatio || 1, 2);
            const fontPx = clamp(Math.round(m.w / 36), 18, 30);
            m.font = `${fontPx}px ${fontFamily}`;
            m.lineH = Math.round(fontPx * 1.12);
            m.padX = Math.round(Math.max(18, m.w * 0.055));
            m.padY = Math.round(Math.max(20, m.h * 0.06));

            view!.width = Math.round(m.w * m.dpr);
            view!.height = Math.round(m.h * m.dpr);
            ctx!.font = m.font;
            m.charW = ctx!.measureText("M").width || fontPx * 0.5;
            m.charRatio = m.charW / fontPx;
            m.barCols = Math.max(10, Math.floor((m.w - m.padX * 2) / m.charW));
            m.cols = Math.min(m.barCols, MAX_COLUMNS);
            const rows = Math.floor((m.h - m.padY * 2) / m.lineH);
            m.bodyRows = Math.max(1, rows - 4);
            dirty = true;
        }

        const wrapped = new WeakMap<Logged, { cols: number; rows: Row[] }>();

        function rowsOf(line: Line): Row[] {
            return wrapText(line.text, m.cols).map((text) => ({ ...line, text }));
        }

        function buildRows(): Row[] {
            const rows: Row[] = [];
            for (const line of lines) {
                let hit = wrapped.get(line);
                if (hit?.cols !== m.cols) {
                    hit = { cols: m.cols, rows: rowsOf(line) };
                    wrapped.set(line, hit);
                }
                rows.push(...hit.rows);
            }
            if (typing) rows.push(...rowsOf({ ...typing.line, text: typing.line.text.slice(0, Math.floor(typing.shown)) }));

            if (!busy && !printing()) {
                // prompt wraps by char not word, otherwise the caret position gets painful
                const prompt = promptText();
                const value = stage === "pass" ? "*".repeat(input!.value.length) : input!.value;
                const full = prompt + value;
                const caret = prompt.length + (input!.selectionStart ?? value.length);
                const count = Math.max(1, Math.ceil((Math.max(full.length, caret) + 1) / m.cols));
                for (let i = 0; i < count; i++) {
                    const from = i * m.cols;
                    const row: Row = { text: full.slice(from, from + m.cols), tone: "text" };
                    if (caret >= from && caret < from + m.cols) row.caret = caret - from;
                    rows.push(row);
                }
            }
            return rows;
        }

        // squash is for the power cycle
        function draw(caretOn: boolean, angle: number, fx: Fx) {
            const c = ctx!;
            const { w, h, dpr } = m;
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.fillStyle = "#000";
            c.fillRect(0, 0, w, h);
            links = [];
            if (!fx.sx) return;
            c.setTransform(dpr * fx.sx, 0, 0, dpr * fx.sy, (dpr * w * (1 - fx.sx)) / 2, (dpr * h * (1 - fx.sy)) / 2);
            c.fillStyle = theme.screen;
            c.fillRect(0, 0, w, h);
            if (stage === "in") {
                const out = drawTerminal(paint, theme, {
                    rows: snake ? [] : buildRows(),
                    scroll,
                    caretOn,
                    angle,
                    busy,
                    powering: !!power,
                    snake: snake?.game ?? null,
                });
                scroll = out.scroll;
                links = out.links;
            } else {
                drawLock(paint, theme, { stage, username, masked, busy, powering: !!power, notice, caretOn });
            }
            if (fx.flash) {
                c.fillStyle = `rgba(255, 255, 255, ${fx.flash})`;
                c.fillRect(0, 0, w, h);
            }
        }

        function startSnake() {
            const area = boardArea(m);
            const cols = Math.floor(area.w / m.lineH);
            const rows = Math.floor(area.h / m.lineH);
            if (cols < MIN_SIZE || rows < MIN_SIZE) return say([theme.copy.snakeTooSmall, ""], "error");
            snake = { game: newGame(cols, rows), acc: 0 };
            say([theme.copy.snakeStart, ""]);
            dirty = true;
        }

        function endSnake() {
            if (!snake) return;
            // a crash already printed the score
            say(snake.game.over ? "" : [`Final score: ${snake.game.score}`, ""]);
            snake = null;
            input!.value = "";
            dirty = true;
        }

        // null means it already printed the error
        async function post(body: object): Promise<ApiResponse | null> {
            busy = true;
            dirty = true;
            const out = await askServer(body, theme.copy);
            busy = false;
            dirty = true;
            if (!alive) return null;
            if ("error" in out) {
                say([out.error, ""], "error");
                return null;
            }
            return out.reply;
        }

        async function submitLogin(raw: string) {
            commit({ text: promptText() + (stage === "pass" ? "*".repeat(raw.length) : raw), tone: "dim" });
            publish();
            notice = null;
            if (stage === "user") {
                username = raw;
                if (raw.trim()) setStage("pass");
                return;
            }
            masked = "*".repeat(raw.length);
            const reply = await post({ username, password: raw });
            if (!reply?.ok) {
                // null = post() already printed why
                if (reply) {
                    say([theme.copy.loginFailed, ""], "error");
                    if (!reduced) glitch = 0.45;
                }
                return setStage("user");
            }
            say([theme.copy.loginOk, ""], "result");
            notice = { text: theme.copy.loginOk, tone: "result" };
            const { entry } = reply;
            powerCycle(() => {
                setStage("in");
                switchTheme(isThemeId(entry.theme) ? entry.theme : DEFAULT_THEME, entry);
            });
        }

        // wipe everything so the next login can't scroll or arrow-up into the last one
        function logOut() {
            theme = THEMES[DEFAULT_THEME];
            queue.length = 0;
            typing = null;
            lines.length = 0;
            scroll = 0;
            history.length = 0;
            histPos = -1;
            lastReply = "";
            username = "";
            notice = null;
            setStage("user");
            say(theme.copy.loginBoot);
            if (!reduced) glitch = 0.8;
            publish();
        }

        function powerCycle(swap: () => void) {
            if (reduced) return swap();
            // busy so nothing gets typed mid-animation
            busy = true;
            power = { start: performance.now(), swap, swapped: false };
        }

        async function submit(raw: string) {
            if (stage !== "in") return submitLogin(raw);
            commit({ text: theme.copy.prompt + raw, tone: "dim" });
            publish();
            const value = raw.trim();
            if (!value) return;
            if (history[0] !== raw) history.unshift(raw);
            histPos = -1;

            // these never hit the api, keep them out of the db phrases
            const cmd = value.toLowerCase();
            if (cmd === "help") return say(theme.copy.help);
            if (cmd === "snake") return startSnake();
            if (cmd === "logout") {
                say([theme.copy.loggedOut, ""]);
                return powerCycle(logOut);
            }
            if (cmd === "clear") {
                lines.length = 0;
                dirty = true;
                return publish();
            }
            if (cmd === "copy") {
                if (!lastReply) return say([theme.copy.nothingToCopy, ""]);
                try {
                    await navigator.clipboard.writeText(lastReply);
                    return say([theme.copy.copied, ""]);
                } catch {
                    return say([theme.copy.copyBlocked, ""], "error");
                }
            }

            const reply = await post({ phrase: raw });
            if (!reply) return;
            if (!reply.ok) {
                say([theme.copy.noMatch, ""], "error");
                if (!reduced) glitch = 0.45;
                return;
            }
            const { entry } = reply;
            if (isThemeId(entry.theme)) return switchTheme(entry.theme, entry);
            printEntry(entry);
            if (!reduced && entry.kind === "result") glitch = 1;
        }

        function printEntry(entry: UnlockedEntry) {
            queue.push(...entryLines(entry));
            lastReply = [entry.title, entry.body, entry.link].filter(Boolean).join("\n");
        }

        function switchTheme(id: ThemeId, entry: UnlockedEntry) {
            // omega's text comes from the server so it isn't in the bundle
            // (this reset is the same as logOut's, could share it)
            theme = { ...THEMES[id], copy: mergeCopy(THEMES[id].copy, entry.copy) };
            queue.length = 0;
            typing = null;
            lines.length = 0;
            scroll = 0;
            say(theme.copy.boot);
            if (entry.title || entry.body) printEntry(entry);
            if (!reduced) glitch = 1.4;
            dirty = true;
            publish();
        }

        let raf = 0;
        let last = performance.now();
        let lastVal = "";
        let lastCursor = "";
        let lastBlink = true;
        let lastSpin = -1;

        // main loop, keep in one piece, it all feeds `dirty`
        function frame(now: number) {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(now - last, 250);
            last = now;

            let budget = reduced ? Infinity : (TYPE_SPEED * dt) / 1000;
            let gotLine = false;
            while (budget > 0 && (typing || queue.length)) {
                if (!typing) typing = { line: queue.shift()!, shown: 0 };
                const left = typing.line.text.length - typing.shown;
                const chars = Math.min(left, budget);
                typing.shown += chars;
                budget -= chars;
                dirty = true;
                if (typing.shown >= typing.line.text.length) {
                    commit(typing.line);
                    typing = null;
                    gotLine = true;
                } else {
                    break;
                }
            }
            if (gotLine) publish();

            if (input!.value !== lastVal) {
                lastVal = input!.value;
                scroll = 0;
                dirty = true;
            }
            const cursor = `${input!.selectionStart}|${document.activeElement === input}`;
            if (cursor !== lastCursor) {
                lastCursor = cursor;
                dirty = true;
            }
            const caretOn = reduced || Math.floor(now / CARET_BLINK_MS) % 2 === 0;
            if (caretOn !== lastBlink) {
                lastBlink = caretOn;
                dirty = true;
            }

            const bd = theme.backdrop;
            const spinning = !reduced && stage === "in" && bd.spin !== "off";
            const spinStep = spinning ? Math.floor((now / 1000) * bd.fps) : 0;
            if (spinStep !== lastSpin) {
                lastSpin = spinStep;
                dirty = true;
            }
            const angle = (spinStep / bd.fps / bd.secondsPerTurn) * Math.PI * 2;

            if (snake && !snake.game.over) {
                snake.acc += dt;
                for (let every = tickMs(snake.game.score); snake.acc >= every; every = tickMs(snake.game.score)) {
                    snake.acc -= every;
                    step(snake.game);
                    dirty = true;
                    if (snake.game.over) {
                        // log isn't on screen mid-game, this one's for screen readers
                        say(`${theme.copy.snakeOver}. Score ${snake.game.score}.`);
                        if (!reduced) glitch = 0.6;
                        break;
                    }
                }
            }

            let fx = NO_FX;
            if (power) {
                const t = now - power.start;
                if (!power.swapped && t >= POWER.dot) {
                    power.swapped = true;
                    power.swap();
                }
                fx = powerFx(t);
                dirty = true;
                if (t >= POWER.end) {
                    power = null;
                    busy = false;
                }
            }

            if (dirty && m.w) {
                draw(caretOn, angle, fx);
                crt?.upload(view!);
                dirty = false;
            }

            glitch *= Math.exp(-dt / 140);
            if (glitch < 0.01) glitch = 0;
            crt?.render({
                time: reduced ? 0 : now / 1000,
                glitch,
                motion: reduced ? 0 : 1,
                scanlines: m.h / 3,
                dpr: m.dpr,
            });
        }

        const focusInput = () => input.focus({ preventScroll: true });

        // on window so typing still works after the input loses focus
        function onKeyDown(e: KeyboardEvent) {
            if (e.metaKey || e.ctrlKey || e.altKey || e.key === "Tab") return;
            if (document.activeElement instanceof HTMLAnchorElement) return;
            if (document.activeElement !== input) focusInput();

            if (snake) {
                e.preventDefault();
                const dir = SNAKE_KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
                if (dir) turn(snake.game, dir);
                else if (e.key === "Escape" || e.key.toLowerCase() === "q") endSnake();
                else if (e.key === "Enter" && snake.game.over) startSnake();
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();
                const skipped = printing();
                if (skipped) flush();
                if (busy) return;
                const value = input!.value;
                if (skipped && !value) return;
                input!.value = "";
                void submit(value);
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                if (!history.length) return;
                histPos = clamp(histPos + (e.key === "ArrowUp" ? 1 : -1), -1, history.length - 1);
                input!.value = histPos === -1 ? "" : history[histPos];
                input!.setSelectionRange(input!.value.length, input!.value.length);
            } else if (e.key === "PageUp" || e.key === "PageDown") {
                e.preventDefault();
                const page = Math.max(1, m.bodyRows - 1);
                scroll = clamp(scroll + (e.key === "PageUp" ? page : -page), 0, m.maxScroll);
                dirty = true;
            }
        }

        // pointer -> canvas coords, undoing the shader's screen curve
        function toCanvas(clientX: number, clientY: number): [number, number] {
            const rect = screen!.getBoundingClientRect();
            let u = (clientX - rect.left) / rect.width;
            let v = (clientY - rect.top) / rect.height;
            if (crt) [u, v] = warp(u, v);
            return [u * m.w, v * m.h];
        }

        function linkAt(clientX: number, clientY: number): LinkBox | null {
            const [x, y] = toCanvas(clientX, clientY);
            return links.find((l) => x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) ?? null;
        }

        let drag: { x: number; y: number; scroll: number; moved: boolean } | null = null;

        function onPointerDown(e: PointerEvent) {
            drag = { x: e.clientX, y: e.clientY, scroll, moved: false };
        }


        // clicking the screen shouldn't steal focus from the input
        const keepFocus = (e: MouseEvent) => e.preventDefault();
        function onPointerMove(e: PointerEvent) {
            if (drag && !snake && (e.pointerType !== "mouse" || e.buttons === 1)) {
                const dy = e.clientY - drag.y;
                if (Math.abs(dy) > 8) drag.moved = true;
                if (drag.moved) {
                    scroll = clamp(drag.scroll + Math.round(dy / m.lineH), 0, m.maxScroll);
                    dirty = true;
                }
            }
            wrap!.style.cursor = linkAt(e.clientX, e.clientY) ? "pointer" : "text";
        }
        function onPointerUp(e: PointerEvent) {
            const start = drag;
            const wasDrag = drag?.moved;
            drag = null;
            if (snake && start) {
                // swipe to steer, tap to restart. 20px felt right on my phone
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;
                if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
                    turn(snake.game, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
                } else if (snake.game.over) {
                    startSnake();
                }
                return focusInput();
            }
            if (wasDrag) return;
            const link = linkAt(e.clientX, e.clientY);
            if (link) window.open(link.href, "_blank", "noopener,noreferrer");
            else focusInput();
        }

        let wheelPx = 0; // trackpads send tiny deltas, add up to a row
        function onWheel(e: WheelEvent) {
            e.preventDefault();
            // firefox gives lines (deltaMode 1), the rest pixels
            wheelPx += e.deltaMode === 1 ? e.deltaY * m.lineH : e.deltaY;
            const rows = Math.trunc(wheelPx / m.lineH);
            if (!rows) return;
            wheelPx -= rows * m.lineH;
            scroll = clamp(scroll - rows, 0, m.maxScroll);
            dirty = true;
        }

        const vv = window.visualViewport;
        function fitViewport() {
            if (!vv) return;
            wrap!.style.height = `${vv.height}px`;
            wrap!.style.top = `${vv.offsetTop}px`;
        }

        const observer = new ResizeObserver(layout);
        observer.observe(screen);
        window.addEventListener("keydown", onKeyDown);
        wrap.addEventListener("mousedown", keepFocus);
        wrap.addEventListener("pointerdown", onPointerDown);
        wrap.addEventListener("pointermove", onPointerMove);
        wrap.addEventListener("pointerup", onPointerUp);
        wrap.addEventListener("wheel", onWheel, { passive: false });
        vv?.addEventListener("resize", fitViewport);
        vv?.addEventListener("scroll", fitViewport);

        fitViewport();
        layout();
        // VT323 arrives late, measure again once it's in
        document.fonts
            ?.load(`20px ${fontFamily}`)
            .then(() => alive && layout())
            .catch(() => {}); // font failing to load isn't worth caring about

        say(theme.copy.loginBoot);
        setStage("user");
        if (!reduced) glitch = 0.8;
        focusInput();
        raf = requestAnimationFrame(frame);

        return () => {
            alive = false;
            cancelAnimationFrame(raf);
            observer.disconnect();
            window.removeEventListener("keydown", onKeyDown);
            wrap.removeEventListener("mousedown", keepFocus);
            wrap.removeEventListener("pointerdown", onPointerDown);
            wrap.removeEventListener("pointermove", onPointerMove);
            wrap.removeEventListener("pointerup", onPointerUp);
            wrap.removeEventListener("wheel", onWheel);
            vv?.removeEventListener("resize", fitViewport);
            vv?.removeEventListener("scroll", fitViewport);
            crt?.dispose();
        };
    }, [fontFamily]);

    return (
        <div
            ref={wrapRef}
            className="fixed inset-x-0 top-0 flex h-dvh cursor-text touch-none select-none items-center justify-center overflow-hidden bg-black [container-type:size]"
        >
            {/* 4:3 like a crt in landscape, the biggest that fits. portrait phones keep the whole screen */}
            <div
                ref={screenRef}
                className="relative h-full w-full landscape:aspect-[4/3] landscape:h-auto landscape:w-[min(100cqw,calc(100cqh*4/3))]"
            >
                <canvas ref={viewRef} aria-hidden="true" className="block h-full w-full" />
            </div>

            {/* 16px or iOS zooms in on focus */}
            <input
                ref={inputRef}
                type="text"
                aria-label="Phrase"
                maxLength={MAX_PHRASE_LENGTH}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
                className="pointer-events-none absolute bottom-0 left-0 h-10 w-full text-[16px] opacity-0"
            />

            <div className="sr-only" role="log" aria-live="polite">
                {/* stable keys, or the live region re-reads everything once old lines start dropping */}
                {log.map((line) => (
                    <p key={line.id}>
                        {line.href ? (
                            <a href={line.href} target="_blank" rel="noopener noreferrer">
                                {line.text}
                            </a>
                        ) : (
                            line.text
                        )}
                    </p>
                ))}
            </div>
        </div>
    );
}