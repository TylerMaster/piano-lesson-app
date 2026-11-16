import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Lesson } from './types';
import { COLORS } from './constants/theme';

interface CalendarViewProps {
  lessons: Lesson[];
  onSelectLesson: (lesson: Lesson) => void;
}

// Derives a YYYY-MM-DD key from an ISO timestamp using the device's local
// calendar date. Using getFullYear/getMonth/getDate (not toISOString) ensures
// a recording made at 11 PM local time appears on that local day, not the next
// UTC day.
function toLocalDateKey(isoString: string): string {
  const d = new Date(isoString);
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function formatDuration(ms: number): string {
  if (ms <= 0) return 'Unknown';
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarView({ lessons, onSelectLesson }: CalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Set of local date keys that have at least one lesson — used for dot rendering.
  const lessonDates = useMemo(() => {
    const set = new Set<string>();
    for (const lesson of lessons) {
      set.add(toLocalDateKey(lesson.date));
    }
    return set;
  }, [lessons]);

  // Map from local date key to the lessons recorded on that day.
  const lessonsByDate = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of lessons) {
      const key = toLocalDateKey(lesson.date);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, lesson]);
    }
    return map;
  }, [lessons]);

  // Build the flat array of day-number cells for the displayed month.
  // Leading nulls fill the cells before the 1st. Trailing nulls complete the
  // final row so the grid is always a multiple of 7.
  const dayCells = useMemo(() => {
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [year, month]);

  // Split the flat cell array into rows of 7.
  const rows = useMemo(() => {
    const result: (number | null)[][] = [];
    for (let i = 0; i < dayCells.length; i += 7) {
      result.push(dayCells.slice(i, i + 7));
    }
    return result;
  }, [dayCells]);

  // Local date key for today — used to highlight the current day.
  const todayKey = toLocalDateKey(today.toISOString());

  function goToPreviousMonth() {
    if (month === 0) {
      setYear(y => y - 1);
      setMonth(11);
    } else {
      setMonth(m => m - 1);
    }
    setSelectedDate(null);
  }

  function goToNextMonth() {
    if (month === 11) {
      setYear(y => y + 1);
      setMonth(0);
    } else {
      setMonth(m => m + 1);
    }
    setSelectedDate(null);
  }

  function handleDayPress(day: number) {
    const key =
      year +
      '-' +
      String(month + 1).padStart(2, '0') +
      '-' +
      String(day).padStart(2, '0');
    // Tapping a selected day deselects it.
    setSelectedDate(prev => (prev === key ? null : key));
  }

  const selectedLessons = selectedDate
    ? (lessonsByDate.get(selectedDate) ?? [])
    : null;

  return (
    <View>
      {/* Month navigation */}
      <View style={styles.monthHeader}>
        <TouchableOpacity
          onPress={goToPreviousMonth}
          activeOpacity={0.7}
          style={styles.navButton}
        >
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity
          onPress={goToNextMonth}
          activeOpacity={0.7}
          style={styles.navButton}
        >
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday label row */}
      <View style={styles.row}>
        {WEEKDAY_LABELS.map(label => (
          <View key={label} style={styles.cell}>
            <Text style={styles.weekdayLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((day, cellIndex) => {
            if (day === null) {
              return <View key={cellIndex} style={styles.cell} />;
            }

            const dateKey =
              year +
              '-' +
              String(month + 1).padStart(2, '0') +
              '-' +
              String(day).padStart(2, '0');
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            const hasLesson = lessonDates.has(dateKey);

            return (
              <TouchableOpacity
                key={cellIndex}
                style={[
                  styles.cell,
                  isSelected && styles.cellSelected,
                  isToday && !isSelected && styles.cellToday,
                ]}
                onPress={() => handleDayPress(day)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    isSelected && styles.dayNumberSelected,
                    isToday && !isSelected && styles.dayNumberToday,
                  ]}
                >
                  {day}
                </Text>
                {hasLesson && (
                  <View style={[styles.dot, isSelected && styles.dotOnSelected]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Selected date panel */}
      {selectedDate !== null && (
        <View style={styles.panel}>
          {/* Use noon local time to avoid date-shifting from YYYY-MM-DD parsing */}
          <Text style={styles.panelDate}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>

          {selectedLessons && selectedLessons.length > 0 ? (
            selectedLessons.map((lesson, idx) => (
              <TouchableOpacity
                key={lesson.id}
                style={[
                  styles.lessonRow,
                  idx === selectedLessons.length - 1 && styles.lessonRowLast,
                ]}
                onPress={() => onSelectLesson(lesson)}
                activeOpacity={0.7}
              >
                <View style={styles.lessonIconWrap}>
                  <Text style={styles.lessonIcon}>♪</Text>
                </View>
                <View style={styles.lessonMeta}>
                  <Text style={styles.lessonTitle}>
                    {lesson.title || 'Practice Session'}
                  </Text>
                  <Text style={styles.lessonSubtitle}>
                    {formatDuration(lesson.durationMs)}
                  </Text>
                </View>
                <Text style={styles.lessonChevron}>›</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyMessage}>
              No lessons recorded on this day.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Month navigation
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
  },
  navArrow: {
    fontSize: 26,
    color: COLORS.textSecondary,
    fontWeight: '300',
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },

  // Grid
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  cellSelected: {
    backgroundColor: COLORS.accent,
  },
  cellToday: {
    backgroundColor: COLORS.surface,
  },
  weekdayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  dayNumber: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  dayNumberSelected: {
    color: '#111111',
    fontWeight: '700',
  },
  dayNumberToday: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginTop: 3,
  },
  dotOnSelected: {
    backgroundColor: '#111111',
  },

  // Selected date panel
  panel: {
    marginTop: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  panelDate: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lessonRowLast: {
    borderBottomWidth: 0,
  },
  lessonIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonIcon: {
    fontSize: 18,
    color: COLORS.accent,
  },
  lessonMeta: {
    flex: 1,
  },
  lessonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  lessonSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  lessonChevron: {
    fontSize: 20,
    color: COLORS.textMuted,
    fontWeight: '300',
  },
  emptyMessage: {
    fontSize: 15,
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
});
