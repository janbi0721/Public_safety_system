"""Additive SQLite V2 tables and safe migration; never erase existing rows."""
import json
from datetime import datetime, timezone
from database import get_connection

def now(): return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

def init_v2_db():
    with get_connection() as db:
        columns={r[1] for r in db.execute("PRAGMA table_info(supervisors)")}
        if "role" not in columns:
            db.execute("ALTER TABLE supervisors ADD COLUMN role TEXT NOT NULL DEFAULT 'supervisor'")
            # Only the oldest *legacy* supervisor is promoted; review roles after migration.
            first=db.execute("SELECT id FROM supervisors ORDER BY id LIMIT 1").fetchone()
            if first: db.execute("UPDATE supervisors SET role='admin' WHERE id=?",(first[0],))
        cols={r[1] for r in db.execute("PRAGMA table_info(events)")}
        for column,typ in [("close_reason","TEXT"),("first_suspected_at","TEXT"),("review_status","TEXT DEFAULT 'pending'"),("review_note","TEXT"),("model_version","TEXT")]:
            if column not in cols: db.execute(f"ALTER TABLE events ADD COLUMN {column} {typ}")
        if "is_test" not in {r[1] for r in db.execute("PRAGMA table_info(events)")}:
            db.execute("ALTER TABLE events ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0")
        db.execute("UPDATE events SET review_status='improved' WHERE is_improved=1 AND (review_status IS NULL OR review_status='pending')")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS event_snapshots(id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, phase TEXT NOT NULL, kind TEXT NOT NULL, filename TEXT NOT NULL, frame_id INTEGER, captured_at REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE INDEX IF NOT EXISTS idx_snap_event ON event_snapshots(event_id);
        CREATE TABLE IF NOT EXISTS ai_conversations(id INTEGER PRIMARY KEY, supervisor_id INTEGER NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT '新對話', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS ai_messages(id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS safety_reports(id INTEGER PRIMARY KEY, supervisor_id INTEGER NOT NULL REFERENCES supervisors(id), start_date TEXT NOT NULL, end_date TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS system_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY, supervisor_id INTEGER, action TEXT NOT NULL, payload TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS model_versions(id INTEGER PRIMARY KEY, path TEXT NOT NULL, classes TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        """)

def audit(supervisor_id,action,payload=None):
    with get_connection() as db: db.execute("INSERT INTO audit_logs(supervisor_id,action,payload) VALUES(?,?,?)",(supervisor_id,action,json.dumps(payload or {},ensure_ascii=False)))

def add_snapshot(event_id,phase,kind,filename,frame_id,captured_at):
    with get_connection() as db:
        db.execute("INSERT INTO event_snapshots(event_id,phase,kind,filename,frame_id,captured_at) VALUES(?,?,?,?,?,?)",(event_id,phase,kind,filename,frame_id,captured_at))

def list_snapshots(event_id):
    with get_connection() as db: return [dict(x) for x in db.execute("SELECT * FROM event_snapshots WHERE event_id=? ORDER BY id",(event_id,))]

def remove_snapshot(sid):
    with get_connection() as db:
        row=db.execute("SELECT * FROM event_snapshots WHERE id=?",(sid,)).fetchone()
        if row: db.execute("DELETE FROM event_snapshots WHERE id=?",(sid,))
        return dict(row) if row else None

def set_close_reason(event_id,reason):
    with get_connection() as db: db.execute("UPDATE events SET close_reason=? WHERE id=?",(reason,event_id))

def review_event(event_id,status,supervisor_id,note=''):
    if status not in ('pending','improved','false_positive'): raise ValueError('invalid status')
    with get_connection() as db:
        cur=db.execute("UPDATE events SET review_status=?,review_note=?,is_improved=?,improved_by=?,improved_at=? WHERE id=?",(status,note,1 if status=='improved' else 0,supervisor_id if status!='pending' else None,now() if status!='pending' else None,event_id))
        return cur.rowcount>0

def get_settings():
    with get_connection() as db: return {r['key']:json.loads(r['value']) for r in db.execute('SELECT key,value FROM system_settings')}

def save_settings(data):
    with get_connection() as db:
        for k,v in data.items():db.execute("INSERT INTO system_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",(k,json.dumps(v)))

def event_statistics(start,end,camera=None):
    # Synthetic entries are normal event records for analytics and reports.
    # The internal is_test marker is retained only for safe cleanup via engineering.
    conditions=["date(start_time)>=date(?)", "date(start_time)<=date(?)", "coalesce(review_status,'pending')!='false_positive'"]
    args=[start,end]
    if camera: conditions.append('camera_id=?'); args.append(camera)
    where=' AND '.join(conditions)
    with get_connection() as db:
        rows=[dict(r) for r in db.execute(f"SELECT id,event_type,start_time,end_time,review_status, camera_id, is_improved FROM events WHERE {where} ORDER BY start_time",args)]
    by_day={};by_type={};by_hour={};by_camera={};by_status={}
    durations=[]
    for e in rows:
        day=e['start_time'][:10]; typ=e['event_type']; hour=e['start_time'][11:13];camera_id=e['camera_id']; st=e['review_status'] or 'pending'
        for target,key in [(by_day,day),(by_type,typ),(by_hour,hour),(by_camera,camera_id),(by_status,st)]:target[key]=target.get(key,0)+1
        if e['end_time']:
            try:
                d=(datetime.fromisoformat(e['end_time'])-datetime.fromisoformat(e['start_time'])).total_seconds()
                if d>=0:durations.append(d)
            except ValueError: pass
    return {'start':start,'end':end,'total':len(rows),'resolved':by_status.get('improved',0),'pending':by_status.get('pending',0),'improvement_rate':round(100*by_status.get('improved',0)/len(rows),1) if rows else 0,'average_duration_seconds':round(sum(durations)/len(durations),1) if durations else None,'by_day':by_day,'by_type':by_type,'by_hour':by_hour,'by_camera':by_camera,'by_status':by_status}


# Simulated events enter normal analytics; preserve origin metadata solely for safe deletion.
def create_test_event(camera_id:str,event_type:str,message:str,track_id:int|None,resolved:bool=True)->int:
    timestamp=now()
    with get_connection() as db:
        cursor=db.execute("""INSERT INTO events
            (camera_id,event_type,message,track_id,start_time,last_seen_time,end_time,status,close_reason,is_test,review_status)
            VALUES(?,?,?,?,?,?,?,?,?,1,'pending')""",
            (camera_id,event_type,message,track_id,timestamp,timestamp,timestamp if resolved else None,
             'closed' if resolved else 'open','manual_end' if resolved else None))
        return cursor.lastrowid

def list_test_events(limit:int=30):
    with get_connection() as db:
        return [dict(row) for row in db.execute("""SELECT id,camera_id,event_type,message,start_time,end_time
            FROM events WHERE is_test=1 ORDER BY id DESC LIMIT ?""",(min(100,max(1,limit)),))]

def delete_test_event(event_id:int)->bool:
    with get_connection() as db:
        row=db.execute('SELECT id FROM events WHERE id=? AND is_test=1',(event_id,)).fetchone()
        if not row:return False
        # Cascade snapshots metadata if present; photos are not created for synthetic events.
        db.execute('DELETE FROM events WHERE id=? AND is_test=1',(event_id,))
        return True
