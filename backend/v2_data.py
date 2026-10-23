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
        init_event_codes(db)
        init_person_sessions(db)
        from messaging import init_messages
        init_messages(db)
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

# Human-readable event number: local start date-time + per-day serial, e.g.
# 20261021-143025-001. start_time is stored in UTC, so convert with 'localtime'.
# The serial is the day's highest serial + 1, so deleting an event never causes
# a duplicate. 'YYYYMMDD-HHMMSS-' is 16 characters; the serial starts at 17.
def _code_sql(table, column, t, i, prefix=''):
    start = 17 + len(prefix)
    return f"""strftime('%Y%m%d-%H%M%S', {t}, 'localtime') || '-{prefix}' || printf('%03d', 1 + COALESCE((
    SELECT MAX(CAST(substr(o.{column}, {start}) AS INTEGER)) FROM {table} o
    WHERE o.{column} LIKE strftime('%Y%m%d', {t}, 'localtime') || '-%' AND o.id <> {i}), 0))"""

def _init_codes(db, table, column, time_column, prefix=''):
    if column not in {r[1] for r in db.execute(f"PRAGMA table_info({table})")}:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")
    db.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_{column} ON {table}({column})")
    # One trigger covers every insert path (detection, simulated and engineering rows).
    db.execute(f"""CREATE TRIGGER IF NOT EXISTS trg_{table}_{column} AFTER INSERT ON {table}
        WHEN NEW.{column} IS NULL BEGIN
        UPDATE {table} SET {column} = {_code_sql(table, column, f'NEW.{time_column}', 'NEW.id', prefix)} WHERE id = NEW.id;
        END""")
    backfill = f"UPDATE {table} SET {column} = {_code_sql(table, column, f'{table}.{time_column}', f'{table}.id', prefix)} WHERE id = ?"
    for (row_id,) in db.execute(f"SELECT id FROM {table} WHERE {column} IS NULL ORDER BY {time_column}, id").fetchall():
        db.execute(backfill, (row_id,))

def init_event_codes(db):
    # Names used before _init_codes existed; drop so the trigger does not run twice.
    db.execute("DROP TRIGGER IF EXISTS trg_events_code")
    db.execute("DROP INDEX IF EXISTS idx_events_code")
    _init_codes(db, 'events', 'event_code', 'start_time')

def init_person_sessions(db):
    """Person records: one row each time a tracked person appears on a camera."""
    db.executescript("""
    CREATE TABLE IF NOT EXISTS person_sessions(
        id INTEGER PRIMARY KEY AUTOINCREMENT, camera_id TEXT NOT NULL, track_id INTEGER,
        first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, end_time TEXT, end_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_person_sessions_seen ON person_sessions(first_seen);
    CREATE TABLE IF NOT EXISTS person_ppe_changes(
        id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES person_sessions(id) ON DELETE CASCADE,
        ppe TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_person_changes_session ON person_ppe_changes(session_id);
    """)
    _init_codes(db, 'person_sessions', 'session_code', 'first_seen', 'P')
    if "person_session_id" not in {r[1] for r in db.execute("PRAGMA table_info(events)")}:
        db.execute("ALTER TABLE events ADD COLUMN person_session_id INTEGER REFERENCES person_sessions(id) ON DELETE SET NULL")
    db.execute("CREATE INDEX IF NOT EXISTS idx_events_person_session ON events(person_session_id)")
    # Sessions left open by a previous run (crash / restart) end at their last sighting.
    db.execute("UPDATE person_sessions SET end_time=last_seen, end_reason='system_restart' WHERE end_time IS NULL")
    # Same for detection events: a new run starts with an empty EventManager, so an
    # event still open here can never be closed otherwise and would stay "in progress".
    # Simulated events (is_test=1) may be left open on purpose and are not touched.
    db.execute("""UPDATE events SET end_time=COALESCE(last_seen_time,start_time), close_reason='system_restart',
        updated_at=COALESCE(last_seen_time,start_time) WHERE end_time IS NULL AND COALESCE(is_test,0)=0""")

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

def create_person_session(camera_id,track_id,at):
    with get_connection() as db:
        return db.execute("INSERT INTO person_sessions(camera_id,track_id,first_seen,last_seen) VALUES(?,?,?,?)",(camera_id,track_id,at,at)).lastrowid

def touch_person_session(session_id,at):
    with get_connection() as db: db.execute("UPDATE person_sessions SET last_seen=? WHERE id=?",(at,session_id))

def end_person_session(session_id,at,reason):
    with get_connection() as db: db.execute("UPDATE person_sessions SET last_seen=?,end_time=?,end_reason=? WHERE id=? AND end_time IS NULL",(at,at,reason,session_id))

def add_person_change(session_id,ppe,status,at):
    with get_connection() as db: db.execute("INSERT INTO person_ppe_changes(session_id,ppe,status,at) VALUES(?,?,?,?)",(session_id,ppe,status,at))

def link_event_person(event_id,session_id):
    with get_connection() as db: db.execute("UPDATE events SET person_session_id=? WHERE id=?",(session_id,event_id))

def _person_filters(camera_id=None,start=None,end=None,keyword=None,violated_only=False):
    where=[];args=[]
    if camera_id:where.append('s.camera_id=?');args.append(camera_id)
    if start:where.append('s.first_seen>=?');args.append(start)
    if end:where.append('s.first_seen<?');args.append(end)
    if keyword and keyword.strip():
        text=keyword.strip().lstrip('#')
        where.append('(s.session_code LIKE ? OR CAST(s.track_id AS TEXT)=?)');args+=[f'%{text}%',text]
    if violated_only:where.append("EXISTS(SELECT 1 FROM person_ppe_changes c WHERE c.session_id=s.id AND c.status='violation')")
    return ('WHERE '+' AND '.join(where) if where else ''),args

def _person_summary(db,row):
    item=dict(row)
    changes=db.execute('SELECT ppe,status,at FROM person_ppe_changes WHERE session_id=? ORDER BY at,id',(item['id'],)).fetchall()
    current={}
    for c in changes:current[c['ppe']]=c['status']
    item['ppe_status']=current
    item['violated_ppe']=sorted({c['ppe'] for c in changes if c['status']=='violation'})
    item['is_open']=item['end_time'] is None
    return item

def list_person_sessions(limit=50,offset=0,**filters):
    where,args=_person_filters(**filters)
    with get_connection() as db:
        total=db.execute(f'SELECT count(*) FROM person_sessions s {where}',args).fetchone()[0]
        rows=db.execute(f"""SELECT s.*,
            CAST(round((julianday(coalesce(s.end_time,s.last_seen))-julianday(s.first_seen))*86400) AS INTEGER) AS duration_seconds,
            (SELECT count(*) FROM events e WHERE e.person_session_id=s.id) AS event_count
            FROM person_sessions s {where} ORDER BY s.first_seen DESC,s.id DESC LIMIT ? OFFSET ?""",
            args+[max(1,min(int(limit),200)),max(0,int(offset))]).fetchall()
        return {'people':[_person_summary(db,r) for r in rows],'total':total}

def get_person_session(session_id):
    with get_connection() as db:
        row=db.execute("""SELECT s.*,
            CAST(round((julianday(coalesce(s.end_time,s.last_seen))-julianday(s.first_seen))*86400) AS INTEGER) AS duration_seconds,
            (SELECT count(*) FROM events e WHERE e.person_session_id=s.id) AS event_count
            FROM person_sessions s WHERE s.id=?""",(session_id,)).fetchone()
        if not row:return None
        item=_person_summary(db,row)
        item['changes']=[dict(c) for c in db.execute('SELECT ppe,status,at FROM person_ppe_changes WHERE session_id=? ORDER BY at,id',(session_id,))]
        item['events']=[dict(e) for e in db.execute("""SELECT id,event_code,event_type,camera_id,track_id,message,start_time,end_time,
            close_reason,is_improved,review_status,review_note FROM events WHERE person_session_id=? ORDER BY start_time,id""",(session_id,))]
        return item

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
    # start_time is UTC; dates and hours in reports are local time (same as event codes).
    conditions=["date(start_time,'localtime')>=date(?)", "date(start_time,'localtime')<=date(?)", "coalesce(review_status,'pending')!='false_positive'"]
    args=[start,end]
    if camera: conditions.append('camera_id=?'); args.append(camera)
    where=' AND '.join(conditions)
    with get_connection() as db:
        rows=[dict(r) for r in db.execute(f"SELECT id,event_type,start_time,datetime(start_time,'localtime') AS local_start,end_time,review_status, camera_id, is_improved FROM events WHERE {where} ORDER BY start_time",args)]
    by_day={};by_type={};by_hour={};by_camera={};by_status={}
    durations=[]
    for e in rows:
        day=e['local_start'][:10]; typ=e['event_type']; hour=e['local_start'][11:13];camera_id=e['camera_id']; st=e['review_status'] or 'pending'
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
        return [dict(row) for row in db.execute("""SELECT id,event_code,camera_id,event_type,message,start_time,end_time
            FROM events WHERE is_test=1 ORDER BY id DESC LIMIT ?""",(min(100,max(1,limit)),))]

def delete_test_event(event_id:int)->bool:
    with get_connection() as db:
        row=db.execute('SELECT id FROM events WHERE id=? AND is_test=1',(event_id,)).fetchone()
        if not row:return False
        # Cascade snapshots metadata if present; photos are not created for synthetic events.
        db.execute('DELETE FROM events WHERE id=? AND is_test=1',(event_id,))
        return True
