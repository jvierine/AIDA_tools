#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const StarDetector = require("../js/star_detector.js");
const {
    knownLensValidationMap,
    projectStars,
    readPngImageData,
} = require("./generate_test_report.js");
const {
    normalizeSavedCase,
} = require("./img9953_undistorted_asterism_report.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "test-report", "star-detector-oracle");

const ALLSKY_CASE = {
    id: "allsky010031-ams0221",
    title: "Allsky 010031 AMS0221",
    image: "2025_02_19_03_46_01_000_010031_ams0221_first1s.png",
    imagePath: path.join(ROOT, "calibration_images", "2025_02_19_03_46_01_000_010031_ams0221_first1s.png"),
    width: 1920,
    height: 1080,
    date: new Date("2025-02-19T03:46:01.000Z"),
    latDeg: 52.208700,
    lonDeg: 14.121500,
    altM: 56.0,
    optmod: 2,
    optpar: [
        0.789796553852,
        1.40015321373,
        -67.3425021144,
        10.9882272129,
        84.8281249152,
        0.0181070490333,
        -0.00554827918225,
        0.889505824512,
    ],
    maxMag: 6.5,
    matchRadiusPx: 18,
};

const CASES = [
    {
        ...normalizeSavedCase(path.join(ROOT, "test_cases", "IMG_9953")),
        title: "IMG_9953 phone Brown-Conrady",
        maxMag: 6.5,
        matchRadiusPx: 22,
        detectorOptions: {
            maxDetections: 650,
            scanStep: 1,
            thresholdSigma: 1.5,
            localThresholdSigma: 1.5,
            requireGlobalThreshold: false,
            maxRadiusPx: 5,
            maxElongation: 4.0,
            suppressionRadiusPx: 10,
            crowdingRadiusPx: 36,
            maxCrowding: 7,
            crowdingScorePower: 1.25,
        },
    },
    {
        ...ALLSKY_CASE,
        detectorOptions: {
            maxDetections: 120,
            thresholdSigma: 3.1,
            localThresholdSigma: 3.2,
            requireGlobalThreshold: false,
            maxElongation: 3.1,
        },
    },
];

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    }[ch]));
}

function fmt(value, digits = 3) {
    return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function detectionOracleMetrics(detections, catalog, matchRadiusPx) {
    const validation = knownLensValidationMap(detections, catalog, matchRadiusPx);
    const correct = validation.matches.length;
    const selected = detections.length;
    const truth = catalog.length;
    const falsePositive = Math.max(0, selected - correct);
    const missed = Math.max(0, truth - correct);
    const precision = selected > 0 ? correct / selected : 0;
    const recall = truth > 0 ? correct / truth : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    const distances = validation.matches.map(match => match.distance).sort((a, b) => a - b);
    const percentile = p => distances.length ?
        distances[Math.min(distances.length - 1, Math.floor(p * (distances.length - 1)))] :
        NaN;
    return {
        selected,
        truth,
        correct,
        falsePositive,
        missed,
        precision,
        recall,
        f1,
        medianDistancePx: percentile(0.5),
        p95DistancePx: percentile(0.95),
        validation,
    };
}

async function analyzeCase(testCase) {
    const imageData = readPngImageData(testCase.imagePath);
    const catalog = projectStars(testCase, testCase.optpar, testCase.maxMag);
    const variants = [
        {
            name: "automatic matched-filter",
            note: "Current automatic detector: local annulus background plus compact SEP-style matched-filter scoring.",
            options: {
                ...testCase.detectorOptions,
            },
        },
        {
            name: "mesh background diagnostic",
            note: "Optional SEP-style spatial mesh background/RMS, retained as a diagnostic because it can help some images but is not always better.",
            options: {
                ...testCase.detectorOptions,
                useSpatialBackground: true,
            },
        },
    ];
    const results = [];
    for (const variant of variants) {
        const t0 = Date.now();
        const detectionResult = await StarDetector.detectBrightStars(imageData, variant.options);
        const elapsedMs = Date.now() - t0;
        const metrics = detectionOracleMetrics(detectionResult.detections, catalog, testCase.matchRadiusPx);
        results.push({
            ...variant,
            elapsedMs,
            status: detectionResult.status,
            rejectCounts: detectionResult.rejectCounts,
            backgroundMeshSize: detectionResult.backgroundMeshSize,
            candidates: detectionResult.candidates.length,
            detections: detectionResult.detections,
            metrics,
        });
    }
    return {
        id: testCase.id,
        title: testCase.title,
        image: path.relative(ROOT, testCase.imagePath),
        width: testCase.width,
        height: testCase.height,
        maxMag: testCase.maxMag,
        matchRadiusPx: testCase.matchRadiusPx,
        catalogStars: catalog.length,
        results,
    };
}

function metricTable(result) {
    return `<table>
<thead><tr><th>variant</th><th>correct</th><th>false +</th><th>missed</th><th>precision</th><th>recall</th><th>F1</th><th>time</th></tr></thead>
<tbody>${result.results.map(item => `<tr>
<td>${escapeHtml(item.name)}</td>
<td>${item.metrics.correct}/${item.metrics.selected}</td>
<td>${item.metrics.falsePositive}</td>
<td>${item.metrics.missed}</td>
<td>${fmt(100 * item.metrics.precision, 1)}%</td>
<td>${fmt(100 * item.metrics.recall, 1)}%</td>
<td>${fmt(item.metrics.f1, 3)}</td>
<td>${item.elapsedMs} ms</td>
</tr>`).join("")}</tbody>
</table>`;
}

function pageHtml(results) {
    const generated = new Date().toISOString();
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Star Detector Oracle Report</title>
<style>
body { margin: 0; background: #f5f7fa; color: #17202a; font: 15px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { max-width: 1160px; margin: 0 auto; padding: 24px; }
h1 { margin: 0 0 8px; font-size: 24px; }
.case { background: white; border: 1px solid #d9e1ea; border-radius: 8px; padding: 16px; margin: 18px 0; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; }
th, td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: right; }
th:first-child, td:first-child { text-align: left; }
pre { background: #eef2f7; border-radius: 6px; padding: 10px; overflow-x: auto; }
.note { color: #46515f; }
</style>
</head>
<body>
<main>
<h1>Star Detector Oracle Report</h1>
<p class="note">Generated ${escapeHtml(generated)}. A known lens model and Yale catalogue act as the oracle: detections within the case match radius of projected catalogue stars count as correct. This evaluates the detector only, before any asterism identification.</p>
${results.map(result => `<section class="case">
<h2>${escapeHtml(result.title)}</h2>
<p>${escapeHtml(result.image)}; ${result.catalogStars} catalogue stars to mag ${fmt(result.maxMag, 1)}; match radius ${result.matchRadiusPx} px.</p>
${metricTable(result)}
${result.results.map(item => `<h3>${escapeHtml(item.name)}</h3>
<p>${escapeHtml(item.note)}</p>
<p>${escapeHtml(item.status)}</p>
<pre>${escapeHtml(JSON.stringify({
    options: item.options,
    rejectCounts: item.rejectCounts,
    metrics: {
        correct: item.metrics.correct,
        selected: item.metrics.selected,
        falsePositive: item.metrics.falsePositive,
        missed: item.metrics.missed,
        precision: item.metrics.precision,
        recall: item.metrics.recall,
        f1: item.metrics.f1,
    },
}, null, 2))}</pre>`).join("")}
</section>`).join("")}
</main>
</body>
</html>`;
}

async function buildStarDetectorOracleReport() {
    const results = [];
    for (const testCase of CASES) {
        process.stderr.write(`oracle-scoring ${testCase.title}\n`);
        results.push(await analyzeCase(testCase));
    }
    return {
        generatedUtc: new Date().toISOString(),
        results,
    };
}

async function main() {
    fs.mkdirSync(OUT_DIR, {recursive: true});
    const report = await buildStarDetectorOracleReport();
    fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "index.html"), pageHtml(report.results));
    for (const result of report.results) {
        const best = result.results[0];
        console.log(`${result.title}: ${best.metrics.correct}/${best.metrics.selected} correct, ` +
            `precision ${fmt(100 * best.metrics.precision, 1)}%, recall ${fmt(100 * best.metrics.recall, 1)}%`);
    }
    console.log(path.join(OUT_DIR, "index.html"));
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    analyzeCase,
    buildStarDetectorOracleReport,
    detectionOracleMetrics,
};
