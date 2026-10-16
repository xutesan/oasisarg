import {
    CanvasTexture,
    LinearFilter,
    Mesh,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    Vector2,
    WebGLRenderer,
    WebGLRenderTarget,
} from "three";

// barrel distortion, tweaked by eye. warp() below and the shader both use it
const CURVE: [number, number] = [0.035, 0.05];

export function warp(u: number, v: number): [number, number] {
    const cx = u * 2 - 1;
    const cy = v * 2 - 1;
    return [
        cx * (1 + CURVE[0] * cy * cy) * 0.5 + 0.5,
        cy * (1 + CURVE[1] * cx * cx) * 0.5 + 0.5,
    ];
}

type CrtParams = {
    time: number;
    glitch: number;
    motion: number;
    scanlines: number;
    dpr: number;
};

export type Crt = {
    upload(source: HTMLCanvasElement): void;
    render(params: CrtParams): void;
    dispose(): void;
};

// TODO: the magic numbers in here are all "looked right on my monitor", maybe expose a few as uniforms
const VERT = `
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = `
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uCurve;
uniform float uTime;
uniform float uGlitch;
uniform float uMotion;
uniform float uScan;
uniform float uDpr;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// uTex is the afterglow target, stored bottom row first
vec3 tex(vec2 uv) {
  return texture2D(uTex, vec2(uv.x, 1.0 - uv.y)).rgb;
}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  c *= 1.0 + uCurve * c.yx * c.yx;
  vec2 uv = c * 0.5 + 0.5;

  float corner = 0.07;
  float dist = length(max(abs(c) - (1.0 - corner), 0.0)) - corner;
  float inside = 1.0 - smoothstep(-0.012, 0.0, dist);

  float band = floor(uv.y * 28.0);
  float tick = floor(uTime * 24.0);
  float tear = step(0.62, hash(vec2(band, tick)));
  uv.x += (hash(vec2(band, tick + 7.0)) - 0.5) * 0.09 * uGlitch * tear;

  uv.x += (hash(vec2(floor(uv.y * uScan), floor(uTime * 60.0))) - 0.5) * 0.0007 * uMotion;

  vec2 split = (uv - 0.5) * (0.0025 + 0.012 * uGlitch);
  vec3 col = vec3(tex(uv + split).r, tex(uv).g, tex(uv - split).b);

  vec2 px = uDpr / uRes;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 d = vec2(cos(a), sin(a)) * px;
    glow += max(tex(uv + d * 2.5) - 0.3, 0.0);
    glow += max(tex(uv + d * 6.0) - 0.3, 0.0) * 0.6;
  }
  col += glow / 12.8 * 0.9;

  col *= 0.80 + 0.20 * (0.5 + 0.5 * sin(uv.y * uScan * 6.2831853));
  col *= 0.94 + 0.06 * sin(gl_FragCoord.x * 2.0943951);

  float roll = fract(uv.y * 0.9 - uTime * 0.07);
  col += col * 0.10 * smoothstep(0.92, 1.0, roll) * uMotion;

  col *= 1.0 - 0.04 * uMotion * hash(vec2(floor(uTime * 48.0), 3.0));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * (0.05 + 0.25 * uGlitch);

  vec2 v = vUv * (1.0 - vUv);
  col *= mix(0.45, 1.0, pow(clamp(v.x * v.y * 16.0, 0.0, 1.0), 0.3));

  gl_FragColor = vec4(col * inside, 1.0);
}`;

// afterglow: lit pixels appear at once, fade out over time.
// the - 0.004 stops 8-bit rounding leaving ghosts that never fade
const GLOW_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const GLOW_FRAG = `
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uKeep;
varying vec2 vUv;
void main() {
  vec3 cur = texture2D(uCur, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  vec3 prev = texture2D(uPrev, vUv).rgb;
  gl_FragColor = vec4(max(cur, prev * uKeep - 0.004), 1.0);
}`;

// glow falls to ~37% in this long
const AFTERGLOW_MS = 70;

export function createCrt(textCanvas: HTMLCanvasElement, onRestore: () => void): Crt | null {
    // own canvas, a canvas with a webgl context can't hand out a 2d one and the fallback needs it
    const canvas = document.createElement("canvas");
    let renderer: WebGLRenderer;
    try {
        // no webgl (old phone, blocked gpu) just means plain text
        renderer = new WebGLRenderer({ canvas, alpha: false, antialias: false });
    } catch (err) {
        console.error(err);
        return null;
    }

    const texture = new CanvasTexture(textCanvas);
    texture.flipY = false; // top row first, same as the 2d canvas
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;

    const makeTarget = () => new WebGLRenderTarget(1, 1, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    let read = makeTarget();
    let write = makeTarget();
    const glowMaterial = new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: {
            uCur: { value: texture },
            uPrev: { value: read.texture },
            uKeep: { value: 0 },
        },
        depthTest: false,
        depthWrite: false,
    });

    const material = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
            uTex: { value: write.texture },
            uRes: { value: new Vector2() },
            uCurve: { value: new Vector2(CURVE[0], CURVE[1]) },
            uTime: { value: 0 },
            uGlitch: { value: 0 },
            uMotion: { value: 0 },
            uScan: { value: 0 },
            uDpr: { value: 1 },
        },
        depthTest: false,
        depthWrite: false,
    });
    const geometry = new PlaneGeometry(2, 2);
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));
    const glowScene = new Scene();
    glowScene.add(new Mesh(geometry, glowMaterial));
    const camera = new OrthographicCamera(); // vertex shaders ignore it anyway
    let lastFrame = performance.now();

    const dispose = () => {
        canvas.removeEventListener("webglcontextrestored", onRestore);
        canvas.remove();
        textCanvas.style.display = "";
        texture.dispose();
        read.dispose();
        write.dispose();
        glowMaterial.dispose();
        material.dispose();
        geometry.dispose();
        renderer.dispose();
    };

    // three only logs shader errors on first use, so render once and check
    let broken = false;
    renderer.debug.onShaderError = () => {
        broken = true;
    };
    renderer.render(scene, camera);
    if (broken) {
        console.error("CRT shader failed to compile; showing plain text instead.");
        dispose();
        return null;
    }

    // three rebuilds after a context loss, we just resend the text
    canvas.addEventListener("webglcontextrestored", onRestore);

    canvas.className = textCanvas.className;
    canvas.setAttribute("aria-hidden", "true");
    textCanvas.after(canvas);
    textCanvas.style.display = "none";

    return {
        upload(source) {
            if (!source.width || !source.height) return;
            if (canvas.width !== source.width || canvas.height !== source.height) {
                renderer.setSize(source.width, source.height, false);
                texture.dispose(); // size changed, make three realloc it
                read.setSize(source.width, source.height);
                write.setSize(source.width, source.height);
            }
            texture.image = source;
            texture.needsUpdate = true;
        },
        render({ time, glitch, motion, scanlines, dpr }) {
            const u = material.uniforms;
            u.uRes.value.set(canvas.width, canvas.height);
            u.uTime.value = time % 3600; // hash() loses precision on big inputs
            u.uGlitch.value = glitch;
            u.uMotion.value = motion;
            u.uScan.value = scanlines;
            u.uDpr.value = dpr;

            const now = performance.now();
            // no trails with reduced motion
            glowMaterial.uniforms.uKeep.value = motion ? Math.exp(-(now - lastFrame) / AFTERGLOW_MS) : 0;
            lastFrame = now;
            glowMaterial.uniforms.uPrev.value = read.texture;
            renderer.setRenderTarget(write);
            renderer.render(glowScene, camera);
            renderer.setRenderTarget(null);
            u.uTex.value = write.texture;
            renderer.render(scene, camera);
            [read, write] = [write, read];
        },
        dispose,
    };
}
