# AIDA_tools

`AIDA_tools` is a MATLAB toolbox for auroral and night-sky image analysis. It includes camera and geometry utilities, star-based calibration tools, image preprocessing, skymap support, tomography utilities, spectral calibration, and related analysis helpers.

Painstakingly written over the course of 28+ years, starting in 1998 and mostly by Bjorn Gustavsson, 
who has spent more time thinking about geometric calibration than he probably should have.
It provides scientific-grade geometric camera calibration together with a broad set of supporting analysis tools.

This repository is a git-based copy of the toolbox with the most common temporary editor files excluded.

## What Is Included

- Camera calibration and image handling tools
- `starcal` for geometric calibration using stars
- Preprocessing through `inimg` and `typical_pre_proc_ops`
- Skymap and star ephemeris support
- Aurora, tomography, inversion, and spectral calibration modules
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
- Additional HTML documentation is available under `Documentation/`, `Html-docs/`, and related folders in the repository.

## Typical First Session

```matlab
cd('/path/to/AIDA_tools')
AIDA_startup
edit Examples/AIDA_starcal_example.m
```

Run the example section by section, replace the example image path with your own data, and then launch `starcal` on a representative frame.

## Copyright

Copyright (c) 1998-present, primarily Bjorn Gustavsson and contributors.
