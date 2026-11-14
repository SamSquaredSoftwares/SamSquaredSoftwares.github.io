/* Lead capture for the contact form.
   The form still posts to FormSubmit, which emails the team. script.js also
   beacons a copy of each submission to POST /api/lead, and this Worker stores
   it in D1 so every lead is kept somewhere we own, then optionally pings Slack
   and, when HUBSPOT_TOKEN is set, creates the HubSpot contact and a deal.
   book.html (the /book page) posts here too, with a few extra fields. */

const ENDPOINT = '/api/lead';
// Room for a long message in any script (3 bytes per character in UTF-8).
const MAX_BODY_BYTES = 64 * 1024;
const DUPLICATE_WINDOW = '-10 minutes';
const INSERT_ATTEMPTS = 3;

// Upper bounds match the maxlength attributes on contact.html. The message has
// no maxlength there, so the email path keeps any length; the body cap bounds it.
const FIELDS = {
  name: { max: 200, required: true },
  email: { max: 254, required: true },
  venue: { max: 200 },
  interest: { max: 100 },
  message: {},
  // Sent only by book.html.
  phone: { max: 40 },
  venue_type: { max: 100 },
  preferred_date: { max: 10 },
  preferred_time: { max: 40 },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^[0-9+()\-\s]{6,40}$/;

const HUBSPOT = 'https://api.hubapi.com';
// HubSpot-defined association type for deal -> contact.
const DEAL_TO_CONTACT = 3;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== ENDPOINT) return reply(404, { error: 'not_found' });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, { Allow: 'POST' });

    const origin = request.headers.get('Origin');
    if (!allowedOrigins(env).includes(origin)) return reply(403, { error: 'forbidden_origin' });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.LEAD_LIMITER.limit({ key: ip });
    if (!success) return reply(429, { error: 'rate_limited' });

    const form = await readForm(request);
    if (form === null) return reply(413, { error: 'too_large' });
    if (form === undefined) return reply(400, { error: 'unreadable_body' });

    // Honeypot: people never see this field, so anything in it is a bot.
    // Answer as if it worked so the bot learns nothing.
    if (text(form, '_honey')) {
      log('lead.honeypot', { country: country(request) });
      return reply(204);
    }

    const lead = {};
    for (const [field, rule] of Object.entries(FIELDS)) {
      const value = text(form, field);
      if (rule.required && !value) return reply(400, { error: 'missing_field', field });
      if (rule.max && value.length > rule.max) return reply(400, { error: 'field_too_long', field });
      lead[field] = value || null;
    }
    if (!EMAIL.test(lead.email)) return reply(400, { error: 'invalid_email', field: 'email' });
    if (lead.phone && !PHONE.test(lead.phone)) return reply(400, { error: 'invalid_phone', field: 'phone' });
    if (lead.preferred_date && !ISO_DATE.test(lead.preferred_date)) {
      return reply(400, { error: 'invalid_date', field: 'preferred_date' });
    }

    lead.source = sourcePage(request, origin);
    lead.country = country(request);

    let result;
    try {
      result = await insertLead(env.DB, lead);
    } catch (err) {
      log('lead.store_failed', { error: err && err.name, country: lead.country });
      // D1 is down, but HubSpot can still hold the lead. Only fail the
      // request when neither place has it.
      if (env.HUBSPOT_TOKEN && await syncHubSpot(env.HUBSPOT_TOKEN, lead)) return reply(204);
      return reply(503, { error: 'store_failed' });
    }

    const stored = result.meta.changes === 1;
    if (stored) log('lead.stored', { id: result.meta.last_row_id, country: lead.country });
    else log('lead.duplicate', { country: lead.country });

    if (stored && env.SLACK_WEBHOOK_URL) {
      ctx.waitUntil(notifySlack(env.SLACK_WEBHOOK_URL, lead));
    }
    if (stored && env.HUBSPOT_TOKEN) {
      ctx.waitUntil(syncHubSpot(env.HUBSPOT_TOKEN, lead));
    }
    return reply(204);
  },
};

// Double clicks and resubmits within the window are stored once. That guard
// also makes a retry safe if a failed attempt had in fact been written.
async function insertLead(db, lead) {
  const statement = db.prepare(
    `INSERT INTO leads (name, email, venue, interest, message, source, country,
                        phone, venue_type, preferred_date, preferred_time)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?9, ?10, ?11, ?12
     WHERE NOT EXISTS (
       SELECT 1 FROM leads
       WHERE email = ?2 AND message IS ?5 AND created_at > datetime('now', ?8)
     )`
  ).bind(lead.name, lead.email, lead.venue, lead.interest, lead.message,
         lead.source, lead.country, DUPLICATE_WINDOW,
         lead.phone, lead.venue_type, lead.preferred_date, lead.preferred_time);

  for (let attempt = 1; ; attempt++) {
    try {
      return await statement.run();
    } catch (err) {
      if (attempt >= INSERT_ATTEMPTS || !retryable(err)) throw err;
      log('lead.store_retry', { attempt, error: err && err.name });
      // Exponential backoff with jitter, as D1's retry guidance recommends.
      await sleep(50 * 2 ** attempt + Math.random() * 50);
    }
  }
}

// D1 retries read-only queries itself, but not writes. These are the
// transient errors its docs list as safe to retry.
function retryable(err) {
  const message = String(err);
  return message.includes('Network connection lost') ||
    message.includes('storage caused object to be reset') ||
    message.includes('reset because its code was updated');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
}

// Reads a form body without buffering more than MAX_BODY_BYTES.
// Returns FormData, null when the body is too large, or undefined when it
// cannot be parsed as a form.
async function readForm(request) {
  const declared = Number(request.headers.get('Content-Length'));
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return undefined;

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const type = request.headers.get('Content-Type') || '';
    return await new Response(body, { headers: { 'Content-Type': type } }).formData();
  } catch {
    return undefined;
  }
}

// Form encoding sends line breaks as CRLF. Store LF, as the visitor typed it.
function text(form, name) {
  const value = form.get(name);
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
}

// The page the form was on, from the Referer, only when it is our own site.
function sourcePage(request, origin) {
  try {
    const referer = new URL(request.headers.get('Referer'));
    return referer.origin === origin ? referer.pathname.slice(0, 200) : null;
  } catch {
    return null;
  }
}

function country(request) {
  return (request.cf && request.cf.country) || null;
}

// Puts the lead in the CRM: upsert the contact by email (a returning visitor
// updates their record instead of making a duplicate), then open a deal in
// the default pipeline's first stage, linked to that contact.
// Returns true when both calls worked. Never throws, never logs the token.
async function syncHubSpot(token, lead) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const [firstname, ...rest] = lead.name.split(/\s+/);
  const contact = { email: lead.email, firstname };
  if (rest.length) contact.lastname = rest.join(' ');
  if (lead.venue) contact.company = lead.venue;
  if (lead.phone) contact.phone = lead.phone;

  try {
    const upsert = await fetch(`${HUBSPOT}/crm/v3/objects/contacts/batch/upsert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: [{ idProperty: 'email', id: lead.email, properties: contact }] }),
    });
    if (!upsert.ok) {
      log('hubspot.contact_failed', { status: upsert.status });
      return false;
    }
    const contactId = (await upsert.json()).results[0].id;

    const deal = await fetch(`${HUBSPOT}/crm/v3/objects/deals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          dealname: `Demo request | ${lead.venue || lead.name}`,
          pipeline: 'default',
          dealstage: 'appointmentscheduled',
          description: dealNotes(lead),
        },
        associations: [{
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: DEAL_TO_CONTACT }],
        }],
      }),
    });
    if (!deal.ok) {
      log('hubspot.deal_failed', { status: deal.status });
      return false;
    }
    log('hubspot.synced', { deal: (await deal.json()).id });
    return true;
  } catch (err) {
    log('hubspot.failed', { error: err && err.name });
    return false;
  }
}

function dealNotes(lead) {
  return [
    lead.interest && `Interested in: ${lead.interest}`,
    lead.venue_type && `Venue type: ${lead.venue_type}`,
    (lead.preferred_date || lead.preferred_time) &&
      `Preferred demo: ${[lead.preferred_date, lead.preferred_time].filter(Boolean).join(', ')}`,
    lead.phone && `Phone: ${lead.phone}`,
    lead.source && `From page: ${lead.source}`,
    lead.message && `\n${lead.message}`,
  ].filter(Boolean).join('\n').slice(0, 65000);
}

async function notifySlack(webhook, lead) {
  const lines = [
    `*New demo request* from ${slack(lead.name)} (${slack(lead.email)})`,
    [lead.venue, lead.interest].filter(Boolean).map(slack).join(' | '),
    lead.message ? '> ' + slack(lead.message.slice(0, 500)).replace(/\n/g, '\n> ') : '',
  ].filter(Boolean);

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n') }),
    });
    if (!res.ok) log('slack.failed', { status: res.status });
  } catch (err) {
    // Only the error name: the message can contain the webhook URL, a secret.
    log('slack.failed', { error: err && err.name });
  }
}

// Slack treats <...> as links and mentions, so escape the three control
// characters to stop a visitor from pinging @channel or faking a link.
function slack(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function log(event, fields) {
  console.log(JSON.stringify({ event, ...fields }));
}

function reply(status, body, headers = {}) {
  if (status === 204) return new Response(null, { status, headers });
  return Response.json(body, { status, headers });
}
