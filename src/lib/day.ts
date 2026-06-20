// Calendar-day helpers that work in the DEVICE'S LOCAL timezone.
//
// occurred_at is stored as a UTC instant (timestamptz). To decide which calendar
// day/month an instant belongs to FROM THE USER'S POINT OF VIEW, we must read it
// in local time — not UTC. In Egypt (UTC+2/+3) an entry made just after local
// midnight has a UTC date of "yesterday", so slicing the ISO string (UTC) bucketed
// it on the wrong day. These helpers fix that by using the local Date accessors.

/** Local "YYYY-MM-DD" for an instant (Date or ISO string). */
export function localDayKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
