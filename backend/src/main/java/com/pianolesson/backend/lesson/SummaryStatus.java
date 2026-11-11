package com.pianolesson.backend.lesson;

// The five states a lesson summary can be in.
//
// NOT_REQUESTED — default for all new lessons; summarization has not been asked for
// PENDING       — a summarization request was accepted; the async task has not started yet
// PROCESSING    — the async task is running; the AI API call is in progress
// DONE          — a validated summary has been saved successfully
// FAILED        — something went wrong (AI error, all items rejected, etc.); eligible for retry
//
// The transition from NOT_REQUESTED to PENDING is made atomically in the database
// to prevent two simultaneous requests from both succeeding.
//
// On startup, both PENDING and PROCESSING are reset to FAILED — a crash could
// occur after PENDING is saved but before the async task starts, leaving a
// lesson stuck in PENDING with no task running to advance it.
public enum SummaryStatus {
    NOT_REQUESTED,
    PENDING,
    PROCESSING,
    DONE,
    FAILED
}
