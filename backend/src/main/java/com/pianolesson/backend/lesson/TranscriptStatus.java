package com.pianolesson.backend.lesson;

// The four states a transcription can be in.
//
// PENDING    — lesson record exists, no audio uploaded yet
// PROCESSING — audio was uploaded; the Python service is running Whisper
// DONE       — transcription completed successfully; transcript is available
// FAILED     — something went wrong (Python service unreachable, bad audio, etc.)
//
// The mobile app can poll GET /lessons/{id} and check transcriptStatus to know
// when the transcript is ready to display.
public enum TranscriptStatus {
    PENDING,
    PROCESSING,
    DONE,
    FAILED
}
