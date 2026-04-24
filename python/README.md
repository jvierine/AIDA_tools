# Python Subset

This directory contains a small Python subset of `AIDA_tools` aimed at the
camera-calibration example workflow. It does not replace the full MATLAB
toolbox. Instead, it mirrors the minimum pieces needed to:

- read image sequences
- attach observation metadata
- enhance stars by stacking frames
- load the bundled bright-star catalog
- run a lightweight automatic star calibration
- export per-pixel azimuth and zenith angles

The implementation is intentionally narrow in scope. It is designed for the
example workflow and for reasonably well-behaved star images with a decent
initial pointing guess. The full MATLAB toolbox remains the reference
implementation for broader AIDA functionality.

## Included Modules

- `aida_tools_py.preprocess`: image loading and simple preprocessing
- `aida_tools_py.obs`: `anything2obs`-style observation metadata
- `aida_tools_py.catalog`: loader for the bundled `ybs.new` bright-star catalog
- `aida_tools_py.astro`: local sidereal time and RA/Dec to azimuth/zenith
- `aida_tools_py.camera`: camera model, inverse projection, and initial guesses
- `aida_tools_py.calibration`: lightweight automatic calibration and az/ze export

## Dependencies

- `numpy`
- `scipy`
- `matplotlib`
- `Pillow`

## Example

See `examples/aida_starcal_example.py`.

The bundled example image and metadata correspond to:

- `example_image.png`
- longitude `8.1651`
- latitude `53.1529`
- UTC time `2025-02-19 03:44:00`

From the repository root, the example can be run as:

```bash
python3 python/examples/aida_starcal_example.py
```
