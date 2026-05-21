# AIDA browser star calibration prototype

This is a first browser-only prototype for interactively aligning AIDA-style
star overlays on allsky images. It uses a minimal JavaScript port of the
`python/aida_tools_py` catalog, sidereal-time, and camera projection code.

Open `index.html` directly in a browser, or serve this directory with:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

The prototype:

- loads a PNG/JPEG image selected by the user,
- guesses the UTC timestamp from allsky7-style file names,
- projects an embedded Yale bright-star subset onto the image,
- uses WebGL for image and star rendering,
- lets the user drag the star overlay with the mouse,
- finds compact star-like peaks with a DAOStarFinder-style local maximum and
  subpixel centroid pass, then greedily matches projected catalog stars to
  nearby detections while the lens model is adjusted,
- provides limiting magnitude, X/Y flip, site latitude/longitude/altitude, and
  basic AIDA optical model controls.
- includes bundled allsky7/Falcon9 lens-model test cases generated from
  `../allsky7/*_first1s.h5` and the corresponding `ams*.mat` azimuth/zenith
  grids.

The browser uses true 0-based image pixel coordinates. The AIDA/Matlab optical
model values are converted from Matlab's 1-based pixel convention inside
`js/aidatools.js`.

For bundled test cases, the HDF5 `optpar[0]` and `optpar[1]` values are the
actual AIDA focal parameters. The UI's focal control is a multiplier relative
to those calibrated values, so `1.0` means "use the file's focal parameters
unchanged", not "unit focal length".

The known-model selector applies the calibration parameters only. The image
itself is normally selected with the `Load image` button; if the selected image
filename matches a bundled allsky7 case, its known lens model, site, and UTC
timestamp are applied automatically. The generated PNG copies live in
`calibration_images/`, while the HDF5/Matlab references remain under the local
`allsky7 -> ../allsky7` symlink.

The `2025_02_19_03_44_00_000_010760_first1s.png` frame is intentionally
excluded from the browser test cases because its image/star alignment is
inconsistent with the other calibration frames.

Regenerate the bundled calibration cases with:

```bash
python tools/generate_calibration_cases.py
```

This is intentionally not a full calibration solver yet. It is the front-end
scaffold for manual alignment and later matching/refinement against detected
star centroids.

Keyboard helpers:

- hold `s` and click to manually pair an image star with a catalog star,
- hold `p` and click to inspect image/model pixel coordinates,
- hold `d` and click to delete an automatically detected star from proximity
  matching.
