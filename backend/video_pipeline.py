"""Publish annotated BGR frames through FFmpeg H.264 to MediaMTX RTSP.
The exact annotated frame is used for screenshots and streaming.
If FFmpeg is missing, keep the monitor available via annotated MJPEG fallback.

publish() never blocks the detection loop: it only hands over the newest frame.
A writer thread feeds FFmpeg; older frames are dropped when it falls behind.
If MediaMTX is down, FFmpeg stops reading and a write would hang forever, so a
write stuck for STALL_SECONDS kills FFmpeg, and restarts wait RETRY_SECONDS.
"""
import logging,os,subprocess,shutil,sys,threading,time
RETRY_SECONDS=5
STALL_SECONDS=8

def _kill_on_exit_job():
    """Windows Job Object that kills every FFmpeg we start when this process ends.

    Without it, a backend that is closed or crashes leaves FFmpeg running as an
    orphan that keeps the MediaMTX path busy (seen on 2026-10-23). The job handle
    is held until the process exits; Windows then closes it and kills the members,
    even after a hard kill (taskkill /F, closing the console window).
    """
    if sys.platform!='win32':return None
    try:
        import ctypes
        from ctypes import wintypes
        k32=ctypes.WinDLL('kernel32',use_last_error=True)
        k32.CreateJobObjectW.restype=wintypes.HANDLE
        k32.OpenProcess.restype=wintypes.HANDLE
        class BASIC(ctypes.Structure):
            _fields_=[('PerProcessUserTimeLimit',ctypes.c_int64),('PerJobUserTimeLimit',ctypes.c_int64),
                      ('LimitFlags',wintypes.DWORD),('MinimumWorkingSetSize',ctypes.c_size_t),
                      ('MaximumWorkingSetSize',ctypes.c_size_t),('ActiveProcessLimit',wintypes.DWORD),
                      ('Affinity',ctypes.c_size_t),('PriorityClass',wintypes.DWORD),('SchedulingClass',wintypes.DWORD)]
        class IO(ctypes.Structure):
            _fields_=[(n,ctypes.c_uint64) for n in ('ReadOperationCount','WriteOperationCount','OtherOperationCount',
                      'ReadTransferCount','WriteTransferCount','OtherTransferCount')]
        class EXTENDED(ctypes.Structure):
            _fields_=[('BasicLimitInformation',BASIC),('IoInfo',IO),('ProcessMemoryLimit',ctypes.c_size_t),
                      ('JobMemoryLimit',ctypes.c_size_t),('PeakProcessMemoryUsed',ctypes.c_size_t),('PeakJobMemoryUsed',ctypes.c_size_t)]
        job=k32.CreateJobObjectW(None,None)
        if not job:raise ctypes.WinError(ctypes.get_last_error())
        info=EXTENDED();info.BasicLimitInformation.LimitFlags=0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not k32.SetInformationJobObject(wintypes.HANDLE(job),9,ctypes.byref(info),ctypes.sizeof(info)):  # 9 = ExtendedLimitInformation
            raise ctypes.WinError(ctypes.get_last_error())
        def assign(pid):
            handle=k32.OpenProcess(0x0101,False,pid)  # PROCESS_SET_QUOTA | PROCESS_TERMINATE
            if not handle:raise ctypes.WinError(ctypes.get_last_error())
            try:
                if not k32.AssignProcessToJobObject(wintypes.HANDLE(job),wintypes.HANDLE(handle)):
                    raise ctypes.WinError(ctypes.get_last_error())
            finally:k32.CloseHandle(wintypes.HANDLE(handle))
        return assign
    except Exception:
        logging.exception('Kill-on-exit job unavailable; FFmpeg may outlive a crashed backend')
        return None

_assign_to_job=_kill_on_exit_job()
class VideoPublisher:
    def __init__(self, url=None):
        self.enabled=os.getenv('AI_STREAM_ENABLED','1')=='1'
        self.url=url or os.getenv('AI_PUBLISH_URL','rtsp://127.0.0.1:8554/camera01_ai')
        self.ffmpeg=os.getenv('FFMPEG_PATH') or shutil.which('ffmpeg')
        self.proc=None;self.shape=None;self.lock=threading.Lock()
        self._frame=None;self._ready=threading.Event();self._stop=threading.Event()
        self._thread=None;self._write_since=None;self._retry_at=0.0
    def publish(self,frame):
        if not self.enabled or not self.ffmpeg or self._stop.is_set():return
        with self.lock:
            self._frame=frame
            if self._thread is None:
                self._thread=threading.Thread(target=self._run,daemon=True,name='VideoPublisher');self._thread.start()
            proc,since=self.proc,self._write_since
        self._ready.set()
        if proc and since is not None and time.monotonic()-since>STALL_SECONDS:
            logging.warning('AI stream stalled for %ss, restarting FFmpeg (%s)',STALL_SECONDS,self.url)
            self._kill(proc)
    def _run(self):
        while not self._stop.is_set():
            if not self._ready.wait(1):continue
            with self.lock:
                frame=self._frame;self._frame=None;self._ready.clear()
            if frame is None or time.monotonic()<self._retry_at:continue
            proc=self._ensure(frame)
            if not proc:continue
            self._write_since=time.monotonic()
            try:proc.stdin.write(frame.tobytes())
            except (OSError,BrokenPipeError,ValueError):
                self._write_since=None;self._drop(proc);self._retry_at=time.monotonic()+RETRY_SECONDS
            else:self._write_since=None
    def _ensure(self,frame):
        h,w=frame.shape[:2]
        if self.proc is not None and self.proc.poll() is None and self.shape==(w,h):return self.proc
        if self.proc is not None:self._drop(self.proc)
        self.shape=(w,h)
        cmd=[self.ffmpeg,'-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',os.getenv('AI_STREAM_FPS','10'),'-i','-','-an','-c:v',os.getenv('VIDEO_ENCODER','libx264'),'-preset','ultrafast','-tune','zerolatency','-pix_fmt','yuv420p','-f','rtsp','-rtsp_transport','tcp',self.url]
        try:self.proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.DEVNULL)
        except OSError:
            logging.exception('AI stream FFmpeg start failed');self.proc=None;self._retry_at=time.monotonic()+RETRY_SECONDS
            return None
        if _assign_to_job:
            try:_assign_to_job(self.proc.pid)
            except OSError:logging.exception('Unable to tie FFmpeg %s to the backend lifetime',self.proc.pid)
        return self.proc
    @staticmethod
    def _kill(proc):
        try:proc.kill()
        except Exception:pass
    def _drop(self,proc):
        try:proc.stdin.close()
        except (OSError,ValueError):pass
        self._kill(proc)
        try:proc.wait(timeout=2)
        except Exception:pass
        if self.proc is proc:self.proc=None
    def close(self):
        self._stop.set();self._ready.set()
        proc=self.proc
        if proc:self._kill(proc)
        if self._thread:self._thread.join(timeout=3)
        if proc:self._drop(proc)
