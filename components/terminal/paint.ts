import type { Theme, Tone } from "./themes";

export type Stage = "user" | "pass" | "in";

export type Line = { text: string; tone: Tone; href?: string };
export type Row = Line & { caret?: number };
export type LinkBox = { x: number; y: number; w: number; h: number; href: string };

export type Metrics = {
    w: number; h: number; dpr: number; font: string; charW: number; lineH: number; charRatio: number;
    padX: number; padY: number; barCols: number; cols: number; bodyRows: number; maxScroll: number;
};

// what every draw function needs. the theme is passed on its own, it changes on login
export type Paint = { c: CanvasRenderingContext2D; m: Metrics; input: HTMLInputElement; fontFamily: string };

export function drawCaret(p: Paint, theme: Theme, x: number, y: number, under: string | undefined, caretOn: boolean) {
    const { c, m } = p;
    c.fillStyle = theme.tones.text;
    if (document.activeElement !== p.input) {
        c.strokeStyle = theme.tones.text;
        c.lineWidth = 1.5;
        c.strokeRect(x + 0.75, y + 0.75, m.charW - 1.5, m.lineH - 1.5);
    } else if (caretOn) {
        c.fillRect(x, y, m.charW, m.lineH);
        if (under) {
            c.fillStyle = theme.screen;
            c.fillText(under, x, y);
        }
    }
}

// the log area, where the board goes. cells are a line tall so it moves at the same speed both ways
export function boardArea(m: Metrics) {
    return { x: m.padX, y: m.padY + m.lineH * 2, w: m.barCols * m.charW, h: m.bodyRows * m.lineH };
}

// centred lines over a game, on a cut-out so they read over the board
export function banner(p: Paint, theme: Theme, lines: string[], first: Tone) {
    const { c, m } = p;
    const area = boardArea(m);
    const mid = area.y + area.h / 2 - m.lineH;
    lines.forEach((text, i) => {
        const width = text.length * m.charW;
        const x = (m.w - width) / 2;
        c.fillStyle = theme.screen;
        c.fillRect(x - m.charW, mid + i * m.lineH, width + m.charW * 2, m.lineH);
        c.fillStyle = i ? theme.tones.text : theme.tones[first];
        c.fillText(text, x, mid + i * m.lineH);
    });
}
