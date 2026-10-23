import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";

import { api } from "app/services/api";
import PageHeader, { Page } from "app/components/PageHeader";
import { cameraLabel } from "./shared";

const SOURCE_LABELS = { local: "本機攝影機", rtsp: "網路攝影機 (RTSP)" };

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.adminCameras().then((data) => setCameras(data.cameras || [])).catch(setError);
  }, []);

  return (
    <Page>
      <PageHeader title="攝影機" meta={`${cameras.length} 台連線中`} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}
      {!error && !cameras.length && <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>沒有連線中的攝影機</Typography>}

      <Grid container spacing={2.5}>
        {cameras.map((camera) => (
          <Grid key={camera.camera_id} size={{ xs: 12, md: 6, lg: 4 }}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
                  <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: "action.hover", color: "text.secondary", display: "grid" }}>
                    <VideocamOutlined />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" noWrap>{cameraLabel(camera.camera_id)}</Typography>
                  </Box>
                  <Chip size="small" color="success" variant="outlined" label="連線中" />
                </Stack>
                <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: .75, "& dt": { color: "text.secondary" }, "& dd": { m: 0 } }}>
                  <Typography component="dt" variant="body2">位置</Typography>
                  <Typography component="dd" variant="body2">{camera.location || "—"}</Typography>
                  <Typography component="dt" variant="body2">類型</Typography>
                  <Typography component="dd" variant="body2">{SOURCE_LABELS[camera.source_type] || camera.source_type || "—"}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Page>
  );
}
