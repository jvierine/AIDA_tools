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
            out.push({...star, x, y, mag, key, sourceIndex: i});
        }
        out.sort((a, b) => a.mag - b.mag || a.key.localeCompare(b.key));
        return out.slice(0, maxStars);
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

    return {
        identifyStars,
        estimateTranslation,
        normalizeProjectedStars,
        normalizeDetections,
        greedyMatch,
        robustFilterMatches,
    };
});
