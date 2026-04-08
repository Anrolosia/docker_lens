import React, { useRef, useEffect, useMemo } from 'react';
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
} from '@mui/material';
import { Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material';
import { parseLogLevel } from '../utils/logParser';

const convert = new Convert({
  fg: 'currentColor',
  bg: 'transparent',
  newline: false,
  escapeXML: true,
});

// Colors work on both light and dark backgrounds
const LEVEL_STYLES = {
  error: { color: '#e53935', label: 'ERR' },
  warn: { color: '#f57c00', label: 'WRN' },
  info: { color: '#2e7d32', label: 'INF' },
  debug: { color: '#1565c0', label: 'DBG' },
  trace: { color: '#6a1b9a', label: 'TRC' },
  unknown: { color: 'text.secondary', label: '···' },
};

// Deterministic color from container name (Dozzle-style)
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

// Format Docker RFC3339Nano timestamp to DD/MM/YYYY HH:MM:SS (local time like Dozzle)
function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mn}:${ss}`;
  } catch {
    return '';
  }
}

const LogLine = React.memo(({ raw, ts, containerName, isOdd }) => {
  const level = parseLogLevel(raw);
  const style = LEVEL_STYLES[level];
  const containerColor = getContainerColor(containerName);

  return (
    <Box
      component="div"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        px: '6px',
        py: '2px',
        backgroundColor: isOdd ? 'action.hover' : 'transparent',
        '&:hover': { backgroundColor: 'action.selected' },
      }}
    >
      {/* Container name badge — unique color, fixed width, truncated */}
      {containerName && (
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            fontSize: '0.72rem',
            fontWeight: 700,
            px: '5px',
            py: '1px',
            borderRadius: '3px',
            backgroundColor: containerColor,
            color: '#fff',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            width: '110px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'inline-block',
            textAlign: 'center',
          }}
          title={containerName}
        >
          {containerName}
        </Box>
      )}

      {/* Timestamp — DD/MM/YYYY HH:MM:SS */}
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
        }}
      >
        {formatTimestamp(ts)}
      </Box>

      {/* Level dot */}
      <Box
        component="span"
        title={style.label}
        sx={{
          flexShrink: 0,
          width: '9px',
          height: '9px',
          borderRadius: '50%',
          backgroundColor: level !== 'unknown' ? style.color : 'transparent',
          border: level === 'unknown' ? '1px solid' : 'none',
          borderColor: 'text.disabled',
          display: 'inline-block',
          userSelect: 'none',
        }}
      />

      {/* Message */}
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
        dangerouslySetInnerHTML={{ __html: convert.toHtml(raw) }}
      />
    </Box>
  );
});
LogLine.displayName = 'LogLine';

const LogViewer = ({ logs, containerName, filterText, onFilterChange, onClearLogs }) => {
  const logContainerRef = useRef(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

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
        height: '100%',
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
        <Box display="flex" alignItems="center" flexGrow={1} sx={{ minWidth: '280px' }}>
          <TextField
            placeholder="Filter logs (regex)"
            variant="outlined"
            size="small"
            fullWidth
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
            sx={{ mr: 1 }}
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
          <Button
            variant="outlined"
            size="small"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Clear
          </Button>
        </Box>
      </Box>

      {/* Log count */}
      <Box sx={{ mb: 0.5, flexShrink: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {filteredLogs.length}
          {filterText ? ` / ${logs.length}` : ''} lines
        </Typography>
      </Box>

      {/* Log lines */}
      <Box
        ref={logContainerRef}
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
          filteredLogs.map((log, index) => (
            <LogLine
              key={index}
              raw={log.raw}
              ts={log.ts}
              containerName={log.containerName}
              isOdd={index % 2 !== 0}
            />
          ))
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
