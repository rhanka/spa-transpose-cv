/**
 * Minimal logger interface for @cv-transpose/core.
 *
 * Ports (api, future workers) supply their own concrete logger if they want
 * structured output; core code defaults to JSON-line stdout/stderr so we never
 * pull a logging library into the core package.
 */
export interface CoreLogger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
}

export const defaultLogger: CoreLogger = {
  info: (m, c) => console.log(JSON.stringify({ level: 'info', msg: m, ...c })),
  error: (m, c) => console.error(JSON.stringify({ level: 'error', msg: m, ...c })),
  warn: (m, c) => console.warn(JSON.stringify({ level: 'warn', msg: m, ...c })),
};
