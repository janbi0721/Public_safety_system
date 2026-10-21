import { useCallback, useEffect, useState } from "react";
import { api } from "app/services/api";

export function useEvents({ cameraId, limit = 100, isImproved, interval = 5000 } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.adminEvents({ limit, cameraId, isImproved });
      setEvents(data.events || []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [cameraId, limit, isImproved]);

  useEffect(() => {
    refresh();
    const timer = interval ? window.setInterval(refresh, interval) : null;
    return () => timer && window.clearInterval(timer);
  }, [interval, refresh]);

  return { events, loading, error, refresh };
}

export function useSupervisors() {
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.supervisors();
      setSupervisors(data.supervisors || []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { supervisors, loading, error, refresh };
}

export function useSystemHealth(interval = 5000) {
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
