from __future__ import annotations

import argparse
from pathlib import Path
import sys

import matplotlib.pyplot as plt
import numpy as np

HERE = Path(__file__).resolve()
PYTHON_DIR = HERE.parents[1]
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from aida_tools_py import anything2obs, inimg, save_azze_csv, save_azze_npz, smart_caxis, stack_frames, starcal, typical_pre_proc_ops


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for the Python calibration example."""
    parser = argparse.ArgumentParser(description="Minimal Python version of the AIDA star calibration example.")
    parser.add_argument(
        "image_dir",
        nargs="?",
        type=Path,
        default=HERE.parent,
        help="Directory containing PNG images. Defaults to the example directory.",
    )
    parser.add_argument("--glob", default="example_image.png", help="Glob for input images.")
    parser.add_argument("--longitude", type=float, default=8.1651, help="Observation longitude in degrees east.")
    parser.add_argument("--latitude", type=float, default=53.1529, help="Observation latitude in degrees north.")
    parser.add_argument("--station", type=int, default=10, help="Station number.")
    parser.add_argument(
        "--time",
        nargs=6,
        type=float,
        metavar=("YYYY", "MM", "DD", "HH", "MM", "SS"),
        default=[2025, 2, 19, 3, 44, 0],
        help="Observation start time in UTC.",
    )
    parser.add_argument("--example-index", type=int, default=1, help="1-based example frame index.")
    parser.add_argument("--stack-start", type=int, default=1, help="1-based stack start frame index.")
    parser.add_argument("--stack-stop", type=int, default=1, help="1-based stack stop frame index.")
    return parser.parse_args()


def main() -> None:
    """Run the Python star-calibration example end to end."""
    args = parse_args()
    paths = sorted(args.image_dir.glob(args.glob))
    if not paths:
        raise SystemExit(f"No images found in {args.image_dir} matching {args.glob}")

    ops = typical_pre_proc_ops("none")
    long_lat = [args.longitude, args.latitude]
    t_obs = [int(args.time[0]), int(args.time[1]), int(args.time[2]), int(args.time[3]), int(args.time[4]), float(args.time[5])]
    # Mirror the MATLAB example by providing fixed metadata through an
    # anything2obs-style callback instead of relying on embedded headers.
    ops["try_to_be_smart_fnc"] = lambda filename: anything2obs(
        filename,
        0,
        xyz=[0, 0, 0],
        longlat=long_lat,
        station=args.station,
        time=t_obs,
        filter=np.nan,
        dt=0,
    )

    i_file = min(max(args.example_index, 1), len(paths)) - 1
    example_file = paths[i_file]
    image, _, _ = inimg(example_file, ops)

    plt.figure()
    plt.imshow(image, cmap="bone")
    plt.colorbar()
    plt.axis("image")
    plt.title(f"Example frame: {example_file.name}")
    plt.clim(*smart_caxis(0.2, image))

    i_start = min(max(args.stack_start, 1), len(paths)) - 1
    i_stop = min(max(args.stack_stop, 1), len(paths))
    last, raw_sum, filtered_sum = stack_frames(paths[i_start:i_stop], ops)

    plt.figure(figsize=(10, 8))
    plt.subplot(2, 2, 1)
    plt.imshow(last, cmap="bone")
    plt.axis("image")
    plt.title("Last input frame")
    plt.colorbar()

    plt.subplot(2, 2, 2)
    plt.imshow(raw_sum, cmap="bone")
    plt.axis("image")
    plt.title("Summed frames")
    plt.colorbar()
    plt.clim(*smart_caxis(0.001, raw_sum))

    plt.subplot(2, 2, 3)
    plt.imshow(filtered_sum, cmap="bone")
    plt.axis("image")
    plt.title("Filtered star-enhanced stack")
    plt.colorbar()
    plt.clim(*smart_caxis(0.001, filtered_sum))

    # Calibrate on the filtered stack rather than the single raw frame so
    # star peaks are easier to detect automatically.
    result = starcal(example_file, ops, calibration_image=filtered_sum)

    plt.figure(figsize=(9, 9))
    plt.imshow(filtered_sum, cmap="bone")
    plt.axis("image")
    plt.title("Automatic star calibration")
    plt.scatter(result.detected_peaks[:, 0], result.detected_peaks[:, 1], s=10, facecolors="none", edgecolors="cyan", alpha=0.3)
    plt.scatter(result.projected_xy[:, 0], result.projected_xy[:, 1], s=14, c="yellow", marker="+")
    if result.matched_catalog_indices.size:
        matched_xy = result.projected_xy[result.matched_catalog_indices]
        matched_peaks = result.detected_peaks[result.matched_peak_indices, :2]
        plt.scatter(matched_xy[:, 0], matched_xy[:, 1], s=24, c="lime", marker="+")
        plt.scatter(matched_peaks[:, 0], matched_peaks[:, 1], s=18, facecolors="none", edgecolors="red")
    plt.colorbar()
    plt.clim(*smart_caxis(0.001, filtered_sum))

    output_base = example_file.with_suffix("")
    npz_path = save_azze_npz(result, output_base.parent / f"{output_base.name}_azze.npz")
    csv_path = save_azze_csv(result, output_base.parent / f"{output_base.name}_pixel_azimuth_elevation.csv")

    print("Calibration finished.")
    print("optpar =", result.optpar)
    print("matched stars =", int(result.matched_catalog_indices.size))
    print("saved", npz_path)
    print("saved", csv_path)

    plt.show()


if __name__ == "__main__":
    main()
