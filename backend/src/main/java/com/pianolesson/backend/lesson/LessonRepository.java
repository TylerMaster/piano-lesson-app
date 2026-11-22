package com.pianolesson.backend.lesson;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

// JpaRepository<Lesson, Long> gives you a full set of database operations for
// free — no SQL or implementation required:
//
//   save(lesson)           — INSERT or UPDATE
//   findById(id)           — SELECT WHERE id = ?
//   findAll()              — SELECT all rows
//   deleteById(id)         — DELETE WHERE id = ?
//   existsById(id)         — SELECT COUNT WHERE id = ?
//
// Spring Data JPA generates the implementation at startup by inspecting the
// interface.  The first type parameter is the entity class; the second is the
// type of its primary key.
//
// @Repository is optional here because Spring Data detects the JpaRepository
// extension automatically, but it makes the intent explicit.
public interface LessonRepository extends JpaRepository<Lesson, Long> {

    // Spring Data JPA derives the implementation from the method name:
    // "find all Lesson rows where transcriptStatus = :status".
    // Used on startup to locate lessons stuck in PROCESSING after a crash.
    List<Lesson> findByTranscriptStatus(TranscriptStatus status);

    // The underscore in User_Id tells Spring Data to traverse the relationship:
    // Lesson → user (the @ManyToOne field) → id (the primary key on User).
    // Without the underscore, Spring Data would look for a field named "userId"
    // directly on Lesson, which does not exist.
    // Generates: SELECT * FROM lessons WHERE user_id = ?
    List<Lesson> findByUser_Id(Long userId);

    // Combines a primary-key lookup with an ownership check in one query.
    // Returns empty if the lesson does not exist OR belongs to a different user.
    // Used by the service layer to enforce ownership on single-lesson operations.
    // Generates: SELECT * FROM lessons WHERE id = ? AND user_id = ?
    Optional<Lesson> findByIdAndUser_Id(Long id, Long userId);

    // "find all Lesson rows where summaryStatus is in the given collection".
    // Used on startup to locate lessons stuck in PENDING or PROCESSING after
    // a crash — both statuses need resetting because a crash can occur after
    // PENDING is saved but before the async task starts.
    List<Lesson> findBySummaryStatusIn(List<SummaryStatus> statuses);

    // SELECT ... FOR UPDATE: locks the row for the duration of the calling
    // transaction so that two simultaneous POST /summarize requests cannot both
    // read summaryStatus = NOT_REQUESTED and both proceed.  The second caller
    // blocks on the lock, then reads PENDING after the first commits and returns
    // a 409 Conflict response instead of launching a duplicate Claude API call.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT l FROM Lesson l WHERE l.id = :id")
    Optional<Lesson> findByIdForUpdate(@Param("id") Long id);
}
