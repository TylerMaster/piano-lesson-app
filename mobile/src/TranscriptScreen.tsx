import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from './constants/theme';
import type { TranscriptStatus } from './types';

interface Props {
  transcriptStatus: TranscriptStatus | null;
  transcript: string | null;
  isSubmitting: boolean;
  uploadError: string | null;
  onSubmit: () => void;
  onBack: () => void;
}

export default function TranscriptScreen({
  transcriptStatus,
  transcript,
  isSubmitting,
  uploadError,
  onSubmit,
  onBack,
}: Props) {
  function renderContent() {
    if (transcriptStatus === 'DONE' && transcript) {
      return <Text style={styles.transcriptText}>{transcript}</Text>;
    }

    if (isSubmitting) {
      return <Text style={styles.bodyText}>Uploading recording…</Text>;
    }

    if (transcriptStatus === 'PROCESSING') {
      return (
        <>
          <Text style={styles.bodyText}>
            Transcribing… This usually takes a minute or two.
          </Text>
          <Text style={styles.hintText}>
            You can leave this screen. The transcript will be saved when complete.
          </Text>
          <TouchableOpacity style={styles.retryLink} onPress={onSubmit}>
            <Text style={styles.retryLinkText}>Taking too long? Retry</Text>
          </TouchableOpacity>
        </>
      );
    }

    if (transcriptStatus === 'FAILED' || uploadError) {
      return (
        <>
          <Text style={styles.errorText}>
            {uploadError ?? 'Transcription failed on the server.'}
          </Text>
          <TouchableOpacity style={styles.actionButton} onPress={onSubmit}>
            <Text style={styles.actionButtonText}>Retry</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        <Text style={styles.bodyText}>
          Upload this recording to get a text transcript of your lesson.
        </Text>
        <TouchableOpacity style={styles.actionButton} onPress={onSubmit}>
          <Text style={styles.actionButtonText}>Get Transcript</Text>
        </TouchableOpacity>
      </>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerLabel}>TRANSCRIPT</Text>
        </View>

        <View style={styles.card}>
          {renderContent()}
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
    marginBottom: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  headerLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 20,
    gap: 16,
  },
  bodyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  hintText: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 15,
    color: '#FF453A',
    lineHeight: 24,
  },
  transcriptText: {
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
  retryLink: {
    alignItems: 'center',
  },
  retryLinkText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },
});
