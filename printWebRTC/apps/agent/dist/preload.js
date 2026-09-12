"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('myprintAPI', {
    onStartJob: (callback) => {
        electron_1.ipcRenderer.on('start-job', (_event, data) => callback(data));
    },
    onCustomerCandidate: (callback) => {
        electron_1.ipcRenderer.on('customer-candidate', (_event, data) => callback(data));
    },
    sendAgentAnswer: (jobId, answer) => {
        electron_1.ipcRenderer.send('agent-answer', { jobId, answer });
    },
    sendAgentCandidate: (jobId, candidate) => {
        electron_1.ipcRenderer.send('agent-candidate', { jobId, candidate });
    },
    sendJobStatus: (jobId, status, extra) => {
        electron_1.ipcRenderer.send('job-status-update', { jobId, status, extra });
    },
    printDocument: (jobId, buffer, printer, mime) => {
        return electron_1.ipcRenderer.invoke('print-document', { jobId, buffer, printer, mime });
    },
    onUpdateStatus: (callback) => {
        electron_1.ipcRenderer.on('agent-status', (_event, data) => callback(data));
    },
    getAgentStatus: () => electron_1.ipcRenderer.invoke('get-agent-status'),
    logMessage: (message, type = 'info') => {
        electron_1.ipcRenderer.send('log-message', { message, type });
    }
});
