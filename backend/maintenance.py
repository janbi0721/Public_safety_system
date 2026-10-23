import os,shutil
from pathlib import Path
from database import get_connection
from v2_data import get_settings

BASE=Path(__file__).resolve().parent
MODEL_UPLOADS=BASE/'model'/'uploads'

def model_info():
    from main import PPE_MODEL,state
    from pathlib import Path
    return {'current':Path(PPE_MODEL).name,'supported':sorted(set(d.lower() for d in getattr(getattr(__import__('main').app.state,'worker',None),'detector',object()).ppe_names.values())) if hasattr(getattr(__import__('main').app.state,'worker',None),'detector') else [], 'settings':get_settings()}

def validate_model_file(path):
    from ultralytics import YOLO
    model=YOLO(str(path))
    names=[str(x).lower() for x in model.names.values()]
    return {'classes':names,'has_person':'person' in names}

def backup_database():
    import sqlite3
    from contextlib import closing
    from datetime import datetime,timezone
    source=BASE/'safety.db';dest=BASE/'backups';dest.mkdir(exist_ok=True)
    name=dest/f"safety_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.db"
    # sqlite3's own context manager only commits; close explicitly or Windows
    # keeps the temp .db locked and unlink() below raises PermissionError.
    with closing(sqlite3.connect(source)) as src,closing(sqlite3.connect(name)) as tgt:src.backup(tgt)
    from zipfile import ZipFile,ZIP_DEFLATED,ZIP_STORED
    archive=dest/(name.stem+'.zip')
    with ZipFile(archive,'w',ZIP_DEFLATED,compresslevel=5) as z:
        z.write(name,'safety.db')
        snapshots=BASE/'snapshots'
        if snapshots.is_dir():
            # JPEGs are already compressed; storing them skips useless CPU work.
            for path in snapshots.glob('*.jpg'):z.write(path,'snapshots/'+path.name,compress_type=ZIP_STORED)
    name.unlink(missing_ok=True)
    return str(archive)

def health_metrics(worker=None):
    import psutil
    disk=shutil.disk_usage(BASE)
    result={'cpu_percent':psutil.cpu_percent(interval=None),'memory_percent':psutil.virtual_memory().percent,'disk_free_gb':round(disk.free/1024**3,2),'disk_total_gb':round(disk.total/1024**3,2),'ai_fps':getattr(worker,'fps',0),'worker_online':bool(worker and worker.is_alive() and not worker.error),'worker_error':getattr(worker,'error',None),'gpu':None}
    try:
        import torch
        if torch.cuda.is_available():result['gpu']={'name':torch.cuda.get_device_name(0),'allocated_mb':round(torch.cuda.memory_allocated(0)/1024**2),'reserved_mb':round(torch.cuda.memory_reserved(0)/1024**2)}
    except Exception:pass
    return result
