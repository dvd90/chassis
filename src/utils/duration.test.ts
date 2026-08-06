import { describe, expect, it } from 'vitest';
import { addTo, seconds } from './duration';

describe('seconds', () => {
  it('parses every supported unit', () => {
    expect(seconds('45s')).toBe(45);
    expect(seconds('15m')).toBe(900);
    expect(seconds('1h')).toBe(3600);
    expect(seconds('90d')).toBe(7_776_000);
  });

  it('tolerates surrounding whitespace', () => {
    expect(seconds('  30d  ')).toBe(2_592_000);
  });

  it.each(['', '15', 'm', '15x', '-5m', '1.5h', '15 m', '15mm'])(
    'rejects %o',
    (value) => {
      expect(() => seconds(value)).toThrow(/Invalid duration/);
    }
  );
});

describe('addTo', () => {
  it('offsets a date without mutating it', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(addTo(from, '15m').toISOString()).toBe('2026-01-01T00:15:00.000Z');
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
