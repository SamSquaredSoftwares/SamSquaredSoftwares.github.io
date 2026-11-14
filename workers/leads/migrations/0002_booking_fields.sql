-- Extra fields from the /book demo-booking page. All nullable, so rows from
-- contact.html (which does not send them) stay valid, and the change is safe
-- to apply just before the new code deploys.
ALTER TABLE leads ADD COLUMN phone TEXT;
ALTER TABLE leads ADD COLUMN venue_type TEXT;
ALTER TABLE leads ADD COLUMN preferred_date TEXT;
ALTER TABLE leads ADD COLUMN preferred_time TEXT;
