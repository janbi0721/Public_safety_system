import {useState} from "react";
import {FormControl,InputLabel,Select,MenuItem,Alert} from "@mui/material";
import {useAvailableCameras} from "app/hooks/availableCameras";
import {Button} from "@mui/material";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import CameraView from "app/components/CameraView";
import { useCameraDetections } from "app/hooks/camera";
import { DEFAULT_CAMERA_ID } from "app/services/api";

function ppeText(ppe = {}) {
  const labels = {
    helmet: "安全帽",
    respirator: "防毒面具",
    safety_vest: "安全背心",
    glove: "手套"
  };

  return Object.entries(ppe)
    .map(([key, value]) => `${labels[key] || key}: ${value?.status === "normal" ? "正常" : value?.status === "violation" ? "違規" : "無法判定"}`)
    .join("　");
}

export default function LiveMonitor() {
  const {cameras,selected,setSelected}=useAvailableCameras();
  const [annotated,setAnnotated]=useState(true);
  const { detections, people = [], alerts = [], timestamp, frame } = useCameraDetections(selected);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack mb={3}>
        <Typography variant="h5" fontWeight={700}>即時監控</Typography>
      </Stack>

      <FormControl size="small" sx={{minWidth:240,mb:2,display:'block'}}><InputLabel>選擇攝影機</InputLabel><Select value={selected} label="選擇攝影機" onChange={e=>setSelected(e.target.value)}>{cameras.map(c=><MenuItem key={c.camera_id} value={c.camera_id}>{c.name}</MenuItem>)}</Select></FormControl>
      {!selected&&<Alert severity="info" sx={{mb:2}}>目前沒有已啟用且連線成功的攝影機</Alert>}
      <Button size="small" variant="outlined" onClick={()=>setAnnotated(v=>!v)} sx={{mb:2}}>{annotated?"切換原始畫面":"切換 AI 畫面"}</Button>
      {selected&&<Grid container spacing={2.5}>
        <Grid size={{ xs: 12, xl: 9 }}>
          <Card variant="outlined"><CardContent><CameraView cameraId={selected} detections={detections} alerts={alerts} frame={frame} annotated={annotated} /></CardContent></Card>
        </Grid>

        <Grid size={{ xs: 12, xl: 3 }}>
          <Stack spacing={2.5}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" fontWeight={700}>即時警示</Typography>
                <Typography variant="caption" color="text.secondary">
                  {timestamp ? new Date(timestamp * 1000).toLocaleTimeString("zh-TW") : "等待資料"}
                </Typography>
                <Stack spacing={1} mt={2}>
                  {alerts.map((alert, index) => (
                    <Box key={alert.eventId ?? index} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "error.lighter", border: "1px solid", borderColor: "error.light" }}>
                      <Typography variant="body2" fontWeight={700}>{alert.message}</Typography>
                    </Box>
                  ))}
                  {alerts.length === 0 && <Typography color="text.secondary" variant="body2">目前無安全警示</Typography>}
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" fontWeight={700}>人員穿戴狀態</Typography>
                <Box sx={{ overflowX: "auto", mt: 1.5 }}>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>人員</TableCell><TableCell>裝備</TableCell></TableRow></TableHead>
                    <TableBody>
                      {people.map((person, index) => (
                        <TableRow key={person.trackId ?? person.personId ?? index}>
                          <TableCell>#{person.trackId ?? person.personId ?? index + 1}</TableCell>
                          <TableCell sx={{ minWidth: 180 }}>{ppeText(person.ppe)}</TableCell>
                        </TableRow>
                      ))}
                      {people.length === 0 && <TableRow><TableCell colSpan={2} align="center">目前未辨識到人員</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
                  原始辨識物件：{detections.length} 個
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>}
    </Box>
  );
}
