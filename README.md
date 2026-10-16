# oasisarg5

ARG terminal. Players log in and type phrases, `/api/unlock` checks them against a Postgres database on the server, through Prisma.

Put the connection string in `.env.local` (it's gitignored):

```
DATABASE_URL=postgres://user:password@localhost:5432/arg
```

```bash
npm install                  # also generates the Prisma client into lib/generated
npx prisma migrate deploy    # creates the tables and the starter rows, run it after every pull

npm run dev    # http://localhost:3000
npm test
npm run build && npm start
```

Already have tables from the old `db/schema.sql`? They match the first migration, so tell Prisma instead of running it:

```bash
npx prisma migrate resolve --applied 0_init
```

To change the tables, edit `prisma/schema.prisma` and run `npx prisma migrate dev --name what-changed` on your machine, then `migrate deploy` on the server. The checks on `kind`, `theme` and `copy` live in the migration SQL because Prisma's schema can't express them. Adding a theme means a new migration that drops and re-adds `entries_theme_check`, like `1_department_themes`; `npm test` fails if the list and `themes.ts` disagree.

## Deploying

Run it as one Node process behind one proxy. The rate limit is in memory, so serverless or several instances won't share it.

The proxy has to pass the real client IP, or the rate limit can be faked:

```nginx
proxy_set_header X-Real-IP $remote_addr;
```

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
