import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';

const SITE = 'https://samsquaredsoftwares.com';
const ENDPOINT = SITE + '/api/lead';
const TOKEN = 'pat-eu1-test-token-000';

let seq = 0;
function uniq() {
  seq += 1;
  return { ip: `198.51.100.${seq}`, email: `book${seq}@venue.test` };
}

function booking(overrides = {}) {
  return {
    name: 'Thandi Nkosi',
    email: 'thandi@venue.test',
    phone: '+27 82 000 0000',
    venue: 'Rooftop Lounge',
    venue_type: 'Nightclub / lounge',
    interest: 'SAMePOS Dashboard',
    preferred_date: '2026-11-20',
    preferred_time: 'Morning (09:00 - 12:00)',
    message: 'Three bars, about 600 guests on a Saturday.',
    _honey: '',
    ...overrides,
  };
}

function formData(values) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.append(key, value);
  return fd;
}

async function send(values, { ip, db = env.DB, token = TOKEN } = {}) {
  const request = new Request(ENDPOINT, {
    method: 'POST',
    headers: { Origin: SITE, Referer: SITE + '/book', 'CF-Connecting-IP': ip },
    body: formData(values),
  });
  const testEnv = {
    DB: db,
    LEAD_LIMITER: env.LEAD_LIMITER,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
    HUBSPOT_TOKEN: token,
  };
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// Fake HubSpot: contact upsert returns id 501, deal create returns id 901.
let hubspot;
function hubspotOk() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.endsWith('/crm/v3/objects/contacts/batch/upsert')) {
      return Response.json({ status: 'COMPLETE', results: [{ id: '501' }] });
    }
    if (u.endsWith('/crm/v3/objects/deals')) return Response.json({ id: '901' }, { status: 201 });
    return new Response('unexpected', { status: 500 });
  });
}
function call(path) {
  return hubspot.mock.calls.find(([url]) => String(url).endsWith(path));
}

beforeEach(() => {
  hubspot = hubspotOk();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('/book submissions', () => {
  it('stores every booking field in D1', async () => {
    const { ip, email } = uniq();
    const res = await send(booking({ email }), { ip });

    expect(res.status).toBe(204);
    const row = await env.DB.prepare('SELECT * FROM leads WHERE email = ?1').bind(email).first();
    expect(row).toMatchObject({
      phone: '+27 82 000 0000',
      venue_type: 'Nightclub / lounge',
      preferred_date: '2026-11-20',
      preferred_time: 'Morning (09:00 - 12:00)',
      source: '/book',
    });
  });

  it('upserts the contact by email, then opens a deal linked to it', async () => {
    const { ip, email } = uniq();
    await send(booking({ email }), { ip });

    const [, contactInit] = call('/contacts/batch/upsert');
    expect(contactInit.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(contactInit.body)).toEqual({
      inputs: [{
        idProperty: 'email',
        id: email,
        properties: { email, firstname: 'Thandi', lastname: 'Nkosi', company: 'Rooftop Lounge', phone: '+27 82 000 0000' },
      }],
    });

    const deal = JSON.parse(call('/crm/v3/objects/deals')[1].body);
    expect(deal.properties).toMatchObject({
      dealname: 'Demo request | Rooftop Lounge',
      pipeline: 'default',
      dealstage: 'appointmentscheduled',
    });
    expect(deal.properties.description).toContain('Interested in: SAMePOS Dashboard');
    expect(deal.properties.description).toContain('Preferred demo: 2026-11-20, Morning (09:00 - 12:00)');
    expect(deal.associations).toEqual([{
      to: { id: '501' },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
    }]);
  });

  it('names the deal after the person when no venue is given, and sends no empty fields', async () => {
    const { ip, email } = uniq();
    await send(booking({ email, name: 'Cher', venue: '', phone: '' }), { ip });

    const props = JSON.parse(call('/contacts/batch/upsert')[1].body).inputs[0].properties;
    expect(props).toEqual({ email, firstname: 'Cher' });
    expect(JSON.parse(call('/crm/v3/objects/deals')[1].body).properties.dealname).toBe('Demo request | Cher');
  });

  it('does not open a second deal for a double submit', async () => {
    const { ip, email } = uniq();
    await send(booking({ email }), { ip });
    await send(booking({ email }), { ip });

    const deals = hubspot.mock.calls.filter(([url]) => String(url).endsWith('/crm/v3/objects/deals'));
    expect(deals).toHaveLength(1);
  });

  it('makes no HubSpot calls when the token is not set', async () => {
    const { ip, email } = uniq();
    // null, not undefined: undefined would fall back to the default token.
    const res = await send(booking({ email }), { ip, token: null });

    expect(res.status).toBe(204);
    expect(hubspot).not.toHaveBeenCalled();
  });

  it('still answers 204 and skips the deal when the contact upsert fails', async () => {
    hubspot.mockImplementation(async () => new Response('{}', { status: 401 }));
    const { ip, email } = uniq();
    const res = await send(booking({ email }), { ip });

    expect(res.status).toBe(204);
    expect(hubspot).toHaveBeenCalledTimes(1);
  });

  it('never logs the token, even when HubSpot is unreachable', async () => {
    hubspot.mockRejectedValue(new TypeError(`fetch failed with Bearer ${TOKEN}`));
    const logs = vi.spyOn(console, 'log');
    const { ip, email } = uniq();
    await send(booking({ email }), { ip });

    const out = logs.mock.calls.flat().join('\n');
    expect(out).toContain('hubspot.failed');
    expect(out).not.toContain(TOKEN);
  });

  it('keeps the lead in HubSpot when D1 is down', async () => {
    const broken = { prepare() { return { bind() { return { run() { throw new Error('D1_ERROR: no such table'); } }; } }; } };
    const { ip, email } = uniq();
    const res = await send(booking({ email }), { ip, db: broken });

    expect(res.status).toBe(204);
    expect(call('/crm/v3/objects/deals')).toBeTruthy();
  });

  it('answers 503 when D1 is down and HubSpot fails too', async () => {
    hubspot.mockImplementation(async () => new Response('{}', { status: 500 }));
    const broken = { prepare() { return { bind() { return { run() { throw new Error('D1_ERROR: no such table'); } }; } }; } };
    const { ip, email } = uniq();
    const res = await send(booking({ email }), { ip, db: broken });

    expect(res.status).toBe(503);
  });

  it.each([
    ['phone', { phone: 'call me maybe' }, 'invalid_phone'],
    ['preferred_date', { preferred_date: '20/11/2026' }, 'invalid_date'],
    ['venue_type', { venue_type: 'x'.repeat(101) }, 'field_too_long'],
  ])('rejects a bad %s', async (field, override, error) => {
    const { ip, email } = uniq();
    const res = await send(booking({ email, ...override }), { ip });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error, field });
    expect(hubspot).not.toHaveBeenCalled();
  });
});
