# Character Audio

Character voice audio lives under:

```text
public/audio/characters/
```

Runtime URLs begin at the site root:

```text
/audio/characters/
```

## Folder Structure

Use one folder per character, then one folder per emotional state or event category:

```text
public/audio/characters/
  valentine/
    opening/
    clingy/
    jealous/
    wounded/
    spiraling/
    softened/
```

Opponent characters use the same pattern:

```text
public/audio/characters/
  startupGuy/
    ambient/
    scoreReaction/
```

## Naming Convention

- Audio files are MP3 files.
- Filenames are lowercase kebab-case.
- Filenames begin with the folder/category name.
- Keep a stable numeric sequence when adding alternates.

Example:

```text
clingy/clingy-001-dont-hit-me-yet.mp3
```

Runtime URL:

```text
/audio/characters/valentine/clingy/clingy-001-dont-hit-me-yet.mp3
```

## Registering Files

All character voice paths must be registered in:

```text
src/game/audio/characterAudioManifest.ts
```

Do not place audio file paths in scenes, systems, or dialogue code.

Each registered cue needs:

- `characterId`
- `characterKind` (`ball` or `opponent`)
- `category`
- `cueId`
- `path`

Optional fields include:

- `text`
- `emotionalState`
- `volume`
- `playbackRate`
- `priority`
- `cooldownMs`
- `interrupt`

## Adding a New Ball

1. Create folders under `public/audio/characters/<ballId>/`.
2. Add MP3 files using the naming convention.
3. Register cues in `characterAudioManifest.ts`.
4. Add `audioCueId` to any dialogue/opening/score entry that has an exact matching spoken line.

Example dialogue connection:

```ts
{
  id: 'valentine-clingy-1',
  ballLine: \"Don't hit me yet. Look at me first.\",
  audioCueId: 'clingy-001-dont-hit-me-yet',
}
```

## Adding a New Opponent

1. Create folders under `public/audio/characters/<opponentId>/`.
2. Add MP3 files for opponent categories such as `ambient` or `scoreReaction`.
3. Register cues in `characterAudioManifest.ts` using `characterKind: 'opponent'`.
4. Connect future opponent dialogue data with stable cue IDs before playback.

## Priorities and Cooldowns

Only one character voice line plays at a time.

Priority order:

1. `high` - hover/dialogue interaction and major scoring reactions
2. `medium` - opening lines and emotional-state reactions
3. `low` - ambient opponent chatter

Rules:

- Higher-priority dialogue may interrupt lower-priority dialogue.
- Ambient opponent chatter must not interrupt ball dialogue.
- Low-priority dialogue does not interrupt other low-priority dialogue.
- Cue-level `cooldownMs` prevents a line from firing too often.
- Immediate duplicate playback is blocked per character/category.

Gameplay sound effects are separate and may continue under character voice at restrained volume.
