"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const peers = new Map();
function appendLog(text, type = 'info') {
    const container = document.getElementById('log-container');
    if (!container)
        return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}
if (window.myprintAPI) {
    const updateUI = ({ status, desc, type }) => {
        const statusEl = document.getElementById('agent-status');
        const descEl = document.getElementById('status-desc');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `badge ${type || ''}`;
        }
        if (descEl)
            descEl.textContent = desc;
    };
    window.myprintAPI.onUpdateStatus(updateUI);
    // Fetch initial status immediately on renderer load
    window.myprintAPI.getAgentStatus().then(updateUI).catch(() => { });
    window.myprintAPI.onCustomerCandidate(async ({ jobId, candidate }) => {
        const peer = peers.get(jobId);
        if (peer && candidate) {
            try {
                await peer.addIceCandidate(candidate);
            }
            catch (e) {
                console.warn('[renderer] addIceCandidate failed for', jobId, e);
            }
        }
    });
    window.myprintAPI.onStartJob(async ({ job, offer, ice }) => {
        appendLog(`WebRTC transfer starting for job ${job.id}`, 'info');
        const peer = new RTCPeerConnection(ice);
        peers.set(job.id, peer);
        let parts = [];
        let meta;
        let total = 0;
        peer.onicecandidate = ({ candidate }) => {
            if (candidate) {
                window.myprintAPI.sendAgentCandidate(job.id, candidate.toJSON());
            }
        };
        peer.ondatachannel = ({ channel }) => {
            channel.onmessage = async ({ data }) => {
                try {
                    if (typeof data === 'string') {
                        const control = JSON.parse(data);
                        if (control.type === 'meta') {
                            meta = control;
                            if (meta.byteLength !== job.byte_length || meta.sha256 !== job.sha256) {
                                channel.close();
                                window.myprintAPI.sendJobStatus(job.id, 'failed', { failed_reason: 'meta_mismatch' });
                                appendLog(`Job ${job.id} meta mismatch`, 'error');
                                throw new Error('Transfer metadata does not match immutable job');
                            }
                            appendLog(`Job ${job.id} metadata verified (${meta.fileName}, ${meta.byteLength} bytes)`, 'info');
                            return;
                        }
                        if (control.type === 'complete' && meta) {
                            appendLog(`Job ${job.id} data received, checking SHA-256 integrity…`, 'info');
                            // Concatenate received parts
                            const fullBuffer = new Uint8Array(total);
                            let offset = 0;
                            for (const part of parts) {
                                fullBuffer.set(part, offset);
                                offset += part.length;
                            }
                            // Calculate SHA-256 hash using Web Crypto API
                            const hashBuffer = await crypto.subtle.digest('SHA-256', fullBuffer);
                            const hashArray = Array.from(new Uint8Array(hashBuffer));
                            const digest = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
                            if (total !== meta.byteLength || digest !== meta.sha256 || control.sha256 !== digest) {
                                window.myprintAPI.sendJobStatus(job.id, 'failed', { failed_reason: 'integrity_failed' });
                                appendLog(`Job ${job.id} SHA-256 mismatch!`, 'error');
                                throw new Error('Transfer integrity check failed');
                            }
                            window.myprintAPI.sendJobStatus(job.id, 'received');
                            appendLog(`Job ${job.id} transfer complete & verified. Printing…`, 'success');
                            // Print document via Main process IPC
                            await window.myprintAPI.printDocument(job.id, fullBuffer.buffer, meta.options.printer_id, meta.mimeType);
                            window.myprintAPI.sendJobStatus(job.id, 'printed');
                            appendLog(`Job ${job.id} printed successfully!`, 'success');
                            channel.close();
                            peer.close();
                            peers.delete(job.id);
                        }
                    }
                    else {
                        const chunk = new Uint8Array(data);
                        total += chunk.byteLength;
                        if (!meta || total > meta.byteLength) {
                            channel.close();
                            window.myprintAPI.sendJobStatus(job.id, 'failed', { failed_reason: 'payload_overflow' });
                            appendLog(`Job ${job.id} payload overflow`, 'error');
                            throw new Error('Unexpected transfer payload');
                        }
                        parts.push(chunk);
                    }
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    appendLog(`Job ${job.id} error: ${msg}`, 'error');
                    channel.close();
                    peer.close();
                    peers.delete(job.id);
                }
            };
        };
        try {
            await peer.setRemoteDescription(offer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            window.myprintAPI.sendAgentAnswer(job.id, peer.localDescription?.toJSON());
            window.myprintAPI.sendJobStatus(job.id, 'transferring');
            appendLog(`Job ${job.id} answer created & sent. Transferring…`, 'info');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            appendLog(`Failed setting description for ${job.id}: ${msg}`, 'error');
            peer.close();
            peers.delete(job.id);
        }
    });
}
