package com.pianolesson.backend.summarization;

import java.util.List;

// The structured output of AI summarization for one lesson.
//
// Each field is a list of SummaryItem (content + evidence pairs).
// All four lists are always present — empty lists are valid and expected
// when the transcript contains nothing in that category.
//
// This record is:
//   - returned by SummarizationClient after parsing and evidence validation
//   - serialized to JSON by Jackson and stored in the lessons.summary_json column
//   - deserialized from that JSON column when building LessonResponse for the API
//
// practiceAssignments uses camelCase to match the JSON field name the mobile
// app will receive ("practiceAssignments"), and what the AI tool schema defines.
public record LessonSummary(
        List<SummaryItem> corrections,
        List<SummaryItem> techniques,
        List<SummaryItem> practiceAssignments,
        List<SummaryItem> reminders
) {}
