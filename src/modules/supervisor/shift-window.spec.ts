import { BadRequestException } from '@nestjs/common';
import { Site } from '../organizations/entities/site.entity';
import { shiftWindow } from './supervisor.service';

const site = {
  timezone: 'Africa/Lagos',
  shifts: [
    { name: 'Day shift', start: '07:00', end: '17:00' },
    { name: 'Night shift', start: '19:00', end: '05:00' },
  ],
} as Site;
const at = (iso: string) => new Date(iso);

describe('shiftWindow', () => {
  it('defaults to the shift running now', () => {
    expect(shiftWindow(site, at('2026-11-12T10:00:00Z')).name).toBe(
      'Day shift',
    );
    expect(shiftWindow(site, at('2026-11-12T20:00:00Z')).name).toBe(
      'Night shift',
    );
  });

  it('picks a named shift (case-insensitive); night shift ends the next morning', () => {
    const w = shiftWindow(site, at('2026-11-12T10:00:00Z'), 'night SHIFT');
    expect(w.start.toISOString()).toBe('2026-11-12T18:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-13T04:00:00.000Z');
  });

  it('rejects an unknown shift and lists the options', () => {
    expect(() =>
      shiftWindow(site, at('2026-11-12T10:00:00Z'), 'Evening'),
    ).toThrow(BadRequestException);
    expect(() =>
      shiftWindow(site, at('2026-11-12T10:00:00Z'), 'Evening'),
    ).toThrow(/Day shift, Night shift/);
  });
});
