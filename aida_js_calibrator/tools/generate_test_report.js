#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const vm = require("node:vm");
const zlib = require("node:zlib");

const AutoIdentifier = require("../js/auto_identifier.js");
const StarDetector = require("../js/star_detector.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "test-report");
const ALLSKY_DIR = path.join(ROOT, "allsky7");
const IMAGE_DIR = path.join(ROOT, "calibration_images");
const DEG = Math.PI / 180;

function loadBrowserScript(filename) {
    const source = fs.readFileSync(path.join(ROOT, "js", filename), "utf8");
    const context = {
        window: {},
        Math,
        Date,
        Number,
        Array,
        Uint8Array,
        ArrayBuffer,
        DataView,
    };
    vm.createContext(context);
    vm.runInContext(source, context, {filename});
    return context.window;
}

const AidaTools = loadBrowserScript("aidatools.js").AidaTools;
const YaleCatalog = loadBrowserScript("star_catalog.js").AIDA_STAR_CATALOG;

const HUMAN_REVIEW_NOTES = new Map([
    ["2025_02_19_03_47_01_000_010881_ams0882_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_47_01_000_010028_ams0228_first1s", {
        status: "outliers",
        note: "human review: fit is quite good, but a few automatic star identifications are outliers",
    }],
    ["2025_02_19_03_46_01_000_010881_ams0882_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_46_01_000_010031_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_46_01_000_010031_ams0221_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_46_01_000_010028_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_46_01_000_010028_ams0228_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_46_00_000_010880_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_46_00_000_010880_ams0881_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_45_01_000_010314_cam5_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_45_00_000_010125_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_45_00_000_010095_first1s", {
        status: "good",
        note: "human review: automatic detection and fit look good",
    }],
    ["2025_02_19_03_46_00_000_010096_first1s", {
        status: "outliers",
        note: "human review: fit is useful, but a few stars are wrongly identified; use this as outlier-pruning feedback",
    }],
]);

const MANUAL_CASES = [
    {
        id: "IMG-9371-brown-conrady",
        title: "IMG_9371 Brown-Conrady",
        image: "IMG_9371.png",
        width: 3024,
        height: 4032,
        date: new Date(Date.UTC(2024, 9, 19, 17, 29, 8)),
        latDeg: 69.600625,
        lonDeg: 18.961947,
        altM: 384.3,
        optmod: 20,
        maxMag: 7.0,
        matchRadiusPx: 18,
        sweepCounts: [8, 10, 12, 14],
        detectorOptions: {
            maxDetections: 120,
            thresholdSigma: 2,
            localThresholdSigma: 2,
            maxRadiusPx: 4,
            maxElongation: 3.5,
        },
        startMode: "perturbed",
        optpar: [
            1.411641, 1.052995, -79.7, -27.0, 93.0, -0.006571,
            0.014468, 0.239385, -0.846254, 1.042227, -0.000576, -0.003371,
        ],
    },
];

function timestampFromAllskyName(filename) {
    const match = filename.match(/(20\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{3})/);
    if (!match) {
        return null;
    }
    const [, year, month, day, hour, minute, second, millisecond] = match;
    return new Date(Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        Number(millisecond),
    ));
}

function h5DatasetNumbers(h5Path, dataset) {
    const text = childProcess.execFileSync(
        "h5dump",
        ["-y", "-w", "0", "-m", "%.17g", "-d", dataset, h5Path],
        {encoding: "utf8"},
    );
    const dataMatch = text.match(/DATA\s*\{([\s\S]*?)\n\s*\}/);
    if (!dataMatch) {
        throw new Error(`${h5Path}: missing DATA block for ${dataset}`);
    }
    return Array.from(
        dataMatch[1].matchAll(/[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?/g),
        match => Number(match[0]),
    );
}

function sanitizeId(value) {
    return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function copyIfDifferent(source, destination) {
    if (fs.existsSync(destination)) {
        const srcStat = fs.statSync(source);
        const dstStat = fs.statSync(destination);
        if (srcStat.size === dstStat.size) {
            return;
        }
    }
    fs.copyFileSync(source, destination);
}

function allskyCaseFromH5(h5Path) {
    const pngName = path.basename(h5Path, ".h5") + ".png";
    const sourcePng = path.join(ALLSKY_DIR, pngName);
    if (!fs.existsSync(sourcePng)) {
        return null;
    }
    fs.mkdirSync(IMAGE_DIR, {recursive: true});
    copyIfDifferent(sourcePng, path.join(IMAGE_DIR, pngName));
    const imageHeader = readPngImageData(sourcePng, true);
    const optpar = h5DatasetNumbers(h5Path, "/optpar");
    const date = timestampFromAllskyName(pngName);
    if (!date || optpar.length < 8) {
        return null;
    }
    const latDeg = h5DatasetNumbers(h5Path, "/camera_lat_deg")[0];
    const lonDeg = h5DatasetNumbers(h5Path, "/camera_lon_deg")[0];
    const optmod = optpar.length === 12 ? 20 : 2;
    const id = sanitizeId(path.basename(h5Path, ".h5"));
    return {
        id,
        title: `${path.basename(pngName, ".png")} optmod ${optmod}`,
        image: pngName,
        sourceH5: path.relative(ROOT, h5Path),
        width: imageHeader.width,
        height: imageHeader.height,
        date,
        latDeg,
        lonDeg,
        altM: 0,
        optmod,
        maxMag: 7.0,
        matchRadiusPx: 18,
        sweepCounts: [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 50],
        detectorOptions: {
            maxDetections: 80,
            thresholdSigma: 4.417,
            localThresholdSigma: 4.417,
            requireGlobalThreshold: true,
        },
        startMode: "perturbed",
        optpar,
        humanReview: HUMAN_REVIEW_NOTES.get(id) || null,
    };
}

function buildCases() {
    const allskyCases = fs.readdirSync(ALLSKY_DIR)
        .filter(name => name.endsWith("_first1s.h5"))
        .sort((a, b) => a.localeCompare(b))
        .map(name => allskyCaseFromH5(path.join(ALLSKY_DIR, name)))
        .filter(Boolean);
    return allskyCases.concat(MANUAL_CASES);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    }[ch]));
}

function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) {
        return a;
    }
    return pb <= pc ? b : c;
}

function readPngImageData(filename, headerOnly = false) {
    const buffer = fs.readFileSync(filename);
    if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error(`${filename} is not a PNG`);
    }
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idat = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            if (bitDepth !== 8 || data[12] !== 0) {
                throw new Error(`${filename} must be 8-bit non-interlaced PNG`);
            }
            if (headerOnly) {
                return {width, height, data: null};
            }
        } else if (type === "IDAT") {
            idat.push(data);
        } else if (type === "IEND") {
            break;
        }
        offset += 12 + length;
    }
    const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
    if (!channels) {
        throw new Error(`${filename} has unsupported color type ${colorType}`);
    }
    const inflated = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const raw = Buffer.alloc(height * stride);
    let src = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = inflated[src];
        src += 1;
        const row = raw.subarray(y * stride, (y + 1) * stride);
        const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x += 1) {
            const value = inflated[src + x];
            const left = x >= channels ? row[x - channels] : 0;
            const up = prev ? prev[x] : 0;
            const upLeft = prev && x >= channels ? prev[x - channels] : 0;
            row[x] = (value + (
                filter === 0 ? 0 :
                filter === 1 ? left :
                filter === 2 ? up :
                filter === 3 ? Math.floor((left + up) / 2) :
                paethPredictor(left, up, upLeft)
            )) & 0xff;
        }
        src += stride;
    }
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < raw.length; i += channels, j += 4) {
        rgba[j] = raw[i];
        rgba[j + 1] = raw[i + 1];
        rgba[j + 2] = raw[i + 2];
        rgba[j + 3] = channels === 4 ? raw[i + 3] : 255;
    }
    return {width, height, data: rgba};
}

function catalogKey(star) {
    return `${star.name}|${star.raHours.toFixed(7)}|${star.decDeg.toFixed(7)}`;
}

function visibleStars(testCase, maxMag = testCase.maxMag) {
    return AidaTools.visibleStars(YaleCatalog, testCase.date, testCase.latDeg, testCase.lonDeg, maxMag, 88)
        .map(star => ({...star, key: catalogKey(star)}));
}

function projectStars(testCase, optpar = testCase.optpar, maxMag = testCase.maxMag) {
    return visibleStars(testCase, maxMag)
        .map(star => {
            const xy = AidaTools.cameraModel(
                star.az,
                star.ze,
                optpar,
                testCase.optmod,
                testCase.width,
                testCase.height,
            );
            return {...star, x: xy.x, y: xy.y};
        })
        .filter(star => Number.isFinite(star.x) && Number.isFinite(star.y) &&
            star.x >= 0 && star.x < testCase.width && star.y >= 0 && star.y < testCase.height)
        .sort((a, b) => a.mag - b.mag || a.key.localeCompare(b.key));
}

function matchDetectionsToKnownStars(detections, knownStars, maxDistancePx) {
    const pairs = [];
    for (const detection of detections) {
        for (const star of knownStars) {
            const distance = Math.hypot(detection.x - star.x, detection.y - star.y);
            if (distance <= maxDistancePx) {
                pairs.push({detection, star, distance});
            }
        }
    }
    pairs.sort((a, b) => a.distance - b.distance);
    const usedDetections = new Set();
    const usedStars = new Set();
    const matches = [];
    for (const pair of pairs) {
        if (usedDetections.has(pair.detection.id) || usedStars.has(pair.star.key)) {
            continue;
        }
        usedDetections.add(pair.detection.id);
        usedStars.add(pair.star.key);
        matches.push(pair);
    }
    return matches;
}

function knownLensValidationMap(detections, knownStars, maxDistancePx) {
    const matches = matchDetectionsToKnownStars(detections, knownStars, maxDistancePx);
    return {
        matches,
        detectionToStar: new Map(matches.map(match => [match.detection.id, match.star.key])),
        starToDetection: new Map(matches.map(match => [match.star.key, match.detection.id])),
    };
}

function scoreIdentificationAgainstKnownLens(matches, validation) {
    const wrong = [];
    let correct = 0;
    let incorrect = 0;
    let unknown = 0;
    for (const match of matches) {
        const truthKey = validation.detectionToStar.get(match.detection.id);
        if (!truthKey) {
            unknown += 1;
        } else if (truthKey === match.star.key) {
            correct += 1;
        } else {
            incorrect += 1;
            wrong.push({match, truth: truthKey});
        }
    }
    return {total: matches.length, correct, incorrect, unknown, wrong};
}

function solveLinearSystem(a, b) {
    const n = b.length;
    const m = a.map((row, i) => row.slice().concat([b[i]]));
    for (let col = 0; col < n; col += 1) {
        let pivot = col;
        for (let row = col + 1; row < n; row += 1) {
            if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) {
                pivot = row;
            }
        }
        if (Math.abs(m[pivot][col]) < 1e-12) {
            return null;
        }
        if (pivot !== col) {
            const tmp = m[col];
            m[col] = m[pivot];
            m[pivot] = tmp;
        }
        const pivotValue = m[col][col];
        for (let j = col; j <= n; j += 1) {
            m[col][j] /= pivotValue;
        }
        for (let row = 0; row < n; row += 1) {
            if (row === col) {
                continue;
            }
            const factor = m[row][col];
            for (let j = col; j <= n; j += 1) {
                m[row][j] -= factor * m[col][j];
            }
        }
    }
    return m.map(row => row[n]);
}

function fitPenalty(x, optmod) {
    const radialPenalty = optmod === 20
        ? Math.abs(x[7]) > 5 || Math.abs(x[8] || 0) > 5 || Math.abs(x[9] || 0) > 5 ||
            Math.abs(x[10] || 0) > 1 || Math.abs(x[11] || 0) > 1
        : x[7] < 0.05 || x[7] > 2.5;
    return x.length !== (optmod === 20 ? 12 : 8) ||
        Math.abs(x[0]) < 0.05 || Math.abs(x[0]) > 10 ||
        Math.abs(x[1]) < 0.05 || Math.abs(x[1]) > 10 ||
        Math.abs(x[2]) > 90 || Math.abs(x[3]) > 90 ||
        Math.abs(x[4]) > 720 || Math.abs(x[5]) > 0.5 ||
        Math.abs(x[6]) > 0.5 || radialPenalty;
}

function regularizationResiduals(x, optmod) {
    if (optmod !== 20) {
        return [];
    }
    return [x[7] * 0.4, (x[8] || 0) * 0.8, (x[9] || 0) * 1.6, (x[10] || 0) * 8, (x[11] || 0) * 8];
}

function fitResiduals(x, pairs, testCase, includeRegularization = false) {
    if (fitPenalty(x, testCase.optmod)) {
        return null;
    }
    const residuals = [];
    for (const pair of pairs) {
        const xy = AidaTools.cameraModel(
            pair.star.az,
            pair.star.ze,
            x,
            testCase.optmod,
            testCase.width,
            testCase.height,
        );
        if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
            return null;
        }
        residuals.push(xy.x - pair.detection.x, xy.y - pair.detection.y);
    }
    return includeRegularization ? residuals.concat(regularizationResiduals(x, testCase.optmod)) : residuals;
}

function residualSumSquares(residuals) {
    return residuals ? residuals.reduce((acc, value) => acc + value * value, 0) : 1e12;
}

function residualRmsPx(residuals) {
    return Math.sqrt(residualSumSquares(residuals) / Math.max(1, residuals ? residuals.length / 2 : 1));
}

function perturbedStart(testCase) {
    if (testCase.startMode === "as-given") {
        return testCase.optpar.slice();
    }
    const start = testCase.optpar.slice();
    start[0] *= 1.01;
    start[1] *= 0.99;
    start[2] += testCase.optmod === 20 ? 0.4 : 0.8;
    start[3] -= testCase.optmod === 20 ? 0.3 : 0.6;
    start[4] += testCase.optmod === 20 ? 0.5 : 1.2;
    start[5] += testCase.optmod === 20 ? 0.001 : 0.004;
    start[6] -= testCase.optmod === 20 ? 0.001 : 0.004;
    start[7] *= testCase.optmod === 20 ? 1.02 : 1.015;
    if (testCase.optmod === 20) {
        start[8] *= 0.98;
        start[9] *= 1.01;
        start[10] += 0.0002;
        start[11] -= 0.0002;
    }
    return start;
}

function fitFromPairs(pairs, testCase, startOptpar, maxIter = 100) {
    const diffSteps = testCase.optmod === 20
        ? [1e-4, 1e-4, 1e-3, 1e-3, 1e-3, 1e-5, 1e-5, 1e-5, 1e-6, 1e-6, 1e-6, 1e-6]
        : [1e-4, 1e-4, 1e-3, 1e-3, 1e-3, 1e-5, 1e-5, 1e-4];
    let x = startOptpar.slice();
    let residuals = fitResiduals(x, pairs, testCase, true);
    let fx = residualSumSquares(residuals);
    let lambda = 1e-3;
    let accepted = 0;
    let iterations = 0;
    for (; iterations < maxIter; iterations += 1) {
        if (!residuals || !Number.isFinite(fx)) {
            break;
        }
        const jac = Array.from({length: residuals.length}, () => Array(x.length).fill(0));
        for (let col = 0; col < x.length; col += 1) {
            const xp = x.slice();
            xp[col] += diffSteps[col];
            const rp = fitResiduals(xp, pairs, testCase, true);
            if (!rp) {
                continue;
            }
            for (let row = 0; row < residuals.length; row += 1) {
                jac[row][col] = (rp[row] - residuals[row]) / diffSteps[col];
            }
        }
        const jtj = Array.from({length: x.length}, () => Array(x.length).fill(0));
        const jtr = Array(x.length).fill(0);
        for (let row = 0; row < residuals.length; row += 1) {
            for (let i = 0; i < x.length; i += 1) {
                jtr[i] += jac[row][i] * residuals[row];
                for (let j = 0; j < x.length; j += 1) {
                    jtj[i][j] += jac[row][i] * jac[row][j];
                }
            }
        }
        let improved = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const a = jtj.map((row, i) => row.map((value, j) =>
                i === j ? value + lambda * Math.max(1, Math.abs(value)) : value));
            const step = solveLinearSystem(a, jtr.map(value => -value));
            if (!step) {
                lambda *= 10;
                continue;
            }
            const candidate = x.map((value, i) => value + step[i]);
            const candidateResiduals = fitResiduals(candidate, pairs, testCase, true);
            const candidateFx = residualSumSquares(candidateResiduals);
            if (candidateResiduals && candidateFx < fx) {
                x = candidate;
                residuals = candidateResiduals;
                fx = candidateFx;
                accepted += 1;
                lambda = Math.max(lambda / 3, 1e-9);
                improved = true;
                break;
            }
            lambda *= 10;
        }
        if (!improved) {
            break;
        }
    }
    const rawResiduals = fitResiduals(x, pairs, testCase, false);
    return {optpar: x, residuals: rawResiduals, rms: residualRmsPx(rawResiduals), iterations, accepted};
}

function circleSvg(x, y, r, cls, title = "") {
    return `<circle class="${cls}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}">${title ? `<title>${escapeHtml(title)}</title>` : ""}</circle>`;
}

function lineSvg(x1, y1, x2, y2, cls) {
    return `<line class="${cls}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"></line>`;
}

function magnitudeRadius(mag) {
    if (mag <= 2.5) {
        return 9;
    }
    if (mag <= 4.5) {
        return 6;
    }
    return 4;
}

function formatFitNumber(value) {
    if (!Number.isFinite(value)) {
        return String(value);
    }
    if (Number.isInteger(value)) {
        return String(value);
    }
    return value.toPrecision(12).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function formatBestParameterVector(testCase, fit) {
    return [testCase.optmod, ...fit.optpar].map(formatFitNumber).join(", ");
}

function formatKnownParameterVector(testCase) {
    return [testCase.optmod, ...testCase.optpar].map(formatFitNumber).join(", ");
}

function parameterNamesForModel(optmod, parameterCount) {
    if (optmod === 20) {
        return ["f1", "f2", "alpha", "beta", "gamma", "du", "dv", "k1", "k2", "k3", "p1", "p2"];
    }
    const names = ["f1", "f2", "alpha", "beta", "gamma", "du", "dv", "radial"];
    while (names.length < parameterCount) {
        names.push(`p${names.length}`);
    }
    return names.slice(0, parameterCount);
}

function assessParameterCloseness(testCase, fit) {
    const deltas = fit.optpar.map((value, index) => value - testCase.optpar[index]);
    const names = parameterNamesForModel(testCase.optmod, testCase.optpar.length);
    const maxAbs = values => values.length ? Math.max(...values.map(Math.abs)) : 0;
    const focal = maxAbs(deltas.slice(0, 2));
    const anglesDeg = maxAbs(deltas.slice(2, 5));
    const principal = maxAbs(deltas.slice(5, 7));
    const principalPx = principal * Math.max(testCase.width, testCase.height);
    const distortion = maxAbs(deltas.slice(7));
    const vector = [0, ...deltas];
    return {
        names,
        deltas,
        vector,
        focal,
        anglesDeg,
        principal,
        principalPx,
        distortion,
        maxAbs: maxAbs(deltas),
    };
}

function formatDeltaVector(parameterCloseness) {
    return parameterCloseness.vector.map(formatFitNumber).join(", ");
}

function formatNamedDeltas(parameterCloseness) {
    return parameterCloseness.names
        .map((name, index) => `${name}=${formatFitNumber(parameterCloseness.deltas[index])}`)
        .join(", ");
}

function finiteSorted(values) {
    return values.filter(Number.isFinite).sort((a, b) => a - b);
}

function rangeText(values, digits = 2) {
    const sorted = finiteSorted(values);
    if (!sorted.length) {
        return "n/a";
    }
    return `${sorted[0].toFixed(digits)}..${sorted[sorted.length - 1].toFixed(digits)}`;
}

function detectionQuality(detectionResult, validation) {
    const detections = detectionResult.detections;
    const matchedDetectionIds = new Set(validation.matches.map(match => match.detection.id));
    const centroidErrors = finiteSorted(validation.matches.map(match => match.distance));
    const localSnrs = finiteSorted(detections.map(detection => detection.localSnr));
    const globalSnrs = finiteSorted(detections.map(detection => detection.globalSnr));
    const radii = finiteSorted(detections.map(detection => detection.radius));
    const elongations = finiteSorted(detections.map(detection => detection.elongation));
    const saturated = finiteSorted(detections.map(detection => detection.saturated));
    const validated = matchedDetectionIds.size;
    const selected = detections.length;
    const localSnrMin = localSnrs.length ? localSnrs[0] : Infinity;
    const globalSnrMin = globalSnrs.length ? globalSnrs[0] : Infinity;
    const gaussianGateSigma = Math.min(localSnrMin, globalSnrMin);
    return {
        selected,
        validated,
        unvalidated: Math.max(0, selected - validated),
        validationFraction: selected ? validated / selected : 0,
        medianCentroidError: percentile(centroidErrors, 0.5),
        p95CentroidError: percentile(centroidErrors, 0.95),
        localSnrMin,
        localSnrMedian: percentile(localSnrs, 0.5),
        globalSnrMin,
        globalSnrMedian: percentile(globalSnrs, 0.5),
        gaussianGateSigma,
        radiusRange: rangeText(radii, 2),
        elongationRange: rangeText(elongations, 2),
        saturatedRange: rangeText(saturated, 0),
    };
}

function percentile(sortedValues, fraction) {
    if (!sortedValues.length) {
        return Infinity;
    }
    const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.floor(fraction * (sortedValues.length - 1))),
    );
    return sortedValues[index];
}

function assessLensModelAgreement(testCase, fit, maxMag = testCase.maxMag) {
    const referenceStars = projectStars(testCase, testCase.optpar, maxMag);
    const distances = [];
    let missed = 0;
    for (const star of referenceStars) {
        const xy = AidaTools.cameraModel(
            star.az,
            star.ze,
            fit.optpar,
            testCase.optmod,
            testCase.width,
            testCase.height,
        );
        if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
            missed += 1;
            continue;
        }
        distances.push(Math.hypot(xy.x - star.x, xy.y - star.y));
    }
    distances.sort((a, b) => a - b);
    const sumSquares = distances.reduce((acc, distance) => acc + distance * distance, 0);
    const rms = distances.length ? Math.sqrt(sumSquares / distances.length) : Infinity;
    const p95 = percentile(distances, 0.95);
    const thresholdPx = Number.isFinite(testCase.lensAgreementThresholdPx)
        ? testCase.lensAgreementThresholdPx
        : testCase.optmod === 20 ? 8 : 5;
    return {
        achieved: missed === 0 && rms <= thresholdPx && p95 <= thresholdPx * 2,
        checkedStars: referenceStars.length,
        comparedStars: distances.length,
        missed,
        rms,
        p95,
        thresholdPx,
    };
}

function overlaySvg(result) {
    const matchedKeys = new Set(result.matches.map(pair => pair.star.key));
    const fittedStars = new Map(projectStars(result.case, result.fit.optpar, result.case.maxMag + 0.01)
        .map(star => [star.key, star]));
    const items = [];
    for (const star of result.fittedCatalog) {
        if (!matchedKeys.has(star.key)) {
            items.push(circleSvg(star.x, star.y, magnitudeRadius(star.mag), "catalog-star",
                `${star.name || "star"} mag ${star.mag.toFixed(1)}`));
        }
    }
    for (const detection of result.detections) {
        items.push(circleSvg(detection.x, detection.y, 3, "detected-star"));
    }
    for (const pair of result.matches) {
        const fitted = fittedStars.get(pair.star.key);
        if (!fitted) {
            continue;
        }
        items.push(lineSvg(pair.detection.x, pair.detection.y, fitted.x, fitted.y, "residual-line"));
        items.push(circleSvg(pair.detection.x, pair.detection.y, magnitudeRadius(pair.star.mag) + 2, "matched-star",
            `${pair.star.name || "star"} mag ${pair.star.mag.toFixed(1)} detection`));
        items.push(circleSvg(fitted.x, fitted.y, magnitudeRadius(pair.star.mag), "fit-star",
            `${pair.star.name || "star"} fitted model`));
    }
    return `<svg class="overlay" viewBox="0 0 ${result.case.width} ${result.case.height}" preserveAspectRatio="none">${items.join("\n")}</svg>`;
}

function residualPlotSvg(result) {
    const residuals = [];
    for (const pair of result.matches) {
        const xy = AidaTools.cameraModel(
            pair.star.az,
            pair.star.ze,
            result.fit.optpar,
            result.case.optmod,
            result.case.width,
            result.case.height,
        );
        residuals.push({
            dx: xy.x - pair.detection.x,
            dy: xy.y - pair.detection.y,
            name: pair.star.name || "star",
        });
    }
    const maxR = Math.max(1, ...residuals.map(r => Math.hypot(r.dx, r.dy)));
    const span = Math.ceil(Math.max(5, maxR * 1.25));
    const w = 420;
    const h = 320;
    const pad = 42;
    const sx = x => pad + (x + span) / (2 * span) * (w - 2 * pad);
    const sy = y => h - pad - (y + span) / (2 * span) * (h - 2 * pad);
    const points = residuals.map(r =>
        `<circle class="residual-point" cx="${sx(r.dx).toFixed(1)}" cy="${sy(r.dy).toFixed(1)}" r="4"><title>${escapeHtml(r.name)} dx ${r.dx.toFixed(2)} dy ${r.dy.toFixed(2)}</title></circle>`
    ).join("\n");
    return `<svg class="residual-plot" viewBox="0 0 ${w} ${h}">
        <rect x="0" y="0" width="${w}" height="${h}" class="plot-bg"></rect>
        <line class="plot-grid" x1="${pad}" y1="${sy(0)}" x2="${w - pad}" y2="${sy(0)}"></line>
        <line class="plot-grid" x1="${sx(0)}" y1="${pad}" x2="${sx(0)}" y2="${h - pad}"></line>
        <rect class="plot-frame" x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}"></rect>
        ${points}
        <text class="axis-label" x="${w / 2}" y="${h - 10}" text-anchor="middle">x residual (px)</text>
        <text class="axis-label" x="15" y="${h / 2}" text-anchor="middle" transform="rotate(-90 15 ${h / 2})">y residual (px)</text>
        <text class="plot-title" x="${w / 2}" y="24" text-anchor="middle">Residuals +/-${span} px</text>
    </svg>`;
}

async function analyzeCase(testCase) {
    const imagePath = path.join(ROOT, "calibration_images", testCase.image);
    const imageData = readPngImageData(imagePath);
    if (imageData.width !== testCase.width || imageData.height !== testCase.height) {
        throw new Error(`${testCase.image}: expected ${testCase.width}x${testCase.height}, got ${imageData.width}x${imageData.height}`);
    }
    const detectionResult = await StarDetector.detectBrightStars(imageData, testCase.detectorOptions);
    const catalog = projectStars(testCase, testCase.optpar, testCase.maxMag);
    const validation = knownLensValidationMap(detectionResult.detections, catalog, testCase.matchRadiusPx);
    const quality = detectionQuality(detectionResult, validation);
    const autoIdentification = AutoIdentifier.identifyStars(catalog, detectionResult.detections, {
        imageWidth: testCase.width,
        imageHeight: testCase.height,
        maxMagnitude: testCase.maxMag,
        maxDetections: testCase.detectorOptions.maxDetections,
        maxCatalogStars: Math.max(200, Math.min(600, catalog.length)),
        maxDistancePx: testCase.matchRadiusPx,
        translationSearchRadiusPx: 25,
        minMatches: 8,
    });
    const identificationScore = scoreIdentificationAgainstKnownLens(autoIdentification.matches, validation);
    const matches = validation.matches
        .sort((a, b) => a.star.mag - b.star.mag || a.distance - b.distance);
    const start = perturbedStart(testCase);
    const sweep = [];
    const minFitPairs = testCase.optmod === 20 ? 6 : 4;
    for (const count of testCase.sweepCounts) {
        if (matches.length < count || count < minFitPairs) {
            continue;
        }
        const fit = fitFromPairs(matches.slice(0, count), testCase, start);
        sweep.push({count, ...fit});
    }
    const fit = matches.length >= minFitPairs
        ? (sweep.length ? sweep[sweep.length - 1] : fitFromPairs(matches, testCase, start))
        : {optpar: start, residuals: [], rms: Infinity, iterations: 0, accepted: 0, skipped: true};
    const fitMatchCount = fit.skipped ? matches.length : fit.residuals ? fit.residuals.length / 2 : matches.length;
    const lensAgreement = assessLensModelAgreement(testCase, fit);
    const parameterCloseness = assessParameterCloseness(testCase, fit);
    return {
        case: testCase,
        detections: detectionResult.detections,
        detectionStatus: detectionResult.status,
        detectionResult,
        detectionQuality: quality,
        catalog,
        fittedCatalog: projectStars(testCase, fit.optpar, testCase.maxMag),
        matches: matches.slice(0, fitMatchCount),
        validation,
        autoIdentification,
        identificationScore,
        sweep,
        fit,
        minFitPairs,
        lensAgreement,
        parameterCloseness,
        startRms: residualRmsPx(fitResiduals(start, matches.slice(0, Math.min(matches.length, testCase.sweepCounts.at(-1))), testCase, false)),
    };
}

function caseHtml(result) {
    const c = result.case;
    const sweepText = result.sweep
        .map(item => `${item.count}: ${item.rms.toFixed(2)} px (${item.accepted} accepted)`)
        .join(" / ");
    const fitNote = result.fit.skipped
        ? `not enough catalogue-certified pairs for an ${c.optmod === 20 ? "Brown-Conrady" : `optmod ${c.optmod}`} fit ` +
            `(${result.matches.length}/${result.minFitPairs})`
        : sweepText;
    const model = c.optmod === 20 ? "Brown-Conrady" : `optmod ${c.optmod}`;
    const score = result.identificationScore;
    const agreement = result.lensAgreement;
    const closeness = result.parameterCloseness;
    const lensStatus = agreement.achieved ? "YES" : "NO";
    const autoIdStatus = `known-lens validation: ${score.correct}/${score.total} auto-ID pairs correct, ` +
        `${score.incorrect} wrong, ${score.unknown} outside truth map`;
    const lensAgreementStatus = `correct lens model achieved: ${lensStatus}; ` +
        `known-vs-fit projection RMS ${agreement.rms.toFixed(2)} px, ` +
        `95% ${agreement.p95.toFixed(2)} px over ${agreement.comparedStars}/${agreement.checkedStars} catalogue stars ` +
        `(threshold ${agreement.thresholdPx.toFixed(1)} px)`;
    const parameterStatus = `parameter closeness to known model: ` +
        `max |df| ${formatFitNumber(closeness.focal)}, ` +
        `max |d angle| ${closeness.anglesDeg.toFixed(3)} deg, ` +
        `max |d principal| ${formatFitNumber(closeness.principal)} ` +
        `(~${closeness.principalPx.toFixed(1)} px), ` +
        `max |d distortion| ${formatFitNumber(closeness.distortion)}`;
    const review = c.humanReview;
    const reviewHtml = review
        ? `        <p class="status review-${escapeHtml(review.status)}">${escapeHtml(review.note)}</p>\n`
        : "";
    const quality = result.detectionQuality;
    const reject = result.detectionResult.rejectCounts || {};
    const detectorCertaintyStatus = `star-detection validation: ${quality.validated}/${quality.selected} ` +
        `raw detections are catalogue-certified within ${c.matchRadiusPx} px using the HDF5 lens; ` +
        `${quality.unvalidated} raw detections remain uncertified; centroid median/95% ` +
        `${quality.medianCentroidError.toFixed(2)}/${quality.p95CentroidError.toFixed(2)} px`;
    const detectorShapeStatus = `detector details: local SNR min/median ` +
        `${quality.localSnrMin.toFixed(1)}/${quality.localSnrMedian.toFixed(1)}, ` +
        `global SNR min/median ${quality.globalSnrMin.toFixed(1)}/${quality.globalSnrMedian.toFixed(1)}, ` +
        `radius ${quality.radiusRange} px, elongation ${quality.elongationRange}, ` +
        `saturated pixels ${quality.saturatedRange}`;
    const detectorGateStatus = `detector gate: global/local threshold ` +
        `${(c.detectorOptions.thresholdSigma || 2.5).toFixed(3)}/${(c.detectorOptions.localThresholdSigma || 2.5).toFixed(3)} sigma, ` +
        `require global threshold ${c.detectorOptions.requireGlobalThreshold === true ? "yes" : "no"}`;
    const rejectionStatus = `detector rejections: below scan ${reject.belowScanThreshold || 0}, ` +
        `below global ${reject.belowGlobalThreshold || 0}, below local contrast ` +
        `${reject.belowLocalContrast || 0}, invalid centroid ${reject.invalidCentroid || 0}, ` +
        `non-star shape ${reject.nonStarShape || 0}`;
    return `<section class="case-card" id="${escapeHtml(c.id)}">
        <h2>${escapeHtml(c.title)}</h2>
        <div class="meta">
            <span>${escapeHtml(model)}</span>
            <span>${c.date.toISOString()}</span>
            <span>lat ${c.latDeg.toFixed(6)}, lon ${c.lonDeg.toFixed(6)}, alt ${(c.altM || 0).toFixed(1)} m</span>
${c.sourceH5 ? `            <span>${escapeHtml(c.sourceH5)}</span>` : ""}
        </div>
${reviewHtml}
        <p class="status">${escapeHtml(result.detectionStatus)}</p>
        <p class="status">${escapeHtml(detectorGateStatus)}</p>
        <p class="status">${escapeHtml(detectorCertaintyStatus)}</p>
        <p class="status">${escapeHtml(detectorShapeStatus)}</p>
        <p class="status">${escapeHtml(rejectionStatus)}</p>
        <p class="status">${escapeHtml(result.autoIdentification.status)}</p>
        <p class="status">${escapeHtml(autoIdStatus)}</p>
        <p class="status ${agreement.achieved ? "ok" : "warn"}">${escapeHtml(lensAgreementStatus)}</p>
        <p class="status">${escapeHtml(parameterStatus)}</p>
        <p class="status mono">known good [optmod, ...optpar]: [${escapeHtml(formatKnownParameterVector(c))}]</p>
        <p class="status">${result.fit.skipped ? "fit skipped; perturbed start" : "best fit"} [optmod, ...optpar]: [${escapeHtml(formatBestParameterVector(c, result.fit))}]</p>
        <p class="status mono">delta [doptmod, ...doptpar]: [${escapeHtml(formatDeltaVector(closeness))}]</p>
        <p class="status mono">named parameter deltas: ${escapeHtml(formatNamedDeltas(closeness))}</p>
        <div class="summary-grid">
            <div><strong>${result.detections.length}</strong><span>detections</span></div>
            <div><strong>${result.catalog.length}</strong><span>catalog stars</span></div>
            <div><strong>${result.validation.matches.length}</strong><span>known-lens truth pairs</span></div>
            <div><strong>${score.correct}</strong><span>validated auto-ID pairs</span></div>
            <div><strong>${score.incorrect}</strong><span>wrong auto-ID pairs</span></div>
            <div><strong>${result.fit.rms.toFixed(2)} px</strong><span>fit RMS</span></div>
            <div><strong>${quality.validated}/${quality.selected}</strong><span>catalogue-certified detections</span></div>
            <div><strong>${quality.localSnrMin.toFixed(1)}</strong><span>min local SNR</span></div>
            <div><strong>${agreement.achieved ? "yes" : "no"}</strong><span>correct lens achieved</span></div>
            <div><strong>${agreement.rms.toFixed(2)} px</strong><span>known-vs-fit RMS</span></div>
            <div><strong>${closeness.anglesDeg.toFixed(2)} deg</strong><span>max angle delta</span></div>
            <div><strong>${closeness.principalPx.toFixed(1)} px</strong><span>max principal delta</span></div>
        </div>
        <p class="sweep"><strong>fit sweep:</strong> ${escapeHtml(fitNote || "not enough pairs")}</p>
        <div class="visual-grid">
            <div class="image-panel">
                <img src="../calibration_images/${encodeURIComponent(c.image)}" alt="${escapeHtml(c.title)}">
                ${overlaySvg(result)}
            </div>
            <div class="plot-panel">
                ${residualPlotSvg(result)}
                <ul class="legend">
                    <li><span class="swatch matched"></span> known-lens truth-map detections</li>
                    <li><span class="swatch fit"></span> fitted model positions</li>
                    <li><span class="swatch catalog"></span> other catalogue stars under fitted model</li>
                    <li><span class="swatch detected"></span> raw automatic detections</li>
                </ul>
            </div>
        </div>
    </section>`;
}

function pageHtml(results) {
    const generated = new Date().toISOString();
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AIDA Calibrator Star-Fit Test Report</title>
<style>
body { margin: 0; font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #d8dde8; background: #12151b; }
header { padding: 28px 32px 16px; border-bottom: 1px solid #2b3340; background: #191e27; }
h1 { margin: 0 0 8px; font-size: 26px; }
h2 { margin: 0 0 8px; font-size: 20px; }
.intro { max-width: 980px; color: #aeb8c8; }
.case-card { margin: 24px auto; max-width: 1320px; padding: 22px; background: #181d25; border: 1px solid #303948; border-radius: 8px; }
.meta { display: flex; flex-wrap: wrap; gap: 10px; color: #aeb8c8; margin-bottom: 10px; }
.meta span { padding: 3px 8px; border: 1px solid #3b4657; border-radius: 999px; }
.status, .sweep { color: #b9c4d4; }
.status.ok { color: #8ef0a1; }
.status.warn { color: #ffb86b; }
.review-good { color: #9ff6b1; font-weight: 700; }
.review-outliers { color: #ffd37a; font-weight: 700; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 12px; overflow-wrap: anywhere; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 10px; margin: 14px 0; }
.summary-grid div { padding: 10px; background: #202633; border: 1px solid #394457; border-radius: 6px; }
.summary-grid strong { display: block; font-size: 20px; color: #ffffff; }
.summary-grid span { color: #98a6ba; }
.visual-grid { display: grid; grid-template-columns: minmax(0, 1fr) 450px; gap: 18px; align-items: start; }
.image-panel { position: relative; background: #090b0f; border: 1px solid #354054; overflow: hidden; }
.image-panel img { display: block; width: 100%; height: auto; }
.overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.catalog-star { fill: none; stroke: rgba(255, 92, 92, 0.72); stroke-width: 2.2; }
.detected-star { fill: rgba(255, 214, 80, 0.65); stroke: none; }
.matched-star { fill: none; stroke: rgba(86, 255, 128, 0.95); stroke-width: 3.2; }
.fit-star { fill: none; stroke: rgba(76, 205, 255, 0.95); stroke-width: 2.4; }
.residual-line { stroke: rgba(255, 255, 255, 0.8); stroke-width: 2; }
.plot-panel { background: #202633; border: 1px solid #394457; border-radius: 6px; padding: 12px; }
.residual-plot { width: 100%; height: auto; }
.plot-bg { fill: #111722; }
.plot-frame { fill: none; stroke: #64748b; stroke-width: 1.2; }
.plot-grid { stroke: #46556b; stroke-width: 1; }
.residual-point { fill: #59ff91; stroke: #0a2211; stroke-width: 1.3; }
.axis-label, .plot-title { fill: #cbd5e1; font-size: 12px; }
.legend { list-style: none; padding: 0; margin: 12px 0 0; color: #b9c4d4; }
.legend li { margin: 5px 0; }
.swatch { display: inline-block; width: 14px; height: 14px; margin-right: 7px; vertical-align: -2px; border-radius: 50%; }
.swatch.matched { border: 2px solid #56ff80; }
.swatch.fit { border: 2px solid #4ccdff; }
.swatch.catalog { border: 2px solid #ff5c5c; }
.swatch.detected { background: #ffd650; }
@media (max-width: 980px) { .visual-grid { grid-template-columns: 1fr; } .summary-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<header>
<h1>AIDA Calibrator Star-Fit Test Report</h1>
<p class="intro">Generated ${escapeHtml(generated)}. The report now sweeps all tracked <code>python/examples/allsky7/*first1s.png</code> frames with their matching HDF5 latitude, longitude, timestamp, and optpar metadata. A known-good lens model first creates a truth map between Yale catalogue stars and image detections; raw detections that pass this check are catalogue-certified for fitting, while uncertified detections remain visible as detector-hardening feedback. Green circles are certified detections used for fitting, cyan circles are fitted lens-model positions, red circles are unmatched catalogue stars under the fitted model, and yellow dots are raw automatic detections. Brown-Conrady cases use light coefficient regularization.</p>
</header>
${results.map(caseHtml).join("\n")}
</body>
</html>`;
}

async function main() {
    fs.mkdirSync(OUT_DIR, {recursive: true});
    const cases = buildCases();
    const results = [];
    for (const testCase of cases) {
        process.stderr.write(`analyzing ${testCase.title}\n`);
        results.push(await analyzeCase(testCase));
    }
    const outfile = path.join(OUT_DIR, "index.html");
    fs.writeFileSync(outfile, pageHtml(results));
    process.stdout.write(`${outfile}\n`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
