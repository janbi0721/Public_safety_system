import { useCallback, useEffect, useState } from "react";
import { api } from "app/services/api";

export function useEvents({ cameraId, limit = 100, offset = 0, isImproved, filters, interval = 5000 } = {}) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Serialize so a new-but-equal filters object does not restart polling.
  const filterKey = JSON.stringify(filters || {});

  const refresh = useCallback(async () => {
    try {
      const data = await api.adminEvents({ limit, offset, cameraId, isImproved, ...JSON.parse(filterKey) });
      setEvents(data.events || []);
      setTotal(data.total ?? (data.events || []).length);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [cameraId, limit, offset, isImproved, filterKey]);

  useEffect(() => {
    refresh();
    const timer = interval ? window.setInterval(refresh, interval) : null;
    return () => timer && window.clearInterval(timer);
  }, [interval, refresh]);

  return { events, total, loading, error, refresh };
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
