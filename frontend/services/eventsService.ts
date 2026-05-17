// services/eventsService.ts
//
// Lightweight fire-and-forget analytics.  No user-identifying data is sent.
// All calls are wrapped in try/catch so a worker failure never affects the UX.

const ENGINE_BASE: string = (import.meta.env.VITE_CV_ENGINE_URL ?? '').replace(/\/$/, '');

type EventType =
  | 'cv_generated'
  | 'cv_downloaded'
  | 'template_used'
  | 'share_created'
  | 'email_composed'
  | 'doctor_opened'
  | 'cover_letter_generated'
  | 'job_tracked';

interface EventPayload {
  event_type: EventType;
  template?: string;
  mode?: string;
  metadata?: Record<string, string | number | boolean>;
}

/** Fire-and-forget event logger. Never throws, never awaited by callers. */
export function logEvent(payload: EventPayload): void {
  try {
    if (!ENGINE_BASE) return;
    const body = JSON.stringify({
      event_type: payload.event_type,
      template:   payload.template   ?? '',
      mode:       payload.mode       ?? '',
      metadata:   JSON.stringify(payload.metadata ?? {}),
    });
    // Use sendBeacon when available (survives page unload), fall back to fetch
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${ENGINE_BASE}/api/cv/event`, blob);
    } else {
      fetch(`${ENGINE_BASE}/api/cv/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // intentionally silent
  }
}
