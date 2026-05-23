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
  `allsky7/*_first1s.h5` and the corresponding `ams*.mat` azimuth/zenith
  grids.

The browser uses true 0-based image pixel coordinates. The AIDA/Matlab optical
model values are converted from Matlab's 1-based pixel convention inside
`js/aidatools.js`.

The generated PNG copies live in `calibration_images/`, while the HDF5/Matlab
references remain under the local `allsky7 -> ../python/examples/allsky7`
symlink. These generated cases are used for development and tests; the web GUI
does not load known lens models automatically.

The `2025_02_19_03_44_00_000_010760_first1s.png` frame is intentionally
excluded from the browser test cases because its image/star alignment is
inconsistent with the other calibration frames.

Regenerate the bundled calibration cases with:

```bash
python tools/generate_calibration_cases.py
```

Run the JavaScript unit tests with:

```bash
npm test
```

The camera-model cross-check starts Python and imports `aida_tools_py`; set
`PYTHON=/path/to/python` if the default `/opt/miniconda3/bin/python` is not the
right environment.

This is intentionally not a full calibration solver yet. It is the front-end
scaffold for manual alignment and later matching/refinement against detected
star centroids.

Keyboard helpers:

- hold `s` and click to manually pair an image star with a catalog star,
- press `f` to fit all eight `optpar` values with randomized Nelder-Mead
  multi-start least squares,
- press `g` to fit all eight `optpar` values with a finite-difference
  Levenberg-Marquardt least-squares solver,
- hold `d` and click to delete an automatically detected star from proximity
  matching.
