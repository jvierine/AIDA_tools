#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const StarDetector = require("../js/star_detector.js");
const {
    buildCases,
    projectStars,
    readPngImageData,
} = require("./generate_test_report.js");

const ROOT = path.join(__dirname, "..");
const IMAGE_DIR = path.join(ROOT, "calibration_images");
const DEFAULT_DATASET_DIR = path.join(ROOT, "star_training");
const CROP_SIZE = 64;

function parseArgs(argv) {
    const options = {
        datasetDir: DEFAULT_DATASET_DIR,
        filters: [],
        yesPerCase: 80,
        noPerCase: 120,
        randomNoPerCase: 40,
        reset: false,
        overlayOnly: false,
        overlayDir: path.join(DEFAULT_DATASET_DIR, "overlays"),
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--dir" && argv[i + 1]) {
            options.datasetDir = path.resolve(argv[i + 1]);
            i += 1;
        } else if (arg.startsWith("--dir=")) {
            options.datasetDir = path.resolve(arg.slice("--dir=".length));
        } else if (arg === "--reset") {
            options.reset = true;
        } else if (arg === "--overlay-only") {
            options.overlayOnly = true;
        } else if (arg === "--overlay-dir" && argv[i + 1]) {
            options.overlayDir = path.resolve(argv[i + 1]);
            i += 1;
        } else if (arg.startsWith("--overlay-dir=")) {
            options.overlayDir = path.resolve(arg.slice("--overlay-dir=".length));
        } else if (arg === "--yes" && argv[i + 1]) {
            options.yesPerCase = Number(argv[i + 1]);
            i += 1;
        } else if (arg.startsWith("--yes=")) {
            options.yesPerCase = Number(arg.slice("--yes=".length));
        } else if (arg === "--no" && argv[i + 1]) {
            options.noPerCase = Number(argv[i + 1]);
            i += 1;
        } else if (arg.startsWith("--no=")) {
            options.noPerCase = Number(arg.slice("--no=".length));
        } else if (arg === "--random-no" && argv[i + 1]) {
            options.randomNoPerCase = Number(argv[i + 1]);
            i += 1;
        } else if (arg.startsWith("--random-no=")) {
            options.randomNoPerCase = Number(arg.slice("--random-no=".length));
        } else if (!arg.startsWith("--")) {
            options.filters.push(arg.toLowerCase());
        }
    }
    return options;
}

function ensureDirs(datasetDir, reset = false) {
    if (reset && fs.existsSync(datasetDir)) {
        fs.rmSync(datasetDir, {recursive: true, force: true});
    }
    fs.mkdirSync(datasetDir, {recursive: true});
    for (const label of ["yes", "no", "unsure"]) {
        fs.mkdirSync(path.join(datasetDir, label), {recursive: true});
    }
}

function caseMatchesFilter(testCase, filters) {
    if (filters.length === 0) {
        return true;
    }
    const haystack = [
        testCase.id,
        testCase.title,
        testCase.image,
        testCase.sourceImage,
        testCase.sourceH5,
        testCase.sourceJson,
    ].filter(Boolean).join(" ").toLowerCase();
    return filters.some(filter => haystack.includes(filter));
}

function safeName(value) {
    return String(value || "item")
        .replace(/[^A-Za-z0-9_.-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120) || "item";
}

function pngChunk(type, data) {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 4, "ascii");
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
    return chunk;
}

let CRC_TABLE = null;
function crc32(buffer) {
    if (!CRC_TABLE) {
        CRC_TABLE = new Uint32Array(256);
        for (let i = 0; i < 256; i += 1) {
            let c = i;
            for (let k = 0; k < 8; k += 1) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            CRC_TABLE[i] = c >>> 0;
        }
    }
    let c = 0xffffffff;
    for (const byte of buffer) {
        c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function writePngRgba(filename, width, height, rgba) {
    const signature = Buffer.from("89504e470d0a1a0a", "hex");
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (1 + width * 4);
        raw[rowOffset] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4)
            .copy(raw, rowOffset + 1);
    }
    const idat = zlib.deflateSync(raw);
    fs.writeFileSync(filename, Buffer.concat([
        signature,
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", idat),
        pngChunk("IEND", Buffer.alloc(0)),
    ]));
}

function copyImageData(imageData) {
    return {
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data),
    };
}

function setPixel(imageData, x, y, r, g, b, a = 255) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= imageData.width || iy < 0 || iy >= imageData.height) {
        return;
    }
    const k = 4 * (iy * imageData.width + ix);
    imageData.data[k] = r;
    imageData.data[k + 1] = g;
    imageData.data[k + 2] = b;
    imageData.data[k + 3] = a;
}

function drawCircle(imageData, cx, cy, radius, color) {
    const r = Math.max(1, Math.round(radius));
    for (let deg = 0; deg < 360; deg += 2) {
        const theta = deg * Math.PI / 180;
        setPixel(
            imageData,
            cx + r * Math.cos(theta),
            cy + r * Math.sin(theta),
            color[0],
            color[1],
            color[2],
            color[3] === undefined ? 255 : color[3],
        );
    }
}

function drawCrosshair(imageData, cx, cy, radius, color) {
    const r = Math.max(2, Math.round(radius));
    const gap = Math.max(2, Math.floor(r * 0.35));
    for (let d = -r; d <= r; d += 1) {
        if (Math.abs(d) > gap) {
            setPixel(imageData, cx + d, cy, color[0], color[1], color[2], color[3] === undefined ? 255 : color[3]);
            setPixel(imageData, cx, cy + d, color[0], color[1], color[2], color[3] === undefined ? 255 : color[3]);
        }
    }
}

function magnitudeRadius(mag) {
    if (mag <= 2.0) {
        return 10;
    }
    if (mag <= 4.0) {
        return 7;
    }
    return 5;
}

function writeOverlay(testCase, imageData, stars, detections, overlayDir) {
    fs.mkdirSync(overlayDir, {recursive: true});
    const overlay = copyImageData(imageData);
    for (const detection of detections) {
        drawCircle(overlay, detection.x, detection.y, 4, [0, 0, 0, 255]);
        drawCircle(overlay, detection.x, detection.y, 3, [255, 220, 64, 255]);
    }
    for (const star of stars) {
        const radius = magnitudeRadius(star.mag);
        drawCircle(overlay, star.x, star.y, radius + 1, [0, 0, 0, 255]);
        drawCircle(overlay, star.x, star.y, radius, [255, 64, 64, 255]);
    }
    const out = path.join(overlayDir, `${safeName(testCase.id)}_stars_overlay.png`);
    writePngRgba(out, overlay.width, overlay.height, overlay.data);
    return out;
}

function cropImage(imageData, cx, cy, size = CROP_SIZE) {
    const half = Math.floor(size / 2);
    const crop = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
        const srcY = Math.round(cy) - half + y;
        for (let x = 0; x < size; x += 1) {
            const srcX = Math.round(cx) - half + x;
            const dst = 4 * (y * size + x);
            if (srcX < 0 || srcX >= imageData.width || srcY < 0 || srcY >= imageData.height) {
                crop[dst] = 0;
                crop[dst + 1] = 0;
                crop[dst + 2] = 0;
                crop[dst + 3] = 255;
                continue;
            }
            const src = 4 * (srcY * imageData.width + srcX);
            crop[dst] = imageData.data[src];
            crop[dst + 1] = imageData.data[src + 1];
            crop[dst + 2] = imageData.data[src + 2];
            crop[dst + 3] = 255;
        }
    }
    return crop;
}

function nearestPoint(point, points, maxDistancePx) {
    let best = null;
    let bestD2 = maxDistancePx * maxDistancePx;
    for (const candidate of points) {
        const dx = point.x - candidate.x;
        const dy = point.y - candidate.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2) {
            best = candidate;
            bestD2 = d2;
        }
    }
    return best ? {...best, distancePx: Math.sqrt(bestD2)} : null;
}

function farFromAll(point, points, radiusPx) {
    const r2 = radiusPx * radiusPx;
    return points.every(candidate => {
        const dx = point.x - candidate.x;
        const dy = point.y - candidate.y;
        return dx * dx + dy * dy > r2;
    });
}

function writeCrop(datasetDir, label, imageData, x, y, basename, metadata, manifest) {
    const filename = `${safeName(basename)}.png`;
    const filePath = path.join(datasetDir, label, filename);
    if (fs.existsSync(filePath)) {
        return false;
    }
    writePngRgba(filePath, CROP_SIZE, CROP_SIZE, cropImage(imageData, x, y));
    manifest.push({
        file: `${label}/${filename}`,
        label,
        x,
        y,
        ...metadata,
    });
    return true;
}

function randomPoint(seed, width, height, margin) {
    // Deterministic LCG so dataset generation is reproducible.
    const next = () => {
        seed.value = (1664525 * seed.value + 1013904223) >>> 0;
        return seed.value / 0x100000000;
    };
    return {
        x: margin + next() * Math.max(1, width - 2 * margin),
        y: margin + next() * Math.max(1, height - 2 * margin),
    };
}

async function buildCase(testCase, options, manifest) {
    const imagePath = path.join(IMAGE_DIR, testCase.image);
    const imageData = readPngImageData(imagePath);
    const detectionResult = await StarDetector.detectBrightStars(imageData, {
        maxDetections: Math.max(240, options.yesPerCase + options.noPerCase),
        thresholdSigma: testCase.detectorOptions && Number.isFinite(testCase.detectorOptions.thresholdSigma) ?
            testCase.detectorOptions.thresholdSigma : 2.5,
        localThresholdSigma: testCase.detectorOptions && Number.isFinite(testCase.detectorOptions.localThresholdSigma) ?
            testCase.detectorOptions.localThresholdSigma : 2.5,
        requireGlobalThreshold: testCase.detectorOptions && testCase.detectorOptions.requireGlobalThreshold === true,
        maxRadiusPx: 5,
        maxElongation: 4.0,
        suppressionRadiusPx: 18,
    });
    const stars = projectStars(testCase, testCase.optpar, Math.max(7, testCase.maxMag || 7));
    const yesStars = stars
        .map(star => ({star, detection: nearestPoint(star, detectionResult.candidates, testCase.matchRadiusPx || 18)}))
        .filter(row => row.detection)
        .sort((a, b) => a.star.mag - b.star.mag)
        .slice(0, options.yesPerCase);
    let yes = 0;
    for (const row of yesStars) {
        const name = `${testCase.id}_yes_${yes.toString().padStart(4, "0")}_${row.star.name || "star"}`;
        if (writeCrop(options.datasetDir, "yes", imageData, row.detection.x, row.detection.y, name, {
            caseId: testCase.id,
            sourceImage: testCase.image,
            starName: row.star.name || "",
            starMag: row.star.mag,
            matchDistancePx: row.detection.distancePx,
            source: "known-lens-catalog-and-detector",
        }, manifest)) {
            yes += 1;
        }
    }

    let no = 0;
    for (const detection of detectionResult.candidates) {
        if (no >= options.noPerCase) {
            break;
        }
        if (!farFromAll(detection, stars, Math.max(36, testCase.matchRadiusPx * 2 || 36))) {
            continue;
        }
        const name = `${testCase.id}_no_detector_${no.toString().padStart(4, "0")}`;
        if (writeCrop(options.datasetDir, "no", imageData, detection.x, detection.y, name, {
            caseId: testCase.id,
            sourceImage: testCase.image,
            source: "detector-candidate-far-from-known-catalog-star",
            localSnr: detection.localSnr,
            radius: detection.radius,
            elongation: detection.elongation,
        }, manifest)) {
            no += 1;
        }
    }

    const seed = {value: (testCase.id.length * 2654435761) >>> 0};
    let randomNo = 0;
    let attempts = 0;
    while (randomNo < options.randomNoPerCase && attempts < options.randomNoPerCase * 80) {
        attempts += 1;
        const point = randomPoint(seed, imageData.width, imageData.height, CROP_SIZE);
        if (!farFromAll(point, stars, 48) || !farFromAll(point, detectionResult.candidates, 32)) {
            continue;
        }
        const name = `${testCase.id}_no_random_${randomNo.toString().padStart(4, "0")}`;
        if (writeCrop(options.datasetDir, "no", imageData, point.x, point.y, name, {
            caseId: testCase.id,
            sourceImage: testCase.image,
            source: "random-region-far-from-known-catalog-star-and-detector",
        }, manifest)) {
            randomNo += 1;
        }
    }

    return {
        caseId: testCase.id,
        yes,
        no,
        randomNo,
        stars: stars.length,
        candidates: detectionResult.candidates.length,
    };
}

async function buildOverlay(testCase, options) {
    const imagePath = path.join(IMAGE_DIR, testCase.image);
    const imageData = readPngImageData(imagePath);
    const detectionResult = await StarDetector.detectBrightStars(imageData, {
        maxDetections: 240,
        thresholdSigma: testCase.detectorOptions && Number.isFinite(testCase.detectorOptions.thresholdSigma) ?
            testCase.detectorOptions.thresholdSigma : 2.5,
        localThresholdSigma: testCase.detectorOptions && Number.isFinite(testCase.detectorOptions.localThresholdSigma) ?
            testCase.detectorOptions.localThresholdSigma : 2.5,
        requireGlobalThreshold: testCase.detectorOptions && testCase.detectorOptions.requireGlobalThreshold === true,
        maxRadiusPx: 5,
        maxElongation: 4.0,
        suppressionRadiusPx: 18,
    });
    const stars = projectStars(testCase, testCase.optpar, Math.max(7, testCase.maxMag || 7));
    const outfile = writeOverlay(testCase, imageData, stars, detectionResult.detections, options.overlayDir);
    return {
        caseId: testCase.id,
        outfile,
        stars: stars.length,
        detections: detectionResult.detections.length,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const cases = buildCases().filter(testCase => caseMatchesFilter(testCase, options.filters));
    if (cases.length === 0) {
        throw new Error(`no test cases matched: ${options.filters.join(", ")}`);
    }
    if (options.overlayOnly) {
        const summaries = [];
        for (const testCase of cases) {
            process.stderr.write(`drawing known-lens overlay for ${testCase.id}\n`);
            summaries.push(await buildOverlay(testCase, options));
        }
        for (const summary of summaries) {
            process.stdout.write(`${summary.outfile} (${summary.stars} stars, ${summary.detections} detections)\n`);
        }
        return;
    }
    ensureDirs(options.datasetDir, options.reset);
    const manifest = [];
    const summaries = [];
    for (const testCase of cases) {
        process.stderr.write(`building crops for ${testCase.id}\n`);
        summaries.push(await buildCase(testCase, options, manifest));
    }
    fs.writeFileSync(path.join(options.datasetDir, "manifest.json"), `${JSON.stringify({
        generatedUtc: new Date().toISOString(),
        cropSize: CROP_SIZE,
        cases: summaries,
        items: manifest,
    }, null, 2)}\n`);
    const yes = manifest.filter(item => item.label === "yes").length;
    const no = manifest.filter(item => item.label === "no").length;
    process.stdout.write(`wrote ${yes} yes and ${no} no crops to ${options.datasetDir}\n`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
