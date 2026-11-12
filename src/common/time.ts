/** Date helpers that respect a site's IANA timezone (e.g. Africa/Lagos). */

/** Local calendar date "YYYY-MM-DD" in `tz`. */
export function localDate(tz: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at);
}

/** The instant local midnight began in `tz` for the day containing `at`. */
export function localDayStart(tz: string, at = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  // Offset of tz from UTC at `at`, in ms.
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  const offset = asUtc - Math.floor(at.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}

/** Site-local "HH:MM" on a site-local date "YYYY-MM-DD" → instant. */
export function atLocalTime(tz: string, date: string, hhmm: string): Date {
  const dayStart = localDayStart(tz, new Date(`${date}T12:00:00Z`));
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(dayStart.getTime() + (h * 60 + m) * 60_000);
}

/**
 * Instants for a run of hourly labels starting on `date`, e.g. a night shift
 * ["22:00", "23:00", "00:00"]: a label earlier than the previous one is the next day.
 */
export function hourInstants(
  tz: string,
  date: string,
  labels: string[],
): Date[] {
  let dayOffset = 0;
  let prev = -1;
  return labels.map((label) => {
    const [h, m] = label.split(':').map(Number);
    const minutes = h * 60 + m;
    if (minutes <= prev) dayOffset++;
    prev = minutes;
    const base = atLocalTime(tz, date, label);
    return new Date(base.getTime() + dayOffset * 86_400_000);
  });
}
