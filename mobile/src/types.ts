// TranscriptStatus mirrors the enum values used by the Spring Boot backend.
// Using a union type gives TypeScript compile-time checking when you compare
// against status values, rather than allowing any arbitrary string.
export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

// SummaryStatus mirrors SummaryStatus.java.
// NOT_REQUESTED is the default for all new lessons — summarization has not been
// asked for yet.  The remaining values follow the same lifecycle as TranscriptStatus.
export type SummaryStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'PROCESSING'
  | 'DONE'
  | 'FAILED';

// One item extracted from a lesson summary.
// content  — the information itself (e.g. "The left hand is rushing")
// evidence — an exact transcript substring that supports the content
export interface SummaryItem {
  content: string;
  evidence: string;
}

// The structured output of AI summarization for one lesson.
// All four lists are always present; empty lists are valid.
export interface LessonSummary {
  corrections: SummaryItem[];
  techniques: SummaryItem[];
  practiceAssignments: SummaryItem[];
  reminders: SummaryItem[];
}

export interface Lesson {
  id: string;        // local ID — always a Date.now() timestamp string
  uri: string;       // local file URI on the device
  date: string;      // ISO 8601 string
  durationMs: number;
  title: string;

  // ── Backend integration fields ─────────────────────────────────────────
  // These are all optional. A lesson without backendId is local-only and
  // fully usable for playback, rename, and delete.
  //
  // backendId is set once when the lesson is first registered with the
  // backend (POST /lessons). It is persisted to AsyncStorage immediately
  // so a failed audio upload can be retried against the same backend lesson
  // without creating a duplicate.
  backendId?: number;
  transcriptStatus?: TranscriptStatus;
  transcript?: string;
  summaryStatus?: SummaryStatus;
  summary?: LessonSummary;
}
