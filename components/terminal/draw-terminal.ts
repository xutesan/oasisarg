import { drawBackdrop } from "./draw-backdrop";
import { drawSnake } from "./draw-snake";
import { drawCaret, type LinkBox, type Paint, type Row } from "./paint";
import type { Game } from "./snake";
import type { Theme } from "./themes";
import { clamp } from "./util";

export type TerminalState = {
    rows: Row[]; // empty during a game, nothing reads them
    scroll: number;
    caretOn: boolean;
    angle: number;
    busy: boolean;
    powering: boolean;
    snake: Game | null;
};

// returns the scroll after clamping, and where the links ended up for hit testing
export function drawTerminal(p: Paint, theme: Theme, s: TerminalState): { scroll: number; links: LinkBox[] } {
    const { c, m } = p;
    const { charW, lineH, padX, padY, barCols } = m;
    const tones = theme.tones;
    const links: LinkBox[] = [];
    const footerY = padY + lineH * (m.bodyRows + 3);
    drawBackdrop(p, theme, s.angle, padY + lineH, footerY);
    c.font = m.font;
    c.textBaseline = "top";

    const bar = (y: number, left: string, right = "") => {
        c.fillStyle = tones.text;
        c.fillRect(padX - charW * 0.5, y, barCols * charW + charW, lineH);
        c.fillStyle = theme.screen;
        const room = barCols - (right ? right.length + 2 : 0);
        c.fillText(left.slice(0, Math.max(0, room)), padX, y);
        if (right) c.fillText(right, padX + (barCols - right.length) * charW, y);
    };

    let status = s.busy && !s.powering ? theme.copy.statusBusy : theme.copy.statusReady;
    if (s.snake) status = `SCORE ${s.snake.score}`;
    bar(padY, theme.copy.title, status);
    if (s.snake) {
        drawSnake(p, theme, s.snake);
        bar(footerY, theme.copy.snakeHint);
        return { scroll: s.scroll, links };
    }

    m.maxScroll = Math.max(0, s.rows.length - m.bodyRows);
    const scroll = clamp(s.scroll, 0, m.maxScroll);
    const start = Math.max(0, s.rows.length - m.bodyRows - scroll);
    const top = padY + lineH * 2;

    s.rows.slice(start, start + m.bodyRows).forEach((row, i) => {
        const y = top + i * lineH;
        c.fillStyle = tones[row.tone];
        c.fillText(row.text, padX, y);

        if (row.href && row.text) {
            const width = row.text.length * charW;
            c.fillRect(padX, y + lineH - 3, width, 1.5);
            links.push({ x: padX, y, w: width, h: lineH, href: row.href });
        }

        if (row.caret !== undefined) drawCaret(p, theme, padX + row.caret * charW, y, row.text[row.caret], s.caretOn);
    });

    const hint =
        scroll > 0
            ? theme.copy.hintScrolled
            : theme.copy.hint.length <= barCols
                ? theme.copy.hint
                : theme.copy.hintShort;
    bar(footerY, hint);
    return { scroll, links };
}
