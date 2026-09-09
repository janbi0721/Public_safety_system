import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
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

import useEvents from "app/hooks/useEvents";
import { eventLabel, formatUtcDate } from "./shared";

export default function Events() {
  const { events, loading, error } = useEvents({ limit: 200 });
  const [status, setStatus] = useState("all");

  const rows = useMemo(
    () => events.filter((event) => status === "all" || event.status === status),
    [events, status]
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>異常事件</Typography>
          <Typography variant="body2" color="text.secondary">由 SafetyAnalyzer / EventManager 寫入 SQLite 的安全事件</Typography>
        </Box>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>狀態</InputLabel>
          <Select label="狀態" value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="all">全部</MenuItem>
            <MenuItem value="active">進行中</MenuItem>
            <MenuItem value="resolved">已解除</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Card variant="outlined">
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <Box sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>攝影機</TableCell>
                  <TableCell>事件</TableCell>
                  <TableCell>Track ID</TableCell>
                  <TableCell>信心值</TableCell>
                  <TableCell>開始時間</TableCell>
                  <TableCell>結束時間</TableCell>
                  <TableCell>狀態</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((event) => (
                  <TableRow hover key={event.id}>
                    <TableCell>{event.id}</TableCell>
                    <TableCell>{event.camera_id}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{eventLabel(event.event_type)}</TableCell>
                    <TableCell>{event.track_id ?? "—"}</TableCell>
                    <TableCell>{event.confidence == null ? "—" : `${(Number(event.confidence) * 100).toFixed(1)}%`}</TableCell>
                    <TableCell>{formatUtcDate(event.start_time)}</TableCell>
                    <TableCell>{formatUtcDate(event.end_time)}</TableCell>
                    <TableCell>
                      <Chip size="small" color={event.status === "active" ? "warning" : "success"} label={event.status || "—"} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && !error && rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5 }}>目前沒有事件資料</TableCell></TableRow>
                )}
                {error && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: "error.main" }}>無法讀取 FastAPI：{error.message}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
