import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer } from 'expo-audio';
import type { Lesson } from './types';
import * as FileSystem from 'expo-file-system/legacy';

// ── Key helpers ────────────────────────────────────────────────────────────

function storageKey(userId: number): string {
  return `@piano_lessons_v1_user_${userId}`;
}

// Returns the per-user audio directory path, e.g.
//   <documentDirectory>/Audio/4/
// Every recording saved for a user lives inside this directory.
export function userAudioDirectory(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error(
      `Invalid userId "${userId}": must be a positive safe integer.`
    );
  }
  if (!FileSystem.documentDirectory) {
    throw new Error('Document directory is unavailable.');
  }
  return `${FileSystem.documentDirectory}Audio/${userId}/`;
}

// Returns true only if the URI is inside this user's audio directory.
// Used to guard file deletions and recovery so one account cannot touch
// another account's files.
function isInUserAudioDirectory(uri: string, userId: number): boolean {
  if (!FileSystem.documentDirectory) return false;
  return uri.startsWith(`${FileSystem.documentDirectory}Audio/${userId}/`);
}

// ── File move helper ───────────────────────────────────────────────────────

// Moves a newly completed recording from the recorder's default drop location
// (Audio/ root) into the current user's private subdirectory (Audio/<userId>/).
// Returns the final destination URI. Throws on any filesystem error so callers
// can surface the failure without saving a lesson with the wrong path.
export async function moveRecordingToUserDirectory(
  userId: number,
  sourceUri: string
): Promise<string> {
  const destDir = userAudioDirectory(userId);
  await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

  // Combine a millisecond timestamp with 6 random hex characters so that
  // simultaneous saves (same ms + same 1-in-16M draw) are essentially
  // impossible. The existence check below is the hard guarantee: we verify
  // the target path is unoccupied before moving and retry if not.
  for (let attempt = 0; attempt < 5; attempt++) {
    const randomHex = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0');
    const filename = `recording-${Date.now()}-${randomHex}.m4a`;
    const destUri = `${destDir}${filename}`;
    const info = await FileSystem.getInfoAsync(destUri);
    if (!info.exists) {
      await FileSystem.moveAsync({ from: sourceUri, to: destUri });
      return destUri;
    }
  }

  throw new Error('[Storage] Could not generate a unique recording filename after 5 attempts.');
}

// ── Lesson metadata (AsyncStorage) ────────────────────────────────────────

export async function loadLessons(userId: number): Promise<Lesson[]> {
  try {
    const json = await AsyncStorage.getItem(storageKey(userId));

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

async function persistLessons(userId: number, lessons: Lesson[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(lessons));
}

export async function addLesson(userId: number, lesson: Lesson): Promise<void> {
  const existing = await loadLessons(userId);
  const updated = [lesson, ...existing];
  await persistLessons(userId, updated);
}

// Loads lessons and drops any whose audio file no longer exists on disk.
// Call this on startup to recover from incomplete saves or manual file deletions.
export async function validateAndLoadLessons(userId: number): Promise<Lesson[]> {
  const lessons = await loadLessons(userId);

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
    await persistLessons(userId, valid);
  }

  return valid;
}

// ── Orphan recovery ────────────────────────────────────────────────────────

// Scans only Audio/<userId>/ so recordings from other accounts are never
// surfaced as orphans for this account.
export async function findOrphanedRecordings(userId: number): Promise<string[]> {
  try {
    const userDir = userAudioDirectory(userId);

    const dirInfo = await FileSystem.getInfoAsync(userDir);

    if (!dirInfo.exists) {
      console.log('[Recovery] User audio directory does not exist yet; skipping scan.');
      return [];
    }

    if (!dirInfo.isDirectory) {
      console.log('[Recovery] User audio path exists but is not a directory; skipping scan.');
      return [];
    }

    const files = await FileSystem.readDirectoryAsync(userDir);

    // Build a list of URIs already referenced by this user's saved lessons.
    const lessons = await loadLessons(userId);
    const savedUris = new Set(lessons.map(lesson => lesson.uri));

    // Find .m4a files inside this user's directory that have no lesson record.
    const orphaned = files
      .filter(file => file.endsWith('.m4a'))
      .map(file => `${userDir}${file}`)
      .filter(uri => !savedUris.has(uri));

    console.log('[Recovery] Orphaned recordings:', orphaned);

    return orphaned;
  } catch (error) {
    console.error('[Recovery] Scan failed:', error);
    return [];
  }
}

// Only recovers a recording if it lives inside Audio/<userId>/.
// Rejects any URI from the shared legacy Audio/ root or another user's folder.
export async function recoverRecording(userId: number, uri: string): Promise<Lesson> {
  if (!isInUserAudioDirectory(uri, userId)) {
    throw new Error(
      `[Recovery] URI is outside the current user's audio directory and cannot be recovered: ${uri}`
    );
  }

  const durationMs = await getRecordingDuration(uri);

  const lesson: Lesson = {
    id: Date.now().toString(),
    uri,
    date: new Date().toISOString(),
    durationMs,
    title: 'Practice Session',
  };

  await addLesson(userId, lesson);

  console.log('[Recovery] Recording recovered:', lesson);

  return lesson;
}

// ── Duration loading ───────────────────────────────────────────────────────

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

export async function updateMissingDurations(userId: number): Promise<Lesson[]> {
  const lessons = await loadLessons(userId);

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

  await persistLessons(userId, updatedLessons);

  return updatedLessons;
}

// ── Lesson deletion ────────────────────────────────────────────────────────

export async function deleteLesson(userId: number, lesson: Lesson): Promise<void> {
  // Only delete the physical file if it belongs to this account's directory.
  // If the URI is in the legacy shared Audio/ root or another account's folder,
  // skip the file deletion — it is safer to leave an unowned file than to risk
  // deleting another account's recording.
  if (isInUserAudioDirectory(lesson.uri, userId)) {
    await FileSystem.deleteAsync(lesson.uri, { idempotent: true });
  } else {
    console.warn(
      '[Storage] Skipping file deletion: URI is outside the current user audio directory.',
      lesson.uri
    );
  }

  // Always remove the metadata entry from this user's storage.
  const lessons = await loadLessons(userId);

  const updatedLessons = lessons.filter(
    (item) => item.id !== lesson.id
  );

  await persistLessons(userId, updatedLessons);
}

// ── Lesson updates ─────────────────────────────────────────────────────────

// Update specific fields of a lesson in AsyncStorage.
// Used to persist backendId, transcriptStatus, and transcript after backend sync.
export async function updateLesson(
  userId: number,
  lessonId: string,
  updates: Partial<Omit<Lesson, 'id'>>
): Promise<void> {
  const lessons = await loadLessons(userId);

  const updatedLessons = lessons.map((lesson) =>
    lesson.id === lessonId ? { ...lesson, ...updates } : lesson
  );

  await persistLessons(userId, updatedLessons);
}

export async function renameLesson(
  userId: number,
  lessonId: string,
  newTitle: string
): Promise<void> {
  const lessons = await loadLessons(userId);

  const updatedLessons = lessons.map((lesson) =>
    lesson.id === lessonId
      ? { ...lesson, title: newTitle }
      : lesson
  );

  await persistLessons(userId, updatedLessons);
}

// ── Clear all ──────────────────────────────────────────────────────────────

// Permanently removes this account's local lesson audio files and metadata.
// Deletes only Audio/<userId>/ — never the shared Audio/ root or another
// account's folder. Has no effect on backend records or on the auth token.
export async function clearAllLocalLessons(userId: number): Promise<void> {
  const userDir = userAudioDirectory(userId);
  await FileSystem.deleteAsync(userDir, { idempotent: true });
  await AsyncStorage.removeItem(storageKey(userId));
}
