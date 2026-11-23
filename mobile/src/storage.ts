import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer } from 'expo-audio';
import type { Lesson } from './types';
import * as FileSystem from 'expo-file-system/legacy';

const KEY = '@piano_lessons_v1';


export async function loadLessons(): Promise<Lesson[]> {
  try {
    const json = await AsyncStorage.getItem(KEY);

    if (!json) {
      return [];
    }

    const lessons: Lesson[] = JSON.parse(json);

    return lessons.map((lesson) => ({
      ...lesson,
      title: lesson.title || 'Practice Session',
    }));
  } catch (error) {
    console.error('[Storage] Failed to load lessons:', error);
    return [];
  }
}

async function persistLessons(lessons: Lesson[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(lessons));
}

export async function addLesson(lesson: Lesson): Promise<void> {
  console.log('[Storage Debug] Adding lesson:', lesson);

  const existing = await loadLessons();
  console.log('[Storage Debug] Existing lessons:', existing);

  const updated = [lesson, ...existing];

  await persistLessons(updated);

  const verification = await AsyncStorage.getItem(KEY);
  console.log('[Storage Debug] After saving:', verification);
}

// Loads lessons and drops any whose audio file no longer exists on disk.
// Call this on startup to recover from incomplete saves or manual file deletions.
export async function validateAndLoadLessons(): Promise<Lesson[]> {
  const lessons = await loadLessons();

  if (lessons.length === 0) {
    return [];
  }

  const checks = await Promise.all(
    lessons.map(async (lesson): Promise<Lesson | null> => {
      try {
        const info = await FileSystem.getInfoAsync(lesson.uri);

        // Only remove the lesson if the file is confirmed missing.
        return info.exists ? lesson : null;
      } catch (error) {
        // Preserve the lesson if the filesystem check fails.
        console.error(
          '[Storage] Could not validate recording:',
          lesson.uri,
          error
        );

        return lesson;
      }
    })
  );

  const valid = checks.filter(
    (lesson): lesson is Lesson => lesson !== null
  );

  // Only rewrite storage if a file was confirmed missing.
  if (valid.length !== lessons.length) {
    await persistLessons(valid);
  }

  return valid;
}

//for lost/orphaned recording still in directory but not visible on app

export async function findOrphanedRecordings(): Promise<string[]> {
  try {
    const documentDirectory = FileSystem.documentDirectory;

    if (!documentDirectory) {
      throw new Error('Document directory is unavailable.');
    }

    // Locate the Audio folder independently of saved lesson metadata.
    const audioDirectory = `${documentDirectory}Audio/`;

    const dirInfo = await FileSystem.getInfoAsync(audioDirectory);

    if (!dirInfo.exists) {
      console.log('[Recovery] Audio directory does not exist yet; skipping scan.');
      return [];
    }

    if (!dirInfo.isDirectory) {
      console.log('[Recovery] Audio path exists but is not a directory; skipping scan.');
      return [];
    }

    const files = await FileSystem.readDirectoryAsync(audioDirectory);

    // Build a list of URIs already referenced by saved lessons.
    const lessons = await loadLessons();
    const savedUris = new Set(lessons.map(lesson => lesson.uri));

    // Find recordings that aren't referenced by saved lessons.
    const orphaned = files
      .filter(file => file.endsWith('.m4a'))
      .map(file => `${audioDirectory}${file}`)
      .filter(uri => !savedUris.has(uri));

    console.log('[Recovery] Orphaned recordings:', orphaned);

    return orphaned;
  } catch (error) {
    console.error('[Recovery] Scan failed:', error);
    return [];
  }
}

export async function recoverRecording(uri: string): Promise<Lesson> {
  const durationMs = await getRecordingDuration(uri);

  const lesson: Lesson = {
    id: Date.now().toString(),
    uri,
    date: new Date().toISOString(),
    durationMs,
    title: 'Practice Session',
  };

  await addLesson(lesson);

  console.log('[Recovery] Recording recovered:', lesson);

  return lesson;
}

export async function debugStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);

    console.log('[Storage Debug] Raw data:', raw);
    console.log('[Storage Debug] Storage key:', KEY);
  } catch (error) {
    console.error('[Storage Debug] Read failed:', error);
  }
}

//Duration loading

export async function getRecordingDuration(uri: string): Promise<number> {
  const player = createAudioPlayer(uri);

  try {
    // Give the player time to load the audio metadata.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.remove();
        reject(new Error('Audio loading timed out.'));
      }, 5000);

      const subscription = player.addListener(
        'playbackStatusUpdate',
        (status) => {
          if (status.isLoaded) {
            clearTimeout(timeout);
            subscription.remove();
            resolve();
          } else if (status.error) {
            clearTimeout(timeout);
            subscription.remove();
            reject(new Error(status.error));
          }
        }
      );
    });

    return player.duration * 1000;
  } finally {
    player.remove();
  }
}

export async function updateMissingDurations(): Promise<Lesson[]> {
  const lessons = await loadLessons();

  const updatedLessons = await Promise.all(
    lessons.map(async (lesson) => {
      if (lesson.durationMs > 0) {
        return lesson;
      }

      try {
        const durationMs = await getRecordingDuration(lesson.uri);

        return {
          ...lesson,
          durationMs,
        };
      } catch (error) {
        console.error(
          '[Duration Update] Failed for:',
          lesson.uri,
          error
        );

        return lesson;
      }
    })
  );

  await persistLessons(updatedLessons);

  return updatedLessons;
}

//delete lessons

export async function deleteLesson(lesson: Lesson): Promise<void> {
  // First, delete the actual audio file.
  await FileSystem.deleteAsync(lesson.uri, {
    idempotent: true,
  });

  // Then remove its metadata from AsyncStorage.
  const lessons = await loadLessons();

  const updatedLessons = lessons.filter(
    (item) => item.id !== lesson.id
  );

  await persistLessons(updatedLessons);
}

// Update specific fields of a lesson in AsyncStorage.
// Used to persist backendId, transcriptStatus, and transcript after backend sync.
export async function updateLesson(
  lessonId: string,
  updates: Partial<Omit<Lesson, 'id'>>
): Promise<void> {
  const lessons = await loadLessons();

  const updatedLessons = lessons.map((lesson) =>
    lesson.id === lessonId ? { ...lesson, ...updates } : lesson
  );

  await persistLessons(updatedLessons);
}

//rename recordings

export async function renameLesson(
  lessonId: string,
  newTitle: string
): Promise<void> {
  const lessons = await loadLessons();

  const updatedLessons = lessons.map((lesson) =>
    lesson.id === lessonId
      ? { ...lesson, title: newTitle }
      : lesson
  );

  await persistLessons(updatedLessons);
}

// Permanently removes all local lesson audio files and their metadata.
// Deletes the Audio directory first so that if the metadata removal fails,
// the orphan recovery UI can still surface the surviving files.
// Has no effect on backend records or on the auth token in SecureStore.
export async function clearAllLocalLessons(): Promise<void> {
  const audioDir = `${FileSystem.documentDirectory}Audio/`;
  await FileSystem.deleteAsync(audioDir, { idempotent: true });
  await AsyncStorage.removeItem(KEY);
}