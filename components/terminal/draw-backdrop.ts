import { renderEmblem, type Art } from "./emblem";
import type { Paint } from "./paint";
import type { Theme } from "./themes";

// the angle only steps at backdrop.fps but redraws run at 60fps while text types, so reuse the last frame
let cached: { art: Art; angle: number; backdrop: Theme["backdrop"]; frame: ReturnType<typeof renderEmblem> } | null = null;

export function drawBackdrop(p: Paint, theme: Theme, angle: number, top: number, bottom: number) {
    const { c, m } = p;
    const bd = theme.backdrop;
    const fit = (art: Art) => {
        const tall = (art.rows.length * bd.cellAspect) / art.cols;
        const width = Math.min(m.w - m.padX * 2, (bottom - top) / tall) * bd.size;
        return { art, cellW: width / art.cols };
    };
    let { art, cellW } = fit(bd.emblem.full);
    // ~2px per char is where the full art turns to mush, fall back to the small one
    if (cellW * m.dpr < 2.2) ({ art, cellW } = fit(bd.emblem.small));
    const cellH = cellW * bd.cellAspect;

    if (cached?.art !== art || cached.angle !== angle || cached.backdrop !== bd) {
        const frame = renderEmblem(art, angle, {
            mode: bd.spin,
            cellAspect: bd.cellAspect,
            tilt: bd.tilt,
            perspective: bd.perspective,
            thickness: bd.thickness,
        });
        cached = { art, angle, backdrop: bd, frame };
    }
    const { frame } = cached;
    const x = (m.w - frame.cols * cellW) / 2;
    const y = (top + bottom) / 2 - (frame.rows * cellH) / 2;

    c.save();
    c.beginPath();
    c.rect(0, top, m.w, bottom - top);
    c.clip();
    c.font = `${cellW / m.charRatio}px ${p.fontFamily}`;
    c.textBaseline = "middle";
    frame.shades.forEach((rows, shade) => {
        c.fillStyle = bd.shades[shade] ?? bd.shades[0];
        rows.forEach((row, i) => {
            if (row) c.fillText(row, x, y + (i + 0.5) * cellH);
        });
    });
    c.restore();
}
