import { useCallback, useEffect, useState } from "react";
import { api } from "app/services/api";

export default function useEvents({ cameraId, limit = 100, interval = 5000 } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = cameraId
        ? await api.cameraEvents(cameraId, limit)
        : await api.events(limit);
      setEvents(data.events || []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [cameraId, limit]);

  useEffect(() => {
    refresh();
    const timer = interval ? window.setInterval(refresh, interval) : null;
    return () => timer && window.clearInterval(timer);
  }, [interval, refresh]);

  return { events, loading, error, refresh };
}
