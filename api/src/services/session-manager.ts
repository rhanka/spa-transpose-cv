import { mkdir, readdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { generateSessionId, generateSalt, deriveKey, encrypt, decrypt } from './crypto.js';
import { logger } from '../config/logger.js';

export type SessionStatus = 'created' | 'uploading' | 'ready' | 'processing' | 'done' | 'error';

export interface FileEntry {
  originalName: string;
  encryptedName: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  outputName?: string;
}

export interface SessionMeta {
  id: string;
  createdAt: string;
  salt: string;
  prompt: string;
  provider?: string;
  status: SessionStatus;
  files: FileEntry[];
  expiresAt: string;
}

// In-memory key cache (cleared on restart — acceptable for ephemeral sessions)
const keyCache = new Map<string, Buffer>();

// Mutex per session to prevent meta.json race conditions
const metaLocks = new Map<string, Promise<void>>();

async function withMetaLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = metaLocks.get(id) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>(r => { resolve = r; });
  metaLocks.set(id, next);
  await prev;
  try {
    return await fn();
  } finally {
    resolve!();
  }
}

function sessionDir(id: string): string {
  return join(env.DATA_DIR, id);
}

function metaPath(id: string): string {
  return join(sessionDir(id), 'meta.json');
}

export async function createSession(password: string): Promise<SessionMeta> {
  const id = generateSessionId();
  const salt = generateSalt();
  const key = deriveKey(password, salt);
  keyCache.set(id, key);

  const dir = sessionDir(id);
  await mkdir(join(dir, 'inputs'), { recursive: true });
  await mkdir(join(dir, 'outputs'), { recursive: true });
  await mkdir(join(dir, 'tmp'), { recursive: true });

  const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_HOURS * 3600_000).toISOString();
  const meta: SessionMeta = {
    id,
    createdAt: new Date().toISOString(),
    salt,
    prompt: '',
    status: 'created',
    files: [],
    expiresAt,
  };

  await writeMeta(meta);
  logger.info({ sessionId: id }, 'Session created');
  return meta;
}

export async function getMeta(id: string): Promise<SessionMeta | null> {
  try {
    const data = await readFile(metaPath(id), 'utf-8');
    return JSON.parse(data) as SessionMeta;
  } catch {
    return null;
  }
}

export async function writeMeta(meta: SessionMeta): Promise<void> {
  await writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2));
}

export async function updateStatus(id: string, status: SessionStatus): Promise<void> {
  await withMetaLock(id, async () => {
    const meta = await getMeta(id);
    if (!meta) throw new Error(`Session ${id} not found`);
    meta.status = status;
    await writeMeta(meta);
  });
}

export async function updateFileStatus(
  id: string,
  fileIndex: number,
  status: FileEntry['status'],
  extra?: { outputName?: string; error?: string },
): Promise<void> {
  await withMetaLock(id, async () => {
    const meta = await getMeta(id);
    if (!meta) throw new Error(`Session ${id} not found`);
    meta.files[fileIndex].status = status;
    if (extra?.outputName) meta.files[fileIndex].outputName = extra.outputName;
    if (extra?.error) meta.files[fileIndex].error = extra.error;
    await writeMeta(meta);
  });
}

export function authenticateSession(id: string, password: string, salt: string): Buffer {
  // Check cache first
  const cached = keyCache.get(id);
  if (cached) return cached;
  // Re-derive key
  const key = deriveKey(password, salt);
  keyCache.set(id, key);
  return key;
}

export function getSessionKey(id: string): Buffer | undefined {
  return keyCache.get(id);
}

export async function addFile(id: string, originalName: string, fileData: Buffer, key: Buffer): Promise<FileEntry> {
  const encryptedName = `${originalName}.enc`;
  const encrypted = encrypt(fileData, key);
  await writeFile(join(sessionDir(id), 'inputs', encryptedName), encrypted);

  const meta = await getMeta(id);
  if (!meta) throw new Error(`Session ${id} not found`);

  const entry: FileEntry = { originalName, encryptedName, status: 'pending' };
  meta.files.push(entry);
  meta.status = 'uploading';
  await writeMeta(meta);

  logger.info({ sessionId: id, file: originalName }, 'File uploaded');
  return entry;
}

export async function getDecryptedFile(id: string, fileName: string, key: Buffer, subdir: 'inputs' | 'outputs'): Promise<Buffer> {
  const encName = fileName.endsWith('.enc') ? fileName : `${fileName}.enc`;
  const encryptedData = await readFile(join(sessionDir(id), subdir, encName));
  return decrypt(encryptedData, key);
}

export async function listOutputs(id: string): Promise<string[]> {
  try {
    const files = await readdir(join(sessionDir(id), 'outputs'));
    return files.filter(f => f.endsWith('.enc'));
  } catch {
    return [];
  }
}

export async function deleteSession(id: string): Promise<void> {
  keyCache.delete(id);
  await rm(sessionDir(id), { recursive: true, force: true });
  logger.info({ sessionId: id }, 'Session deleted');
}

export async function listAllSessions(): Promise<string[]> {
  try {
    const entries = await readdir(env.DATA_DIR);
    return entries;
  } catch {
    return [];
  }
}

export async function getSessionAge(id: string): Promise<number> {
  try {
    const s = await stat(metaPath(id));
    return Date.now() - s.mtimeMs;
  } catch {
    return Infinity;
  }
}
