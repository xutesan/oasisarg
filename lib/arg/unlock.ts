import "server-only";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { Copy } from "@/components/terminal/themes";

export type UnlockedEntry = {
    id: string;
    kind: "result" | "hint";
    title: string;
    body: string;
    link: string | null;
    theme: string | null;
    copy: Partial<Omit<Copy, "rateLimited">> | null;
};

type Row = UnlockedEntry & { phrase: string };
type LoginRow = UnlockedEntry & { username: string; password: string };
type Index = Map<string, UnlockedEntry>;
type Loaded = { phrases: Index; logins: Index };

const TTL_MS = 30_000; // db edits take up to this long to show up

export function normalise(input: string): string {
    return input
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

function hashPhrase(phrase: string): string {
    return createHash("sha256").update(normalise(phrase)).digest("hex");
}

// keyed by hash so timing doesn't leak how close a guess was.
// bad rows get logged and skipped, one typo shouldn't take every puzzle down
export function buildIndex(rows: Row[]): Index {
    const index: Index = new Map();
    for (const { phrase, ...entry } of rows) {
        if (!normalise(phrase)) {
            console.error(`entry "${entry.id}" has an empty phrase, skipping it`);
            continue;
        }
        const key = hashPhrase(phrase);
        const clash = index.get(key);
        if (clash && clash.id !== entry.id) {
            console.error(`phrase "${phrase}" is on both "${clash.id}" and "${entry.id}", keeping "${clash.id}"`);
            continue;
        }
        index.set(key, entry);
    }
    return index;
}

// usernames ignore case and outer spaces, passwords are exact
function loginKey(username: string, password: string): string {
    return createHash("sha256").update(`${username.trim().toLowerCase()}\0${password}`).digest("hex");
}

export function buildLogins(rows: LoginRow[]): Index {
    return new Map(rows.map(({ username, password, ...entry }) => [loginKey(username, password), entry]));
}

export function findLogin(logins: Index, username: string, password: string): UnlockedEntry | null {
    return logins.get(loginKey(username, password)) ?? null;
}

let db: PrismaClient | undefined;

async function load(): Promise<Loaded> {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL isn't set");
    // idle timeout so dev reloads don't pile up open connections
    db ??= new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 20_000 }),
    });
    const entries = await db.entry.findMany({ include: { phrases: true, logins: true }, orderBy: { id: "asc" } });
    const phrases: Row[] = [];
    const logins: LoginRow[] = [];
    for (const { phrases: ps, logins: ls, ...row } of entries) {
        // kind and copy are held to these shapes by check constraints in the db
        const entry = row as UnlockedEntry;
        for (const { phrase } of ps) phrases.push({ ...entry, phrase });
        for (const { username, password } of ls) logins.push({ ...entry, username, password });
    }
    return { phrases: buildIndex(phrases), logins: buildLogins(logins) };
}

// db edits show up within ttl. db down = keep serving the last good copy
export function cache<T>(load: () => Promise<T>, ttl: number, now = Date.now): () => Promise<T> {
    let cached: { data: T; at: number } | undefined;
    let inflight: Promise<T> | undefined;
    return () => {
        if (cached && now() - cached.at < ttl) return Promise.resolve(cached.data);
        inflight ??= load()
            .then((data) => {
                cached = { data, at: now() };
                return data;
            })
            .catch((err) => {
                if (!cached) throw err;
                console.error("couldn't reload entries, using the old ones", err);
                cached.at = now();
                return cached.data;
            })
            .finally(() => {
                inflight = undefined;
            });
        return inflight;
    };
}

const getEntries = cache(load, TTL_MS);

export function find(index: Index, phrase: string): UnlockedEntry | null {
    if (!normalise(phrase)) return null;
    return index.get(hashPhrase(phrase)) ?? null;
}

export async function unlock(phrase: string): Promise<UnlockedEntry | null> {
    return find((await getEntries()).phrases, phrase);
}

export async function login(username: string, password: string): Promise<UnlockedEntry | null> {
    return findLogin((await getEntries()).logins, username, password);
}
