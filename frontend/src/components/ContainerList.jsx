import React, { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Computer as ComputerIcon,
  Layers as LayersIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  MoreVert as MoreVertIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RestartIcon,
} from '@mui/icons-material';
import { containerAction } from '../api/websocket';

const getStatusColor = (state) => {
  const s = state?.toLowerCase() ?? 'unknown';
  if (s === 'running') return 'success';
  if (s === 'exited' || s === 'dead') return 'error';
  if (s === 'created' || s === 'paused') return 'warning';
  return 'default';
};

const StatusChip = ({ state }) => (
  <Chip
    label={state?.toLowerCase() ?? 'unknown'}
    color={getStatusColor(state)}
    size="small"
    sx={{ ml: 1, flexShrink: 0 }}
  />
);
StatusChip.propTypes = { state: PropTypes.string };

// ── Container action menu ────────────────────────────────────────────────────
const ContainerActions = ({ container, connection, onRefresh }) => {
  const [anchor, setAnchor] = useState(null);
  const [loading, setLoading] = useState(false);
  const isRunning = container.state?.toLowerCase() === 'running';

  const handleAction = useCallback(
    async (action) => {
      setAnchor(null);
      setLoading(true);
      try {
        await containerAction(connection, container.id, action);
        // Small delay to let Docker update state before refresh
        setTimeout(() => {
          onRefresh();
          setLoading(false);
        }, 800);
      } catch (err) {
        console.error('Container action failed:', err);
        setLoading(false);
      }
    },
    [connection, container.id, onRefresh],
  );

  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setAnchor(e.currentTarget);
          }}
          disabled={loading}
          sx={{ ml: 0.5, flexShrink: 0, opacity: loading ? 0.5 : 1 }}
        >
          {loading ? <CircularProgress size={14} /> : <MoreVertIcon sx={{ fontSize: '1rem' }} />}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        onClick={(e) => e.stopPropagation()}
        disablePortal
        slotProps={{
          paper: {
            elevation: 3,
            sx: { minWidth: 140 },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {!isRunning && (
          <MenuItem onClick={() => handleAction('start')}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <StartIcon fontSize="small" color="success" />
            </ListItemIcon>
            Start
          </MenuItem>
        )}
        {isRunning && (
          <MenuItem onClick={() => handleAction('stop')}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <StopIcon fontSize="small" color="error" />
            </ListItemIcon>
            Stop
          </MenuItem>
        )}
        <MenuItem onClick={() => handleAction('restart')}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <RestartIcon fontSize="small" color="warning" />
          </ListItemIcon>
          Restart
        </MenuItem>
      </Menu>
    </>
  );
};

ContainerActions.propTypes = {
  container: PropTypes.object.isRequired,
  connection: PropTypes.object.isRequired,
  onRefresh: PropTypes.func.isRequired,
};

// ── Main component ───────────────────────────────────────────────────────────
export const ContainerList = ({
  containers,
  selectedContainerId,
  selectedStackName,
  onContainerSelect,
  onMergeStack,
  onRefresh,
  isLoading,
  connection,
}) => {
  const [search, setSearch] = useState('');

  const filteredContainers = useMemo(() => {
    if (!search.trim()) return containers;
    const query = search.toLowerCase();
    const result = {};
    for (const [stackKey, stackContainers] of Object.entries(containers ?? {})) {
      const displayName = stackKey === '_nostack_' ? 'Unstacked' : stackKey;
      const matched = stackContainers.filter(
        (c) => c.name.toLowerCase().includes(query) || displayName.toLowerCase().includes(query),
      );
      if (matched.length > 0) result[stackKey] = matched;
    }
    return result;
  }, [containers, search]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%" p={2}>
        <CircularProgress />
      </Box>
    );
  }

  if (Object.keys(containers ?? {}).length === 0) {
    return (
      <Box p={2}>
        <Typography variant="body1" color="text.secondary">
          No containers found.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <Box sx={{ p: 1, flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          placeholder="Search containers…"
          size="small"
          fullWidth
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: search && (
              <InputAdornment position="end">
                <IconButton onClick={() => setSearch('')} edge="end" size="small">
                  <ClearIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* List */}
      <Box sx={{ overflowY: 'auto', flexGrow: 1 }}>
        {Object.keys(filteredContainers).length === 0 ? (
          <Box p={2}>
            <Typography variant="body2" color="text.secondary">
              No containers match &ldquo;{search}&rdquo;.
            </Typography>
          </Box>
        ) : (
          Object.keys(filteredContainers)
            .sort()
            .map((stackKey) => {
              const isMerged = selectedStackName === stackKey;
              const stackContainers = filteredContainers[stackKey] ?? [];
              const displayName = stackKey === '_nostack_' ? 'Unstacked' : stackKey;

              return (
                <Accordion key={stackKey} defaultExpanded disableGutters>
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={
                      isMerged
                        ? {
                            backgroundColor: 'primary.main',
                            color: 'primary.contrastText',
                            '& .MuiSvgIcon-root': { color: 'primary.contrastText' },
                          }
                        : {}
                    }
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        flexGrow: 1,
                        minWidth: 0,
                      }}
                    >
                      <Typography
                        variant="subtitle1"
                        fontWeight={600}
                        noWrap
                        sx={{ color: isMerged ? 'inherit' : 'text.primary' }}
                      >
                        {displayName}
                      </Typography>
                      <Chip
                        label={stackContainers.length}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          backgroundColor: isMerged ? 'rgba(255,255,255,0.25)' : undefined,
                          color: isMerged ? 'primary.contrastText' : undefined,
                        }}
                      />
                    </Box>
                    <Tooltip title="Merge all containers into a single stream" placement="left">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMergeStack(stackKey);
                        }}
                        sx={{
                          mr: 0.5,
                          flexShrink: 0,
                          color: isMerged ? 'primary.contrastText' : 'action.active',
                        }}
                      >
                        <LayersIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </AccordionSummary>

                  <AccordionDetails sx={{ p: 0 }}>
                    <List component="nav" dense>
                      {stackContainers.map((container) => (
                        <ListItemButton
                          key={container.id}
                          selected={selectedContainerId === container.id}
                          onClick={() => onContainerSelect(container.id)}
                          sx={{ pr: 0.5 }}
                        >
                          <ListItemIcon>
                            <ComputerIcon />
                          </ListItemIcon>
                          <ListItemText
                            primary={container.name}
                            primaryTypographyProps={{ noWrap: true }}
                          />
                          <StatusChip state={container.state} />
                          {connection && (
                            <ContainerActions
                              container={container}
                              connection={connection}
                              onRefresh={onRefresh}
                            />
                          )}
                        </ListItemButton>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              );
            })
        )}
      </Box>
    </Box>
  );
};

ContainerList.propTypes = {
  containers: PropTypes.object.isRequired,
  selectedContainerId: PropTypes.string,
  selectedStackName: PropTypes.string,
  onContainerSelect: PropTypes.func.isRequired,
  onMergeStack: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
  connection: PropTypes.object,
};

export default ContainerList;
