from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from .astro import starpos2


@dataclass(frozen=True)
class CatalogStar:
    """Single bright-star catalog entry used by the Python subset."""
    name: str
    ra_hours: float
    dec_deg: float
    magnitude: float


def _repo_root() -> Path:
    """Return the repository root from the installed package location."""
    return Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def load_yale_bright_star_catalog() -> list[CatalogStar]:
    """Load the bundled bright-star catalog used by the example workflow."""
    stars_dir = _repo_root() / "Skymap" / "stars"
    path = stars_dir / "ybs.new"
    names_path = stars_dir / "ybs.org"
    names: list[str] = []
    if names_path.exists():
        for line in names_path.read_text().splitlines():
            if not line.strip():
                names.append("")
                continue
            names.append(line.split(",", 1)[0].strip())
    stars: list[CatalogStar] = []
    for idx, line in enumerate(path.read_text().splitlines()):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) < 8:
            continue
        ra_h, ra_m, ra_s = map(float, parts[0:3])
        dec_d, dec_m, dec_s = map(float, parts[3:6])
        magnitude = float(parts[6])
        ra_hours = ra_h + ra_m / 60.0 + ra_s / 3600.0
        sign = -1.0 if dec_d < 0 else 1.0
        dec_deg = dec_d + sign * dec_m / 60.0 + sign * dec_s / 3600.0
        name = names[idx] if idx < len(names) else ""
        stars.append(CatalogStar(name=name, ra_hours=ra_hours, dec_deg=dec_deg, magnitude=magnitude))
    return stars


def visible_stars(obs: dict, max_magnitude: float = 6.5, max_zenith_deg: float = 80.0) -> dict[str, np.ndarray]:
    """Return stars above the horizon cut for a given observation."""
    stars = [s for s in load_yale_bright_star_catalog() if s.magnitude <= max_magnitude]
    catalog_index = np.arange(len(stars), dtype=int)
    ra = np.array([s.ra_hours for s in stars], dtype=float)
    dec = np.array([s.dec_deg for s in stars], dtype=float)
    mag = np.array([s.magnitude for s in stars], dtype=float)
    names = np.array([s.name for s in stars], dtype=object)
    date = obs["time"][:3]
    utc = obs["time"][3:]
    lon, lat = obs["longlat"]
    az, ze, _ = starpos2(ra, dec, date, utc, lat, lon)
    mask = np.isfinite(az) & np.isfinite(ze) & (np.degrees(ze) < max_zenith_deg)
    order = np.argsort(mag[mask])
    return {
        "az": az[mask][order],
        "ze": ze[mask][order],
        "mag": mag[mask][order],
        "name": names[mask][order],
        "ra_hours": ra[mask][order],
        "dec_deg": dec[mask][order],
        "catalog_index": catalog_index[mask][order],
    }
