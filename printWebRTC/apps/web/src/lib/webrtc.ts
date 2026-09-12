'use client';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import type { PrintJob, TransferComplete, TransferMeta } from '@myprint/shared';
import { db } from './firebase';

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }; // replace with backend-issued TURN
const CHUNK_BYTES = 64 * 1024;

export async function streamJobToAgent(job: PrintJob, file: File, onProgress: (percent: number) => void) {
  const jobRef = doc(db, 'shops', job.shop_id, 'jobs', job.id);
  const signalRef = collection(jobRef, 'signal');
  const pc = new RTCPeerConnection(ICE);
  const channel = pc.createDataChannel('myprint-file', { ordered: true });
  channel.bufferedAmountLowThreshold = CHUNK_BYTES * 4;
  const unsub = onSnapshot(query(signalRef, orderBy('created_at')), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data();
      if (change.type === 'added' && data.from === 'agent' && data.candidate) await pc.addIceCandidate(data.candidate);
      if (change.type === 'added' && data.from === 'agent' && data.answer && !pc.currentRemoteDescription) await pc.setRemoteDescription(data.answer);
    }
  });
  pc.onicecandidate = ({ candidate }) => { if (candidate) void addDoc(signalRef, { from: 'customer', candidate: candidate.toJSON(), created_at: serverTimestamp() }); };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await setDoc(doc(signalRef, 'offer'), { from: 'customer', offer: pc.localDescription?.toJSON(), created_at: serverTimestamp() });
  await new Promise<void>((resolve, reject) => { channel.onopen = () => resolve(); channel.onerror = () => reject(new Error('Secure transfer channel failed')); });
  const meta: TransferMeta = { type: 'meta', jobId: job.id, fileName: file.name, mimeType: file.type, byteLength: file.size, sha256: job.sha256, options: job.options };
  channel.send(JSON.stringify(meta));
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    if (channel.bufferedAmount > CHUNK_BYTES * 8) await new Promise<void>((resolve) => { channel.onbufferedamountlow = () => resolve(); });
    channel.send(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
    onProgress(Math.round((Math.min(offset + CHUNK_BYTES, file.size) / file.size) * 100));
  }
  const complete: TransferComplete = { type: 'complete', jobId: job.id, sha256: job.sha256 };
  channel.send(JSON.stringify(complete));
  channel.close(); pc.close(); unsub();
}
