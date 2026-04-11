import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Grid, CircularProgress, Typography, Paper } from '@mui/material';

import { fetchContainers, subscribeToLogs } from './api/websocket';
import ContainerList from './components/ContainerList';
import LogViewer from './components/LogViewer';

/**
 * Main application component.
 * @param {{ connection: object }} props - The HA WebSocket connection.
 */
export function App({ connection }) {
  const [containers, setContainers] = useState({});
  const [containersLoading, setContainersLoading] = useState(true);
  const [containersError, setContainersError] = useState(null);

  // selection: null | { type: 'single', containerId } | { type: 'merged', stackName }
  const [selection, setSelection] = useState(null);
  const [logs, setLogs] = useState([]);
  const [filterText, setFilterText] = useState('');

  // ── Container list ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connection) return;

    let cancelled = false;

    const loadContainers = async () => {
      try {
        setContainersLoading(true);
        const result = await fetchContainers(connection);
        if (!cancelled) {
          setContainers(result);
          setContainersError(null);
        }
      } catch (err) {
        console.error('Failed to fetch containers:', err);
        if (!cancelled)
          setContainersError('Failed to fetch containers. Check the HA backend logs.');
      } finally {
        if (!cancelled) setContainersLoading(false);
      }
    };

    loadContainers();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  // ── Log subscription ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selection || !connection) return;

    setLogs([]);
    setFilterText('');

    let cancelled = false;
    const resolvedUnsubs = [];
    const pendingPromises = [];

    const targets =
      selection.type === 'single'
        ? [{ id: selection.containerId, containerName: null, tail: 100 }]
        : (containers[selection.stackName] ?? []).map((c) => ({
            id: c.id,
            containerName: c.name,
            tail: 20,
          }));

    for (const { id, containerName, tail } of targets) {
      const onMessage = (message) => {
        if (cancelled || !message?.line) return;
        setLogs((prev) => [...prev, { raw: message.line, ts: message.ts, containerName }]);
      };

      const promise = subscribeToLogs(connection, id, onMessage, tail)
        .then((unsub) => {
          if (cancelled) {
            try {
              unsub();
            } catch {
              /* ignore */
            }
          } else {
            resolvedUnsubs.push(unsub);
          }
        })
        .catch(console.error);

      pendingPromises.push(promise);
    }

    return () => {
      cancelled = true;
      resolvedUnsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {
          /* ignore */
        }
      });
      Promise.allSettled(pendingPromises);
    };
  }, [selection, connection, containers]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleContainerSelect = useCallback((containerId) => {
    setSelection({ type: 'single', containerId });
  }, []);

  const handleMergeStack = useCallback((stackName) => {
    setSelection((prev) =>
      prev?.type === 'merged' && prev.stackName === stackName
        ? null
        : { type: 'merged', stackName },
    );
  }, []);

  const handleClearLogs = useCallback(() => setLogs([]), []);

  // ── Derived state ───────────────────────────────────────────────────────────
  const selectedContainerId = selection?.type === 'single' ? selection.containerId : null;
  const selectedStackName = selection?.type === 'merged' ? selection.stackName : null;

  const viewTitle = useMemo(() => {
    if (selection?.type === 'merged') return `${selection.stackName} (merged stream)`;
    if (selection?.type === 'single') {
      for (const stack of Object.values(containers)) {
        const found = stack.find((c) => c.id === selection.containerId);
        if (found) return found.name;
      }
    }
    return null;
  }, [selection, containers]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!connection) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Connecting to Home Assistant…</Typography>
      </Box>
    );
  }

  if (containersError) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <Typography color="error">{containersError}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          height: '100%',
          gap: 2,
        }}
      >
        <Box
          sx={{
            width: { xs: '100%', md: '25%' },
            height: { xs: '40%', md: '100%' },
            flexShrink: 0,
          }}
        >
          <Paper
            sx={{
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <ContainerList
              containers={containers}
              selectedContainerId={selectedContainerId}
              selectedStackName={selectedStackName}
              onContainerSelect={handleContainerSelect}
              onMergeStack={handleMergeStack}
              isLoading={containersLoading}
            />
          </Paper>
        </Box>

        <Box
          sx={{ width: { xs: '100%', md: '75%' }, height: { xs: '60%', md: '100%' }, flexGrow: 1 }}
        >
          <LogViewer
            logs={logs}
            containerName={viewTitle}
            filterText={filterText}
            onFilterChange={setFilterText}
            onClearLogs={handleClearLogs}
          />
        </Box>
      </Box>
    </Box>
  );
}

export default App;
