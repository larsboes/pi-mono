---
name: transcribe
description: Speech-to-text transcription using Groq Whisper API. Supports multiple formats, batch processing, and subtitle output.
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:32
-->

# Transcribe

Speech-to-text using Groq Whisper API. Fast, accurate, with multiple output formats.

## Setup

```bash
# Save API key (once)
./transcribe.mjs --config "your-groq-api-key"

# Or use environment variable
export GROQ_API_KEY="your-key"
```

## Basic Usage

```bash
# Simple transcription
./transcribe.mjs meeting.m4a

# Save to file
./transcribe.mjs podcast.mp3 --output transcript.txt

# JSON output with timestamps
./transcribe.mjs interview.wav --format json

# Generate subtitles
./transcribe.mjs video.mp4 --format srt --output video.srt
./transcribe.mjs video.mp4 --format vtt --output video.vtt
```

## Options

| Option | Description |
|--------|-------------|
| `--format <format>` | Output: `text` (default), `json`, `srt`, `vtt` |
| `--output <file>` | Output file (default: stdout) |
| `--model <model>` | `whisper-large-v3-turbo` (default) or `whisper-large-v3` |
| `--language <code>` | Language code (auto-detect if not set) |
| `--translate` | Translate to English |
| `--batch <file>` | Process multiple files (one per line) |
| `--parallel <n>` | Parallel batch jobs (default: 2) |
| `--verbose` | Show progress |
| `--config <key>` | Save API key to config |

## Batch Processing

Create a file list:
```bash
cat > files.txt << 'EOF'
meeting_2024_01.m4a
meeting_2024_02.m4a
meeting_2024_03.m4a
EOF
```

Process all files:
```bash
./transcribe.mjs --batch files.txt --parallel 3 --verbose
./transcribe.mjs --batch files.txt --format srt --output-dir ./subtitles/
```

## Language Codes

Common codes: `en`, `de`, `fr`, `es`, `it`, `pt`, `nl`, `ja`, `ko`, `zh`

```bash
# German audio
./transcribe.mjs aufnahme.m4a --language de

# Auto-detect (usually accurate)
./transcribe.mjs unknown.mp3
```

## Translation

```bash
# Transcribe and translate to English
./transcribe.mjs german.m4a --translate
./transcribe.mjs japanese.mp3 --translate --format json
```

## Supported Formats

- **Audio:** m4a, mp3, wav, ogg, flac, webm
- **Video:** mp4, mpeg, mpga, oga
- **Max size:** 25MB per file

## Output Formats

### Text (default)
Plain text with punctuation and capitalization.

```
Hello, this is a test of the transcription system.
It handles multiple sentences and proper formatting.
```

### JSON
Full response with segments, timestamps, and metadata.

```json
{
  "text": "Hello world",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "Hello world"
    }
  ]
}
```

### SRT (SubRip Subtitle)
Standard subtitle format for video players.

```srt
1
00:00:00,000 --> 00:00:02,500
Hello world

2
00:00:02,500 --> 00:00:05,000
This is the second line
```

### VTT (WebVTT)
Web video text tracks format.

```vtt
WEBVTT

00:00:00.000 --> 00:00:02.500
Hello world

00:00:02.500 --> 00:00:05.000
This is the second line
```

## Examples

```bash
# Podcast to blog post
./transcribe.mjs podcast.mp3 --format text | ./cleanup.sh > blog-post.md

# Video subtitles
./transcribe.mjs video.mp4 --format srt > video.srt

# Batch interview processing
./transcribe.mjs --batch interviews.txt --format json --parallel 4

# Meeting notes with timestamps
./transcribe.mjs meeting.m4a --format json | jq '.segments[] | "\(.start): \(.text)"'
```

## Tips

- Use `--verbose` for progress on long files
- For files >25MB, split first: `ffmpeg -i big.mp3 -f segment -segment_time 600 part%03d.mp3`
- Turbo model is faster; large-v3 is more accurate
- JSON format gives word-level timing for precise editing

