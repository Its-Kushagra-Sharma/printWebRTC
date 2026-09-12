import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2); const get = (name) => { const idx = args.indexOf(name); return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined; };
const keyPath = get('--service-account'); const shopId = get('--shop') ?? 'demo-print-shop'; const agentId = get('--agent') ?? 'agent-001'; const name = get('--name') ?? 'MyPrint Demo Shop';
if (!keyPath) { console.error('Usage: node scripts/provision-demo-shop.mjs --service-account /absolute/key.json [--shop shop-id] [--agent agent-id] [--name "Shop name"]'); process.exit(1); }
const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = getFirestore(app); const auth = getAuth(app);
await db.doc(`shops/${shopId}`).set({ name, active: true, currency: 'INR', created_at: FieldValue.serverTimestamp() }, { merge: true });
await db.doc(`shops/${shopId}/pricing/current`).set({ mono_paisa: 200, color_paisa: 1200, duplex_discount_paisa: 25, minimum_order_paisa: 1000, updated_at: FieldValue.serverTimestamp() }, { merge: true });
const token = await auth.createCustomToken(agentId, { role: 'agent', shop_id: shopId });
console.log(JSON.stringify({ shop_id: shopId, agent_id: agentId, agent_custom_token: token, qr_path: `/p/${shopId}` }, null, 2));
