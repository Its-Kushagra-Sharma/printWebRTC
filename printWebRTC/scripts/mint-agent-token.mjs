import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const value = (name) => { const idx = args.indexOf(name); return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined; };
const uid = value('--uid'); const shop = value('--shop'); const keyFile = value('--service-account');
if (!uid || !shop) { console.error('Usage: node scripts/mint-agent-token.mjs --uid AGENT_ID --shop SHOP_ID [--service-account /absolute/service-account.json]'); process.exit(1); }
const credential = keyFile ? cert(JSON.parse(readFileSync(keyFile, 'utf8'))) : applicationDefault();
const firebase = getApps()[0] ?? initializeApp({ credential });
console.log(await getAuth(firebase).createCustomToken(uid, { role: 'agent', shop_id: shop }));
