Star/no-star crop training data for the AIDA calibrator.

Directory layout:

```text
star_training/
  yes/       crops that contain a usable star
  no/        crops that do not contain a star
  unsure/    ambiguous, saturated, clouded, blended, or otherwise questionable crops
```

Generate initial crops from the known-lens test cases:

```sh
cd /Users/j/src/AIDA_tools/aida_js_calibrator
npm run build:star-training -- --reset
```

Useful filters:

```sh
npm run build:star-training -- 010095 --reset
npm run build:star-training -- IMG-9953 --yes 40 --no 80 --random-no 20
```

Quickly check known lens models by drawing red catalogue star circles and
yellow detector crosshairs over the source images:

```sh
npm run build:star-training -- --overlay-only 010095
npm run build:star-training -- --overlay-only IMG-9953
```

Overlay images are written to `star_training/overlays/` by default. Use
`--overlay-dir <path>` to write them elsewhere.

Launch the browser reviewer:

```sh
cd /Users/j/src/AIDA_tools/aida_js_calibrator
npm run review:stars
```

Then open `http://127.0.0.1:8787/`.

Useful keys:

- `Y` or `G`: move current crop to `yes`
- `N` or `B`: move current crop to `no`
- `U`: move current crop to `unsure`
- left/right arrows: previous/next crop

Relabeling moves the image file between label directories and appends a JSONL
event to `star_training/review_manifest.jsonl`.
