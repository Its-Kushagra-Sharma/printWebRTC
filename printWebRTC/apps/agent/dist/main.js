"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const dotenv_1 = require("dotenv");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_util_1 = require("node:util");
const app_1 = require("firebase/app");
const auth_1 = require("firebase/auth");
const firestore_1 = require("firebase/firestore");
(0, dotenv_1.config)({ path: (0, node_path_1.join)(process.cwd(), '.env') });
const exec = (0, node_util_1.promisify)(node_child_process_1.execFile);
const required = ['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID', 'MYPRINT_SHOP_ID', 'MYPRINT_AGENT_ID'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length)
    throw new Error(`MyPrint Agent is not configured. Add ${missing.join(', ')} to apps/agent/.env.`);
const config = { apiKey: process.env.FIREBASE_API_KEY, authDomain: process.env.FIREBASE_AUTH_DOMAIN, projectId: process.env.FIREBASE_PROJECT_ID, appId: process.env.FIREBASE_APP_ID };
const shopId = process.env.MYPRINT_SHOP_ID;
const agentId = process.env.MYPRINT_AGENT_ID;
const firebase = (0, app_1.initializeApp)(config);
const auth = (0, auth_1.getAuth)(firebase);
const db = (0, firestore_1.getFirestore)(firebase);
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let mainWindow = null;
const activeJobs = new Set();
let currentStatus = { status: 'Connecting…', desc: 'Starting secure edge connection…', type: '' };
function updateStatus(status, desc, type = 'online') {
    currentStatus = { status, desc, type };
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-status', currentStatus);
    }
}
function encryptedToken() {
    if (!electron_1.safeStorage.isEncryptionAvailable())
        throw new Error('OS keychain encryption is unavailable');
    const credentialFile = (0, node_path_1.join)(electron_1.app.getPath('userData'), 'agent-credential.bin');
    if (process.env.MYPRINT_RESET_CREDENTIAL === '1' && (0, node_fs_1.existsSync)(credentialFile))
        (0, node_fs_1.unlinkSync)(credentialFile);
    if ((0, node_fs_1.existsSync)(credentialFile)) {
        const saved = electron_1.safeStorage.decryptString((0, node_fs_1.readFileSync)(credentialFile));
        if (saved.split('.').length === 3)
            return saved;
        (0, node_fs_1.unlinkSync)(credentialFile);
    }
    const input = process.env.MYPRINT_AGENT_CUSTOM_TOKEN;
    if (!input)
        throw new Error('Agent is not provisioned');
    if (input.split('.').length !== 3)
        throw new Error('MYPRINT_AGENT_CUSTOM_TOKEN is not a signed Firebase custom token. Mint one with the server-side provisioning command.');
    (0, node_fs_1.writeFileSync)(credentialFile, electron_1.safeStorage.encryptString(input), { mode: 0o600 });
    return input;
}
async function discoverPrinters() {
    if (process.platform === 'win32') {
        const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name']);
        return stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    }
    const { stdout } = await exec('lpstat', ['-a']);
    return stdout.split(/\r?\n/).map((line) => line.split(/\s+/)[0]).filter(Boolean);
}
async function printBuffer(buffer, printer, mime) {
    const printers = await discoverPrinters();
    if (!printer || !printers.includes(printer))
        throw new Error('Selected printer is unavailable');
    if (process.platform === 'win32')
        throw new Error('Windows requires a configured PDF/image print adapter; do not shell-concatenate printer names.');
    await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)('lp', ['-d', printer, '-o', `document-format=${mime}`], { stdio: ['pipe', 'ignore', 'pipe'] });
        child.stdin.end(buffer);
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`lp exited ${code}`))));
    });
}
function setupIPCHandlers() {
    electron_1.ipcMain.handle('get-agent-status', () => currentStatus);
    electron_1.ipcMain.on('agent-answer', async (_e, { jobId, answer }) => {
        try {
            const jobRef = (0, firestore_1.doc)(db, 'shops', shopId, 'jobs', jobId);
            const signal = (0, firestore_1.collection)(jobRef, 'signal');
            await (0, firestore_1.setDoc)((0, firestore_1.doc)(signal, 'answer'), { from: 'agent', answer, created_at: (0, firestore_1.serverTimestamp)() });
            console.log('[agent] answer written to Firestore for job', jobId);
        }
        catch (e) {
            console.error('[agent] error writing answer for job', jobId, e);
        }
    });
    electron_1.ipcMain.on('agent-candidate', async (_e, { jobId, candidate }) => {
        try {
            const jobRef = (0, firestore_1.doc)(db, 'shops', shopId, 'jobs', jobId);
            const signal = (0, firestore_1.collection)(jobRef, 'signal');
            await (0, firestore_1.addDoc)(signal, { from: 'agent', candidate, created_at: (0, firestore_1.serverTimestamp)() });
        }
        catch (e) {
            console.error('[agent] error adding candidate for job', jobId, e);
        }
    });
    electron_1.ipcMain.on('job-status-update', async (_e, { jobId, status, extra }) => {
        try {
            const jobRef = (0, firestore_1.doc)(db, 'shops', shopId, 'jobs', jobId);
            const updateData = { status, ...extra, [`${status}_at`]: (0, firestore_1.serverTimestamp)() };
            if (status === 'transferring')
                updateData.agent_connected_at = (0, firestore_1.serverTimestamp)();
            await (0, firestore_1.updateDoc)(jobRef, updateData);
            console.log(`[agent] job ${jobId} status updated to ${status}`);
        }
        catch (e) {
            console.error(`[agent] error updating status for job ${jobId}`, e);
        }
    });
    electron_1.ipcMain.handle('print-document', async (_e, { jobId, buffer, printer, mime }) => {
        console.log(`[agent] printing document for job ${jobId} on printer ${printer} (${mime})`);
        await printBuffer(Buffer.from(buffer), printer, mime);
    });
    electron_1.ipcMain.on('log-message', (_e, { message, type }) => {
        console.log(`[agent renderer:${type || 'info'}] ${message}`);
    });
}
async function receive(job) {
    if (activeJobs.has(job.id))
        return;
    activeJobs.add(job.id);
    console.log('[agent] receive triggered for job', job.id, 'status', job.status);
    try {
        const jobRef = (0, firestore_1.doc)(db, 'shops', shopId, 'jobs', job.id);
        const signal = (0, firestore_1.collection)(jobRef, 'signal');
        let offerSnap = await (0, firestore_1.getDocFromServer)((0, firestore_1.doc)(signal, 'offer')).catch(() => (0, firestore_1.getDoc)((0, firestore_1.doc)(signal, 'offer')));
        if (!offerSnap.exists()) {
            console.warn('[agent] no offer for', job.id, 'waiting 30s for customer WebRTC offer...');
            for (let i = 0; i < 30; i++) {
                await new Promise((r) => setTimeout(r, 1000));
                try {
                    offerSnap = await (0, firestore_1.getDocFromServer)((0, firestore_1.doc)(signal, 'offer'));
                }
                catch {
                    offerSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(signal, 'offer'));
                }
                if (offerSnap.exists())
                    break;
                if (i % 5 === 0)
                    console.log('[agent] still waiting offer for', job.id, `${i + 1}s`);
            }
            if (!offerSnap.exists()) {
                console.warn('[agent] offer wait timeout for', job.id, 'customer closed tab before offer - marking failed');
                try {
                    await (0, firestore_1.updateDoc)(jobRef, { status: 'failed', failed_reason: 'no_offer_timeout', failed_at: (0, firestore_1.serverTimestamp)() });
                }
                catch { }
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
        const unsub = (0, firestore_1.onSnapshot)((0, firestore_1.query)(signal, (0, firestore_1.orderBy)('created_at')), (snap) => {
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
                const currentDoc = await (0, firestore_1.getDoc)(jobRef);
                const st = currentDoc.data()?.status;
                if (st === 'printed' || st === 'failed') {
                    unsub();
                    clearInterval(checkCompletion);
                    activeJobs.delete(job.id);
                }
            }
            catch {
                clearInterval(checkCompletion);
                activeJobs.delete(job.id);
            }
        }, 5000);
    }
    catch (e) {
        console.error('[agent] receive failed for', job.id, e);
        activeJobs.delete(job.id);
        throw e;
    }
}
async function start() {
    await (0, auth_1.signInWithCustomToken)(auth, encryptedToken());
    console.log('[agent] signed in as', auth.currentUser?.uid, 'claims', (await auth.currentUser?.getIdTokenResult())?.claims);
    const printers = await discoverPrinters();
    await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, 'shops', shopId, 'agents', agentId), { online: true, last_seen_at: (0, firestore_1.serverTimestamp)(), printers }, { merge: true });
    console.log('[agent] listening shop', shopId, 'agent', agentId);
    updateStatus('Online', `Listening shop "${shopId}" agent "${agentId}" (${printers.length} printers ready)`, 'online');
    (0, firestore_1.onSnapshot)((0, firestore_1.query)((0, firestore_1.collection)(db, 'shops', shopId, 'jobs'), (0, firestore_1.orderBy)('created_at', 'desc')), (snap) => {
        const hits = snap.docChanges().filter((c) => (c.type === 'added' || c.type === 'modified') && c.doc.data().agent_id === agentId && c.doc.data().status === 'ready_for_transfer');
        if (hits.length)
            console.log('[agent] job snapshot hits', hits.map((h) => `${h.type}:${h.doc.id}:${h.doc.data().status}`));
        hits.forEach((c) => void receive({ id: c.doc.id, ...c.doc.data() }).catch((e) => console.error('[agent] receive unhandled', e)));
    }, (err) => {
        console.error('[agent] jobs onSnapshot error', err);
        updateStatus('Error', `Firestore connection error: ${err.message}`, 'error');
    });
}
electron_1.app.whenReady().then(async () => {
    setupIPCHandlers();
    mainWindow = new electron_1.BrowserWindow({
        width: 480,
        height: 340,
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    await mainWindow.loadFile((0, node_path_1.join)(__dirname, 'index.html'));
    try {
        await start();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown startup error';
        console.error('MyPrint Agent startup failed:', message);
        updateStatus('Error', `Startup failed: ${message}`, 'error');
    }
});
