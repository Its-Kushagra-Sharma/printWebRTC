import { GoogleAuth } from 'google-auth-library';

const args = process.argv.slice(2); const get = (name) => args[args.indexOf(name) + 1];
const projectId = get('--project'); const keyFile = get('--service-account');
if (!projectId || !keyFile) { console.error('Usage: node scripts/enable-auth-providers.mjs --project PROJECT_ID --service-account /absolute/key.json'); process.exit(1); }
const auth = new GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/identitytoolkit'] });
const client = await auth.getClient(); const token = await client.getAccessToken();
const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.anonymous.enabled,signIn.email.enabled,signIn.email.passwordRequired`, { method: 'PATCH', headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: `projects/${projectId}/config`, signIn: { anonymous: { enabled: true }, email: { enabled: true, passwordRequired: true } } }) });
if (!response.ok) throw new Error(`Auth configuration failed: ${response.status} ${await response.text()}`);
console.log('Enabled Firebase anonymous and email/password authentication.');
