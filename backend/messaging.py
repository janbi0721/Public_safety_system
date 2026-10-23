"""One-to-one messages between logged-in accounts (supervisor / engineer / admin).

Only the two participants can read a conversation; admins have no special
access. Messages are not event data, so the engineering "clear events"
action keeps them.
"""
from __future__ import annotations

from database import get_connection, utc_now

MAX_BODY = 2000


def init_messages(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS direct_messages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE,
        recipient_id INTEGER NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(sender_id, recipient_id, id);
    CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages(recipient_id, read_at);
    """)


def _active_account(conn, account_id):
    return conn.execute("SELECT id FROM supervisors WHERE id=? AND is_active=1", (account_id,)).fetchone()


def contacts(me: int) -> list[dict]:
    """Every other active account, with the last message and my unread count from them."""
    with get_connection() as conn:
        people = conn.execute(
            "SELECT id, username, display_name, role FROM supervisors WHERE is_active=1 AND id<>? ORDER BY id", (me,)
        ).fetchall()
        result = []
        for person in people:
            last = conn.execute(
                """SELECT id, sender_id, body, created_at FROM direct_messages
                   WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)
                   ORDER BY id DESC LIMIT 1""", (me, person["id"], person["id"], me)).fetchone()
            unread = conn.execute(
                "SELECT count(*) FROM direct_messages WHERE sender_id=? AND recipient_id=? AND read_at IS NULL",
                (person["id"], me)).fetchone()[0]
            result.append({**dict(person), "unread": unread,
                           "last_message": dict(last) if last else None})
    # Most recent conversation first; never-contacted accounts keep id order at the end.
    result.sort(key=lambda c: c["last_message"]["id"] if c["last_message"] else 0, reverse=True)
    return result


def unread_total(me: int) -> int:
    with get_connection() as conn:
        return conn.execute(
            "SELECT count(*) FROM direct_messages WHERE recipient_id=? AND read_at IS NULL", (me,)).fetchone()[0]


def thread(me: int, other: int, after_id: int = 0, limit: int = 200) -> list[dict] | None:
    """Messages between me and other (oldest first); marks the ones sent to me as read."""
    with get_connection() as conn:
        if not conn.execute("SELECT 1 FROM supervisors WHERE id=?", (other,)).fetchone():
            return None
        rows = conn.execute(
            """SELECT * FROM (
                 SELECT id, sender_id, recipient_id, body, created_at, read_at FROM direct_messages
                 WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND id>?
                 ORDER BY id DESC LIMIT ?) ORDER BY id""",
            (me, other, other, me, max(0, int(after_id)), max(1, min(int(limit), 500)))).fetchall()
        conn.execute(
            "UPDATE direct_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at IS NULL",
            (utc_now(), other, me))
    return [dict(row) for row in rows]


def send(me: int, other: int, body: str) -> dict:
    text = (body or "").strip()
    if not text:
        raise ValueError("訊息不能是空白")
    if len(text) > MAX_BODY:
        raise ValueError(f"訊息最多 {MAX_BODY} 字")
    if other == me:
        raise ValueError("不能傳訊息給自己")
    with get_connection() as conn:
        if not _active_account(conn, other):
            raise LookupError("找不到這個帳號，或帳號已停用")
        cursor = conn.execute(
            "INSERT INTO direct_messages(sender_id, recipient_id, body, created_at) VALUES(?,?,?,?)",
            (me, other, text, utc_now()))
        row = conn.execute(
            "SELECT id, sender_id, recipient_id, body, created_at, read_at FROM direct_messages WHERE id=?",
            (cursor.lastrowid,)).fetchone()
    return dict(row)
