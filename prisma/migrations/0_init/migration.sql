-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "entries" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "theme" TEXT,
    "copy" JSONB,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phrases" (
    "phrase" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,

    CONSTRAINT "phrases_pkey" PRIMARY KEY ("phrase")
);

-- CreateTable
CREATE TABLE "logins" (
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,

    CONSTRAINT "logins_pkey" PRIMARY KEY ("username")
);

-- AddForeignKey
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "logins" ADD CONSTRAINT "logins_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- prisma can't model these. same names postgres gives them by default, so a database
-- made from the old db/schema.sql matches. the theme list has to match components/terminal/themes.ts
ALTER TABLE "entries" ADD CONSTRAINT "entries_kind_check" CHECK ("kind" IN ('result', 'hint'));
ALTER TABLE "entries" ADD CONSTRAINT "entries_theme_check" CHECK ("theme" IN ('scipnet', 'omega'));
ALTER TABLE "entries" ADD CONSTRAINT "entries_copy_check" CHECK (jsonb_typeof("copy") = 'object');

-- starter rows, edit or delete them freely
INSERT INTO "entries" ("id", "kind", "title", "body", "link", "theme", "copy") VALUES
    ('e01', 'result', 'ACCESS GRANTED',
     'Placeholder result text. This is what the player sees after a correct phrase.',
     'https://example.com/next-step', NULL, NULL),
    ('omega', 'result', '', '', NULL, 'omega', NULL),
    ('e02', 'hint', 'CLOSE',
     'Placeholder hint text. Use this for phrases that are nearly right.', NULL, NULL, NULL),
    ('login-guest', 'result', '', '', NULL, NULL, NULL),
    ('login-director', 'result', 'MESSAGES: 1 UNREAD', 'Placeholder. Shown under the welcome.', NULL, NULL,
     '{"title": "SCiPNET // O5 CONSOLE", "boot": ["Welcome back, Director.", "Clearance verified.", ""]}');

INSERT INTO "phrases" ("phrase", "entry_id") VALUES
    ('example password', 'e01'),
    ('example-password-alt', 'e01'),
    ('example omega phrase', 'omega'),
    ('example wrong turn', 'e02');

INSERT INTO "logins" ("username", "password", "entry_id") VALUES
    ('guest', 'guest', 'login-guest'),
    ('director', 'example-password', 'login-director');
