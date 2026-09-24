/* Lead capture for the contact form.
   The form still posts to FormSubmit, which emails the team. script.js also
   beacons a copy of each submission to POST /api/lead, and this Worker stores
   it in D1 so every lead is kept somewhere we own, then optionally pings Slack. */

const ENDPOINT = '/api/lead';
const MAX_BODY_BYTES = 16 * 1024;
const DUPLICATE_WINDOW = '-10 minutes';

// Upper bounds match the maxlength attributes on contact.html.
const FIELDS = {
  name: { max: 200, required: true },
  email: { max: 254, required: true },
  venue: { max: 200 },
  interest: { max: 100 },
  message: { max: 5000 },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      if (value.length > rule.max) return reply(400, { error: 'field_too_long', field });
      lead[field] = value || null;
    }
    if (!EMAIL.test(lead.email)) return reply(400, { error: 'invalid_email', field: 'email' });

    lead.source = sourcePage(request, origin);
    lead.country = country(request);

    // Double clicks and resubmits within the window are stored once.
    const result = await env.DB.prepare(
      `INSERT INTO leads (name, email, venue, interest, message, source, country)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
       WHERE NOT EXISTS (
         SELECT 1 FROM leads
         WHERE email = ?2 AND message IS ?5 AND created_at > datetime('now', ?8)
       )`
    ).bind(lead.name, lead.email, lead.venue, lead.interest, lead.message,
           lead.source, lead.country, DUPLICATE_WINDOW).run();

    const stored = result.meta.changes === 1;
    log(stored ? 'lead.stored' : 'lead.duplicate', { id: result.meta.last_row_id, country: lead.country });

    if (stored && env.SLACK_WEBHOOK_URL) {
      ctx.waitUntil(notifySlack(env.SLACK_WEBHOOK_URL, lead));
    }
    return reply(204);
  },
};

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

function text(form, name) {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
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
    log('slack.failed', { error: String(err) });
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
