const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function createSession(password: string): Promise<{ sessionId: string; expiresAt: string }> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
  return res.json();
}

export async function uploadFiles(sessionId: string, password: string, files: File[]): Promise<{ uploaded: number }> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/upload`, {
    method: 'POST',
    headers: { 'X-Session-Password': password },
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function markReady(sessionId: string, password: string, prompt: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/ready`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Password': password },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Mark ready failed: ${res.status}`);
}

export async function startProcessing(sessionId: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/run`, {
    method: 'POST',
    headers: { 'X-Session-Password': password },
  });
  if (!res.ok) throw new Error(`Start processing failed: ${res.status}`);
}

export interface FileStatus {
  name: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  output?: string;
}

export interface StreamEvent {
  type: 'stream';
  fileIndex: number;
  phase: string;
  thinking_delta?: string;
  content_delta?: string;
  parsed_keys?: Record<string, unknown>;
  elapsed_ms?: number;
  error?: string;
  attention_cv?: string;
  attention_trad?: string;
  tokenInfo?: string;
}

export interface StatusEvent {
  type: 'status';
  status: string;
  files: FileStatus[];
  expiresAt: string;
}

export type SseData = StreamEvent | StatusEvent;

export function subscribeStatus(
  sessionId: string,
  onMessage: (data: SseData) => void,
): EventSource {
  const es = new EventSource(`${API_BASE}/sessions/${sessionId}/status`);
  es.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data) as SseData);
    } catch { /* ignore */ }
  };
  return es;
}

export async function getResults(sessionId: string): Promise<StatusEvent & { outputs: string[] }> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/results`);
  if (!res.ok) throw new Error(`Get results failed: ${res.status}`);
  return res.json();
}

export async function downloadFile(sessionId: string, password: string, fileName: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/download/${encodeURIComponent(fileName)}`, {
    headers: { 'X-Session-Password': password },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}
