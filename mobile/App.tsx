import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import RecordingScreen from './src/RecordingScreen';
import type { Lesson } from './src/types';
import { validateAndLoadLessons, updateMissingDurations, findOrphanedRecordings } from './src/storage';
import {   debugStorage,
  recoverRecording, deleteLesson, renameLesson } from './src/storage';
  import { getRecordingDuration} from './src/storage';
  import PlaybackScreen from './src/PlaybackScreen';
import CalendarView from './src/CalendarView';
  import { COLORS } from './src/constants/theme';
import { formatDate } from './src/utils/formatDate';
import {
  Alert,
  // keep your other existing imports
} from 'react-native';

type Screen = 'home' | 'recording';



function formatDuration(ms: number): string {
  if (ms <= 0) {
    return 'Unknown';
  }

  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);

  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

interface LessonItemProps {
  lesson: Lesson;
  isLast: boolean;
  onPress: () => void;
   onDelete: () => void;
}

function LessonItem({
  lesson,
  isLast,
  onPress,
  onDelete,
}: LessonItemProps) {
  function confirmDelete() {
    Alert.alert(
      'Delete recording?',
      'This will permanently delete the audio recording and its saved lesson data. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: onDelete,
        },
      ]
    );
  }

  return (
    <View style={[styles.lessonItem, isLast && styles.lessonItemLast]}>
      <TouchableOpacity
        style={styles.lessonMain}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.lessonIconWrap}>
          <Text style={styles.lessonIcon}>♪</Text>
        </View>

        <View style={styles.lessonMeta}>
          <Text style={styles.lessonDate}>
         {lesson.title || 'TITLE MISSING'}
        </Text>

      <Text style={styles.lessonDuration}>
      {formatDate(lesson.date)} · {formatDuration(lesson.durationMs)}
      </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={confirmDelete}
        activeOpacity={0.7}
        accessibilityLabel="Delete recording"
      >
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [orphanedRecordings, setOrphanedRecordings] = useState<string[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [homeView, setHomeView] = useState<'list' | 'calendar'>('list');

  // On startup: load persisted lessons and verify each file still exists.
  // validateAndLoadLessons removes stale entries and re-saves the cleaned list.
  useEffect(() => {
    debugStorage();
    //validateAndLoadLessons().then(setLessons);
    updateMissingDurations().then(setLessons);
    findOrphanedRecordings().then(setOrphanedRecordings);


  }, []);



  // Called when the recording screen closes. If a lesson was saved, prepend
  // it to the list without reloading from storage (it was already persisted
  // by RecordingScreen before calling onDismiss).
  const handleRecordingDone = useCallback((newLesson?: Lesson) => {
    if (newLesson) {
      setLessons((prev) => [newLesson, ...prev]);
    }
    setScreen('home');
  }, []);

const handleRecoverRecording = useCallback(async (uri: string) => {
  try {
    const recoveredLesson = await recoverRecording(uri);

    setLessons((prev) => [recoveredLesson, ...prev]);

    setOrphanedRecordings((prev) =>
      prev.filter((recording) => recording !== uri)
    );
  } catch (error) {
    console.error('[Recovery] Failed to recover recording:', error);
  }
}, []);


async function handleRenameLesson(
  lessonId: string,
  newTitle: string
) {
  try {
    await renameLesson(lessonId, newTitle);

    setLessons((previousLessons) =>
      previousLessons.map((lesson) =>
        lesson.id === lessonId
          ? { ...lesson, title: newTitle }
          : lesson
      )
    );

    setSelectedLesson((previousLesson) =>
      previousLesson?.id === lessonId
        ? { ...previousLesson, title: newTitle }
        : previousLesson
    );
  } catch (error) {
    console.error('[Rename Lesson] Failed:', error);

    Alert.alert(
      'Unable to rename recording',
      'Something went wrong while renaming this recording. Please try again.'
    );
  }
}



async function handleDeleteLesson(lesson: Lesson) {
  try {
    await deleteLesson(lesson);

    setLessons((previousLessons) =>
      previousLessons.filter((item) => item.id !== lesson.id)
    );
  } catch (error) {
    console.error('[Delete Lesson] Failed:', error);

    Alert.alert(
      'Unable to delete recording',
      'Something went wrong while deleting this recording. Please try again.'
    );
  }
}


  if (screen === 'recording') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <RecordingScreen onDismiss={handleRecordingDone} />
      </SafeAreaView>
    );
  }

  if (selectedLesson) {
  return (
    <PlaybackScreen
      lesson={selectedLesson}
      onBack={() => setSelectedLesson(null)}
      onRename={(newTitle) =>
        handleRenameLesson(selectedLesson.id, newTitle)
      }
      onLessonUpdate={(updated) => {
        setLessons((prev) =>
          prev.map((l) => (l.id === updated.id ? updated : l))
        );
        setSelectedLesson(updated);
      }}
    />
  );
}

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.appTitle}>Piano Lesson</Text>
          <Text style={styles.appTitleAccent}>Companion</Text>
        </View>

        <TouchableOpacity
          style={styles.newLessonButton}
          activeOpacity={0.85}
          onPress={() => setScreen('recording')}
        >
          <Text style={styles.newLessonIcon}>♪</Text>
          <Text style={styles.newLessonText}>New Lesson</Text>
        </TouchableOpacity>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, styles.sectionLabelNoMargin]}>
              Your Lessons
            </Text>
            <View style={styles.viewToggle}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  homeView === 'list' && styles.toggleButtonActive,
                ]}
                onPress={() => setHomeView('list')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.toggleText,
                    homeView === 'list' && styles.toggleTextActive,
                  ]}
                >
                  List
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  homeView === 'calendar' && styles.toggleButtonActive,
                ]}
                onPress={() => setHomeView('calendar')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.toggleText,
                    homeView === 'calendar' && styles.toggleTextActive,
                  ]}
                >
                  Calendar
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {homeView === 'list' ? (
            lessons.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>♩</Text>
                <Text style={styles.emptyTitle}>No lessons yet</Text>
                <Text style={styles.emptyHint}>
                  Tap "New Lesson" to record your first lesson.
                </Text>
              </View>
            ) : (
              <View style={styles.lessonList}>
                {lessons.map((lesson, idx) => (
                  <LessonItem
                    key={lesson.id}
                    lesson={lesson}
                    isLast={idx === lessons.length - 1}
                    onPress={() => setSelectedLesson(lesson)}
                    onDelete={() => handleDeleteLesson(lesson)}
                  />
                ))}
              </View>
            )
          ) : (
            <CalendarView
              lessons={lessons}
              onSelectLesson={setSelectedLesson}
            />
          )}

          {orphanedRecordings.length > 0 && (
            <View style={[styles.section, { marginTop: 24 }]}>
              <Text style={styles.sectionLabel}>Unrecovered Recordings</Text>

              <View style={styles.lessonList}>
                {orphanedRecordings.map((uri) => (
                  <View key={uri} style={styles.lessonItem}>
                    <View style={styles.lessonIconWrap}>
                      <Text style={styles.lessonIcon}>♪</Text>
                    </View>

                    <View style={styles.lessonMeta}>
                      <Text style={styles.lessonDate}>
                        Recovered recording
                      </Text>
                      <Text style={styles.lessonDuration}>
                        Original date and duration unavailable
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleRecoverRecording(uri)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.newLessonText}>Recover</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },

  // Header
  header: {
    marginBottom: 48,
  },
  appTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  appTitleAccent: {
    fontSize: 36,
    fontWeight: '300',
    color: COLORS.accent,
    letterSpacing: -0.5,
    lineHeight: 44,
  },

  // New Lesson button
  newLessonButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 48,
    elevation: 6,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  newLessonIcon: {
    fontSize: 22,
    color: '#111111',
  },
  newLessonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111111',
    letterSpacing: 0.3,
  },

  // Lessons section
  section: {},
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 52,
    paddingHorizontal: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIcon: {
    fontSize: 44,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Lesson list
  lessonList: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  lessonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 14,
  },
  lessonItemLast: {
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
  lessonDate: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  lessonDuration: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  lessonMain: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 14,
},

deleteButton: {
  width: 40,
  height: 40,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
},

deleteButtonText: {
  fontSize: 25,
  color: COLORS.textMuted,
  fontWeight: '300',
},

  // Section header with view toggle
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionLabelNoMargin: {
    marginBottom: 0,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  toggleTextActive: {
    color: '#111111',
  },
});
