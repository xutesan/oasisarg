import { banner, boardArea, type Paint } from "./paint";
import type { Game } from "./snake";
import type { Theme } from "./themes";

export function drawSnake(p: Paint, theme: Theme, game: Game) {
    const { c, m } = p;
    const tones = theme.tones;
    const area = boardArea(m);
    // fits again if the window is resized mid-game
    const cell = Math.min(area.w / game.cols, area.h / game.rows);
    const x0 = area.x + (area.w - cell * game.cols) / 2;
    const y0 = area.y + (area.h - cell * game.rows) / 2;
    c.strokeStyle = tones.dim;
    c.lineWidth = 1.5;
    c.strokeRect(x0 - 3, y0 - 3, cell * game.cols + 6, cell * game.rows + 6);
    const fill = ([x, y]: [number, number], color: string, inset: number) => {
        c.fillStyle = color;
        c.fillRect(x0 + x * cell + inset, y0 + y * cell + inset, cell - inset * 2, cell - inset * 2);
    };
    fill(game.food, tones.hint, cell * 0.22);
    game.body.forEach((part, i) => fill(part, i ? tones.text : tones.result, 1));
    if (game.over) {
        banner(p, theme, [theme.copy.snakeOver, `Score ${game.score}. Enter or tap to play again, Esc to quit.`], "error");
    }
}
