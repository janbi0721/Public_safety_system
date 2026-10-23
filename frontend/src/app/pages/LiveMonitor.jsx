import {useState} from "react";
import {FormControl,InputLabel,Select,MenuItem,ToggleButton,ToggleButtonGroup} from "@mui/material";
import {useAvailableCameras} from "app/hooks/availableCameras";
import PageHeader, { Page } from "app/components/PageHeader";
import { cameraLabel } from "./shared";
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
import { AlarmBanner, alarmFrameSx, describePerson, groupAlertsByPerson, useAlarmTitle } from "app/components/SafetyAlarm";

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
  const alertPeople = groupAlertsByPerson(alerts);
  useAlarmTitle(alertPeople.length);

  return (
    <Page>
      <PageHeader title="即時監控" actions={<>
        <FormControl size="small" sx={{minWidth:200}}><InputLabel>攝影機</InputLabel><Select value={selected} label="攝影機" onChange={e=>setSelected(e.target.value)}>{cameras.map(c=><MenuItem key={c.camera_id} value={c.camera_id}>{cameraLabel(c.camera_id)}</MenuItem>)}</Select></FormControl>
        <ToggleButtonGroup size="small" exclusive value={annotated ? "ai" : "raw"} onChange={(_, value) => value && setAnnotated(value === "ai")} aria-label="畫面">
          <ToggleButton value="ai">AI 畫面</ToggleButton>
          <ToggleButton value="raw">原始畫面</ToggleButton>
        </ToggleButtonGroup>
      </>} />
      {!selected&&<Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>沒有連線中的攝影機</Typography>}
      <AlarmBanner alerts={alerts} />
      {selected&&<Grid container spacing={2.5}>
        <Grid size={{ xs: 12, xl: 9 }}>
          <Card variant="outlined" sx={alarmFrameSx(alertPeople.length > 0)}><CardContent><CameraView cameraId={selected} detections={detections} alerts={alerts} frame={frame} annotated={annotated} showHeader={false} /></CardContent></Card>
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
                  {alertPeople.map(group => (
                    <Box key={String(group.trackId)} sx={{ p: 1.25, borderRadius: 1.5, border: "2px solid", borderColor: "error.main" }}>
                      <Typography variant="body2" fontWeight={800} color="error.main">{describePerson(group)}</Typography>
                      {!group.inView && <Typography variant="caption" color="text.secondary">暫時不在畫面</Typography>}
                    </Box>
                  ))}
                  {alertPeople.length === 0 && <Typography color="text.secondary" variant="body2">目前無安全警示</Typography>}
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
    </Page>
  );
}
