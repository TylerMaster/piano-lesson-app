import { File, UploadType } from 'expo-file-system';

import { BACKEND_URL } from './config';
import type { Lesson, LessonSummary, SummaryStatus, TranscriptStatus } from './types';

// ApiError carries the HTTP status code so callers can distinguish between
// network failures (no status) and server errors (4xx/5xx).
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Shape of the LessonResponse DTO returned by all GET/POST /lessons endpoints.
// Mirrors LessonResponse.java — both transcription and summarization fields are
// always present; summary is null until summaryStatus is DONE.
interface LessonResponse {
  id: number;
  title: string;
  recordedAt: string;
  durationMs: number;
  transcriptStatus: TranscriptStatus;
  transcript: string | null;
  summaryStatus: SummaryStatus;
  summary: LessonSummary | null;
}

async function expectOk<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.text();
      if (body) detail = body;
    } catch {
      // ignore parse failure — use statusText
    }
    throw new ApiError(res.status, `HTTP ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

// POST /lessons — register a new lesson record on the backend.
// Returns the backend-assigned numeric id (backendId).
//
// IMPORTANT: check lesson.backendId before calling this. If it is already set,
// the lesson was registered in a previous attempt and you should skip straight
// to uploadAudio(). Calling this twice creates a duplicate backend lesson.
export async function registerLesson(lesson: Lesson): Promise<number> {
  console.log('Registering lesson at:', `${BACKEND_URL}/lessons`);

  try {
    const res = await fetch(`${BACKEND_URL}/lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: lesson.title,
        recordedAt: lesson.date,
        durationMs: lesson.durationMs,
      }),
    });

    console.log('Register lesson response:', res.status);

    const data = await expectOk<LessonResponse>(res);
    return data.id;
  } catch (error) {
    console.error('Register lesson failed:', error);
    throw error;
  }
}
// POST /lessons/{id}/audio — upload the audio file for transcription.
// The backend saves the file and starts async transcription immediately.
// Returns 202 Accepted — poll fetchLessonStatus() to track progress.
//
// Uses expo-file-system's File.upload() instead of fetch() + FormData because
// Expo SDK 58's WinterCG fetch implementation only accepts proper Blob instances
// in FormData — the legacy React Native {uri, name, type} object pattern throws
// "Unsupported FormDataPart implementation". File.upload() goes through the
// platform's native HTTP layer and handles multipart encoding correctly.
export async function uploadAudio(backendId: number, uri: string): Promise<void> {
  const file = new File(uri);
  const result = await file.upload(`${BACKEND_URL}/lessons/${backendId}/audio`, {
    uploadType: UploadType.MULTIPART,
    fieldName: 'audio',
    mimeType: 'audio/m4a',
  });
  if (result.status < 200 || result.status >= 300) {
    const detail = result.body || String(result.status);
    throw new ApiError(result.status, `HTTP ${result.status}: ${detail}`);
  }
}

// GET /lessons/{id} — fetch the current transcription and summarization status.
// Poll this after uploadAudio() until transcriptStatus is 'DONE' or 'FAILED',
// and after requestLessonSummary() until summaryStatus is 'DONE' or 'FAILED'.
export async function fetchLessonStatus(backendId: number): Promise<{
  transcriptStatus: TranscriptStatus;
  transcript: string | null;
  summaryStatus: SummaryStatus;
  summary: LessonSummary | null;
}> {
  const res = await fetch(`${BACKEND_URL}/lessons/${backendId}`);
  const data = await expectOk<LessonResponse>(res);
  return {
    transcriptStatus: data.transcriptStatus,
    transcript: data.transcript,
    summaryStatus: data.summaryStatus,
    summary: data.summary,
  };
}

// POST /lessons/{id}/summarize — request AI summarization for a completed lesson.
// The backend validates that transcription is DONE before accepting.
// Returns immediately (202 Accepted) — poll fetchLessonStatus() and check
// summaryStatus until it reaches 'DONE' or 'FAILED'.
//
// Throws ApiError:
//   404 — lesson not found
//   409 — summarization is already running or already succeeded
//   422 — transcription is not complete or transcript is blank
export async function requestLessonSummary(backendId: number): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/lessons/${backendId}/summarize`, {
    method: 'POST',
  });
  await expectOk<unknown>(res);
}
