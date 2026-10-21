import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { api, getStoredToken, setStoredToken } from "app/services/api";

const SupervisorAuthContext = createContext(null);

export function SupervisorAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const clearSession = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let disposed = false;

    async function initialize() {
      if (!getStoredToken()) {
        if (!disposed) setIsInitialized(true);
        return;
      }

      try {
        const supervisor = await api.me();
        if (!disposed) setUser(supervisor);
      } catch {
        if (!disposed) clearSession();
      } finally {
        if (!disposed) setIsInitialized(true);
      }
    }

    initialize();
    return () => { disposed = true; };
  }, [clearSession]);

  const login = useCallback(async (username, password) => {
    const result = await api.login(username, password);
    setStoredToken(result.access_token);
    setUser(result.supervisor);
    return result.supervisor;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) await api.logout();
    } catch {
      // 後端暫時不可用時仍清除前端登入狀態。
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const supervisor = await api.me();
    setUser(supervisor);
    return supervisor;
  }, []);

  const value = useMemo(() => ({
    user,
    isInitialized,
    isAuthenticated: Boolean(user),
    login,
    logout,
    refreshUser
  }), [user, isInitialized, login, logout, refreshUser]);

  if (!isInitialized) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return <SupervisorAuthContext.Provider value={value}>{children}</SupervisorAuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(SupervisorAuthContext);
  if (!context) throw new Error("useAuth must be used within SupervisorAuthProvider");
  return context;
}
