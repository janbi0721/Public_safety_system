import { useEffect, useState } from "react";
import {Checkbox,Dialog,DialogTitle,DialogContent,DialogActions,FormControlLabel,TextField,ToggleButton,ToggleButtonGroup} from "@mui/material";
import PeopleView from "./PeopleView";
import SnapshotImage from "../components/SnapshotImage";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { useEvents } from "app/hooks/admin";
import { api } from "app/services/api";
import { closeReasonLabel, eventCode, eventLabel, formatUtcDate } from "./shared";

const PAGE_SIZE = 50;
const EVENT_TYPES = ["no_helmet", "no_gas_mask", "no_gloves", "fall_detected"];
const EMPTY_SEARCH = { from: "", to: "", cameraId: "", eventType: "", improved: "all", reviewStatus: "", q: "", violatedOnly: false };

function localDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A 'YYYY-MM-DD' picked in the browser means local midnight; send it as an ISO instant.
function dayStartIso(day, addDays = 0) {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + addDays);
  return date.toISOString();
}

function toFilters(search) {
  return {
    start: search.from ? dayStartIso(search.from) : undefined,
    end: search.to ? dayStartIso(search.to, 1) : undefined,
    cameraId: search.cameraId || undefined,
    eventType: search.eventType || undefined,
    isImproved: search.improved === "all" ? undefined : search.improved === "improved",
    reviewStatus: search.reviewStatus || undefined,
    q: search.q || undefined
  };
}

// Person view shares the date / camera / keyword filters with the event view.
function toPeopleFilters(search) {
  const { start, end, cameraId, q } = toFilters(search);
  return { start, end, cameraId, q, violatedOnly: search.violatedOnly || undefined };
}

export default function Events() {
  const [view, setView] = useState("events");
  const [draft, setDraft] = useState(EMPTY_SEARCH);
  const [applied, setApplied] = useState(EMPTY_SEARCH);
  const [page, setPage] = useState(0);
  const [cameras, setCameras] = useState([]);
  const { events: rows, total, loading, error, refresh } = useEvents({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, filters: toFilters(applied), interval: view === "events" ? 5000 : 0 });
  const [selected,setSelected]=useState(null);
  const [snapshots,setSnapshots]=useState([]);
  const [review,setReview]=useState("pending");
  const [note,setNote]=useState("");
  const [savingId, setSavingId] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let alive = true;
    // adminCameras lists only online cameras; keep both IDs so past events of an offline camera stay searchable.
    const known = [{ camera_id: "camera-01" }, { camera_id: "camera-02" }];
    const merge = (online = []) => [...online, ...known.filter(k => !online.some(c => c.camera_id === k.camera_id))];
    setCameras(merge());
    api.adminCameras().then(result => { if (alive) setCameras(merge(result.cameras || [])); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const set = (key) => (event) => setDraft(old => ({ ...old, [key]: event.target.value }));
  const apply = (next = draft) => { setDraft(next); setApplied(next); setPage(0); };
  const quickRange = (days) => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - (days - 1));
    apply({ ...draft, from: localDate(from), to: localDate(today) });
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const details=async event=>{setSelected(event);setReview(event.review_status||'pending');setNote(event.review_note||'');try{setSnapshots((await api.snapshots(event.id)).snapshots)}catch(e){setActionError(e.message)}};
  const saveReview=async()=>{try{await api.reviewEvent(selected.id,review,note);await refresh();setSelected(null)}catch(e){setActionError(e.message)}};
  const removeImage=async id=>{if(!window.confirm('刪除這張圖片？文字紀錄仍保留。'))return;await api.removeSnapshot(id);setSnapshots(old=>old.filter(x=>x.id!==id))};
  const toggleImproved = async (event) => {
    setSavingId(event.id);
    setActionError("");
    try {
      await api.setEventImproved(event.id, !event.is_improved);
      await refresh();
    } catch (err) {
      setActionError(err.message || "更新失敗");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>異常事件紀錄</Typography>
          {view === "events" && <Typography variant="body2" color="text.secondary">共 {total} 筆符合條件</Typography>}
        </Box>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, value) => value && setView(value)} aria-label="分類方式">
          <ToggleButton value="events">依事件</ToggleButton>
          <ToggleButton value="people">依人員</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Box component="form" onSubmit={(event) => { event.preventDefault(); apply(); }}>
            <Stack direction={{ xs: "column", md: "row" }} gap={1.5} flexWrap="wrap" alignItems={{ md: "center" }}>
              <TextField size="small" type="date" label="開始日期" value={draft.from} onChange={set("from")} InputLabelProps={{ shrink: true }} inputProps={{ max: draft.to || undefined }} />
              <TextField size="small" type="date" label="結束日期" value={draft.to} onChange={set("to")} InputLabelProps={{ shrink: true }} inputProps={{ min: draft.from || undefined }} />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>攝影機</InputLabel>
                <Select label="攝影機" value={draft.cameraId} onChange={set("cameraId")}>
                  <MenuItem value="">全部</MenuItem>
                  {cameras.map(camera => <MenuItem key={camera.camera_id} value={camera.camera_id}>{camera.name || camera.camera_id}</MenuItem>)}
                </Select>
              </FormControl>
              {view === "people" && <FormControlLabel label="只看有違規的人" control={
                <Checkbox size="small" checked={draft.violatedOnly} onChange={event => setDraft(old => ({ ...old, violatedOnly: event.target.checked }))} />} />}
              {view === "events" && <>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>事件類型</InputLabel>
                <Select label="事件類型" value={draft.eventType} onChange={set("eventType")}>
                  <MenuItem value="">全部</MenuItem>
                  {EVENT_TYPES.map(type => <MenuItem key={type} value={type}>{eventLabel(type)}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>改善狀態</InputLabel>
                <Select label="改善狀態" value={draft.improved} onChange={set("improved")}>
                  <MenuItem value="all">全部</MenuItem>
                  <MenuItem value="pending">未改善</MenuItem>
                  <MenuItem value="improved">已改善</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>審核狀態</InputLabel>
                <Select label="審核狀態" value={draft.reviewStatus} onChange={set("reviewStatus")}>
                  <MenuItem value="">全部</MenuItem>
                  <MenuItem value="pending">待處理</MenuItem>
                  <MenuItem value="improved">已改善</MenuItem>
                  <MenuItem value="false_positive">誤判</MenuItem>
                </Select>
              </FormControl>
              </>}
              <TextField size="small" label={view === "events" ? "關鍵字 / 事件編號（如 20261021）/ 人員 ID" : "人員編號（如 20261021）/ 追蹤 ID"} value={draft.q} onChange={set("q")} sx={{ minWidth: 220 }} />
              <Button type="submit" variant="contained">搜尋</Button>
              <Button onClick={() => apply(EMPTY_SEARCH)}>清除條件</Button>
            </Stack>
          </Box>
          <Stack direction="row" gap={1} mt={1.5} flexWrap="wrap" alignItems="center">
            <Typography variant="body2" color="text.secondary">快速選擇：</Typography>
            <Chip size="small" label="今天" onClick={() => quickRange(1)} />
            <Chip size="small" label="近 7 天" onClick={() => quickRange(7)} />
            <Chip size="small" label="近 30 天" onClick={() => quickRange(30)} />
          </Stack>
        </CardContent>
      </Card>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

      {view === "people" ? <PeopleView filters={toPeopleFilters(applied)} onOpenEvent={details} /> : (
      <Card variant="outlined">
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <Box sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>編號</TableCell>
                  <TableCell>時間</TableCell>
                  <TableCell>類型</TableCell>
                  <TableCell>攝影機</TableCell>
                  <TableCell>人員 ID</TableCell>
                  <TableCell>AI 偵測結束</TableCell>
                  <TableCell>是否已改善</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((event) => (
                  <TableRow hover key={event.id}>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap", fontFamily: "monospace" }}>{eventCode(event)}</TableCell>
                    <TableCell>{formatUtcDate(event.start_time)}</TableCell>
                    <TableCell>
                      <Typography fontWeight={600} variant="body2">{eventLabel(event.event_type)}</Typography>
                      {event.message && <Typography variant="caption" color="text.secondary">{event.message.replace(/^【測試資料】/, "").replace(/^模擬跌倒事件$/, "人員跌倒")}</Typography>}
                    </TableCell>
                    <TableCell>{event.camera_id}</TableCell>
                    <TableCell>{event.track_id ?? "—"}</TableCell>
                    <TableCell>{formatUtcDate(event.end_time)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={event.is_improved ? "success" : "warning"}
                        label={event.is_improved ? "已改善" : "未改善"}
                      />
                      {event.is_improved && event.improved_by_username && (
                        <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
                          {event.improved_by_username}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={()=>details(event)}>截圖／審核</Button>
                      <Button
                        size="small"
                        variant={event.is_improved ? "outlined" : "contained"}
                        color={event.is_improved ? "inherit" : "success"}
                        disabled={savingId === event.id}
                        onClick={() => toggleImproved(event)}>
                        {event.is_improved ? "改回未改善" : "標記已改善"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {!loading && !error && rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6 }}>沒有符合條件的事件</TableCell></TableRow>
                )}
                {error && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6, color: "error.main" }}>無法讀取異常事件：{error.message}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
          <Stack direction="row" justifyContent="flex-end" alignItems="center" gap={2} sx={{ p: 1.5 }}>
            <Button size="small" disabled={page === 0} onClick={() => setPage(value => value - 1)}>上一頁</Button>
            <Typography variant="body2">{page + 1} / {pages}</Typography>
            <Button size="small" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>下一頁</Button>
          </Stack>
        </CardContent>
      </Card>
      )}
      <Dialog open={Boolean(selected)} onClose={()=>setSelected(null)} maxWidth="md" fullWidth>
        <DialogTitle>事件 {eventCode(selected)}</DialogTitle>
        <DialogContent><Stack spacing={2} mt={1}><Typography>{selected?.message?.replace(/^【測試資料】/, "").replace(/^模擬跌倒事件$/, "人員跌倒")}</Typography><Typography variant="caption">結束原因：{selected?.end_time ? closeReasonLabel(selected?.close_reason) : "進行中（仍未戴好）"}</Typography>
          <Stack direction="row" gap={2} flexWrap="wrap">{snapshots.map(x=><Box key={x.id} sx={{width:280,border:'1px solid',borderColor:'divider',borderRadius:1,p:1}}><Typography variant="caption">{x.phase} · {x.kind}</Typography><SnapshotImage id={x.id}/><Button color="error" size="small" onClick={()=>removeImage(x.id)}>刪除截圖</Button></Box>)}</Stack>
          <TextField select label="審核狀態" value={review} onChange={e=>setReview(e.target.value)} SelectProps={{native:true}}><option value="pending">待處理</option><option value="improved">已改善</option><option value="false_positive">誤判</option></TextField>
          <TextField label="主管備註" multiline rows={2} value={note} onChange={e=>setNote(e.target.value)}/>
        </Stack></DialogContent><DialogActions><Button onClick={()=>setSelected(null)}>取消</Button><Button variant="contained" onClick={saveReview}>儲存</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
