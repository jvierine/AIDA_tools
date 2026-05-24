const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const zlib = require("node:zlib");

const AutoIdentifier = require("../js/auto_identifier.js");
const StarDetector = require("../js/star_detector.js");

function loadBrowserScript(filename) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", filename), "utf8");
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
const WIDTH = 1920;
const HEIGHT = 1080;
const DATE = new Date(Date.UTC(2025, 1, 19, 3, 47, 1));
const LAT_DEG = 51.4492;
const LON_DEG = 14.2794;
const MODELS = [1, 2, 3, 4, 5, 12, 20];
const REAL_CASE_IMAGE = path.join(
    __dirname,
    "..",
    "calibration_images",
    "2025_02_19_03_46_00_000_010095_first1s.png",
);
const REAL_CASE = {
    width: 1920,
    height: 1080,
    date: new Date(Date.UTC(2025, 1, 19, 3, 46, 0)),
    latDeg: 52.495090,
    lonDeg: 12.630850,
    optmod: 2,
    optpar: [
        0.784905000000,
        1.39364100000,
        -60.8000000000,
        35.2000000000,
        74.5000000000,
        0.0422890000000,
        0.00841000000000,
        0.895509000000,
    ],
};
const REAL_CASE_012165_IMAGE = path.join(
    __dirname,
    "..",
    "calibration_images",
    "2025_02_19_03_44_00_000_012165_first1s.png",
);
const REAL_CASE_012165 = {
    width: 1920,
    height: 1080,
    date: new Date(Date.UTC(2025, 1, 19, 3, 44, 0)),
    latDeg: 51.463056,
    lonDeg: 7.221944,
    altM: 0,
    optmod: 2,
    optpar: [
        0.782862000000,
        1.39037200000,
        -60.5000000000,
        23.5000000000,
        76.4000000000,
        0.0322560000000,
        -0.00191500000000,
        0.898102000000,
    ],
};
const SCENARIOS = [
    {name: "centered", f1: 0.52, f2: 0.92, alpha: 0, beta: 0, gamma: 0, du: 0, dv: 0},
    {name: "tilted", f1: 0.48, f2: 0.84, alpha: 8, beta: -5, gamma: 18, du: 0.03, dv: -0.02},
    {name: "wide-offset", f1: 0.60, f2: 1.05, alpha: -12, beta: 6, gamma: -25, du: -0.015, dv: 0.025},
];

function catalogKey(star) {
    return `${star.name}|${star.raHours.toFixed(7)}|${star.decDeg.toFixed(7)}`;
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

function readPngImageData(filename) {
    const buffer = fs.readFileSync(filename);
    assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
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
            const interlace = data[12];
            assert.equal(bitDepth, 8, "test PNG decoder expects 8-bit images");
            assert.equal(interlace, 0, "test PNG decoder expects non-interlaced images");
        } else if (type === "IDAT") {
            idat.push(data);
        } else if (type === "IEND") {
            break;
        }
        offset += 12 + length;
    }
    const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
    assert.ok(channels > 0, `unsupported PNG color type ${colorType}`);
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
            if (filter === 0) {
                row[x] = value;
            } else if (filter === 1) {
                row[x] = (value + left) & 0xff;
            } else if (filter === 2) {
                row[x] = (value + up) & 0xff;
            } else if (filter === 3) {
                row[x] = (value + Math.floor((left + up) / 2)) & 0xff;
            } else if (filter === 4) {
                row[x] = (value + paethPredictor(left, up, upLeft)) & 0xff;
            } else {
                throw new Error(`unsupported PNG filter ${filter}`);
            }
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

function optparForModel(optmod, scenario = SCENARIOS[0]) {
    const common = [
        scenario.f1,
        scenario.f2,
        scenario.alpha,
        scenario.beta,
        scenario.gamma,
        scenario.du,
        scenario.dv,
    ];
    if (optmod === 20) {
        return common.concat([-0.15, 0.02, -0.001, 0.0005, -0.0003]);
    }
    if (optmod === 1 || optmod === 4) {
        return common.concat([1.0]);
    }
    if (optmod === 5) {
        return common.concat([0.5]);
    }
    if (optmod === 12) {
        return common.concat([0.45]);
    }
    return common.concat([0.7]);
}

function projectedYaleStars(optmod, maxMag = 6.5, scenario = SCENARIOS[0]) {
    const optpar = optparForModel(optmod, scenario);
    const visible = AidaTools.visibleStars(YaleCatalog, DATE, LAT_DEG, LON_DEG, maxMag, 88);
    const projected = [];
    for (const star of visible) {
        const xy = AidaTools.cameraModel(star.az, star.ze, optpar, optmod, WIDTH, HEIGHT);
        if (Number.isFinite(xy.x) && Number.isFinite(xy.y) &&
                xy.x >= 20 && xy.x < WIDTH - 20 && xy.y >= 20 && xy.y < HEIGHT - 20) {
            projected.push({...star, x: xy.x, y: xy.y, key: catalogKey(star)});
        }
    }
    projected.sort((a, b) => a.mag - b.mag || a.key.localeCompare(b.key));
    return projected;
}

function projectedRealCaseStars(optpar = REAL_CASE.optpar, maxMag = 4.0, realCase = REAL_CASE) {
    const visible = visibleRealCaseStars(maxMag, realCase);
    const projected = [];
    for (const star of visible) {
        const xy = AidaTools.cameraModel(
            star.az,
            star.ze,
            optpar,
            realCase.optmod,
            realCase.width,
            realCase.height,
        );
        if (Number.isFinite(xy.x) && Number.isFinite(xy.y) &&
                xy.x >= 0 && xy.x < realCase.width &&
                xy.y >= 0 && xy.y < realCase.height) {
            projected.push({...star, x: xy.x, y: xy.y, key: catalogKey(star)});
        }
    }
    projected.sort((a, b) => a.mag - b.mag || a.key.localeCompare(b.key));
    return projected;
}

function visibleRealCaseStars(maxMag = 4.0, realCase = REAL_CASE) {
    return AidaTools.visibleStars(
        YaleCatalog,
        realCase.date,
        realCase.latDeg,
        realCase.lonDeg,
        maxMag,
        88,
    ).map(star => ({...star, key: catalogKey(star)}));
}

function pseudoNoise(index, salt = 0) {
    const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return value - Math.floor(value);
}

function syntheticDetections(projected, offset = {dx: 23.4, dy: -16.2}) {
    const detections = [];
    let detectionId = 1;
    const selected = projected.slice(0, 90);
    for (let i = 0; i < selected.length; i += 1) {
        const star = selected[i];
        if (i % 11 === 0) {
            continue;
        }
        const nx = (pseudoNoise(i, 1) - 0.5) * 0.9;
        const ny = (pseudoNoise(i, 2) - 0.5) * 0.9;
        detections.push({
            id: detectionId,
            x: star.x + offset.dx + nx,
            y: star.y + offset.dy + ny,
            score: 1e6 * Math.pow(10, -0.4 * star.mag) + 5000 / (i + 1),
            flux: 1e5 * Math.pow(10, -0.4 * star.mag),
            truthKey: star.key,
        });
        detectionId += 1;
    }
    for (let i = 0; i < 45; i += 1) {
        detections.push({
            id: detectionId,
            x: 30 + pseudoNoise(i, 5) * (WIDTH - 60),
            y: 30 + pseudoNoise(i, 6) * (HEIGHT - 60),
            score: 1200 + pseudoNoise(i, 7) * 900,
            flux: 500 + pseudoNoise(i, 8) * 500,
            truthKey: null,
        });
        detectionId += 1;
    }
    detections.sort((a, b) => b.score - a.score);
    detections.forEach((detection, index) => {
        detection.rank = index + 1;
    });
    return detections;
}

function skyPlaneYaleStars(maxMag = 4.0) {
    return AidaTools.visibleStars(YaleCatalog, DATE, LAT_DEG, LON_DEG, maxMag, 88)
        .map((star, index) => {
            const r = star.ze / (Math.PI / 2);
            return {
                ...star,
                x: r * Math.sin(star.az),
                y: -r * Math.cos(star.az),
                key: catalogKey(star),
                rank: index + 1,
            };
        })
        .sort((a, b) => a.mag - b.mag || a.key.localeCompare(b.key));
}

function affinePoint(point) {
    return {
        x: 500 * point.x - 85 * point.y + WIDTH / 2,
        y: 60 * point.x + 500 * point.y + HEIGHT / 2,
    };
}

function syntheticAsterismDetections(catalog) {
    const detections = [];
    let id = 1;
    for (let i = 0; i < Math.min(50, catalog.length); i += 1) {
        if (i % 13 === 0) {
            continue;
        }
        const star = catalog[i];
        const xy = affinePoint(star);
        if (xy.x < 40 || xy.x > WIDTH - 40 || xy.y < 40 || xy.y > HEIGHT - 40) {
            continue;
        }
        detections.push({
            id,
            x: xy.x + (pseudoNoise(i, 11) - 0.5) * 1.2,
            y: xy.y + (pseudoNoise(i, 12) - 0.5) * 1.2,
            score: 1e6 * Math.pow(10, -0.4 * star.mag) + 1000 / (i + 1),
            truthKey: star.key,
        });
        id += 1;
    }
    for (let i = 0; i < 15; i += 1) {
        detections.push({
            id,
            x: 50 + pseudoNoise(i, 13) * (WIDTH - 100),
            y: 50 + pseudoNoise(i, 14) * (HEIGHT - 100),
            score: 800 + pseudoNoise(i, 15) * 400,
            truthKey: null,
        });
        id += 1;
    }
    detections.sort((a, b) => b.score - a.score);
    detections.forEach((detection, index) => {
        detection.rank = index + 1;
    });
    return detections;
}

test("auto identifier recovers synthetic Yale-catalog stars for all lens models", () => {
    for (const optmod of MODELS) {
        for (const scenario of SCENARIOS) {
            const projected = projectedYaleStars(optmod, 6.5, scenario);
            assert.ok(
                projected.length > 80,
                `optmod ${optmod} ${scenario.name} should project enough Yale stars`,
            );
            const detections = syntheticDetections(projected);
            const result = AutoIdentifier.identifyStars(projected, detections, {
                imageWidth: WIDTH,
                imageHeight: HEIGHT,
                maxMagnitude: 6.5,
                maxDistancePx: 20,
                translationSearchRadiusPx: 80,
                minMatches: 12,
            });
            const correct = result.matches.filter(match => match.detection.truthKey === match.star.key);
            assert.ok(
                result.matches.length >= 60,
                `optmod ${optmod} ${scenario.name}: expected at least 60 matches, got ${result.matches.length}`,
            );
            assert.ok(
                correct.length / result.matches.length >= 0.95,
                `optmod ${optmod} ${scenario.name}: expected >=95% correct matches, ` +
                    `got ${correct.length}/${result.matches.length}`,
            );
            assert.ok(
                Math.abs(result.offset.dx - 23.4) < 1.0 && Math.abs(result.offset.dy + 16.2) < 1.0,
                `optmod ${optmod} ${scenario.name}: expected translation near 23.4/-16.2, ` +
                    `got ${result.offset.dx}/${result.offset.dy}`,
            );
        }
    }
});

test("auto identifier respects existing pairings and deleted detections", () => {
    const projected = projectedYaleStars(2);
    const detections = syntheticDetections(projected, {dx: 9.5, dy: 11.25});
    const existingCatalogKeys = new Set([projected[1].key, projected[2].key]);
    const deletedDetectionIds = new Set([detections[0].id]);
    const result = AutoIdentifier.identifyStars(projected, detections, {
        imageWidth: WIDTH,
        imageHeight: HEIGHT,
        maxMagnitude: 6.5,
        maxDistancePx: 20,
        translationSearchRadiusPx: 60,
        existingCatalogKeys,
        deletedDetectionIds,
    });
    assert.ok(result.matches.length > 50);
    assert.ok(result.matches.every(match => !existingCatalogKeys.has(match.star.key)));
    assert.ok(result.matches.every(match => !deletedDetectionIds.has(match.detection.id)));
});

test("auto identifier reports no matches without a rough geometric agreement", () => {
    const projected = projectedYaleStars(20).slice(0, 80);
    const detections = syntheticDetections(projected, {dx: 420, dy: -280});
    const result = AutoIdentifier.identifyStars(projected, detections, {
        imageWidth: WIDTH,
        imageHeight: HEIGHT,
        maxMagnitude: 6.5,
        maxDistancePx: 20,
        translationSearchRadiusPx: 60,
        minMatches: 12,
    });
    assert.ok(result.matches.length < 12);
    assert.match(result.status, /rough-align/);
});

test("KD-tree range queries return nearby two-dimensional points", () => {
    const tree = new AutoIdentifier.KdTree2([
        {x: 0, y: 0, payload: "origin"},
        {x: 3, y: 4, payload: "five"},
        {x: 12, y: 0, payload: "far"},
    ]);
    const hits = tree.range(0, 0, 5.1);
    assert.deepEqual(hits.map(hit => hit.payload), ["origin", "five"]);
});

test("asterism matcher identifies bright Yale stars without current lens projection", () => {
    const catalog = skyPlaneYaleStars(4.0);
    assert.ok(catalog.length > 40);
    const detections = syntheticAsterismDetections(catalog);
    const result = AutoIdentifier.identifyStarsByAsterisms(catalog, detections, {
        imageWidth: WIDTH,
        imageHeight: HEIGHT,
        maxMagnitude: 4.0,
        maxDetections: 50,
        maxCatalogStars: 80,
        asterismMatchRadiusPx: 18,
        triangleSignatureRadius: 0.012,
        minMatches: 10,
    });
    const correct = result.matches.filter(match => match.detection.truthKey === match.star.key);
    assert.ok(result.scoredTransforms > 0);
    assert.ok(result.matches.length >= 20, `expected >=20 asterism matches, got ${result.matches.length}`);
    assert.ok(
        correct.length / result.matches.length >= 0.95,
        `expected >=95% correct asterism matches, got ${correct.length}/${result.matches.length}`,
    );
});

test("bright-star detector finds known 010095 stars with calibrated optmod 2", async () => {
    const imageData = readPngImageData(REAL_CASE_IMAGE);
    assert.equal(imageData.width, REAL_CASE.width);
    assert.equal(imageData.height, REAL_CASE.height);
    const detectionResult = await StarDetector.detectBrightStars(imageData, {
        maxDetections: 50,
        thresholdSigma: 3.5,
        localThresholdSigma: 2.5,
    });
    const projected = projectedRealCaseStars(REAL_CASE.optpar, 4.0);
    assert.ok(projected.length >= 20, `expected projected bright stars, got ${projected.length}`);
    const identification = AutoIdentifier.identifyStars(projected, detectionResult.detections, {
        imageWidth: REAL_CASE.width,
        imageHeight: REAL_CASE.height,
        maxMagnitude: 4.0,
        maxDetections: 50,
        maxCatalogStars: 80,
        maxDistancePx: 12,
        translationSearchRadiusPx: 20,
        minMatches: 6,
    });
    assert.ok(
        identification.matches.length >= 10,
        `expected at least 10 known-model matches, got ${identification.matches.length}; ${detectionResult.status}`,
    );
    assert.ok(
        identification.medianDistance < 7,
        `expected known-model median residual below 7 px, got ${identification.medianDistance}`,
    );
});

test("bright-star detector finds known 012165 stars with calibrated optmod 2", async () => {
    const imageData = readPngImageData(REAL_CASE_012165_IMAGE);
    assert.equal(imageData.width, REAL_CASE_012165.width);
    assert.equal(imageData.height, REAL_CASE_012165.height);
    const detectionResult = await StarDetector.detectBrightStars(imageData, {
        maxDetections: 50,
        thresholdSigma: 3.5,
        localThresholdSigma: 2.5,
    });
    const projected = projectedRealCaseStars(REAL_CASE_012165.optpar, 4.0, REAL_CASE_012165);
    assert.ok(projected.length >= 20, `expected projected bright stars, got ${projected.length}`);
    const identification = AutoIdentifier.identifyStars(projected, detectionResult.detections, {
        imageWidth: REAL_CASE_012165.width,
        imageHeight: REAL_CASE_012165.height,
        maxMagnitude: 4.0,
        maxDetections: 50,
        maxCatalogStars: 80,
        maxDistancePx: 12,
        translationSearchRadiusPx: 20,
        minMatches: 6,
    });
    assert.ok(
        identification.matches.length >= 10,
        `expected at least 10 known-model matches, got ${identification.matches.length}; ${detectionResult.status}`,
    );
    assert.ok(
        identification.medianDistance < 7,
        `expected known-model median residual below 7 px, got ${identification.medianDistance}`,
    );
});

test("real 010095 detections stay useful as the lens start moves away", async () => {
    const imageData = readPngImageData(REAL_CASE_IMAGE);
    const detectionResult = await StarDetector.detectBrightStars(imageData, {maxDetections: 50});
    const perturbations = [
        {label: "calibrated", dAlpha: 0, dBeta: 0, dGamma: 0, f: 1, minMatches: 10},
        {label: "mild", dAlpha: 1.5, dBeta: -1.0, dGamma: 2.0, f: 1.02, minMatches: 8},
        {label: "rough", dAlpha: 3.0, dBeta: -2.0, dGamma: 4.0, f: 1.05, minMatches: 6},
    ];
    for (const perturbation of perturbations) {
        const optpar = REAL_CASE.optpar.slice();
        optpar[0] *= perturbation.f;
        optpar[1] *= perturbation.f;
        optpar[2] += perturbation.dAlpha;
        optpar[3] += perturbation.dBeta;
        optpar[4] += perturbation.dGamma;
        const projected = projectedRealCaseStars(optpar, 4.0);
        const result = AutoIdentifier.identifyStars(projected, detectionResult.detections, {
            imageWidth: REAL_CASE.width,
            imageHeight: REAL_CASE.height,
            maxMagnitude: 4.0,
            maxDetections: 50,
            maxCatalogStars: 80,
            maxDistancePx: perturbation.label === "calibrated" ? 12 : 35,
            translationSearchRadiusPx: 160,
            minMatches: 5,
        });
        assert.ok(
            result.matches.length >= perturbation.minMatches,
            `${perturbation.label}: expected at least ${perturbation.minMatches} matches, got ${result.matches.length}`,
        );
    }
});

test("blind spherical matcher identifies 010095 stars from image-load initial lens values", async () => {
    const imageData = readPngImageData(REAL_CASE_IMAGE);
    const detectionResult = await StarDetector.detectBrightStars(imageData, {maxDetections: 50});
    const knownStars = projectedRealCaseStars(REAL_CASE.optpar, 4.0);
    const knownByKey = new Map(knownStars.map(star => [star.key, star]));
    const truthByDetection = new Map();
    for (const detection of detectionResult.detections) {
        let best = null;
        let bestDistance = Infinity;
        for (const star of knownStars) {
            const distance = Math.hypot(detection.x - star.x, detection.y - star.y);
            if (distance < bestDistance) {
                best = star;
                bestDistance = distance;
            }
        }
        if (best && bestDistance <= 18) {
            truthByDetection.set(detection.id, best.key);
        }
    }
    assert.ok(
        truthByDetection.size >= 18,
        `expected at least 18 real bright-star detections, got ${truthByDetection.size}; ${detectionResult.status}`,
    );
    const result = AutoIdentifier.identifyStarsBlind(
        visibleRealCaseStars(4.0),
        detectionResult.detections,
        {
            imageWidth: REAL_CASE.width,
            imageHeight: REAL_CASE.height,
            maxMagnitude: 4.0,
            maxDetections: 50,
            maxCatalogStars: 80,
            minMatches: 8,
        },
    );
    const correct = result.matches.filter(match => {
        if (truthByDetection.get(match.detection.id) === match.star.key) {
            return true;
        }
        const known = knownByKey.get(match.star.key);
        return known && Math.hypot(match.detection.x - known.x, match.detection.y - known.y) <= 18;
    });
    assert.ok(
        result.matches.length >= 9,
        `expected at least 9 blind matches, got ${result.matches.length}; ${result.status}`,
    );
    assert.ok(
        correct.length >= 8,
        `expected at least 8 correct blind matches, got ${correct.length}/${result.matches.length}; ${result.status}`,
    );
    assert.ok(
        result.medianDistance < 2.0,
        `expected median blind angular residual below 2 deg, got ${result.medianDistance}`,
    );
});
