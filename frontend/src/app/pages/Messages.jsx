import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Avatar, Badge, Box, Card, IconButton, InputAdornment, List, ListItemAvatar, ListItemButton,
  ListItemText, Stack, TextField, Typography, useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SendRounded from "@mui/icons-material/SendRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";

import { api } from "app/services/api";
import PageHeader, { Page } from "app/components/PageHeader";
import { formatUtcDate } from "./shared";

const ROLE_LABELS = { admin: "管理員", engineer: "工程師", supervisor: "主管" };
const nameOf = (person) => person?.display_name || person?.username || "";

function shortTime(value) {
  if (!value) return "";
  const date = new Date(`${String(value).replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

function ContactList({ contacts, selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const shown = contacts.filter(c => !query.trim() || `${c.username} ${c.display_name || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
    <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
      <TextField size="small" fullWidth placeholder="搜尋帳號" value={query} onChange={e => setQuery(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
    </Box>
    <List disablePadding sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {shown.map(contact => <ListItemButton key={contact.id} selected={contact.id === selectedId} onClick={() => onSelect(contact.id)} sx={{ py: 1.25 }}>
        <ListItemAvatar>
          <Badge color="error" badgeContent={contact.unread} overlap="circular">
            <Avatar sx={{ bgcolor: "hmi.brandBg", color: "hmi.brand", fontWeight: 700 }}>{nameOf(contact).slice(0, 1).toUpperCase()}</Avatar>
          </Badge>
        </ListItemAvatar>
        <ListItemText
          primary={<Stack direction="row" justifyContent="space-between" gap={1}>
            <Typography noWrap fontWeight={contact.unread ? 800 : 600}>{nameOf(contact)}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{shortTime(contact.last_message?.created_at)}</Typography>
          </Stack>}
          secondary={<Typography variant="body2" noWrap color={contact.unread ? "text.primary" : "text.secondary"}>
            {contact.last_message ? contact.last_message.body : ROLE_LABELS[contact.role] || contact.role}
          </Typography>} />
      </ListItemButton>)}
      {!shown.length && <Typography color="text.secondary" sx={{ p: 2 }}>沒有其他帳號</Typography>}
    </List>
  </Box>;
}

function Thread({ contact, me, onBack, onSent }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);

  // Re-read the whole (latest 200) conversation each poll so "已讀" on my own
  // messages also updates; conversations here are small.
  const load = useCallback(async () => {
    try {
      const result = await api.messageThread(contact.id);
      setMessages(result.messages || []);
      setError("");
    } catch (err) { setError(err.message || "讀取訊息失敗"); }
  }, [contact.id]);

  useEffect(() => {
    setMessages([]); setDraft("");
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const message = await api.sendMessage(contact.id, body);
      setDraft("");
      setMessages(old => [...old, message]);
      onSent?.();
    } catch (err) { setError(err.message || "傳送失敗"); }
    finally { setSending(false); }
  };

  return <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
      {onBack && <IconButton size="small" onClick={onBack} aria-label="返回"><ArrowBackRounded /></IconButton>}
      <Avatar sx={{ width: 36, height: 36, bgcolor: "hmi.brandBg", color: "hmi.brand", fontWeight: 700 }}>{nameOf(contact).slice(0, 1).toUpperCase()}</Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography fontWeight={700} noWrap>{nameOf(contact)}</Typography>
        <Typography variant="caption" color="text.secondary">{ROLE_LABELS[contact.role] || contact.role} · {contact.username}</Typography>
      </Box>
    </Stack>

    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 1.5, bgcolor: "background.default" }}>
      {!messages.length && <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>尚無訊息</Typography>}
      {messages.map((message, index) => {
        const mine = message.sender_id === me;
        const prev = messages[index - 1];
        const showTime = !prev || new Date(`${message.created_at.replace(" ", "T")}Z`) - new Date(`${prev.created_at.replace(" ", "T")}Z`) > 10 * 60 * 1000;
        return <Box key={message.id}>
          {showTime && <Typography variant="caption" color="text.secondary" component="div" textAlign="center" sx={{ my: 1 }}>{formatUtcDate(message.created_at)}</Typography>}
          <Stack direction="row" justifyContent={mine ? "flex-end" : "flex-start"} sx={{ mb: .75 }}>
            <Box sx={{ maxWidth: "72%", px: 1.5, py: 1, borderRadius: 2, whiteSpace: "pre-wrap", wordBreak: "break-word",
              ...(mine ? { bgcolor: "primary.main", color: "primary.contrastText", borderBottomRightRadius: 4 }
                : { bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderBottomLeftRadius: 4 }) }}>
              <Typography variant="body2">{message.body}</Typography>
              <Typography variant="caption" sx={{ display: "block", textAlign: "right", opacity: .75, mt: .25 }}>
                {shortTime(message.created_at)}{mine && message.read_at ? " · 已讀" : ""}
              </Typography>
            </Box>
          </Stack>
        </Box>;
      })}
      <div ref={bottom} />
    </Box>

    {error && <Alert severity="error" sx={{ mx: 2, mt: 1 }} onClose={() => setError("")}>{error}</Alert>}
    <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
      <TextField fullWidth multiline maxRows={4} size="small" placeholder="輸入訊息，Enter 傳送，Shift + Enter 換行" value={draft}
        inputProps={{ maxLength: 2000 }}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
      <IconButton color="primary" onClick={() => void send()} disabled={!draft.trim() || sending} aria-label="傳送"><SendRounded /></IconButton>
    </Stack>
  </Box>;
}

export default function Messages() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const [contacts, setContacts] = useState([]);
  const [me, setMe] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try { const result = await api.messageContacts(); setContacts(result.contacts || []); setMe(result.me); setError(""); }
    catch (err) { setError(err.message || "讀取聯絡人失敗"); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selected = useMemo(() => contacts.find(c => c.id === selectedId) || null, [contacts, selectedId]);
  const showList = !narrow || !selected;
  const showThread = !narrow || selected;

  return <Page sx={{ height: { md: "calc(100dvh - 64px)" }, display: "flex", flexDirection: "column", minHeight: 0 }}>
    <PageHeader title="訊息" />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Card variant="outlined" sx={{ flex: 1, minHeight: { xs: "70dvh", md: 0 }, display: "grid", gridTemplateColumns: { xs: "1fr", md: "320px minmax(0, 1fr)" } }}>
      {showList && <Box sx={{ borderRight: { md: "1px solid" }, borderColor: { md: "divider" }, minHeight: 0 }}>
        <ContactList contacts={contacts} selectedId={selectedId} onSelect={setSelectedId} />
      </Box>}
      {showThread && <Box sx={{ minHeight: 0, minWidth: 0 }}>
        {selected && me != null
          ? <Thread contact={selected} me={me} onBack={narrow ? () => setSelectedId(null) : null} onSent={refresh} />
          : <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "text.secondary" }}>選擇一個帳號開始對話</Box>}
      </Box>}
    </Card>
  </Page>;
}
