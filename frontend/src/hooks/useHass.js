import { useState, useEffect } from 'react';
import { getAuth, createConnection } from 'home-assistant-js-websocket';

export const useHass = () => {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const connect = async () => {
      try {
        // This will use the authentication provided by the parent Home Assistant frame.
        const auth = await getAuth();

        const conn = await createConnection({ auth });
        setConnection(conn);
      } catch (err) {
        console.error('Failed to connect to Home Assistant', err);
        // Error codes: 1 = invalid auth, 2 = cannot connect
        if (err === 1) {
          setError('Invalid authentication. Please log in to Home Assistant.');
        } else if (err === 2) {
          setError('Could not connect to Home Assistant. Check the URL and network.');
        } else {
          setError(`An unknown error occurred: ${err}`);
        }
      } finally {
        setLoading(false);
      }
    };

    connect();

    // Cleanup function to close the connection when the component unmounts
    return () => {
      if (connection) {
        connection.close();
      }
    };
    // The dependency array is empty, so this effect runs only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connection, loading, error };
};

export default useHass;
