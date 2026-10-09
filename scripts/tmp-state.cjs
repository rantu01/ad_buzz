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

async function main() {
  const base = path.join('D:', 'Code', 'Project', 'Office Work', 'AD accont', 'ad-buzz');
  const env = loadEnv(path.join(base, '.env'));
  const { MongoClient } = require(path.join(base, 'node_modules', 'mongodb'));
  const m = new MongoClient(env.MONGODB_URI);
  await m.connect();
  const db = m.db(env.MONGODB_DB_NAME || 'ad_buzz');
  const n = await db.collection('metaAdAccounts').countDocuments({ prepaidBalance: { $type: 'number' } });
  console.log('docs with numeric prepaid:', n);
  const one = await db.collection('metaAdAccounts').findOne({ metaAccountId: 'act_970230258404081' });
  console.log(JSON.stringify({ v: one?.prepaidBalance ?? 'NULL', st: one?.prepaidBalanceStatus }));
  const logs = await db.collection('syncLogs').find({}).sort({ createdAt: -1 }).limit(8).toArray();
  for (const l of logs) console.log(l.createdAt.toISOString(), '|', (l.message || '').slice(0, 140));
  const state = await db.collection('metaSyncState').findOne({ _id: 'bm_ad_accounts' });
  console.log('lastFullReconcileAt:', state?.lastFullReconcileAt, 'count:', state?.lastAccountCount);
  await m.close();
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
