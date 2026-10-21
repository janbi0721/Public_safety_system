"""Person records: when each tracked person enters, changes PPE state and leaves.

Writes person_sessions / person_ppe_changes. The timeline must agree with
the violation events, so:
- 'violation' and its 'recovered' are written by EventManager through mark()
  when it opens / closes an event (same debounce, same timestamps);
- this recorder itself only writes a 'normal' for an item that holds normal
  for recovery_seconds (e.g. entered already wearing it);
- 'unknown' (turned away, hand hidden) is never written;
- a person out of view for occlusion_seconds ends the session ('left_camera').
"""
import logging
import threading

from event_manager import stamp
from v2_data import (add_person_change, create_person_session, end_person_session,
                     touch_person_session)

TOUCH_SECONDS = 5  # how often last_seen is written while a person stays in view


class PersonRecorder:
    def __init__(self, camera_id, event_manager):
        self.camera_id = camera_id
        self.event_manager = event_manager
        self.sessions = {}
        self.lock = threading.Lock()

    def session_id(self, track_id):
        with self.lock:
            session = self.sessions.get(track_id)
            return session['id'] if session else None

    def process(self, people, t):
        em = self.event_manager
        with self.lock:
            visible = {p['trackId']: p for p in people if p.get('trackId') is not None}
            for track_id, person in visible.items():
                session = self.sessions.get(track_id)
                if session is None:
                    session = {'id': create_person_session(self.camera_id, track_id, stamp(t)),
                               'last_seen': t, 'touched': t, 'committed': {}, 'candidate': {}}
                    self.sessions[track_id] = session
                session['last_seen'] = t
                if t - session['touched'] >= TOUCH_SECONDS:
                    touch_person_session(session['id'], stamp(t))
                    session['touched'] = t
                for ppe, info in (person.get('ppe') or {}).items():
                    status = info.get('status')
                    if status == 'violation' or session['committed'].get(ppe) == 'normal':
                        session['candidate'].pop(ppe, None)
                        continue
                    if status != 'normal':
                        continue
                    since = session['candidate'].setdefault(ppe, t)
                    if t - since >= em.recovery_seconds:
                        self._commit(session, ppe, 'normal', since)
            for track_id, session in list(self.sessions.items()):
                if track_id not in visible and t - session['last_seen'] >= em.occlusion_seconds:
                    end_person_session(session['id'], stamp(session['last_seen']), 'left_camera')
                    del self.sessions[track_id]

    def _commit(self, session, ppe, status, at):
        if session['committed'].get(ppe) == status:
            return
        add_person_change(session['id'], ppe, status, stamp(at))
        session['committed'][ppe] = status
        session['candidate'].pop(ppe, None)

    def mark(self, track_id, ppe, status, at):
        """Called by EventManager when an event opens ('violation') or recovers ('normal')."""
        with self.lock:
            session = self.sessions.get(track_id)
            if session:
                self._commit(session, ppe, status, at)

    def close_all(self, reason='system_stopped'):
        with self.lock:
            for session in self.sessions.values():
                try:
                    end_person_session(session['id'], stamp(session['last_seen']), reason)
                except Exception:
                    logging.exception('Unable to close person session %s', session['id'])
            self.sessions.clear()

    def reset(self):
        """Forget open sessions after engineering cleared the tables."""
        with self.lock:
            self.sessions.clear()
