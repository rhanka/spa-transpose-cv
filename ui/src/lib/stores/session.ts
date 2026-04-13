import { writable, derived } from 'svelte/store';
import type { FileStatus } from '$lib/api';

export const sessionId = writable<string | null>(null);
export const sessionPassword = writable<string>('');
export const sessionStatus = writable<string>('idle');
export const sessionFiles = writable<FileStatus[]>([]);
export const sessionExpiresAt = writable<string>('');
export const sessionOutputs = writable<string[]>([]);

export const progress = derived(sessionFiles, ($files) => {
  if ($files.length === 0) return 0;
  const done = $files.filter(f => f.status === 'done' || f.status === 'error').length;
  return Math.round((done / $files.length) * 100);
});

export const isComplete = derived(sessionStatus, ($s) => $s === 'done' || $s === 'error');

export function resetSession() {
  sessionId.set(null);
  sessionPassword.set('');
  sessionStatus.set('idle');
  sessionFiles.set([]);
  sessionExpiresAt.set('');
  sessionOutputs.set([]);
}
