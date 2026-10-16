
// dark to bright, halve() uses the index as brightness
const RAMP = " .:-=+*#%@";

export type Art = { rows: string[]; cols: number };

// pad every row to the same width
function toArt(lines: string[]): Art {
    const cols = Math.max(1, ...lines.map((l) => l.length));
    return { rows: lines.map((l) => l.padEnd(cols, " ")), cols };
}

function parseArt(source: string): Art {
    const lines = source.split("\n").map((l) => l.trimEnd());
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    if (!lines.length) return toArt([" "]);
    const indent = Math.min(...lines.filter(Boolean).map((l) => l.length - l.trimStart().length));
    return toArt(lines.map((l) => l.slice(indent)));
}

// 2x2 -> 1 char, average of the ramp index
function halve(art: Art): Art {
    const lines: string[] = [];
    for (let y = 0; y < art.rows.length; y += 2) {
        let line = "";
        for (let x = 0; x < art.cols; x += 2) {
            let total = 0;
            for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                total += Math.max(0, RAMP.indexOf(art.rows[y + dy]?.[x + dx] ?? " "));
            }
            line += RAMP[Math.round(total / 4)];
        }
        lines.push(line);
    }
    return toArt(lines);
}

export type Emblem = { full: Art; small: Art };

export function makeEmblem(source: string): Emblem {
    const full = parseArt(source);
    return { full, small: halve(full) };
}

export type SpinMode = "coin" | "wheel" | "off";

type RenderOptions = {
    mode: SpinMode;
    cellAspect: number;
    tilt: number;
    perspective: number;
    thickness: number;
};

const SHADES = 5;

type Frame = {
    cols: number;
    rows: number;
    shades: string[][];
};

const SLICES = 9; // more = smoother rim, slower. 9 is plenty
const LIGHT: [number, number, number] = [3, -2.6, 5];

const grids = new WeakMap<Art, Uint8Array>();
function gridOf(art: Art): Uint8Array {
    let grid = grids.get(art);
    if (!grid) {
        grid = new Uint8Array(art.cols * art.rows.length);
        art.rows.forEach((row, y) => {
            for (let x = 0; x < art.cols; x++) grid![y * art.cols + x] = row.charCodeAt(x) || 32;
        });
        grids.set(art, grid);
    }
    return grid;
}

const SPACE = 32; // char code, skipped when casting rays

// raycast through a stack of slices, first hit wins. front slice = lit face, deeper = rim
export function renderEmblem(art: Art, angle: number, o: RenderOptions): Frame {
    const grid = gridOf(art);
    const artCols = art.cols;
    const artRows = art.rows.length;
    const d = Math.max(1.6, o.perspective);
    const grow = Math.min(d / (d - 1), 1.45);
    const cols = Math.round(artCols * grow);
    const rows = Math.round(artRows * grow);
    const unit = (artCols - 1) / 2;
    const unitY = unit / o.cellAspect;
    const outCx = (cols - 1) / 2;
    const outCy = (rows - 1) / 2;
    const artCx = (artCols - 1) / 2;
    const artCy = (artRows - 1) / 2;

    const spin = o.mode === "off" ? 0 : angle;
    const wheel = o.mode === "wheel";
    const tilt = (o.tilt * Math.PI) / 180;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const ca = Math.cos(spin);
    const sa = Math.sin(spin);

    const toObject = (x: number, y: number, z: number): [number, number, number] => {
        const y1 = y * ct + z * st;
        const z1 = -y * st + z * ct;
        return wheel
            ? [x * ca + y1 * sa, -x * sa + y1 * ca, z1]
            : [x * ca - z1 * sa, y1, x * sa + z1 * ca];
    };
    const [ax, ay, az] = toObject(1, 0, 0);
    const [bx, by, bz] = toObject(0, 1, 0);
    const [camX, camY, camZ] = toObject(0, 0, d);

    const n0x = wheel ? 0 : sa;
    const n0y = wheel ? -st : -ca * st;
    const n0z = wheel ? ct : ca * ct;

    const slices = o.thickness > 0 ? SLICES : 1;
    const depth: number[] = [];
    for (let k = 0; k < slices; k++) {
        depth.push(slices === 1 ? 0 : o.thickness * (k / (slices - 1) - 0.5));
    }

    const lines: string[][] = Array.from({ length: SHADES }, () => []);
    const buffers = Array.from({ length: SHADES }, () => new Uint8Array(cols));
    const toText = (codes: Uint8Array) =>
        String.fromCharCode.apply(null, codes as unknown as number[]).trimEnd();

    for (let y = 0; y < rows; y++) {
        for (const buffer of buffers) buffer.fill(SPACE);
        const sy = (y - outCy) / unitY;
        const rowX = sy * bx - camX;
        const rowY = sy * by - camY;
        const rowZ = sy * bz - camZ;

        for (let x = 0; x < cols; x++) {
            const sx = (x - outCx) / unit;
            const dx = rowX + sx * ax;
            const dy = rowY + sx * ay;
            const dz = rowZ + sx * az;
            if (dz > -1e-6 && dz < 1e-6) continue;

            const fromFront = dz < 0;
            for (let i = 0; i < slices; i++) {
                const s = (depth[fromFront ? slices - 1 - i : i] - camZ) / dz;
                if (s <= 0) continue;
                const col = Math.round((camX + s * dx) * unit + artCx);
                if (col < 0 || col >= artCols) continue;
                const row = Math.round((camY + s * dy) * unitY + artCy);
                if (row < 0 || row >= artRows) continue;
                const code = grid[row * artCols + col];
                if (code === SPACE) continue;

                let shade = 0;
                if (i === 0) {
                    const px = s * sx;
                    const py = s * sy;
                    const pz = d - s * d;
                    const flip = fromFront ? 1 : -1;
                    const nx = n0x * flip;
                    const ny = n0y * flip;
                    const nz = n0z * flip;
                    let lx = LIGHT[0] - px;
                    let ly = LIGHT[1] - py;
                    let lz = LIGHT[2] - pz;
                    const ll = Math.hypot(lx, ly, lz);
                    lx /= ll;
                    ly /= ll;
                    lz /= ll;
                    let vx = -px;
                    let vy = -py;
                    let vz = d - pz;
                    const vl = Math.hypot(vx, vy, vz);
                    vx /= vl;
                    vy /= vl;
                    vz /= vl;
                    const hl = Math.hypot(lx + vx, ly + vy, lz + vz) || 1;
                    const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
                    const half = Math.max(0, (nx * (lx + vx) + ny * (ly + vy) + nz * (lz + vz)) / hl);
                    // + 0.3 * pz: nearer side is brighter, sells the depth
                    const light = 0.34 + 0.5 * diffuse + 0.3 * pz + 0.8 * half ** 90;
                    shade = light < 0.42 ? 1 : light < 0.7 ? 2 : light < 1.08 ? 3 : 4;
                }
                buffers[shade][x] = code;
                break;
            }
        }

        for (let n = 0; n < SHADES; n++) lines[n].push(toText(buffers[n]));
    }

    return { cols, rows, shades: lines };
}