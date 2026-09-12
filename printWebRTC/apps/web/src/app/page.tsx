'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { paisaToINR, quotePaisa, sha256, type PrintOptions } from '@myprint/shared';
import { streamJobToAgent } from '@/lib/webrtc';

export default function CustomerPrint() {
  const params = useParams<{ shopId?: string }>(); const shopId = params.shopId;
  const [file, setFile] = useState<File>(); const [pages, setPages] = useState(1); const [cash, setCash] = useState(false); const [progress, setProgress] = useState<number>(); const [message, setMessage] = useState('');
  const [shop, setShop] = useState<{ name: string; id: string; pricing: { mono_paisa: number; color_paisa: number; duplex_discount_paisa: number; minimum_order_paisa: number }; agent: { id: string; printers: string[] } }>();
  const [printer, setPrinter] = useState('');
  useEffect(() => { if (!shopId) return; fetch(`/api/public/shops/${shopId}`).then(async (r) => { const result = await r.json(); if (!r.ok) throw new Error(result.error); setShop({ ...result.shop, pricing: result.pricing, agent: result.agent }); setPrinter(result.agent.printers?.[0] ?? ''); }).catch((e) => setMessage(e.message)); }, [shopId]);
  const options: PrintOptions = { copies: 1, color: false, duplex: false, paper: 'A4', printer_id: printer };
  const fee = shop ? quotePaisa(shop.pricing, options, pages) : 0;
  async function submit() {
    if (!file) return; setMessage('Creating private print job…');
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    const token = await user.getIdToken(); const hash = await sha256(await file.arrayBuffer());
    if (!shop) return; const response = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ shopId: shop.id, agentId: shop.agent.id, pages, options, paymentMethod: cash ? 'cash' : 'wallet', fileName: file.name, mimeType: file.type, byteLength: file.size, sha256: hash }) });
    const job = await response.json(); if (!response.ok) return setMessage(job.error);
    const transferJob = { ...job, shop_id: shop.id, customer_uid: user.uid, agent_id: shop.agent.id, payment_method: cash ? 'cash' as const : 'wallet' as const, options, pages, mime_type: file.type, file_name: file.name, byte_length: file.size, sha256: hash, created_at: null, expires_at: null };
    if (cash) {
      setMessage(`Cash order created (${paisaToINR(job.fee_paisa)}). Waiting for counter approval…`);
      const stop = onSnapshot(doc(db, 'shops', transferJob.shop_id, 'jobs', transferJob.id), async (snapshot) => {
        if (snapshot.data()?.status !== 'ready_for_transfer') return;
        stop(); setMessage('Cash approved. Connecting securely…');
        await streamJobToAgent(transferJob, file, setProgress); setMessage('Sent directly to the shop printer.');
      });
      return;
    }
    setMessage('Encrypted peer-to-peer transfer connecting…');
    await streamJobToAgent(transferJob, file, setProgress);
    setMessage('Sent directly to the shop printer. No file was uploaded to cloud storage.');
  }
  return <main className="shell"><span className="eyebrow">MyPrint · private edge printing</span><h1>{shop ? shop.name : 'Print from your phone.'}</h1><p className="muted">Your document streams straight to this shop’s desktop agent—never to cloud storage.</p><section className="card"><div className="grid"><label>Document<input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0])} /></label><label>Pages<input type="number" min="1" value={pages} onChange={(e) => setPages(Number(e.target.value))} /></label><label>Printer<select value={printer} onChange={(e) => setPrinter(e.target.value)}>{shop?.agent.printers.map((name) => <option key={name}>{name}</option>)}</select></label><label>Payment<select value={cash ? 'cash' : 'wallet'} onChange={(e) => setCash(e.target.value === 'cash')}><option value="wallet">Prepaid wallet</option><option value="cash">Cash at counter</option></select></label></div><p className="price">{shop ? paisaToINR(fee) : 'Loading…'}</p><p className="muted">Final price is recalculated and locked by the server.</p><button disabled={!file || !shop || !printer} onClick={() => void submit()}>{cash ? 'Place cash order' : 'Pay & send securely'}</button>{progress !== undefined && <p className="good">Streaming: {progress}%</p>}<p className="muted">{message || (!shopId ? 'Open this page using a shop QR code.' : '')}</p></section></main>;
}
