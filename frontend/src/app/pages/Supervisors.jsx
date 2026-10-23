import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import {MenuItem} from "@mui/material";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import KeyOutlined from "@mui/icons-material/KeyOutlined";

import { useAuth } from "app/auth/SupervisorAuth";
import { useSupervisors } from "app/hooks/admin";
import { api } from "app/services/api";
import PageHeader, { Page } from "app/components/PageHeader";
import { formatUtcDate } from "./shared";

const emptyCreate = { username: "", display_name: "", password: "",role:"supervisor" };

export default function Supervisors() {
  const { user, refreshUser } = useAuth();
  const { supervisors, loading, error, refresh } = useSupervisors();
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(emptyCreate);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const runAction = async (action) => {
    setBusy(true);
    setActionError("");
    try {
      await action();
      await refresh();
      await refreshUser();
      return true;
    } catch (err) {
      setActionError(err.message || "操作失敗");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createSupervisor = async () => {
    const ok = await runAction(() => api.createSupervisor({
      username: form.username.trim(),
      display_name: form.display_name.trim() || null,
      password: form.password,
      role: form.role
    }));
    if (ok) {
      setForm(emptyCreate);
      setCreateOpen(false);
    }
  };

  const resetPassword = async () => {
    if (!passwordTarget) return;
    const ok = await runAction(() => api.updateSupervisor(passwordTarget.id, { password: newPassword }));
    if (ok) {
      setNewPassword("");
      setPasswordTarget(null);
    }
  };

  const toggleActive = async (supervisor) => {
    await runAction(() => api.updateSupervisor(supervisor.id, { is_active: !supervisor.is_active }));
  };

  const deleteSupervisor = async () => {
    if (!deleteTarget) return;
    const ok = await runAction(() => api.deleteSupervisor(deleteTarget.id));
    if (ok) setDeleteTarget(null);
  };

  return (
    <Page>
      <PageHeader title="帳號管理" meta={`共 ${supervisors.length} 個帳號`}
        actions={<Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreateOpen(true)}>新增帳號</Button>} />

      {(actionError || error) && <Alert severity="error" sx={{ mb: 2 }}>{actionError || error?.message}</Alert>}

      <Card variant="outlined">
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <Box sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>帳號</TableCell><TableCell>角色</TableCell>
                  <TableCell>顯示名稱</TableCell>
                  <TableCell>狀態</TableCell>
                  <TableCell>最後登入</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {supervisors.map((supervisor) => {
                  const isSelf = user?.id === supervisor.id;
                  return (
                    <TableRow hover key={supervisor.id}>
                      <TableCell>#{supervisor.id}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {supervisor.username} {isSelf && <Chip size="small" label="目前帳號" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell>{supervisor.role||'supervisor'}<Button size="small" sx={{ml:1}} disabled={busy||isSelf} onClick={async()=>{const newRole=window.prompt('角色 supervisor / engineer / admin',supervisor.role||'supervisor');if(!['supervisor','engineer','admin'].includes(newRole))return;await runAction(()=>api.updateSupervisor(supervisor.id,{role:newRole}))}}>更改</Button></TableCell>
                      <TableCell>{supervisor.display_name || "—"}</TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Switch
                            size="small"
                            checked={Boolean(supervisor.is_active)}
                            disabled={busy || isSelf}
                            onChange={() => toggleActive(supervisor)}
                          />
                          <Typography variant="body2">{supervisor.is_active ? "啟用" : "停用"}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>{formatUtcDate(supervisor.last_login_at)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" justifyContent="flex-end" spacing={1}>
                          <Button size="small" startIcon={<KeyOutlined />} onClick={() => { setPasswordTarget(supervisor); setNewPassword(""); }}>
                            重設密碼
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<DeleteOutline />}
                            disabled={busy || isSelf}
                            onClick={() => setDeleteTarget(supervisor)}>
                            刪除
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && supervisors.length === 0 && (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}>沒有主管帳號</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onClose={() => !busy && setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>新增主管帳號</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="帳號" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} helperText="3–50 字元，可使用英數、_ . -" />
            <TextField label="顯示名稱" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            <TextField select label="角色" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><MenuItem value="supervisor">主管</MenuItem><MenuItem value="engineer">工程師</MenuItem><MenuItem value="admin">系統管理員</MenuItem></TextField>
            <TextField label="初始密碼" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} helperText="至少 8 個字元" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={busy}>取消</Button>
          <Button variant="contained" onClick={createSupervisor} disabled={busy || form.username.trim().length < 3 || form.password.length < 8}>建立帳號</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(passwordTarget)} onClose={() => !busy && setPasswordTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>重設密碼</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>帳號：{passwordTarget?.username}</Typography>
          <TextField fullWidth label="新密碼" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} helperText="至少 8 個字元" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordTarget(null)} disabled={busy}>取消</Button>
          <Button variant="contained" onClick={resetPassword} disabled={busy || newPassword.length < 8}>更新密碼</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => !busy && setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>刪除主管帳號？</DialogTitle>
        <DialogContent>
          <Typography>確定要刪除「{deleteTarget?.username}」嗎？此操作無法復原。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={busy}>取消</Button>
          <Button color="error" variant="contained" onClick={deleteSupervisor} disabled={busy}>刪除</Button>
        </DialogActions>
      </Dialog>
    </Page>
  );
}
