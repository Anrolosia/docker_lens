/**
 * Detects the log level of a raw log line.
 * Returns one of: 'error', 'warn', 'info', 'debug', 'trace', or 'unknown'.
 */

const LEVEL_PATTERNS = [
  // Explicit level fields: level=error, "level":"error", [ERROR], etc.
  {
    level: 'error',
    re: /\b(error|err|crit|critical|fatal|emerg|alert|severe)\b/i,
  },
  { level: 'warn', re: /\b(warn|warning)\b/i },
  { level: 'info', re: /\b(info|information|notice)\b/i },
  { level: 'debug', re: /\b(debug|dbg|debu)\b/i },
  { level: 'trace', re: /\b(trace|trce|verbose|verb)\b/i },
];

// HTTP status codes: 5xx = error, 4xx = warn, 2xx/3xx = info
const HTTP_STATUS_RE = /\s(5\d{2}|4\d{2}|[23]\d{2})\s/;

export function parseLogLevel(line) {
  for (const { level, re } of LEVEL_PATTERNS) {
    if (re.test(line)) return level;
  }
  const httpMatch = line.match(HTTP_STATUS_RE);
  if (httpMatch) {
    const code = parseInt(httpMatch[1], 10);
    if (code >= 500) return 'error';
    if (code >= 400) return 'warn';
    return 'info';
  }
  return 'unknown';
}

/**
 * Tries to extract a timestamp from the beginning of a log line.
 * Returns { timestamp: string|null, rest: string }
 */
const TIMESTAMP_RES = [
  // ISO 8601 / RFC3339: 2026-04-07T18:04:59.014Z or 2026-04-07 18:04:59
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s*/,
  // time="..." (Docker / logrus style)
  /^time="([^"]+)"\s*/,
  // Unix epoch (10 or 13 digits)
  /^(\d{10,13})\s+/,
];

export function parseTimestamp(line) {
  for (const re of TIMESTAMP_RES) {
    const m = line.match(re);
    if (m) {
      return { timestamp: m[1], rest: line.slice(m[0].length) };
    }
  }
  return { timestamp: null, rest: line };
}
