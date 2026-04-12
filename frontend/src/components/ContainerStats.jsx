import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, LinearProgress, Tooltip, Skeleton } from '@mui/material';
import { subscribeToStats } from '../api/websocket';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StatBar({ label, value, max, pct, color }) {
  return (
    <Tooltip title={`${label}: ${value}${max ? ` / ${max}` : ''}`} placement="top">
      <Box sx={{ mb: 0.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            {label}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}
          >
            {pct !== undefined ? `${pct.toFixed(1)}%` : value}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(pct ?? 0, 100)}
          sx={{
            height: 4,
            borderRadius: 2,
            backgroundColor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              backgroundColor: color,
              borderRadius: 2,
            },
          }}
        />
      </Box>
    </Tooltip>
  );
}

StatBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  max: PropTypes.string,
  pct: PropTypes.number,
  color: PropTypes.string,
};

function NetStat({ label, bytes }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}
      >
        {formatBytes(bytes)}
      </Typography>
    </Box>
  );
}
NetStat.propTypes = { label: PropTypes.string, bytes: PropTypes.number };

const ContainerStats = ({ containerId, connection }) => {
  const [stats, setStats] = useState(null);
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!containerId || !connection) return;

    setStats(null);
    let cancelled = false;

    subscribeToStats(connection, containerId, (data) => {
      if (!cancelled && !data.error) setStats(data);
    })
      .then((unsub) => {
        if (cancelled) {
          try {
            unsub();
          } catch {
            /* ignore */
          }
        } else unsubRef.current = unsub;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      if (unsubRef.current) {
        try {
          unsubRef.current();
        } catch {
          /* ignore */
        }
        unsubRef.current = null;
      }
    };
  }, [containerId, connection]);

  // Show skeleton while waiting for first stats
  if (!stats) {
    return (
      <Box
        sx={{
          px: 2,
          pb: 1,
          pt: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <Skeleton variant="text" width="30%" height={14} sx={{ mb: 0.5 }} />
        <Skeleton variant="rectangular" height={4} sx={{ borderRadius: 2, mb: 1 }} />
        <Skeleton variant="text" width="30%" height={14} sx={{ mb: 0.5 }} />
        <Skeleton variant="rectangular" height={4} sx={{ borderRadius: 2, mb: 0.5 }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Skeleton variant="text" width="40%" height={14} />
          <Skeleton variant="text" width="40%" height={14} />
        </Box>
      </Box>
    );
  }

  const cpuColor = stats.cpu_pct > 80 ? '#e53935' : stats.cpu_pct > 50 ? '#f57c00' : '#2e7d32';
  const memColor = stats.mem_pct > 80 ? '#e53935' : stats.mem_pct > 50 ? '#f57c00' : '#1565c0';

  return (
    <Box
      sx={{
        px: 2,
        pb: 1,
        pt: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        flexShrink: 0,
      }}
    >
      <StatBar
        label="CPU"
        value={`${stats.cpu_pct.toFixed(1)}%`}
        pct={stats.cpu_pct}
        color={cpuColor}
      />
      <StatBar
        label="MEM"
        value={formatBytes(stats.mem_usage)}
        max={formatBytes(stats.mem_limit)}
        pct={stats.mem_pct}
        color={memColor}
      />
      <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
        <Box sx={{ flex: 1 }}>
          <NetStat label="↓ RX" bytes={stats.net_rx} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <NetStat label="↑ TX" bytes={stats.net_tx} />
        </Box>
      </Box>
    </Box>
  );
};

ContainerStats.propTypes = {
  containerId: PropTypes.string,
  connection: PropTypes.object,
};

export default ContainerStats;
