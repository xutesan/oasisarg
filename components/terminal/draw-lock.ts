import { drawBackdrop } from "./draw-backdrop";
import { drawCaret, type Paint, type Stage } from "./paint";
import type { Theme, Tone } from "./themes";
import { wrapText } from "./util";

export type LockState = {
    stage: Stage;
    username: string;
    masked: string; // the password as stars, kept after submit so it stays on screen
    busy: boolean;
    powering: boolean;
    notice: { text: string; tone: Tone } | null;
    caretOn: boolean;
};

// centered: emblem on top, heading, the two fields, then whatever happened last
export function drawLock(p: Paint, theme: Theme, s: LockState) {
    const { c, m, input } = p;
    const { w, h, charW, lineH, padY } = m;
    const tones = theme.tones;
    const heading = theme.copy.loginBoot.flatMap((t) => wrapText(t, m.cols));
    const fieldCols = Math.min(m.cols, 32);
    const fieldX = (w - fieldCols * charW) / 2;
    const textTop = Math.max(padY, h - padY - (heading.length + 6) * lineH);
    if (textTop - padY > lineH * 4) drawBackdrop(p, theme, 0, padY, textTop - lineH);

    c.font = m.font;
    c.textBaseline = "top";
    const centered = (text: string, y: number, tone: Tone) => {
        c.fillStyle = tones[tone];
        c.fillText(text, (w - text.length * charW) / 2, y);
    };
    heading.forEach((t, i) => centered(t, textTop + i * lineH, i ? "dim" : "text"));

    const editing = !s.busy;
    // long input scrolls sideways inside the field instead of growing it
    const field = (prompt: string, value: string, y: number, caret: number | null) => {
        const full = prompt + value;
        const from = caret === null ? 0 : Math.max(0, caret + 1 - fieldCols);
        const text = full.slice(from, from + fieldCols);
        c.fillStyle = tones.text;
        c.fillText(text, fieldX, y);
        if (caret !== null) drawCaret(p, theme, fieldX + (caret - from) * charW, y, text[caret - from], s.caretOn);
    };
    const at = (prompt: string) => prompt.length + (input.selectionStart ?? input.value.length);
    let y = textTop + (heading.length + 1) * lineH;
    const user = theme.copy.loginUser;
    if (s.stage === "user") field(user, input.value, y, editing ? at(user) : null);
    else field(user, s.username, y, null);
    y += lineH;
    const pass = theme.copy.loginPass;
    if (s.stage === "pass") {
        field(pass, editing ? "*".repeat(input.value.length) : s.masked, y, editing ? at(pass) : null);
    }
    y += lineH * 2;
    if (s.busy && !s.powering) centered(theme.copy.statusBusy, y, "dim");
    else if (s.notice) centered(s.notice.text, y, s.notice.tone);
    centered(theme.copy.loginHint, h - padY - lineH, "dim");
}
