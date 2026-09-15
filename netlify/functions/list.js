const { getStore } = require('@netlify/blobs');

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

exports.handler = async (event) => {
  const store = getStore(STORE_NAME);

  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  const action = (event.queryStringParameters && event.queryStringParameters.action) || null;

  // Check the shared passcode without ever sending the real value to the browser.
  if (event.httpMethod === 'POST' && action === 'verify') {
    let submitted = '';
    try { submitted = JSON.parse(event.body || '{}').pin || ''; } catch (e) {}
    return json(200, { ok: submitted === pin() });
  }

  if (event.httpMethod === 'GET') {
    const existing = await store.get(DATA_KEY, { type: 'json' });
    return json(200, existing || DEFAULT_DATA);
  }

  if (event.httpMethod === 'POST') {
    const suppliedPin = event.headers['x-family-pin'] || event.headers['X-Family-Pin'];
    if (suppliedPin !== pin()) {
      return json(401, { error: 'Wrong passcode.' });
    }
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return json(400, { error: 'Bad request body.' });
    }
    if (!payload || !Array.isArray(payload.people)) {
      return json(400, { error: 'Malformed list data.' });
    }
    await store.setJSON(DATA_KEY, payload);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed.' });
};
