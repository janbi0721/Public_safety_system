import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";

import { useAuth } from "app/auth/SupervisorAuth";

export default function SupervisorLogin() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) return <Navigate replace to="/supervisor/dashboard" />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username.trim(), password);
      navigate(location.state?.from || "/supervisor/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "登入失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", bgcolor: "background.default", py: 4 }}>
      <Container maxWidth="xs">
        <Card variant="outlined">
          <CardContent sx={{ p: 4 }}>
            <Stack alignItems="center" textAlign="center" spacing={1} mb={3}>
              <Box sx={{ width: 56, height: 56, borderRadius: 2.5, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}>
                <AdminPanelSettingsOutlined />
              </Box>
              <Typography variant="h5" fontWeight={800}>管理系統登入</Typography>
              <Typography variant="body2" color="text.secondary">請輸入帳號與密碼</Typography>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Stack component="form" spacing={2} onSubmit={handleSubmit}>
              <TextField
                label="主管帳號"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                fullWidth
              />
              <TextField
                label="密碼"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? "登入中…" : "登入主管端"}
              </Button>
              <Button type="button" variant="text" onClick={() => navigate("/")}>返回首頁</Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
