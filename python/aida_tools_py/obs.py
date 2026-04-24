from __future__ import annotations

from pathlib import Path

import numpy as np


def anything2obs(filename: str, seq_nr_of_img: int, **kwargs) -> dict:
    """Build a minimal observation structure from keyword metadata.

    This mirrors the MATLAB helper used by the example scripts. The output is
    intentionally shaped so later geometry and calibration code can consume it
    without any MATLAB-style prompting.
    """
    obs = dict(kwargs)
    if "dt" in obs:
        dt = float(obs["dt"])
        time0 = np.asarray(obs["time"], dtype=float)
        seconds = time0[3] * 3600.0 + time0[4] * 60.0 + time0[5] + dt * max(seq_nr_of_img - 1, 0)
        hour = int(seconds // 3600)
        minute = int((seconds - hour * 3600) // 60)
        second = seconds - hour * 3600 - minute * 60
        obs["time"] = [int(time0[0]), int(time0[1]), int(time0[2]), hour, minute, second]
    else:
        obs.setdefault("time", [2000, 1, 1, 0, 0, 0.0])

    if "filterfunction" in obs:
        obs["filter"] = obs["filterfunction"](seq_nr_of_img)
        obs.pop("filterfunction", None)

    obs.setdefault("xyz", [0.0, 0.0, 0.0])
    obs.setdefault("longlat", [0.0, 0.0])
    obs.setdefault("station", 0)
    obs.setdefault("filter", np.nan)
    obs["alpha"] = []
    obs["beta"] = []
    obs["az"] = 0.0
    obs["ze"] = 0.0
    obs["camnr"] = 39
    obs["filename"] = str(Path(filename))
    return obs
