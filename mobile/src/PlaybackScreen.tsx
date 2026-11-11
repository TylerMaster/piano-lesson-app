import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Lesson, TranscriptStatus } from './types';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { COLORS } from './constants/theme';
import { formatDate } from './utils/formatDate';
import { registerLesson, uploadAudio, fetchLessonStatus, ApiError } from './api';
import { updateLesson } from './storage';


interface PlaybackScreenProps {
  lesson: Lesson;
  onBack: () => void;
  onRename: (newTitle: string) => Promise<void>;
  onLessonUpdate?: (updated: Lesson) => void;
}


function formatPlaybackTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}


export default function PlaybackScreen({
  lesson,
  onBack,
  onRename,
  onLessonUpdate,
}: PlaybackScreenProps) {
  // ── Audio player ────────────────────────────────────────────────────────
  const player = useAudioPlayer(lesson.uri);
  const status = useAudioPlayerStatus(player);
  const progressBarWidth = useRef(0);

  // ── Rename modal ────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(lesson.title);

  // ── Transcription state ─────────────────────────────────────────────────
  // Initialized from the lesson prop. These are updated locally as the
  // upload/poll cycle progresses and mirrored to AsyncStorage for persistence.
  const [backendId, setBackendId] = useState<number | null>(lesson.backendId ?? null);
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus | null>(
    lesson.transcriptStatus ?? null
  );
  const [transcript, setTranscript] = useState<string | null>(lesson.transcript ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────
  const isMountedRef = useRef(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  // Stop polling and mark unmounted when the screen is left.
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: if the lesson has a backendId but transcription isn't done,
  // fetch the current backend status. This resumes the right UI state if
  // the app was restarted mid-transcription or the transcript was saved on
  // the backend but not yet locally.
  useEffect(() => {
    const { backendId: initId, transcriptStatus: initStatus, transcript: initTranscript } = lesson;
    if (!initId) return;
    if (initStatus === 'DONE' && initTranscript) return; // already complete — no network needed

    fetchLessonStatus(initId)
      .then(result => {
        if (!isMountedRef.current) return;

        setTranscriptStatus(result.transcriptStatus);
        if (result.transcript != null) setTranscript(result.transcript);

        if (result.transcriptStatus === 'DONE') {
          const updates = {
            transcriptStatus: result.transcriptStatus as TranscriptStatus,
            transcript: result.transcript ?? undefined,
          };
          updateLesson(lesson.id, updates)
            .catch(e => console.warn('[Transcription] Could not save DONE locally:', e));
          onLessonUpdate?.({ ...lesson, backendId: initId, ...updates });

        } else if (result.transcriptStatus === 'PROCESSING') {
          // Transcription is in progress — resume polling where we left off.
          startPolling(initId);
        }
        // PENDING: audio was never uploaded. Show the upload button.
        // FAILED: show the failure UI. No polling needed.
      })
      .catch(() => {
        // Backend unreachable on startup — keep whatever local state is stored.
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Run only on mount. Intentional empty deps — the mount check uses lesson
  // values captured at component creation; re-running on lesson changes would
  // start extra polls on rename.

  // ── Polling helpers ─────────────────────────────────────────────────────

  function stopPolling() {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  // Start a 4-second polling loop for the given backendId.
  // Safe to call when a poll is already running — the guard prevents duplicates.
  function startPolling(id: number) {
    if (pollingRef.current !== null) return;

    pollingRef.current = setInterval(async () => {
      if (!isMountedRef.current) {
        stopPolling();
        return;
      }

      try {
        const result = await fetchLessonStatus(id);
        if (!isMountedRef.current) return;

        if (result.transcriptStatus === 'DONE' || result.transcriptStatus === 'FAILED') {
          stopPolling();
          setTranscriptStatus(result.transcriptStatus);
          if (result.transcript != null) setTranscript(result.transcript);

          const updates = {
            transcriptStatus: result.transcriptStatus,
            ...(result.transcript != null && { transcript: result.transcript }),
          };
          updateLesson(lesson.id, updates)
            .catch(e => console.warn('[Polling] Could not persist final status:', e));
          onLessonUpdate?.({
            ...lesson,
            backendId: id,
            transcriptStatus: result.transcriptStatus,
            transcript: result.transcript ?? undefined,
          });
        }
        // PROCESSING / PENDING: continue polling.
      } catch {
        // Transient network failure — keep the interval running.
        console.warn('[Polling] Status check failed, will retry');
      }
    }, 4000);
  }

  // ── Upload / submit ─────────────────────────────────────────────────────

  async function handleSubmit() {
    if (isSubmitting) return;
    // Stop any existing polling loop before starting a new upload sequence.
    // This covers both normal retries (from FAILED — no active poll) and
    // forced retries (from PROCESSING — poll is running and must be cleared
    // so a new one can start cleanly after the upload).
    stopPolling();
    setIsSubmitting(true);
    setUploadError(null);

    // Work with a local variable so we can pass the id to startPolling
    // without waiting for the setBackendId re-render.
    let currentBackendId = backendId;

    try {
      // Step 1 — Register the lesson with the backend if not already done.
      // backendId is persisted to AsyncStorage BEFORE the upload attempt so
      // that a failed upload can be retried against the same backend lesson
      // without creating a duplicate.
      if (currentBackendId === null) {
        const newId = await registerLesson(lesson);
        currentBackendId = newId;
        setBackendId(newId);
        await updateLesson(lesson.id, { backendId: newId });
        onLessonUpdate?.({ ...lesson, backendId: newId });
      }

      // Step 2 — Upload the audio file. The backend saves it and immediately
      // kicks off async Whisper transcription.
      await uploadAudio(currentBackendId, lesson.uri);

      // Step 3 — Reflect PROCESSING locally so the UI updates immediately
      // rather than waiting for the first poll tick.
      setTranscriptStatus('PROCESSING');
      await updateLesson(lesson.id, { transcriptStatus: 'PROCESSING' });
      onLessonUpdate?.({ ...lesson, backendId: currentBackendId, transcriptStatus: 'PROCESSING' });

      // Step 4 — Start polling for DONE / FAILED.
      startPolling(currentBackendId);

    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('[Upload] Error:', err);

      let msg: string;
      if (err instanceof ApiError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      } else {
        msg = 'Upload failed. Check that the backend is running and try again.';
      }
      setUploadError(msg);
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }

  // ── Seek helper ─────────────────────────────────────────────────────────

  function seekToPosition(positionX: number) {
    if (progressBarWidth.current <= 0 || status.duration <= 0) return;
    const bounded = Math.max(0, Math.min(positionX, progressBarWidth.current));
    player.seekTo((bounded / progressBarWidth.current) * status.duration);
  }

  // ── Transcription section ───────────────────────────────────────────────

  // Returns the appropriate UI card for the current transcription state.
  //
  // Priority order:
  //   1. DONE with transcript → display it
  //   2. isSubmitting         → uploading spinner text
  //   3. PROCESSING           → transcribing spinner text
  //   4. FAILED or uploadError→ error message + retry button
  //   5. Everything else      → "Get Transcript" upload button
  //      (covers: no backendId, PENDING with backendId but no audio, null status)
  function renderTranscriptionSection() {
    if (transcriptStatus === 'DONE' && transcript) {
      return (
        <View style={styles.transcriptionSection}>
          <Text style={styles.transcriptionLabel}>Transcript</Text>
          <Text style={styles.transcriptionText}>{transcript}</Text>
        </View>
      );
    }

    if (isSubmitting) {
      return (
        <View style={styles.transcriptionSection}>
          <Text style={styles.transcriptionLabel}>Transcription</Text>
          <Text style={styles.transcriptionBody}>Uploading recording...</Text>
        </View>
      );
    }

    if (transcriptStatus === 'PROCESSING') {
      return (
        <View style={styles.transcriptionSection}>
          <Text style={styles.transcriptionLabel}>Transcription</Text>
          <Text style={styles.transcriptionBody}>
            Transcribing... This usually takes a minute or two.
          </Text>
          <Text style={styles.transcriptionHint}>
            You can leave this screen. The transcript will be saved when complete.
          </Text>
          <TouchableOpacity style={styles.retryLink} onPress={handleSubmit}>
            <Text style={styles.retryLinkText}>Taking too long? Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // PENDING means the backend has a lesson record but no audio was ever
    // uploaded (e.g. the app crashed between registration and upload).
    // Fall through to the default "Get Transcript" card below.

    if (transcriptStatus === 'FAILED' || uploadError) {
      return (
        <View style={styles.transcriptionSection}>
          <Text style={styles.transcriptionLabel}>
            {transcriptStatus === 'FAILED' ? 'Transcription Failed' : 'Upload Failed'}
          </Text>
          <Text style={styles.transcriptionErrorBody}>
            {uploadError ?? 'Transcription failed on the server.'}
          </Text>
          <TouchableOpacity style={styles.actionButton} onPress={handleSubmit}>
            <Text style={styles.actionButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.transcriptionSection}>
        <Text style={styles.transcriptionLabel}>Transcription</Text>
        <Text style={styles.transcriptionBody}>
          Upload this recording to get a text transcript of your lesson.
        </Text>
        <TouchableOpacity style={styles.actionButton} onPress={handleSubmit}>
          <Text style={styles.actionButtonText}>Get Transcript</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backButton}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerLabel}>LESSON RECORDING</Text>
        </View>

        {/* Recording information */}
        <View style={styles.recordingInfo}>
          <View style={styles.artwork}>
            <Text style={styles.artworkIcon}>♪</Text>
          </View>

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{lesson.title}</Text>
            <TouchableOpacity
              onPress={() => {
                setEditedTitle(lesson.title);
                setIsEditing(true);
              }}
            >
              <Text style={styles.editButton}>✎</Text>
            </TouchableOpacity>
          </View>

          <Modal
            visible={isEditing}
            transparent
            animationType="fade"
            onRequestClose={() => setIsEditing(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Rename Recording</Text>
                <TextInput
                  style={styles.titleInput}
                  value={editedTitle}
                  onChangeText={setEditedTitle}
                  placeholder="Enter a recording title"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={50}
                  autoFocus
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity onPress={() => setIsEditing(false)}>
                    <Text style={styles.cancelButton}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const newTitle = editedTitle.trim();
                      if (!newTitle) return;
                      await onRename(newTitle);
                      setIsEditing(false);
                    }}
                  >
                    <Text style={styles.saveButton}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <Text style={styles.subtitle}>{formatDate(lesson.date)}</Text>
        </View>

        {/* Progress bar */}
        <View
          style={styles.progressBarContainer}
          onLayout={e => {
            progressBarWidth.current = e.nativeEvent.layout.width;
          }}
        >
          <View
            style={styles.progressBarBackground}
            onLayout={e => {
              progressBarWidth.current = e.nativeEvent.layout.width;
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={e => seekToPosition(e.nativeEvent.locationX)}
            onResponderMove={e => seekToPosition(e.nativeEvent.locationX)}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${
                    status.duration > 0
                      ? (status.currentTime / status.duration) * 100
                      : 0
                  }%`,
                },
              ]}
            />
          </View>
        </View>

        {/* Time labels */}
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatPlaybackTime(status.currentTime)}</Text>
          <Text style={styles.timeText}>{formatPlaybackTime(status.duration)}</Text>
        </View>

        {/* Playback controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.playButton}
            onPress={() => {
              if (status.playing) {
                player.pause();
              } else {
                if (status.currentTime >= status.duration) player.seekTo(0);
                player.play();
              }
            }}
          >
            <Text style={styles.playButtonText}>{status.playing ? 'Ⅱ' : '▶'}</Text>
          </TouchableOpacity>
        </View>

        {/* Transcription */}
        {renderTranscriptionSection()}

      </ScrollView>
    </View>
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
  // scrollContent replaces the old 'content' style.
  // flexGrow:1 lets the content fill the screen when short while still
  // allowing scroll when the transcript makes it taller than the screen.
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  headerLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.8,
  },

  // Previously flex:1 with justifyContent:'center'. Now uses paddingVertical
  // to keep the artwork centred without blocking the transcript section below.
  recordingInfo: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  artwork: {
    width: 180,
    height: 180,
    borderRadius: 32,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  artworkIcon: {
    fontSize: 76,
    color: COLORS.accent,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },

  controls: {
    alignItems: 'center',
    paddingBottom: 32,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    fontSize: 26,
    fontWeight: '600',
    color: '#111111',
  },

  timeContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  timeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  progressBarContainer: {
    width: '100%',
    paddingVertical: 12,
  },
  progressBarBackground: {
    height: 6,
    width: '100%',
    backgroundColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 10,
  },

  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  editButton: {
    fontSize: 20,
    color: COLORS.accent,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 20,
  },
  titleInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 24,
  },
  cancelButton: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  saveButton: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // ── Transcription section ─────────────────────────────────────────────

  transcriptionSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 20,
  },
  transcriptionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  transcriptionBody: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 24,
    marginBottom: 16,
  },
  transcriptionErrorBody: {
    fontSize: 15,
    color: '#FF453A',
    lineHeight: 24,
    marginBottom: 16,
  },
  transcriptionHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
    marginTop: -8,
  },
  transcriptionText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 26,
  },
  actionButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '600',
  },
  // Secondary link shown while PROCESSING — lets the user manually break
  // out of an indefinitely-stuck transcription without a prominent button.
  retryLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  retryLinkText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },
});
