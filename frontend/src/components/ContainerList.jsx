import React from 'react';
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
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Computer as ComputerIcon,
  Layers as LayersIcon,
} from '@mui/icons-material';

/** Map a container status string to a MUI Chip color. */
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
    sx={{ ml: 2 }}
  />
);

StatusChip.propTypes = {
  state: PropTypes.string,
};

export const ContainerList = ({
  containers,
  selectedContainerId,
  selectedStackName,
  onContainerSelect,
  onMergeStack,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%" p={2}>
        <CircularProgress />
      </Box>
    );
  }

  const stacks = Object.keys(containers ?? {});

  if (stacks.length === 0) {
    return (
      <Box p={2}>
        <Typography variant="body1" color="text.secondary">
          No containers found.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ overflowY: 'auto', height: '100%' }}>
      {stacks.sort().map((stackKey) => {
        const isMerged = selectedStackName === stackKey;
        const stackContainers = containers[stackKey] ?? [];
        // _nostack_ is the sentinel used by the backend for containers with no compose project.
        const displayName = stackKey === '_nostack_' ? 'Unstacked' : stackKey;

        return (
          <Accordion key={stackKey} defaultExpanded>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls={`${stackKey}-content`}
              id={`${stackKey}-header`}
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
                  >
                    <ListItemIcon>
                      <ComputerIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary={container.name}
                      primaryTypographyProps={{ noWrap: true }}
                    />
                    <StatusChip state={container.state} />
                  </ListItemButton>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
};

ContainerList.propTypes = {
  containers: PropTypes.object.isRequired,
  selectedContainerId: PropTypes.string,
  selectedStackName: PropTypes.string,
  onContainerSelect: PropTypes.func.isRequired,
  onMergeStack: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
};

export default ContainerList;
