from __future__ import annotations

import math

import numpy as np


def fitaeta_2_alfabeta(fi_deg: float, theta_deg: float) -> tuple[float, float]:
    """Convert azimuth/zenith pointing angles to AIDA's alpha/beta angles."""
    raz = math.radians(fi_deg)
    rze = math.radians(theta_deg)
    alfa = math.degrees(math.atan(math.sin(raz) * math.tan(rze)))
    beta = -math.degrees(math.asin(-math.cos(raz) * math.sin(rze)))
    return alfa, beta


def guess_alis_optpar(obs: dict) -> np.ndarray:
    """Construct a simple initial optics guess matching MATLAB `guess_alis_optpar`."""
    optpar = np.zeros(8, dtype=float)
    optpar[0:2] = [-1.0, 1.0]
    optpar[5:7] = 0.0
    alfa, beta = fitaeta_2_alfabeta(float(obs.get("az", 0.0)), float(obs.get("ze", 0.0)))
    optpar[2:5] = np.mod([alfa, beta, 0.0], 90.0)
    optpar[7] = 0.35
    return optpar


def camera_rot(alfa_deg: float, beta_deg: float, gamma_deg: float, order: int | None = None) -> np.ndarray:
    """Build the camera rotation matrix from AIDA's Tait-Bryant angles."""
    ral = math.radians(alfa_deg)
    rbe = math.radians(beta_deg)
    rgamma = math.radians(gamma_deg)

    rot1 = np.array(
        [[math.cos(rgamma), -math.sin(rgamma), 0.0], [math.sin(rgamma), math.cos(rgamma), 0.0], [0.0, 0.0, 1.0]]
    )
    rot2 = np.array(
        [[math.cos(ral), 0.0, math.sin(ral)], [0.0, 1.0, 0.0], [-math.sin(ral), 0.0, math.cos(ral)]]
    )
    rot3 = np.array(
        [[1.0, 0.0, 0.0], [0.0, math.cos(rbe), math.sin(rbe)], [0.0, -math.sin(rbe), math.cos(rbe)]]
    )
    if order == 1:
        return rot1 @ rot2 @ rot3
    return rot2 @ rot3 @ rot1


def decompose_camera_rot(rotmtr: np.ndarray) -> tuple[float, float, float]:
    """Recover AIDA alpha, beta, gamma angles from a camera rotation matrix."""
    rotmtr = np.asarray(rotmtr, dtype=float)
    sin_beta = float(np.clip(rotmtr[1, 2], -1.0, 1.0))
    beta = math.degrees(math.asin(sin_beta))
    alfa = math.degrees(math.atan2(rotmtr[0, 2], rotmtr[2, 2]))
    gamma = math.degrees(math.atan2(rotmtr[1, 0], rotmtr[1, 1]))
    return alfa, beta, gamma


def _camera_model_optmod2(
    sese1: np.ndarray, sese2: np.ndarray, sese3: np.ndarray, optpar: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Evaluate the MATLAB optmod=2 radial camera model in normalized coordinates."""
    f1, f2 = optpar[0], optpar[1]
    dx, dy = optpar[5], optpar[6]
    alpha = optpar[7]
    radial = np.sqrt(sese1**2 + sese2**2)
    theta = np.arctan2(radial, sese3)
    u2 = np.zeros_like(sese1)
    w2 = np.zeros_like(sese2)
    valid = radial > 0
    u2[valid] = f1 * sese1[valid] / radial[valid] * np.sin(alpha * theta[valid])
    w2[valid] = f2 * sese2[valid] / radial[valid] * np.sin(alpha * theta[valid])
    return u2 + 0.5 + dx, w2 + 0.5 + dy


def _camera_model_optmod3(
    sese1: np.ndarray, sese2: np.ndarray, sese3: np.ndarray, optpar: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Evaluate the MATLAB optmod=3 radial camera model in normalized coordinates."""
    f1, f2 = optpar[0], optpar[1]
    dx, dy = optpar[5], optpar[6]
    alpha = optpar[7]
    u1 = f1 * (1.0 - alpha) * sese1 / np.maximum(sese3, 1e-12)
    w1 = f2 * (1.0 - alpha) * sese2 / np.maximum(sese3, 1e-12)
    radial = np.sqrt(sese1**2 + sese2**2)
    theta = np.arctan2(radial, sese3)
    u2 = np.zeros_like(sese1)
    w2 = np.zeros_like(sese2)
    valid = radial > 0
    u2[valid] = f1 * alpha * sese1[valid] / radial[valid] * theta[valid]
    w2[valid] = f2 * alpha * sese2[valid] / radial[valid] * theta[valid]
    return u1 + u2 + 0.5 + dx, w1 + w2 + 0.5 + dy


def camera_model(az: np.ndarray, ze: np.ndarray, optpar: np.ndarray, optmod: int, image_shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Project azimuth/zenith directions into image pixel coordinates."""
    by, bx = image_shape
    # Rotate world-frame line-of-sight vectors into the camera frame before
    # applying the radial optics model.
    rotmtr = camera_rot(optpar[2], optpar[3], optpar[4])
    e1, e2, e3 = rotmtr[:, 0], rotmtr[:, 1], rotmtr[:, 2]
    sinze = np.sin(ze)
    es1 = sinze * np.sin(az)
    es2 = sinze * np.cos(az)
    es3 = np.cos(ze)
    sese1 = es1 * e1[0] + es2 * e1[1] + es3 * e1[2]
    sese2 = es1 * e2[0] + es2 * e2[1] + es3 * e2[2]
    sese3 = es1 * e3[0] + es2 * e3[1] + es3 * e3[2]
    if optmod == 2:
        u_norm, v_norm = _camera_model_optmod2(sese1, sese2, sese3, optpar)
    elif optmod == 3:
        u_norm, v_norm = _camera_model_optmod3(sese1, sese2, sese3, optpar)
    else:
        raise NotImplementedError(f"Camera model optmod={optmod} is not implemented in the Python subset.")
    return u_norm * bx, v_norm * by


def camera_invmodel(u: np.ndarray, v: np.ndarray, optpar: np.ndarray, optmod: int, image_shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Invert image pixel coordinates to camera-frame polar angles."""
    by, bx = image_shape
    U = np.asarray(u, dtype=float) / bx
    V = np.asarray(v, dtype=float) / by
    f1, f2 = optpar[0], optpar[1]
    du, dv = optpar[5], optpar[6]
    alpha = optpar[7]
    r = np.sqrt(((U - 0.5 - du) / f1) ** 2 + ((V - 0.5 - dv) / f2) ** 2)
    if optmod == 2:
        theta = np.arcsin(np.clip(r, -1.0, 1.0)) / alpha
    elif optmod == 3:
        theta = _newrap1(r, alpha, 1e-10)
    else:
        raise NotImplementedError(f"Camera model optmod={optmod} is not implemented in the Python subset.")
    phi = np.arctan2((U - 0.5 - du) / f1, (V - 0.5 - dv) / f2)
    return phi, theta


def _newrap1(r: np.ndarray, alpha: float, tol: float) -> np.ndarray:
    """Solve the optmod=3 radial equation with Newton iterations."""
    theta = np.arctan(r)
    for _ in range(25):
        f = alpha * theta + (1.0 - alpha) * np.tan(theta) - r
        df = alpha + (1.0 - alpha) / np.cos(theta) ** 2
        step = f / np.maximum(df, 1e-12)
        theta_next = theta - step
        if np.all(np.abs(step) < tol):
            return theta_next
        theta = theta_next
    return theta


def inv_project_directions(px: np.ndarray, py: np.ndarray, image: np.ndarray, optmod: int, optpar: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Convert image pixels to azimuth and zenith angles in the local frame."""
    rotmtr = camera_rot(optpar[2], optpar[3], optpar[4])
    phi, theta = camera_invmodel(px, py, optpar, optmod, image.shape)
    epix = np.vstack((np.sin(theta) * np.sin(phi), np.sin(theta) * np.cos(phi), np.cos(theta)))
    epix = (rotmtr @ epix).T
    ze = np.arccos(np.clip(epix[:, 2], -1.0, 1.0))
    az = np.arctan2(epix[:, 0], epix[:, 1])
    az = (az + 2.0 * np.pi) % (2.0 * np.pi)
    return az, ze
