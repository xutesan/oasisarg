-- has to list exactly the themes in components/terminal/themes.ts, npm test checks it
ALTER TABLE "entries" DROP CONSTRAINT "entries_theme_check";
ALTER TABLE "entries" ADD CONSTRAINT "entries_theme_check" CHECK ("theme" IN (
    'scipnet', 'omega', 'o5-council', 'o4-command', 'site-directorate', 'ethics-committee', 'research'
));
