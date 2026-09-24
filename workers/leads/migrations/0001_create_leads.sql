-- Demo requests from the contact form. No IP addresses or user agents are
-- stored: only what the visitor typed, the page it came from and a country
-- code, which is enough to follow up and to spot spam.
CREATE TABLE leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  venue      TEXT,
  interest   TEXT,
  message    TEXT,
  source     TEXT,
  country    TEXT
);

CREATE INDEX leads_created_at ON leads (created_at);
CREATE INDEX leads_email_created_at ON leads (email, created_at);
