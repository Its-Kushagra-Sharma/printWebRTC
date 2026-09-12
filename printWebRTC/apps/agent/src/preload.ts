import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('myprintAPI', {
  onStartJob: (callback: (data: { job: any; offer: any; ice: any }) => void) => {
    ipcRenderer.on('start-job', (_event, data) => callback(data));
  },
  onCustomerCandidate: (callback: (data: { jobId: string; candidate: any }) => void) => {
    ipcRenderer.on('customer-candidate', (_event, data) => callback(data));
  },
  sendAgentAnswer: (jobId: string, answer: any) => {
    ipcRenderer.send('agent-answer', { jobId, answer });
  },
  sendAgentCandidate: (jobId: string, candidate: any) => {
    ipcRenderer.send('agent-candidate', { jobId, candidate });
  },
  sendJobStatus: (jobId: string, status: string, extra?: Record<string, any>) => {
    ipcRenderer.send('job-status-update', { jobId, status, extra });
  },
  printDocument: (jobId: string, buffer: ArrayBuffer, printer: string | undefined, mime: string) => {
    return ipcRenderer.invoke('print-document', { jobId, buffer, printer, mime });
  },
  onUpdateStatus: (callback: (data: { status: string; desc: string; type?: string }) => void) => {
    ipcRenderer.on('agent-status', (_event, data) => callback(data));
  },
  getAgentStatus: () => ipcRenderer.invoke('get-agent-status'),
  logMessage: (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    ipcRenderer.send('log-message', { message, type });
  }
});
