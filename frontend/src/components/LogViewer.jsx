import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Convert from 'ansi-to-html';
import {
  Box,
  Typography,
  Paper,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Tooltip,
  Collapse,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  KeyboardDoubleArrowDown as ScrollBottomIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import {
  parseLogLevel,
  tryParseJson,
  jsonLogLevel,
  jsonLogMessage,
  JSON_SKIP_FIELDS,
  tryParseLogfmt,
  logfmtLevel,
  logfmtMessage,
  groupLogLines,
  groupByTimestamp,
} from '../utils/logParser';

const convert = new Convert({
  fg: 'currentColor',
  bg: 'transparent',
  newline: false,
  escapeXML: true,
});

const LEVEL_STYLES = {
  error: { color: '#e53935', label: 'ERR' },
  warn: { color: '#f57c00', label: 'WRN' },
  info: { color: '#2e7d32', label: 'INF' },
  debug: { color: '#1565c0', label: 'DBG' },
  trace: { color: '#6a1b9a', label: 'TRC' },
  unknown: { color: 'text.secondary', label: '···' },
};

const CONTAINER_COLORS = [
  '#e53935',
  '#d81b60',
  '#8e24aa',
  '#5e35b1',
  '#1e88e5',
  '#00897b',
  '#43a047',
  '#f57c00',
  '#6d4c41',
  '#546e7a',
  '#c0ca33',
  '#00acc1',
  '#fb8c00',
  '#f4511e',
  '#039be5',
];

function getContainerColor(name) {
  if (!name) return '#546e7a';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CONTAINER_COLORS[Math.abs(hash) % CONTAINER_COLORS.length];
}

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return '';
  }
}

// ── Shared row wrapper ───────────────────────────────────────────────────────
const ROW_BASE = {
  px: '6px',
  py: '2px',
};

function ContainerBadge({ name }) {
  if (!name) return null;
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        fontSize: '0.72rem',
        fontWeight: 700,
        px: '5px',
        py: '1px',
        borderRadius: '3px',
        backgroundColor: getContainerColor(name),
        color: '#fff',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        width: '110px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'inline-block',
        textAlign: 'center',
      }}
      title={name}
    >
      {name}
    </Box>
  );
}
ContainerBadge.propTypes = { name: PropTypes.string };

function TimestampCell({ ts }) {
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        fontSize: '0.75rem',
        color: 'primary.main',
        opacity: 0.75,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        minWidth: '148px',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: '1.55',
      }}
    >
      {formatTimestamp(ts)}
    </Box>
  );
}
TimestampCell.propTypes = { ts: PropTypes.string };

function LevelDot({ level }) {
  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES.unknown;
  return (
    <Box
      component="span"
      title={style.label}
      sx={{
        flexShrink: 0,
        width: '9px',
        height: '9px',
        borderRadius: '50%',
        mt: '6px',
        backgroundColor: level !== 'unknown' ? style.color : 'transparent',
        border: level === 'unknown' ? '1px solid' : 'none',
        borderColor: 'text.disabled',
        display: 'inline-block',
        userSelect: 'none',
      }}
    />
  );
}
LevelDot.propTypes = { level: PropTypes.string };

function FormatBadge({ label, color }) {
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        fontSize: '0.65rem',
        fontWeight: 700,
        px: '4px',
        py: '1px',
        borderRadius: '3px',
        backgroundColor: `${color}22`,
        color,
        userSelect: 'none',
      }}
    >
      {label}
    </Box>
  );
}
FormatBadge.propTypes = { label: PropTypes.string, color: PropTypes.string };

// ── JSON components ──────────────────────────────────────────────────────────
const KEY_COLOR = '#5e35b1';
const STR_COLOR = '#2e7d32';
const NUM_COLOR = '#1565c0';
const BOOL_NULL_COLOR = '#f57c00';

function JsonValue({ value }) {
  if (value === null) return <span style={{ color: BOOL_NULL_COLOR }}>null</span>;
  if (typeof value === 'boolean')
    return <span style={{ color: BOOL_NULL_COLOR }}>{String(value)}</span>;
  if (typeof value === 'number') return <span style={{ color: NUM_COLOR }}>{value}</span>;
  if (typeof value === 'string')
    return <span style={{ color: STR_COLOR }}>&quot;{value}&quot;</span>;
  return <span>{JSON.stringify(value)}</span>;
}
JsonValue.propTypes = { value: PropTypes.any };

function JsonFields({ obj, skip }) {
  return (
    <Box
      sx={{
        pl: 2,
        mt: 0.5,
        borderLeft: '2px solid',
        borderColor: 'divider',
        fontSize: '0.8rem',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      }}
    >
      {Object.entries(obj)
        .filter(([k]) => !skip.includes(k))
        .map(([k, v]) => (
          <Box key={k} component="div" sx={{ lineHeight: 1.6 }}>
            <span style={{ color: KEY_COLOR }}>{k}</span>
            <span style={{ opacity: 0.5 }}>: </span>
            <JsonValue value={v} />
          </Box>
        ))}
    </Box>
  );
}
JsonFields.propTypes = {
  obj: PropTypes.object.isRequired,
  skip: PropTypes.arrayOf(PropTypes.string),
};

const JsonLogLine = React.memo(({ raw, ts, containerName, isOdd, parsed, hideLevel }) => {
  const [expanded, setExpanded] = useState(false);
  const level = jsonLogLevel(parsed) ?? parseLogLevel(raw);
  const message = jsonLogMessage(parsed) ?? raw;
  const skip = useMemo(() => JSON_SKIP_FIELDS.filter((f) => f in parsed), [parsed]);
  const hasExtra = Object.keys(parsed).some((k) => !skip.includes(k));

  return (
    <Box
      component="div"
      sx={{
        ...ROW_BASE,
        backgroundColor: isOdd ? 'action.hover' : 'transparent',
        '&:hover': { backgroundColor: 'action.selected' },
        cursor: hasExtra ? 'pointer' : 'default',
      }}
      onClick={hasExtra ? () => setExpanded((v) => !v) : undefined}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
        <ContainerBadge name={containerName} />
        <TimestampCell ts={ts} />
        {hideLevel ? (
          <Box component="span" sx={{ flexShrink: 0, width: '9px' }} />
        ) : (
          <LevelDot level={level} />
        )}
        <FormatBadge label="JSON" color={KEY_COLOR} />
        <Box
          component="span"
          sx={{
            color: 'text.primary',
            fontSize: '0.875rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.55,
            flexGrow: 1,
          }}
        >
          {message}
        </Box>
        {hasExtra && (
          <Box component="span" sx={{ flexShrink: 0, color: 'text.secondary', lineHeight: 1 }}>
            {expanded ? (
              <ExpandLessIcon sx={{ fontSize: '1rem' }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: '1rem' }} />
            )}
          </Box>
        )}
      </Box>
      {hasExtra && (
        <Collapse in={expanded}>
          <JsonFields obj={parsed} skip={skip} />
        </Collapse>
      )}
    </Box>
  );
});
JsonLogLine.displayName = 'JsonLogLine';
JsonLogLine.propTypes = {
  raw: PropTypes.string.isRequired,
  ts: PropTypes.string,
  containerName: PropTypes.string,
  isOdd: PropTypes.bool,
  parsed: PropTypes.object.isRequired,
  hideLevel: PropTypes.bool,
};

// ── Logfmt components ────────────────────────────────────────────────────────
const LOGFMT_KEY_COLOR = '#5e35b1';
const LOGFMT_STR_COLOR = '#c0ca33';
const LOGFMT_HIGHLIGHT_KEYS = ['msg', 'message', 'text', 'event', 'error', 'err', 'caller', 'func'];

function LogfmtPair({ keyName, value }) {
  const isHighlight = LOGFMT_HIGHLIGHT_KEYS.includes(keyName?.toLowerCase());
  return (
    <Box component="span" sx={{ mr: '10px', whiteSpace: 'nowrap' }}>
      <span style={{ color: LOGFMT_KEY_COLOR, fontWeight: 600 }}>{keyName}</span>
      <span style={{ opacity: 0.4 }}>=</span>
      <span style={{ color: isHighlight ? 'inherit' : LOGFMT_STR_COLOR }}>{value}</span>
    </Box>
  );
}
LogfmtPair.propTypes = { keyName: PropTypes.string, value: PropTypes.string };

const LogfmtLogLine = React.memo(({ raw, ts, containerName, isOdd, pairs, hideLevel }) => {
  const level = logfmtLevel(pairs) ?? parseLogLevel(raw);
  const message = logfmtMessage(pairs);

  return (
    <Box
      component="div"
      sx={{
        ...ROW_BASE,
        backgroundColor: isOdd ? 'action.hover' : 'transparent',
        '&:hover': { backgroundColor: 'action.selected' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '6px', minWidth: 0 }}>
        <ContainerBadge name={containerName} />
        <TimestampCell ts={ts} />
        {hideLevel ? (
          <Box component="span" sx={{ flexShrink: 0, width: '9px' }} />
        ) : (
          <LevelDot level={level} />
        )}
        <FormatBadge label="FMT" color={LOGFMT_KEY_COLOR} />
        <Box
          component="span"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            fontSize: '0.8rem',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.55,
          }}
        >
          {message && (
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 500, mr: '10px' }}>
              {message}
            </Box>
          )}
          {pairs
            .filter((p) => p.key !== null && !LOGFMT_HIGHLIGHT_KEYS.includes(p.key?.toLowerCase()))
            .map((p, i) => (
              <LogfmtPair key={i} keyName={p.key} value={p.value} />
            ))}
        </Box>
      </Box>
    </Box>
  );
});
LogfmtLogLine.displayName = 'LogfmtLogLine';
LogfmtLogLine.propTypes = {
  raw: PropTypes.string.isRequired,
  ts: PropTypes.string,
  containerName: PropTypes.string,
  isOdd: PropTypes.bool,
  pairs: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, value: PropTypes.string }))
    .isRequired,
  hideLevel: PropTypes.bool,
};

// ── Plain log line ───────────────────────────────────────────────────────────
const LogLine = React.memo(({ raw, ts, containerName, isOdd, hideLevel }) => {
  const level = parseLogLevel(raw);
  return (
    <Box
      component="div"
      sx={{
        ...ROW_BASE,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '6px',
        backgroundColor: isOdd ? 'action.hover' : 'transparent',
        '&:hover': { backgroundColor: 'action.selected' },
      }}
    >
      <ContainerBadge name={containerName} />
      <TimestampCell ts={ts} />
      {hideLevel ? (
        <Box component="span" sx={{ flexShrink: 0, width: '9px' }} />
      ) : (
        <LevelDot level={level} />
      )}
      <Box
        component="span"
        sx={{
          color: 'text.primary',
          fontSize: '0.875rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.55,
          flexGrow: 1,
          minWidth: 0,
        }}
        dangerouslySetInnerHTML={{ __html: convert.toHtml(raw) }}
      />
    </Box>
  );
});
LogLine.displayName = 'LogLine';
LogLine.propTypes = {
  raw: PropTypes.string.isRequired,
  ts: PropTypes.string,
  containerName: PropTypes.string,
  isOdd: PropTypes.bool,
  hideLevel: PropTypes.bool,
};

// ── Smart line router ────────────────────────────────────────────────────────
const SmartLogLineInner = ({ log, index }) => {
  const json = tryParseJson(log.raw);
  if (json)
    return (
      <JsonLogLine
        raw={log.raw}
        ts={log.ts}
        containerName={log.containerName}
        isOdd={index % 2 !== 0}
        parsed={json}
        hideLevel={log.hideLevel}
      />
    );

  const logfmt = tryParseLogfmt(log.raw);
  if (logfmt)
    return (
      <LogfmtLogLine
        raw={log.raw}
        ts={log.ts}
        containerName={log.containerName}
        isOdd={index % 2 !== 0}
        pairs={logfmt}
        hideLevel={log.hideLevel}
      />
    );

  return (
    <LogLine
      raw={log.raw}
      ts={log.ts}
      containerName={log.containerName}
      isOdd={index % 2 !== 0}
      hideLevel={log.hideLevel}
    />
  );
};
SmartLogLineInner.displayName = 'SmartLogLineInner';
SmartLogLineInner.propTypes = {
  log: PropTypes.shape({
    raw: PropTypes.string.isRequired,
    ts: PropTypes.string,
    containerName: PropTypes.string,
  }).isRequired,
  index: PropTypes.number.isRequired,
};

// ── Multiline group ──────────────────────────────────────────────────────────
const MultilineGroup = React.memo(({ group, baseIndex }) => {
  const [expanded, setExpanded] = useState(false);
  const firstLog = group.lines[0];
  const extraCount = group.lines.length - 1;

  return (
    <Box component="div">
      {/* First line with expand toggle */}
      <Box
        sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Box sx={{ flexGrow: 1 }}>
          <SmartLogLineInner log={firstLog} index={baseIndex} />
        </Box>
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            mx: 1,
            fontSize: '0.65rem',
            fontWeight: 700,
            px: '5px',
            py: '1px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            backgroundColor: expanded ? 'primary.main' : 'action.selected',
            color: expanded ? 'primary.contrastText' : 'text.secondary',
            userSelect: 'none',
          }}
        >
          {expanded ? '▲ collapse' : `+${extraCount} lines`}
        </Box>
      </Box>

      {/* Continuation lines */}
      <Collapse in={expanded}>
        {group.lines.slice(1).map((log, i) => (
          <SmartLogLineInner key={i} log={log} index={baseIndex + i + 1} />
        ))}
      </Collapse>
    </Box>
  );
});
MultilineGroup.displayName = 'MultilineGroup';
MultilineGroup.propTypes = {
  group: PropTypes.shape({
    lines: PropTypes.array.isRequired,
    isGroup: PropTypes.bool.isRequired,
  }).isRequired,
  baseIndex: PropTypes.number.isRequired,
};

// ── LogViewer ────────────────────────────────────────────────────────────────
const LogViewer = ({ logs, containerName, filterText, onFilterChange, onClearLogs }) => {
  const logContainerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && logContainerRef.current)
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs, autoScroll]);

  useEffect(() => {
    setAutoScroll(true);
  }, [containerName]);

  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40 && !autoScroll) setAutoScroll(true);
    else if (el.scrollHeight - el.scrollTop - el.clientHeight >= 40 && autoScroll)
      setAutoScroll(false);
  }, [autoScroll]);

  const handleScrollToBottom = useCallback(() => {
    if (logContainerRef.current)
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    setAutoScroll(true);
  }, []);

  const filteredLogs = useMemo(() => {
    if (!filterText) return logs;
    try {
      const regex = new RegExp(filterText, 'i');
      return logs.filter(
        (log) => regex.test(log.raw) || (log.containerName && regex.test(log.containerName)),
      );
    } catch {
      const lower = filterText.toLowerCase();
      return logs.filter(
        (log) =>
          log.raw.toLowerCase().includes(lower) ||
          (log.containerName && log.containerName.toLowerCase().includes(lower)),
      );
    }
  }, [logs, filterText]);

  return (
    <Paper
      elevation={2}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        alignSelf: 'stretch',
        height: 'stretch',
        p: 2,
      }}
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={1}
        flexShrink={0}
        flexWrap="wrap"
        gap={1}
      >
        <Typography variant="h6" component="h2" noWrap sx={{ minWidth: '150px' }}>
          {containerName || '—'}
        </Typography>
        <Box display="flex" alignItems="center" flexGrow={1} sx={{ minWidth: '280px' }} gap={1}>
          <TextField
            placeholder="Filter logs (regex)"
            variant="outlined"
            size="small"
            fullWidth
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: '1rem' }} />
                </InputAdornment>
              ),
              endAdornment: filterText && (
                <InputAdornment position="end">
                  <IconButton onClick={() => onFilterChange('')} edge="end" size="small">
                    <ClearIcon sx={{ fontSize: '1rem' }} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Tooltip
            title={
              autoScroll
                ? 'Auto-scroll on — click to pause'
                : 'Auto-scroll paused — click to resume'
            }
          >
            <IconButton
              size="small"
              onClick={autoScroll ? () => setAutoScroll(false) : handleScrollToBottom}
              sx={{
                flexShrink: 0,
                color: autoScroll ? 'primary.main' : 'text.disabled',
                border: '1px solid',
                borderColor: autoScroll ? 'primary.main' : 'divider',
                borderRadius: 1,
              }}
            >
              <ScrollBottomIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            size="small"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Clear
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 0.5, flexShrink: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {filteredLogs.length}
          {filterText ? ` / ${logs.length}` : ''} lines
          {!autoScroll && (
            <Box
              component="span"
              sx={{ ml: 1, color: 'warning.main', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={handleScrollToBottom}
            >
              ↓ scroll paused — click to resume
            </Box>
          )}
        </Typography>
      </Box>

      <Box
        ref={logContainerRef}
        onScroll={handleScroll}
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          backgroundColor: 'background.default',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(128,128,128,0.4)',
            borderRadius: '3px',
          },
        }}
      >
        {filteredLogs.length > 0 ? (
          groupByTimestamp(filteredLogs).map((tsGroup, tgi) => {
            if (!tsGroup.isGroup) {
              const idx = filteredLogs.indexOf(tsGroup.lines[0]);
              return <SmartLogLineInner key={tgi} log={tsGroup.lines[0]} index={idx} />;
            }
            // Same-timestamp group: show timestamp and level dot only on first line
            return (
              <Box key={tgi} component="div">
                {tsGroup.lines.map((log, li) => {
                  const isFirst = li === 0;
                  // Hide timestamp and level on continuation lines, same bg color for whole group
                  const modifiedLog = isFirst ? log : { ...log, ts: null, hideLevel: true };
                  return <SmartLogLineInner key={li} log={modifiedLog} index={tgi} />;
                })}
              </Box>
            );
          })
        ) : (
          <Typography sx={{ color: 'text.secondary', p: 2, fontSize: '0.875rem' }}>
            {containerName
              ? 'No logs match the current filter.'
              : 'Select a container to view logs.'}
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

LogViewer.propTypes = {
  logs: PropTypes.arrayOf(
    PropTypes.shape({
      raw: PropTypes.string.isRequired,
      ts: PropTypes.string,
      containerName: PropTypes.string,
    }),
  ).isRequired,
  containerName: PropTypes.string,
  filterText: PropTypes.string.isRequired,
  onFilterChange: PropTypes.func.isRequired,
  onClearLogs: PropTypes.func.isRequired,
};

export default React.memo(LogViewer);
