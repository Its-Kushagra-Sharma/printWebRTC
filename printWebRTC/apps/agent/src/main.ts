import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { config as loadEnv } from 'dotenv';
import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocFromServer, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { PrintJob } from '@myprint/shared';

loadEnv({ path: join(process.cwd(), '.env') });

const exec = promisify(execFile);
const required = ['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID', 'MYPRINT_SHOP_ID', 'MYPRINT_AGENT_ID'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`MyPrint Agent is not configured. Add ${missing.join(', ')} to apps/agent/.env.`);

const config = { apiKey: process.env.FIREBASE_API_KEY!, authDomain: process.env.FIREBASE_AUTH_DOMAIN!, projectId: process.env.FIREBASE_PROJECT_ID!, appId: process.env.FIREBASE_APP_ID! };
const shopId = process.env.MYPRINT_SHOP_ID!;
const agentId = process.env.MYPRINT_AGENT_ID!;
const firebase = initializeApp(config);
const auth = getAuth(firebase);
const db = getFirestore(firebase);
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let mainWindow: BrowserWindow | null = null;
const activeJobs = new Set<string>();
let currentStatus = { status: 'Connecting…', desc: 'Starting secure edge connection…', type: '' };

function updateStatus(status: string, desc: string, type: 'online' | 'error' = 'online') {
  currentStatus = { status, desc, type };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-status', currentStatus);
  }
}

function encryptedToken(): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS keychain encryption is unavailable');
  const credentialFile = join(app.getPath('userData'), 'agent-credential.bin');
  if (process.env.MYPRINT_RESET_CREDENTIAL === '1' && existsSync(credentialFile)) unlinkSync(credentialFile);
  if (existsSync(credentialFile)) {
    const saved = safeStorage.decryptString(readFileSync(credentialFile));
    if (saved.split('.').length === 3) return saved;
    unlinkSync(credentialFile);
  }
  const input = process.env.MYPRINT_AGENT_CUSTOM_TOKEN;
  if (!input) throw new Error('Agent is not provisioned');
  if (input.split('.').length !== 3) throw new Error('MYPRINT_AGENT_CUSTOM_TOKEN is not a signed Firebase custom token. Mint one with the server-side provisioning command.');
  writeFileSync(credentialFile, safeStorage.encryptString(input), { mode: 0o600 });
  return input;
}

async function discoverPrinters(): Promise<string[]> {
  if (process.platform === 'win32') {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name']);
    return stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  }
  const { stdout } = await exec('lpstat', ['-a']);
  return stdout.split(/\r?\n/).map((line) => line.split(/\s+/)[0]).filter(Boolean);
}

async function printBuffer(buffer: Buffer, printer: string | undefined, mime: string) {
  const printers = await discoverPrinters();
  if (!printer || !printers.includes(printer)) throw new Error('Selected printer is unavailable');
  if (process.platform === 'win32') throw new Error('Windows requires a configured PDF/image print adapter; do not shell-concatenate printer names.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('lp', ['-d', printer, '-o', `document-format=${mime}`], { stdio: ['pipe', 'ignore', 'pipe'] });
    child.stdin.end(buffer);
    child.on('error', reject);
    child.on('exit', (code: number) => (code === 0 ? resolve() : reject(new Error(`lp exited ${code}`))));
  });
}

function setupIPCHandlers() {
  ipcMain.handle('get-agent-status', () => currentStatus);

  ipcMain.on('agent-answer', async (_e, { jobId, answer }) => {
    try {
      const jobRef = doc(db, 'shops', shopId, 'jobs', jobId);
      const signal = collection(jobRef, 'signal');
      await setDoc(doc(signal, 'answer'), { from: 'agent', answer, created_at: serverTimestamp() });
      console.log('[agent] answer written to Firestore for job', jobId);
    } catch (e) {
      console.error('[agent] error writing answer for job', jobId, e);
    }
  });

  ipcMain.on('agent-candidate', async (_e, { jobId, candidate }) => {
    try {
      const jobRef = doc(db, 'shops', shopId, 'jobs', jobId);
      const signal = collection(jobRef, 'signal');
      await addDoc(signal, { from: 'agent', candidate, created_at: serverTimestamp() });
    } catch (e) {
      console.error('[agent] error adding candidate for job', jobId, e);
    }
  });

  ipcMain.on('job-status-update', async (_e, { jobId, status, extra }) => {
    try {
      const jobRef = doc(db, 'shops', shopId, 'jobs', jobId);
      const updateData: Record<string, any> = { status, ...extra, [`${status}_at`]: serverTimestamp() };
      if (status === 'transferring') updateData.agent_connected_at = serverTimestamp();
      await updateDoc(jobRef, updateData);
      console.log(`[agent] job ${jobId} status updated to ${status}`);
    } catch (e) {
      console.error(`[agent] error updating status for job ${jobId}`, e);
    }
  });

  ipcMain.handle('print-document', async (_e, { jobId, buffer, printer, mime }) => {
    console.log(`[agent] printing document for job ${jobId} on printer ${printer} (${mime})`);
    await printBuffer(Buffer.from(buffer), printer, mime);
  });

  ipcMain.on('log-message', (_e, { message, type }) => {
    console.log(`[agent renderer:${type || 'info'}] ${message}`);
  });
}

async function receive(job: PrintJob) {
  if (activeJobs.has(job.id)) return;
  activeJobs.add(job.id);

  console.log('[agent] receive triggered for job', job.id, 'status', job.status);
  try {
    const jobRef = doc(db, 'shops', shopId, 'jobs', job.id);
    const signal = collection(jobRef, 'signal');

    let offerSnap: any = await getDocFromServer(doc(signal, 'offer')).catch(() => getDoc(doc(signal, 'offer')));
    if (!offerSnap.exists()) {
      console.warn('[agent] no offer for', job.id, 'waiting 30s for customer WebRTC offer...');
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          offerSnap = await getDocFromServer(doc(signal, 'offer'));
        } catch {
          offerSnap = await getDoc(doc(signal, 'offer'));
        }
        if (offerSnap.exists()) break;
        if (i % 5 === 0) console.log('[agent] still waiting offer for', job.id, `${i + 1}s`);
      }
      if (!offerSnap.exists()) {
        console.warn('[agent] offer wait timeout for', job.id, 'customer closed tab before offer - marking failed');
        try {
          await updateDoc(jobRef, { status: 'failed', failed_reason: 'no_offer_timeout', failed_at: serverTimestamp() });
        } catch {}
        activeJobs.delete(job.id);
        return;
      }
    }

    const offerData = offerSnap.data().offer;

    // Send start job instruction to Renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('start-job', { job, offer: offerData, ice: ICE });
    }

    // Subscribe to customer ICE candidates
    const unsub = onSnapshot(query(signal, orderBy('created_at')), (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (change.type === 'added' && data.from === 'customer' && data.candidate) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('customer-candidate', { jobId: job.id, candidate: data.candidate });
          }
        }
      }
    });

    // Clean up subscription after job finishes or fails
    const checkCompletion = setInterval(async () => {
      try {
        const currentDoc = await getDoc(jobRef);
        const st = currentDoc.data()?.status;
        if (st === 'printed' || st === 'failed') {
          unsub();
          clearInterval(checkCompletion);
          activeJobs.delete(job.id);
        }
      } catch {
        clearInterval(checkCompletion);
        activeJobs.delete(job.id);
      }
    }, 5000);

  } catch (e) {
    console.error('[agent] receive failed for', job.id, e);
    activeJobs.delete(job.id);
    throw e;
  }
}

async function start() {
  await signInWithCustomToken(auth, encryptedToken());
  console.log('[agent] signed in as', auth.currentUser?.uid, 'claims', (await auth.currentUser?.getIdTokenResult())?.claims);

  const printers = await discoverPrinters();
  await setDoc(doc(db, 'shops', shopId, 'agents', agentId), { online: true, last_seen_at: serverTimestamp(), printers }, { merge: true });

  console.log('[agent] listening shop', shopId, 'agent', agentId);
  updateStatus('Online', `Listening shop "${shopId}" agent "${agentId}" (${printers.length} printers ready)`, 'online');

  onSnapshot(
    query(collection(db, 'shops', shopId, 'jobs'), orderBy('created_at', 'desc')),
    (snap) => {
      const hits = snap.docChanges().filter((c) => (c.type === 'added' || c.type === 'modified') && c.doc.data().agent_id === agentId && c.doc.data().status === 'ready_for_transfer');
      if (hits.length) console.log('[agent] job snapshot hits', hits.map((h) => `${h.type}:${h.doc.id}:${h.doc.data().status}`));
      hits.forEach((c) => void receive({ id: c.doc.id, ...c.doc.data() } as PrintJob).catch((e) => console.error('[agent] receive unhandled', e)));
    },
    (err) => {
      console.error('[agent] jobs onSnapshot error', err);
      updateStatus('Error', `Firestore connection error: ${err.message}`, 'error');
    }
  );
}

app.whenReady().then(async () => {
  setupIPCHandlers();
  mainWindow = new BrowserWindow({
    width: 480,
    height: 340,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadFile(join(__dirname, 'index.html'));

  try {
    await start();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    console.error('MyPrint Agent startup failed:', message);
    updateStatus('Error', `Startup failed: ${message}`, 'error');
  }
});
