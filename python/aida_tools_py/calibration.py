from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.ndimage import maximum_filter
from scipy.optimize import minimize

from .camera import camera_model, guess_alis_optpar, inv_project_directions
from .catalog import visible_stars
from .preprocess import inimg


@dataclass
class StarCalibrationResult:
    """Container for the results of the lightweight Python star calibration."""
    image_path: str
    img: np.ndarray
    obs: dict
    optpar: np.ndarray
    optmod: int
    detected_peaks: np.ndarray
    catalog_stars: dict
    matched_catalog_indices: np.ndarray
    matched_peak_indices: np.ndarray
    projected_xy: np.ndarray


def project_visible_stars(
    image: np.ndarray,
    obs: dict,
    optpar: np.ndarray,
    optmod: int = 3,
    max_magnitude: float = 6.5,
) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """Project visible catalog stars into image coordinates for a given optics guess."""
    stars = visible_stars(obs, max_magnitude=max_magnitude)
    u, v = camera_model(stars["az"], stars["ze"], optpar, optmod, image.shape)
    inside = (u >= 0) & (u < image.shape[1]) & (v >= 0) & (v < image.shape[0])
    projected = np.column_stack((u[inside], v[inside]))
    filtered_stars = {key: value[inside] for key, value in stars.items()}
    return filtered_stars, projected


def detect_stars(image: np.ndarray, max_peaks: int = 200, threshold_sigma: float = 5.0) -> np.ndarray:
    """Detect bright, compact star-like peaks with a simple local-maximum test."""
    work = np.asarray(image, dtype=float)
    med = np.median(work)
    mad = np.median(np.abs(work - med)) + 1e-12
    threshold = med + threshold_sigma * 1.4826 * mad
    local_max = work == maximum_filter(work, size=9, mode="nearest")
    mask = local_max & (work > threshold)
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        return np.empty((0, 3), dtype=float)
    values = work[ys, xs]
    order = np.argsort(values)[::-1][:max_peaks]
    return np.column_stack((xs[order], ys[order], values[order]))


def _build_optpar(x: np.ndarray) -> np.ndarray:
    """Map optimizer parameters back into the AIDA optics parameter vector."""
    f, r1, r2, r3, du, dv, alpha = x
    return np.array([-abs(f), abs(f), r1, r2, r3, du, dv, alpha], dtype=float)


def _match_catalog_to_peaks(projected_xy: np.ndarray, peaks: np.ndarray, radius_px: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Greedily match projected catalog stars to detected peaks within a radius."""
    if projected_xy.size == 0 or peaks.size == 0:
        empty = np.empty(0, dtype=int)
        return empty, empty, np.empty(0, dtype=float)

    pairs = []
    peak_xy = peaks[:, :2]
    for i, xy in enumerate(projected_xy):
        d2 = np.sum((peak_xy - xy[None, :]) ** 2, axis=1)
        j = int(np.argmin(d2))
        d = float(np.sqrt(d2[j]))
        if d <= radius_px:
            pairs.append((d, i, j))
    if not pairs:
        empty = np.empty(0, dtype=int)
        return empty, empty, np.empty(0, dtype=float)

    pairs.sort(key=lambda item: item[0])
    used_catalog = set()
    used_peaks = set()
    cat_idx = []
    peak_idx = []
    dist = []
    for d, i, j in pairs:
        if i in used_catalog or j in used_peaks:
            continue
        used_catalog.add(i)
        used_peaks.add(j)
        cat_idx.append(i)
        peak_idx.append(j)
        dist.append(d)
    return np.asarray(cat_idx, dtype=int), np.asarray(peak_idx, dtype=int), np.asarray(dist, dtype=float)


def _objective(x: np.ndarray, stars: dict, peaks: np.ndarray, image_shape: tuple[int, int], radius_px: float) -> float:
    """Objective used for the lightweight automatic star calibration."""
    optpar = _build_optpar(x)
    u, v = camera_model(stars["az"], stars["ze"], optpar, 3, image_shape)
    inside = (u >= 0) & (u < image_shape[1]) & (v >= 0) & (v < image_shape[0])
    if inside.sum() < 6:
        return 1e9
    projected = np.column_stack((u[inside], v[inside]))
    _, _, dist = _match_catalog_to_peaks(projected, peaks, radius_px=radius_px)
    if dist.size < 6:
        return 1e8 + (6 - dist.size) * 1e6
    return float(np.mean(dist**2) + 500.0 / dist.size)


def _manual_objective(
    x: np.ndarray,
    stars: dict,
    manual_catalog_indices: np.ndarray,
    manual_image_points: np.ndarray,
    image_shape: tuple[int, int],
    x0: np.ndarray,
) -> float:
    """Objective for refinement from user-supplied star/image correspondences."""
    optpar = _build_optpar(x)
    u, v = camera_model(stars["az"][manual_catalog_indices], stars["ze"][manual_catalog_indices], optpar, 3, image_shape)
    residual = np.mean((u - manual_image_points[:, 0]) ** 2 + (v - manual_image_points[:, 1]) ** 2)
    regularization = 0.01 * np.mean((x - x0) ** 2)
    return float(residual + regularization)


def _finalize_result(
    image_path: str | Path,
    work_img: np.ndarray,
    obs: dict,
    optpar: np.ndarray,
    peaks: np.ndarray,
    stars: dict,
) -> StarCalibrationResult:
    """Rebuild the projected catalog and auto-matched peaks for the current optics."""
    u, v = camera_model(stars["az"], stars["ze"], optpar, 3, work_img.shape)
    inside = (u >= 0) & (u < work_img.shape[1]) & (v >= 0) & (v < work_img.shape[0])
    projected = np.column_stack((u[inside], v[inside]))
    cat_idx, peak_idx, _ = _match_catalog_to_peaks(projected, peaks, radius_px=35.0)
    filtered_stars = {key: value[inside] for key, value in stars.items()}
    return StarCalibrationResult(
        image_path=str(image_path),
        img=work_img,
        obs=obs,
        optpar=optpar,
        optmod=3,
        detected_peaks=peaks,
        catalog_stars=filtered_stars,
        matched_catalog_indices=cat_idx,
        matched_peak_indices=peak_idx,
        projected_xy=projected,
    )


def starcal(filename: str | Path, preproc_ops: dict, calibration_image: np.ndarray | None = None, max_magnitude: float = 6.5) -> StarCalibrationResult:
    """Run a lightweight, non-interactive star calibration.

    This mirrors the example workflow rather than the full MATLAB GUI.
    The function uses a simple peak detector and a Nelder-Mead fit against
    projected catalog stars from the bundled Yale bright-star subset.
    """
    img, _, obs = inimg(filename, preproc_ops)
    if not obs:
        raise ValueError("No observation metadata supplied. Set try_to_be_smart_fnc in the preprocessing options.")

    work_img = np.asarray(calibration_image if calibration_image is not None else img, dtype=float)
    peaks = detect_stars(work_img)
    if peaks.shape[0] < 6:
        raise RuntimeError("Too few star-like peaks detected for calibration.")

    stars = visible_stars(obs, max_magnitude=max_magnitude)
    init = np.asarray(obs.get("optpar", guess_alis_optpar(obs)), dtype=float)
    x0 = np.array([abs(init[0]), init[2], init[3], init[4], init[5], init[6], init[7]], dtype=float)

    # Fit a compact set of optics parameters around the AIDA optmod=3 camera
    # model. The initial guess comes from the same style of metadata-driven
    # pointing assumption as the MATLAB tools.
    res = minimize(
        _objective,
        x0,
        args=(stars, peaks, work_img.shape, 60.0),
        method="Nelder-Mead",
        options={"maxiter": 500, "xatol": 1e-4, "fatol": 1e-3},
    )
    optpar = _build_optpar(res.x)
    return _finalize_result(filename, work_img, obs, optpar, peaks, stars)


def refine_manual_matches(
    result: StarCalibrationResult,
    manual_catalog_indices: np.ndarray,
    manual_image_points: np.ndarray,
) -> StarCalibrationResult:
    """Refine an existing calibration from manually supplied star/image matches."""
    manual_catalog_indices = np.asarray(manual_catalog_indices, dtype=int)
    manual_image_points = np.asarray(manual_image_points, dtype=float)
    if manual_catalog_indices.size < 3:
        raise ValueError("At least three manual star matches are needed for refinement.")
    if manual_catalog_indices.size != manual_image_points.shape[0]:
        raise ValueError("Manual catalog indices and image points must have matching lengths.")

    stars = result.catalog_stars
    x0 = np.array(
        [
            abs(result.optpar[0]),
            result.optpar[2],
            result.optpar[3],
            result.optpar[4],
            result.optpar[5],
            result.optpar[6],
            result.optpar[7],
        ],
        dtype=float,
    )
    res = minimize(
        _manual_objective,
        x0,
        args=(stars, manual_catalog_indices, manual_image_points, result.img.shape, x0),
        method="Nelder-Mead",
        options={"maxiter": 500, "xatol": 1e-4, "fatol": 1e-3},
    )
    optpar = _build_optpar(res.x)
    return _finalize_result(result.image_path, result.img, result.obs, optpar, result.detected_peaks, stars)


def reproject_calibration(
    result: StarCalibrationResult,
    optpar: np.ndarray,
    max_magnitude: float | None = None,
) -> StarCalibrationResult:
    """Rebuild a calibration result after a manual optics adjustment."""
    stars = result.catalog_stars if max_magnitude is None else visible_stars(result.obs, max_magnitude=max_magnitude)
    return _finalize_result(result.image_path, result.img, result.obs, np.asarray(optpar, dtype=float), result.detected_peaks, stars)


def save_azze_npz(result: StarCalibrationResult, output_path: str | Path) -> Path:
    """Save per-pixel azimuth and zenith grids to a NumPy `.npz` file."""
    output_path = Path(output_path)
    u, v = np.meshgrid(np.arange(1, result.img.shape[1] + 1), np.arange(1, result.img.shape[0] + 1))
    az, ze = inv_project_directions(u.ravel(), v.ravel(), result.img, result.optmod, result.optpar)
    np.savez(output_path, az=az.reshape(result.img.shape), ze=ze.reshape(result.img.shape), obs=result.obs)
    return output_path


def save_azze_csv(result: StarCalibrationResult, output_path: str | Path) -> Path:
    """Save per-pixel azimuth, zenith, and elevation to a CSV table."""
    output_path = Path(output_path)
    u, v = np.meshgrid(np.arange(1, result.img.shape[1] + 1), np.arange(1, result.img.shape[0] + 1))
    az, ze = inv_project_directions(u.ravel(), v.ravel(), result.img, result.optmod, result.optpar)
    elevation = np.pi / 2.0 - ze
    table = np.column_stack((u.ravel(), v.ravel(), np.degrees(az), np.degrees(ze), np.degrees(elevation)))
    header = "x_pixel,y_pixel,az_deg,ze_deg,el_deg"
    np.savetxt(output_path, table, delimiter=",", header=header, comments="")
    return output_path
