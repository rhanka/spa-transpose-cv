import type { SseEvent } from './orchestrator.js';

type Listener = (fileIndex: number, event: SseEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(sessionId: string, listener: Listener): () => void {
  if (!listeners.has(sessionId)) listeners.set(sessionId, new Set());
  listeners.get(sessionId)!.add(listener);
  return () => {
    listeners.get(sessionId)?.delete(listener);
    if (listeners.get(sessionId)?.size === 0) listeners.delete(sessionId);
  };
}

export function emit(sessionId: string, fileIndex: number, event: SseEvent): void {
  for (const listener of listeners.get(sessionId) || []) {
    try { listener(fileIndex, event); } catch { /* ignore */ }
  }
}

export function createEmitter(sessionId: string) {
  return (fileIndex: number, event: SseEvent) => emit(sessionId, fileIndex, event);
}
