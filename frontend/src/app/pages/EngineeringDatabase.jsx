import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography
} from "@mui/material";
import { api } from "../services/api";

const PAGE_SIZE = 30;
const DEFAULTS = { status: "closed", review_status: "pending", source_type: "rtsp", is_active: 1 };

function makeInitialValues(table, row) {
  return Object.fromEntries(table.fields
    .filter(field => !row || field.editable_on_update)
    .map(field => [field.name, row?.[field.name] ?? DEFAULTS[field.name] ?? ""]));
}

function EditDialog({ open, table, row, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !table) return;
    setValues(makeInitialValues(table, row));
    setError("");
  }, [open, table, row]);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const payload = {};
      for (const field of table.fields) {
        if (row && !field.editable_on_update) continue;
        const value = values[field.name];
        // Patch only changed fields; preserve review authorship and other metadata.
        if (row && String(value ?? "") === String(row[field.name] ?? "")) continue;
        if (field.required && (value === "" || value === null || value === undefined)) {
          throw new Error(`請填寫「${field.label}」`);
        }
        if (value === "" || value === null || value === undefined) {
          if (row) payload[field.name] = null;
          continue;
        }
        payload[field.name] = field.type === "boolean" ? Number(value) : value;
      }
      if (!Object.keys(payload).length) throw new Error("沒有需要儲存的欄位");
      const result = row
        ? await api.engineeringDatabaseUpdate(table.name, String(row[table.primary_key]), payload)
        : await api.engineeringDatabaseCreate(table.name, payload);
      onSaved(result.row);
    } catch (err) { setError(err.message || "儲存失敗"); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle>{row ? "修改資料" : "新增資料"} · {table?.label}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {table?.fields.filter(field => !row || field.editable_on_update).map(field => {
          const value = values[field.name] ?? "";
          if (field.type === "select" || field.type === "boolean") {
            const choices = field.type === "boolean" ? ["1", "0"] : field.choices;
            return <FormControl key={field.name} size="small" fullWidth>
              <InputLabel>{field.label}</InputLabel>
              <Select label={field.label} value={String(value)}
                onChange={event => setValues(old => ({ ...old, [field.name]: event.target.value }))}>
                {!field.required && <MenuItem value="">（空白）</MenuItem>}
                {choices.map(choice => <MenuItem key={choice} value={String(choice)}>
                  {field.type === "boolean" ? (choice === "1" ? "啟用" : "停用") : choice}
                </MenuItem>)}
              </Select>
            </FormControl>;
          }
          return <TextField key={field.name} fullWidth size="small" label={field.label}
            required={field.required} value={String(value)}
            multiline={field.type === "longtext"} minRows={field.type === "longtext" ? 2 : undefined}
            type={field.type === "integer" || field.type === "decimal" ? "number" : "text"}
            placeholder={field.type === "datetime" ? "2026-10-19 13:00:00（UTC）" : undefined}
            inputProps={field.type === "decimal" ? { min: 0, max: 1, step: 0.01 } : undefined}
            onChange={event => setValues(old => ({ ...old, [field.name]: event.target.value }))} />;
        })}
        {table?.name === "cameras" && <Alert severity="info">
          此處修改 SQLite 的攝影機資料，不會即時新增 RTSP 擷取程序；影像來源仍需在環境設定中設定並重啟。
        </Alert>}
        {table?.name === "events" && <Alert severity="info">
          手動新增的事件會直接納入一般事件清單、統計和 Gemini 報告；不會產生真實攝影機截圖。
        </Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ p: 2 }}>
      <Button disabled={busy} onClick={onClose}>取消</Button>
      <Button disabled={busy} variant="contained" onClick={() => void submit()}>{busy ? "儲存中…" : "確定儲存"}</Button>
    </DialogActions>
  </Dialog>;
}

export default function EngineeringDatabase({ notify }) {
  const [tables, setTables] = useState([]);
  const [tableName, setTableName] = useState("events");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api.engineeringDatabaseTables().then(result => {
      if (alive) setTables(result.tables || []);
    }).catch(err => { if (alive) setError(err.message || "無法取得資料表清單"); });
    return () => { alive = false; };
  }, []);
  const table = tables.find(item => item.name === tableName);

  useEffect(() => {
    let alive = true;
    setBusy(true); setError("");
    api.engineeringDatabaseList(tableName, { limit: PAGE_SIZE, offset: page * PAGE_SIZE, search })
      .then(result => { if (!alive) return; setRows(result.rows || []); setTotal(result.total || 0); })
      .catch(err => { if (alive) setError(err.message || "資料讀取失敗"); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [tableName, page, search, refresh]);

  const reload = () => setRefresh(current => current + 1);
  const remove = async row => {
    const pk = String(row[table.primary_key]);
    if (!window.confirm(`確定永久刪除 ${table.label} #${pk}？此操作會修改正式資料庫，且無法直接復原。建議先備份。`)) return;
    setError(""); setBusy(true);
    try {
      await api.engineeringDatabaseDelete(tableName, pk);
      notify?.(`已刪除 ${table.label} #${pk}`);
      reload();
    } catch (err) { setError(err.message || "刪除失敗"); }
    finally { setBusy(false); }
  };
  const switchTable = value => {
    setTableName(value); setPage(0); setSearch(""); setSearchText(""); setRows([]);
  };

  return <Stack spacing={2}>
    <Alert severity="info">此處直接讀寫 <strong>backend/safety.db</strong>。異常事件和攝影機資料可增刪改查，操作紀錄唯讀。帳號、登入工作階段、AI 對話與密鑰不開放直接修改。刪除前請先使用「資料備份」。</Alert>
    <Card variant="outlined"><CardContent>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} mb={2}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>資料表</InputLabel>
          <Select label="資料表" value={tableName} onChange={event => switchTable(event.target.value)}>
            {tables.map(item => <MenuItem key={item.name} value={item.name}>{item.label}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" fullWidth label="搜尋 ID、類型、說明或名稱" value={searchText}
          onChange={event => setSearchText(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { setPage(0); setSearch(searchText.trim()); } }} />
        <Button variant="outlined" onClick={() => { setPage(0); setSearch(searchText.trim()); reload(); }}>搜尋</Button>
        <Button variant="outlined" onClick={reload}>重新整理</Button>
        {table?.editable && <Button variant="contained" sx={{ whiteSpace: "nowrap" }} onClick={() => setDialog({ row: null })}>新增資料</Button>}
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Typography variant="body2" color="text.secondary" mb={1}>
        共 {total} 筆 · {busy ? "載入中…" : `第 ${page + 1} 頁`}
      </Typography>
      <TableContainer sx={{ overflowX: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
        <Table size="small" sx={{ minWidth: 790 }}>
          <TableHead><TableRow>
            {table?.columns.map(column => <TableCell key={column} sx={{ fontWeight: 750, whiteSpace: "nowrap" }}>{column}</TableCell>)}
            {table?.editable && <TableCell sx={{ fontWeight: 750, whiteSpace: "nowrap" }}>操作</TableCell>}
          </TableRow></TableHead>
          <TableBody>
            {rows.map(row => <TableRow hover key={String(row[table?.primary_key] ?? row.id)}>
              {table?.columns.map(column => <TableCell key={column} sx={{ maxWidth: 280, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={String(row[column] ?? "")}>
                {row[column] === null ? "—" : column === "is_active" ? (row[column] ? <Chip label="啟用" color="success" size="small" /> : <Chip label="停用" size="small" />) : String(row[column])}
              </TableCell>)}
              {table?.editable && <TableCell sx={{ whiteSpace: "nowrap" }}>
                <Button size="small" disabled={busy} onClick={() => setDialog({ row })}>修改</Button>
                <Button size="small" color="error" disabled={busy} onClick={() => void remove(row)}>刪除</Button>
              </TableCell>}
            </TableRow>)}
            {!rows.length && <TableRow><TableCell colSpan={(table?.columns.length || 1) + (table?.editable ? 1 : 0)} align="center" sx={{ py: 4 }}>
              {busy ? "載入中…" : "沒有符合條件的資料"}
            </TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack direction="row" justifyContent="flex-end" alignItems="center" gap={2} mt={2}>
        <Button size="small" disabled={busy || page === 0} onClick={() => setPage(value => value - 1)}>上一頁</Button>
        <Typography variant="body2">{page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</Typography>
        <Button size="small" disabled={busy || (page + 1) * PAGE_SIZE >= total} onClick={() => setPage(value => value + 1)}>下一頁</Button>
      </Stack>
    </CardContent></Card>
    <EditDialog open={Boolean(dialog)} table={table} row={dialog?.row ?? null} onClose={() => setDialog(null)}
      onSaved={() => { setDialog(null); reload(); notify?.("已儲存至資料庫"); }} />
  </Stack>;
}
