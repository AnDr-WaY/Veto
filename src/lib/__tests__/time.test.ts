import {
  formatDuration,
  hhmmToMinutes,
  minutesToHHMM,
  roundToStep,
} from '../time';

describe('minutesToHHMM', () => {
  it('formats common times', () => {
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(570)).toBe('09:30');
    expect(minutesToHHMM(1439)).toBe('23:59');
  });

  it('wraps midnight boundary 1440 to 00:00', () => {
    expect(minutesToHHMM(1440)).toBe('00:00');
  });

  it('rejects out-of-range or non-integer input', () => {
    expect(() => minutesToHHMM(-1)).toThrow(RangeError);
    expect(() => minutesToHHMM(1441)).toThrow(RangeError);
    expect(() => minutesToHHMM(15.5)).toThrow(RangeError);
  });
});

describe('hhmmToMinutes', () => {
  it('parses HH:MM', () => {
    expect(hhmmToMinutes('09:30')).toBe(570);
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('23:45')).toBe(1425);
  });

  it('accepts single-digit hours', () => {
    expect(hhmmToMinutes('9:30')).toBe(570);
  });

  it('is the inverse of minutesToHHMM inside one day', () => {
    for (let m = 0; m <= 1425; m += 15) {
      expect(hhmmToMinutes(minutesToHHMM(m))).toBe(m);
    }
  });

  it('rejects malformed strings', () => {
    expect(() => hhmmToMinutes('9:30pm')).toThrow();
    expect(() => hhmmToMinutes('25:00')).toThrow();
    expect(() => hhmmToMinutes('24:01')).toThrow();
    expect(() => hhmmToMinutes('abc')).toThrow();
  });
});

describe('roundToStep', () => {
  it('rounds to the default 5-minute grid', () => {
    expect(roundToStep(0)).toBe(0);
    expect(roundToStep(2)).toBe(0); // 2/5 < 0.5 -> down
    expect(roundToStep(3)).toBe(5); // 3/5 > 0.5 -> up
    expect(roundToStep(7)).toBe(5);
    expect(roundToStep(22)).toBe(20);
    expect(roundToStep(23)).toBe(25);
    expect(roundToStep(570)).toBe(570);
  });

  it('supports custom steps', () => {
    expect(roundToStep(17, 5)).toBe(15);
    expect(roundToStep(17, 30)).toBe(30);
  });

  it('rejects non-positive steps', () => {
    expect(() => roundToStep(10, 0)).toThrow(RangeError);
    expect(() => roundToStep(10, -5)).toThrow(RangeError);
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(1440)).toBe('24 h');
  });

  it('rejects negative or non-integer input', () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
    expect(() => formatDuration(1.5)).toThrow(RangeError);
  });
});
