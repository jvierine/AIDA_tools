(function (root, factory) {
    "use strict";

    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.AidaStarDetector = factory();
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function median(values) {
        if (!values.length) {
            return 0;
        }
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
    }

    function grayAt(data, width, x, y) {
        const k = 4 * (y * width + x);
        return 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
    }

    function isStrictLocalMaximum(data, width, x, y, value) {
        let equal = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                const neighbor = grayAt(data, width, x + dx, y + dy);
                if (neighbor > value) {
                    return false;
                }
                if (neighbor === value) {
                    equal += 1;
                }
            }
        }
        return equal <= 1;
    }

    function weightedCentroid(pixelData, cx, cy, radius, background, maskPredicate = null) {
        const width = pixelData.width;
        const height = pixelData.height;
        const data = pixelData.data;
        let sum = 0;
        let sx = 0;
        let sy = 0;
        const sigma2 = Math.max(1, Math.pow(radius / 1.7, 2));
        for (let dy = -radius; dy <= radius; dy += 1) {
            const y = Math.max(0, Math.min(height - 1, cy + dy));
            for (let dx = -radius; dx <= radius; dx += 1) {
                const r2 = dx * dx + dy * dy;
                if (r2 > radius * radius) {
                    continue;
                }
                const x = Math.max(0, Math.min(width - 1, cx + dx));
                if (maskPredicate && maskPredicate(x, y)) {
                    continue;
                }
                const value = grayAt(data, width, x, y);
                const weight = Math.max(0, value - background) * Math.exp(-0.5 * r2 / sigma2);
                sum += weight;
                sx += weight * x;
                sy += weight * y;
            }
        }
        return sum > 1e-9 ? {x: sx / sum, y: sy / sum} : {x: cx, y: cy};
    }

    function localAnnulusStats(pixelData, cx, cy, inner, outer, maskPredicate = null) {
        const width = pixelData.width;
        const height = pixelData.height;
        const data = pixelData.data;
        const samples = [];
        const outerCeil = Math.ceil(outer);
        for (let dy = -outerCeil; dy <= outerCeil; dy += 1) {
            const y = cy + dy;
            if (y < 0 || y >= height) {
                continue;
            }
            for (let dx = -outerCeil; dx <= outerCeil; dx += 1) {
                const x = cx + dx;
                if (x < 0 || x >= width || maskPredicate && maskPredicate(x, y)) {
                    continue;
                }
                const r = Math.hypot(dx, dy);
                if (r >= inner && r <= outer) {
                    samples.push(grayAt(data, width, x, y));
                }
            }
        }
        if (!samples.length) {
            return {background: 0, sigma: 1};
        }
        const background = median(samples);
        const sigma = Math.max(1, 1.4826 * median(samples.map(value => Math.abs(value - background))));
        return {background, sigma};
    }

    function apertureShape(pixelData, cx, cy, radius, background, maskPredicate = null) {
        const width = pixelData.width;
        const height = pixelData.height;
        const data = pixelData.data;
        let flux = 0;
        let moment = 0;
        let mxx = 0;
        let myy = 0;
        let mxy = 0;
        let saturated = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
            const y = Math.max(0, Math.min(height - 1, cy + dy));
            for (let dx = -radius; dx <= radius; dx += 1) {
                if (dx * dx + dy * dy > radius * radius) {
                    continue;
                }
                const x = Math.max(0, Math.min(width - 1, cx + dx));
                if (maskPredicate && maskPredicate(x, y)) {
                    continue;
                }
                const sample = grayAt(data, width, x, y);
                const w = Math.max(0, sample - background);
                flux += w;
                moment += w * (dx * dx + dy * dy);
                mxx += w * dx * dx;
                myy += w * dy * dy;
                mxy += w * dx * dy;
                if (sample >= 252) {
                    saturated += 1;
                }
            }
        }
        if (flux <= 1e-9) {
            return null;
        }
        const radius2 = moment / flux;
        const trace = (mxx + myy) / flux;
        const delta = Math.hypot((mxx - myy) / flux, 2 * mxy / flux);
        const minor = Math.max(1e-6, 0.5 * (trace - delta));
        const major = Math.max(minor, 0.5 * (trace + delta));
        return {
            flux,
            radius: Math.sqrt(Math.max(0, radius2)),
            elongation: Math.sqrt(major / minor),
            saturated,
        };
    }

    function selectSuppressedCandidates(candidates, maxDetections, suppressionRadius) {
        const selected = [];
        const suppression2 = suppressionRadius * suppressionRadius;
        for (const candidate of candidates) {
            let tooClose = false;
            for (const existing of selected) {
                const dx = existing.x - candidate.x;
                const dy = existing.y - candidate.y;
                if (dx * dx + dy * dy < suppression2) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                selected.push({...candidate, id: selected.length + 1});
            }
            if (selected.length >= maxDetections) {
                break;
            }
        }
        return selected.map((detection, index) => ({...detection, rank: index + 1}));
    }

    async function maybeYield(options, percent, text, force = false) {
        if (typeof options.onProgress === "function") {
            options.onProgress(percent, text);
        }
        if (typeof options.yieldFn === "function" && force) {
            await options.yieldFn();
        }
    }

    async function detectBrightStars(pixelData, options = {}) {
        const width = pixelData.width;
        const height = pixelData.height;
        const data = pixelData.data;
        const maxDetections = Number.isFinite(options.maxDetections) ? options.maxDetections : 50;
        const maskPredicate = typeof options.maskPredicate === "function" ? options.maskPredicate : null;
        const scanStep = Number.isFinite(options.scanStep) ? options.scanStep :
            width * height >= 8000000 ? 2 : 1;
        const cellSize = Number.isFinite(options.cellSize) ? options.cellSize :
            width * height >= 8000000 ? 16 : 12;
        const cellsX = Math.ceil(width / cellSize);
        const cellsY = Math.ceil(height / cellSize);
        const cellPeaks = Array.from({length: cellsX * cellsY}, () => ({value: -Infinity, x: 0, y: 0}));
        const samples = [];
        for (let y = 4; y < height; y += 8) {
            for (let x = 4; x < width; x += 8) {
                if (!maskPredicate || !maskPredicate(x, y)) {
                    samples.push(grayAt(data, width, x, y));
                }
            }
        }
        const bg = median(samples);
        const sigma = Math.max(1, 1.4826 * median(samples.map(value => Math.abs(value - bg))));
        const globalThreshold = bg + Math.max(
            Number.isFinite(options.minPeakAboveBg) ? options.minPeakAboveBg : 4,
            (Number.isFinite(options.thresholdSigma) ? options.thresholdSigma : 2.5) * sigma
        );
        const scanThreshold = bg + Math.max(
            Number.isFinite(options.minPeakAboveBg) ? options.minPeakAboveBg : 4,
            (Number.isFinite(options.scanThresholdSigma) ? options.scanThresholdSigma : 0.5) * sigma
        );

        await maybeYield(options, 25, "Scanning image for local star peaks...", true);
        let lastYield = typeof performance === "object" && performance.now ? performance.now() : Date.now();
        let scannedLocalPeaks = 0;
        for (let y = 2; y < height - 2; y += scanStep) {
            for (let x = 2; x < width - 2; x += scanStep) {
                if (maskPredicate && maskPredicate(x, y)) {
                    continue;
                }
                const value = grayAt(data, width, x, y);
                if (value < scanThreshold || !isStrictLocalMaximum(data, width, x, y, value)) {
                    continue;
                }
                scannedLocalPeaks += 1;
                const cellIndex = Math.floor(y / cellSize) * cellsX + Math.floor(x / cellSize);
                if (value > cellPeaks[cellIndex].value) {
                    cellPeaks[cellIndex] = {value, x, y};
                }
            }
            const now = typeof performance === "object" && performance.now ? performance.now() : Date.now();
            if (now - lastYield > 35) {
                await maybeYield(options, 25 + 40 * y / height, `Scanning bright peaks: ${Math.round(100 * y / height)}%`, true);
                lastYield = now;
            }
        }

        await maybeYield(options, 70, "Measuring star-like peak shape...", true);
        const candidates = [];
        const annulusInner = Number.isFinite(options.annulusInnerPx) ? options.annulusInnerPx : 6;
        const annulusOuter = Number.isFinite(options.annulusOuterPx) ? options.annulusOuterPx : 12;
        const centroidRadius = Number.isFinite(options.centroidRadiusPx) ? options.centroidRadiusPx : 5;
        const apertureRadius = Number.isFinite(options.apertureRadiusPx) ? options.apertureRadiusPx : 5;
        const minLocalSigma = Number.isFinite(options.localThresholdSigma) ? options.localThresholdSigma : 2.5;
        const maxRadius = Number.isFinite(options.maxRadiusPx) ? options.maxRadiusPx : 3.0;
        const maxElongation = Number.isFinite(options.maxElongation) ? options.maxElongation : 2.7;
        const maxSaturated = Number.isFinite(options.maxSaturatedPixels) ? options.maxSaturatedPixels : 12;
        const requireGlobalThreshold = options.requireGlobalThreshold === true;
        const rejectCounts = {
            belowScanThreshold: 0,
            belowGlobalThreshold: 0,
            belowLocalContrast: 0,
            invalidCentroid: 0,
            nonStarShape: 0,
        };

        for (const peak of cellPeaks) {
            if (!Number.isFinite(peak.value) || peak.value < scanThreshold) {
                rejectCounts.belowScanThreshold += 1;
                continue;
            }
            if (requireGlobalThreshold && peak.value < globalThreshold) {
                rejectCounts.belowGlobalThreshold += 1;
                continue;
            }
            const annulus = localAnnulusStats(pixelData, peak.x, peak.y, annulusInner, annulusOuter, maskPredicate);
            const contrast = peak.value - annulus.background;
            const localSnr = contrast / Math.max(1e-9, annulus.sigma);
            const globalSnr = (peak.value - bg) / Math.max(1e-9, sigma);
            if (contrast < Math.max(5, minLocalSigma * annulus.sigma)) {
                rejectCounts.belowLocalContrast += 1;
                continue;
            }
            const centroid = weightedCentroid(pixelData, peak.x, peak.y, centroidRadius, annulus.background, maskPredicate);
            if (!Number.isFinite(centroid.x) || !Number.isFinite(centroid.y)) {
                rejectCounts.invalidCentroid += 1;
                continue;
            }
            const cx = Math.round(centroid.x);
            const cy = Math.round(centroid.y);
            const shape = apertureShape(pixelData, cx, cy, apertureRadius, annulus.background, maskPredicate);
            if (!shape || shape.radius < 0.25 || shape.radius > maxRadius ||
                    shape.elongation > maxElongation || shape.saturated > maxSaturated) {
                rejectCounts.nonStarShape += 1;
                continue;
            }
            const compactness = contrast / Math.pow(Math.max(1, shape.radius), 2.2);
            const saturationPenalty = 1 + 0.18 * shape.saturated;
            const score = compactness * Math.sqrt(Math.max(1, shape.flux)) /
                (Math.max(1, shape.elongation) * saturationPenalty);
            candidates.push({
                x: centroid.x,
                y: centroid.y,
                peakValue: peak.value,
                peakContrast: contrast,
                localSigma: annulus.sigma,
                localSnr,
                globalSnr,
                peak: peak.value,
                flux: shape.flux,
                background: annulus.background,
                radius: shape.radius,
                elongation: shape.elongation,
                saturated: shape.saturated,
                score,
            });
        }
        candidates.sort((a, b) => b.score - a.score);
        const suppressionRadius = Number.isFinite(options.suppressionRadiusPx) ?
            options.suppressionRadiusPx :
            Math.max(18, Math.min(60, 0.010 * Math.hypot(width, height)));
        const detections = selectSuppressedCandidates(candidates, maxDetections, suppressionRadius);
        return {
            detections,
            candidates,
            bg,
            sigma,
            globalThreshold,
            scanThreshold,
            scannedLocalPeaks,
            rejectCounts,
            status: `bright-star detector: bg ${bg.toFixed(1)}, sigma ${sigma.toFixed(1)}, ` +
                `thresholds scan/global ${scanThreshold.toFixed(1)}/${globalThreshold.toFixed(1)}, ` +
                `${scannedLocalPeaks} local peaks, ${candidates.length} star-like candidates, ` +
                `selected top ${detections.length}/${maxDetections}, suppression radius ${suppressionRadius.toFixed(0)} px`,
        };
    }

    return {
        detectBrightStars,
        grayAt,
        median,
    };
});
