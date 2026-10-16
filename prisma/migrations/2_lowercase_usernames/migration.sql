-- logins ignore case, so "Guest" and "guest" would shadow each other. store them lowercase and trimmed,
-- the db refuses anything else. if this fails on the update, two of your usernames only differ by case
UPDATE "logins" SET "username" = lower(trim("username"));
ALTER TABLE "logins" ADD CONSTRAINT "logins_username_check" CHECK ("username" = lower(trim("username")));
