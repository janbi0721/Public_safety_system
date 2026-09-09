import { useCallback, useEffect, useState } from "react";
import { api } from "app/services/api";

export default function useSystemHealth(interval = 5000) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.health();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, interval);
    return () => window.clearInterval(timer);
  }, [interval, refresh]);

  return { health, loading, error, refresh };
}
