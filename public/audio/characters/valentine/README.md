# Valentine Character Audio

Voice-line audio for the **Valentine** ball, organized by emotional state.

## Folder structure

Each subfolder corresponds to one emotional state:

- `opening/`
- `clingy/`
- `jealous/`
- `wounded/`
- `spiraling/`
- `softened/`

## File conventions

- **Format:** MP3 (`.mp3`).
- **Filenames begin with the folder (emotional-state) name.**
- **Filenames use lowercase kebab-case** (words separated by hyphens, no spaces or capitals).

### Example

```
clingy/clingy-001-dont-hit-me-yet.mp3
```

## Runtime URLs

Files in `public/` are served from the site root, so runtime URLs begin with:

```
/audio/characters/valentine/
```

For example, the file above is loaded at:

```
/audio/characters/valentine/clingy/clingy-001-dont-hit-me-yet.mp3
```
