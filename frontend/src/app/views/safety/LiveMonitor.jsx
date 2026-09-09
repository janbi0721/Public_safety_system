import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import CameraPanel from "app/components/safety/CameraPanel";
import useCameraDetections from "app/hooks/useCameraDetections";
import { DEFAULT_CAMERA_ID, DEFAULT_STREAM_NAME } from "app/services/api";

export default function LiveMonitor() {
  const { detections, connected, timestamp } = useCameraDetections(DEFAULT_CAMERA_ID);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>即時監控</Typography>
          <Typography variant="body2" color="text.secondary">WebRTC 原始影像 + WebSocket YOLO 辨識框</Typography>
        </Box>
        <Chip color={connected ? "success" : "default"} label={connected ? "AI WebSocket 已連線" : "AI WebSocket 離線"} />
      </Stack>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, xl: 9 }}>
          <Card variant="outlined">
            <CardContent>
              <CameraPanel cameraId={DEFAULT_CAMERA_ID} streamName={DEFAULT_STREAM_NAME} minHeight={520} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, xl: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>即時辨識</Typography>
              <Typography variant="caption" color="text.secondary">
                {timestamp ? new Date(timestamp * 1000).toLocaleTimeString("zh-TW") : "等待資料"}
              </Typography>

              <Box sx={{ overflowX: "auto", mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>類別</TableCell>
                      <TableCell align="right">信心值</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detections.map((item, index) => (
                      <TableRow key={`${item.className}-${index}`}>
                        <TableCell>{item.className || item.classId}</TableCell>
                        <TableCell align="right">{`${(Number(item.confidence || 0) * 100).toFixed(1)}%`}</TableCell>
                      </TableRow>
                    ))}
                    {detections.length === 0 && (
                      <TableRow><TableCell colSpan={2} align="center">目前無偵測物件</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
