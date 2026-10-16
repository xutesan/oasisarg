# oasisarg5

ARG terminal. Players log in and type phrases, `/api/unlock` checks them against a Postgres database on the server, through Prisma.

## the backend (for whoever's approving the server)

this bit is for network leadership. it's just the backend, the frontend is further down.

short version: it's a tiny node app that serves one page and answers one question. "is this phrase (or username + password) a puzzle answer, and if so what text goes with it?" that's it.

**what runs**
- one node process (next.js 16, `npm start`, port 3000 unless you set `PORT`) sitting behind a reverse proxy like nginx
- one postgres db, connected through the `DATABASE_URL` env var. that's the only thing it talks to. no other outbound calls while it's running, and the font is bundled at build time so players' browsers don't hit google either
- no accounts, no sessions, no cookies, no browser storage. it doesn't keep anything about visitors

**the one endpoint:** `POST /api/unlock`
1. proxy passes the player's ip in `X-Real-IP`
2. 20 requests a minute per ip, then it returns 429. the counter lives in the process's memory
3. bodies over 4kb get a 413, every field is capped at 200 chars, and junk input gets a 400 before it ever touches the db
4. the phrase gets cleaned up (case, spaces, punctuation and accents don't matter), hashed, and looked up in a table the server keeps in memory. hit = that puzzle's text, miss = `{ ok: false }`
5. if the db is unreachable it returns 503

**the db**
- three tables: `entries` (the puzzles), `phrases` (answers that unlock an entry), `logins` (story usernames/passwords)
- the app only ever reads. it reloads everything every 30 seconds so i can edit puzzles live without a restart. if the db goes down it keeps serving the last copy it loaded
- what i'd do: give the app a db role with `SELECT` only, and use a different role for `prisma migrate deploy` since that one has to create tables
- answers and login passwords are plain text in the db. on purpose, they're part of the story. still treat the db like a secret tho, it has every answer in it

**logs**
- stdout/stderr only, and only when something's wrong: db errors, a puzzle row with a bad phrase, or a missing proxy header
- it doesn't log requests or what people type. one exception: if two puzzles get the same answer, the log line names that phrase. so treat the logs as sensitive

**stuff to know before it goes live**
- one instance only. the rate limit is in memory so two instances (or serverless) would each count on their own
- the rate limit trusts `X-Real-IP`. if someone can reach the app without going through the proxy they can fake it and skip the limit. bind it to localhost or firewall it so only the proxy can hit port 3000
- if that header's missing, everyone shares one bucket and the whole site gets 20 attempts a minute total. it logs a message when that happens in production
- the login screen is for the story, it's not security. the api takes phrases without logging in
- a chunked request has no length header and skips the 4kb check, so also set a body limit at the proxy (`client_max_body_size 8k;` in nginx)
- i haven't load tested it. expecting a hundred players max

## the frontend (and the ai part)

being upfront, claude code was used to help with these things:
- the canvas terminal and the typing/input stuff
- the crt screen effect in webgl (`crt.ts`, built on three.js, with glsl shaders)
- the spinning ascii emblem (`emblem.ts`)
- snake, and the drawing code

i also used claude code on the rest of the repo to refactor, write tests and review stuff. what the game does and what's in it is on me and the other gms.

## Adding a puzzle

Edit the database with `npx prisma studio` (a browser table editor) or any Postgres tool. Changes go live within 30 seconds, no redeploy. If the database goes down, the site keeps using the last puzzles it loaded.

`entries`, one row per puzzle:

- `kind`: `result` for a real unlock, `hint` for a near miss or easter egg.
- `title`, `body`, optional `link`: what gets printed.
- `theme`: optional, switches the terminal to a theme from `components/terminal/themes.ts`: `scipnet`, `omega`, `o5-council`, `o4-command`, `site-directorate`, `ethics-committee` or `research`. The screen is wiped first. Adding a theme means updating the check on this column too (see above).
- `copy`: optional JSON that overrides the theme's wording, e.g. `{"title": "...", "boot": ["...", ""]}`. Keep secret wording here, not in `themes.ts`, which ships to the browser. Values must match the theme's own: text for text, a list of text for lists like `boot`. Anything else is skipped and the browser console says which key.

Real answers and secret wording never go in a committed file. The omega puzzle's live in `prisma/private.sql`, which is gitignored: copy it to the server and run `npx prisma db execute --file prisma/private.sql` once.

`phrases`, one row per phrase that unlocks an entry. Case, spacing, punctuation and accents are ignored, so `Night Shift` also matches `night-shift!`. If two entries end up with the same phrase, the one whose id sorts first wins and the server logs it.

Don't use `help`, `clear`, `copy`, `logout` or `snake` as phrases; the browser handles those itself.

## Logins

Players log in before they can type phrases. Each login points at an entry, and that entry decides what they see: its `theme`, its `copy` (`boot` is the welcome message, `title` the top bar), then its `title` and `body` if set.

`logins`: `username` (stored lowercase, the database refuses capitals or outer spaces; players can type it in any case), `password` (case matters, stored as plain text since it's part of the story), `entry_id`. Two logins can share an entry.

For trying the themes there's one test login per theme (username is the theme id, password `test`). It's not a migration, so add it only where you want it, never on the live site:

```bash
npx prisma db execute --file prisma/test-logins.sql
```

The login is for the story, not real security. The API takes phrases without one, so anyone poking at the network tab can skip it.
