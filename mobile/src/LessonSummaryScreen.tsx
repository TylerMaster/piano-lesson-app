import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from './constants/theme';
import type { LessonSummary, SummaryStatus } from './types';

interface Props {
  summaryStatus: SummaryStatus | null;
  summary: LessonSummary | null;
  isSummarizing: boolean;
  summaryError: string | null;
  onSummarize: () => void;
  onBack: () => void;
}

export default function LessonSummaryScreen({
  summaryStatus,
  summary,
  isSummarizing,
  summaryError,
  onSummarize,
  onBack,
}: Props) {
  function renderContent() {
    if (summaryStatus === 'DONE' && summary) {
      const categories = [
        { label: 'Corrections',          items: summary.corrections },
        { label: 'Techniques',           items: summary.techniques },
        { label: 'Practice Assignments', items: summary.practiceAssignments },
        { label: 'Reminders',            items: summary.reminders },
      ];
      const nonEmpty = categories.filter(c => c.items.length > 0);
      return (
        <>
          {nonEmpty.map(cat => (
            <View key={cat.label} style={styles.category}>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              {cat.items.map((item, idx) => (
                <View key={idx} style={styles.item}>
                  <Text style={styles.itemContent}>{item.content}</Text>
                  <Text style={styles.itemEvidence}>"{item.evidence}"</Text>
                </View>
              ))}
            </View>
          ))}
        </>
      );
    }

    if (isSummarizing) {
      return <Text style={styles.bodyText}>Requesting summary…</Text>;
    }

    if (summaryStatus === 'PENDING' || summaryStatus === 'PROCESSING') {
      return (
        <>
          <Text style={styles.bodyText}>
            Generating summary… This may take a minute.
          </Text>
          <Text style={styles.hintText}>
            You can leave this screen. The summary will be saved when complete.
          </Text>
        </>
      );
    }

    if (summaryStatus === 'FAILED' || summaryError) {
      return (
        <>
          <Text style={styles.errorText}>
            {summaryError ?? 'Summary generation failed. Tap below to try again.'}
          </Text>
          <TouchableOpacity style={styles.actionButton} onPress={onSummarize}>
            <Text style={styles.actionButtonText}>Retry</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        <Text style={styles.bodyText}>
          Generate an AI summary of this lesson, including corrections, techniques,
          practice assignments, and reminders.
        </Text>
        <TouchableOpacity style={styles.actionButton} onPress={onSummarize}>
          <Text style={styles.actionButtonText}>Generate Summary</Text>
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
          <Text style={styles.headerLabel}>LESSON SUMMARY</Text>
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
  category: {
    gap: 10,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  item: {
    gap: 4,
  },
  itemContent: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  itemEvidence: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});
