// TranscriptStatus mirrors the enum values used by the Spring Boot backend.
// Using a union type gives TypeScript compile-time checking when you compare
// against status values, rather than allowing any arbitrary string.
export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

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
}
