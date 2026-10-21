import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid2";
import Typography from "@mui/material/Typography";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";

import { api } from "app/services/api";

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.adminCameras().then((data) => setCameras(data.cameras || [])).catch(setError);
  }, []);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" fontWeight={700}>攝影機</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}

      <Grid container spacing={2.5}>
        {cameras.map((camera) => (
          <Grid key={camera.camera_id} size={{ xs: 12, md: 6, lg: 4 }}>
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ p: 1.2, width: "fit-content", borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText" }}>
                  <VideocamOutlined />
                </Box>
                <Typography variant="h6" fontWeight={700} mt={2}>{camera.name || camera.camera_id}</Typography>
                <Typography variant="body2" color="text.secondary">ID：{camera.camera_id}</Typography>
                <Typography variant="body2" color="text.secondary">位置：{camera.location || "未設定"}</Typography>
                <Typography variant="caption" color="text.secondary">來源：{camera.source_type || "local"}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
