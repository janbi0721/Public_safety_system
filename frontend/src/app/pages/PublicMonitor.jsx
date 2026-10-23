import {useEffect,useMemo,useState} from "react";
import {Button,IconButton,MenuItem,Select,Tooltip} from "@mui/material";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import VolumeUpRounded from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRounded from "@mui/icons-material/VolumeOffRounded";

import CameraView from "app/components/CameraView";
import { useCameraDetections } from "app/hooks/camera";
import { api } from "app/services/api";
import {useAvailableCameras} from "app/hooks/availableCameras";
import ModeSelect from "app/components/ModeSelect";
import { cameraLabel } from "./shared";
import { AlarmScreenFrame, VideoOverlay, WorkerStatusPanel, groupAlertsByPerson, useAlarmTitle, useAlarmVoice, useHmi, useNewAlarm } from "app/components/SafetyAlarm";

function useClock() {
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return ()=>clearInterval(timer)},[]);
  return now;
}

// Worker screen: shown on a wall display nobody scrolls, so everything fits
// one viewport (100dvh, no page scroll); the video shrinks to fit.
export default function PublicMonitor() {
  const HMI = useHmi();
  const {cameras,selected,setSelected}=useAvailableCameras();
  const { alerts = [], people = [], frame, connected, aiFps } = useCameraDetections(selected);
  const [audio,setAudio]=useState(()=>localStorage.getItem('safety-audio')==='on');
  const [volume,setVolume]=useState(80);
  const now=useClock();
  const speak=(message)=>{if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const utter=new SpeechSynthesisUtterance(message);utter.lang='zh-TW';utter.volume=volume/100;window.speechSynthesis.speak(utter)};
  useEffect(()=>{localStorage.setItem('safety-audio',audio?'on':'off');if(!audio)window.speechSynthesis?.cancel()},[audio]);
  useEffect(()=>{
    let mounted=true;
    const refresh=()=>api.publicVoiceSettings().then(x=>{if(mounted)setVolume(x.volume)}).catch(()=>{});
    void refresh();
    const timer=setInterval(refresh,15000);
    return ()=>{mounted=false;clearInterval(timer)};
  },[]);
  const liveAlerts = useMemo(() => (connected ? alerts : []), [connected, alerts]);
  // Each event is announced once (chime + one sentence per person); see SafetyAlarm.
  useAlarmVoice({ alerts: liveAlerts, enabled: audio, connected, volume, cameraId: selected });
  const alarmCount = groupAlertsByPerson(liveAlerts).length;
  useAlarmTitle(alarmCount);
  const flashing = useNewAlarm(liveAlerts);
  const toggleAudio = () => { const next = !audio; setAudio(next); if (next) speak('語音警告已啟用'); };

  return (
    <>
      <Box sx={{ height: "100dvh", overflow: "hidden", bgcolor: HMI.bg, color: HMI.text, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
        <AlarmScreenFrame active={alarmCount > 0} flashing={flashing} />

        <Stack component="header" direction="row" alignItems="center" gap={{ xs: 1.5, md: 3 }} flexWrap="wrap"
          sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.5 }, borderBottom: `1px solid ${HMI.border}`, bgcolor: HMI.surface }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mr: "auto", minWidth: 0 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: HMI.brandBg, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <ShieldOutlined sx={{ color: HMI.brand, fontSize: 22 }} />
            </Box>
            <Typography fontWeight={700} noWrap sx={{ fontSize: { xs: 16, md: 18 } }}>現場安全監控</Typography>
          </Stack>

          <Select size="small" value={selected} displayEmpty onChange={e=>setSelected(e.target.value)}
            sx={{ minWidth: 170, fontSize: 14, bgcolor: HMI.raised, "& .MuiOutlinedInput-notchedOutline": { borderColor: HMI.border } }}
            renderValue={value => value ? cameraLabel(value) : "選擇攝影機"}>
            {cameras.map(c=><MenuItem key={c.camera_id} value={c.camera_id}>{cameraLabel(c.camera_id)}</MenuItem>)}
          </Select>

          <Stack direction="row" alignItems="center" spacing={.5}>
            <Tooltip title={audio ? "關閉語音警告" : "開啟語音警告（每台裝置需手動開啟一次）"}>
              <IconButton onClick={toggleAudio} aria-label={audio ? "關閉語音警告" : "開啟語音警告"}
                sx={{ border: `1px solid ${HMI.border}`, borderRadius: 1.5, color: audio ? HMI.text : HMI.warn, px: 1.25, gap: .75, fontSize: 14 }}>
                {audio ? <VolumeUpRounded fontSize="small" /> : <VolumeOffRounded fontSize="small" />}
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{audio ? "語音開啟" : "語音關閉"}</Box>
              </IconButton>
            </Tooltip>
            <Button size="small" onClick={()=>speak('語音測試，請正確佩戴安全裝備。')} sx={{ color: HMI.muted, minWidth: 0 }}>測試</Button>
          </Stack>

          <ModeSelect />

          <Box sx={{ textAlign: "right", pl: { md: 2 }, borderLeft: { md: `1px solid ${HMI.border}` } }}>
            <Typography sx={{ fontFamily: "Consolas, 'Roboto Mono', monospace", fontWeight: 700, fontSize: { xs: 18, md: 24 }, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
              {now.toLocaleTimeString("zh-TW", { hour12: false })}
            </Typography>
            <Typography sx={{ fontSize: 12, color: HMI.muted }}>{now.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })}</Typography>
          </Box>
        </Stack>

        <Box component="main" sx={{ display: "grid", minHeight: 0, gap: { xs: 1.5, md: 2 }, p: { xs: 1.5, md: 2 },
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) clamp(320px, 30vw, 520px)" },
          gridTemplateRows: { xs: "minmax(0, 1fr) minmax(0, 1.1fr)", md: "minmax(0, 1fr)" } }}>
          <Box sx={{ minHeight: 0, minWidth: 0, borderRadius: 2.5, overflow: "hidden", border: "1px solid", borderColor: alarmCount ? HMI.alarm : HMI.border, bgcolor: HMI.video }}>
            {selected
              ? <CameraView fill showHeader={false} cameraId={selected} frame={frame}>
                  <VideoOverlay fps={connected ? aiFps : null} alarmCount={alarmCount} />
                </CameraView>
              : <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: HMI.muted }}>目前沒有已啟用且連線成功的攝影機</Box>}
          </Box>
          <WorkerStatusPanel alerts={liveAlerts} people={people} connected={connected} flashing={flashing} />
        </Box>
      </Box>
    </>
  );
}
