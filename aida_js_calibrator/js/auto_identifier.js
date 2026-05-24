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

    function optmod2DetectionVector(detection, options, f1, radialAlpha) {
        const width = finiteNumber(options.imageWidth, 0);
        const height = finiteNumber(options.imageHeight, 0);
        if (!(width > 0 && height > 0 && f1 > 0 && radialAlpha > 0)) {
            return null;
        }
        const f2 = Number.isFinite(options.preflattenF2) ? options.preflattenF2 : f1 * width / height;
        const du = Number.isFinite(options.preflattenDu) ? options.preflattenDu : 0;
        const dv = Number.isFinite(options.preflattenDv) ? options.preflattenDv : 0;
        const xn = ((detection.x + 1) / width - 0.5 - du) / f1;
        const yn = ((detection.y + 1) / height - 0.5 - dv) / f2;
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

    function sphericalTriangleRecords(points, options = {}) {
        const maxTriangles = Number.isFinite(options.maxTriangles) ? options.maxTriangles : 4000;
        const maxPoints = Number.isFinite(options.maxTrianglePoints) ? options.maxTrianglePoints : points.length;
        const p = points.slice(0, maxPoints);
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

    function scoreBlindRotation(catalog, detections, rot, options = {}) {
        const radius = (Number.isFinite(options.blindMatchRadiusDeg) ? options.blindMatchRadiusDeg : 2.2) * Math.PI / 180;
        const radius2 = radius * radius;
        const usedStars = new Set();
        const matches = [];
        let distractors = 0;
        let conflicts = 0;
        let score = 0;
        const maxTest = Number.isFinite(options.maxBlindVerifyDetections) ? options.maxBlindVerifyDetections : 55;
        const dets = detections.slice(0, maxTest);
        for (const detection of dets) {
            const transformed = applyRot3(rot, detection.vector);
            let best = null;
            let bestD = Infinity;
            let secondD = Infinity;
            for (const star of catalog) {
                const d = angularDistance(transformed, star.vector);
                if (d < bestD) {
                    secondD = bestD;
                    bestD = d;
                    best = star;
                } else if (d < secondD) {
                    secondD = d;
                }
            }
            if (!best || bestD * bestD > radius2) {
                distractors += 1;
                score -= 0.20;
                continue;
            }
            if (usedStars.has(best.key)) {
                conflicts += 1;
                score -= 1.5;
                continue;
            }
            usedStars.add(best.key);
            const bright = Math.max(0, 4.2 - best.mag) / 4.2;
            const detRank = Number.isFinite(detection.rank) ? detection.rank : 99;
            const rankAgreement = 1 - Math.min(1, Math.abs(best.rank - detRank) / 55);
            const ambiguityPenalty = secondD < radius * 1.8 ? 0.35 : 0;
            score += 4.0 + 5.0 * bright + 1.2 * rankAgreement - 2.5 * bestD / radius - ambiguityPenalty;
            matches.push({
                star: best,
                detection,
                distance: bestD * 180 / Math.PI,
                angularDistanceRad: bestD,
                projectedX: detection.x,
                projectedY: detection.y,
                correctedX: detection.x,
                correctedY: detection.y,
                residualDx: 0,
                residualDy: 0,
            });
        }
        matches.sort((a, b) => a.star.mag - b.star.mag || a.angularDistanceRad - b.angularDistanceRad);
        return {score, matches, distractors, conflicts};
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

        const usedStars = new Set();
        const usedDetections = new Set();
        const matches = [];
        for (const candidate of candidates) {
            if (usedStars.has(candidate.star.key) || usedDetections.has(candidate.detection.id)) {
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

        const catalogTriangles = triangleRecords(catalog, {
            maxTriangles: Number.isFinite(options.maxCatalogTriangles) ? options.maxCatalogTriangles : 9000,
            maxTrianglePoints: Number.isFinite(options.maxCatalogTriangleStars) ? options.maxCatalogTriangleStars : 80,
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
            .slice(0, Number.isFinite(options.maxCatalogStars) ? options.maxCatalogStars : 80)
            .map((star, index) => ({...star, rank: index + 1}));
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
            options.preflattenF1Candidates : [0.80, 0.70, 0.90, 1.00, 0.60];
        const radialCandidates = Array.isArray(options.preflattenRadialAlphaCandidates) ?
            options.preflattenRadialAlphaCandidates : [0.90, 0.75, 1.05, 0.60];
        const duCandidates = Array.isArray(options.preflattenDuCandidates) ?
            options.preflattenDuCandidates : [0.04, 0.0, -0.04];
        const dvCandidates = Array.isArray(options.preflattenDvCandidates) ?
            options.preflattenDvCandidates : [0.0, 0.04, -0.04];
        const signatureRadius = Number.isFinite(options.blindTriangleSignatureRadius) ?
            options.blindTriangleSignatureRadius : 0.018;
        const maxNeighborTriangles = Number.isFinite(options.maxBlindNeighborTriangles) ?
            options.maxBlindNeighborTriangles : 4;
        const maxCandidateRotations = Number.isFinite(options.maxBlindCandidateRotations) ?
            options.maxBlindCandidateRotations : 6000;

        const catalogTriangles = sphericalTriangleRecords(catalog, {
            maxTriangles: Number.isFinite(options.maxCatalogTriangles) ? options.maxCatalogTriangles : 7000,
            maxTrianglePoints: Number.isFinite(options.maxCatalogTriangleStars) ? options.maxCatalogTriangleStars : 55,
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
        for (const f1 of f1Candidates) {
            for (const radialAlpha of radialCandidates) {
                for (const du of duCandidates) {
                    for (const dv of dvCandidates) {
                        const vectorOptions = {...options, preflattenDu: du, preflattenDv: dv};
                        const vectorDetections = normalizedDetections
                            .map((detection, index) => ({
                                ...detection,
                                vector: optmod2DetectionVector(detection, vectorOptions, f1, radialAlpha),
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
                                if (scored >= maxCandidateRotations) {
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
                                    Math.round(f1 * 100),
                                    Math.round(radialAlpha * 100),
                                    Math.round(du * 1000),
                                    Math.round(dv * 1000),
                                ].concat(rot.map(value => Math.round(value * 200))).join(",");
                                if (seen.has(key)) {
                                    continue;
                                }
                                seen.add(key);
                                const candidate = scoreBlindRotation(catalog, vectorDetections, rot, options);
                                scored += 1;
                                if (!best || candidate.score > best.score) {
                                    best = {
                                        ...candidate,
                                        rotation: rot,
                                        f1,
                                        radialAlpha,
                                        du,
                                        dv,
                                        detectionTriangleCount: detectionTriangles.length,
                                    };
                                }
                                const candidateMedian = candidate.matches.length ?
                                    median(candidate.matches.map(match => match.distance)) : Infinity;
                                if (candidate.matches.length >=
                                        (Number.isFinite(options.blindEarlyAcceptMatches) ? options.blindEarlyAcceptMatches : 8) &&
                                        candidateMedian <=
                                        (Number.isFinite(options.blindEarlyAcceptMedianDeg) ? options.blindEarlyAcceptMedianDeg : 0.8)) {
                                    earlyAccepted = true;
                                    break;
                                }
                            }
                            if (earlyAccepted || scored >= maxCandidateRotations) {
                                break;
                            }
                        }
                        if (earlyAccepted || scored >= maxCandidateRotations) {
                            break;
                        }
                    }
                    if (earlyAccepted || scored >= maxCandidateRotations) {
                        break;
                    }
                }
                if (earlyAccepted || scored >= maxCandidateRotations) {
                    break;
                }
            }
            if (earlyAccepted || scored >= maxCandidateRotations) {
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
        const minMatches = Number.isFinite(options.minMatches) ? options.minMatches : 6;
        const medianDistance = best.matches.length ? median(best.matches.map(match => match.distance)) : Infinity;
        const status = best.matches.length >= minMatches ?
            `auto-identify: blind spherical matched ${best.matches.length} stars <= mag ${maxMagnitude.toFixed(1)}, ` +
                `median angular residual ${medianDistance.toFixed(2)} deg, preflatten f1 ${best.f1.toFixed(2)}, ` +
                `a ${best.radialAlpha.toFixed(2)}, du/dv ${best.du.toFixed(2)}/${best.dv.toFixed(2)}, ` +
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
