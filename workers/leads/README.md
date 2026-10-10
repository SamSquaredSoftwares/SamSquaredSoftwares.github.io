# Lead capture Worker

Stores every demo request from `contact.html` in a Cloudflare D1 database, and can ping Slack when one arrives.

## How it works

1. A visitor submits the contact form.
2. `script.js` sends a copy of the form to `POST /api/lead` with `navigator.sendBeacon`. The beacon never blocks or delays the real submission.
3. The form still posts to FormSubmit, which emails info@ as before.
4. This Worker runs on `samsquaredsoftwares.com/api/*` and `www.samsquaredsoftwares.com/api/*`. Every other path still goes to GitHub Pages. For each lead it:
   - accepts only requests from our own site (`Origin` check)
   - rate-limits to 5 requests a minute per IP
   - drops bots that fill in the hidden `_honey` field
   - validates the fields and caps the body at 64 KB
   - stores the lead once, skipping a repeat of the same email and message within 10 minutes, and retries D1 writes that fail with a transient error
   - posts to Slack, if `SLACK_WEBHOOK_URL` is set

If the Worker is down or not deployed yet, the beacon fails quietly. The email still goes out.

## One-time setup

### 1. Create a Cloudflare API token

Create it in **the Cloudflare account that holds `samsquaredsoftwares.com`**: My Profile > API Tokens > Create Token > Custom token. It needs these permissions:

| Scope   | Permission         | Access |
|---------|--------------------|--------|
| Account | Workers Scripts    | Edit   |
| Account | D1                 | Edit   |
| Account | Account Settings   | Read   |
| Zone    | Workers Routes     | Edit   |
| Zone    | Zone               | Read   |

Set **Account Resources** to that one account, and **Zone Resources** to `samsquaredsoftwares.com`.

### 2. Add it to GitHub

Go to repo Settings > Secrets and variables > Actions > New repository secret:

- `CLOUDFLARE_API_TOKEN`: the token from step 1.
- `CLOUDFLARE_ACCOUNT_ID`: optional. Only needed if the token can see more than one account.

### 3. Deploy

Go to Actions > **Deploy lead Worker** > Run workflow. After that, every push to `main` that changes `workers/leads/` redeploys it. The workflow:

1. runs the tests
2. creates the `samsquared-leads` D1 database if it doesn't exist yet (in Western Europe, the closest location to South Africa)
3. applies the migrations
4. deploys

Always deploy through this workflow, never a bare `wrangler deploy`. On a fresh account, a bare deploy creates the database in the wrong place and without the `leads` table.

If the zone is in a different account from the token, the deploy fails with "Could not find zone". Make the token in the other account.

### 4. Optional: Slack alerts

1. Create a Slack incoming webhook for the channel you want.
2. In the Cloudflare dashboard, go to Workers & Pages > `samsquared-leads` > Settings > Variables and Secrets.
3. Add a **secret** named `SLACK_WEBHOOK_URL` with the webhook URL.

## Reading leads

Open the Cloudflare dashboard > Storage & Databases > D1 > `samsquared-leads` > Console, and run:

```sql
SELECT created_at, name, email, venue, interest, message
FROM leads
ORDER BY created_at DESC
LIMIT 50;
```

Or from this folder:

```sh
npx wrangler d1 execute DB --remote --command "SELECT * FROM leads ORDER BY created_at DESC LIMIT 50"
```

`created_at` is in UTC.

## Privacy

The Worker stores only:
- what the visitor typed
- the page the form was on
- a two-letter country code

It stores no IP addresses and no user agents. The rate limiter sees the IP only in memory. Workers invocation logs and traces are turned off in `wrangler.jsonc`, because they would record each visitor's user agent, city and network next to the lead. The Worker's own log lines hold only an event name, the row ID and the country code. To remove someone's data:

```sql
DELETE FROM leads WHERE email = 'person@example.com';
```

## Development

```sh
npm install
npm test        # runs the Worker in workerd with a local D1; no Cloudflare account needed
```

To change the schema, add a new numbered file in `migrations/`. Never edit one that has already been applied. Keep changes additive, such as new nullable columns, because migrations run just before the new code deploys.
