import {useEffect,useRef,useState} from "react";
import {Button,FormControlLabel,Switch,Alert,FormControl,InputLabel,Select,MenuItem} from "@mui/material";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";

import CameraView from "app/components/CameraView";
import { useCameraDetections } from "app/hooks/camera";
import { DEFAULT_CAMERA_ID, api } from "app/services/api";
import {useAvailableCameras} from "app/hooks/availableCameras";

export default function PublicMonitor() {
  const {cameras,selected,setSelected}=useAvailableCameras();
  const { detections = [], alerts = [], timestamp, frame, connected } = useCameraDetections(selected);
  const [audio,setAudio]=useState(()=>localStorage.getItem('safety-audio')==='on');
  const [volume,setVolume]=useState(80);
  const lastSpoken=useRef(new Map());
  useEffect(()=>{lastSpoken.current.clear();window.speechSynthesis?.cancel()},[selected]);
  const speak=(message)=>{if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const utter=new SpeechSynthesisUtterance(message);utter.lang='zh-TW';utter.volume=volume/100;window.speechSynthesis.speak(utter)};
  useEffect(()=>{localStorage.setItem('safety-audio',audio?'on':'off');if(!audio)window.speechSynthesis?.cancel()},[audio]);
  useEffect(()=>{
    let mounted=true;
    const refresh=()=>api.publicVoiceSettings().then(x=>{if(mounted)setVolume(x.volume)}).catch(()=>{});
    void refresh();
    const timer=setInterval(refresh,15000);
    return ()=>{mounted=false;clearInterval(timer)};
  },[]);
  useEffect(()=>{if(!audio||!connected)return;const now=Date.now();const active=new Set();for(const alert of alerts){const k=alert.eventId??`${alert.trackId}-${alert.eventType}`;active.add(k);if(now-(lastSpoken.current.get(k)||0)>=60000){speak(alert.message||'警告，請正確穿戴防護裝備');lastSpoken.current.set(k,now);break}}for(const key of lastSpoken.current.keys()){if(!active.has(key))lastSpoken.current.delete(key)}},[alerts,connected,audio,volume]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: { xs: 2, md: 3 } }}>
      <Container maxWidth="xl">
      <Box sx={{my:2}}><FormControl size="small" sx={{minWidth:240}}><InputLabel>選擇攝影機</InputLabel><Select value={selected} label="選擇攝影機" onChange={e=>setSelected(e.target.value)}>{cameras.map(c=><MenuItem key={c.camera_id} value={c.camera_id}>{c.name}</MenuItem>)}</Select></FormControl>{!selected&&<Alert severity="info" sx={{mt:2}}>目前沒有已啟用且連線成功的攝影機</Alert>}</Box>

        <Stack direction="row" alignItems="center" spacing={1.5} mb={2.5}>
          <ShieldOutlined color="primary" />
          <Box>
            <Typography variant="h5" fontWeight={800}>現場安全監控</Typography>

          </Box>
        </Stack>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 3fr) minmax(300px, 1fr)" }, gap: 2.5 }}>
          <Card variant="outlined">
            <CardContent>
              {selected&&<CameraView cameraId={selected} detections={detections} alerts={alerts} frame={frame} />}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={700} mb={1}>語音警告</Typography>
              <FormControlLabel control={<Switch checked={audio} onChange={e=>{setAudio(e.target.checked);if(e.target.checked)speak('語音警告已啟用')}}/>} label={audio?'開啟':'關閉'}/>
              <Typography variant="body2" color="text.secondary" sx={{my:1}}>語音音量由工程師維護設定</Typography>
              <Button variant="outlined" onClick={()=>speak('語音測試，請正確佩戴安全裝備。')}>測試喇叭</Button>
              {!connected&&<Alert severity="error" sx={{mt:2}}>監控資料中斷</Alert>}
            </CardContent>
          </Card>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" fontWeight={700}>即時警示</Typography>
                <Chip size="small" color={!connected ? "warning" : alerts.length ? "error" : "success"} label={`${alerts.length} 筆`} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {timestamp ? new Date(timestamp * 1000).toLocaleTimeString("zh-TW") : "等待 AI 資料"}
              </Typography>
              <Divider sx={{ my: 2 }} />

              {alerts.length === 0 ? (
                <Stack alignItems="center" textAlign="center" py={8} spacing={1}>
                  {connected ? <CheckCircleOutline color="success" sx={{ fontSize: 54 }} /> : <WarningAmberOutlined color="warning" sx={{fontSize:54}}/>}
                  <Typography variant="h6" fontWeight={700}>{connected ? "目前無安全警示" : "監控中斷"}</Typography>

                </Stack>
              ) : (
                <Stack spacing={1.5}>
                  {alerts.map((alert, index) => (
                    <Box key={alert.eventId ?? `${alert.eventType}-${index}`} sx={{ p: 1.5, borderRadius: 2, bgcolor: "error.lighter", border: "1px solid", borderColor: "error.light" }}>
                      <Stack direction="row" spacing={1.2} alignItems="flex-start">
                        <WarningAmberOutlined color="error" />
                        <Box>
                          <Typography fontWeight={700}>{alert.message || "安全穿戴異常"}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {alert.eventType || "warning"}{alert.durationSeconds != null ? ` · 持續 ${alert.durationSeconds} 秒` : ""}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Box>
      </Container>
    </Box>
  );
}
