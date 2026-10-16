import { makeEmblem, type Emblem, type SpinMode } from "./emblem";
import omegaArt from "./emblems/omega";
import scpArt from "./emblems/scp";

export type Tones = {
    text: string;
    dim: string;
    result: string;
    hint: string;
    error: string;
    link: string;
};

export type Tone = keyof Tones;

export type Copy = {
    title: string;
    prompt: string;
    statusReady: string;
    statusBusy: string;
    hint: string;
    hintShort: string;
    hintScrolled: string;
    boot: string[];
    loginBoot: string[];
    loginUser: string;
    loginPass: string;
    loginHint: string;
    loginFailed: string;
    loginOk: string;
    loggedOut: string;
    help: string[];
    noMatch: string;
    rateLimited: (seconds: number) => string;
    rejected: string;
    offline: string;
    copied: string;
    nothingToCopy: string;
    copyBlocked: string;
    snakeStart: string;
    snakeHint: string;
    snakeOver: string;
    snakeTooSmall: string;
};

export type Theme = {
    screen: string;
    tones: Tones;
    backdrop: {
        emblem: Emblem;
        shades: string[];
        spin: SpinMode;
        secondsPerTurn: number;
        fps: number;
        size: number;
        cellAspect: number;
        tilt: number;
        perspective: number;
        thickness: number;
    };
    copy: Copy;
};

const HOW_TO = ["Type a phrase and press Enter to query the database.", 'Type "help" to list commands.', ""];

// TODO: rewrite the copy in the ARG's voice
const scipnet: Theme = {
    screen: "#05070a",
    tones: {
        text: "#d6dde6",
        dim: "#7f8b99",
        result: "#ffffff",
        hint: "#f2c14e",
        error: "#ff5f4f",
        link: "#79b8ff",
    },
    backdrop: {
        emblem: makeEmblem(scpArt),
        shades: ["#14191f", "#1c232b", "#252e38", "#313c48", "#4a5868"],
        spin: "coin",
        secondsPerTurn: 12,
        fps: 30,
        size: 0.7,
        cellAspect: 2.05,
        tilt: 14,
        perspective: 4.5,
        thickness: 0.1,
    },
    copy: {
        title: "SCiPNET SECURE TERMINAL",
        prompt: "> ",
        statusReady: "READY",
        statusBusy: "QUERYING",
        hint: 'Type a phrase and press Enter. "help" lists commands.',
        hintShort: '"help" lists commands',
        hintScrolled: "Viewing earlier output. Type to jump back.",
        boot: ["SCiPNET connection established.", "", ...HOW_TO],
        // lock screen heading, first line bright
        loginBoot: ["FOUNDATION SECURE ACCESS", "Unauthorised access is a breach of protocol."],
        loginUser: "login: ",
        loginPass: "password: ",
        loginHint: "Enter your credentials.",
        loginFailed: "Access denied.",
        loginOk: "Access granted.",
        loggedOut: "Session closed.",
        help: [
            "help    list commands",
            "clear   wipe the screen",
            "copy    copy the last response to your clipboard",
            "logout  end the session",
            "snake   play snake",
            "",
            "Anything else is sent as a phrase.",
            "Scroll with the mouse wheel, Page Up and Page Down, or by dragging.",
            "",
        ],
        noMatch: "No record matches that phrase.",
        rateLimited: (seconds) => `Too many attempts. Try again in ${seconds}s.`,
        rejected: "That phrase couldn't be read. Shorten it and try again.",
        offline: "No response from the server. Check your connection and try again.",
        copied: "Copied the last response.",
        nothingToCopy: "Nothing to copy yet.",
        copyBlocked: "Your browser blocked clipboard access.",
        snakeStart: "SNAKE. Steer with the arrow keys or WASD, or swipe. Esc quits.",
        snakeHint: "Arrows/WASD or swipe to steer. Esc quits.",
        snakeOver: "GAME OVER",
        snakeTooSmall: "The screen is too small for snake.",
    },
};

const omega: Theme = {
    screen: "#030a05",
    tones: {
        text: "#3df07a",
        dim: "#2a9c53",
        result: "#c9ffd9",
        hint: "#f5c04a",
        error: "#ff5f4f",
        link: "#62e6cf",
    },
    backdrop: {
        ...scipnet.backdrop,
        emblem: makeEmblem(omegaArt),
        shades: ["#0a2812", "#0f3d1c", "#145226", "#1b6b32", "#2b9a4a"],
    },
    // title + boot text live in the db so they don't ship in the bundle
    copy: {
        ...scipnet.copy,
        statusBusy: "SENDING",
    },
};

// departments keep the foundation emblem, the wiki doesn't give them their own.
// clearance names follow the wiki: 2 restricted, 3 secret, 4 top secret, 5 thaumiel
const department = (screen: string, tones: Tones, shades: string[], copy: Partial<Copy>): Theme => ({
    screen,
    tones,
    backdrop: { ...scipnet.backdrop, shades },
    copy: { ...scipnet.copy, ...copy },
});

const o5Council = department(
    "#0a0804",
    { text: "#e8d29a", dim: "#9a8556", result: "#fff4d6", hint: "#ffb347", error: "#ff5f4f", link: "#f0c35a" },
    ["#1a150a", "#262012", "#342b18", "#463a20", "#62522e"],
    {
        title: "O5 COUNCIL // OVERSEER COMMAND",
        prompt: "O5> ",
        statusReady: "SECURE",
        statusBusy: "RETRIEVING",
        boot: [
            "Overseer channel open.",
            "Clearance: Level 5 (Thaumiel). Identity masked.",
            "Every query on this terminal is logged to the Overseer archive.",
            "",
            ...HOW_TO,
        ],
        noMatch: "No file under that designation.",
    },
);

// not in the wiki's main canon. roleplay communities use it for the command tier under the council
const o4Command = department(
    "#0c0505",
    { text: "#f2a59a", dim: "#a0645b", result: "#ffe1dc", hint: "#f5c04a", error: "#ff4a3d", link: "#ffb38a" },
    ["#1c0b0a", "#2a110f", "#3a1714", "#4e1f1b", "#6e2b25"],
    {
        title: "O4 COMMAND // DIRECTIVE RELAY",
        prompt: "O4> ",
        statusReady: "STANDING BY",
        statusBusy: "RELAYING",
        boot: [
            "O4 Command relay established.",
            "Clearance: Level 4 (Top Secret).",
            "Council directives are relayed through this office. Do not act on unverified orders.",
            "",
            ...HOW_TO,
        ],
        noMatch: "No directive matches that phrase.",
    },
);

const siteDirectorate = department(
    "#04070d",
    { text: "#a9c8ef", dim: "#5f7898", result: "#e6f1ff", hint: "#f2c14e", error: "#ff5f4f", link: "#7fd4ff" },
    ["#0b1320", "#111c2e", "#18273f", "#213553", "#2f4a73"],
    {
        title: "SITE DIRECTORATE // SITE-65",
        prompt: "SD> ",
        statusReady: "NOMINAL",
        statusBusy: "QUERYING",
        boot: [
            "Site Command terminal, Site-65.",
            "Clearance: Level 4 (Top Secret).",
            "Containment status: nominal. Report all breaches to Site Security.",
            "",
            ...HOW_TO,
        ],
        noMatch: "No site record matches that phrase.",
    },
);

const ethicsCommittee = department(
    "#07060c",
    { text: "#cfc4f0", dim: "#8077a3", result: "#f3efff", hint: "#f2c14e", error: "#ff6b7a", link: "#9fd0ff" },
    ["#120f1f", "#1a162c", "#241e3c", "#30284f", "#45396f"],
    {
        title: "ETHICS COMMITTEE // REVIEW",
        prompt: "EC> ",
        statusReady: "IN SESSION",
        statusBusy: "REVIEWING",
        boot: [
            "Ethics Committee review terminal.",
            "Clearance: Level 4 (Top Secret).",
            "Testing that involves D-class personnel needs Committee approval before it goes ahead.",
            "",
            ...HOW_TO,
        ],
        noMatch: "No case file matches that phrase.",
    },
);

const research = department(
    "#0a0703",
    { text: "#ffb547", dim: "#a8742a", result: "#ffe2b0", hint: "#9fe870", error: "#ff5f4f", link: "#7fd4ff" },
    ["#1a1206", "#261a09", "#35240c", "#4a3210", "#664516"],
    {
        title: "RESEARCH DEPARTMENT // SCiPNET",
        prompt: "RD> ",
        statusReady: "ONLINE",
        statusBusy: "SEARCHING",
        boot: [
            "Research network connected.",
            "Clearance: Level 2 (Restricted).",
            "Reminder: all testing needs an approved test log, filed before the test, not after.",
            "",
            ...HOW_TO,
        ],
        noMatch: "No document matches that query.",
    },
);

export const THEMES = {
    scipnet,
    omega,
    "o5-council": o5Council,
    "o4-command": o4Command,
    "site-directorate": siteDirectorate,
    "ethics-committee": ethicsCommittee,
    research,
} satisfies Record<string, Theme>;
export type ThemeId = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeId = "scipnet";

export const isThemeId = (id: unknown): id is ThemeId =>
    typeof id === "string" && Object.hasOwn(THEMES, id);
