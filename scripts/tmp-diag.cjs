// STEP 3 — SAFE READ-ONLY diagnostic (no writes, no payments, no top-ups).
// Pages owned + client ad accounts requesting ONLY the documented read
// fields, then catalogs funding_source_details shapes per account.
// Token is loaded from the project's own metaSettings and NEVER printed.
const fs = require('fs');
const path = require('path');

function loadEnv(p) {
  const env = {};
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function shapeOf(fsd) {
  if (fsd === undefined) return 'ABSENT';
  if (fsd === null) return 'NULL';
  if (typeof fsd !== 'object') return typeof fsd;
  const keys = Object.keys(fsd).sort().join(',');
  return `OBJ{${keys}} type=${fsd.type ?? '?'}`;
}

async function main() {
  const base = path.join('D:', 'Code', 'Project', 'Office Work', 'AD accont', 'ad-buzz');
  const env = loadEnv(path.join(base, '.env'));
  const { MongoClient } = require(path.join(base, 'node_modules', 'mongodb'));
  const m = new MongoClient(env.MONGODB_URI);
  await m.connect();
  const db = m.db(env.MONGODB_DB_NAME || 'ad_buzz');
  const settings = await db.collection('metaSettings').findOne({});
  await m.close();

  const token = settings.accessToken; // never printed
  const bmId = settings.businessManagerId;
  const fields = 'id,name,currency,account_status,balance,amount_spent,spend_cap,funding_source_details,is_prepay_account';

  const seen = new Map();
  const errors = [];
  for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
    let url = `https://graph.facebook.com/v22.0/${bmId}/${edge}?fields=${fields}&limit=100&access_token=${token}`;
    let pages = 0;
    while (url && pages < 10) {
      pages++;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        errors.push({ edge, httpStatus: res.status, code: data.error.code, message: data.error.message });
        break;
      }
      for (const acc of data.data || []) seen.set(acc.id, acc);
      url = data.paging?.next || null;
    }
  }

  console.log(`HTTP: 200 on reads. Accounts seen: ${seen.size}. Errors: ${errors.length ? JSON.stringify(errors) : 'none'}`);

  const shapeCount = {};
  const fundsSamples = [];
  const fsdAbsent = [];
  for (const acc of seen.values()) {
    const s = shapeOf(acc.funding_source_details);
    shapeCount[s] = (shapeCount[s] || 0) + 1;
    if (acc.funding_source_details && typeof acc.funding_source_details === 'object' && acc.funding_source_details.display_string) {
      if (fundsSamples.length < 15) fundsSamples.push({ id: acc.id, prepay: acc.is_prepay_account, ds: acc.funding_source_details.display_string, type: acc.funding_source_details.type, balance: acc.balance });
    }
    if (acc.funding_source_details === undefined && fsdAbsent.length < 5) fsdAbsent.push(acc.id);
  }
  console.log('FSD shape inventory:', JSON.stringify(shapeCount, null, 1));
  console.log('display_string samples:', JSON.stringify(fundsSamples, null, 1));
  console.log('FSD absent on e.g.:', JSON.stringify(fsdAbsent));

  // Field-level numeric sanity for one stored-balance account
  const stored = [...seen.values()].find((a) => a.funding_source_details && a.funding_source_details.type === 20);
  if (stored) {
    console.log('stored-balance example:', JSON.stringify({ id: stored.id, currency: stored.currency, balance_field: stored.balance, fsd: stored.funding_source_details }));
  } else {
    console.log('NO type-20 stored-balance source found in full BM scan.');
  }
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
