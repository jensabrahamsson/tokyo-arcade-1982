/** calendar-day bucket in Europe/Stockholm for the operator counters (R31) */
export function stockholmDate(epochMs: number): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(epochMs));
}

export interface DayBucket {
  day: string;
  playsToday: number;
  coinsToday: number;
}

/** pure rollover: same day keeps the counters, a fresh Stockholm date zeroes them */
export function rollDay(day: string, playsToday: number, coinsToday: number, today: string): DayBucket {
  if (day === today) return { day, playsToday, coinsToday };
  return { day: today, playsToday: 0, coinsToday: 0 };
}
