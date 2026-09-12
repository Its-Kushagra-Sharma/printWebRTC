# MyPrint — Cloud-to-Edge Print SaaS

MyPrint sends document bytes directly from a customer's browser to a shop's desktop agent over a WebRTC data channel. Firestore is used exclusively for tenant data, job metadata, and SDP/ICE signaling; **Firebase Storage is intentionally not used**.

## Workspace

- `apps/web` — Next.js customer PWA and merchant dashboard
- `apps/agent` — Electron desktop receiver and printer bridge
- `packages/shared` — data contracts, paisa calculations, and signaling helpers
- `firestore.rules` — tenant-scoped Firestore access control

## Local setup

1. Create a Firebase project with Email/Password authentication and Firestore enabled.
2. Copy `apps/web/.env.example` to `apps/web/.env.local`, adding browser Firebase values.
3. Copy `apps/agent/.env.example` to `apps/agent/.env`, adding the same Firebase values.
4. `npm install`
5. Deploy rules with `firebase deploy --only firestore:rules`.
6. Run `npm run dev:web` and `npm run dev:agent`.

### Provision an agent (local development)

Keep the Firebase Admin service-account JSON outside this repository. Mint a one-time custom token locally, then put its output in `apps/agent/.env` as `MYPRINT_AGENT_CUSTOM_TOKEN`:

```bash
npm run mint:agent-token -- --uid agent-001 --shop shop1 --service-account /absolute/path/service-account.json
```

Custom tokens are JWTs (three dot-separated sections); example values such as `ABC` will not work. The agent encrypts the first valid credential in the OS keychain. Set `MYPRINT_RESET_CREDENTIAL=1` for one launch when rotating it, then change it back to `0`.

For production, deploy the callable/HTTP API guards in `apps/web/src/app/api` behind Firebase Admin verification (or move them to Cloud Functions). A payment provider webhook must be the only path that credits a wallet. TURN credentials should be short-lived and issued by a verified backend.

## Data-channel protocol

The sender transmits, in order: a JSON `meta` frame, binary chunks (64 KiB), and JSON `complete`. The agent rejects a job when the byte count or SHA-256 differs. Bytes are held in process memory until the OS print command is invoked, then released.

## Production checklist

- Supply coturn (TLS) alongside STUN; do not rely on public STUN for paid jobs.
- Apply App Check, Firebase Auth custom claims (`merchant`, `agent`), and Firestore rules below.
- Verify payment webhooks server-side, append immutable wallet ledger records, and use Firestore transactions.
- Run the agent under a least-privileged OS account and restrict allowed printer names.
- Persist only content hashes, sizes, mime types, and audit metadata—not document payloads or previews.
