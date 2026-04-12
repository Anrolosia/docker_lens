/**
 * Detects the log level of a raw log line.
 * Returns one of: 'error', 'warn', 'info', 'debug', 'trace', or 'unknown'.
 */

const LEVEL_PATTERNS = [
  { level: 'error', re: /\b(error|err|crit|critical|fatal|emerg|alert|severe)\b/i },
  { level: 'warn', re: /\b(warn|warning)\b/i },
  { level: 'info', re: /\b(info|information|notice)\b/i },
  { level: 'debug', re: /\b(debug|dbg|debu)\b/i },
  { level: 'trace', re: /\b(trace|trce|verbose|verb)\b/i },
];

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

const TIMESTAMP_RES = [
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s*/,
  /^time="([^"]+)"\s*/,
  /^(\d{10,13})\s+/,
];

export function parseTimestamp(line) {
  for (const re of TIMESTAMP_RES) {
    const m = line.match(re);
    if (m) return { timestamp: m[1], rest: line.slice(m[0].length) };
  }
  return { timestamp: null, rest: line };
}

/**
 * Try to parse a log line as JSON.
 * Returns the parsed object if valid JSON, null otherwise.
 */
export function tryParseJson(line) {
  if (!line) return null;
  const start = line.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(line.slice(start));
  } catch {
    return null;
  }
}

const JSON_LEVEL_FIELDS = ['level', 'lvl', 'severity', 'log_level', 'loglevel'];
const JSON_MESSAGE_FIELDS = ['message', 'msg', 'text', 'body', 'log', 'event'];

export function jsonLogLevel(obj) {
  for (const field of JSON_LEVEL_FIELDS) {
    const val = obj[field];
    if (typeof val === 'string') {
      const v = val.toLowerCase();
      if (['error', 'err', 'fatal', 'critical'].includes(v)) return 'error';
      if (['warn', 'warning'].includes(v)) return 'warn';
      if (['info', 'information', 'notice'].includes(v)) return 'info';
      if (['debug', 'dbg'].includes(v)) return 'debug';
      if (['trace', 'verbose'].includes(v)) return 'trace';
    }
    if (typeof val === 'number') {
      if (val >= 50) return 'error';
      if (val >= 40) return 'warn';
      if (val >= 30) return 'info';
      if (val >= 20) return 'debug';
      return 'trace';
    }
  }
  return null;
}

export function jsonLogMessage(obj) {
  for (const field of JSON_MESSAGE_FIELDS) {
    if (typeof obj[field] === 'string') return obj[field];
  }
  return null;
}

export const JSON_SKIP_FIELDS = [
  'level',
  'lvl',
  'severity',
  'log_level',
  'loglevel',
  'message',
  'msg',
  'text',
  'body',
  'log',
  'event',
  'time',
  'timestamp',
  'ts',
  '@timestamp',
  't',
];

// ── Logfmt parser ────────────────────────────────────────────────────────────
// Logfmt format: key=value key="quoted value" key=true key=123
// Reference: https://brandur.org/logfmt

const LOGFMT_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)=("(?:[^"\\]|\\.)*"|[^\s]*)/;

/**
 * Parse a logfmt line into an array of { key, value } pairs.
 * Returns null if the line doesn't look like logfmt (needs at least 2 pairs).
 */
export function tryParseLogfmt(line) {
  if (!line || !line.includes('=')) return null;
  // Skip lines that are primarily JSON — let tryParseJson handle them
  if (line.trimStart().startsWith('{')) return null;

  const pairs = [];
  let rest = line.trim();

  while (rest.length > 0) {
    const m = rest.match(LOGFMT_RE);
    if (!m) {
      // Non-matching segment — if we have some pairs already, append as trailing text
      if (pairs.length > 0) {
        pairs.push({ key: null, value: rest.trim() });
      }
      break;
    }

    const key = m[1];
    let value = m[2];

    // Unquote if quoted
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }

    pairs.push({ key, value });
    rest = rest.slice(m[0].length).trimStart();
  }

  // Require at least 2 key=value pairs to be considered logfmt
  const kvCount = pairs.filter((p) => p.key !== null).length;
  return kvCount >= 2 ? pairs : null;
}

const LOGFMT_LEVEL_KEYS = ['level', 'lvl', 'severity', 'loglevel', 'log_level'];
const LOGFMT_MESSAGE_KEYS = ['msg', 'message', 'text', 'event', 'log'];

export function logfmtLevel(pairs) {
  for (const { key, value } of pairs) {
    if (key && LOGFMT_LEVEL_KEYS.includes(key.toLowerCase())) {
      const v = value.toLowerCase();
      if (['error', 'err', 'fatal', 'critical'].includes(v)) return 'error';
      if (['warn', 'warning'].includes(v)) return 'warn';
      if (['info', 'information', 'notice'].includes(v)) return 'info';
      if (['debug', 'dbg'].includes(v)) return 'debug';
      if (['trace', 'verbose'].includes(v)) return 'trace';
    }
  }
  return null;
}

export function logfmtMessage(pairs) {
  for (const { key, value } of pairs) {
    if (key && LOGFMT_MESSAGE_KEYS.includes(key.toLowerCase())) return value;
  }
  return null;
}

// ── Multiline grouping ────────────────────────────────────────────────────────

/**
 * Patterns that indicate a line is a CONTINUATION of the previous log entry
 * (not a new entry). These lines get grouped with the preceding line.
 */
const CONTINUATION_PATTERNS = [
  /^\s+at\s+/, // Java/JS: "    at ClassName.method (file:line)"
  /^\s+\.{3}\s+\d+\s+more/, // Java: "    ... 8 more"
  /^\s+Caused by:/, // Java chained exceptions
  /^\s+File\s+"[^"]+",\s+line\s+\d+/, // Python: "  File "foo.py", line 42"
  /^\s+[A-Za-z]/, // Generic indented continuation
  /^Traceback\s+\(most recent call/, // Python traceback header
  /^\s*\^\+*/, // Python caret indicator (^^^^^)
  /^[A-Za-z]+Error:/, // Python: "ValueError: ..."
  /^[A-Za-z]+Exception:/, // Java: "NullPointerException: ..."
  /^\s+---/, // Generic separator in traces
  /^\t/, // Tab-indented continuation
];

/**
 * Returns true if the line looks like a continuation of the previous log entry.
 */
export function isContinuationLine(line) {
  if (!line) return false;
  for (const re of CONTINUATION_PATTERNS) {
    if (re.test(line)) return true;
  }
  return false;
}

/**
 * Groups an array of log entries into multiline groups.
 * Each group is { lines: [...], isGroup: bool }.
 * Single lines return isGroup: false.
 */
export function groupLogLines(logs) {
  const groups = [];
  let current = null;

  for (const log of logs) {
    if (isContinuationLine(log.raw) && current) {
      // Append to existing group
      current.lines.push(log);
      current.isGroup = true;
    } else {
      // Start a new group
      if (current) groups.push(current);
      current = { lines: [log], isGroup: false };
    }
  }

  if (current) groups.push(current);
  return groups;
}

/**
 * Groups log lines by identical timestamp — same ts = same visual group.
 * Lines without a timestamp are attached to the previous group.
 * Returns array of { ts, lines: [...], isGroup }.
 */
// Truncate timestamp to the second (ignore sub-second precision) for grouping
function tsToSecond(ts) {
  if (!ts) return null;
  // ISO format: 2026-04-12T14:40:00.237Z → 2026-04-12T14:40:00
  const dotIdx = ts.indexOf('.');
  return dotIdx !== -1 ? ts.slice(0, dotIdx) : ts;
}

export function groupByTimestamp(logs) {
  const groups = [];
  let current = null;

  for (const log of logs) {
    const sec = tsToSecond(log.ts);

    if (!sec) {
      // No timestamp — attach to previous group or start new
      if (current) {
        current.lines.push(log);
        current.isGroup = true;
      } else {
        current = { ts: null, sec: null, lines: [log], isGroup: false };
      }
    } else if (current && current.sec === sec) {
      // Same second — group together
      current.lines.push(log);
      current.isGroup = true;
    } else {
      // New second — start new group
      if (current) groups.push(current);
      current = { ts: log.ts, sec, lines: [log], isGroup: false };
    }
  }

  if (current) groups.push(current);
  return groups;
}
