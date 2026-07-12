# Midlife Dave Character Audio

Voice-line audio for the **Midlife Dave** ball, organized by emotional state.

## Folder structure

Each subfolder corresponds to one emotional state:

- `confident/`
- `self-deprecating/`
- `bitter/`
- `exhausted/`
- `resigned/`
- `panicked/`

## File conventions

- **Format:** MP3 (`.mp3`).
- **Filenames use lowercase kebab-case** (words separated by hyphens, no spaces or capitals).
- **Filenames begin with the folder (emotional-state) name.**

### Example

```
confident/confident-001-smartwatch-problem-solved.mp3
```

## Runtime URLs

Files in `public/` are served from the site root. Runtime URL base:

```
/audio/characters/midlife-dave/
```

For example, the file above is loaded at:

```
/audio/characters/midlife-dave/confident/confident-001-smartwatch-problem-solved.mp3
```

## Character ID in code

```
midlifeDave
```
