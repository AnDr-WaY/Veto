/**
 * iOS-style time wheel (UIPickerView via @react-native-picker/picker),
 * ported from the clienteria mobile app.
 *
 * Two free-spinning columns — hours and minutes — with "infinite" scroll:
 * each list is repeated enough times (~2000 rows) that no realistic fling
 * reaches an edge, so the wheel never hard-stops. UIPickerView virtualizes
 * rows, so the copies are free.
 *
 * Values are minutes since midnight (the Veto time grid), not raw h/m.
 */
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../Theme';
import { radius } from '../tokens';

/** Copies of the 24-hour list (~2000 rows). */
const INFINITE_COPIES_HOURS = 83;

function minuteCopies(minuteCount: number): number {
  return Math.ceil(2000 / minuteCount);
}

export interface TimePickerWheelProps {
  /** Minutes since midnight. */
  value: number;
  /** Called with the new minutes-since-midnight value on every settled tick. */
  onChange: (minutes: number) => void;
  /** Minute granularity (Veto grid: 5). */
  minuteStep?: number;
  /** Wheel viewport height in px. */
  height?: number;
}

export function TimePickerWheel({
  value,
  onChange,
  minuteStep = 5,
  height = 200,
}: TimePickerWheelProps) {
  const { colors, typography } = useTheme();

  const minuteCount = Math.ceil(60 / minuteStep);
  const totalHours = INFINITE_COPIES_HOURS * 24;
  const totalMinutes = minuteCopies(minuteCount) * minuteCount;

  // Start inside the middle copy so the user can spin either way "forever".
  const hourMidStart = Math.floor(INFINITE_COPIES_HOURS / 2) * 24;
  const minuteMidStart = Math.floor(minuteCopies(minuteCount) / 2) * minuteCount;

  const hour = Math.floor(value / 60) % 24;
  const minute = Math.floor(value % 60 / minuteStep) * minuteStep;

  // Absolute (unwrapped) row indices. External value changes (rare — e.g. a
  // future preset tap) rotate the drums by the shortest wrap during render,
  // the prop-derived-state adjustment the SDK 57 compiler rules allow.
  const [abs, setAbs] = useState(() => ({
    hour: hourMidStart + hour,
    minute: minuteMidStart + minute / minuteStep,
  }));
  const [seededValue, setSeededValue] = useState(value);
  if (value !== seededValue) {
    setSeededValue(value);
    setAbs((prev) => ({
      hour: prev.hour + shortestDelta(((prev.hour % 24) + 24) % 24, hour, 24),
      minute:
        prev.minute +
        shortestDelta(
          ((prev.minute % minuteCount) + minuteCount) % minuteCount,
          minute / minuteStep,
          minuteCount,
        ),
    }));
  }

  const onHourChange = useCallback(
    (row: number) => {
      setAbs((prev) => ({ ...prev, hour: row }));
      const nextHour = ((row % 24) + 24) % 24;
      const next = nextHour * 60 + (value % 60);
      if (next !== value) {
        onChange(next);
      }
    },
    [onChange, value],
  );

  const onMinuteChange = useCallback(
    (row: number) => {
      setAbs((prev) => ({ ...prev, minute: row }));
      const nextMinute = (((row % minuteCount) + minuteCount) % minuteCount) * minuteStep;
      const next = Math.floor(value / 60) * 60 + nextMinute;
      if (next !== value) {
        onChange(next);
      }
    },
    [onChange, value, minuteCount, minuteStep],
  );

  const hourItems = useMemo(
    () =>
      Array.from({ length: totalHours }, (_, i) => (
        <Picker.Item
          key={i}
          label={String(((i % 24) + 24) % 24).padStart(2, '0')}
          value={i}
        />
      )),
    [totalHours],
  );

  const minuteItems = useMemo(
    () =>
      Array.from({ length: totalMinutes }, (_, i) => (
        <Picker.Item
          key={i}
          label={String(((((i % minuteCount) + minuteCount) % minuteCount) * minuteStep) % 60).padStart(2, '0')}
          value={i}
        />
      )),
    [totalMinutes, minuteCount, minuteStep],
  );

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.surface, height },
      ]}
    >
      <Picker
        selectedValue={abs.hour}
        onValueChange={onHourChange}
        style={styles.column}
        itemStyle={[
          typography.title3,
          styles.item,
          { color: colors.text },
        ]}
      >
        {hourItems}
      </Picker>

      <Text allowFontScaling={false} style={[typography.title3, styles.colon, { color: colors.textMuted }]}>
        :
      </Text>

      <Picker
        selectedValue={abs.minute}
        onValueChange={onMinuteChange}
        style={styles.column}
        itemStyle={[
          typography.title3,
          styles.item,
          { color: colors.text },
        ]}
      >
        {minuteItems}
      </Picker>
    </View>
  );
}

/** Shortest wrap distance between two indices of a cyclic list. */
function shortestDelta(from: number, to: number, length: number): number {
  let delta = to - from;
  if (delta > length / 2) {
    delta -= length;
  }
  if (delta < -length / 2) {
    delta += length;
  }
  return delta;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  column: {
    flex: 1,
    height: '100%',
  },
  colon: {
    fontWeight: '600',
  },
  item: {
    // Picker itemStyle needs explicit fontSize/weight per platform quirk;
    // typography.title3 already carries them.
  },
});
