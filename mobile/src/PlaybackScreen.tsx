import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Lesson, LessonSummary, SummaryStatus, TranscriptStatus } from './types';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { COLORS } from './constants/theme';
import { formatDate } from './utils/formatDate';
import { registerLesson, uploadAudio, fetchLessonStatus, requestLessonSummary, ApiError } from './api';
import { updateLesson } from './storage';
import { useAuth } from './auth/AuthContext';
import LessonSummaryScreen from './LessonSummaryScreen';
import TranscriptScreen from './TranscriptScreen';


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


const SESSION_EXPIRED_MSG = 'Your session has expired. Please sign out and sign back in.';

export default function PlaybackScreen({
  lesson,
  onBack,
  onRename,
  onLessonUpdate,
}: PlaybackScreenProps) {
  const { token, userId } = useAuth();

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

  // ── Summarization state ─────────────────────────────────────────────────
  // Initialized from the lesson prop. Updated as the summarization lifecycle
  // progresses and mirrored to AsyncStorage for persistence.
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus | null>(
    lesson.summaryStatus ?? null
  );
  const [summary, setSummary] = useState<LessonSummary | null>(lesson.summary ?? null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [subScreen, setSubScreen] = useState<'transcript' | 'summary' | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────
  const isMountedRef = useRef(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const summaryPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  // Stop polling and mark unmounted when the screen is left.
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopPolling();
      stopSummaryPolling();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back button: dismiss sub-screen first, then go back to lesson list.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (subScreen !== null) {
        setSubScreen(null);
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [subScreen, onBack]);

  // On mount: if the lesson has a backendId, fetch the current backend status
  // when any work may still be in progress — either transcription or summarization.
  // This resumes the right UI state if the app was restarted mid-transcription,
  // mid-summarization, or if results were saved on the backend but not yet locally.
  useEffect(() => {
    const { backendId: initId, transcriptStatus: initStatus, transcript: initTranscript } = lesson;
    const initSummaryStatus = lesson.summaryStatus;
    if (!initId) return;

    // Skip the network call only when both transcription and summarization are
    // already in a terminal state locally. If summary is PENDING or PROCESSING,
    // we must fetch to get the definitive current state.
    const needsSummaryRecovery =
      initSummaryStatus === 'PENDING' || initSummaryStatus === 'PROCESSING';
    if (initStatus === 'DONE' && initTranscript && !needsSummaryRecovery) return;

    fetchLessonStatus(token!, initId)
      .then(result => {
        if (!isMountedRef.current) return;

        setTranscriptStatus(result.transcriptStatus);
        if (result.transcript != null) setTranscript(result.transcript);
        setSummaryStatus(result.summaryStatus);
        if (result.summary != null) setSummary(result.summary);

        if (result.transcriptStatus === 'DONE') {
          const updates = {
            transcriptStatus: result.transcriptStatus as TranscriptStatus,
            transcript: result.transcript ?? undefined,
            summaryStatus: result.summaryStatus,
            ...(result.summary != null && { summary: result.summary }),
          };
          if (userId !== null) {
            updateLesson(userId, lesson.id, updates)
              .catch(e => console.warn('[Transcription] Could not save DONE locally:', e));
          }
          onLessonUpdate?.({ ...lesson, backendId: initId, ...updates });

          if (result.summaryStatus === 'PENDING' || result.summaryStatus === 'PROCESSING') {
            startSummaryPolling(initId);
          }
        } else if (result.transcriptStatus === 'PROCESSING') {
          // Transcription is in progress — resume polling where we left off.
          startPolling(initId);
        }
        // PENDING: audio was never uploaded. Show the upload button.
        // FAILED: show the failure UI. No polling needed.
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401 && isMountedRef.current) {
          setUploadError(SESSION_EXPIRED_MSG);
        }
        // Any other error on startup: keep whatever local state is stored.
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
        const result = await fetchLessonStatus(token!, id);
        if (!isMountedRef.current) return;

        if (result.transcriptStatus === 'DONE' || result.transcriptStatus === 'FAILED') {
          stopPolling();
          setTranscriptStatus(result.transcriptStatus);
          if (result.transcript != null) setTranscript(result.transcript);

          const updates = {
            transcriptStatus: result.transcriptStatus,
            ...(result.transcript != null && { transcript: result.transcript }),
          };
          if (userId !== null) {
            updateLesson(userId, lesson.id, updates)
              .catch(e => console.warn('[Polling] Could not persist final status:', e));
          }
          onLessonUpdate?.({
            ...lesson,
            backendId: id,
            transcriptStatus: result.transcriptStatus,
            transcript: result.transcript ?? undefined,
          });
        }
        // PROCESSING / PENDING: continue polling.
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          stopPolling();
          if (isMountedRef.current) setUploadError(SESSION_EXPIRED_MSG);
          return;
        }
        // Transient network failure — keep the interval running.
        console.warn('[Polling] Status check failed, will retry');
      }
    }, 4000);
  }

  // ── Summary polling helpers ─────────────────────────────────────────────

  function stopSummaryPolling() {
    if (summaryPollingRef.current !== null) {
      clearInterval(summaryPollingRef.current);
      summaryPollingRef.current = null;
    }
  }

  // Start a 4-second polling loop for summarization status.
  // Safe to call when a poll is already running — the guard prevents duplicates.
  function startSummaryPolling(id: number) {
    if (summaryPollingRef.current !== null) return;

    summaryPollingRef.current = setInterval(async () => {
      if (!isMountedRef.current) {
        stopSummaryPolling();
        return;
      }

      try {
        const result = await fetchLessonStatus(token!, id);
        if (!isMountedRef.current) return;

        if (result.summaryStatus === 'DONE' || result.summaryStatus === 'FAILED') {
          stopSummaryPolling();
          setSummaryStatus(result.summaryStatus);
          if (result.summary != null) setSummary(result.summary);

          const updates = {
            summaryStatus: result.summaryStatus,
            ...(result.summary != null && { summary: result.summary }),
          };
          if (userId !== null) {
            updateLesson(userId, lesson.id, updates)
              .catch(e => console.warn('[SummaryPolling] Could not persist final status:', e));
          }
          onLessonUpdate?.({
            ...lesson,
            backendId: id,
            summaryStatus: result.summaryStatus,
            summary: result.summary ?? undefined,
          });
        }
        // PENDING / PROCESSING: continue polling.
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          stopSummaryPolling();
          if (isMountedRef.current) setSummaryError(SESSION_EXPIRED_MSG);
          return;
        }
        // Transient network failure — keep the interval running.
        console.warn('[SummaryPolling] Status check failed, will retry');
      }
    }, 4000);
  }

  // ── Upload / submit ─────────────────────────────────────────────────────

  async function handleSubmit() {
    if (isSubmitting || userId === null) return;
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
        const newId = await registerLesson(token!, lesson);
        currentBackendId = newId;
        setBackendId(newId);
        await updateLesson(userId, lesson.id, { backendId: newId });
        onLessonUpdate?.({ ...lesson, backendId: newId });
      }

      // Step 2 — Upload the audio file. The backend saves it and immediately
      // kicks off async Whisper transcription.
      await uploadAudio(token!, currentBackendId, lesson.uri);

      // Step 3 — Reflect PROCESSING locally so the UI updates immediately
      // rather than waiting for the first poll tick.
      setTranscriptStatus('PROCESSING');
      await updateLesson(userId, lesson.id, { transcriptStatus: 'PROCESSING' });
      onLessonUpdate?.({ ...lesson, backendId: currentBackendId, transcriptStatus: 'PROCESSING' });

      // Step 4 — Start polling for DONE / FAILED.
      startPolling(currentBackendId);

    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('[Upload] Error:', err);

      if (err instanceof ApiError && err.status === 409 && currentBackendId !== null) {
        // The backend rejected the upload because a transcription job is already
        // running or has already completed for this lesson. Fetch the current
        // status so we can resume the right UI state without leaving the user stuck.
        try {
          const result = await fetchLessonStatus(token!, currentBackendId);
          if (!isMountedRef.current) return;
          setTranscriptStatus(result.transcriptStatus);
          if (result.transcript != null) setTranscript(result.transcript);
          setSummaryStatus(result.summaryStatus);
          if (result.summary != null) setSummary(result.summary);
          const updates = {
            transcriptStatus: result.transcriptStatus,
            transcript: result.transcript ?? undefined,
            summaryStatus: result.summaryStatus,
            ...(result.summary != null && { summary: result.summary }),
          };
          if (userId !== null) {
            updateLesson(userId, lesson.id, updates)
              .catch(e => console.warn('[Upload] Could not persist 409 status locally:', e));
          }
          onLessonUpdate?.({ ...lesson, backendId: currentBackendId, ...updates });
          if (result.transcriptStatus === 'PROCESSING') {
            startPolling(currentBackendId);
          }
        } catch (statusErr) {
          if (!isMountedRef.current) return;
          if (statusErr instanceof ApiError && statusErr.status === 401) {
            setUploadError(SESSION_EXPIRED_MSG);
          } else {
            setUploadError('Upload conflict. Please try again.');
          }
        }
        return;
      }

      let msg: string;
      if (err instanceof ApiError && err.status === 401) {
        msg = SESSION_EXPIRED_MSG;
      } else if (err instanceof ApiError) {
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

  // ── Summarize ───────────────────────────────────────────────────────────

  async function handleSummarize() {
    if (isSummarizing || !backendId || userId === null) return;
    stopSummaryPolling();
    setIsSummarizing(true);
    setSummaryError(null);

    const id = backendId;

    try {
      await requestLessonSummary(token!, id);
      setSummaryStatus('PENDING');
      await updateLesson(userId, lesson.id, { summaryStatus: 'PENDING' });
      onLessonUpdate?.({ ...lesson, backendId: id, summaryStatus: 'PENDING' });
      startSummaryPolling(id);
    } catch (err) {
      if (!isMountedRef.current) return;

      if (err instanceof ApiError && err.status === 409) {
        // Summarization is already running or already completed. Fetch the
        // current status to determine which and act accordingly.
        try {
          const result = await fetchLessonStatus(token!, id);
          if (!isMountedRef.current) return;

          setSummaryStatus(result.summaryStatus);
          if (result.summary != null) setSummary(result.summary);

          if (result.summaryStatus === 'DONE') {
            const updates = {
              summaryStatus: result.summaryStatus,
              summary: result.summary ?? undefined,
            };
            await updateLesson(userId, lesson.id, updates);
            onLessonUpdate?.({ ...lesson, backendId: id, ...updates });
          } else if (
            result.summaryStatus === 'PENDING' ||
            result.summaryStatus === 'PROCESSING'
          ) {
            await updateLesson(userId, lesson.id, { summaryStatus: result.summaryStatus });
            onLessonUpdate?.({ ...lesson, backendId: id, summaryStatus: result.summaryStatus });
            startSummaryPolling(id);
          }
          // Any other status after a 409 is unexpected. The state setter above
          // already reflects it — no explicit error message shown.
        } catch (innerErr) {
          if (innerErr instanceof ApiError && innerErr.status === 401) {
            setSummaryError(SESSION_EXPIRED_MSG);
          } else {
            setSummaryError('Could not retrieve summary status. Try again.');
          }
        }
        return;
      }

      let msg: string;
      if (err instanceof ApiError && err.status === 401) {
        msg = SESSION_EXPIRED_MSG;
      } else if (err instanceof ApiError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      } else {
        msg = 'Failed to start summarization. Try again.';
      }
      setSummaryError(msg);
    } finally {
      if (isMountedRef.current) setIsSummarizing(false);
    }
  }

  // ── Seek helper ─────────────────────────────────────────────────────────

  function seekToPosition(positionX: number) {
    if (progressBarWidth.current <= 0 || status.duration <= 0) return;
    const bounded = Math.max(0, Math.min(positionX, progressBarWidth.current));
    player.seekTo((bounded / progressBarWidth.current) * status.duration);
  }

  // ── Nav row status labels ───────────────────────────────────────────────

  function getTranscriptStatusLabel(): string {
    if (isSubmitting) return 'Uploading…';
    if (transcriptStatus === 'DONE') return 'Ready';
    if (transcriptStatus === 'PROCESSING') return 'Transcribing…';
    if (transcriptStatus === 'FAILED' || uploadError !== null) return 'Failed';
    return 'Not uploaded';
  }

  function getSummaryStatusLabel(): string {
    if (isSummarizing) return 'Requesting…';
    if (summaryStatus === 'DONE') return 'Ready';
    if (summaryStatus === 'PENDING' || summaryStatus === 'PROCESSING') return 'Generating…';
    if (summaryStatus === 'FAILED' || summaryError !== null) return 'Failed';
    return 'Not generated';
  }

  // ── Sub-screen routing ──────────────────────────────────────────────────

  if (subScreen === 'transcript') {
    return (
      <TranscriptScreen
        transcriptStatus={transcriptStatus}
        transcript={transcript}
        isSubmitting={isSubmitting}
        uploadError={uploadError}
        onSubmit={handleSubmit}
        onBack={() => setSubScreen(null)}
      />
    );
  }

  if (subScreen === 'summary') {
    return (
      <LessonSummaryScreen
        summaryStatus={summaryStatus}
        summary={summary}
        isSummarizing={isSummarizing}
        summaryError={summaryError}
        onSummarize={handleSummarize}
        onBack={() => setSubScreen(null)}
      />
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

        {/* Transcript and Summary nav rows */}
        <View style={styles.navSection}>
          <TouchableOpacity
            style={[styles.navRow, styles.navRowBorder]}
            onPress={() => setSubScreen('transcript')}
            activeOpacity={0.7}
          >
            <View style={styles.navRowLeft}>
              <Text style={styles.navRowLabel}>Transcript</Text>
              <Text style={styles.navRowStatus}>{getTranscriptStatusLabel()}</Text>
            </View>
            <Text style={styles.navRowChevron}>›</Text>
          </TouchableOpacity>

          {transcriptStatus === 'DONE' && (
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setSubScreen('summary')}
              activeOpacity={0.7}
            >
              <View style={styles.navRowLeft}>
                <Text style={styles.navRowLabel}>Lesson Summary</Text>
                <Text style={styles.navRowStatus}>{getSummaryStatusLabel()}</Text>
              </View>
              <Text style={styles.navRowChevron}>›</Text>
            </TouchableOpacity>
          )}
        </View>

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

  // ── Nav rows ──────────────────────────────────────────────────────────
  navSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  navRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  navRowLeft: {
    flex: 1,
    gap: 2,
  },
  navRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  navRowStatus: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  navRowChevron: {
    fontSize: 20,
    color: COLORS.textMuted,
  },
});
