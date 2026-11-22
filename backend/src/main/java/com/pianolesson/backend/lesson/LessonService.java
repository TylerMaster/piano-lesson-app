package com.pianolesson.backend.lesson;

import com.pianolesson.backend.transcription.TranscriptionClient;
import com.pianolesson.backend.user.User;
import com.pianolesson.backend.user.UserRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.List;

@Service
public class LessonService {

    // SLF4J Logger — Spring Boot's logging starter configures this automatically.
    // Using a proper logger (instead of System.err) means messages include
    // timestamps, severity levels, and go through the same logging pipeline as
    // everything else, making them easier to find and filter.
    private static final Logger log = LoggerFactory.getLogger(LessonService.class);

    private final LessonRepository lessonRepository;
    private final UserRepository userRepository;
    private final TranscriptionClient transcriptionClient;
    private final Path audioStorageRoot;

    public LessonService(
            LessonRepository lessonRepository,
            UserRepository userRepository,
            TranscriptionClient transcriptionClient,
            @Value("${storage.audio.directory}") String audioStorageDirectory
    ) {
        this.lessonRepository = lessonRepository;
        this.userRepository = userRepository;
        this.transcriptionClient = transcriptionClient;
        this.audioStorageRoot = Paths.get(audioStorageDirectory).toAbsolutePath().normalize();
    }

    // ── Lesson CRUD ───────────────────────────────────────────────────────

    public List<Lesson> findAllByUserId(Long userId) {
        return lessonRepository.findByUser_Id(userId);
    }

    // Ownership-scoped lookup used by all controller-facing operations.
    // Returns 404 whether the lesson is missing or belongs to a different user —
    // the caller cannot tell which, which is the intended behavior.
    public Lesson findByIdForUser(Long id, Long userId) {
        return lessonRepository.findByIdAndUser_Id(id, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Lesson " + id + " not found"));
    }

    // Unscoped lookup retained for internal use by transcribeAsync only.
    // That method runs in a background thread after the controller has already
    // verified ownership, so no second ownership check is needed there.
    Lesson findById(Long id) {
        return lessonRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Lesson " + id + " not found"));
    }

    @Transactional
    public Lesson createLesson(Long userId, String title, Instant recordedAt, long durationMs) {
        // The userId comes from the validated JWT, not the request body.
        // If the user row is missing despite a valid token, the account was
        // deleted after the token was issued — treat it as unauthenticated.
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
        Lesson lesson = new Lesson(user, title, recordedAt, durationMs);
        return lessonRepository.save(lesson);
    }

    // ── Startup cleanup ───────────────────────────────────────────────────

    // @PostConstruct runs once, after Spring has fully wired this bean but
    // before the application starts serving requests.  It finds any lessons
    // that were left in PROCESSING because a previous JVM shutdown killed
    // the @Async transcription thread before it could save FAILED.
    //
    // Without this, the mobile app would poll PROCESSING forever after a
    // backend restart.  With this, the first poll after restart returns
    // FAILED, which the mobile app handles with a Retry button.
    //
    // The try/catch ensures a DB error here doesn't prevent startup.
    @PostConstruct
    @Transactional
    public void markStaleProcessingLessons() {
        try {
            List<Lesson> stale = lessonRepository.findByTranscriptStatus(TranscriptStatus.PROCESSING);
            if (stale.isEmpty()) return;

            log.warn("[Startup] {} lesson(s) stuck in PROCESSING after previous shutdown. Marking FAILED.",
                    stale.size());
            stale.forEach(lesson -> lesson.setTranscriptStatus(TranscriptStatus.FAILED));
            lessonRepository.saveAll(stale);
        } catch (Exception e) {
            log.error("[Startup] Could not clean up stale PROCESSING lessons: {}", e.getMessage(), e);
        }
    }

    // ── Audio upload ──────────────────────────────────────────────────────

    @Transactional
    public Path saveAudio(Long lessonId, Long userId, MultipartFile file) throws IOException {
        Lesson lesson = findByIdForUser(lessonId, userId);

        Path lessonDir = audioStorageRoot.resolve(String.valueOf(lessonId));
        Files.createDirectories(lessonDir);

        // FIX: sanitize the filename before resolving it against lessonDir.
        //
        // MultipartFile.getOriginalFilename() returns whatever the client sent,
        // which could include path separators like "../../etc/passwd".
        // Path.of(name).getFileName() strips all directory components and
        // returns only the final filename component, preventing path traversal.
        //
        // Example: "../../evil.sh" → getFileName() → "evil.sh" → safe.
        String rawName = file.getOriginalFilename();
        String safeName = "audio.bin";
        if (rawName != null && !rawName.isBlank()) {
            Path namePath = Path.of(rawName).getFileName();
            if (namePath != null && !namePath.toString().isBlank()) {
                safeName = namePath.toString();
            }
        }

        Path destination = lessonDir.resolve(safeName);
        file.transferTo(destination);

        lesson.setAudioPath(destination.toString());
        lessonRepository.save(lesson);

        return destination;
    }

    // ── Async transcription ───────────────────────────────────────────────

    // @Async runs this method in a background thread so the HTTP response
    // returns immediately.
    //
    // FIX: @Transactional is intentionally NOT on this method.
    //
    // The previous version wrapped the entire method — including the multi-second
    // Whisper call — in one database transaction.  Spring JPA only commits a
    // transaction when its boundary exits, so the PROCESSING status was not
    // written to the database until after transcription finished.  A mobile app
    // polling GET /lessons/{id} during transcription would see PENDING the whole
    // time, then jump straight to DONE or FAILED.
    //
    // Without @Transactional here, each lessonRepository.save() call uses
    // JpaRepository's own built-in @Transactional, which opens a short
    // transaction, writes the row, and commits immediately.  The PROCESSING
    // status becomes visible to other clients as soon as the first save() returns.
    @Async
    public void transcribeAsync(Long lessonId, Path audioPath) {
        // findById runs its own short @Transactional internally and returns a
        // detached entity.  We modify and re-save it in short bursts below.
        Lesson lesson = findById(lessonId);

        try {
            lesson.setTranscriptStatus(TranscriptStatus.PROCESSING);
            lesson = lessonRepository.save(lesson);  // committed immediately — visible now
            log.info("[Transcription] Started for lesson {}", lessonId);

            TranscriptionClient.TranscriptionResponse response =
                    transcriptionClient.transcribe(audioPath);

            lesson.setTranscript(response.transcript());
            lesson.setTranscriptStatus(TranscriptStatus.DONE);
            lessonRepository.save(lesson);  // committed immediately
            log.info("[Transcription] Done for lesson {} ({} chars, model={})",
                    lessonId, response.transcript().length(), response.model());

        } catch (Exception e) {
            log.error("[Transcription] Failed for lesson {}: {}", lessonId, e.getMessage(), e);

            // FIX: wrap the FAILED save in its own try-catch.
            //
            // Previously, if the FAILED save threw (e.g., the database was
            // temporarily unavailable), the exception propagated out of this
            // @Async void method.  Spring's async executor logs it and swallows
            // it, leaving the lesson stuck in PROCESSING with no way for the
            // mobile app to know something went wrong.
            //
            // Now: we try to write FAILED and log separately if that also fails.
            // In either case the outer exception is already logged above.
            try {
                lesson.setTranscriptStatus(TranscriptStatus.FAILED);
                lessonRepository.save(lesson);
                log.info("[Transcription] Saved FAILED status for lesson {}", lessonId);
            } catch (Exception saveError) {
                log.error("[Transcription] Could not save FAILED status for lesson {}. " +
                          "Lesson may appear stuck in PROCESSING. Cause: {}",
                        lessonId, saveError.getMessage(), saveError);
            }
        }
    }
}
