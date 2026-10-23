from __future__ import annotations
from datetime import datetime,timezone
import time
from database import create_event,end_event_detection,update_event_last_seen
from v2_data import link_event_person,set_close_reason
from safety_analyzer import PPE_BY_EVENT

def stamp(t):return datetime.fromtimestamp(t,tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

class EventManager:
    """One event per (person, PPE item), kept open until the state really changes.

    - violation for trigger_seconds          -> open the event
    - item seen worn for recovery_seconds    -> close, reason 'recovered'
    - person out of view for occlusion_seconds -> close, reason 'left_camera'
    - person visible but item not judgeable (turned away, hand hidden)
      -> stays open; this never splits one violation into several events.
    - before an event exists, seeing the item worn cancels the pending violation
      at once, so two one-frame misdetections around a worn helmet never add up.
    """
    LAST_SEEN_WRITE_SECONDS=2.0  # last_seen_time is written at most this often per event
    def __init__(self,camera_id,trigger_seconds=1.5,recovery_seconds=2.0,occlusion_seconds=30.0,on_transition=None):
        self.camera_id=camera_id;self.trigger_seconds=trigger_seconds
        self.recovery_seconds=recovery_seconds;self.occlusion_seconds=occlusion_seconds
        self.on_transition=on_transition
        self.person_recorder=None  # set by the worker; links events and writes the person timeline
        self.pending={};self.active={};self.missing_since={};self.missing_reason={};self.last_violation={}
        self.last_seen={};self.last_written={}
    def reset(self):
        """Forget open events, e.g. after engineering cleared the events table."""
        self.pending.clear();self.active.clear();self.missing_since.clear()
        self.missing_reason.clear();self.last_violation.clear()
        self.last_seen.clear();self.last_written.clear()
    def close_all(self,reason='system_stopped'):
        """End every open event at its last sighting (worker stopping)."""
        for key,event_id in list(self.active.items()):
            at=stamp(self.last_seen.get(key,time.time()))
            update_event_last_seen(event_id,at);end_event_detection(event_id,at);set_close_reason(event_id,reason)
        self.reset()
    def process(self,violations,timestamp=None,people=None):
        t=time.time() if timestamp is None else timestamp
        people=people or []
        vmap={}
        for violation in violations:
            ident=violation.get('trackId')
            if ident is None:continue  # no stable identity: do not open persistent DB events
            vmap[(ident,violation['eventType'])]=violation
        person_map={p['trackId']:p for p in people if p.get('trackId') is not None}
        alerts=[]
        for key,v in vmap.items():
            self.last_violation[key]=v;self.missing_since.pop(key,None);self.missing_reason.pop(key,None)
            since=self.pending.setdefault(key,t)
            if t-since<self.trigger_seconds:continue
            event_id=self.active.get(key)
            if event_id is None:
                event_id=create_event(camera_id=self.camera_id,track_id=v['trackId'],event_type=v['eventType'],class_name=v.get('className'),confidence=v.get('confidence'),message=v['message'],event_time=stamp(t))
                self.active[key]=event_id;self.last_written[key]=t
                if self.person_recorder:
                    session_id=self.person_recorder.session_id(v['trackId'])
                    if session_id:link_event_person(event_id,session_id)
                    self.person_recorder.mark(v['trackId'],PPE_BY_EVENT.get(v['eventType'],v['eventType']),'violation',since)
                if self.on_transition:self.on_transition('start',event_id,t,v)
            elif t-self.last_written.get(key,0)>=self.LAST_SEEN_WRITE_SECONDS:
                update_event_last_seen(event_id,stamp(t));self.last_written[key]=t
            self.last_seen[key]=t
            alerts.append({**v,'eventId':event_id,'durationSeconds':round(t-since,2),'inView':True})
        for key in set(self.pending)|set(self.active):
            if key in vmap:continue
            track_id,event_type=key
            person=person_map.get(track_id)
            ppe=PPE_BY_EVENT.get(event_type,event_type.removeprefix('no_'))
            status=person.get('ppe',{}).get(ppe,{}).get('status','unknown') if person else 'unknown'
            if person is not None and key in self.active:self.last_seen[key]=t  # last sighting of this person
            if key not in self.active:
                if status=='normal':
                    # Seen worn before the violation became an event: cancel it now.
                    self.pending.pop(key,None);self.missing_since.pop(key,None);self.missing_reason.pop(key,None)
                    self.last_violation.pop(key,None);continue
                # Not yet an event: an interrupted violation simply starts over.
                reason='interrupted';delay=self.trigger_seconds
            elif status=='normal':delay=self.recovery_seconds;reason='recovered'
            elif person is None:delay=self.occlusion_seconds;reason='left_camera'
            else:
                # Still in view but this item cannot be judged right now: keep the event open.
                # A recovery already counting keeps counting (only a violation resets it),
                # so a flickering 'unknown' between 'normal' frames cannot block recovery.
                if self.missing_reason.get(key)!='recovered':
                    self.missing_since.pop(key,None);self.missing_reason.pop(key,None)
                continue
            if self.missing_reason.get(key)!=reason:
                self.missing_since[key]=t
                self.missing_reason[key]=reason
            first=self.missing_since[key]
            if t-first<delay:continue
            event_id=self.active.pop(key,None)
            self.pending.pop(key,None);self.missing_since.pop(key,None);self.missing_reason.pop(key,None)
            if event_id is not None:
                # left_camera ends at the last sighting, not 30 s later.
                end_at=self.last_seen.get(key,t) if reason=='left_camera' else t
                update_event_last_seen(event_id,stamp(self.last_seen.get(key,t)))
                end_event_detection(event_id,stamp(end_at));set_close_reason(event_id,reason)
                if reason=='recovered' and self.person_recorder:
                    self.person_recorder.mark(track_id,ppe,'normal',first)
                if self.on_transition:self.on_transition('end',event_id,t,self.last_violation.get(key,{}))
            self.last_violation.pop(key,None);self.last_seen.pop(key,None);self.last_written.pop(key,None)
        # Keep reporting every still-open event, so a one-frame flicker (turned away,
        # briefly out of view) does not make the alert vanish and be announced again.
        for key,event_id in self.active.items():
            if key in vmap:continue
            since=self.pending.get(key,t)
            alerts.append({**self.last_violation.get(key,{}),'eventId':event_id,
                'durationSeconds':round(t-since,2),'inView':key[0] in person_map})
        return alerts
