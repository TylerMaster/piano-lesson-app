import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from 'expo-audio';
import { addLesson, findOrphanedRecordings } from './storage';
import type { Lesson } from './types';

interface Props {
  onDismiss: (lesson?: Lesson) => void;
}

type PermStatus = 'checking' | 'undetermined' | 'granted' | 'denied';

const COLORS = {
  background: '#111111',
  surface: '#1C1C1E',
  accent: '#C9A84C',
  textPrimary: '#F5F5F5',
  textSecondary: '#9A9A9A',
  textMuted: '#5C5C5E',
  border: '#2C2C2E',
  danger: '#FF453A',
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function RecordingScreen({ onDismiss }: Props) {
  const [permStatus, setPermStatus] = useState<PermStatus>('checking');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs that let async callbacks and effects read current values without
  // stale-closure issues.
  const isMountedRef = useRef(true);
  const isRecordingRef = useRef(false);
  const elapsedMsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // useAudioRecorder creates a single AudioRecorder instance tied to this
  // component's lifetime. useReleasingSharedObject (inside the hook) will
  // release the native object when the component unmounts. We do NOT use
  // useAudioRecorderState here — that hook polls recorder.getStatus() via
  // setInterval, and in React 18/19 development mode (Strict Mode or New
  // Architecture), its cleanup/re-run cycle can fire against a already-
  // released SharedObject, producing the ClassCastException. We track
  // recording state and elapsed time ourselves instead.
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document', // saves directly to persistent storage, not cache
  });

  // Keep isRecordingRef in sync so AppState / cleanup can read it safely.
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

useEffect(() => {
  findOrphanedRecordings();
}, []);

  // Mark the component as unmounted so async callbacks won't set state
  // on a dead component.
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check existing permission status on mount. We do not trigger the
  // Android dialog here; that only happens when the user taps "Allow".
  useEffect(() => {
    getRecordingPermissionsAsync()
      .then(({ granted, status }) => {
        if (granted) setPermStatus('granted');
        else if (status === 'undetermined') setPermStatus('undetermined');
        else setPermStatus('denied');
      })
      .catch(() => setPermStatus('undetermined'));
  }, []);

  // Cleanup: stop the local timer and, if still recording, stop the
  // recorder so the native session ends cleanly. This is a safety net
  // for unexpected unmounts (e.g. JS error). We use refs throughout so
  // [] deps are correct — no stale closure risk.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (isRecordingRef.current) {
        recorder.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // recorder is stable for the component lifetime (useAudioRecorder
  // only recreates when options JSON changes, which it never does here).

  // Auto-save when the app goes to the background while recording.
  // Keeps refs for everything it touches so [] deps are safe.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'background' || !isRecordingRef.current) return;

      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const durationMs = elapsedMsRef.current;

      try {
        await recorder.stop();
        const uri = recorder.uri;
        console.log('[RecordingScreen] Saved recording URI:', uri);
        if (uri) {
          await addLesson({
            id: Date.now().toString(),
            uri,
            date: new Date().toISOString(),
            durationMs,
            title: 'Practice Session'
          });
        }
      } catch {
        // Best-effort — cannot do more from a background transition.
      }

      if (isMountedRef.current) {
        setIsRecording(false);
        setElapsedMs(0);
        elapsedMsRef.current = 0;
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Permission actions ───────────────────────────────────────────────

  const handleRequestPermission = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    setPermStatus(granted ? 'granted' : 'denied');
  };

  // ── Recording actions ────────────────────────────────────────────────

  const handleStart = async () => {
    if (isRecordingRef.current) return; // guard against double-press
    setError(null);
    try {
      // Call prepareToRecordAsync() WITHOUT options so the Android
      // MediaRecorder is not re-configured after the constructor already
      // set it up. Passing options here was a secondary cause of the crash
      // ("1st argument cannot be cast to AudioRecorder") on Android.
      await recorder.prepareToRecordAsync();
      recorder.record();

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (!isMountedRef.current) return;
        const ms = Date.now() - startTimeRef.current;
        elapsedMsRef.current = ms;
        setElapsedMs(ms);
      }, 250);
      setIsRecording(true);
    } catch (err) {
      setError('Could not start recording. Please try again.');
      console.error('[RecordingScreen] start error:', err);
    }
  };

  const handleStopAndSave = useCallback(async () => {
    if (isSaving) return;

    // Stop the local timer before the async stop so the final elapsed
    // value is captured cleanly.
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const durationMs = elapsedMsRef.current;

    setIsSaving(true);
    setError(null);

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        if (isMountedRef.current) {
          setError('No audio was captured. Please try again.');
          setIsSaving(false);
          setIsRecording(false);
        }
        return;
      }
      const lesson: Lesson = {
        id: Date.now().toString(),
        uri,
        date: new Date().toISOString(),
        durationMs,
        title: 'Practice Session'
      };
      await addLesson(lesson);
      if (!isMountedRef.current) return; // unmounted while saving
      setIsRecording(false);
      onDismiss(lesson);
    } catch (err) {
      console.error('[RecordingScreen] stop/save error:', err);
      if (isMountedRef.current) {
        setError('Failed to save the recording. Please try again.');
        setIsSaving(false);
      }
    }
  }, [isSaving, recorder, onDismiss]);

  const handleCancel = useCallback(() => {
    if (isRecording) {
      Alert.alert('Recording in progress', 'What would you like to do?', [
        { text: 'Keep Recording', style: 'cancel' },
        { text: 'Save & Exit', onPress: handleStopAndSave },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            if (timerRef.current !== null) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            await recorder.stop().catch(() => {});
            if (isMountedRef.current) {
              setIsRecording(false);
              onDismiss();
            }
          },
        },
      ]);
    } else {
      onDismiss();
    }
  }, [isRecording, recorder, onDismiss, handleStopAndSave]);

  // ── Permission screens ────────────────────────────────────────────────

  if (permStatus === 'checking') {
    return <View style={styles.fill} />;
  }

  if (permStatus === 'undetermined') {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>Microphone access</Text>
        <Text style={styles.permBody}>
          Piano Lesson Companion needs microphone access to record your lessons.
        </Text>
        <TouchableOpacity style={styles.goldBtn} onPress={handleRequestPermission}>
          <Text style={styles.goldBtnText}>Allow Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => onDismiss()}>
          <Text style={styles.ghostBtnText}>Not now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (permStatus === 'denied') {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>Microphone access required</Text>
        <Text style={styles.permBody}>
          Microphone access was denied. To record lessons, enable it in
          Settings → Apps → Piano Lesson Companion → Permissions → Microphone.
        </Text>
        <TouchableOpacity style={styles.goldBtn} onPress={() => Linking.openSettings()}>
          <Text style={styles.goldBtnText}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => onDismiss()}>
          <Text style={styles.ghostBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main recording UI ─────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <TouchableOpacity
        style={styles.cancelRow}
        onPress={handleCancel}
        disabled={isSaving}
      >
        <Text style={styles.cancelText}>‹ Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>New Lesson</Text>

      <View style={styles.timerArea}>
        {isRecording && (
          <View style={styles.recIndicator}>
            <View style={styles.recDot} />
            <Text style={styles.recLabel}>RECORDING</Text>
          </View>
        )}
        <Text style={styles.timer}>{formatElapsed(elapsedMs)}</Text>
        {!isRecording && !isSaving && (
          <Text style={styles.hint}>Tap the button below to start</Text>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.buttonArea}>
        {isSaving ? (
          <Text style={styles.savingText}>Saving…</Text>
        ) : isRecording ? (
          <TouchableOpacity
            style={styles.stopBtn}
            onPress={handleStopAndSave}
            activeOpacity={0.8}
          >
            <View style={styles.stopCircle}>
              <View style={styles.stopSquare} />
            </View>
            <Text style={styles.stopBtnLabel}>Stop & Save</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.startBtn}
            onPress={handleStart}
            activeOpacity={0.8}
          >
            <View style={styles.startCircle}>
              <Text style={styles.startGlyph}>♪</Text>
            </View>
            <Text style={styles.startBtnLabel}>Start Recording</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  cancelRow: {
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  cancelText: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: '500',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 52,
  },

  timerArea: {
    alignItems: 'center',
    marginBottom: 32,
  },
  recIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.danger,
  },
  recLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
    letterSpacing: 2,
  },
  timer: {
    fontSize: 72,
    fontWeight: '200',
    color: COLORS.textPrimary,
    letterSpacing: -2,
  },
  hint: {
    marginTop: 10,
    fontSize: 14,
    color: COLORS.textMuted,
  },

  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },

  buttonArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  startBtn: {
    alignItems: 'center',
    gap: 16,
  },
  startCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  startGlyph: {
    fontSize: 36,
    color: '#111111',
  },
  startBtnLabel: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  stopBtn: {
    alignItems: 'center',
    gap: 16,
  },
  stopCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  stopBtnLabel: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  savingText: {
    fontSize: 17,
    color: COLORS.textSecondary,
  },

  permTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  permBody: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 36,
  },
  goldBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  goldBtnText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingVertical: 12,
  },
  ghostBtnText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
});
