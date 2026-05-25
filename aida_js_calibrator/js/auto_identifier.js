(function (root, factory) {
    "use strict";

    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.AidaAutoIdentifier = factory();
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function clamp(value, lo, hi) {
        return Math.max(lo, Math.min(hi, value));
    }

    function median(values) {
        if (!values.length) {
            return NaN;
        }
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
    }

    function finiteNumber(value, fallback = 0) {
        return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    class KdTree2 {
        constructor(points) {
            this.root = this.build(points.slice(), 0);
        }

        build(points, depth) {
            if (points.length === 0) {
                return null;
            }
            const axis = depth % 2;
            const key = axis === 0 ? "x" : "y";
            points.sort((a, b) => a[key] - b[key]);
            const mid = Math.floor(points.length / 2);
            return {
                point: points[mid],
                axis,
                left: this.build(points.slice(0, mid), depth + 1),
                right: this.build(points.slice(mid + 1), depth + 1),
            };
        }

        range(x, y, radius) {
            const radius2 = radius * radius;
            const out = [];
            const visit = node => {
                if (!node) {
                    return;
                }
                const point = node.point;
                const dx = point.x - x;
                const dy = point.y - y;
                const d2 = dx * dx + dy * dy;
                if (d2 <= radius2) {
                    out.push({...point, distance2: d2});
                }
                const delta = node.axis === 0 ? dx : dy;
                if (delta >= -radius) {
                    visit(node.left);
                }
                if (delta <= radius) {
                    visit(node.right);
                }
            };
            visit(this.root);
            out.sort((a, b) => a.distance2 - b.distance2);
            return out;
        }
    }

    function starKey(star, index) {
        if (star.key) {
            return String(star.key);
        }
        const name = star.name || `star-${index}`;
        const ra = Number.isFinite(star.raHours) ? star.raHours.toFixed(7) : "nan";
        const dec = Number.isFinite(star.decDeg) ? star.decDeg.toFixed(7) : "nan";
        return `${name}|${ra}|${dec}`;
    }

    function setHas(setLike, value) {
        return Boolean(setLike && typeof setLike.has === "function" && setLike.has(value));
    }

    function detectionRank(detection, index) {
        return Number.isFinite(detection.rank) ? detection.rank : index + 1;
    }

    function detectionStrength(detection, index) {
        if (Number.isFinite(detection.score)) {
            return detection.score;
        }
        if (Number.isFinite(detection.flux)) {
            return detection.flux;
        }
        if (Number.isFinite(detection.peakContrast)) {
            return detection.peakContrast;
        }
        return -detectionRank(detection, index);
    }

    function defaultMatchRadius(options) {
        if (Number.isFinite(options.maxDistancePx)) {
            return options.maxDistancePx;
        }
        const width = finiteNumber(options.imageWidth, 0);
        const height = finiteNumber(options.imageHeight, 0);
        const diag = Math.hypot(width, height);
        if (diag > 0) {
            return clamp(0.015 * diag, 18, 42);
        }
        return 28;
    }

    function defaultTranslationRadius(options) {
        if (Number.isFinite(options.translationSearchRadiusPx)) {
            return options.translationSearchRadiusPx;
        }
        const width = finiteNumber(options.imageWidth, 0);
        const height = finiteNumber(options.imageHeight, 0);
        const diag = Math.hypot(width, height);
        if (diag > 0) {
            return clamp(0.08 * diag, 50, 180);
        }
        return 120;
    }

    function defaultAsterismRadius(options) {
        if (Number.isFinite(options.asterismMatchRadiusPx)) {
            return options.asterismMatchRadiusPx;
        }
        const width = finiteNumber(options.imageWidth, 0);
        const height = finiteNumber(options.imageHeight, 0);
        const diag = Math.hypot(width, height);
        if (diag > 0) {
            return clamp(0.012 * diag, 26, 65);
        }
        return 45;
    }

    function normalizeProjectedStars(stars, options = {}) {
        const maxMag = Number.isFinite(options.maxMagnitude) ? options.maxMagnitude : 6.0;
        const maxStars = Number.isFinite(options.maxCatalogStars) ? options.maxCatalogStars : 120;
        const margin = Number.isFinite(options.marginPx) ? options.marginPx : 35;
        const width = finiteNumber(options.imageWidth, NaN);
        const height = finiteNumber(options.imageHeight, NaN);
        const existing = options.existingCatalogKeys;
        const out = [];
        for (let i = 0; i < stars.length; i += 1) {
            const star = stars[i];
            const x = Number(star.x);
            const y = Number(star.y);
            const mag = Number(star.mag);
            const key = starKey(star, i);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(mag) ||
                    mag > maxMag || setHas(existing, key)) {
                continue;
            }
            if (Number.isFinite(width) && Number.isFinite(height) &&
                    (x < -margin || x > width - 1 + margin || y < -margin || y > height - 1 + margin)) {
                continue;
            }
            out.push({...star, x, y, mag, key, rank: i + 1, sourceIndex: i});
        }
        out.sort((a, b) => a.mag - b.mag || a.key.localeCompare(b.key));
        return out.slice(0, maxStars).map((star, index) => ({...star, rank: index + 1}));
    }

    function normalizeDetections(detections, options = {}) {
        const maxDetections = Number.isFinite(options.maxDetections) ? options.maxDetections : 250;
        const deleted = options.deletedDetectionIds;
        const existing = options.existingDetectionIds;
        const out = [];
        for (let i = 0; i < detections.length; i += 1) {
            const detection = detections[i];
            const x = Number(detection.x);
            const y = Number(detection.y);
            const id = detection.id === undefined || detection.id === null ? `det-${i}` : detection.id;
            if (!Number.isFinite(x) || !Number.isFinite(y) || setHas(deleted, id) || setHas(existing, id)) {
                continue;
            }
            out.push({
                ...detection,
                x,
                y,
                id,
                rank: detectionRank(detection, i),
                strength: detectionStrength(detection, i),
                sourceIndex: i,
            });
        }
        out.sort((a, b) => b.strength - a.strength || a.rank - b.rank);
        return out.slice(0, maxDetections);
    }

    function triangleRecord(points, i, j, k) {
        const a = points[i];
        const b = points[j];
        const c = points[k];
        const dAB = Math.hypot(a.x - b.x, a.y - b.y);
        const dBC = Math.hypot(b.x - c.x, b.y - c.y);
        const dCA = Math.hypot(c.x - a.x, c.y - a.y);
        const longest = Math.max(dAB, dBC, dCA);
        const shortest = Math.min(dAB, dBC, dCA);
        if (!Number.isFinite(longest) || longest <= 1e-9 || shortest / longest < 0.12) {
            return null;
        }
        const area2 = Math.abs(
            (b.x - a.x) * (c.y - a.y) -
            (b.y - a.y) * (c.x - a.x)
        );
        if (area2 / (longest * longest) < 0.035) {
            return null;
        }

        let apex;
        let end1;
        let end2;
        let side1;
        let side2;
        if (longest === dAB) {
            apex = c;
            end1 = a;
            end2 = b;
            side1 = dCA;
            side2 = dBC;
        } else if (longest === dBC) {
            apex = a;
            end1 = b;
            end2 = c;
            side1 = dAB;
            side2 = dCA;
        } else {
            apex = b;
            end1 = c;
            end2 = a;
            side1 = dBC;
            side2 = dAB;
        }
        if (side2 < side1) {
            const tmpEnd = end1;
            end1 = end2;
            end2 = tmpEnd;
            const tmpSide = side1;
            side1 = side2;
            side2 = tmpSide;
        }
        return {
            x: side1 / longest,
            y: side2 / longest,
            points: [apex, end1, end2],
            rankScore: apex.rank + end1.rank + end2.rank,
            area2,
        };
    }

    function dot3(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    function cross3(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ];
    }

    function norm3(a) {
        return Math.sqrt(dot3(a, a));
    }

    function normalize3(a) {
        const n = norm3(a);
        return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : null;
    }

    function sub3(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }

    function scale3(a, s) {
        return [a[0] * s, a[1] * s, a[2] * s];
    }

    function angularDistance(a, b) {
        return Math.acos(clamp(dot3(a, b), -1, 1));
    }

    function skyVector(star) {
        const sinze = Math.sin(star.ze);
        return [
            sinze * Math.sin(star.az),
            sinze * Math.cos(star.az),
            Math.cos(star.ze),
        ];
    }

    function aspectLockedF2(options, f1) {
        const width = finiteNumber(options.imageWidth, 0);
        const height = finiteNumber(options.imageHeight, 0);
        return height > 0 ? f1 * width / height : NaN;
    }

    function optmod2DetectionVector(detection, options, f1, radialAlpha) {
        const width = finiteNumber(options.imageWidth, 0);
        const height = finiteNumber(options.imageHeight, 0);
        if (!(width > 0 && height > 0 && f1 > 0 && radialAlpha > 0)) {
            return null;
        }
        const f2 = aspectLockedF2(options, f1);
        const du = Number.isFinite(options.preflattenDu) ? options.preflattenDu : 0;
        const dv = Number.isFinite(options.preflattenDv) ? options.preflattenDv : 0;
        const signX = options.preflattenSignX === -1 ? -1 : 1;
        const signY = options.preflattenSignY === -1 ? -1 : 1;
        const xn = ((detection.x + 1) / width - 0.5 - du) / (signX * f1);
        const yn = ((detection.y + 1) / height - 0.5 - dv) / (signY * f2);
        const rho = Math.hypot(xn, yn);
        if (!Number.isFinite(rho) || rho > 0.999999) {
            return null;
        }
        if (rho <= 1e-12) {
            return [0, 0, 1];
        }
        const theta = Math.asin(rho) / radialAlpha;
        const sint = Math.sin(theta);
        const cost = Math.cos(theta);
        return normalize3([sint * xn / rho, sint * yn / rho, cost]);
    }

    function pinholeDetectionVector(detection, options, f1) {
        const width = finiteNumber(options.imageWidth, 0);
        const height = finiteNumber(options.imageHeight, 0);
        if (!(width > 0 && height > 0 && f1 > 0)) {
            return null;
        }
        const f2 = aspectLockedF2(options, f1);
        const du = Number.isFinite(options.preflattenDu) ? options.preflattenDu : 0;
        const dv = Number.isFinite(options.preflattenDv) ? options.preflattenDv : 0;
        const signX = options.preflattenSignX === -1 ? -1 : 1;
        const signY = options.preflattenSignY === -1 ? -1 : 1;
        const xn = ((detection.x + 1) / width - 0.5 - du) / (signX * f1);
        const yn = ((detection.y + 1) / height - 0.5 - dv) / (signY * f2);
        if (!Number.isFinite(xn) || !Number.isFinite(yn)) {
            return null;
        }
        return normalize3([xn, yn, 1]);
    }

    function preflattenDetectionVector(detection, options, f1, radialAlpha, model = "fisheye") {
        return model === "pinhole" ?
            pinholeDetectionVector(detection, options, f1) :
            optmod2DetectionVector(detection, options, f1, radialAlpha);
    }

    function sphericalTriangleRecord(points, i, j, k) {
        const a = points[i];
        const b = points[j];
        const c = points[k];
        const dAB = angularDistance(a.vector, b.vector);
        const dBC = angularDistance(b.vector, c.vector);
        const dCA = angularDistance(c.vector, a.vector);
        const longest = Math.max(dAB, dBC, dCA);
        const shortest = Math.min(dAB, dBC, dCA);
        if (!Number.isFinite(longest) || longest <= 1e-6 || shortest / longest < 0.16) {
            return null;
        }
        if (longest < 2.0 * Math.PI / 180 || longest > 65.0 * Math.PI / 180) {
            return null;
        }
        let apex;
        let end1;
        let end2;
        let side1;
        let side2;
        if (longest === dAB) {
            apex = c;
            end1 = a;
            end2 = b;
            side1 = dCA;
            side2 = dBC;
        } else if (longest === dBC) {
            apex = a;
            end1 = b;
            end2 = c;
            side1 = dAB;
            side2 = dCA;
        } else {
            apex = b;
            end1 = c;
            end2 = a;
            side1 = dBC;
            side2 = dAB;
        }
        if (side2 < side1) {
            const tmpEnd = end1;
            end1 = end2;
            end2 = tmpEnd;
            const tmpSide = side1;
            side1 = side2;
            side2 = tmpSide;
        }
        const area = norm3(cross3(sub3(end1.vector, apex.vector), sub3(end2.vector, apex.vector)));
        if (area < 1e-4) {
            return null;
        }
        return {
            x: side1 / longest,
            y: side2 / longest,
            points: [apex, end1, end2],
            rankScore: apex.rank + end1.rank + end2.rank,
            area,
        };
    }

    function localSphericalTriangleRecords(points, maxTriangles, neighborPoolSize) {
        const records = [];
        const seen = new Set();
        const addRecord = (i, j, k) => {
            const ids = [i, j, k].sort((a, b) => a - b);
            const key = ids.join("-");
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            const record = sphericalTriangleRecord(points, ids[0], ids[1], ids[2]);
            if (record) {
                records.push(record);
            }
        };

        const maxSide = (Number.isFinite(neighborPoolSize.maxSideDeg) ?
            neighborPoolSize.maxSideDeg : 70.0) * Math.PI / 180;
        const poolSize = Math.max(3, Math.floor(neighborPoolSize.count));
        for (let i = 0; i < points.length; i += 1) {
            const neighbors = [];
            for (let j = 0; j < points.length; j += 1) {
                if (i === j) {
                    continue;
                }
                const distance = angularDistance(points[i].vector, points[j].vector);
                if (Number.isFinite(distance) && distance <= maxSide) {
                    neighbors.push({index: j, distance});
                }
            }
            neighbors.sort((a, b) => a.distance - b.distance ||
                points[a.index].rank - points[b.index].rank);
            const local = neighbors.slice(0, poolSize);
            for (let a = 0; a < local.length - 1; a += 1) {
                for (let b = a + 1; b < local.length; b += 1) {
                    addRecord(i, local[a].index, local[b].index);
                }
            }
        }
        records.sort((a, b) => b.area - a.area || a.rankScore - b.rankScore);
        return records.slice(0, maxTriangles);
    }

    function sphericalTriangleRecords(points, options = {}) {
        const maxTriangles = Number.isFinite(options.maxTriangles) ? options.maxTriangles : 4000;
        const maxPoints = Number.isFinite(options.maxTrianglePoints) ? options.maxTrianglePoints : points.length;
        const p = points.slice(0, maxPoints);
        if (Number.isFinite(options.localNeighborPoolSize) && options.localNeighborPoolSize >= 3) {
            return localSphericalTriangleRecords(p, maxTriangles, {
                count: options.localNeighborPoolSize,
                maxSideDeg: options.localTriangleMaxSideDeg,
            });
        }
        const records = [];
        for (let i = 0; i < p.length - 2; i += 1) {
            for (let j = i + 1; j < p.length - 1; j += 1) {
                for (let k = j + 1; k < p.length; k += 1) {
                    const record = sphericalTriangleRecord(p, i, j, k);
                    if (record) {
                        records.push(record);
                    }
                }
            }
        }
        records.sort((a, b) => a.rankScore - b.rankScore || b.area - a.area);
        return records.slice(0, maxTriangles);
    }

    function triadBasis(a, b) {
        const e1 = normalize3(a);
        if (!e1) {
            return null;
        }
        const bPerp = sub3(b, scale3(e1, dot3(b, e1)));
        const e2 = normalize3(bPerp);
        if (!e2) {
            return null;
        }
        const e3 = normalize3(cross3(e1, e2));
        return e3 ? [e1, e2, e3] : null;
    }

    function rotationFromVectorPairs(src0, src1, dst0, dst1) {
        const src = triadBasis(src0, src1);
        const dst = triadBasis(dst0, dst1);
        if (!src || !dst) {
            return null;
        }
        const r = new Array(9).fill(0);
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                r[row * 3 + col] =
                    dst[0][row] * src[0][col] +
                    dst[1][row] * src[1][col] +
                    dst[2][row] * src[2][col];
            }
        }
        return r;
    }

    function applyRot3(rot, vector) {
        return [
            rot[0] * vector[0] + rot[1] * vector[1] + rot[2] * vector[2],
            rot[3] * vector[0] + rot[4] * vector[1] + rot[5] * vector[2],
            rot[6] * vector[0] + rot[7] * vector[1] + rot[8] * vector[2],
        ];
    }

    function matMul3x3(a, b) {
        const out = new Array(9).fill(0);
        for (let r = 0; r < 3; r += 1) {
            for (let c = 0; c < 3; c += 1) {
                out[r * 3 + c] =
                    a[r * 3 + 0] * b[0 * 3 + c] +
                    a[r * 3 + 1] * b[1 * 3 + c] +
                    a[r * 3 + 2] * b[2 * 3 + c];
            }
        }
        return out;
    }

    function skewRotationMatrix(w) {
        const angle = norm3(w);
        if (angle <= 1e-12) {
            return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        }
        const x = w[0] / angle;
        const y = w[1] / angle;
        const z = w[2] / angle;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const t = 1 - c;
        return [
            t * x * x + c, t * x * y - s * z, t * x * z + s * y,
            t * y * x + s * z, t * y * y + c, t * y * z - s * x,
            t * z * x - s * y, t * z * y + s * x, t * z * z + c,
        ];
    }

    function solve3x3(a, b) {
        const m = [
            [a[0], a[1], a[2], b[0]],
            [a[3], a[4], a[5], b[1]],
            [a[6], a[7], a[8], b[2]],
        ];
        for (let col = 0; col < 3; col += 1) {
            let pivot = col;
            for (let row = col + 1; row < 3; row += 1) {
                if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) {
                    pivot = row;
                }
            }
            if (Math.abs(m[pivot][col]) < 1e-10) {
                return null;
            }
            if (pivot !== col) {
                const tmp = m[col];
                m[col] = m[pivot];
                m[pivot] = tmp;
            }
            const div = m[col][col];
            for (let j = col; j < 4; j += 1) {
                m[col][j] /= div;
            }
            for (let row = 0; row < 3; row += 1) {
                if (row === col) {
                    continue;
                }
                const factor = m[row][col];
                for (let j = col; j < 4; j += 1) {
                    m[row][j] -= factor * m[col][j];
                }
            }
        }
        return [m[0][3], m[1][3], m[2][3]];
    }

    function smallRotationCorrection(matches) {
        if (matches.length < 3) {
            return null;
        }
        const ata = new Array(9).fill(0);
        const atb = [0, 0, 0];
        for (const match of matches) {
            const a = match.transformedVector || applyRot3(match.rotation || [1, 0, 0, 0, 1, 0, 0, 0, 1], match.detection.vector);
            const b = match.star.vector;
            if (!a || !b) {
                continue;
            }
            const rows = [
                [0, a[2], -a[1]],
                [-a[2], 0, a[0]],
                [a[1], -a[0], 0],
            ];
            const rhs = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            for (let r = 0; r < 3; r += 1) {
                const weight = 1 + Math.max(0, 4.2 - match.star.mag) * 0.35;
                for (let i = 0; i < 3; i += 1) {
                    atb[i] += weight * rows[r][i] * rhs[r];
                    for (let j = 0; j < 3; j += 1) {
                        ata[i * 3 + j] += weight * rows[r][i] * rows[r][j];
                    }
                }
            }
        }
        const w = solve3x3(ata, atb);
        if (!w) {
            return null;
        }
        const maxStep = 4.0 * Math.PI / 180;
        const n = norm3(w);
        return n > maxStep ? scale3(w, maxStep / n) : w;
    }

    function scoreBlindRotation(catalog, detections, rot, options = {}) {
        const radius = (Number.isFinite(options.blindMatchRadiusDeg) ? options.blindMatchRadiusDeg : 2.2) * Math.PI / 180;
        const cosRadius = Math.cos(radius);
        const usedStars = new Set();
        const usedDetections = new Set();
        const matches = [];
        const candidates = [];
        const maxTest = Number.isFinite(options.maxBlindVerifyDetections) ? options.maxBlindVerifyDetections : 55;
        const dets = detections.slice(0, maxTest);
        const verificationCatalog = Array.isArray(options.ambiguityCatalog) && options.ambiguityCatalog.length ?
            catalog.concat(options.ambiguityCatalog) :
            catalog;
        for (const detection of dets) {
            const transformed = applyRot3(rot, detection.vector);
            for (const star of verificationCatalog) {
                const similarity = dot3(transformed, star.vector);
                if (similarity < cosRadius) {
                    continue;
                }
                const d = Math.acos(clamp(similarity, -1, 1));
                const detRank = Number.isFinite(detection.rank) ? detection.rank : 99;
                const rankPenalty = Math.min(1.5, Math.abs(star.rank - detRank) / 35);
                const brightRankPenalty = star.mag <= 2.8 && detRank > 85 ?
                    Math.min(3.5, (detRank - 85) / 18) :
                    0;
                const brightnessBonus = 0.15 * Math.max(0, 4.2 - star.mag);
                candidates.push({
                    star,
                    detection,
                    transformedVector: transformed,
                    distance: d * 180 / Math.PI,
                    angularDistanceRad: d,
                    cost: d / radius + rankPenalty + brightRankPenalty - brightnessBonus,
                });
            }
        }
        candidates.sort((a, b) => a.cost - b.cost || a.angularDistanceRad - b.angularDistanceRad);

        const rejectAmbiguous = options.rejectAmbiguousBlindMatches === true;
        const ambiguityRadiusRad = (Number.isFinite(options.blindAmbiguityRadiusDeg) ?
            options.blindAmbiguityRadiusDeg : 1.0) * Math.PI / 180;
        const ambiguityCostSlack = Number.isFinite(options.blindAmbiguityCostSlack) ?
            options.blindAmbiguityCostSlack : 0.55;
        const ambiguityDistanceSlackRad = (Number.isFinite(options.blindAmbiguityDistanceSlackDeg) ?
            options.blindAmbiguityDistanceSlackDeg : 0.35) * Math.PI / 180;
        const isAmbiguous = candidate => rejectAmbiguous && candidates.some(other =>
            other !== candidate &&
            other.detection.id === candidate.detection.id &&
            other.star.key !== candidate.star.key &&
            other.angularDistanceRad <= ambiguityRadiusRad &&
            (
                other.cost <= candidate.cost + ambiguityCostSlack ||
                other.angularDistanceRad <= candidate.angularDistanceRad + ambiguityDistanceSlackRad
            )
        );

        let conflicts = 0;
        for (const candidate of candidates) {
            if (candidate.star.ambiguityOnly) {
                continue;
            }
            if (usedStars.has(candidate.star.key)) {
                conflicts += 1;
                continue;
            }
            if (usedDetections.has(candidate.detection.id)) {
                conflicts += 1;
                continue;
            }
            if (isAmbiguous(candidate)) {
                usedDetections.add(candidate.detection.id);
                conflicts += 1;
                continue;
            }
            usedStars.add(candidate.star.key);
            usedDetections.add(candidate.detection.id);
            matches.push({
                star: candidate.star,
                detection: candidate.detection,
                transformedVector: candidate.transformedVector,
                distance: candidate.distance,
                angularDistanceRad: candidate.angularDistanceRad,
                projectedX: candidate.detection.x,
                projectedY: candidate.detection.y,
                correctedX: candidate.detection.x,
                correctedY: candidate.detection.y,
                residualDx: 0,
                residualDy: 0,
            });
        }

        let score = -0.20 * (dets.length - usedDetections.size);
        for (const match of matches) {
            const bright = Math.max(0, 4.2 - match.star.mag) / 4.2;
            const detRank = Number.isFinite(match.detection.rank) ? match.detection.rank : 99;
            const rankAgreement = 1 - Math.min(1, Math.abs(match.star.rank - detRank) / 55);
            const brightRankPenalty = match.star.mag <= 2.8 && detRank > 85 ?
                Math.min(8.0, (detRank - 85) / 8) :
                0;
            score += 4.0 + 5.0 * bright + 1.2 * rankAgreement - 10.0 * match.angularDistanceRad / radius;
            score -= brightRankPenalty;
        }
        const distractors = dets.length - usedDetections.size;
        matches.sort((a, b) => a.star.mag - b.star.mag || a.angularDistanceRad - b.angularDistanceRad);
        return {score, matches, distractors, conflicts};
    }

    function refineBlindRotation(catalog, detections, rot, options = {}) {
        let currentRot = rot.slice();
        let best = scoreBlindRotation(catalog, detections, currentRot, {
            ...options,
            blindMatchRadiusDeg: Number.isFinite(options.blindRefineRadiusDeg) ? options.blindRefineRadiusDeg : 2.6,
        });
        best.rotation = currentRot;
        const iterations = Number.isFinite(options.blindRefineIterations) ? options.blindRefineIterations : 5;
        for (let iter = 0; iter < iterations; iter += 1) {
            const correction = smallRotationCorrection(best.matches);
            if (!correction || norm3(correction) < 1e-7) {
                break;
            }
            const correctionOptions = [
                matMul3x3(skewRotationMatrix(correction), currentRot),
                matMul3x3(skewRotationMatrix(scale3(correction, -1)), currentRot),
                matMul3x3(currentRot, skewRotationMatrix(correction)),
                matMul3x3(currentRot, skewRotationMatrix(scale3(correction, -1))),
            ];
            let candidate = null;
            for (const candidateRot of correctionOptions) {
                const scored = scoreBlindRotation(catalog, detections, candidateRot, {
                    ...options,
                    blindMatchRadiusDeg: Number.isFinite(options.blindRefineRadiusDeg) ? options.blindRefineRadiusDeg : 2.6,
                });
                scored.rotation = candidateRot;
                if (!candidate || scored.score > candidate.score) {
                    candidate = scored;
                }
            }
            if (!candidate || candidate.matches.length < Math.max(3, best.matches.length - 2) ||
                    candidate.score < best.score - 2.0) {
                break;
            }
            currentRot = candidate.rotation;
            best = candidate;
        }
        const final = scoreBlindRotation(catalog, detections, currentRot, options);
        final.rotation = currentRot;
        return final.score >= best.score - 1.0 || final.matches.length >= best.matches.length ?
            final : best;
    }

    function transposeRot3(rot) {
        return [
            rot[0], rot[3], rot[6],
            rot[1], rot[4], rot[7],
            rot[2], rot[5], rot[8],
        ];
    }

    function projectBlindCatalogStar(star, rot, options = {}) {
        const width = finiteNumber(options.imageWidth, 0);
        const height = finiteNumber(options.imageHeight, 0);
        const f1 = finiteNumber(options.f1, NaN);
        const radialAlpha = finiteNumber(options.radialAlpha, NaN);
        const model = options.preflattenModel === "pinhole" ? "pinhole" : "fisheye";
        if (!(width > 0 && height > 0 && f1 > 0 && (model === "pinhole" || radialAlpha > 0))) {
            return null;
        }
        const cameraVector = applyRot3(transposeRot3(rot), star.vector);
        if (!cameraVector || cameraVector[2] <= 0) {
            return null;
        }
        const theta = Math.acos(Math.max(-1, Math.min(1, cameraVector[2])));
        const sint = Math.sin(theta);
        const f2 = aspectLockedF2(options, f1);
        const du = Number.isFinite(options.du) ? options.du : 0;
        const dv = Number.isFinite(options.dv) ? options.dv : 0;
        const signX = options.signX === -1 ? -1 : 1;
        const signY = options.signY === -1 ? -1 : 1;
        let dx = 0;
        let dy = 0;
        if (sint > 1e-12) {
            const rho = model === "pinhole" ? sint / Math.max(1e-12, cameraVector[2]) : Math.sin(radialAlpha * theta);
            dx = signX * f1 * rho * cameraVector[0] / sint;
            dy = signY * f2 * rho * cameraVector[1] / sint;
        }
        const x = width * (0.5 + du + dx) - 1;
        const y = height * (0.5 + dv + dy) - 1;
        if (!Number.isFinite(x) || !Number.isFinite(y) ||
                x < -0.05 * width || x > 1.05 * width ||
                y < -0.05 * height || y > 1.05 * height) {
            return null;
        }
        return {x, y};
    }

    function expandBlindPixelMatches(catalog, detections, candidate, options = {}) {
        if (!candidate || !candidate.rotation) {
            return candidate;
        }
        const maxDistancePx = Number.isFinite(options.blindPixelMatchRadiusPx) ?
            options.blindPixelMatchRadiusPx : 70;
        const projected = [];
        const projectionCatalog = Array.isArray(options.ambiguityCatalog) && options.ambiguityCatalog.length ?
            catalog.concat(options.ambiguityCatalog) :
            catalog;
        for (const star of projectionCatalog) {
            const xy = projectBlindCatalogStar(star, candidate.rotation, {
                ...options,
                f1: candidate.f1,
                radialAlpha: candidate.radialAlpha,
                preflattenModel: candidate.preflattenModel,
                signX: candidate.signX,
                signY: candidate.signY,
                du: candidate.du,
                dv: candidate.dv,
            });
            if (xy) {
                projected.push({...star, x: xy.x, y: xy.y});
            }
        }
        const pairs = [];
        for (const star of projected) {
            for (const detection of detections) {
                const distancePx = Math.hypot(detection.x - star.x, detection.y - star.y);
                if (distancePx <= maxDistancePx) {
                    const detRank = Number.isFinite(detection.rank) ? detection.rank : 99;
                    const rankPenalty = Math.min(1.5, Math.abs(star.rank - detRank) / 40);
                    const brightBonus = 0.08 * Math.max(0, 4.2 - star.mag);
                    pairs.push({star, detection, distancePx, cost: distancePx / maxDistancePx + rankPenalty - brightBonus});
                }
            }
        }
        pairs.sort((a, b) => a.cost - b.cost || a.distancePx - b.distancePx);
        const rejectAmbiguous = options.rejectAmbiguousBlindMatches === true;
        const ambiguityRadiusPx = Number.isFinite(options.blindPixelAmbiguityRadiusPx) ?
            options.blindPixelAmbiguityRadiusPx : Math.min(maxDistancePx, 18);
        const ambiguityCostSlack = Number.isFinite(options.blindPixelAmbiguityCostSlack) ?
            options.blindPixelAmbiguityCostSlack : 0.45;
        const ambiguityDistanceSlackPx = Number.isFinite(options.blindPixelAmbiguityDistanceSlackPx) ?
            options.blindPixelAmbiguityDistanceSlackPx : 8;
        const isAmbiguous = pair => rejectAmbiguous && pairs.some(other =>
            other !== pair &&
            other.detection.id === pair.detection.id &&
            other.star.key !== pair.star.key &&
            other.distancePx <= ambiguityRadiusPx &&
            (
                other.cost <= pair.cost + ambiguityCostSlack ||
                other.distancePx <= pair.distancePx + ambiguityDistanceSlackPx
            )
        );
        const usedStars = new Set();
        const usedDetections = new Set();
        const matches = [];
        for (const pair of pairs) {
            if (pair.star.ambiguityOnly) {
                continue;
            }
            if (usedStars.has(pair.star.key) || usedDetections.has(pair.detection.id)) {
                continue;
            }
            if (isAmbiguous(pair)) {
                usedDetections.add(pair.detection.id);
                continue;
            }
            usedStars.add(pair.star.key);
            usedDetections.add(pair.detection.id);
            const angular = pair.detection.vector ?
                angularDistance(applyRot3(candidate.rotation, pair.detection.vector), pair.star.vector) : NaN;
            matches.push({
                star: pair.star,
                detection: pair.detection,
                transformedVector: pair.detection.vector ? applyRot3(candidate.rotation, pair.detection.vector) : null,
                distance: Number.isFinite(angular) ? angular * 180 / Math.PI : pair.distancePx,
                angularDistanceRad: angular,
                projectedX: pair.star.x,
                projectedY: pair.star.y,
                correctedX: pair.detection.x,
                correctedY: pair.detection.y,
                residualDx: pair.detection.x - pair.star.x,
                residualDy: pair.detection.y - pair.star.y,
            });
        }
        if (matches.length < Math.max(candidate.matches.length + 3, 10)) {
            return candidate;
        }
        matches.sort((a, b) => a.star.mag - b.star.mag || a.distance - b.distance);
        const score = matches.reduce((acc, match) => {
            const bright = Math.max(0, 4.2 - match.star.mag) / 4.2;
            const px = Math.hypot(match.residualDx, match.residualDy);
            return acc + 4.0 + 5.0 * bright - 5.0 * px / maxDistancePx;
        }, -0.20 * (detections.length - usedDetections.size));
        return {
            ...candidate,
            matches,
            rawMatches: matches,
            score: Math.max(candidate.score, score),
            pixelExpanded: true,
        };
    }

    function vectorizeBlindDetections(detections, options, f1, radialAlpha, du, dv, signX = 1, signY = 1, model = "fisheye") {
        const vectorOptions = {
            ...options,
            preflattenDu: du,
            preflattenDv: dv,
            preflattenSignX: signX,
            preflattenSignY: signY,
            preflattenModel: model,
        };
        return detections
            .map((detection, index) => ({
                ...detection,
                vector: preflattenDetectionVector(detection, vectorOptions, f1, radialAlpha, model),
                rank: Number.isFinite(detection.rank) ? detection.rank : index + 1,
            }))
            .filter(detection => detection.vector);
    }

    function refineBlindPreflatten(catalog, detections, candidate, options = {}) {
        if (!candidate || !candidate.rotation) {
            return candidate;
        }
        let best = candidate;
        const stepSets = [
            {f1: 0.06, radialAlpha: 0.10},
            {f1: 0.03, radialAlpha: 0.05},
            {f1: 0.015, radialAlpha: 0.025},
        ];
        const evaluate = (f1, radialAlpha, du, dv, seedRot) => {
            const model = best.preflattenModel === "pinhole" ? "pinhole" : "fisheye";
            if (!(f1 > 0.35 && f1 < 1.25 && (model === "pinhole" || (radialAlpha > 0.1 && radialAlpha < 1.0)) &&
                    Math.abs(du) < 0.16 && Math.abs(dv) < 0.16)) {
                return null;
            }
            const signX = best.signX === -1 ? -1 : 1;
            const signY = best.signY === -1 ? -1 : 1;
            const vectorDetections = vectorizeBlindDetections(detections, options, f1, radialAlpha, du, dv, signX, signY, model);
            if (vectorDetections.length < 6) {
                return null;
            }
            const refined = refineBlindRotation(catalog, vectorDetections, seedRot, options);
            return {
                ...refined,
                rotation: refined.rotation || seedRot,
                f1,
                radialAlpha,
                du,
                dv,
                signX,
                signY,
                preflattenModel: model,
                vectorDetections,
                detectionTriangleCount: candidate.detectionTriangleCount,
            };
        };
        for (const steps of stepSets) {
            let improved = true;
            let guard = 0;
            while (improved && guard < 18) {
                improved = false;
                guard += 1;
                const trials = [
                    {name: "f1", delta: steps.f1},
                    {name: "f1", delta: -steps.f1},
                    {name: "radialAlpha", delta: steps.radialAlpha},
                    {name: "radialAlpha", delta: -steps.radialAlpha},
                ];
                for (const trial of trials) {
                    const params = {
                        f1: best.f1,
                        radialAlpha: best.radialAlpha,
                        du: best.du,
                        dv: best.dv,
                    };
                    params[trial.name] += trial.delta;
                    const scored = evaluate(params.f1, params.radialAlpha, params.du, params.dv, best.rotation);
                    if (scored && scored.score > best.score + 0.75) {
                        best = scored;
                        improved = true;
                    }
                }
            }
        }
        return best;
    }

    function triangleRecords(points, options = {}) {
        const maxTriangles = Number.isFinite(options.maxTriangles) ? options.maxTriangles : 4000;
        const maxPoints = Number.isFinite(options.maxTrianglePoints) ? options.maxTrianglePoints : points.length;
        const p = points.slice(0, maxPoints);
        const records = [];
        for (let i = 0; i < p.length - 2; i += 1) {
            for (let j = i + 1; j < p.length - 1; j += 1) {
                for (let k = j + 1; k < p.length; k += 1) {
                    const record = triangleRecord(p, i, j, k);
                    if (record) {
                        records.push(record);
                    }
                }
            }
        }
        records.sort((a, b) => a.rankScore - b.rankScore || b.area2 - a.area2);
        return records.slice(0, maxTriangles);
    }

    function affineFromTriangles(src, dst) {
        const [s0, s1, s2] = src;
        const [d0, d1, d2] = dst;
        const det = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
        if (Math.abs(det) < 1e-12) {
            return null;
        }
        const affineFor = (v0, v1, v2) => {
            const a = (v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / det;
            const b = (s0.x * (v1 - v2) + s1.x * (v2 - v0) + s2.x * (v0 - v1)) / det;
            const c = (
                s0.x * (s1.y * v2 - s2.y * v1) +
                s1.x * (s2.y * v0 - s0.y * v2) +
                s2.x * (s0.y * v1 - s1.y * v0)
            ) / det;
            return [a, b, c];
        };
        const x = affineFor(d0.x, d1.x, d2.x);
        const y = affineFor(d0.y, d1.y, d2.y);
        return {
            a: x[0],
            b: x[1],
            c: x[2],
            d: y[0],
            e: y[1],
            f: y[2],
        };
    }

    function applyAffine(t, point) {
        return {
            x: t.a * point.x + t.b * point.y + t.c,
            y: t.d * point.x + t.e * point.y + t.f,
        };
    }

    function scoreAsterismTransform(stars, detections, detectionTree, transform, options = {}) {
        const radius = defaultAsterismRadius(options);
        const radius2 = radius * radius;
        const width = finiteNumber(options.imageWidth, NaN);
        const height = finiteNumber(options.imageHeight, NaN);
        const margin = radius;
        const used = new Set();
        const matches = [];
        let weighted = 0;
        let sumD2 = 0;
        for (const star of stars) {
            const xy = applyAffine(transform, star);
            if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
                continue;
            }
            if (Number.isFinite(width) && Number.isFinite(height) &&
                    (xy.x < -margin || xy.x > width - 1 + margin ||
                    xy.y < -margin || xy.y > height - 1 + margin)) {
                continue;
            }
            const candidates = detectionTree.range(xy.x, xy.y, radius);
            let best = null;
            for (const candidate of candidates) {
                if (!used.has(candidate.payload.id)) {
                    best = candidate;
                    break;
                }
            }
            if (!best || best.distance2 > radius2) {
                continue;
            }
            const detection = best.payload;
            used.add(detection.id);
            const distance = Math.sqrt(best.distance2);
            matches.push({
                star,
                detection,
                projectedX: xy.x,
                projectedY: xy.y,
                correctedX: xy.x,
                correctedY: xy.y,
                residualDx: detection.x - xy.x,
                residualDy: detection.y - xy.y,
                distance,
            });
            weighted += 1 + Math.max(0, 4.2 - star.mag) * 0.35;
            sumD2 += best.distance2;
        }
        const rms = matches.length > 0 ? Math.sqrt(sumD2 / matches.length) : Infinity;
        return {
            transform,
            matches,
            rms,
            score: weighted * 10000 + matches.length * 1000 - sumD2,
        };
    }

    function nearestUnusedDetection(star, detections, used, offset, radius2) {
        let best = null;
        let bestD2 = Infinity;
        const sx = star.x + offset.dx;
        const sy = star.y + offset.dy;
        for (const detection of detections) {
            if (used && used.has(detection.id)) {
                continue;
            }
            const dx = detection.x - sx;
            const dy = detection.y - sy;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = detection;
            }
        }
        return best && bestD2 <= radius2 ? {detection: best, d2: bestD2} : null;
    }

    function scoreTranslationOffset(offset, stars, detections, radiusPx) {
        const radius2 = radiusPx * radiusPx;
        const used = new Set();
        let count = 0;
        let weightedCount = 0;
        let sumD2 = 0;
        for (const star of stars) {
            const nearest = nearestUnusedDetection(star, detections, used, offset, radius2);
            if (!nearest) {
                continue;
            }
            used.add(nearest.detection.id);
            count += 1;
            weightedCount += 1 + Math.max(0, 6.5 - star.mag) * 0.22;
            sumD2 += nearest.d2;
        }
        const rms = count > 0 ? Math.sqrt(sumD2 / count) : Infinity;
        return {
            dx: offset.dx,
            dy: offset.dy,
            count,
            weightedCount,
            rms,
            score: weightedCount * 10000 + count * 1000 - sumD2,
        };
    }

    function estimateTranslation(projectedStars, detections, options = {}) {
        const matchRadius = defaultMatchRadius(options);
        const consensusRadius = Number.isFinite(options.consensusRadiusPx) ?
            options.consensusRadiusPx : Math.max(16, matchRadius);
        const searchRadius = defaultTranslationRadius(options);
        const searchRadius2 = searchRadius * searchRadius;
        const maxTranslationStars = Number.isFinite(options.maxTranslationStars) ?
            options.maxTranslationStars : 70;
        const maxTranslationDetections = Number.isFinite(options.maxTranslationDetections) ?
            options.maxTranslationDetections : 90;
        const stars = projectedStars.slice(0, maxTranslationStars);
        const dets = detections.slice(0, maxTranslationDetections);
        const offsets = [{dx: 0, dy: 0}];
        const offsetBin = Math.max(1, consensusRadius / 4);
        const seen = new Set(["0,0"]);

        for (const star of stars) {
            for (const detection of dets) {
                const dx = detection.x - star.x;
                const dy = detection.y - star.y;
                if (dx * dx + dy * dy > searchRadius2) {
                    continue;
                }
                const bx = Math.round(dx / offsetBin);
                const by = Math.round(dy / offsetBin);
                const key = `${bx},${by}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                offsets.push({dx: bx * offsetBin, dy: by * offsetBin});
            }
        }

        let best = scoreTranslationOffset({dx: 0, dy: 0}, stars, dets, consensusRadius);
        for (const offset of offsets) {
            const scored = scoreTranslationOffset(offset, stars, dets, consensusRadius);
            if (scored.score > best.score) {
                best = scored;
            }
        }

        if (best.count > 0) {
            const residualDx = [];
            const residualDy = [];
            const used = new Set();
            const radius2 = consensusRadius * consensusRadius;
            for (const star of stars) {
                const nearest = nearestUnusedDetection(star, dets, used, best, radius2);
                if (!nearest) {
                    continue;
                }
                used.add(nearest.detection.id);
                residualDx.push(nearest.detection.x - star.x);
                residualDy.push(nearest.detection.y - star.y);
            }
            if (residualDx.length > 0) {
                best = {
                    ...best,
                    dx: median(residualDx),
                    dy: median(residualDy),
                    refined: true,
                };
                const rescored = scoreTranslationOffset(best, stars, dets, consensusRadius);
                best = {...best, ...rescored, refined: true};
            }
        }
        return best;
    }

    function greedyMatch(projectedStars, detections, offset, options = {}) {
        const radius = defaultMatchRadius(options);
        const radius2 = radius * radius;
        const candidates = [];
        for (const star of projectedStars) {
            const sx = star.x + offset.dx;
            const sy = star.y + offset.dy;
            for (const detection of detections) {
                const dx = detection.x - sx;
                const dy = detection.y - sy;
                const d2 = dx * dx + dy * dy;
                if (d2 > radius2) {
                    continue;
                }
                const distance = Math.sqrt(d2);
                const rankPenalty = 0.015 * detection.rank;
                const magnitudePenalty = 0.18 * Math.max(0, star.mag - 1);
                candidates.push({
                    star,
                    detection,
                    distance,
                    dx,
                    dy,
                    score: distance + rankPenalty + magnitudePenalty,
                });
            }
        }
        candidates.sort((a, b) => a.score - b.score || a.distance - b.distance);
        const rejectAmbiguous = options.rejectAmbiguousMatches === true;
        const ambiguityRadius = Number.isFinite(options.ambiguityRadiusPx) ?
            options.ambiguityRadiusPx : Math.min(radius, 8);
        const ambiguityScoreSlack = Number.isFinite(options.ambiguityScoreSlack) ?
            options.ambiguityScoreSlack : 1.5;
        const ambiguityDistanceSlack = Number.isFinite(options.ambiguityDistanceSlackPx) ?
            options.ambiguityDistanceSlackPx : 8;
        const isAmbiguous = candidate => rejectAmbiguous && candidates.some(other =>
            other !== candidate &&
            other.detection.id === candidate.detection.id &&
            other.star.key !== candidate.star.key &&
            other.distance <= ambiguityRadius &&
            (
                other.score <= candidate.score + ambiguityScoreSlack ||
                other.distance <= candidate.distance + ambiguityDistanceSlack
            )
        );

        const usedStars = new Set();
        const usedDetections = new Set();
        const matches = [];
        for (const candidate of candidates) {
            if (usedStars.has(candidate.star.key) || usedDetections.has(candidate.detection.id)) {
                continue;
            }
            if (isAmbiguous(candidate)) {
                usedDetections.add(candidate.detection.id);
                continue;
            }
            usedStars.add(candidate.star.key);
            usedDetections.add(candidate.detection.id);
            matches.push({
                star: candidate.star,
                detection: candidate.detection,
                projectedX: candidate.star.x,
                projectedY: candidate.star.y,
                correctedX: candidate.star.x + offset.dx,
                correctedY: candidate.star.y + offset.dy,
                residualDx: candidate.dx,
                residualDy: candidate.dy,
                distance: candidate.distance,
            });
        }
        matches.sort((a, b) => a.star.mag - b.star.mag || a.distance - b.distance);
        return matches;
    }

    function robustFilterMatches(matches, options = {}) {
        if (matches.length < 5) {
            return matches.slice();
        }
        const dxMedian = median(matches.map(match => match.residualDx));
        const dyMedian = median(matches.map(match => match.residualDy));
        const radial = matches.map(match =>
            Math.hypot(match.residualDx - dxMedian, match.residualDy - dyMedian)
        );
        const radialMedian = median(radial);
        const sigma = Math.max(1, 1.4826 * median(radial.map(value => Math.abs(value - radialMedian))));
        const threshold = Math.max(defaultMatchRadius(options), radialMedian + 4.0 * sigma);
        return matches.filter(match =>
            Math.hypot(match.residualDx - dxMedian, match.residualDy - dyMedian) <= threshold
        );
    }

    function identifyStars(projectedStars, detections, options = {}) {
        const projected = normalizeProjectedStars(projectedStars, options);
        const normalizedDetections = normalizeDetections(detections, options);
        if (projected.length === 0 || normalizedDetections.length === 0) {
            return {
                matches: [],
                rawMatches: [],
                projected,
                detections: normalizedDetections,
                offset: {dx: 0, dy: 0, count: 0, rms: Infinity, score: -Infinity},
                status: "auto-identify: no projected catalog stars or detected image stars",
            };
        }
        const offset = estimateTranslation(projected, normalizedDetections, options);
        const rawMatches = greedyMatch(projected, normalizedDetections, offset, options);
        const matches = robustFilterMatches(rawMatches, options);
        const minMatches = Number.isFinite(options.minMatches) ? options.minMatches : 4;
        const medianDistance = matches.length ? median(matches.map(match => match.distance)) : Infinity;
        const status = matches.length >= minMatches ?
            `auto-identify: ${matches.length} star pairs, median residual ${medianDistance.toFixed(1)} px, ` +
                `translation dx/dy ${offset.dx.toFixed(1)}/${offset.dy.toFixed(1)} px` :
            `auto-identify: only ${matches.length} plausible star pairs found; rough-align the field first`;
        return {
            matches,
            rawMatches,
            projected,
            detections: normalizedDetections,
            offset,
            medianDistance,
            status,
        };
    }

    function identifyStarsByAsterisms(catalogStars, detections, options = {}) {
        const maxMagnitude = Number.isFinite(options.maxMagnitude) ? options.maxMagnitude : 4.0;
        const catalog = normalizeProjectedStars(catalogStars, {
            ...options,
            maxMagnitude,
            maxCatalogStars: Number.isFinite(options.maxCatalogStars) ? options.maxCatalogStars : 90,
            marginPx: Infinity,
        });
        const normalizedDetections = normalizeDetections(detections, {
            ...options,
            maxDetections: Number.isFinite(options.maxDetections) ? options.maxDetections : 50,
        });
        if (catalog.length < 5 || normalizedDetections.length < 5) {
            return {
                matches: [],
                rawMatches: [],
                catalog,
                detections: normalizedDetections,
                transform: null,
                status: "auto-identify: not enough bright catalog stars or image detections for asterism matching",
            };
        }

        const exhaustiveCatalogTriangles = options.exhaustiveCatalogTriangles === true;
        const catalogTriangles = triangleRecords(catalog, {
            maxTriangles: exhaustiveCatalogTriangles ?
                Number.POSITIVE_INFINITY :
                Number.isFinite(options.maxCatalogTriangles) ? options.maxCatalogTriangles : 9000,
            maxTrianglePoints: exhaustiveCatalogTriangles ?
                catalog.length :
                Number.isFinite(options.maxCatalogTriangleStars) ? options.maxCatalogTriangleStars : 80,
        });
        const detectionTriangles = triangleRecords(normalizedDetections, {
            maxTriangles: Number.isFinite(options.maxDetectionTriangles) ? options.maxDetectionTriangles : 1400,
            maxTrianglePoints: Number.isFinite(options.maxDetectionTriangleStars) ? options.maxDetectionTriangleStars : 50,
        });
        if (catalogTriangles.length === 0 || detectionTriangles.length === 0) {
            return {
                matches: [],
                rawMatches: [],
                catalog,
                detections: normalizedDetections,
                transform: null,
                status: "auto-identify: no well-shaped bright-star triangles for asterism matching",
            };
        }

        const signatureTree = new KdTree2(catalogTriangles.map((triangle, index) => ({
            x: triangle.x,
            y: triangle.y,
            payload: {...triangle, index},
        })));
        const detectionTree = new KdTree2(normalizedDetections.map(detection => ({
            x: detection.x,
            y: detection.y,
            payload: detection,
        })));
        const signatureRadius = Number.isFinite(options.triangleSignatureRadius) ?
            options.triangleSignatureRadius : 0.018;
        const maxNeighborTriangles = Number.isFinite(options.maxNeighborTriangles) ?
            options.maxNeighborTriangles : 5;
        const maxCandidateTransforms = Number.isFinite(options.maxCandidateTransforms) ?
            options.maxCandidateTransforms : 3500;
        const seenTransforms = new Set();
        let best = null;
        let scored = 0;

        for (const detectionTriangle of detectionTriangles) {
            const neighbors = signatureTree.range(detectionTriangle.x, detectionTriangle.y, signatureRadius)
                .slice(0, maxNeighborTriangles);
            for (const neighbor of neighbors) {
                if (scored >= maxCandidateTransforms) {
                    break;
                }
                const catalogTriangle = neighbor.payload;
                const transform = affineFromTriangles(catalogTriangle.points, detectionTriangle.points);
                if (!transform) {
                    continue;
                }
                const key = [
                    transform.a, transform.b, transform.c,
                    transform.d, transform.e, transform.f,
                ].map(value => Math.round(value * 1000)).join(",");
                if (seenTransforms.has(key)) {
                    continue;
                }
                seenTransforms.add(key);
                const candidate = scoreAsterismTransform(catalog, normalizedDetections, detectionTree, transform, options);
                scored += 1;
                if (!best || candidate.score > best.score) {
                    best = candidate;
                }
            }
            if (scored >= maxCandidateTransforms) {
                break;
            }
        }

        if (!best) {
            return {
                matches: [],
                rawMatches: [],
                catalog,
                detections: normalizedDetections,
                transform: null,
                status: "auto-identify: asterism matcher found no candidate transforms",
            };
        }

        const matches = robustFilterMatches(best.matches, {
            ...options,
            maxDistancePx: defaultAsterismRadius(options),
        });
        matches.sort((a, b) => a.star.mag - b.star.mag || a.distance - b.distance);
        const minMatches = Number.isFinite(options.minMatches) ? options.minMatches : 4;
        const medianDistance = matches.length ? median(matches.map(match => match.distance)) : Infinity;
        const status = matches.length >= minMatches ?
            `auto-identify: asterism matched ${matches.length} stars <= mag ${maxMagnitude.toFixed(1)}, ` +
                `median residual ${medianDistance.toFixed(1)} px, scored ${scored} triangle transforms` :
            `auto-identify: asterism matcher found only ${matches.length} plausible stars; ` +
                "try rough-aligning or masking bright non-star regions";
        return {
            matches,
            rawMatches: best.matches,
            catalog,
            detections: normalizedDetections,
            transform: best.transform,
            medianDistance,
            status,
            scoredTransforms: scored,
            catalogTriangleCount: catalogTriangles.length,
            detectionTriangleCount: detectionTriangles.length,
        };
    }

    function identifyStarsBlind(catalogStars, detections, options = {}) {
        const maxMagnitude = Number.isFinite(options.maxMagnitude) ? options.maxMagnitude : 4.0;
        const catalog = catalogStars
            .filter((star, index) =>
                Number.isFinite(star.az) && Number.isFinite(star.ze) &&
                Number.isFinite(star.mag) && star.mag <= maxMagnitude &&
                !setHas(options.existingCatalogKeys, starKey(star, index))
            )
            .map((star, index) => ({
                ...star,
                key: starKey(star, index),
                vector: skyVector(star),
                rank: index + 1,
            }))
            .sort((a, b) => a.mag - b.mag || a.key.localeCompare(b.key))
            .slice(0, Number.isFinite(options.maxCatalogStars) ? options.maxCatalogStars : 220)
            .map((star, index) => ({...star, rank: index + 1}));
        const catalogKeys = new Set(catalog.map(star => star.key));
        const ambiguityMagnitude = Number.isFinite(options.ambiguityMaxMagnitude) ?
            Math.max(maxMagnitude, options.ambiguityMaxMagnitude) :
            maxMagnitude;
        const ambiguityCatalog = ambiguityMagnitude > maxMagnitude ?
            catalogStars
                .filter((star, index) =>
                    Number.isFinite(star.az) && Number.isFinite(star.ze) &&
                    Number.isFinite(star.mag) && star.mag <= ambiguityMagnitude &&
                    !setHas(options.existingCatalogKeys, starKey(star, index))
                )
                .map((star, index) => ({
                    ...star,
                    key: starKey(star, index),
                    vector: skyVector(star),
                    rank: index + 1,
                    ambiguityOnly: !catalogKeys.has(starKey(star, index)),
                }))
                .filter(star => star.vector && !catalogKeys.has(star.key))
                .sort((a, b) => a.mag - b.mag || a.key.localeCompare(b.key))
                .slice(0, Number.isFinite(options.maxAmbiguityCatalogStars) ?
                    options.maxAmbiguityCatalogStars : 260) :
            [];
        const normalizedDetections = normalizeDetections(detections, {
            ...options,
            maxDetections: Number.isFinite(options.maxDetections) ? options.maxDetections : 80,
        });
        if (catalog.length < 6 || normalizedDetections.length < 6) {
            return {
                matches: [],
                rawMatches: [],
                catalog,
                detections: normalizedDetections,
                status: "auto-identify: not enough bright stars for blind spherical matching",
            };
        }

        const f1Candidates = Array.isArray(options.preflattenF1Candidates) ?
            options.preflattenF1Candidates : [0.70, 0.85, 1.00];
        const radialCandidates = Array.isArray(options.preflattenRadialAlphaCandidates) ?
            options.preflattenRadialAlphaCandidates : [0.30, 0.60, 0.90];
        const fixedDu = Number.isFinite(options.preflattenDu) ? options.preflattenDu : 0;
        const fixedDv = Number.isFinite(options.preflattenDv) ? options.preflattenDv : 0;
        const duCandidates = [fixedDu];
        const dvCandidates = [fixedDv];
        const signCandidates = Array.isArray(options.preflattenSignCandidates) ?
            options.preflattenSignCandidates : [[1, 1], [-1, -1]];
        const modelCandidates = Array.isArray(options.preflattenModelCandidates) ?
            options.preflattenModelCandidates :
            ["pinhole", "fisheye"];
        const signatureRadius = Number.isFinite(options.blindTriangleSignatureRadius) ?
            options.blindTriangleSignatureRadius : 0.018;
        const maxNeighborTriangles = Number.isFinite(options.maxBlindNeighborTriangles) ?
            options.maxBlindNeighborTriangles : 4;
        const maxCandidateRotations = Number.isFinite(options.maxBlindCandidateRotations) ?
            options.maxBlindCandidateRotations : 6000;
        const maxCandidateRotationsPerSign = Number.isFinite(options.maxBlindCandidateRotationsPerSign) ?
            options.maxBlindCandidateRotationsPerSign :
            maxCandidateRotations;
        const maxCandidateRotationsTotal = maxCandidateRotationsPerSign * Math.max(1, signCandidates.length);

        const catalogTriangles = sphericalTriangleRecords(catalog, {
            maxTriangles: Number.isFinite(options.maxCatalogTriangles) ? options.maxCatalogTriangles : 30000,
            maxTrianglePoints: Number.isFinite(options.maxCatalogTriangleStars) ?
                options.maxCatalogTriangleStars : catalog.length,
            localNeighborPoolSize: Number.isFinite(options.maxCatalogLocalNeighbors) ?
                options.maxCatalogLocalNeighbors : 20,
            localTriangleMaxSideDeg: Number.isFinite(options.maxCatalogLocalTriangleSideDeg) ?
                options.maxCatalogLocalTriangleSideDeg : 70,
        });
        const catalogTriangleTree = new KdTree2(catalogTriangles.map((triangle, index) => ({
            x: triangle.x,
            y: triangle.y,
            payload: {...triangle, index},
        })));

        let best = null;
        let scored = 0;
        let preflattenCount = 0;
        let earlyAccepted = false;
        const seen = new Set();
        for (const modelCandidate of modelCandidates) {
            const preflattenModel = modelCandidate === "pinhole" ? "pinhole" : "fisheye";
            for (const signPair of signCandidates) {
                const signX = Array.isArray(signPair) && signPair[0] === -1 ? -1 : 1;
                const signY = Array.isArray(signPair) && signPair[1] === -1 ? -1 : 1;
                let signScored = 0;
                for (const f1 of f1Candidates) {
                    for (const radialAlpha of radialCandidates) {
                        for (const du of duCandidates) {
                            for (const dv of dvCandidates) {
                                const vectorOptions = {
                                    ...options,
                                    preflattenDu: du,
                                    preflattenDv: dv,
                                    preflattenSignX: signX,
                                    preflattenSignY: signY,
                                    preflattenModel,
                                };
                                const vectorDetections = normalizedDetections
                                    .map((detection, index) => ({
                                        ...detection,
                                        vector: preflattenDetectionVector(detection, vectorOptions, f1, radialAlpha, preflattenModel),
                                        rank: index + 1,
                                    }))
                                    .filter(detection => detection.vector);
                                if (vectorDetections.length < 6) {
                                    continue;
                                }
                                preflattenCount += 1;
                                const detectionTriangles = sphericalTriangleRecords(vectorDetections, {
                                    maxTriangles: Number.isFinite(options.maxDetectionTriangles) ? options.maxDetectionTriangles : 1400,
                                    maxTrianglePoints: Number.isFinite(options.maxDetectionTriangleStars) ? options.maxDetectionTriangleStars : 40,
                                });
                                for (const detectionTriangle of detectionTriangles) {
                                    const neighbors = catalogTriangleTree.range(detectionTriangle.x, detectionTriangle.y, signatureRadius)
                                        .slice(0, maxNeighborTriangles);
                                    for (const neighbor of neighbors) {
                                        if (scored >= maxCandidateRotationsTotal ||
                                                signScored >= maxCandidateRotationsPerSign) {
                                            break;
                                        }
                                        const catalogTriangle = neighbor.payload;
                                        const rot = rotationFromVectorPairs(
                                            detectionTriangle.points[0].vector,
                                            detectionTriangle.points[1].vector,
                                            catalogTriangle.points[0].vector,
                                            catalogTriangle.points[1].vector,
                                        );
                                        if (!rot) {
                                            continue;
                                        }
                                        const thirdError = angularDistance(
                                            applyRot3(rot, detectionTriangle.points[2].vector),
                                            catalogTriangle.points[2].vector,
                                        );
                                        if (thirdError > (Number.isFinite(options.maxBlindTriangleThirdErrorDeg) ?
                                                options.maxBlindTriangleThirdErrorDeg : 1.2) * Math.PI / 180) {
                                            continue;
                                        }
                                        const key = [
                                            preflattenModel,
                                            signX,
                                            signY,
                                            Math.round(f1 * 100),
                                            Math.round(radialAlpha * 100),
                                            Math.round(du * 1000),
                                            Math.round(dv * 1000),
                                        ].concat(rot.map(value => Math.round(value * 200))).join(",");
                                        if (seen.has(key)) {
                                            continue;
                                        }
                                        seen.add(key);
                                        let candidate = scoreBlindRotation(catalog, vectorDetections, rot, {
                                            ...options,
                                            ambiguityCatalog,
                                        });
                                        const seedMedian = candidate.matches.length ?
                                            median(candidate.matches.map(match => match.distance)) : Infinity;
                                        if (candidate.matches.length >= 5 && seedMedian <= 1.6) {
                                            candidate = refineBlindRotation(catalog, vectorDetections, rot, options);
                                        }
                                        scored += 1;
                                        signScored += 1;
                                        if (!best || candidate.score > best.score) {
                                            best = {
                                                ...candidate,
                                                rotation: candidate.rotation || rot,
                                                f1,
                                                radialAlpha,
                                                du,
                                                dv,
                                                signX,
                                                signY,
                                                preflattenModel,
                                                vectorDetections,
                                                detectionTriangleCount: detectionTriangles.length,
                                            };
                                        }
                                        const candidateMedian = candidate.matches.length ?
                                            median(candidate.matches.map(match => match.distance)) : Infinity;
                                        if (candidate.matches.length >=
                                                (Number.isFinite(options.blindEarlyAcceptMatches) ? options.blindEarlyAcceptMatches : 14) &&
                                                candidateMedian <=
                                                (Number.isFinite(options.blindEarlyAcceptMedianDeg) ? options.blindEarlyAcceptMedianDeg : 0.5)) {
                                            earlyAccepted = true;
                                            break;
                                        }
                                    }
                                    if (earlyAccepted || scored >= maxCandidateRotationsTotal ||
                                            signScored >= maxCandidateRotationsPerSign) {
                                        break;
                                    }
                                }
                                if (earlyAccepted || scored >= maxCandidateRotationsTotal ||
                                        signScored >= maxCandidateRotationsPerSign) {
                                    break;
                                }
                            }
                            if (earlyAccepted || scored >= maxCandidateRotationsTotal ||
                                    signScored >= maxCandidateRotationsPerSign) {
                                break;
                            }
                        }
                        if (earlyAccepted || scored >= maxCandidateRotationsTotal ||
                                signScored >= maxCandidateRotationsPerSign) {
                            break;
                        }
                    }
                    if (earlyAccepted || scored >= maxCandidateRotationsTotal ||
                            signScored >= maxCandidateRotationsPerSign) {
                        break;
                    }
                }
                if (earlyAccepted || scored >= maxCandidateRotationsTotal) {
                    break;
                }
            }
            if (earlyAccepted || scored >= maxCandidateRotationsTotal) {
                break;
            }
        }

        if (!best) {
            return {
                matches: [],
                rawMatches: [],
                catalog,
                detections: normalizedDetections,
                status: "auto-identify: blind spherical matcher found no candidate rotations",
                scoredRotations: scored,
                preflattenCount,
            };
        }
        best = refineBlindPreflatten(catalog, normalizedDetections, best, {
            ...options,
            ambiguityCatalog,
        });
        best = expandBlindPixelMatches(catalog, best.vectorDetections || normalizedDetections, best, {
            ...options,
            ambiguityCatalog,
        });
        const minMatches = Number.isFinite(options.minMatches) ? options.minMatches : 6;
        const medianDistance = best.matches.length ? median(best.matches.map(match => match.distance)) : Infinity;
        const status = best.matches.length >= minMatches ?
            `auto-identify: blind spherical matched ${best.matches.length} stars <= mag ${maxMagnitude.toFixed(1)}, ` +
                `median angular residual ${medianDistance.toFixed(2)} deg, preflatten f1 ${best.f1.toFixed(2)}, ` +
                `a ${best.radialAlpha.toFixed(2)}, sign ${best.signX || 1}/${best.signY || 1}, ` +
                `du/dv ${best.du.toFixed(2)}/${best.dv.toFixed(2)}, ` +
                `scored ${scored} rotations` :
            `auto-identify: blind spherical matcher found only ${best.matches.length} plausible stars`;
        return {
            matches: best.matches,
            rawMatches: best.matches,
            catalog,
            detections: normalizedDetections,
            rotation: best.rotation,
            f1: best.f1,
            radialAlpha: best.radialAlpha,
            signX: best.signX || 1,
            signY: best.signY || 1,
            du: best.du,
            dv: best.dv,
            medianDistance,
            score: best.score,
            distractors: best.distractors,
            conflicts: best.conflicts,
            status,
            scoredRotations: scored,
            preflattenCount,
            catalogTriangleCount: catalogTriangles.length,
            detectionTriangleCount: best.detectionTriangleCount,
        };
    }

    return {
        identifyStars,
        identifyStarsByAsterisms,
        identifyStarsBlind,
        estimateTranslation,
        normalizeProjectedStars,
        normalizeDetections,
        KdTree2,
        greedyMatch,
        robustFilterMatches,
    };
});
