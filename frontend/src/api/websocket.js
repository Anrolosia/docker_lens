import { subscribeEntities, callService } from 'home-assistant-js-websocket';

/**
 * Fetches the list of Docker containers from the Home Assistant backend.
 * @param {object} connection The Home Assistant WebSocket connection object.
 * @returns {Promise<object>} A promise that resolves to the container data.
 */
export const fetchContainers = (connection) => {
  if (!connection) {
    return Promise.reject(new Error('WebSocket connection not available.'));
  }
  return connection.sendMessagePromise({
    type: 'docker_lens/containers/list',
  });
};

/**
 * Subscribes to the log stream for a specific container.
 * @param {object} connection The Home Assistant WebSocket connection object.
 * @param {string} containerId The ID of the container to subscribe to.
 * @param {function} onLogMessage A callback function that will be called with each new log message.
 * @returns {Promise<function>} A promise that resolves to an unsubscribe function.
 */
export const subscribeToLogs = (connection, containerId, onLogMessage, tail = 100) => {
  if (!connection) {
    return Promise.reject(new Error('WebSocket connection not available.'));
  }
  return connection.subscribeMessage(onLogMessage, {
    type: 'docker_lens/logs/subscribe',
    container_id: containerId,
    tail,
  });
};
