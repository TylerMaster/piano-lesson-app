package com.pianolesson.backend.lesson;

import com.pianolesson.backend.transcription.TranscriptionClient;
import com.pianolesson.backend.user.User;
import com.pianolesson.backend.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LessonServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private LessonRepository lessonRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TranscriptionClient transcriptionClient;

    @Mock
    private MultipartFile audioFile;

    private LessonService service;

    private static final Long LESSON_ID = 1L;
    private static final Long USER_ID = 10L;
    private static final User TEST_USER = new User("test@example.com", "hash");

    @BeforeEach
    void setUp() {
        service = new LessonService(lessonRepository, userRepository, transcriptionClient, tempDir.toString());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Lesson pendingLesson() {
        // transcriptStatus defaults to PENDING in the Lesson constructor.
        return new Lesson(TEST_USER, "Test Lesson", Instant.now(), 60_000L);
    }

    private Lesson processingLesson() {
        Lesson lesson = new Lesson(TEST_USER, "Test Lesson", Instant.now(), 60_000L);
        lesson.setTranscriptStatus(TranscriptStatus.PROCESSING);
        return lesson;
    }

    private Lesson doneLesson() {
        Lesson lesson = new Lesson(TEST_USER, "Test Lesson", Instant.now(), 60_000L);
        lesson.setTranscriptStatus(TranscriptStatus.DONE);
        lesson.setTranscript("Teacher said: practice the left hand separately.");
        return lesson;
    }

    private Lesson failedLesson() {
        Lesson lesson = new Lesson(TEST_USER, "Test Lesson", Instant.now(), 60_000L);
        lesson.setTranscriptStatus(TranscriptStatus.FAILED);
        lesson.setTranscript("partial transcript from earlier attempt");
        return lesson;
    }

    // ── saveAudio: ownership and pre-condition failures ───────────────────────

    @Test
    void saveAudio_lessonNotFound_throws404() {
        when(lessonRepository.findByIdAndUser_IdForUpdate(LESSON_ID, USER_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.saveAudio(LESSON_ID, USER_ID, audioFile))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @ParameterizedTest
    @EnumSource(value = TranscriptStatus.class, names = {"PROCESSING", "DONE"})
    void saveAudio_blockedStatus_throws409WithoutWritingFile(TranscriptStatus blocked) throws Exception {
        Lesson lesson = pendingLesson();
        lesson.setTranscriptStatus(blocked);
        when(lessonRepository.findByIdAndUser_IdForUpdate(LESSON_ID, USER_ID))
                .thenReturn(Optional.of(lesson));

        assertThatThrownBy(() -> service.saveAudio(LESSON_ID, USER_ID, audioFile))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));

        verify(audioFile, never()).transferTo(any(Path.class));
        verify(lessonRepository, never()).save(any());
    }

    @Test
    void saveAudio_statusDone_preservesExistingTranscript() {
        // The 409 must fire before any mutation so the existing transcript is
        // never cleared or overwritten.
        Lesson lesson = doneLesson();
        when(lessonRepository.findByIdAndUser_IdForUpdate(LESSON_ID, USER_ID))
                .thenReturn(Optional.of(lesson));

        assertThatThrownBy(() -> service.saveAudio(LESSON_ID, USER_ID, audioFile))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));

        assertThat(lesson.getTranscript())
                .isEqualTo("Teacher said: practice the left hand separately.");
        verify(lessonRepository, never()).save(any());
    }

    // ── saveAudio: happy paths ────────────────────────────────────────────────

    @Test
    void saveAudio_statusPending_savesAudioPathAndSetsProcessing() throws Exception {
        when(lessonRepository.findByIdAndUser_IdForUpdate(LESSON_ID, USER_ID))
                .thenReturn(Optional.of(pendingLesson()));
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));

        service.saveAudio(LESSON_ID, USER_ID, audioFile);

        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository).save(captor.capture());
        Lesson saved = captor.getValue();
        assertThat(saved.getTranscriptStatus()).isEqualTo(TranscriptStatus.PROCESSING);
        assertThat(saved.getAudioPath()).isNotNull();
    }

    @Test
    void saveAudio_statusFailed_clearsPreviousTranscriptAndSetsProcessing() throws Exception {
        when(lessonRepository.findByIdAndUser_IdForUpdate(LESSON_ID, USER_ID))
                .thenReturn(Optional.of(failedLesson()));
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));

        service.saveAudio(LESSON_ID, USER_ID, audioFile);

        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository).save(captor.capture());
        Lesson saved = captor.getValue();
        assertThat(saved.getTranscript()).isNull();
        assertThat(saved.getTranscriptStatus()).isEqualTo(TranscriptStatus.PROCESSING);
    }

    @Test
    void saveAudio_concurrentUploads_secondRequestReceivesConflict() throws Exception {
        // The DB pessimistic lock serializes concurrent requests: the second
        // caller blocks until the first commits PROCESSING, then sees PROCESSING
        // and must receive a 409.  We simulate this by configuring the mock to
        // return PENDING on the first call and PROCESSING on the second — the
        // observable outcome after the lock is released.
        when(lessonRepository.findByIdAndUser_IdForUpdate(LESSON_ID, USER_ID))
                .thenReturn(Optional.of(pendingLesson()))
                .thenReturn(Optional.of(processingLesson()));
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));

        // First call succeeds.
        service.saveAudio(LESSON_ID, USER_ID, audioFile);

        // Second call sees PROCESSING and must throw 409.
        assertThatThrownBy(() -> service.saveAudio(LESSON_ID, USER_ID, audioFile))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    // ── transcribeAsync: success path ─────────────────────────────────────────

    @Test
    void transcribeAsync_success_savesDoneWithTranscript() {
        when(lessonRepository.findById(LESSON_ID)).thenReturn(Optional.of(processingLesson()));
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transcriptionClient.transcribe(any()))
                .thenReturn(new TranscriptionClient.TranscriptionResponse(
                        "Teacher said practice slowly.", null, null, "tiny"));

        service.transcribeAsync(LESSON_ID, Path.of("audio.m4a"));

        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository).save(captor.capture());
        assertThat(captor.getValue().getTranscriptStatus()).isEqualTo(TranscriptStatus.DONE);
        assertThat(captor.getValue().getTranscript()).isEqualTo("Teacher said practice slowly.");
    }

    @Test
    void transcribeAsync_doesNotSetProcessingStatus() {
        // PROCESSING is committed by saveAudio() before transcribeAsync() is
        // called.  transcribeAsync() must write only DONE or FAILED — never
        // PROCESSING — so there is exactly one save() call, not two.
        when(lessonRepository.findById(LESSON_ID)).thenReturn(Optional.of(processingLesson()));
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transcriptionClient.transcribe(any()))
                .thenReturn(new TranscriptionClient.TranscriptionResponse(
                        "Some transcript.", null, null, "tiny"));

        service.transcribeAsync(LESSON_ID, Path.of("audio.m4a"));

        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository, times(1)).save(captor.capture());
        assertThat(captor.getValue().getTranscriptStatus()).isEqualTo(TranscriptStatus.DONE);
    }

    // ── transcribeAsync: failure path ─────────────────────────────────────────

    @Test
    void transcribeAsync_transcriptionException_savesFailed() {
        when(lessonRepository.findById(LESSON_ID)).thenReturn(Optional.of(processingLesson()));
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transcriptionClient.transcribe(any()))
                .thenThrow(new RuntimeException("Whisper service unreachable"));

        service.transcribeAsync(LESSON_ID, Path.of("audio.m4a"));

        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository, times(1)).save(captor.capture());
        assertThat(captor.getValue().getTranscriptStatus()).isEqualTo(TranscriptStatus.FAILED);
    }

    // ── markStaleProcessingLessons ────────────────────────────────────────────

    @Test
    void markStaleProcessingLessons_setsStuckLessonsToFailed() {
        Lesson stuck1 = processingLesson();
        Lesson stuck2 = processingLesson();
        when(lessonRepository.findByTranscriptStatus(TranscriptStatus.PROCESSING))
                .thenReturn(List.of(stuck1, stuck2));

        service.markStaleProcessingLessons();

        verify(lessonRepository).saveAll(argThat(lessons -> {
            @SuppressWarnings("unchecked")
            List<Lesson> list = (List<Lesson>) lessons;
            return list.stream().allMatch(l -> l.getTranscriptStatus() == TranscriptStatus.FAILED);
        }));
    }

    @Test
    void markStaleProcessingLessons_noStaleEntries_doesNotCallSaveAll() {
        when(lessonRepository.findByTranscriptStatus(TranscriptStatus.PROCESSING))
                .thenReturn(List.of());

        service.markStaleProcessingLessons();

        verify(lessonRepository, never()).saveAll(any());
    }
}
