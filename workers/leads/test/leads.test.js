import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SITE = 'https://samsquaredsoftwares.com';
const ENDPOINT = SITE + '/api/lead';

// Rate limiter and D1 state persist across tests in this file, so every test
// uses its own IP and email.
let seq = 0;
function uniq() {
  seq += 1;
  return { ip: `192.0.2.${seq}`, email: `lead${seq}@venue.test` };
}

function fields(overrides = {}) {
  return {
    name: 'Ada Lovelace',
    email: 'ada@venue.test',
    venue: 'The Engine Room',
    interest: 'Full POS',
    message: 'Two bars, one kitchen.',
    _honey: '',
    ...overrides,
  };
}

function formData(values) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.append(key, value);
  return fd;
}

function post({ body, ip = '192.0.2.250', origin = SITE, referer = SITE + '/contact.html', headers = {} } = {}) {
  const h = { 'CF-Connecting-IP': ip, ...headers };
  if (origin !== null) h.Origin = origin;
  if (referer !== null) h.Referer = referer;
  return exports.default.fetch(ENDPOINT, { method: 'POST', headers: h, body });
}

async function rowsFor(email) {
  const { results } = await env.DB.prepare('SELECT * FROM leads WHERE email = ?1').bind(email).all();
  return results;
}

let slack;
beforeEach(() => {
  slack = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('storing leads', () => {
  it('stores a multipart submission, like the sendBeacon from script.js', async () => {
    const { ip, email } = uniq();
    const res = await post({ ip, body: formData(fields({ email })) });

    expect(res.status).toBe(204);
    const [row] = await rowsFor(email);
    expect(row).toMatchObject({
      name: 'Ada Lovelace',
      email,
      venue: 'The Engine Room',
      interest: 'Full POS',
      message: 'Two bars, one kitchen.',
      source: '/contact.html',
    });
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('stores a url-encoded submission', async () => {
    const { ip, email } = uniq();
    const res = await post({
      ip,
      body: new URLSearchParams(fields({ email })),
    });

    expect(res.status).toBe(204);
    expect(await rowsFor(email)).toHaveLength(1);
  });

  it('accepts the www origin', async () => {
    const { ip, email } = uniq();
    const www = 'https://www.samsquaredsoftwares.com';
    const res = await post({ ip, origin: www, referer: www + '/contact.html', body: formData(fields({ email })) });

    expect(res.status).toBe(204);
    const [row] = await rowsFor(email);
    expect(row.source).toBe('/contact.html');
  });

  it('trims values and stores empty optional fields as NULL', async () => {
    const { ip, email } = uniq();
    const res = await post({
      ip,
      body: formData(fields({ name: '  Grace  ', email: ` ${email} `, venue: '', interest: '', message: '   ' })),
    });

    expect(res.status).toBe(204);
    const [row] = await rowsFor(email);
    expect(row).toMatchObject({ name: 'Grace', venue: null, interest: null, message: null });
  });

  it('does not trust a Referer from another site', async () => {
    const { ip, email } = uniq();
    await post({ ip, referer: 'https://evil.test/contact.html', body: formData(fields({ email })) });

    const [row] = await rowsFor(email);
    expect(row.source).toBeNull();
  });

  it('stores a double submit once and pings Slack once', async () => {
    const { ip, email } = uniq();
    const first = await post({ ip, body: formData(fields({ email })) });
    const second = await post({ ip, body: formData(fields({ email })) });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(await rowsFor(email)).toHaveLength(1);
    await vi.waitFor(() => expect(slack).toHaveBeenCalledTimes(1));
  });

  it('stores a second, different message from the same person', async () => {
    const { ip, email } = uniq();
    await post({ ip, body: formData(fields({ email, message: 'First' })) });
    await post({ ip, body: formData(fields({ email, message: 'Follow-up' })) });

    expect(await rowsFor(email)).toHaveLength(2);
  });

  it('treats two empty messages as the same submission', async () => {
    const { ip, email } = uniq();
    await post({ ip, body: formData(fields({ email, message: '' })) });
    await post({ ip, body: formData(fields({ email, message: '' })) });

    expect(await rowsFor(email)).toHaveLength(1);
  });
});

describe('Slack alert', () => {
  it('posts the lead to the webhook', async () => {
    const { ip, email } = uniq();
    await post({ ip, body: formData(fields({ email })) });

    await vi.waitFor(() => expect(slack).toHaveBeenCalledTimes(1));
    const [url, init] = slack.mock.calls[0];
    expect(String(url)).toBe('https://hooks.slack.test/services/T000/B000/XXX');
    const { text } = JSON.parse(init.body);
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain(email);
    expect(text).toContain('The Engine Room | Full POS');
    expect(text).toContain('> Two bars, one kitchen.');
  });

  it('escapes Slack control characters so visitors cannot ping @channel', async () => {
    const { ip, email } = uniq();
    await post({ ip, body: formData(fields({ email, name: '<!channel> & <https://x.test|click>' })) });

    await vi.waitFor(() => expect(slack).toHaveBeenCalledTimes(1));
    const { text } = JSON.parse(slack.mock.calls[0][1].body);
    expect(text).toContain('&lt;!channel&gt; &amp; &lt;https://x.test|click&gt;');
    expect(text).not.toContain('<!channel>');
  });

  it('still stores the lead when Slack is down', async () => {
    slack.mockRejectedValue(new Error('network down'));
    const { ip, email } = uniq();
    const res = await post({ ip, body: formData(fields({ email })) });

    expect(res.status).toBe(204);
    expect(await rowsFor(email)).toHaveLength(1);
  });
});

describe('spam and abuse', () => {
  it('drops honeypot hits quietly: 204, nothing stored, no Slack', async () => {
    const { ip, email } = uniq();
    const res = await post({ ip, body: formData(fields({ email, _honey: 'https://spam.test' })) });

    expect(res.status).toBe(204);
    expect(await rowsFor(email)).toHaveLength(0);
    expect(slack).not.toHaveBeenCalled();
  });

  it('rejects requests from other sites', async () => {
    const { ip, email } = uniq();
    const res = await post({ ip, origin: 'https://evil.test', body: formData(fields({ email })) });

    expect(res.status).toBe(403);
    expect(await rowsFor(email)).toHaveLength(0);
  });

  it('rejects requests with no Origin, such as curl', async () => {
    const { ip, email } = uniq();
    const res = await post({ ip, origin: null, body: formData(fields({ email })) });

    expect(res.status).toBe(403);
    expect(await rowsFor(email)).toHaveLength(0);
  });

  it('rejects the opaque "null" origin', async () => {
    const { ip, email } = uniq();
    const res = await post({ ip, origin: 'null', body: formData(fields({ email })) });

    expect(res.status).toBe(403);
  });

  it('rate limits one IP after 5 requests a minute', async () => {
    const { ip } = uniq();
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await post({ ip, body: formData(fields({ email: `burst${i}@venue.test` })) });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);

    const other = await post({ ip: uniq().ip, body: formData(fields({ email: uniq().email })) });
    expect(other.status).toBe(204);
  });

  it('refuses a body over 16 KB by its Content-Length', async () => {
    const { ip, email } = uniq();
    const res = await post({ ip, body: formData(fields({ email, message: 'x'.repeat(20000) })) });

    expect(res.status).toBe(413);
    expect(await rowsFor(email)).toHaveLength(0);
  });

  it('refuses a streamed body over 16 KB with no Content-Length', async () => {
    const { ip } = uniq();
    // Finite (about 24 KB), so a broken cap fails this test instead of hanging.
    const chunk = new TextEncoder().encode('x'.repeat(4096));
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (sent++ < 6) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const res = await post({
      ip,
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect(res.status).toBe(413);
  });
});

describe('validation', () => {
  it.each([
    ['name', { name: '' }, 'missing_field'],
    ['email', { email: '' }, 'missing_field'],
    ['email', { email: 'not-an-email' }, 'invalid_email'],
    ['name', { name: 'x'.repeat(201) }, 'field_too_long'],
    ['venue', { venue: 'x'.repeat(201) }, 'field_too_long'],
    ['interest', { interest: 'x'.repeat(101) }, 'field_too_long'],
    ['message', { message: 'x'.repeat(5001) }, 'field_too_long'],
  ])('rejects a bad %s (%o)', async (field, override, error) => {
    const { ip, email } = uniq();
    const res = await post({ ip, body: formData(fields({ email, ...override })) });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error, field });
  });

  it('accepts every field at its maximum length', async () => {
    const { ip } = uniq();
    const email = 'a'.repeat(240) + '@venue.test'; // 251 chars, under 254
    const res = await post({
      ip,
      body: formData(fields({
        email,
        name: 'n'.repeat(200),
        venue: 'v'.repeat(200),
        interest: 'i'.repeat(100),
        message: 'm'.repeat(5000),
      })),
    });

    expect(res.status).toBe(204);
    expect(await rowsFor(email)).toHaveLength(1);
  });

  it('rejects a JSON body', async () => {
    const { ip } = uniq();
    const res = await post({
      ip,
      body: JSON.stringify(fields()),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unreadable_body' });
  });
});

describe('routing', () => {
  it('only allows POST', async () => {
    const res = await exports.default.fetch(ENDPOINT);

    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    await res.text();
  });

  it('returns 404 for other /api paths', async () => {
    const res = await exports.default.fetch(SITE + '/api/other', { method: 'POST' });

    expect(res.status).toBe(404);
    await res.text();
  });
});
