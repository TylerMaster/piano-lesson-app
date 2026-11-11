package com.pianolesson.backend.summarization;

// One extracted item from a lesson summary.
//
// content  — the information itself, expressed clearly (e.g. "The left hand is rushing")
// evidence — an exact substring copied from the original transcript that supports
//            the content (e.g. "you're rushing through that left-hand passage")
//
// Evidence is required for every item and is validated against the transcript
// before the summary is saved.  An item with no verifiable evidence is rejected.
public record SummaryItem(String content, String evidence) {}
