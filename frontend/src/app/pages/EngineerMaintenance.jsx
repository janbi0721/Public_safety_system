import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Divider, Switch,
  FormControl, FormControlLabel, InputLabel, List, ListItemButton,
  ListItemIcon, ListItemText, MenuItem, Select, Slider, Stack,
  TextField, Typography
} from "@mui/material";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";
import SettingsApplicationsOutlined from "@mui/icons-material/SettingsApplicationsOutlined";
import VolumeUpOutlined from "@mui/icons-material/VolumeUpOutlined";
import BugReportOutlined from "@mui/icons-material/BugReportOutlined";
import BackupOutlined from "@mui/icons-material/BackupOutlined";
import StorageOutlined from "@mui/icons-material/StorageOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import EngineeringDatabase from "./EngineeringDatabase";
import { api, DEFAULT_CAMERA_ID } from "../services/api";
import SystemStatus from "./SystemStatus";

const SECTIONS = [
  { id: "cameras", label: "攝影機管理", icon: <TuneOutlined /> },
  { id: "recognition", label: "辨識設定", icon: <TuneOutlined /> },
  { id: "box-colors", label: "框線顏色", icon: <PaletteOutlined /> },
  { id: "status", label: "系統狀態", icon: <MonitorHeartOutlined /> },
  { id: "environment", label: "環境設定 (.env)", icon: <SettingsApplicationsOutlined /> },
  { id: "voice", label: "語音警告音量", icon: <VolumeUpOutlined /> },
  { id: "test-events", label: "產生模擬事件", icon: <BugReportOutlined /> },
  { id: "database", label: "資料庫管理", icon: <StorageOutlined /> },
  { id: "backup", label: "資料備份", icon: <BackupOutlined /> }
];
const PPE_OPTIONS = [["helmet", "安全帽"], ["respirator", "防毒面具"], ["glove", "隔熱手套"]];
const TEST_TYPES = [
  ["no_helmet", "未戴安全帽"], ["no_gas_mask", "未戴防毒面具"],
  ["no_gloves", "未戴隔熱手套"], ["fall_detected", "模擬跌倒"]
];

function EngineeringCameras({notify}) {
  const [items,setItems]=useState([]);const [sources,setSources]=useState({});const [error,setError]=useState('');const [busy,setBusy]=useState('');
  const refresh=()=>api.engineeringCameras().then(r=>setItems(r.cameras||[])).catch(e=>setError(e.message));
  useEffect(()=>{void refresh()},[]);
  const update=async(c,enabled)=>{setBusy(c.camera_id);setError('');try{
    const payload={};if(enabled!==undefined)payload.enabled=enabled;
    if(sources[c.camera_id]!==undefined&&sources[c.camera_id].trim())payload.source=sources[c.camera_id].trim();
    await api.updateEngineeringCamera(c.camera_id,payload);setSources(p=>({...p,[c.camera_id]:''}));
    await refresh();notify('攝影機設定已更新');
  }catch(e){setError(e.message)}finally{setBusy('')}};
  return <Card variant="outlined"><CardContent><Typography variant="h6" mb={2}>攝影機管理</Typography>
    <Alert severity="info" sx={{mb:2}}>開啟後仍要成功取得畫面才會出現在主管端與工人端。停用會移除公開選單並停止辨識；RTSP 網址含密碼，設定後不會回顯。</Alert>
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    <Stack spacing={3}>{items.map(c=><Box key={c.camera_id}>
      <Stack direction={{xs:'column',sm:'row'}} alignItems={{sm:'center'}} gap={2}>
        <Box sx={{minWidth:180}}><Typography fontWeight={700}>{c.name}</Typography><Typography variant="caption">{c.camera_id} · {c.online?'已連線':'未連線'}</Typography></Box>
        <FormControlLabel label="啟用" control={<Switch checked={Boolean(c.is_active)} disabled={busy===c.camera_id} onChange={e=>void update(c,e.target.checked)}/>}/>
        <TextField type={c.source_type==='rtsp'?'password':'text'} size="small" sx={{flex:1}} value={sources[c.camera_id]||''}
          placeholder={c.source_type==='rtsp'?'輸入新的 RTSP URL（已設定的不顯示）':`裝置編號（目前 ${c.source||'0'}）`}
          onChange={e=>setSources(p=>({...p,[c.camera_id]:e.target.value}))}/>
        <Button variant="outlined" disabled={busy===c.camera_id||!sources[c.camera_id]} onClick={()=>void update(c)}>儲存來源</Button>
      </Stack><Divider sx={{mt:2}}/></Box>)} </Stack>
  </CardContent></Card>;
}

function EnvironmentEditor({ notify }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [changed, setChanged] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async (isCurrent = () => true) => {
    setError("");
    try {
      const result = await api.engineeringEnvironment();
      if (!isCurrent()) return;
      const list = Array.isArray(result?.fields) ? result.fields : [];
      setFields(list);
      setValues(Object.fromEntries(list.map(field => [field.name, field.value ?? ""])));
      setChanged({});
    } catch (err) { if (isCurrent()) setError(err.message || "環境設定讀取失敗"); }
  };
  useEffect(() => { let alive = true; void reload(() => alive); return () => { alive = false; }; }, []);
  const edit = (field, value) => {
    setValues(old => ({ ...old, [field.name]: value }));
    setChanged(old => ({ ...old, [field.name]: true }));
  };
  const save = async () => {
    const modifications = Object.fromEntries(fields.filter(field => changed[field.name] && (!field.protected || values[field.name]))
      .map(field => [field.name, String(values[field.name])]));
    if (!Object.keys(modifications).length) { notify("沒有需要儲存的變更"); return; }
    if (!window.confirm("確定儲存 .env 設定？修改後需重新啟動系統。")) return;
    setBusy(true); setError("");
    try {
      await api.updateEngineeringEnvironment(modifications);
      await reload();
      notify(".env 已儲存。請執行 stop.bat，再重新開啟 open.bat。", "success");
    } catch (err) { setError(err.message || "儲存環境設定失敗"); }
    finally { setBusy(false); }
  };

  return <Card variant="outlined"><CardContent>
    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
      <Typography variant="h6" fontWeight={700}>環境設定 (.env)</Typography>
      <Button size="small" variant="outlined" onClick={() => void reload()}>重新讀取</Button>
    </Stack>
    <Alert severity="info" sx={{ mb: 2 }}>只開放核准欄位。API Key 及帶帳密的攝影機網址不顯示原文，留空不更改原值；修改後需要重新啟動。</Alert>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Stack spacing={2}>
      {fields.map(field => <Stack key={field.name} direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
        <Box sx={{ width: { md: 250 }, flexShrink: 0 }}>
          <Typography fontWeight={600} variant="body2">{field.label}</Typography>
          <Typography variant="caption" color="text.secondary">{field.name}</Typography>
        </Box>
        {field.type === "bool" ? <FormControlLabel label="啟用" control={<Checkbox checked={values[field.name] === "1"} onChange={event => edit(field, event.target.checked ? "1" : "0")} />} />
        : <TextField size="small" fullWidth type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
            value={values[field.name] ?? ""} autoComplete="off"
            placeholder={field.protected ? field.configured ? "已設定（輸入新值才更新）" : "尚未設定" : ""}
            inputProps={field.type === "number" ? { min: 1, max: 30 } : { maxLength: 2048 }}
            onChange={event => edit(field, event.target.value)} />}
      </Stack>)}
      {!fields.length && <Typography color="text.secondary">載入設定中…</Typography>}
      <Box><Button variant="contained" disabled={busy || !fields.length} onClick={() => void save()}>儲存環境設定</Button></Box>
    </Stack>
  </CardContent></Card>;
}

function VoiceSettings({ notify }) {
  const [volume, setVolume] = useState(80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api.engineeringVoice().then(result => { if (alive) setVolume(result.volume); }).catch(error => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, []);
  const testVoice = () => {
    if (!("speechSynthesis" in window)) { setError("瀏覽器不支援語音播放"); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("語音測試，請正確穿戴安全帽、防毒面具及隔熱手套。");
    utterance.lang = "zh-TW";
    utterance.volume = volume / 100;
    window.speechSynthesis.speak(utterance);
  };
  const save = async () => {
    setError(""); setBusy(true);
    try { await api.setEngineeringVoice(volume); notify("語音音量已儲存，工人端畫面會自動同步（最多約 15 秒）。", "success"); }
    catch (error) { setError(error.message || "儲存失敗"); }
    finally { setBusy(false); }
  };
  return <Card variant="outlined"><CardContent>
    <Typography variant="h6" fontWeight={700} mb={1}>語音警告音量</Typography>
    <Typography variant="body2" color="text.secondary">此設定套用於工人端的瀏覽器語音警告。工人端仍需自行點擊啟用聲音。</Typography>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    <Box sx={{ maxWidth: 480, mt: 3, mb: 2 }}>
      <Typography fontWeight={600}>音量：{volume}%</Typography>
      <Slider aria-label="語音警告音量" min={0} max={100} step={5} value={volume} onChange={(_, value) => setVolume(value)} valueLabelDisplay="auto" />
    </Box>
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Button variant="contained" disabled={busy} onClick={() => void save()}>儲存音量</Button>
      <Button variant="outlined" onClick={testVoice}>測試語音</Button>
    </Stack>
  </CardContent></Card>;
}

const BOX_COLOR_LABELS = {
  person: "人員", __violation__: "違規人員", helmet: "安全帽",
  gas_mask: "防毒面具", respirator: "防毒面具", gloves: "手套", aluminized_gloves: "隔熱手套"
};

function BoxColors({ notify }) {
  const [data, setData] = useState(null);
  const [colors, setColors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const apply = result => { setData(result); setColors(result.colors || {}); };
  useEffect(() => {
    let alive = true;
    api.engineeringBoxColors().then(result => { if (alive) apply(result); }).catch(error => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, []);
  const save = async (next) => {
    setError(""); setBusy(true);
    try { apply(await api.setEngineeringBoxColors(next)); notify("框線顏色已儲存，即時畫面與之後的事件截圖會立即套用。", "success"); }
    catch (error) { setError(error.message || "儲存失敗"); }
    finally { setBusy(false); }
  };
  const classes = data?.classes || [];
  return <Card variant="outlined"><CardContent>
    <Typography variant="h6" fontWeight={700} mb={1}>辨識框線顏色</Typography>
    <Typography variant="body2" color="text.secondary">設定即時 AI 畫面與事件截圖中，每種物件的框線顏色。類別依目前模型自動列出。</Typography>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    {!data && !error && <Typography sx={{ mt: 2 }}>載入中…</Typography>}
    <Stack spacing={1.5} sx={{ mt: 3, mb: 3, maxWidth: 480 }}>
      {classes.map(name => <Stack key={name} direction="row" alignItems="center" spacing={2}>
        <Box component="input" type="color" aria-label={`${BOX_COLOR_LABELS[name] || name} 顏色`} value={colors[name] || "#000000"}
          onChange={event => setColors(old => ({ ...old, [name]: event.target.value.toUpperCase() }))}
          sx={{ width: 48, height: 32, p: 0, border: "1px solid", borderColor: "divider", borderRadius: 1, cursor: "pointer", bgcolor: "transparent" }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={600}>{BOX_COLOR_LABELS[name] || name}</Typography>
          {name !== "__violation__" && <Typography variant="caption" color="text.secondary">{name}</Typography>}
        </Box>
        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{colors[name]}</Typography>
      </Stack>)}
    </Stack>
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Button variant="contained" disabled={busy || !data} onClick={() => void save(colors)}>儲存顏色</Button>
      <Button variant="outlined" disabled={busy || !data} onClick={() => { if (window.confirm("確定全部還原為預設顏色？")) void save(data.defaults); }}>還原預設</Button>
    </Stack>
  </CardContent></Card>;
}

function TestEvents({ notify }) {
  const [cameras, setCameras] = useState([{ camera_id: DEFAULT_CAMERA_ID, name: DEFAULT_CAMERA_ID }]);
  const [cameraId, setCameraId] = useState(DEFAULT_CAMERA_ID);
  const [eventType, setEventType] = useState("no_helmet");
  const [note, setNote] = useState("");
  const [trackId, setTrackId] = useState("");
  const [resolved, setResolved] = useState(true);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async (alive = () => true) => {
    try { const result = await api.listTestEvents(); if (alive()) setEvents(result.events || []); }
    catch (error) { if (alive()) setError(error.message); }
  };
  useEffect(() => {
    let alive = true;
    void refresh(() => alive);
    api.publicCameras().then(result => {
      if (!alive || !result.cameras?.length) return;
      setCameras(result.cameras);
      setCameraId(current => result.cameras.some(cam => cam.camera_id === current) ? current : result.cameras[0].camera_id);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const create = async (type = eventType) => {
    setError(""); setBusy(true);
    try {
      const result = await api.createTestEvent({ event_type: type, camera_id: cameraId,
        note: note.trim(), track_id: trackId ? Number(trackId) : null, resolved });
      // Read back from the regular supervisor API to confirm SQLite persistence.
      const saved = await api.adminEvent(result.event_id);
      if (!saved || Number(saved.id) !== Number(result.event_id)) throw new Error('寫入後無法在事件資料庫查到這筆紀錄');
      notify(`已新增事件 #${result.event_id}，可在主管事件管理與統計中查看`, "success");
      await refresh();
    } catch (error) { setError(error.message || "新增模擬事件失敗，請確認後端日誌"); }
    finally { setBusy(false); }
  };
  const remove = async id => {
    if (!window.confirm(`確定刪除模擬事件 #${id}？這筆紀錄已納入正式統計，刪除後統計也會跟著變動。`)) return;
    setError("");
    try { await api.deleteTestEvent(id); notify(`已刪除模擬事件 #${id}`, "success"); await refresh(); }
    catch (error) { setError(error.message || "刪除失敗"); }
  };
  return <Stack spacing={2}>
    <Card variant="outlined"><CardContent>
      <Typography variant="h6" fontWeight={700} mb={1}>產生模擬事件</Typography>
      <Alert severity="warning" sx={{ mb: 2 }}>模擬事件會直接寫入正式事件列表，並納入儀表板、統計分析與 Gemini 報告，不再區分事件類別。這是手動產生的資料，不代表 YOLO 實際偵測；不會觸發現場語音警報，也不會產生真實攝影機截圖。請勿將其當成事故影像證據。</Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Typography fontWeight={600} variant="body2" mb={1}>快速新增</Typography>
      <Stack direction="row" flexWrap="wrap" gap={1} mb={3}>
        {TEST_TYPES.map(([type, label]) => <Button key={type} size="small" variant="outlined" disabled={busy} onClick={() => void create(type)}>{label}</Button>)}
      </Stack>
      <Divider sx={{ mb: 2 }}/>
      <Typography fontWeight={600} variant="body2" mb={2}>自訂事件條件</Typography>
      <Stack direction={{ xs: "column", md: "row" }} gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>事件類型</InputLabel>
          <Select value={eventType} label="事件類型" onChange={event => setEventType(event.target.value)}>
            {TEST_TYPES.map(([type, label]) => <MenuItem key={type} value={type}>{label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>攝影機</InputLabel>
          <Select value={cameraId} label="攝影機" onChange={event => setCameraId(event.target.value)}>
            {cameras.map(cam => <MenuItem key={cam.camera_id} value={cam.camera_id}>{cam.name || cam.camera_id}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" label="人員 ID（選填）" type="number" value={trackId} onChange={event => setTrackId(event.target.value)} inputProps={{ min: 1, max: 999999 }} />
      </Stack>
      <TextField label="備註（選填）" fullWidth size="small" value={note} onChange={event => setNote(event.target.value)} inputProps={{ maxLength: 160 }} sx={{ mb: 1 }} />
      <FormControlLabel label="事件已結束（不留未結案事件）" control={<Checkbox checked={resolved} onChange={event => setResolved(event.target.checked)} />} />
      <Box mt={1}><Button variant="contained" disabled={busy || !cameraId} onClick={() => void create()}>新增事件</Button></Box>
    </CardContent></Card>
    <Card variant="outlined"><CardContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h6" fontWeight={700}>最近產生的模擬事件</Typography>
        <Button size="small" onClick={() => void refresh()}>重新整理</Button>
      </Stack>
      <List disablePadding>
        {events.map(item => <Box key={item.id}>
          <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" py={1} gap={1}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography fontWeight={700}>#{item.id}</Typography>
                <Typography variant="body2">{TEST_TYPES.find(x => x[0] === item.event_type)?.[1] || item.event_type}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">{item.camera_id} · {item.start_time} UTC</Typography>
            </Box>
            <Button size="small" color="error" onClick={() => void remove(item.id)}>刪除</Button>
          </Stack>
          <Divider />
        </Box>)}
        {!events.length && <Typography color="text.secondary" sx={{ py: 2 }}>尚未建立模擬事件</Typography>}
      </List>
    </CardContent></Card>
  </Stack>;
}

export default function EngineerMaintenance() {
  const [section, setSection] = useState("recognition");
  const [info, setInfo] = useState(null);
  const [required, setRequired] = useState([]);
  const [threshold, setThreshold] = useState(1.5);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const notify = (message) => { setNotice(message); setError(""); };
  const load = async (alive = () => true) => {
    try {
      const response = await api.engineering();
      if (!alive()) return;
      setInfo(response);
      setRequired(Array.isArray(response?.required_ppe) ? response.required_ppe : []);
      setThreshold(Number(response?.settings?.event_trigger_seconds ?? 1.5));
    } catch (err) { if (alive()) setError(err.message || "工程師維護設定載入失敗"); }
  };
  useEffect(() => { let alive = true; void load(() => alive); return () => { alive = false; }; }, []);
  const saveRecognition = async () => {
    if (!window.confirm("確定修改辨識設定？")) return;
    setBusy(true); setError("");
    try { await api.setEngineering({ required_ppe: required, event_trigger_seconds: threshold }); notify("辨識設定已儲存"); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const backup = async () => {
    setBusy(true); setError("");
    try { const result = await api.backup(); notify(`備份完成：${result.filename}`); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <Box sx={{ p: { xs: 2, md: 3 } }}>
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
      <Card variant="outlined" sx={{ width: { xs: "100%", md: 260 }, flexShrink: 0 }}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Typography fontWeight={800} color="text.secondary" sx={{ px: 1, py: 1 }}>維護功能</Typography>
          <List disablePadding>
            {SECTIONS.map(item => <ListItemButton key={item.id} selected={section === item.id}
              onClick={() => { setSection(item.id); setError(""); setNotice(""); }} sx={{ borderRadius: 1.5, mb: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: section === item.id ? 700 : 500 }} />
            </ListItemButton>)}
          </List>
        </CardContent>
      </Card>
      <Box sx={{ flex: 1, width: "100%", minWidth: 0 }}>
        <Typography variant="h5" fontWeight={800} mb={2}>{SECTIONS.find(item => item.id === section)?.label}</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
        {section === "recognition" && <Stack spacing={2}>
          <Card variant="outlined"><CardContent>
            <Typography variant="h6" fontWeight={700} mb={1}>模型資訊（唯讀）</Typography>
            <Typography variant="body2">目前模型：{info?.model || "載入中…"}</Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} my={1}>
              {(Array.isArray(info?.classes) ? info.classes : []).map(name => <Chip key={name} size="small" label={name} />)}
            </Stack>
            <Typography variant="body2">Pose：{info?.pose_enabled ? "已載入" : "尚未啟用"}</Typography>
          </CardContent></Card>
          <Card variant="outlined"><CardContent>
            <Typography variant="h6" fontWeight={700} mb={2}>PPE 判斷</Typography>
            <Stack direction={{ xs: "column", sm: "row" }}>
              {PPE_OPTIONS.map(([id, label]) => <FormControlLabel key={id} label={label} control={<Checkbox checked={required.includes(id)}
                onChange={event => setRequired(old => event.target.checked ? [...new Set([...old, id])] : old.filter(value => value !== id))} />} />)}
            </Stack>
            <TextField sx={{ display: "block", my: 2 }} size="small" type="number" label="違規確認秒數" value={threshold}
              inputProps={{ min: 0.5, max: 20, step: 0.5 }} onChange={event => setThreshold(Number(event.target.value))} />
            <Button variant="contained" disabled={busy || !info || threshold < 0.5 || threshold > 20 || !Number.isFinite(threshold)} onClick={() => void saveRecognition()}>儲存辨識設定</Button>
          </CardContent></Card>
        </Stack>}
        {section === "cameras" && <EngineeringCameras notify={notify} />}
        {section === "status" && <SystemStatus />}
        {section === "environment" && <EnvironmentEditor notify={notify} />}
        {section === "voice" && <VoiceSettings notify={notify} />}
        {section === "box-colors" && <BoxColors notify={notify} />}
        {section === "test-events" && <TestEvents notify={notify} />}
        {section === "database" && <EngineeringDatabase notify={notify} />}
        {section === "backup" && <Card variant="outlined"><CardContent>
          <Typography variant="h6" fontWeight={700} mb={2}>資料備份</Typography>
          <Button disabled={busy} variant="outlined" onClick={() => void backup()}>備份資料庫</Button>
        </CardContent></Card>}
      </Box>
    </Stack>
  </Box>;
}
