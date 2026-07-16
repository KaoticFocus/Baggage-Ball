# Character audio (deprecated)

Prerecorded character dialogue is **no longer used**.

All spoken lines are generated at runtime:

1. OpenAI produces dialogue text (where applicable)
2. `VoiceDirector` queues and plays speech
3. Netlify `character-speech` synthesizes audio via ElevenLabs

Do not add MP3/WAV/OGG dialogue clips under this tree for production speech.
Music and gameplay SFX live elsewhere and are unrelated.
