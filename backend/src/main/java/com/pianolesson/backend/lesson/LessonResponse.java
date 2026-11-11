package com.pianolesson.backend.lesson;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pianolesson.backend.summarization.LessonSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

// LessonResponse is a Data Transfer Object (DTO) — a plain Java record that
// defines exactly what the API sends to clients.
//
// Why not return the Lesson entity directly?
//
//   The Lesson entity is the internal database representation and contains
//   fields that are implementation details rather than API contracts:
//
//   • audioPath — a server filesystem path like
//     "/home/brand/projects/.../audio-uploads/4/recording.m4a".
//     This reveals internal infrastructure to clients and is useless to them.
//
// By mapping to this DTO in the controller, the entity fields are decoupled
// from the API shape.  Adding or renaming internal fields won't accidentally
// change what the mobile app receives.
//
// The static factory method from(Lesson, ObjectMapper) keeps the mapping in
// one place.  ObjectMapper is passed in rather than constructed here to avoid
// creating a new instance on every request (ObjectMapper is thread-safe and
// intended to be shared).
public record LessonResponse(
        Long id,
        String title,
        Instant recordedAt,
        long durationMs,
        TranscriptStatus transcriptStatus,
        String transcript,
        SummaryStatus summaryStatus,
        LessonSummary summary
) {
    private static final Logger log = LoggerFactory.getLogger(LessonResponse.class);

    public static LessonResponse from(Lesson lesson, ObjectMapper objectMapper) {
        LessonSummary summary = null;
        if (lesson.getSummaryJson() != null) {
            try {
                summary = objectMapper.readValue(lesson.getSummaryJson(), LessonSummary.class);
            } catch (Exception e) {
                // Corrupt or mismatched JSON in the database — return null so the
                // client sees summaryStatus but no summary content.
                log.error("[LessonResponse] Failed to deserialize summaryJson for lesson {}: {}",
                        lesson.getId(), e.getMessage());
            }
        }
        return new LessonResponse(
                lesson.getId(),
                lesson.getTitle(),
                lesson.getRecordedAt(),
                lesson.getDurationMs(),
                lesson.getTranscriptStatus(),
                lesson.getTranscript(),
                lesson.getSummaryStatus(),
                summary
        );
    }
}
