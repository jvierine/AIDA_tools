from __future__ import annotations

from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image
from scipy.ndimage import median_filter
from scipy.signal import wiener


def typical_pre_proc_ops(pp_type: str = "none") -> dict:
    """Return a minimal Python equivalent of AIDA's preprocessing options.

    The Python subset only implements the `none` preset used by the example.
    The returned dictionary mirrors the MATLAB option names closely so the
    metadata and image-loading flow remains familiar.
    """
    ops = {
        "filetype": "",
        "quadfix": 0,
        "replaceborder": 0,
        "badpixfix": 0,
        "outimgsize": 0,
        "medianfilter": 0,
        "defaultccd6": 0,
        "bias_correction": 0,
        "fix_missalign": 0,
        "verb": 0,
        "interference_level": np.inf,
        "bzero_sign": 0,
        "try_to_be_smart_fnc": None,
        "log2obs": None,
        "read_data_fcn": None,
        "find_optpar": 0,
        "skip_dialogs": 1,
        "StarCalResDir": str(Path.cwd()),
    }
    if pp_type.lower() != "none":
        raise NotImplementedError("Only the 'none' preprocessing preset is implemented in Python.")
    return ops


def _to_grayscale_array(image: Image.Image) -> np.ndarray:
    """Convert an image to a floating-point grayscale array."""
    if image.mode not in ("L", "I", "F"):
        image = image.convert("L")
    return np.asarray(image, dtype=np.float64)


def inimg(filename: str | Path, prepro_ops: dict | None = None):
    """Read an image and optionally attach observation metadata.

    This is the Python subset analogue of MATLAB `inimg`. It keeps the scope
    intentionally small: use a custom reader if one is supplied, otherwise
    read with Pillow and convert to grayscale.
    """
    path = Path(filename)
    if prepro_ops and prepro_ops.get("read_data_fcn"):
        header, img = prepro_ops["read_data_fcn"](str(path))
        image = np.asarray(img, dtype=np.float64)
    else:
        image = _to_grayscale_array(Image.open(path))
        header = {"filename": str(path)}

    obs = {}
    if prepro_ops:
        if callable(prepro_ops.get("log2obs")):
            obs = prepro_ops["log2obs"](header)
        elif callable(prepro_ops.get("try_to_be_smart_fnc")):
            obs = prepro_ops["try_to_be_smart_fnc"](str(path))
    return image, header, obs


def smart_caxis(frac: float, data: np.ndarray) -> tuple[float, float]:
    """Return robust display limits based on image quantiles."""
    values = np.asarray(data, dtype=np.float64).ravel()
    values = values[np.isfinite(values)]
    if values.size == 0:
        return 0.0, 1.0
    low = np.quantile(values, frac / 2)
    high = np.quantile(values, 1.0 - frac / 2)
    if low == high:
        high = low + 1.0
    return float(low), float(high)


def enhance_stars(image: np.ndarray) -> np.ndarray:
    """Suppress slow-varying background and emphasize compact star-like peaks."""
    background = median_filter(image, size=9, mode="nearest")
    return wiener(image - background, (5, 5))


def stack_frames(paths: Iterable[str | Path], prepro_ops: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Read and stack a sequence of frames.

    Returns the last raw frame, the summed raw stack, and a filtered stack
    where each frame is background-reduced before accumulation.
    """
    paths = list(paths)
    if not paths:
        raise ValueError("No image paths supplied for stacking.")

    first, _, _ = inimg(paths[0], prepro_ops)
    raw_sum = np.zeros_like(first, dtype=np.float64)
    filtered_sum = np.zeros_like(first, dtype=np.float64)
    last = first

    for path in paths:
        last, _, _ = inimg(path, prepro_ops)
        raw_sum += last
        filtered_sum += enhance_stars(last)
    return last, raw_sum, filtered_sum
