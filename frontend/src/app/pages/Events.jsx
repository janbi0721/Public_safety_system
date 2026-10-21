import { useMemo, useState } from "react";
import {Dialog,DialogTitle,DialogContent,DialogActions,TextField} from "@mui/material";
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
import { eventLabel, formatUtcDate } from "./shared";

export default function Events() {
  const { events, loading, error, refresh } = useEvents({ limit: 200 });
  const [filter, setFilter] = useState("all");
  const [selected,setSelected]=useState(null);
  const [snapshots,setSnapshots]=useState([]);
  const [review,setReview]=useState("pending");
  const [note,setNote]=useState("");
  const [savingId, setSavingId] = useState(null);
  const [actionError, setActionError] = useState("");

  const rows = useMemo(() => events.filter((event) => {
    if (filter === "improved") return Boolean(event.is_improved);
    if (filter === "pending") return !event.is_improved;
    return true;
  }), [events, filter]);

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

        </Box>
        <Stack direction={{xs:"column",sm:"row"}} spacing={1}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>改善狀態</InputLabel>
          <Select label="改善狀態" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <MenuItem value="all">全部</MenuItem>
            <MenuItem value="pending">未改善</MenuItem>
            <MenuItem value="improved">已改善</MenuItem>
          </Select>
        </FormControl>
        </Stack>
      </Stack>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

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
                    <TableCell sx={{ fontWeight: 700 }}>#{event.id}</TableCell>
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
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6 }}>目前沒有事件資料</TableCell></TableRow>
                )}
                {error && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6, color: "error.main" }}>無法讀取異常事件：{error.message}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
      <Dialog open={Boolean(selected)} onClose={()=>setSelected(null)} maxWidth="md" fullWidth>
        <DialogTitle>事件 #{selected?.id}</DialogTitle>
        <DialogContent><Stack spacing={2} mt={1}><Typography>{selected?.message?.replace(/^【測試資料】/, "").replace(/^模擬跌倒事件$/, "人員跌倒")}</Typography><Typography variant="caption">結束原因：{selected?.close_reason === 'test_finished' ? '手動結束' : (selected?.close_reason || '—')}</Typography>
          <Stack direction="row" gap={2} flexWrap="wrap">{snapshots.map(x=><Box key={x.id} sx={{width:280,border:'1px solid',borderColor:'divider',borderRadius:1,p:1}}><Typography variant="caption">{x.phase} · {x.kind}</Typography><SnapshotImage id={x.id}/><Button color="error" size="small" onClick={()=>removeImage(x.id)}>刪除截圖</Button></Box>)}</Stack>
          <TextField select label="審核狀態" value={review} onChange={e=>setReview(e.target.value)} SelectProps={{native:true}}><option value="pending">待處理</option><option value="improved">已改善</option><option value="false_positive">誤判</option></TextField>
          <TextField label="主管備註" multiline rows={2} value={note} onChange={e=>setNote(e.target.value)}/>
        </Stack></DialogContent><DialogActions><Button onClick={()=>setSelected(null)}>取消</Button><Button variant="contained" onClick={saveReview}>儲存</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
