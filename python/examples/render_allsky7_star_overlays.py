from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import sys

import h5py
import matplotlib
import scipy.io
from astropy.stats import sigma_clipped_stats
from scipy.ndimage import gaussian_filter, maximum_filter

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Circle
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve()
EXAMPLES_DIR = HERE.parent
PYTHON_DIR = HERE.parents[1]
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from aida_tools_py.calibration import project_visible_stars
from aida_tools_py.camera import inv_project_directions
from aida_tools_py.obs import anything2obs

DISPLAY_OFFSET_XY = np.array([0.0, 0.0], dtype=float)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Overlay MATLAB-calibrated AIDA star positions on allsky7 PNG images.")
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=EXAMPLES_DIR / "allsky7",
        help="Directory containing matching .png and .h5 files.",
    )
    parser.add_argument(
        "--max-magnitude",
        type=float,
        default=3.0,
        help="Only overlay stars brighter than this limiting magnitude.",
    )
    parser.add_argument(
        "--output-suffix",
        default="_stars_overlay.png",
        help="Suffix appended to the file stem for rendered overlays.",
    )
    parser.add_argument(
        "--offset-suffix",
        default="_calibration_offsets.png",
        help="Suffix appended to the file stem for calibration offset scatter plots.",
    )
    parser.add_argument(
        "--calibration-dir",
        type=Path,
        default=Path("/home/j/src/falcon9"),
        help="Directory containing the MATLAB calibration .mat files named in the HDF5 attributes.",
    )
    parser.add_argument(
        "--highpass-sigma",
        type=float,
        default=12.0,
        help="Gaussian sigma in pixels for the display high-pass filter. Set <= 0 to disable.",
    )
    parser.add_argument(
        "--detect-threshold-sigma",
        type=float,
        default=5.0,
        help="Detection threshold in sigma above the background for DAO-style centroid finding.",
    )
    parser.add_argument(
        "--centroid-window",
        type=int,
        default=7,
        help="Odd-sized centroiding window in pixels around each detected star candidate.",
    )
    parser.add_argument(
        "--match-radius",
        type=float,
        default=12.0,
        help="Maximum pixel distance between predicted and detected stars for offset matching.",
    )
    return parser.parse_args()


def parse_utc_from_stem(stem: str) -> list[float]:
    parts = stem.split("_")
    if len(parts) < 6:
        raise ValueError(f"Cannot parse UTC timestamp from '{stem}'.")
    return [
        int(parts[0]),
        int(parts[1]),
        int(parts[2]),
        int(parts[3]),
        int(parts[4]),
        float(parts[5]),
    ]


def format_utc_label(t_obs: list[float]) -> str:
    year, month, day, hour, minute, second = t_obs
    whole_second = int(second)
    fractional = second - whole_second
    microsecond = int(round(fractional * 1_000_000))
    timestamp = datetime(
        int(year),
        int(month),
        int(day),
        int(hour),
        int(minute),
        whole_second,
        microsecond,
        tzinfo=timezone.utc,
    )
    return timestamp.strftime("%Y-%m-%d %H:%M:%S.%f UTC").rstrip("0").rstrip(".")


def build_obs(png_path: Path, lon_deg: float, lat_deg: float, optpar: np.ndarray) -> dict:
    t_obs = parse_utc_from_stem(png_path.stem)
    obs = anything2obs(
        str(png_path),
        0,
        xyz=[0.0, 0.0, 0.0],
        longlat=[lon_deg, lat_deg],
        station=0,
        time=t_obs,
        filter=np.nan,
        dt=0.0,
    )
    obs["optpar"] = np.asarray(optpar, dtype=float)
    return obs


def wrap_angle_difference(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Return the smallest signed difference between two azimuth arrays."""
    return np.angle(np.exp(1j * (a - b)))


def load_mat_calibration(calibration_dir: Path, calibration_name: str | None) -> dict | None:
    """Load the MATLAB calibration file referenced by the HDF5 metadata, if available."""
    if not calibration_name:
        return None
    mat_path = calibration_dir / calibration_name
    if not mat_path.exists():
        return None
    return scipy.io.loadmat(mat_path, simplify_cells=True)


def choose_optmod(image: np.ndarray, optpar: np.ndarray, mat_calibration: dict | None) -> tuple[int, str]:
    """Pick the optical model that best reproduces the MATLAB az/ze calibration grid."""
    if not mat_calibration:
        return 2, "default optmod=2 (no MATLAB calibration grid available; validated AMS grids match optmod=2)"

    if "az" in mat_calibration and "ze" in mat_calibration:
        ref_az = np.asarray(mat_calibration["az"], dtype=float)
        ref_ze = np.asarray(mat_calibration["ze"], dtype=float)
    elif "flipped_az" in mat_calibration and "flipped_ze" in mat_calibration:
        ref_az = np.asarray(mat_calibration["flipped_az"], dtype=float)
        ref_ze = np.asarray(mat_calibration["flipped_ze"], dtype=float)
    else:
        return 2, "default optmod=2 (MATLAB file has no az/ze grid; validated AMS grids match optmod=2)"

    if ref_az.shape != image.shape or ref_ze.shape != image.shape:
        return 2, "default optmod=2 (MATLAB az/ze grid shape mismatch; validated AMS grids match optmod=2)"

    sample_step_y = max(1, image.shape[0] // 60)
    sample_step_x = max(1, image.shape[1] // 80)
    yy, xx = np.mgrid[1 : image.shape[0] + 1 : sample_step_y, 1 : image.shape[1] + 1 : sample_step_x]
    sample_u = xx.ravel()
    sample_v = yy.ravel()
    ref_az_sample = ref_az[yy - 1, xx - 1].ravel()
    ref_ze_sample = ref_ze[yy - 1, xx - 1].ravel()
    valid = np.isfinite(ref_az_sample) & np.isfinite(ref_ze_sample)
    if not np.any(valid):
        return 2, "default optmod=2 (MATLAB az/ze sample contains no finite values; validated AMS grids match optmod=2)"

    diagnostics: list[tuple[float, int]] = []
    for candidate in (2, 3):
        try:
            az_calc, ze_calc = inv_project_directions(sample_u[valid], sample_v[valid], image, candidate, optpar)
        except Exception:
            continue
        az_err = np.sqrt(np.mean(wrap_angle_difference(az_calc, ref_az_sample[valid]) ** 2))
        ze_err = np.sqrt(np.mean((ze_calc - ref_ze_sample[valid]) ** 2))
        diagnostics.append((az_err + ze_err, candidate))

    if not diagnostics:
        return 2, "default optmod=2 (candidate comparison failed; validated AMS grids match optmod=2)"

    diagnostics.sort(key=lambda item: item[0])
    best_score, best_optmod = diagnostics[0]
    return best_optmod, f"matched MATLAB az/ze grid best with optmod={best_optmod} (score={best_score:.4g} rad)"


def highpass_for_display(image: np.ndarray, sigma: float) -> np.ndarray:
    """Suppress large-scale background structure so stars stand out in the overlay."""
    work = np.asarray(image, dtype=float)
    if sigma <= 0:
        return work
    smooth = gaussian_filter(work, sigma=sigma, mode="nearest")
    highpass = work - smooth
    lo, hi = np.percentile(highpass, [1.0, 99.5])
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        return highpass
    return np.clip((highpass - lo) / (hi - lo), 0.0, 1.0)


def dao_style_find_centroids(
    image: np.ndarray,
    highpass_sigma: float,
    threshold_sigma: float,
    window: int,
) -> np.ndarray:
    """Find star-like centroids using a DAO-style local-maximum and centroid pass."""
    work = np.asarray(image, dtype=float)
    background = gaussian_filter(work, sigma=max(highpass_sigma, 1.0), mode="nearest")
    filtered = work - background
    mean, median, std = sigma_clipped_stats(filtered, sigma=3.0, maxiters=5)
    threshold = median + threshold_sigma * std
    local_max = filtered == maximum_filter(filtered, size=window, mode="nearest")
    peaks = local_max & (filtered > threshold)
    ys, xs = np.nonzero(peaks)
    if xs.size == 0:
        return np.empty((0, 3), dtype=float)

    half = max(1, window // 2)
    centroids: list[tuple[float, float, float]] = []
    for x0, y0 in zip(xs, ys):
        x1 = max(0, x0 - half)
        x2 = min(work.shape[1], x0 + half + 1)
        y1 = max(0, y0 - half)
        y2 = min(work.shape[0], y0 + half + 1)
        stamp = filtered[y1:y2, x1:x2]
        weights = stamp - np.min(stamp)
        positive = np.clip(weights, 0.0, None)
        flux = float(np.sum(positive))
        if flux <= 0:
            continue
        yy, xx = np.mgrid[y1:y2, x1:x2]
        cx = float(np.sum(xx * positive) / flux)
        cy = float(np.sum(yy * positive) / flux)
        centroids.append((cx, cy, flux))

    if not centroids:
        return np.empty((0, 3), dtype=float)
    centroids_arr = np.asarray(centroids, dtype=float)
    order = np.argsort(centroids_arr[:, 2])[::-1]
    return centroids_arr[order]


def match_predicted_to_centroids(
    predicted_xy: np.ndarray,
    centroids_xyf: np.ndarray,
    match_radius: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Match each predicted star to its nearest detected centroid within a radius."""
    if predicted_xy.size == 0 or centroids_xyf.size == 0:
        empty_i = np.empty(0, dtype=int)
        empty_f = np.empty((0, 2), dtype=float)
        return empty_i, empty_f, empty_f

    tree = cKDTree(centroids_xyf[:, :2])
    distances, indices = tree.query(predicted_xy, distance_upper_bound=match_radius)
    valid = np.isfinite(distances) & (indices < centroids_xyf.shape[0])
    if not np.any(valid):
        empty_i = np.empty(0, dtype=int)
        empty_f = np.empty((0, 2), dtype=float)
        return empty_i, empty_f, empty_f
    predicted_idx = np.nonzero(valid)[0]
    matched_centroids = centroids_xyf[indices[valid], :2]
    offsets = matched_centroids - predicted_xy[valid]
    return predicted_idx, matched_centroids, offsets


def save_offset_scatterplot(
    output_path: Path,
    offsets: np.ndarray,
    png_name: str,
    matched_count: int,
) -> None:
    """Save a scatter plot of calibration offsets between predicted and detected stars."""
    fig, ax = plt.subplots(figsize=(6, 6), dpi=300)
    if offsets.size:
        ax.scatter(offsets[:, 0], offsets[:, 1], s=18, c="tab:cyan", alpha=0.8, edgecolors="none")
        rms = np.sqrt(np.mean(np.sum(offsets**2, axis=1)))
        ax.axvline(0.0, color="white", linewidth=0.8, alpha=0.6)
        ax.axhline(0.0, color="white", linewidth=0.8, alpha=0.6)
        ax.set_title(f"{png_name}\nMatched stars: {matched_count}, RMS offset: {rms:.2f} px")
    else:
        ax.set_title(f"{png_name}\nNo matched star centroids")
    ax.set_xlabel("dx = detected - predicted [px]")
    ax.set_ylabel("dy = detected - predicted [px]")
    ax.set_xlim(-3.0, 3.0)
    ax.set_ylim(-3.0, 3.0)
    ax.set_facecolor("#111111")
    ax.grid(color="white", alpha=0.15, linewidth=0.5)
    fig.tight_layout()
    fig.savefig(output_path, bbox_inches="tight", pad_inches=0.05)
    plt.close(fig)


def render_overlay(
    args: argparse.Namespace,
    png_path: Path,
    h5_path: Path,
    output_path: Path,
    offset_output_path: Path,
) -> tuple[int, int, str, int]:
    image = plt.imread(png_path)
    if image.ndim == 3:
        # Convert RGB/RGBA PNGs to grayscale for easier viewing of the star markers.
        image = image[..., :3].mean(axis=2)
    display_image = highpass_for_display(image, sigma=args.highpass_sigma)

    with h5py.File(h5_path, "r") as h5f:
        optpar = np.asarray(h5f["optpar"][...], dtype=float)
        lat_deg = float(h5f["camera_lat_deg"][()])
        lon_deg = float(h5f["camera_lon_deg"][()])
        calibration_name = str(h5f.attrs.get("calibration_mat_path", ""))

    obs = build_obs(png_path, lon_deg=lon_deg, lat_deg=lat_deg, optpar=optpar)
    t_obs = obs["time"]
    mat_calibration = load_mat_calibration(args.calibration_dir, calibration_name)
    optmod, optmod_reason = choose_optmod(image, optpar, mat_calibration)
    stars, projected_xy = project_visible_stars(image, obs, optpar, optmod=optmod, max_magnitude=args.max_magnitude)
    centroids = dao_style_find_centroids(
        image,
        highpass_sigma=max(args.highpass_sigma, 3.0),
        threshold_sigma=args.detect_threshold_sigma,
        window=args.centroid_window,
    )
    # Detected centroids are measured on the 0-based image grid, while AIDA's
    # projected star coordinates follow MATLAB's 1-based pixel convention.
    # Convert detections to the same convention before matching so the offset
    # diagnostics are centered on (0, 0) when the calibration is correct.
    centroids_aida = centroids.copy()
    if centroids_aida.size:
        centroids_aida[:, :2] += 1.0
    matched_idx, matched_centroids, offsets = match_predicted_to_centroids(projected_xy, centroids_aida, args.match_radius)
    save_offset_scatterplot(offset_output_path, offsets, png_path.name, matched_idx.size)
    centroids_display = centroids[:, :2] + DISPLAY_OFFSET_XY if centroids.size else np.empty((0, 2), dtype=float)
    matched_centroids_display = (matched_centroids - 1.0) + DISPLAY_OFFSET_XY if matched_centroids.size else np.empty((0, 2), dtype=float)
    projected_display = projected_xy + DISPLAY_OFFSET_XY

    overlay_scale = 2.0
    overlay_dpi = 100
    fig_w = image.shape[1] * overlay_scale / overlay_dpi
    fig_h = image.shape[0] * overlay_scale / overlay_dpi
    fig = plt.figure(figsize=(fig_w, fig_h), dpi=overlay_dpi, frameon=False)
    ax = fig.add_axes([0.0, 0.0, 1.0, 1.0])
    ax.imshow(display_image, cmap="gray", origin="upper")
    if matched_idx.size:
        matched_mags = stars["mag"][matched_idx]
        radii = (5.0 / 3.0) * np.clip(8.0 - 0.8 * matched_mags, 3.0, 8.0)
        for (cx, cy), radius in zip(matched_centroids_display, radii, strict=False):
            ax.add_patch(Circle((cx, cy), radius=radius, fill=False, edgecolor="yellow", linewidth=0.9))
        for (cx, cy), radius in zip(matched_centroids_display, 1.15 * radii, strict=False):
            ax.add_patch(Circle((cx, cy), radius=radius, fill=False, edgecolor="red", linewidth=0.9))
        for (cx, cy), radius in zip(matched_centroids_display, radii, strict=False):
            ax.add_patch(Circle((cx, cy), radius=radius, fill=False, edgecolor="cyan", linewidth=0.9))
        ax.quiver(
            projected_display[matched_idx, 0],
            projected_display[matched_idx, 1],
            offsets[:, 0],
            offsets[:, 1],
            angles="xy",
            scale_units="xy",
            scale=1.0,
            color="magenta",
            alpha=0.35,
            width=0.0015,
        )
    metadata_lines = [
        png_path.name,
        f"UTC: {format_utc_label(t_obs)}",
        f"Lat/Lon: {lat_deg:.5f}, {lon_deg:.5f}",
        f"Model: optmod={optmod} from {h5_path.name}",
        f"Display high-pass sigma: {args.highpass_sigma:.1f}px" if args.highpass_sigma > 0 else "Display high-pass: off",
        f"Centroid matches: {matched_idx.size}/{projected_xy.shape[0]} within {args.match_radius:.1f}px",
    ]
    ax.text(
        0.015,
        0.985,
        "\n".join(metadata_lines),
        transform=ax.transAxes,
        va="top",
        ha="left",
        color="white",
        fontsize=8.5,
        bbox={"facecolor": "black", "alpha": 0.45, "edgecolor": "none", "pad": 4},
    )
    ax.set_title(f"{matched_idx.size} matched centroids, {len(projected_xy)} predicted stars")
    ax.set_axis_off()
    fig.savefig(output_path, dpi=overlay_dpi, bbox_inches=None, pad_inches=0.0)
    plt.close(fig)
    return int(projected_xy.shape[0]), optmod, optmod_reason, int(matched_idx.size)


def main() -> None:
    args = parse_args()
    input_dir = args.input_dir
    png_files = sorted(
        path
        for path in input_dir.glob("*.png")
        if not path.name.endswith(args.output_suffix) and not path.name.endswith(args.offset_suffix)
    )
    if not png_files:
        raise SystemExit(f"No PNG files found in {input_dir}")

    rendered = 0
    for png_path in png_files:
        h5_path = png_path.with_suffix(".h5")
        if not h5_path.exists():
            print(f"skip {png_path.name}: missing {h5_path.name}")
            continue
        output_path = png_path.with_name(f"{png_path.stem}{args.output_suffix}")
        offset_output_path = png_path.with_name(f"{png_path.stem}{args.offset_suffix}")
        n_stars, optmod, optmod_reason, n_matches = render_overlay(
            args,
            png_path,
            h5_path,
            output_path,
            offset_output_path,
        )
        rendered += 1
        print(
            f"rendered {output_path.name}: {n_stars} stars, {n_matches} centroid matches, "
            f"optmod={optmod} ({optmod_reason})"
        )

    print(f"done: rendered {rendered} overlay images in {input_dir}")


if __name__ == "__main__":
    main()
