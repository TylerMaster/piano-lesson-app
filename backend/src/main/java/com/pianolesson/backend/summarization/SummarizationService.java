package com.pianolesson.backend.summarization;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pianolesson.backend.lesson.Lesson;
import com.pianolesson.backend.lesson.LessonRepository;
import com.pianolesson.backend.lesson.SummaryStatus;
import com.pianolesson.backend.lesson.TranscriptStatus;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class SummarizationService {

    private static final Logger log = LoggerFactory.getLogger(SummarizationService.class);

    private final LessonRepository lessonRepository;
    private final SummarizationClient summarizationClient;
    private final ObjectMapper objectMapper;

    public SummarizationService(
            LessonRepository lessonRepository,
            SummarizationClient summarizationClient,
            ObjectMapper objectMapper
    ) {
        this.lessonRepository = lessonRepository;
        this.summarizationClient = summarizationClient;
        this.objectMapper = objectMapper;
    }

    // ── Startup cleanup ───────────────────────────────────────────────────────

    // Resets any lessons left in summary PENDING or PROCESSING after the previous
    // JVM shutdown.  PENDING means the request was accepted but the @Async thread
    // never started; PROCESSING means the thread started but was killed mid-call.
    // In both cases, no Claude API call is running any more, so FAILED is the
    // correct state — the mobile app can then offer a Retry button.
    //
    // This mirrors the transcription recovery in LessonService.markStaleProcessingLessons().
    @PostConstruct
    @Transactional
    public void markStaleSummarizingLessons() {
        try {
            List<Lesson> stale = lessonRepository.findBySummaryStatusIn(
                    List.of(SummaryStatus.PENDING, SummaryStatus.PROCESSING));
            if (stale.isEmpty()) return;

            log.warn("[Startup] {} lesson(s) stuck in summary PENDING/PROCESSING after previous shutdown. Marking FAILED.",
                    stale.size());
            stale.forEach(lesson -> lesson.setSummaryStatus(SummaryStatus.FAILED));
            lessonRepository.saveAll(stale);
        } catch (Exception e) {
            log.error("[Startup] Could not clean up stale summary PENDING/PROCESSING lessons: {}", e.getMessage(), e);
        }
    }

    // ── Synchronous pre-flight ────────────────────────────────────────────────

    // Validates all preconditions, then atomically transitions summaryStatus
    // from NOT_REQUESTED or FAILED to PENDING.
    //
    // Why @Transactional here?
    //
    //   requestSummarization() uses findByIdForUpdate(), which issues
    //   SELECT ... FOR UPDATE.  The lock only exists within a transaction; without
    //   @Transactional this method would have no active transaction and the lock
    //   annotation would have no effect.
    //
    //   The transaction wraps the entire check-and-set sequence (read status,
    //   validate, write PENDING) as one atomic unit.  A second request for the
    //   same lesson will block on the lock, then see PENDING after the first
    //   transaction commits, and return 409 Conflict instead of starting a
    //   duplicate Claude API call.
    @Transactional
    public void requestSummarization(Long lessonId) {
        Lesson lesson = lessonRepository.findByIdForUpdate(lessonId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Lesson " + lessonId + " not found"));

        if (lesson.getTranscriptStatus() != TranscriptStatus.DONE) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "Transcription must be complete before requesting a summary "
                            + "(current transcriptStatus: " + lesson.getTranscriptStatus() + ")");
        }

        String transcript = lesson.getTranscript();
        if (transcript == null || transcript.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "Lesson " + lessonId + " has no usable transcript");
        }

        SummaryStatus current = lesson.getSummaryStatus();
        switch (current) {
            case PENDING, PROCESSING -> throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Summarization is already in progress for lesson " + lessonId
                            + " (summaryStatus: " + current + ")");
            case DONE -> throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A summary already exists for lesson " + lessonId
                            + ". It cannot be overwritten.");
            default -> { /* NOT_REQUESTED or FAILED — both are eligible */ }
        }

        lesson.setSummaryStatus(SummaryStatus.PENDING);
        lessonRepository.save(lesson);
        log.info("[Summarization] Request accepted for lesson {} (previous summaryStatus: {})", lessonId, current);
    }

    // ── Asynchronous summarization ────────────────────────────────────────────

    // Runs in a background thread so POST /summarize returns 202 immediately.
    //
    // Why NOT @Transactional here (same reasoning as LessonService.transcribeAsync):
    //
    //   Wrapping the full method in one transaction would hold the database
    //   connection open for the entire duration of the Claude API call (potentially
    //   many seconds).  It would also prevent the PROCESSING status from being
    //   visible to polling clients until the AI call completes.
    //
    //   Without @Transactional, each lessonRepository.save() opens its own short
    //   transaction, commits immediately, and releases the connection.  The
    //   PROCESSING status becomes visible as soon as the first save returns.
    @Async
    public void summarizeAsync(Long lessonId) {
        Lesson lesson = lessonRepository.findById(lessonId)
                .orElseThrow(() -> new IllegalStateException(
                        "Lesson " + lessonId + " disappeared before summarization could start"));

        try {
            lesson.setSummaryStatus(SummaryStatus.PROCESSING);
            lesson = lessonRepository.save(lesson);
            log.info("[Summarization] Started for lesson {}", lessonId);

            // SummarizationClient handles the full Claude API call, parses the
            // structured tool response, and validates that every evidence string
            // appears verbatim in the transcript.  It throws SummarizationException
            // on any failure, which the catch block below handles.
            LessonSummary summary = summarizationClient.summarize(lesson.getTranscript());

            // Serialize the validated LessonSummary to JSON for database storage.
            // objectMapper.writeValueAsString throws JsonProcessingException
            // (extends IOException extends Exception), which the catch block covers.
            String summaryJson = objectMapper.writeValueAsString(summary);

            lesson.setSummaryJson(summaryJson);
            lesson.setSummaryStatus(SummaryStatus.DONE);
            lessonRepository.save(lesson);
            log.info("[Summarization] Done for lesson {} — corrections={}, techniques={}, assignments={}, reminders={}",
                    lessonId,
                    summary.corrections().size(),
                    summary.techniques().size(),
                    summary.practiceAssignments().size(),
                    summary.reminders().size());

        } catch (Exception e) {
            // Log what went wrong.  SummarizationException messages are safe to
            // log (they describe error conditions, not API key content or transcript
            // text).  The raw exception is included for the stack trace.
            log.error("[Summarization] Failed for lesson {}: {}", lessonId, e.getMessage(), e);

            // Mirror the double-try pattern from transcribeAsync: attempt to save
            // FAILED status, and if that also fails, log the secondary failure
            // separately rather than swallowing it.
            try {
                lesson.setSummaryStatus(SummaryStatus.FAILED);
                lessonRepository.save(lesson);
                log.info("[Summarization] Saved FAILED status for lesson {}", lessonId);
            } catch (Exception saveError) {
                log.error("[Summarization] Could not save FAILED status for lesson {}. "
                        + "Lesson may appear stuck in PROCESSING. Cause: {}",
                        lessonId, saveError.getMessage(), saveError);
            }
        }
    }
}
