export type Dir = "up" | "down" | "left" | "right";
type Cell = [number, number];

export type Game = {
    cols: number;
    rows: number;
    body: Cell[]; // head first
    dir: Dir;
    queued: Dir[];
    food: Cell;
    score: number;
    over: boolean;
};

const STEP_BY: Record<Dir, Cell> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export const MIN_SIZE = 6;

// gets faster as you eat, floor of 90ms or it's unplayable
export const tickMs = (score: number) => Math.max(90, 150 - score * 1.5);

export function newGame(cols: number, rows: number, rand = Math.random): Game {
    const x = Math.floor(cols / 2);
    const y = Math.floor(rows / 2);
    const game: Game = {
        cols,
        rows,
        body: [[x, y], [x - 1, y], [x - 2, y]],
        dir: "right",
        queued: [],
        food: [0, 0],
        score: 0,
        over: false,
    };
    game.food = placeFood(game, rand)!; // board is always bigger than 3 cells here
    return game;
}

// queued so two quick presses inside one tick both count, but never a u-turn into yourself
export function turn(game: Game, dir: Dir) {
    const last = game.queued.at(-1) ?? game.dir;
    if (dir !== last && dir !== OPP[last] && game.queued.length < 3) game.queued.push(dir);
}

export function step(game: Game, rand = Math.random) {
    if (game.over) return;
    game.dir = game.queued.shift() ?? game.dir;
    const [dx, dy] = STEP_BY[game.dir];
    const head: Cell = [game.body[0][0] + dx, game.body[0][1] + dy];
    const ate = head[0] === game.food[0] && head[1] === game.food[1];
    // the tail moves out of the way this tick, unless it's growing
    const body = ate ? game.body : game.body.slice(0, -1);
    const outside = head[0] < 0 || head[1] < 0 || head[0] >= game.cols || head[1] >= game.rows;
    if (outside || body.some(([x, y]) => x === head[0] && y === head[1])) {
        game.over = true;
        return;
    }
    game.body = [head, ...body];
    if (!ate) return;
    game.score++;
    const food = placeFood(game, rand);
    if (food) game.food = food;
    else game.over = true; // filled the board, nothing left to eat
}

// picks from the free cells, so it can't land on the snake
function placeFood(game: Game, rand: () => number): Cell | undefined {
    const taken = new Set(game.body.map(([x, y]) => y * game.cols + x));
    const free: Cell[] = [];
    for (let y = 0; y < game.rows; y++) {
        for (let x = 0; x < game.cols; x++) if (!taken.has(y * game.cols + x)) free.push([x, y]);
    }
    return free[Math.floor(rand() * free.length)];
}
