from __future__ import annotations

import math
from typing import Iterable

import numpy as np

try:
    import astropy.units as u
    from astropy.coordinates import AltAz, EarthLocation, SkyCoord
    from astropy.time import Time

    _HAVE_ASTROPY = True
except Exception:  # pragma: no cover - fallback path for minimal installs.
    _HAVE_ASTROPY = False


def julian_date(date: Iterable[float], utc: Iterable[float]) -> float:
    """Convert a UTC calendar date/time to Julian Date."""
    year, month, day = [int(x) for x in date]
    hour, minute, second = [float(x) for x in utc]
    if month <= 2:
        year -= 1
        month += 12
    a = year // 100
    b = 2 - a + a // 4
    day_fraction = (hour + minute / 60.0 + second / 3600.0) / 24.0
    return (
        math.floor(365.25 * (year + 4716))
        + math.floor(30.6001 * (month + 1))
        + day
        + day_fraction
        + b
        - 1524.5
    )


def gmst_degrees(date: Iterable[float], utc: Iterable[float]) -> float:
    """Return Greenwich Mean Sidereal Time in degrees."""
    jd = julian_date(date, utc)
    t = (jd - 2451545.0) / 36525.0
    gmst = (
        280.46061837
        + 360.98564736629 * (jd - 2451545.0)
        + 0.000387933 * t**2
        - t**3 / 38710000.0
    )
    return gmst % 360.0


def starpos2(ra_hours: np.ndarray, decl_deg: np.ndarray, date, utc, lat_deg: float, lon_deg: float):
    """Convert catalog right ascension/declination to azimuth and zenith.

    When Astropy is available, use a higher-accuracy ICRS->AltAz transform.
    Otherwise fall back to the lightweight analytical approximation.
    """
    ra = np.asarray(ra_hours, dtype=float)
    decl = np.asarray(decl_deg, dtype=float)
    if _HAVE_ASTROPY:
        year, month, day = [int(x) for x in date]
        hour, minute, second = [float(x) for x in utc]
        whole_second = int(second)
        microsecond = int(round((second - whole_second) * 1_000_000))
        timestamp = Time(
            f"{year:04d}-{month:02d}-{day:02d}T{int(hour):02d}:{int(minute):02d}:{whole_second:02d}.{microsecond:06d}",
            scale="utc",
        )
        coords = SkyCoord(ra=ra * u.hourangle, dec=decl * u.deg, frame="icrs")
        location = EarthLocation(lat=lat_deg * u.deg, lon=lon_deg * u.deg)
        altaz = coords.transform_to(AltAz(obstime=timestamp, location=location, pressure=0 * u.hPa))
        az = altaz.az.to(u.rad).value
        ze = (90.0 * u.deg - altaz.alt).to(u.rad).value
        return np.mod(az, 2.0 * np.pi), ze, ze

    rsidtime = (gmst_degrees(date, utc) + lon_deg) / 180.0 * np.pi
    rra = ra / 12.0 * np.pi
    rdecl = decl / 180.0 * np.pi
    rlat = lat_deg / 180.0 * np.pi

    alt = np.arcsin(np.cos(rsidtime - rra) * np.cos(rdecl) * np.cos(rlat) + np.sin(rdecl) * np.sin(rlat))
    ze = np.pi / 2.0 - alt

    sina = np.sin(rsidtime - rra) * np.cos(rdecl) / np.maximum(np.cos(alt), 1e-12)
    cosa = (np.cos(rsidtime - rra) * np.cos(rdecl) * np.sin(rlat) - np.sin(rdecl) * np.cos(rlat)) / np.maximum(
        np.cos(alt), 1e-12
    )
    az = np.arctan2(sina, cosa) + np.pi
    az = np.mod(az, 2.0 * np.pi)
    return az, ze, ze
