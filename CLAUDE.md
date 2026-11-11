Piano Lesson Companion — Project Guide

1. Project Overview

Build an Android-first piano lesson companion app for piano students.

The core idea is to let a student record their piano lesson directly on their phone, then use audio processing and AI to turn the lesson into useful, organized learning material.

The app should help students remember what their teacher explained, understand what they need to improve, and follow a structured practice plan between lessons.

This is intended to become a useful product, not just a technical demonstration. However, the immediate priority is building a working MVP and testing it with real users rather than trying to build the entire vision upfront.

2. Core User Experience

A student should eventually be able to:

Open the app and start a new lesson recording.

Record the teacher and piano together using the phone's microphone.

Stop or pause the recording and save the lesson.

Revisit previous lessons and play their recordings.

View an automatically generated lesson summary.

Review specific corrections, concepts, exercises, and assignments from the lesson.

Track practice tasks between lessons.

Review previous lessons to see what they have worked on over time.

Potential future features include practice reminders, progress tracking, lesson search, customizable practice routines, and integration with other piano-learning tools.

These future features are not part of the initial MVP unless later testing shows that they are essential.

3. Initial MVP

Build in small, verifiable stages.

Stage 1: Mobile app foundation

Create a React Native app using Expo and TypeScript.

Run it on a physical Android phone.

Create a clean home screen with a prominent "New Lesson" action.

Display saved lessons.

Stage 2: Lesson recording

Request microphone permission appropriately.

Record audio directly on the phone.

Display elapsed recording time.

Support finishing a recording and saving it locally.

Investigate pause/resume and recovery from interruptions.

Allow saved recordings to be played back, renamed, and deleted.

Test realistic recording durations and ensure recordings are not accidentally lost.

Stage 3: Local lesson management

Store lesson metadata persistently.

Maintain a list of saved lessons.

Create a lesson detail screen.

Add editable notes and a basic practice checklist using sample data initially.

Stage 4: Backend integration

Build a Java Spring Boot REST API.

Add PostgreSQL for structured lesson data.

Add a mechanism for uploading audio and tracking processing status.

Stage 5: Audio processing

Integrate the existing Demucs and Whisper experiments into a dedicated Python audio-processing service.

Transcribe speech from lesson recordings.

Generate structured lesson summaries and practice assignments.

Store the transcript and generated results so users can review them.

Stage 6: Real-world validation

Test the workflow with actual piano lessons, with the appropriate consent of everyone recorded.

Identify transcription errors and unhelpful summaries.

Improve the app based on observed problems rather than hypothetical edge cases.

Do not build every stage before testing earlier stages.

4. Technology Stack

Mobile

React Native

Expo

TypeScript

The mobile app is the first development priority.

Backend

Java

Spring Boot

REST API

The backend will manage lesson records, application logic, and communication with the processing service.

Database

PostgreSQL

Use a relational database for lesson metadata, transcripts, summaries, practice tasks, and processing status.

Do not store large audio recordings directly in database tables.

Audio processing

Python

Demucs

Whisper

Use Python for audio-processing tasks rather than attempting to implement the audio pipeline in Java.

Audio storage

Use local storage during the initial mobile prototype. Introduce cloud object storage when remote processing and synchronization require it.

AI summarization

Evaluate an appropriate language-model API to turn transcripts into structured lesson notes, corrections, exercises, and practice assignments.

Do not commit to a specific provider or incur ongoing service costs before the need is established.

5. Audio Experiments and Findings

An existing experimental project is located at:

~/projects/piano-master/piano-voice-test

This project must remain separate from the new application during initial development.

What has been explored

Whisper transcription on piano-related audio.

Comparison between transcription from the original audio and audio processed using source separation.

A Demucs-to-Whisper workflow.

The effect of speech clarity on transcription accuracy.

Observed results

An earlier Whisper small test on lesson-related audio produced a transcript estimated at roughly 95% accuracy.

A later test using separated audio produced a better transcript than the corresponding original-audio transcript.

One noted error was Whisper interpreting "missed note" as "misnomer," apparently because the speech was slurred.

These are observations from limited tests, not a guarantee of performance across different teachers, rooms, pianos, microphones, or recording conditions.

Current decision

The results are promising enough to proceed with app development.

Do not delay the mobile prototype to conduct endless audio experiments. Revisit transcription quality when there is a working recording workflow and real lesson recordings to evaluate.

Demucs is primarily designed for music source separation, so do not assume that it will reliably isolate speech from piano audio. Evaluate the existing pipeline against actual product needs before deciding whether to improve or replace it.

Preserve the original experimental project. Reuse only the relevant code and dependencies when the audio-service stage begins.

6. Architecture Direction

The intended architecture is:

Android app: records audio and displays lesson information.

Spring Boot API: manages application data and coordinates processing.

PostgreSQL: stores structured application data.

Python processing service: performs audio processing and transcription.

Language-model API: converts transcripts into useful lesson material.

Object storage: stores recordings when remote processing is introduced.

The mobile app should not need to know the internal details of Demucs or Whisper.

Start with the simplest implementation that works. Do not introduce queues, microservices infrastructure, authentication complexity, or production cloud deployment before the MVP requires them.

The initial mobile prototype can work without a backend.

7. Development Approach

The developer is learning and wants to understand the implementation rather than blindly accepting generated code.

When helping:

Explain important concepts, design decisions, and trade-offs.

Work incrementally and keep tasks small.

Prefer straightforward, maintainable solutions.

Explain what files are being created or modified and why.

Give commands that can be run and verified individually.

Inspect the existing environment before assuming dependencies or versions.

Check official documentation when library compatibility or current setup instructions matter.

Avoid unnecessary abstractions, speculative features, and premature optimization.

Do not introduce new technologies without explaining why they are needed.

Do not replace working code without understanding it first.

Never delete or overwrite existing work without permission.

Do not claim a feature works until it has been tested or its limitations are clearly stated.

The developer may use Claude for implementation and ChatGPT for additional explanations, planning, and code review. Keep project documentation clear enough that work can continue across sessions and tools.

8. Scope Control

The priority is progress toward a working product.

Do not treat every possible edge case as a blocker to starting development.

When an uncertainty arises:

Determine whether it blocks the current milestone.

If not, record it for later and continue.

If it does, perform the smallest useful investigation.

Make a practical decision, document it, and move forward.

Do not repeatedly reopen decisions that have already been made without new evidence.

9. Privacy and Security

Lesson recordings may contain private conversations and identifiable voices.

Obtain appropriate consent before recording lessons.

Keep recordings private by default.

Do not expose recordings or transcripts through public URLs.

Do not commit recordings, secrets, API keys, or credentials to Git.

Explain how recordings are stored, uploaded, processed, and deleted before introducing cloud processing.

Collect only the data needed for the product.

10. Current Status and Next Action

The project is in the planning/setup stage.

The existing audio experiments are separate and should remain untouched.

The technology stack and initial MVP direction have been selected.

Immediate goal: initialize the Expo + React Native + TypeScript mobile project in the mobile/ directory and get a minimal app running on a physical Android phone.

Start with the environment check and project setup. Do not implement recording, the backend, PostgreSQL, cloud storage, or AI processing in the first step.

After the initial app runs successfully, proceed to the recording milestone.
