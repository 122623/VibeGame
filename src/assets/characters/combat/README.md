# Combat Character Assets

These PNG files are original assets generated through the local Vibe Compiler image workflow and normalized for Phaser. They do not contain copied third-party game art.

## Files

- `berserker.png`
- `berserker-blood-slash.png` (`8 x 128x128` horizontal animation sheet)
- `berserker-basic-attack.png` (`6 x 128x128` horizontal animation sheet)
- `weapon-master.png`
- `soul-bender.png`
- `ghostblade.png`
- `asura.png`
- `mechanical-bull.png`

The five careers use `128x128` transparent canvases. The boss uses a `192x192` transparent canvas. All sprites are bottom-center aligned so the authoritative world position remains the character's foot position.

`berserker-blood-slash.png` is a 470 ms, eight-frame pilot animation. Its fourth frame is the visual impact pose. The strip uses the shipped `berserker.png` as frame 01 and preserves the same bottom-center anchor across every frame.

`berserker-basic-attack.png` is a 300 ms, six-frame sword attack. Its third frame is the visual impact pose. Skills may interrupt this clip, while basic attacks cannot override an active skill animation.

## Source And Normalization

The generated chroma-key sources are stored under `output/imagegen/raw/`:

- `berserker-raw.png`
- `weapon-master-raw.png`
- `soul-bender-raw.png`
- `ghostblade-raw.png`
- `asura-raw.png`
- `mechanical-bull-raw.png`

The blood-slash edit canvas, generated source, chroma-key intermediate, normalized frames, and preview are stored under `output/imagegen/animation/`.

The keyed intermediates and normalized frames are stored under
`output/imagegen/keyed/` and `output/imagegen/normalized/`. The source prompts
are recorded in `output/imagegen/prompts.jsonl`.

Normalize an individual career frame with:

```powershell
python <game-studio>/scripts/normalize_sprite_strip.py `
  --input ./output/imagegen/keyed/berserker-keyed.png `
  --out-dir ./output/imagegen/normalized/berserker `
  --frames 1 `
  --frame-size 128
```

The normalizer applies a shared fit and aligns each visible subject to the
bottom-center anchor. Chroma-key removal is performed first with the ImageGen
`remove_chroma_key.py` helper using border sampling and despill.
