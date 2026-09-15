const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

const STORE_NAME = 'family-gift-list';
const DATA_KEY = 'data-2026';

// Starting roster — same names as the 2025 sheet, empty lists for 2026.
const DEFAULT_DATA = {
  people: [
    'Milo', 'Colby', 'Meredith', 'Ethan', 'Emma', 'Alyssa', 'Colin', 'Amber', 'Misc Adults'
  ].map((name, i) => ({
    id: 'p' + i,
    name,
    items: []
  }))
};

function pin() {
  return process.env.FAMILY_PIN || '1225';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  };
}

function makeStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  // Fall back to explicit credentials if Netlify's automatic wiring isn't present.
  if (siteID && token) {
    return getStore({ name: STORE_NAME, siteID, token });
  }
  return getStore(STORE_NAME);
}

function newId() {
  return crypto.randomBytes(5).toString('hex');
}

async function loadData(store) {
  const existing = await store.get(DATA_KEY, { type: 'json' });
  return existing || DEFAULT_DATA;
}

async function saveData(store, data) {
  await store.setJSON(DATA_KEY, data);
}

function hasValidPin(event) {
  const supplied = event.headers['x-family-pin'] || event.headers['X-Family-Pin'];
  return supplied === pin();
}

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch (e) { return null; }
}

function clean(str, max) {
  return String(str || '').trim().slice(0, max || 500);
}

exports.handler = async (event) => {
  const store = makeStore();

  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const action = (event.queryStringParameters && event.queryStringParameters.action) || null;

  // Passcode check — never leaks the real value to the browser.
  if (event.httpMethod === 'POST' && action === 'verify') {
    const body = parseBody(event) || {};
    return json(200, { ok: clean(body.pin, 50) === pin() });
  }

  // Anyone can read the list (needed for the public quick-add dropdown, and to load the app).
  if (event.httpMethod === 'GET') {
    const data = await loadData(store);
    return json(200, data);
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const body = parseBody(event);
  if (!body) return json(400, { error: 'Bad request body.' });

  // Public, no passcode needed: append one item to a list. This is deliberately
  // limited to "add an item" only — nothing else can be changed without the PIN.
  if (action === 'quickadd') {
    const { personId, item, link, notes } = body;
    const itemText = clean(item, 300);
    if (!personId || !itemText) {
      return json(400, { error: 'Missing person or item.' });
    }
    const data = await loadData(store);
    const person = data.people.find(p => p.id === personId);
    if (!person) return json(404, { error: 'No such list.' });
    const newItem = {
      id: newId(),
      item: itemText,
      purchaser: '',
      purchased: false,
      holiday: 'Either',
      link: clean(link, 500),
      notes: clean(notes, 500)
    };
    person.items.push(newItem);
    await saveData(store, data);
    return json(200, { ok: true, item: newItem });
  }

  // Everything below changes existing data and requires the shared family passcode.
  if (!hasValidPin(event)) {
    return json(401, { error: 'Wrong passcode.' });
  }

  const data = await loadData(store);

  if (action === 'addItem') {
    const person = data.people.find(p => p.id === body.personId);
    if (!person) return json(404, { error: 'No such list.' });
    const newItem = {
      id: newId(),
      item: clean(body.item, 300),
      purchaser: clean(body.purchaser, 100),
      purchased: false,
      holiday: body.holiday || 'Either',
      link: clean(body.link, 500),
      notes: clean(body.notes, 500)
    };
    person.items.push(newItem);
    await saveData(store, data);
    return json(200, { ok: true, item: newItem });
  }

  if (action === 'updateItem') {
    const person = data.people.find(p => p.id === body.personId);
    const item = person && person.items.find(i => i.id === body.itemId);
    if (!item) return json(404, { error: 'Item not found.' });
    const patch = body.patch || {};
    if ('item' in patch) item.item = clean(patch.item, 300);
    if ('purchaser' in patch) item.purchaser = clean(patch.purchaser, 100);
    if ('purchased' in patch) item.purchased = !!patch.purchased;
    if ('holiday' in patch) item.holiday = patch.holiday;
    if ('link' in patch) item.link = clean(patch.link, 500);
    if ('notes' in patch) item.notes = clean(patch.notes, 500);
    await saveData(store, data);
    return json(200, { ok: true });
  }

  if (action === 'deleteItem') {
    const person = data.people.find(p => p.id === body.personId);
    if (!person) return json(404, { error: 'No such list.' });
    person.items = person.items.filter(i => i.id !== body.itemId);
    await saveData(store, data);
    return json(200, { ok: true });
  }

  if (action === 'addPerson') {
    const name = clean(body.name, 60);
    if (!name) return json(400, { error: 'Name required.' });
    const newPerson = { id: newId(), name, items: [] };
    data.people.push(newPerson);
    await saveData(store, data);
    return json(200, { ok: true, person: newPerson });
  }

  if (action === 'removePerson') {
    data.people = data.people.filter(p => p.id !== body.personId);
    await saveData(store, data);
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unknown action.' });
};
