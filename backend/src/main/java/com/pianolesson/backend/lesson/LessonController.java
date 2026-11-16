package com.pianolesson.backend.lesson;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pianolesson.backend.summarization.SummarizationService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/lessons")
public class LessonController {

    private final LessonService lessonService;
    private final SummarizationService summarizationService;
    private final ObjectMapper objectMapper;

    public LessonController(
            LessonService lessonService,
            SummarizationService summarizationService,
            ObjectMapper objectMapper
    ) {
        this.lessonService = lessonService;
        this.summarizationService = summarizationService;
        this.objectMapper = objectMapper;
    }

    // ── GET /lessons ──────────────────────────────────────────────────────
    // Returns all lessons as LessonResponse DTOs (no audioPath exposed).
    @GetMapping
    public List<LessonResponse> getAllLessons() {
        return lessonService.findAll()
                .stream()
                .map(lesson -> LessonResponse.from(lesson, objectMapper))
                .toList();
    }

    // ── GET /lessons/{id} ─────────────────────────────────────────────────
    @GetMapping("/{id}")
    public LessonResponse getLesson(@PathVariable Long id) {
        return LessonResponse.from(lessonService.findById(id), objectMapper);
    }

    // ── POST /lessons ─────────────────────────────────────────────────────
    // Creates a lesson record and returns its database-assigned id.
    // The mobile app stores this id as backendId for subsequent upload and
    // polling calls.
    //
    // Request body: { "title": "...", "recordedAt": "2024-11-04T10:00:00Z", "durationMs": 180000 }
    // Response 201: LessonResponse (transcriptStatus: "PENDING", transcript: null)
    @PostMapping
    public ResponseEntity<LessonResponse> createLesson(@RequestBody CreateLessonRequest request) {
        Instant recordedAt = Instant.parse(request.recordedAt());
        Lesson created = lessonService.createLesson(
                request.title(),
                recordedAt,
                request.durationMs()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(LessonResponse.from(created, objectMapper));
    }

    // ── POST /lessons/{id}/audio ──────────────────────────────────────────
    // Accepts a multipart/form-data upload with field name "audio".
    // Saves the file to disk and starts async transcription.
    // Returns 202 Accepted immediately — poll GET /lessons/{id} for status.
    @PostMapping("/{id}/audio")
    public ResponseEntity<Map<String, Object>> uploadAudio(
            @PathVariable Long id,
            @RequestParam("audio") MultipartFile audio
    ) throws IOException {
        Path savedPath = lessonService.saveAudio(id, audio);
        lessonService.transcribeAsync(id, savedPath);  // returns immediately; runs in background

        return ResponseEntity.accepted().body(Map.of(
                "id", id,
                "message", "Audio saved. Transcription started.",
                "transcriptStatus", TranscriptStatus.PROCESSING.name()
        ));
    }

    // ── POST /lessons/{id}/summarize ──────────────────────────────────────
    // Validates preconditions, marks summaryStatus PENDING, and launches async
    // summarization.  Returns 202 Accepted immediately.
    //
    // Poll GET /lessons/{id} and check summaryStatus:
    //   PENDING     — accepted, not yet started
    //   PROCESSING  — Claude API call is in progress
    //   DONE        — summary is ready in the summary field
    //   FAILED      — something went wrong; call this endpoint again to retry
    //
    // Returns 404 if the lesson does not exist.
    // Returns 422 if transcription is not complete or the transcript is blank.
    // Returns 409 if summarization is already running or already succeeded.
    @PostMapping("/{id}/summarize")
    public ResponseEntity<Map<String, Object>> requestSummarization(@PathVariable Long id) {
        summarizationService.requestSummarization(id);     // validates + sets PENDING (synchronous, @Transactional)
        summarizationService.summarizeAsync(id);            // calls Claude in a background thread (@Async)
        return ResponseEntity.accepted().body(Map.of(
                "id", id,
                "message", "Summarization started.",
                "summaryStatus", SummaryStatus.PENDING.name()
        ));
    }

    // ── Request DTO ───────────────────────────────────────────────────────
    record CreateLessonRequest(String title, String recordedAt, long durationMs) {}
}
