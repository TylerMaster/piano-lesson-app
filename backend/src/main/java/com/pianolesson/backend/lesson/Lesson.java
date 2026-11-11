package com.pianolesson.backend.lesson;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

// @Entity marks this class as a JPA entity — Hibernate will manage it and
// create/maintain a matching table in the database.
//
// @Table(name = "lessons") explicitly names the database table.  Without it,
// Hibernate would use the class name ("Lesson"), but being explicit avoids
// surprises.
@Entity
@Table(name = "lessons")
public class Lesson {

    // @Id marks the primary key field.
    // @GeneratedValue(IDENTITY) tells the database to auto-increment this
    // column (BIGSERIAL in PostgreSQL).  The application never sets the id;
    // the database assigns it on INSERT.
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    // Instant represents a point in time with no timezone.  It maps to
    // TIMESTAMP WITH TIME ZONE in PostgreSQL.  The mobile app sends ISO 8601
    // strings ("2024-11-04T10:00:00.000Z"); Jackson converts them automatically.
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "duration_ms", nullable = false)
    private long durationMs;

    // Path on the server's filesystem where the audio file is stored.
    // Null until audio is uploaded.
    @Column(name = "audio_path")
    private String audioPath;

    // @Enumerated(STRING) stores the enum name as a VARCHAR in the database
    // ("PENDING", "PROCESSING", etc.) rather than its ordinal number (0, 1...).
    // String storage is safer: adding new enum values or reordering them
    // won't corrupt existing rows.
    @Enumerated(EnumType.STRING)
    @Column(name = "transcript_status", nullable = false)
    private TranscriptStatus transcriptStatus = TranscriptStatus.PENDING;

    // columnDefinition = "TEXT" uses PostgreSQL's TEXT type, which has no
    // length limit — appropriate for lesson transcripts which can be long.
    @Column(columnDefinition = "TEXT")
    private String transcript;

    // Tracks summarization progress independently of transcription.
    // Defaults to NOT_REQUESTED: a lesson does not have a pending summary
    // until one is explicitly requested via POST /lessons/{id}/summarize.
    //
    // columnDefinition embeds a database-level DEFAULT so that when Hibernate
    // adds this column to an existing table via ALTER TABLE ... ADD COLUMN,
    // PostgreSQL backfills existing rows with 'NOT_REQUESTED' rather than
    // rejecting the NOT NULL constraint.  A Java field initializer alone does
    // not produce a DEFAULT clause in the generated DDL.
    @Enumerated(EnumType.STRING)
    @Column(name = "summary_status", nullable = false,
            columnDefinition = "VARCHAR(255) NOT NULL DEFAULT 'NOT_REQUESTED'")
    private SummaryStatus summaryStatus = SummaryStatus.NOT_REQUESTED;

    // Stores the AI-generated, evidence-validated summary as a JSON string.
    // Null until summarization completes successfully (summaryStatus = DONE).
    // Deserialized into a LessonSummary record when building the API response.
    @Column(name = "summary_json", columnDefinition = "TEXT")
    private String summaryJson;

    // JPA requires a no-argument constructor.  It uses it when reconstructing
    // entities from database rows.  We make it protected rather than public
    // because application code should use the other constructor.
    protected Lesson() {}

    public Lesson(String title, Instant recordedAt, long durationMs) {
        this.title = title;
        this.recordedAt = recordedAt;
        this.durationMs = durationMs;
        this.transcriptStatus = TranscriptStatus.PENDING;
        this.summaryStatus = SummaryStatus.NOT_REQUESTED;
    }

    // ── Getters and setters ───────────────────────────────────────────────

    public Long getId() { return id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public Instant getRecordedAt() { return recordedAt; }

    public long getDurationMs() { return durationMs; }

    public String getAudioPath() { return audioPath; }
    public void setAudioPath(String audioPath) { this.audioPath = audioPath; }

    public TranscriptStatus getTranscriptStatus() { return transcriptStatus; }
    public void setTranscriptStatus(TranscriptStatus transcriptStatus) {
        this.transcriptStatus = transcriptStatus;
    }

    public String getTranscript() { return transcript; }
    public void setTranscript(String transcript) { this.transcript = transcript; }

    public SummaryStatus getSummaryStatus() { return summaryStatus; }
    public void setSummaryStatus(SummaryStatus summaryStatus) { this.summaryStatus = summaryStatus; }

    public String getSummaryJson() { return summaryJson; }
    public void setSummaryJson(String summaryJson) { this.summaryJson = summaryJson; }
}
