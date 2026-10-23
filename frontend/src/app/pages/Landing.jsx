import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", alignItems: "center", py: 6 }}>
      <Container maxWidth="md">
        <Stack alignItems="center" textAlign="center" spacing={1.5} mb={5}>
          <Box sx={{ width: 64, height: 64, borderRadius: 3, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}>
            <ShieldOutlined fontSize="large" />
          </Box>
          <Typography variant="h3" fontWeight={800}>工安智慧監控</Typography>
        </Stack>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: "100%", p: 2 }}>
              <CardContent>
                <MonitorHeartOutlined color="primary" sx={{ fontSize: 48 }} />
                <Typography variant="h5" fontWeight={700} mt={2} mb={3}>即時監控</Typography>
                <Button variant="contained" fullWidth onClick={() => navigate("/client/monitor")}>進入即時監控</Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: "100%", p: 2 }}>
              <CardContent>
                <AdminPanelSettingsOutlined color="primary" sx={{ fontSize: 48 }} />
                <Typography variant="h5" fontWeight={700} mt={2} mb={3}>主管管理</Typography>
                <Button variant="outlined" fullWidth onClick={() => navigate("/supervisor/login")}>主管登入</Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
