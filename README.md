# AIDA_tools

Copyright (c) 1998-present, painstakingly written over the course of 28+ years, starting in 1998 and mostly by Björn Gustavsson, 
who has spent more time thinking about geometric calibration than he probably should have.

`AIDA_tools` is a MATLAB toolbox for auroral and night-sky image analysis. It includes scientific-grade camera calibration, skymap/ephemeris support, image preprocessing, image mapping and projection tools, stereoscopic triangulation, tomography, spectral calibration,  Pulkovo spectrophotometric catalogue, FITS and other image I/O helpers, ALIS and ASK analysis utilities, WGS-84/EARTH helpers, and related geometry/inversion tools. 

## What Is Included

- Camera calibration and image handling tools
- `starcal` for geometric calibration using stars
- Scientific-grade per-pixel line-of-sight geometry
- Preprocessing through `inimg` and `typical_pre_proc_ops`
- Skymap and star ephemeris support
- Image mapping, reprojection, and camera model tools
- Stereoscopic triangulation and multi-view tomography
- Aurora analysis utilities, inversion helpers, and spectral calibration modules
- Access to stellar spectra from the Pulkovo spectrophotometric catalogue
- ALIS and ASK instrument-specific functions, browsers, and helpers
- EARTH/WGS-84 geodesy and assorted geometry/toolbox utilities
- Example scripts and bundled example data

## Getting Started

### 1. Clone the repository

```bash
git clone git@github.com:jvierine/AIDA_tools.git
cd AIDA_tools
```

### 2. Start MATLAB and add AIDA_tools to the path

From inside MATLAB:

```matlab
cd('/path/to/AIDA_tools')
AIDA_startup
```

`AIDA_startup.m` discovers the toolbox root from its own location and adds the relevant AIDA directories to the MATLAB path.

### 3. Check that the toolbox is available

```matlab
which AIDA_startup
which starcal
which inimg
```

If these resolve to files inside your `AIDA_tools` checkout, the setup is ready.

## Basic Usage Example

Although AIDA_tools includes tomography, triangulation, image mapping, skymap/ephemeris, auroral analysis, and spectrophotometric catalogue functionality, a typical user will most likely want to start with camera calibration. For that reason, this README shows only a `starcal` example.

The easiest place to start is `Examples/AIDA_starcal_example.m`, which demonstrates a basic star-calibration workflow:

1. Run `AIDA_startup` to add the toolbox to the MATLAB path.
2. Point `dir(...)` at a folder containing your images.
3. Build preprocessing settings with `typical_pre_proc_ops('none')`.
4. Read a frame with `inimg(...)`.
5. Inspect or stack frames to make stars easier to see.
6. Provide camera location and observation time if the metadata is not embedded in the files.
7. Run `starcal(...)` on one representative frame.

A short version of that workflow looks like this:

```matlab
cd('/path/to/AIDA_tools')
AIDA_startup

d = dir('/path/to/your/images/*.png');
assert(~isempty(d), 'No images found.')

PO = typical_pre_proc_ops('none');

long_lat = [20.363427507427865, 69.34818425381995];
t_obs    = [2020, 12, 13, 02, 19, 37.5];

PO.try_to_be_smart_fnc = @(filename) anything2obs(filename,...
                                                  0,...
                                                  'xyz', [0,0,0],...
                                                  'longlat', long_lat,...
                                                  'station', 10,...
                                                  'time', t_obs,...
                                                  'filter', nan,...
                                                  'dt', 0);

fname = fullfile(d(1).folder, d(1).name);
[img, ~, obs] = inimg(fname, PO); %#ok<ASGLU>

figure
imagesc(img)
axis image
colormap(bone)
colorbar

SkMp = starcal(fname, PO);
```

## Export Pixel Azimuth And Elevation

One of the main reasons to run `starcal` is to obtain the line-of-sight
geometry for every camera pixel. The documentation in `Documentation/starcal.html`
and the built-in helper `Starcal/save_azze.m` both point to the same workflow:
first calibrate the camera, then convert every pixel to azimuth/zenith.

If you just want the built-in MATLAB save file with per-pixel azimuth and zenith:

```matlab
SkMp = starcal(fname, PO);
save_azze(SkMp)
```

That writes a `.mat` file containing `az`, `ze`, and `obs`.

To read that `.mat` az/ze file in Python:

```python
from pathlib import Path

import numpy as np
from scipy.io import loadmat

mat = loadmat(Path("your-calibration-azze.mat"))

az = mat["az"]              # radians, same shape as the image
ze = mat["ze"]              # radians, same shape as the image
elevation = np.pi / 2 - ze  # radians

az_deg = np.degrees(az)
ze_deg = np.degrees(ze)
el_deg = np.degrees(elevation)

print(az.shape, ze.shape)
print(az_deg[0, 0], el_deg[0, 0])
```

## How To Adapt The Example

- Replace the image directory in `dir(...)` with your own data location.
- If your files already contain usable metadata, you may not need `try_to_be_smart_fnc`.
- If your camera system has established preprocessing settings, swap `'none'` for a more specific preset in `typical_pre_proc_ops`.
- For weak star fields, stack several nearby frames before inspecting the result.

## Important Notes

- Some data files in `.data/` are large. Two `.DEM` files are above GitHub's recommended 50 MB size, although still below the hard 100 MB limit.
- Legacy Subversion metadata directories are intentionally excluded from git.
- Editor backup files such as `*~`, `~*`, and `#*` are ignored.

## More Documentation

- Older installation notes remain in `README`.
- The human-written HTML documentation lives in [`Documentation/`](Documentation/), with a main entry point at [`Documentation/index.html`](Documentation/index.html).
- Generated source-code documentation is available under [`Html-docs/`](Html-docs/).
- The `Documentation/` directory also contains short introductions to camera models, Starcal, Skymap, EARTH utilities, and stereo/triangulation workflows.
- For deeper guidance on how to use the broader AIDA_tools package, read the material in `Documentation/` and talk to Björn.

## Typical First Session

```matlab
cd('/path/to/AIDA_tools')
AIDA_startup
edit Examples/AIDA_starcal_example.m
```

Run the example section by section, replace the example image path with your own data, and then launch `starcal` on a representative frame.
