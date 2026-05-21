(function () {
    "use strict";

    const DEG = Math.PI / 180.0;
    const RAD = 180.0 / Math.PI;

    function mod(x, n) {
        return ((x % n) + n) % n;
    }

    function julianDate(date) {
        let year = date.getUTCFullYear();
        let month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        const hour = date.getUTCHours();
        const minute = date.getUTCMinutes();
        const second = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000.0;

        if (month <= 2) {
            year -= 1;
            month += 12;
        }
        const a = Math.floor(year / 100);
        const b = 2 - a + Math.floor(a / 4);
        const dayFraction = (hour + minute / 60.0 + second / 3600.0) / 24.0;
        return Math.floor(365.25 * (year + 4716)) +
            Math.floor(30.6001 * (month + 1)) +
            day + dayFraction + b - 1524.5;
    }

    function gmstDegrees(date) {
        const jd = julianDate(date);
        const t = (jd - 2451545.0) / 36525.0;
        return mod(
            280.46061837 +
            360.98564736629 * (jd - 2451545.0) +
            0.000387933 * t * t -
            t * t * t / 38710000.0,
            360.0
        );
    }

    function starAzZe(raHours, decDeg, date, latDeg, lonDeg) {
        const rsidtime = (gmstDegrees(date) + lonDeg) * DEG;
        const rra = raHours / 12.0 * Math.PI;
        const rdecl = decDeg * DEG;
        const rlat = latDeg * DEG;
        const alt = Math.asin(
            Math.cos(rsidtime - rra) * Math.cos(rdecl) * Math.cos(rlat) +
            Math.sin(rdecl) * Math.sin(rlat)
        );
        const ze = Math.PI / 2.0 - alt;
        const cosAlt = Math.max(Math.cos(alt), 1e-12);
        const sina = Math.sin(rsidtime - rra) * Math.cos(rdecl) / cosAlt;
        const cosa = (
            Math.cos(rsidtime - rra) * Math.cos(rdecl) * Math.sin(rlat) -
            Math.sin(rdecl) * Math.cos(rlat)
        ) / cosAlt;
        const az = mod(Math.atan2(sina, cosa) + Math.PI, 2.0 * Math.PI);
        return {az, ze};
    }

    function matMul3(a, b) {
        const out = new Array(9).fill(0);
        for (let r = 0; r < 3; r++) {
            for (let col = 0; col < 3; col++) {
                out[r * 3 + col] =
                    a[r * 3 + 0] * b[0 * 3 + col] +
                    a[r * 3 + 1] * b[1 * 3 + col] +
                    a[r * 3 + 2] * b[2 * 3 + col];
            }
        }
        return out;
    }

    function cameraRot(alphaDeg, betaDeg, gammaDeg) {
        const a = alphaDeg * DEG;
        const b = betaDeg * DEG;
        const g = gammaDeg * DEG;
        const rot1 = [
            Math.cos(g), -Math.sin(g), 0,
            Math.sin(g), Math.cos(g), 0,
            0, 0, 1,
        ];
        const rot2 = [
            Math.cos(a), 0, Math.sin(a),
            0, 1, 0,
            -Math.sin(a), 0, Math.cos(a),
        ];
        const rot3 = [
            1, 0, 0,
            0, Math.cos(b), Math.sin(b),
            0, -Math.sin(b), Math.cos(b),
        ];
        return matMul3(matMul3(rot2, rot3), rot1);
    }

    function cameraModel(az, ze, optpar, optmod, width, height) {
        const rot = cameraRot(optpar[2], optpar[3], optpar[4]);
        const sinze = Math.sin(ze);
        const es1 = sinze * Math.sin(az);
        const es2 = sinze * Math.cos(az);
        const es3 = Math.cos(ze);

        const sese1 = es1 * rot[0] + es2 * rot[3] + es3 * rot[6];
        const sese2 = es1 * rot[1] + es2 * rot[4] + es3 * rot[7];
        const sese3 = es1 * rot[2] + es2 * rot[5] + es3 * rot[8];

        const f1 = optpar[0];
        const f2 = optpar[1];
        const dx = optpar[5];
        const dy = optpar[6];
        const alpha = optpar[7];
        const radial = Math.sqrt(sese1 * sese1 + sese2 * sese2);
        const theta = Math.atan2(radial, sese3);
        let uNorm;
        let vNorm;

        if (radial <= 1e-12) {
            uNorm = 0.5 + dx;
            vNorm = 0.5 + dy;
        } else if (optmod === 2) {
            const r = Math.sin(alpha * theta);
            uNorm = f1 * sese1 / radial * r + 0.5 + dx;
            vNorm = f2 * sese2 / radial * r + 0.5 + dy;
        } else {
            const safeSese3 = Math.max(sese3, 1e-12);
            const u1 = f1 * (1.0 - alpha) * sese1 / safeSese3;
            const v1 = f2 * (1.0 - alpha) * sese2 / safeSese3;
            const u2 = f1 * alpha * sese1 / radial * theta;
            const v2 = f2 * alpha * sese2 / radial * theta;
            uNorm = u1 + u2 + 0.5 + dx;
            vNorm = v1 + v2 + 0.5 + dy;
        }

        // AIDA/Matlab calibration files use 1-based pixel coordinates. The
        // browser works in true 0-based image pixel coordinates.
        return {x: uNorm * width - 1, y: vNorm * height - 1};
    }

    function visibleStars(catalog, date, latDeg, lonDeg, maxMagnitude, maxZenithDeg) {
        const out = [];
        for (const row of catalog) {
            const mag = row[2];
            if (mag > maxMagnitude) {
                continue;
            }
            const azze = starAzZe(row[0], row[1], date, latDeg, lonDeg);
            if (Number.isFinite(azze.az) && Number.isFinite(azze.ze) && azze.ze * RAD < maxZenithDeg) {
                out.push({raHours: row[0], decDeg: row[1], mag, name: row[3], az: azze.az, ze: azze.ze});
            }
        }
        out.sort((a, b) => a.mag - b.mag);
        return out;
    }

    function guessTimestampFromAllsky7Name(name) {
        const match = name.match(/(20\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})(?:[_-](\d{1,3}))?/);
        if (!match) {
            return null;
        }
        const [, yy, mm, dd, hh, mi, ss, ms] = match;
        const milli = ms ? Number(ms.padEnd(3, "0").slice(0, 3)) : 0;
        return new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss), milli));
    }

    function dateToDatetimeLocal(date) {
        const pad = (value, len = 2) => String(value).padStart(len, "0");
        return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
            `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.` +
            `${pad(date.getUTCMilliseconds(), 3)}`;
    }

    function datetimeLocalToDate(value) {
        if (!value) {
            return new Date();
        }
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/);
        if (!match) {
            return new Date(value);
        }
        const [, yy, mm, dd, hh, mi, ss = "0", ms = "0"] = match;
        return new Date(Date.UTC(
            Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss),
            Number(ms.padEnd(3, "0").slice(0, 3))
        ));
    }

    window.AidaTools = {
        DEG,
        RAD,
        dateToDatetimeLocal,
        datetimeLocalToDate,
        guessTimestampFromAllsky7Name,
        cameraModel,
        radecToAzZe: starAzZe,
        visibleStars,
    };
})();
