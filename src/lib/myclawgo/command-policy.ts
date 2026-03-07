export const SAFE_COMMAND_PATTERNS: RegExp[] = [
  /^openclaw\s+skills\s+list$/i,
  /^openclaw\s+skills\s+check(?:\s+[a-zA-Z0-9_.@/-]+)?$/i,
  /^openclaw\s+skills\s+info\s+[a-zA-Z0-9_.@/-]+$/i,
  /^openclaw\s+models\s+status$/i,
  /^openclaw\s+models\s+list$/i,
  /^openclaw\s+models\s+set\s+[a-zA-Z0-9_.:/-]+$/i,
  /^openclaw\s+agents\s+list(?:\s+--bindings)?$/i,
  /^openclaw\s+agents\s+add\s+[a-zA-Z0-9_.-]+$/i,
  /^openclaw\s+agent\s+--(?:message|agent|thinking|model|help)\b[\s\S]*$/i,
  /^clawhub\s+install\s+[a-zA-Z0-9_.@/-]+$/i,
  /^clawhub\s+list$/i,
  /^clawhub\s+search\s+[^\n]+$/i,
];

const FORBIDDEN_SHELL_CHARS = /[;&|><`$\\]/;

export function isSafeCommandInput(text: string) {
  const value = text.trim();
  if (!value || value.length > 300) return false;
  if (/[\r\n]/.test(value)) return false;
  if (FORBIDDEN_SHELL_CHARS.test(value)) return false;
  return SAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(value));
}

export function getCommandTimeoutMs(command: string) {
  const c = command.trim().toLowerCase();
  if (c.startsWith('clawhub install ')) return 120_000;
  if (c.startsWith('openclaw agent ')) return 60_000;
  return 20_000;
}

export function getClientTimeoutMs(isCommand: boolean, command?: string) {
  if (!isCommand) return 180_000;
  const base = getCommandTimeoutMs(command || '');
  return Math.max(base + 10_000, 180_000);
}
