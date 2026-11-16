package com.pianolesson.backend.summarization;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pianolesson.backend.lesson.Lesson;
import com.pianolesson.backend.lesson.LessonRepository;
import com.pianolesson.backend.lesson.SummaryStatus;
import com.pianolesson.backend.lesson.TranscriptStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

// @ExtendWith(MockitoExtension.class) wires Mockito into JUnit 5.  Any field
// annotated with @Mock gets a Mockito mock object injected before each test,
// and Mockito verifies that no unexpected interactions occurred after each test.
@ExtendWith(MockitoExtension.class)
class SummarizationServiceTest {

    @Mock
    private LessonRepository lessonRepository;

    @Mock
    private SummarizationClient summarizationClient;

    // We use a real ObjectMapper rather than a mock so that JSON serialization
    // works exactly as it does in production.  Mocking it would add noise
    // (stubbing writeValueAsString) without testing anything extra.
    private final ObjectMapper objectMapper = new ObjectMapper();

    // The service under test, created manually so we can pass the real ObjectMapper.
    private SummarizationService service;

    @BeforeEach
    void setUp() {
        service = new SummarizationService(lessonRepository, summarizationClient, objectMapper);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Lesson doneLesson() {
        Lesson lesson = new Lesson("Test Lesson", Instant.now(), 60_000L);
        lesson.setTranscriptStatus(TranscriptStatus.DONE);
        lesson.setTranscript("Teacher said: you are rushing the left-hand passage.");
        lesson.setSummaryStatus(SummaryStatus.NOT_REQUESTED);
        return lesson;
    }

    private LessonSummary emptySummary() {
        return new LessonSummary(List.of(), List.of(), List.of(), List.of());
    }

    // ── requestSummarization: pre-condition failures ───────────────────────────

    @Test
    void requestSummarization_lessonNotFound_throws404() {
        when(lessonRepository.findByIdForUpdate(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.requestSummarization(99L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void requestSummarization_transcriptNotDone_throws422() {
        Lesson lesson = new Lesson("Test", Instant.now(), 60_000L);
        lesson.setTranscriptStatus(TranscriptStatus.PENDING);
        when(lessonRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(lesson));

        assertThatThrownBy(() -> service.requestSummarization(1L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void requestSummarization_blankTranscript_throws422() {
        Lesson lesson = new Lesson("Test", Instant.now(), 60_000L);
        lesson.setTranscriptStatus(TranscriptStatus.DONE);
        lesson.setTranscript("   ");
        when(lessonRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(lesson));

        assertThatThrownBy(() -> service.requestSummarization(1L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    // ── requestSummarization: in-progress and already-done conflicts ──────────

    // This parameterized test runs once for each of the three blocking statuses.
    // Using @EnumSource is cleaner than writing three identical test methods.
    @ParameterizedTest
    @EnumSource(value = SummaryStatus.class, names = {"PENDING", "PROCESSING", "DONE"})
    void requestSummarization_alreadyActiveOrDone_throws409(SummaryStatus blocked) {
        Lesson lesson = doneLesson();
        lesson.setSummaryStatus(blocked);
        when(lessonRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(lesson));

        assertThatThrownBy(() -> service.requestSummarization(1L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    // ── requestSummarization: happy paths ────────────────────────────────────

    @Test
    void requestSummarization_notRequested_savesPending() {
        Lesson lesson = doneLesson();
        lesson.setSummaryStatus(SummaryStatus.NOT_REQUESTED);
        when(lessonRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(lesson));

        service.requestSummarization(1L);

        // Capture the lesson that was passed to save() and check its status.
        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository).save(captor.capture());
        assertThat(captor.getValue().getSummaryStatus()).isEqualTo(SummaryStatus.PENDING);
    }

    @Test
    void requestSummarization_failed_savesPendingForRetry() {
        // A FAILED summary must be retryable.
        Lesson lesson = doneLesson();
        lesson.setSummaryStatus(SummaryStatus.FAILED);
        when(lessonRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(lesson));

        service.requestSummarization(1L);

        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository).save(captor.capture());
        assertThat(captor.getValue().getSummaryStatus()).isEqualTo(SummaryStatus.PENDING);
    }

    // ── summarizeAsync: success path ─────────────────────────────────────────

    @Test
    void summarizeAsync_success_savesDoneWithJson() throws Exception {
        Lesson lesson = doneLesson();
        lesson.setSummaryStatus(SummaryStatus.PENDING);
        when(lessonRepository.findById(1L)).thenReturn(Optional.of(lesson));
        // save() must return the same (or equivalent) entity so the method can
        // continue using it.  thenAnswer(inv -> inv.getArgument(0)) returns
        // whatever was passed in, simulating what a real JPA save does.
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));
        when(summarizationClient.summarize(anyString())).thenReturn(emptySummary());

        service.summarizeAsync(1L);

        // The last save should carry DONE status and non-null summaryJson.
        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository, times(2)).save(captor.capture());
        Lesson finalSave = captor.getAllValues().get(1);
        assertThat(finalSave.getSummaryStatus()).isEqualTo(SummaryStatus.DONE);
        assertThat(finalSave.getSummaryJson()).isNotNull();
        assertThat(finalSave.getSummaryJson()).contains("corrections");
    }

    // ── summarizeAsync: failure paths ────────────────────────────────────────

    @Test
    void summarizeAsync_summarizationException_savesFailed() {
        Lesson lesson = doneLesson();
        lesson.setSummaryStatus(SummaryStatus.PENDING);
        when(lessonRepository.findById(1L)).thenReturn(Optional.of(lesson));
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));
        when(summarizationClient.summarize(anyString()))
                .thenThrow(new SummarizationException("Anthropic API returned HTTP 401"));

        service.summarizeAsync(1L);

        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository, times(2)).save(captor.capture());
        Lesson finalSave = captor.getAllValues().get(1);
        assertThat(finalSave.getSummaryStatus()).isEqualTo(SummaryStatus.FAILED);
        assertThat(finalSave.getSummaryJson()).isNull();
    }

    @Test
    void summarizeAsync_summarizationException_doesNotChangeTranscriptStatus() {
        // Transcription and summarization statuses must stay independent.
        // A failed summarization must never touch transcriptStatus.
        Lesson lesson = doneLesson();
        lesson.setSummaryStatus(SummaryStatus.PENDING);
        when(lessonRepository.findById(1L)).thenReturn(Optional.of(lesson));
        when(lessonRepository.save(any(Lesson.class))).thenAnswer(inv -> inv.getArgument(0));
        when(summarizationClient.summarize(anyString()))
                .thenThrow(new SummarizationException("evidence validation failed"));

        service.summarizeAsync(1L);

        ArgumentCaptor<Lesson> captor = ArgumentCaptor.forClass(Lesson.class);
        verify(lessonRepository, atLeastOnce()).save(captor.capture());
        // Every save, including the FAILED one, must leave transcriptStatus DONE.
        captor.getAllValues().forEach(saved ->
                assertThat(saved.getTranscriptStatus()).isEqualTo(TranscriptStatus.DONE));
    }

    // ── markStaleSummarizingLessons ───────────────────────────────────────────

    @Test
    void markStaleSummarizingLessons_resetsStuckLessons() {
        Lesson pending = doneLesson();
        pending.setSummaryStatus(SummaryStatus.PENDING);

        Lesson processing = doneLesson();
        processing.setSummaryStatus(SummaryStatus.PROCESSING);

        when(lessonRepository.findBySummaryStatusIn(
                List.of(SummaryStatus.PENDING, SummaryStatus.PROCESSING)))
                .thenReturn(List.of(pending, processing));

        service.markStaleSummarizingLessons();

        verify(lessonRepository).saveAll(argThat(lessons -> {
            List<Lesson> list = (List<Lesson>) lessons;
            return list.stream().allMatch(l -> l.getSummaryStatus() == SummaryStatus.FAILED);
        }));
    }

    @Test
    void markStaleSummarizingLessons_noStaleEntries_doesNotCallSaveAll() {
        when(lessonRepository.findBySummaryStatusIn(any())).thenReturn(List.of());

        service.markStaleSummarizingLessons();

        verify(lessonRepository, never()).saveAll(any());
    }
}
