-- one login per theme, username is the theme id, password is "test". not a migration on purpose,
-- so they only exist where you run this. safe to run again:
--   npx prisma db execute --file prisma/test-logins.sql
-- remove them again (their logins go with them):
--   delete from entries where id like 'test-%';

INSERT INTO "entries" ("id", "kind", "title", "body", "theme", "copy") VALUES
    ('test-scipnet', 'result', 'TEST LOGIN', 'Theme: scipnet.', 'scipnet', NULL),
    -- omega's title and welcome are secret (prisma/private.sql), so this one shows the scipnet wording
    ('test-omega', 'result', 'TEST LOGIN', 'Theme: omega.', 'omega', NULL),
    ('test-o5-council', 'result', 'TEST LOGIN', 'Theme: o5-council.', 'o5-council', NULL),
    ('test-o4-command', 'result', 'TEST LOGIN', 'Theme: o4-command.', 'o4-command', NULL),
    ('test-site-directorate', 'result', 'TEST LOGIN', 'Theme: site-directorate.', 'site-directorate', NULL),
    ('test-ethics-committee', 'result', 'TEST LOGIN', 'Theme: ethics-committee.', 'ethics-committee', NULL),
    ('test-research', 'result', 'TEST LOGIN', 'Theme: research.', 'research', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO "logins" ("username", "password", "entry_id") VALUES
    ('scipnet', 'test', 'test-scipnet'),
    ('omega', 'test', 'test-omega'),
    ('o5-council', 'test', 'test-o5-council'),
    ('o4-command', 'test', 'test-o4-command'),
    ('site-directorate', 'test', 'test-site-directorate'),
    ('ethics-committee', 'test', 'test-ethics-committee'),
    ('research', 'test', 'test-research')
ON CONFLICT DO NOTHING;
