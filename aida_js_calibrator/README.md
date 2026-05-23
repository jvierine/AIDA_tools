# AIDA Browser Star Calibration

This directory contains a browser-only AIDA star calibration tool. It is used to
align catalog stars with all-sky images, manually pair stars, fit the AIDA lens
model, inspect residuals, and export the calibrated optical parameters.

Open `index.html` directly in a browser. No local web server is needed.

## What It Does

- Loads PNG, JPEG, HEIC, and HEIF images.
- Loads a bundled allsky7 example image automatically on startup.
- Reads UTC time and observer position from EXIF metadata when available.
- Falls back to known allsky7 filename/station metadata when possible.
- Uses the embedded bright-star catalog and AIDA camera projection code.
- Supports `optmod 2` and `optmod 3`; the selected optical model is the one
  used by the fit.
- Lets the user manually pick image stars with a 40x interpolated density
  estimate and pair them with catalog stars.
- Fits all eight `optpar` values: `f1`, `f2`, `alpha`, `beta`, `gamma`, `du`,
  `dv`, and radial `alpha`.
- Exports the fitted `optpar` as a Python array or a Python image-to-az/el
  helper function.
- Provides residual inspection, including 20x exaggerated on-image residual
  vectors so subpixel offsets are visible.
- Includes pure image and pure Stellarium views for visual checking.
- Includes an optional generated ambient audio mode with subtle interaction
  feedback.

## Basic Workflow

1. Open `index.html` in a browser.
2. Load an image, or use the bundled default image.
3. Check UTC time, latitude, longitude, and altitude.
4. Select the optical model to fit, `optmod 2` or `optmod 3`.
5. Roughly align the star field:
   - left-drag to move the zenith point,
   - right-drag to rotate the field,
   - mouse wheel to scale `f1` and `f2` together.
6. Hold `S` and click an image star. The local star position is refined with
   the interpolated density estimate.
7. Release `S`, then click the matching red catalog star.
8. Repeat until several well-spread star pairs are available.
9. Press `F` for robust randomized Nelder-Mead, or `G` for
   Levenberg-Marquardt.
10. Press `R` to inspect residuals and remove bad pairs if needed.
11. Export the fitted model with the copy buttons.

## Views And Controls

- `C`: toggle star pairing view and Stellarium-style catalog view.
- `X`: alternate pure image view and pure Stellarium view. Labels and pairings
  are hidden, but the az/el grid remains visible if enabled.
- `N`: show or hide star names in the current view.
- `K`: show only the picked KDE subpixel star positions.
- `R`: show or hide residual view.
- `D` + click: delete the nearest matched star pair.
- `M` + click: mask a local image region.
- `Z`: show the zoom/magnifier view.
- `Cmd/Ctrl Z`: undo the most recent accepted fit.
- `Esc`: cancel the current interaction or close the density popup.

The star finder implementation is still present in the codebase, but the GUI is
currently centered on manual KDE-based star picking rather than automatic
detections.

## Image Display

The image is high-pass filtered by default with a 100 px Gaussian background
estimate. Brightness and contrast are applied after high-pass filtering. The
default brightness is slightly raised so background noise and weak stars remain
visible.

## Coordinates And Camera Models

The browser uses true 0-based image pixel coordinates. The AIDA/MATLAB optical
model values are converted from MATLAB's 1-based pixel convention inside
`js/aidatools.js`.

The browser camera model is tested against the Python and MATLAB reference
implementations for `optmod 2` and `optmod 3`.

## Test Data

The generated PNG copies live in `calibration_images/`. The source HDF5/MATLAB
references remain under the local `allsky7 -> ../python/examples/allsky7`
symlink when present.

The file `2025_02_19_03_44_00_000_010760_first1s.png` is intentionally excluded
from the browser test cases because its image/star alignment is inconsistent
with the other calibration frames.

Regenerate the bundled calibration cases with:

```bash
python tools/generate_calibration_cases.py
```

## Tests

Run the JavaScript unit tests with:

```bash
npm test
```

The camera-model cross-check starts Python and imports `aida_tools_py`. Set
`PYTHON=/path/to/python` if the default `/opt/miniconda3/bin/python` is not the
right environment.
