import { useCallback, useEffect, useState } from "react";
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography
} from "@mui/material";

import { api } from "app/services/api";
import { PPE_LABELS, cameraLabel, eventCode, eventLabel, formatDuration, formatUtcDate, personEndLabel } from "./shared";

const PAGE_SIZE = 50;

function StatusChips({ person }) {
  const entries = Object.entries(person.ppe_status || {});
  if (!entries.length) return <Typography variant="body2" color="text.secondary">尚未判定</Typography>;
  return <Stack direction="row" gap={0.5} flexWrap="wrap">
    {entries.map(([ppe, status]) => <Chip key={ppe} size="small" color={status === "violation" ? "error" : "success"}
      label={`${PPE_LABELS[ppe] || ppe}${status === "violation" ? "未戴好" : "已戴好"}`} />)}
  </Stack>;
}

// One timeline: entered -> each PPE change -> left, with this person's events.
function timelineItems(person) {
  const items = [{ at: person.first_seen, text: "進入鏡頭", color: "info.main" }];
  for (const change of person.changes || []) {
    items.push({
      at: change.at,
      text: `${PPE_LABELS[change.ppe] || change.ppe}：${change.status === "violation" ? "未戴好" : "已戴好"}`,
      color: change.status === "violation" ? "error.main" : "success.main"
    });
  }
  if (person.end_time) items.push({ at: person.end_time, text: personEndLabel(person.end_reason), color: "text.secondary" });
  return items;
}

function PersonTimeline({ sessionId, onClose, onOpenEvent }) {
  const [person, setPerson] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!sessionId) return undefined;
    let alive = true;
    setPerson(null); setError("");
    api.adminPerson(sessionId).then(result => { if (alive) setPerson(result); })
      .catch(err => { if (alive) setError(err.message || "讀取失敗"); });
    return () => { alive = false; };
  }, [sessionId]);
  return <Dialog open={Boolean(sessionId)} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>人員 {person?.session_code || ""}</DialogTitle>
    <DialogContent>
      {error && <Typography color="error">{error}</Typography>}
      {!person && !error && <Typography>載入中…</Typography>}
      {person && <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {cameraLabel(person.camera_id)} · 追蹤 ID {person.track_id ?? "—"} · 停留 {formatDuration(person.duration_seconds)}{person.is_open ? "（仍在鏡頭中）" : ""}
        </Typography>
        <Box>
          {timelineItems(person).map((item, index) => <Stack key={index} direction="row" spacing={1.5} alignItems="flex-start" sx={{ py: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: item.color, mt: 0.6, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ minWidth: 150, fontFamily: "monospace" }}>{formatUtcDate(item.at)}</Typography>
            <Typography variant="body2" fontWeight={600}>{item.text}</Typography>
          </Stack>)}
          {person.is_open && <Typography variant="caption" color="text.secondary">仍在鏡頭中，最後看到：{formatUtcDate(person.last_seen)}</Typography>}
        </Box>
        <Box>
          <Typography fontWeight={700} mb={1}>相關事件（{person.events.length}）</Typography>
          {!person.events.length && <Typography variant="body2" color="text.secondary">沒有違規事件</Typography>}
          {person.events.map(event => <Stack key={event.id} direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ py: 0.5 }}>
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ fontFamily: "monospace" }}>{eventCode(event)}</Typography>
              <Typography variant="caption" color="text.secondary">{eventLabel(event.event_type)} · {formatUtcDate(event.start_time)} ～ {event.end_time ? formatUtcDate(event.end_time) : "進行中"}</Typography>
            </Box>
            <Button size="small" onClick={() => onOpenEvent(event)}>截圖／審核</Button>
          </Stack>)}
        </Box>
      </Stack>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>關閉</Button></DialogActions>
  </Dialog>;
}

export default function PeopleView({ filters, onOpenEvent }) {
  const [page, setPage] = useState(0);
  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const filterKey = JSON.stringify(filters || {});

  useEffect(() => { setPage(0); }, [filterKey]);

  const refresh = useCallback(async () => {
    try {
      const data = await api.adminPeople({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, ...JSON.parse(filterKey) });
      setPeople(data.people || []); setTotal(data.total || 0); setError(null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [page, filterKey]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <>
    <Typography variant="body2" color="text.secondary" mb={1}>共 {total} 位人員紀錄</Typography>
    <Card variant="outlined">
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Box sx={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>人員編號</TableCell>
                <TableCell>攝影機</TableCell>
                <TableCell>進入</TableCell>
                <TableCell>離開</TableCell>
                <TableCell>停留</TableCell>
                <TableCell>曾違規項目</TableCell>
                <TableCell>目前／最後狀態</TableCell>
                <TableCell>事件數</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map(person => <TableRow hover key={person.id}>
                <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap", fontFamily: "monospace" }}>{person.session_code || `P${person.id}`}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{cameraLabel(person.camera_id)}</TableCell>
                <TableCell>{formatUtcDate(person.first_seen)}</TableCell>
                <TableCell>{person.is_open ? <Chip size="small" color="info" label="仍在鏡頭中" /> : formatUtcDate(person.end_time)}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDuration(person.duration_seconds)}</TableCell>
                <TableCell>{person.violated_ppe.length
                  ? person.violated_ppe.map(ppe => PPE_LABELS[ppe] || ppe).join("、")
                  : <Typography variant="body2" color="success.main">無</Typography>}</TableCell>
                <TableCell><StatusChips person={person} /></TableCell>
                <TableCell>{person.event_count}</TableCell>
                <TableCell align="right"><Button size="small" onClick={() => setOpenId(person.id)}>時間軸</Button></TableCell>
              </TableRow>)}
              {!loading && !error && people.length === 0 && (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}>沒有符合條件的人員紀錄</TableCell></TableRow>
              )}
              {error && (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6, color: "error.main" }}>無法讀取人員紀錄：{error.message}</TableCell></TableRow>
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
    <PersonTimeline sessionId={openId} onClose={() => setOpenId(null)} onOpenEvent={event => { setOpenId(null); onOpenEvent(event); }} />
  </>;
}
