"""Publish annotated BGR frames through FFmpeg H.264 to MediaMTX RTSP.
The exact annotated frame is used for screenshots and streaming.
If FFmpeg is missing, keep the monitor available via annotated MJPEG fallback.
"""
import logging,os,subprocess,shutil,threading
class VideoPublisher:
    def __init__(self, url=None):
        self.enabled=os.getenv('AI_STREAM_ENABLED','1')=='1'
        self.url=url or os.getenv('AI_PUBLISH_URL','rtsp://127.0.0.1:8554/camera01_ai')
        self.ffmpeg=os.getenv('FFMPEG_PATH') or shutil.which('ffmpeg')
        self.proc=None;self.shape=None;self.lock=threading.Lock()
    def publish(self,frame):
        if not self.enabled or not self.ffmpeg:return
        h,w=frame.shape[:2]
        with self.lock:
            if self.proc is None or self.proc.poll() is not None or self.shape!=(w,h):
                self.close();self.shape=(w,h)
                cmd=[self.ffmpeg,'-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',os.getenv('AI_STREAM_FPS','10'),'-i','-','-an','-c:v',os.getenv('VIDEO_ENCODER','libx264'),'-preset','ultrafast','-tune','zerolatency','-pix_fmt','yuv420p','-f','rtsp','-rtsp_transport','tcp',self.url]
                try:self.proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.DEVNULL)
                except OSError:logging.exception('AI stream FFmpeg start failed');self.proc=None
            if self.proc:
                try:self.proc.stdin.write(frame.tobytes())
                except (OSError,BrokenPipeError,ValueError):self.close()
    def close(self):
        if self.proc:
            try:self.proc.stdin.close()
            except (OSError,ValueError):pass
            try:self.proc.terminate();self.proc.wait(timeout=1)
            except Exception:
                try:self.proc.kill()
                except Exception:pass
            self.proc=None
