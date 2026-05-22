(function () {
    "use strict";

    const canvas = document.getElementById("glCanvas");
    const zoomCanvas = document.getElementById("zoomCanvas");
    const zoomContext = zoomCanvas.getContext("2d", {willReadFrequently: true});
    const hint = document.getElementById("canvasHint");
    const cardinalLayer = document.getElementById("cardinalLayer");
    const statusEl = document.getElementById("status");
    const matchInstructions = document.getElementById("matchInstructions");
    const residualHistogram = document.getElementById("residualHistogram");
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingBar = document.getElementById("loadingBar");
    const loadingText = document.getElementById("loadingText");
    const controls = {
        file: document.getElementById("imageFile"),
        timestampUtc: document.getElementById("timestampUtc"),
        latDeg: document.getElementById("latDeg"),
        lonDeg: document.getElementById("lonDeg"),
        altM: document.getElementById("altM"),
        brightness: document.getElementById("brightness"),
        brightnessValue: document.getElementById("brightnessValue"),
        contrast: document.getElementById("contrast"),
        contrastValue: document.getElementById("contrastValue"),
        maxMag: document.getElementById("maxMag"),
        magValue: document.getElementById("magValue"),
        detectorThreshold: document.getElementById("detectorThreshold"),
        detectorThresholdValue: document.getElementById("detectorThresholdValue"),
        detectorMaxStars: document.getElementById("detectorMaxStars"),
        detectorMaxStarsValue: document.getElementById("detectorMaxStarsValue"),
        detectorStarRadius: document.getElementById("detectorStarRadius"),
        detectorStarRadiusValue: document.getElementById("detectorStarRadiusValue"),
        testCase: document.getElementById("testCase"),
        prevCase: document.getElementById("prevCase"),
        nextCase: document.getElementById("nextCase"),
        flipX: document.getElementById("flipX"),
        flipY: document.getElementById("flipY"),
        flipImageX: document.getElementById("flipImageX"),
        flipImageY: document.getElementById("flipImageY"),
        toggleRaDecGrid: document.getElementById("toggleRaDecGrid"),
        toggleAzElGrid: document.getElementById("toggleAzElGrid"),
        toggleDetectionCircles: document.getElementById("toggleDetectionCircles"),
        toggleStarNames: document.getElementById("toggleStarNames"),
        resetOffset: document.getElementById("resetOffset"),
        optmod: document.getElementById("optmod"),
        fScaleX: document.getElementById("fScaleX"),
        fScaleY: document.getElementById("fScaleY"),
        rotAlpha: document.getElementById("rotAlpha"),
        rotBeta: document.getElementById("rotBeta"),
        rotGamma: document.getElementById("rotGamma"),
        du: document.getElementById("du"),
        dv: document.getElementById("dv"),
        radialAlpha: document.getElementById("radialAlpha"),
        fitLens: document.getElementById("fitLens"),
        toggleFitResiduals: document.getElementById("toggleFitResiduals"),
        clearMatches: document.getElementById("clearMatches"),
    };

    const gl = canvas.getContext("webgl", {antialias: true, preserveDrawingBuffer: true});
    if (!gl) {
        statusEl.textContent = "WebGL is not available in this browser.";
        return;
    }

    const state = {
        image: null,
        texture: null,
        imagePixels: null,
        imageName: "",
        localImageUrl: null,
        activeCase: null,
        baseOptpar: null,
        imageLoadId: 0,
        flipX: false,
        flipY: false,
        imageFlipX: false,
        imageFlipY: false,
        showRaDecGrid: false,
        showAzElGrid: true,
        showDetectionCircles: true,
        showStarNames: true,
        dragging: false,
        lensDragMode: "none",
        lastMouse: [0, 0],
        projected: [],
        starMatchMode: false,
        pixelProbeMode: false,
        deleteDetectionMode: false,
        maskMode: false,
        zoomMode: false,
        pixelProbe: null,
        maskRegions: [],
        detectedStars: [],
        deletedDetectionIds: new Set(),
        autoMatches: [],
        detectorStatus: "detector: no image",
        pendingMatch: null,
        matches: [],
        showPickedMatchMarkers: true,
        showFitResiduals: false,
        fitMessage: "lens fit: not run",
        lastFitVector: null,
    };
    let detectorUpdateTimer = null;

    controls.timestampUtc.value = AidaTools.dateToDatetimeLocal(new Date());
    function shader(type, source) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, source);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(sh));
        }
        return sh;
    }

    function program(vs, fs) {
        const prg = gl.createProgram();
        gl.attachShader(prg, shader(gl.VERTEX_SHADER, vs));
        gl.attachShader(prg, shader(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(prg);
        if (!gl.getProgramParameter(prg, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(prg));
        }
        return prg;
    }

    const imageProgram = program(`
        attribute vec2 a_pos;
        attribute vec2 a_tex;
        varying vec2 v_tex;
        void main() {
            v_tex = a_tex;
            gl_Position = vec4(a_pos, 0.0, 1.0);
        }
    `, `
        precision mediump float;
        uniform sampler2D u_image;
        uniform float u_brightness;
        uniform float u_contrast;
        varying vec2 v_tex;
        void main() {
            vec4 color = texture2D(u_image, v_tex);
            color.rgb = (color.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
            gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
        }
    `);

    const pointProgram = program(`
        attribute vec2 a_pixel;
        attribute float a_mag;
        uniform vec2 u_canvas_size;
        uniform float u_point_scale;
        varying float v_mag;
        void main() {
            vec2 clip = vec2(
                (a_pixel.x / u_canvas_size.x) * 2.0 - 1.0,
                1.0 - (a_pixel.y / u_canvas_size.y) * 2.0
            );
            gl_Position = vec4(clip, 0.0, 1.0);
            gl_PointSize = max(2.0, (7.0 - a_mag) * u_point_scale);
            v_mag = a_mag;
        }
    `, `
        precision mediump float;
        varying float v_mag;
        void main() {
            vec2 d = gl_PointCoord - vec2(0.5);
            float r = length(d);
            if (r > 0.5) discard;
            float alpha = smoothstep(0.5, 0.05, r);
            vec3 color = mix(vec3(0.75, 0.02, 0.02), vec3(1.0, 0.18, 0.12), clamp((6.0 - v_mag) / 4.0, 0.0, 1.0));
            gl_FragColor = vec4(color, alpha);
        }
    `);

    const lineProgram = program(`
        attribute vec2 a_pixel;
        uniform vec2 u_canvas_size;
        void main() {
            vec2 clip = vec2(
                (a_pixel.x / u_canvas_size.x) * 2.0 - 1.0,
                1.0 - (a_pixel.y / u_canvas_size.y) * 2.0
            );
            gl_Position = vec4(clip, 0.0, 1.0);
        }
    `, `
        precision mediump float;
        uniform vec4 u_color;
        void main() {
            gl_FragColor = u_color;
        }
    `);

    const quadBuffer = gl.createBuffer();
    const pointBuffer = gl.createBuffer();
    const lineBuffer = gl.createBuffer();

    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function imageViewport() {
        if (!state.image) {
            return {x: 0, y: 0, w: canvas.width, h: canvas.height, scale: 1};
        }
        const scale = Math.min(canvas.width / state.image.width, canvas.height / state.image.height);
        const w = state.image.width * scale;
        const h = state.image.height * scale;
        return {x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h, scale};
    }

    function canvasPixelFromImagePixel(x, y) {
        const [ix, iy] = displayedImagePixelFromModelImagePixel(x, y);
        return canvasPixelFromDisplayedImagePixel(ix, iy);
    }

    function canvasPixelFromDisplayedImagePixel(x, y) {
        const vp = imageViewport();
        return [vp.x + x * vp.scale, vp.y + y * vp.scale];
    }

    function imageMarkerCanvasPixel(x, y) {
        if (!state.image) {
            return [NaN, NaN];
        }
        const [ix, iy] = displayedImagePixelFromRawImagePixel(x, y);
        return canvasPixelFromDisplayedImagePixel(ix, iy);
    }

    function displayedImagePixelFromRawImagePixel(x, y) {
        return [
            state.imageFlipX ? state.image.width - 1 - x : x,
            state.imageFlipY ? state.image.height - 1 - y : y,
        ];
    }

    function rawImagePixelFromDisplayedImagePixel(x, y) {
        return [
            state.imageFlipX ? state.image.width - 1 - x : x,
            state.imageFlipY ? state.image.height - 1 - y : y,
        ];
    }

    function displayedImagePixelFromModelImagePixel(x, y) {
        return [
            state.flipX ? state.image.width - 1 - x : x,
            state.flipY ? state.image.height - 1 - y : y,
        ];
    }

    function rawImagePixelFromModelImagePixel(x, y) {
        const [displayedX, displayedY] = displayedImagePixelFromModelImagePixel(x, y);
        return rawImagePixelFromDisplayedImagePixel(displayedX, displayedY);
    }

    function isMaskedImagePixel(x, y, pad = 0) {
        for (const region of state.maskRegions) {
            const r = region.radius + pad;
            const dx = x - region.x;
            const dy = y - region.y;
            if (dx * dx + dy * dy <= r * r) {
                return true;
            }
        }
        return false;
    }

    function eventToCanvasPixel(event) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return [(event.clientX - rect.left) * dpr, (event.clientY - rect.top) * dpr];
    }

    function eventToImagePixel(event) {
        if (!state.image) {
            return null;
        }
        const [cx, cy] = eventToCanvasPixel(event);
        const vp = imageViewport();
        let x = (cx - vp.x) / vp.scale;
        let y = (cy - vp.y) / vp.scale;
        if (x < 0 || x >= state.image.width || y < 0 || y >= state.image.height) {
            return null;
        }
        x = state.imageFlipX ? state.image.width - 1 - x : x;
        y = state.imageFlipY ? state.image.height - 1 - y : y;
        return {x, y};
    }

    function canvasPixelToCssPixel(point) {
        const dpr = window.devicePixelRatio || 1;
        return [point[0] / dpr, point[1] / dpr];
    }

    function clampCanvasPointToViewport(point, inset) {
        const vp = imageViewport();
        return [
            Math.min(vp.x + vp.w - inset, Math.max(vp.x + inset, point[0])),
            Math.min(vp.y + vp.h - inset, Math.max(vp.y + inset, point[1])),
        ];
    }

    function addOverlayLabel(text, backingPixel, className, clampToImage = false) {
        let point = backingPixel;
        const inset = 22 * (window.devicePixelRatio || 1);
        if (clampToImage) {
            point = clampCanvasPointToViewport(point, inset);
        }
        const [left, top] = canvasPixelToCssPixel(point);
        if (left < 0 || left > canvas.clientWidth || top < 0 || top > canvas.clientHeight) {
            return false;
        }
        const el = document.createElement("div");
        el.className = `cardinal-label ${className || ""}`.trim();
        el.textContent = text;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        cardinalLayer.appendChild(el);
        return true;
    }

    function addOverlayCircle(backingPixel, className = "") {
        const [left, top] = canvasPixelToCssPixel(backingPixel);
        if (left < 0 || left > canvas.clientWidth || top < 0 || top > canvas.clientHeight) {
            return false;
        }
        const el = document.createElement("div");
        el.className = `match-marker ${className}`.trim();
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        cardinalLayer.appendChild(el);
        return true;
    }

    function currentOptpar() {
        const scaleX = Math.abs(Number(controls.fScaleX.value) || 1.0);
        const scaleY = Math.abs(Number(controls.fScaleY.value) || 1.0);
        const base = state.baseOptpar || [-1, 1, 0, 0, 0, 0, 0, 0.35];
        return [
            base[0] * scaleX,
            base[1] * scaleY,
            Number(controls.rotAlpha.value) || 0,
            Number(controls.rotBeta.value) || 0,
            Number(controls.rotGamma.value) || 0,
            Number(controls.du.value) || 0,
            Number(controls.dv.value) || 0,
            Number(controls.radialAlpha.value) || 0.35,
        ];
    }

    function optparFromFitVector(x) {
        const scaleX = Math.exp(x[0]);
        const scaleY = Math.exp(x[1]);
        const base = state.baseOptpar || [-1, 1, 0, 0, 0, 0, 0, 0.35];
        return [
            base[0] * scaleX,
            base[1] * scaleY,
            Number(controls.rotAlpha.value) || 0,
            Number(controls.rotBeta.value) || 0,
            x[2],
            x[3],
            x[4],
            Number(controls.radialAlpha.value) || 0.35,
        ];
    }

    function currentFitVector() {
        return [
            Math.log(Math.max(0.01, Math.abs(Number(controls.fScaleX.value) || 1.0))),
            Math.log(Math.max(0.01, Math.abs(Number(controls.fScaleY.value) || 1.0))),
            Number(controls.rotGamma.value) || 0,
            Number(controls.du.value) || 0,
            Number(controls.dv.value) || 0,
        ];
    }

    function applyFitVector(x) {
        const scaleX = Math.exp(x[0]);
        const scaleY = Math.exp(x[1]);
        controls.fScaleX.value = Math.max(0.01, Math.min(10, scaleX)).toFixed(5);
        controls.fScaleY.value = Math.max(0.01, Math.min(10, scaleY)).toFixed(5);
        controls.rotGamma.value = wrapDegrees180(x[2]).toFixed(3);
        controls.du.value = Math.max(-0.5, Math.min(0.5, x[3])).toFixed(6);
        controls.dv.value = Math.max(-0.5, Math.min(0.5, x[4])).toFixed(6);
    }

    function applyOptpar(optpar) {
        if (!optpar || optpar.length < 8) {
            state.baseOptpar = null;
            controls.fScaleX.value = "1.0000";
            controls.fScaleY.value = "1.0000";
            return;
        }
        state.baseOptpar = optpar.slice();
        controls.fScaleX.value = "1.0000";
        controls.fScaleY.value = "1.0000";
        controls.rotAlpha.value = optpar[2].toFixed(3);
        controls.rotBeta.value = optpar[3].toFixed(3);
        controls.rotGamma.value = wrapDegrees180(optpar[4]).toFixed(3);
        controls.du.value = optpar[5].toFixed(6);
        controls.dv.value = optpar[6].toFixed(6);
        controls.radialAlpha.value = optpar[7].toFixed(6);
    }

    function clamp(value, lo, hi) {
        return Math.max(lo, Math.min(hi, value));
    }

    function boresightAzElFromCameraAngles(alphaDeg, betaDeg) {
        const alpha = alphaDeg * AidaTools.DEG;
        const beta = betaDeg * AidaTools.DEG;
        const x = Math.sin(alpha) * Math.cos(beta);
        const y = Math.sin(beta);
        const z = Math.cos(alpha) * Math.cos(beta);
        const az = ((Math.atan2(x, y) * AidaTools.RAD) % 360 + 360) % 360;
        const el = Math.asin(clamp(z, -1, 1)) * AidaTools.RAD;
        return {az, el};
    }

    function setCameraAnglesFromBoresightAzEl(azDeg, elDeg) {
        const az = azDeg * AidaTools.DEG;
        const el = elDeg * AidaTools.DEG;
        const cosEl = Math.cos(el);
        const x = cosEl * Math.sin(az);
        const y = cosEl * Math.cos(az);
        const z = Math.sin(el);
        controls.rotAlpha.value = (Math.atan2(x, z) * AidaTools.RAD).toFixed(3);
        controls.rotBeta.value = (Math.asin(clamp(y, -1, 1)) * AidaTools.RAD).toFixed(3);
    }

    function optparWithCameraAngles(alphaDeg, betaDeg, gammaDeg) {
        const optpar = currentOptpar();
        optpar[2] = alphaDeg;
        optpar[3] = betaDeg;
        optpar[4] = gammaDeg;
        return optpar;
    }

    function zenithCanvasPixelForCameraAngles(alphaDeg, betaDeg, gammaDeg) {
        if (!state.image) {
            return null;
        }
        return projectAzEl(
            0,
            90,
            optparWithCameraAngles(alphaDeg, betaDeg, gammaDeg),
            Number(controls.optmod.value),
            false
        );
    }

    function solveCameraAnglesForZenithPixel(targetPixel, startAlphaDeg, startBetaDeg, gammaDeg) {
        let alpha = startAlphaDeg;
        let beta = startBetaDeg;
        let bestAlpha = alpha;
        let bestBeta = beta;
        let bestError2 = Infinity;
        const h = 0.02;

        for (let iter = 0; iter < 12; iter++) {
            const p = zenithCanvasPixelForCameraAngles(alpha, beta, gammaDeg);
            if (!p) {
                break;
            }
            const rx = p[0] - targetPixel[0];
            const ry = p[1] - targetPixel[1];
            const err2 = rx * rx + ry * ry;
            if (err2 < bestError2) {
                bestAlpha = alpha;
                bestBeta = beta;
                bestError2 = err2;
            }
            if (Math.sqrt(err2) < 0.05) {
                break;
            }

            const pa = zenithCanvasPixelForCameraAngles(alpha + h, beta, gammaDeg);
            const pb = zenithCanvasPixelForCameraAngles(alpha, beta + h, gammaDeg);
            if (!pa || !pb) {
                break;
            }

            const j11 = (pa[0] - p[0]) / h;
            const j21 = (pa[1] - p[1]) / h;
            const j12 = (pb[0] - p[0]) / h;
            const j22 = (pb[1] - p[1]) / h;
            const det = j11 * j22 - j12 * j21;
            if (Math.abs(det) < 1e-9) {
                break;
            }

            let dAlpha = (-rx * j22 + j12 * ry) / det;
            let dBeta = (-j11 * ry + rx * j21) / det;
            const step = Math.hypot(dAlpha, dBeta);
            if (step > 8) {
                dAlpha *= 8 / step;
                dBeta *= 8 / step;
            }
            alpha = wrapDegrees180(alpha + dAlpha);
            beta = clamp(beta + dBeta, -89.9, 89.9);
        }

        const finalPoint = zenithCanvasPixelForCameraAngles(alpha, beta, gammaDeg);
        if (finalPoint) {
            const finalRx = finalPoint[0] - targetPixel[0];
            const finalRy = finalPoint[1] - targetPixel[1];
            const finalError2 = finalRx * finalRx + finalRy * finalRy;
            if (finalError2 < bestError2) {
                bestAlpha = alpha;
                bestBeta = beta;
                bestError2 = finalError2;
            }
        }

        controls.rotAlpha.value = bestAlpha.toFixed(3);
        controls.rotBeta.value = bestBeta.toFixed(3);
        return Math.sqrt(bestError2);
    }

    function catalogKey(star) {
        return `${star.name}|${star.raHours.toFixed(7)}|${star.decDeg.toFixed(7)}`;
    }

    function isMatchedCatalogStar(star) {
        const key = catalogKey(star);
        return state.matches.some(match => match.catalog.key === key);
    }

    function updateProjection() {
        if (!state.image) {
            state.projected = [];
            state.autoMatches = [];
            return;
        }
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        const stars = AidaTools.visibleStars(window.AIDA_STAR_CATALOG, date, lat, lon, 6, 88);
        const optpar = currentOptpar();
        const optmod = Number(controls.optmod.value);
        state.projected = [];
        for (const star of stars) {
            const xy = AidaTools.cameraModel(star.az, star.ze, optpar, optmod, state.image.width, state.image.height);
            if (Number.isFinite(xy.x) && Number.isFinite(xy.y)) {
                state.projected.push({...star, x: xy.x, y: xy.y});
            }
        }
        updateAutoMatches();
    }

    function updateAutoMatches() {
        state.autoMatches = [];
        if (!state.image || state.projected.length === 0 || state.detectedStars.length === 0) {
            return;
        }
        const radiusPx = 28;
        const radius2 = radiusPx * radiusPx;
        const usedDetections = new Set();
        const projected = state.projected
            .filter(star => !isMatchedCatalogStar(star))
            .slice()
            .sort((a, b) => a.mag - b.mag);
        const detections = state.detectedStars.filter(det => !state.deletedDetectionIds.has(det.id));

        for (const star of projected) {
            const [rawX, rawY] = rawImagePixelFromModelImagePixel(star.x, star.y);
            let best = null;
            let bestD2 = Infinity;
            for (const detection of detections) {
                if (usedDetections.has(detection.id)) {
                    continue;
                }
                const dx = detection.x - rawX;
                const dy = detection.y - rawY;
                const d2 = dx * dx + dy * dy;
                if (d2 < bestD2) {
                    best = detection;
                    bestD2 = d2;
                }
            }
            if (best && bestD2 <= radius2) {
                usedDetections.add(best.id);
                state.autoMatches.push({
                    star,
                    detection: best,
                    modelRawX: rawX,
                    modelRawY: rawY,
                    distance: Math.sqrt(bestD2),
                });
            }
        }
    }

    function drawImage() {
        if (!state.texture || !state.image) {
            return;
        }
        const vp = imageViewport();
        const x0 = (vp.x / canvas.width) * 2 - 1;
        const x1 = ((vp.x + vp.w) / canvas.width) * 2 - 1;
        const y0 = 1 - (vp.y / canvas.height) * 2;
        const y1 = 1 - ((vp.y + vp.h) / canvas.height) * 2;
        const texLeft = state.imageFlipX ? 1 : 0;
        const texRight = state.imageFlipX ? 0 : 1;
        const texTop = state.imageFlipY ? 1 : 0;
        const texBottom = state.imageFlipY ? 0 : 1;
        const vertices = new Float32Array([
            x0, y0, texLeft, texTop,
            x1, y0, texRight, texTop,
            x0, y1, texLeft, texBottom,
            x1, y1, texRight, texBottom,
        ]);
        gl.useProgram(imageProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(imageProgram, "a_pos");
        const aTex = gl.getAttribLocation(imageProgram, "a_tex");
        gl.enableVertexAttribArray(aPos);
        gl.enableVertexAttribArray(aTex);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.texture);
        gl.uniform1i(gl.getUniformLocation(imageProgram, "u_image"), 0);
        gl.uniform1f(gl.getUniformLocation(imageProgram, "u_brightness"), Number(controls.brightness.value) || 0);
        gl.uniform1f(gl.getUniformLocation(imageProgram, "u_contrast"), Number(controls.contrast.value) || 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function drawStars() {
        if (!state.image || state.projected.length === 0) {
            return;
        }
        const values = [];
        const margin = 20 * (window.devicePixelRatio || 1);
        const maxMag = Number(controls.maxMag.value) || 4;
        for (let i = 0; i < state.projected.length; i++) {
            const star = state.projected[i];
            if (star.mag > maxMag) {
                continue;
            }
            if (isMatchedCatalogStar(star)) {
                continue;
            }
            const [x, y] = canvasPixelFromImagePixel(star.x, star.y);
            if (Number.isFinite(x) && Number.isFinite(y) &&
                    x >= -margin && x <= canvas.width + margin &&
                    y >= -margin && y <= canvas.height + margin) {
                values.push(x, y, star.mag);
            }
        }
        if (values.length === 0) {
            return;
        }
        const data = new Float32Array(values);
        gl.useProgram(pointProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        const aPixel = gl.getAttribLocation(pointProgram, "a_pixel");
        const aMag = gl.getAttribLocation(pointProgram, "a_mag");
        gl.enableVertexAttribArray(aPixel);
        gl.enableVertexAttribArray(aMag);
        gl.vertexAttribPointer(aPixel, 2, gl.FLOAT, false, 12, 0);
        gl.vertexAttribPointer(aMag, 1, gl.FLOAT, false, 12, 8);
        gl.uniform2f(gl.getUniformLocation(pointProgram, "u_canvas_size"), canvas.width, canvas.height);
        gl.uniform1f(gl.getUniformLocation(pointProgram, "u_point_scale"), window.devicePixelRatio ? 1.7 * window.devicePixelRatio : 1.7);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.drawArrays(gl.POINTS, 0, data.length / 3);
        gl.disable(gl.BLEND);
    }

    function projectRaDec(raHours, decDeg, date, lat, lon, optpar, optmod, clipToCanvas = true) {
        const azze = AidaTools.radecToAzZe(raHours, decDeg, date, lat, lon);
        if (!Number.isFinite(azze.az) || !Number.isFinite(azze.ze) || azze.ze > 88 * AidaTools.DEG) {
            return null;
        }
        const xy = AidaTools.cameraModel(azze.az, azze.ze, optpar, optmod, state.image.width, state.image.height);
        if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
            return null;
        }
        const [x, y] = canvasPixelFromImagePixel(xy.x, xy.y);
        if (clipToCanvas && (x < -50 || x > canvas.width + 50 || y < -50 || y > canvas.height + 50)) {
            return null;
        }
        return [x, y];
    }

    function addGridPolyline(points, segments) {
        let previous = null;
        for (const point of points) {
            if (point && previous) {
                segments.push(previous[0], previous[1], point[0], point[1]);
            }
            previous = point;
        }
    }

    function projectAzEl(azDeg, elDeg, optpar, optmod, clipToCanvas = true) {
        const zeDeg = 90 - elDeg;
        const xy = AidaTools.cameraModel(
            azDeg * AidaTools.DEG,
            zeDeg * AidaTools.DEG,
            optpar,
            optmod,
            state.image.width,
            state.image.height
        );
        if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
            return null;
        }
        const [x, y] = canvasPixelFromImagePixel(xy.x, xy.y);
        if (clipToCanvas && (x < -50 || x > canvas.width + 50 || y < -50 || y > canvas.height + 50)) {
            return null;
        }
        return [x, y];
    }

    function horizonPointForAz(azDeg, optpar, optmod) {
        const center = projectAzEl(0, 90, optpar, optmod, false) ||
            canvasPixelFromImagePixel(state.image.width / 2, state.image.height / 2);
        const horizon = projectAzEl(azDeg, 0, optpar, optmod, false);
        if (horizon) {
            return horizon;
        }
        const directionPoint = projectAzEl(azDeg, 30, optpar, optmod, false);
        if (!directionPoint) {
            return null;
        }
        const vx = directionPoint[0] - center[0];
        const vy = directionPoint[1] - center[1];
        const len = Math.hypot(vx, vy);
        if (len <= 1e-6) {
            return null;
        }
        return [center[0] + vx / len * Math.max(canvas.width, canvas.height),
            center[1] + vy / len * Math.max(canvas.width, canvas.height)];
    }

    function drawAzElGrid() {
        if (!state.showAzElGrid || !state.image) {
            return;
        }
        const optpar = currentOptpar();
        const optmod = Number(controls.optmod.value);
        const segments = [];

        for (let az = 0; az < 360; az += 15) {
            const points = [];
            for (let el = 0; el <= 90; el += 2) {
                points.push(projectAzEl(az, el, optpar, optmod));
            }
            addGridPolyline(points, segments);
        }

        for (const el of [0, 15, 30, 45, 60, 75]) {
            const points = [];
            for (let az = 0; az <= 360; az += 2) {
                points.push(projectAzEl(az === 360 ? 0 : az, el, optpar, optmod));
            }
            addGridPolyline(points, segments);
        }

        if (segments.length === 0) {
            return;
        }
        gl.useProgram(lineProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(segments), gl.DYNAMIC_DRAW);
        const aPixel = gl.getAttribLocation(lineProgram, "a_pixel");
        gl.enableVertexAttribArray(aPixel);
        gl.vertexAttribPointer(aPixel, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(gl.getUniformLocation(lineProgram, "u_canvas_size"), canvas.width, canvas.height);
        gl.uniform4f(gl.getUniformLocation(lineProgram, "u_color"), 1.0, 0.82, 0.2, 0.42);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINES, 0, segments.length / 2);
        gl.disable(gl.BLEND);
    }

    function drawRaDecGrid() {
        if (!state.showRaDecGrid || !state.image) {
            return;
        }
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        const optpar = currentOptpar();
        const optmod = Number(controls.optmod.value);
        const segments = [];

        for (let ra = 0; ra < 24; ra += 2) {
            const points = [];
            for (let dec = -80; dec <= 85; dec += 2.5) {
                points.push(projectRaDec(ra, dec, date, lat, lon, optpar, optmod));
            }
            addGridPolyline(points, segments);
        }

        for (const dec of [-60, -30, 0, 30, 60, 80]) {
            const points = [];
            for (let ra = 0; ra <= 24; ra += 0.25) {
                points.push(projectRaDec(ra === 24 ? 0 : ra, dec, date, lat, lon, optpar, optmod));
            }
            addGridPolyline(points, segments);
        }

        if (segments.length === 0) {
            return;
        }
        gl.useProgram(lineProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(segments), gl.DYNAMIC_DRAW);
        const aPixel = gl.getAttribLocation(lineProgram, "a_pixel");
        gl.enableVertexAttribArray(aPixel);
        gl.vertexAttribPointer(aPixel, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(gl.getUniformLocation(lineProgram, "u_canvas_size"), canvas.width, canvas.height);
        gl.uniform4f(gl.getUniformLocation(lineProgram, "u_color"), 0.3, 0.95, 1.0, 0.45);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINES, 0, segments.length / 2);
        gl.disable(gl.BLEND);
    }

    function drawAutoMatchResiduals() {
        if (!state.image || state.autoMatches.length === 0) {
            return;
        }
        const segments = [];
        for (const match of state.autoMatches) {
            const detected = imageMarkerCanvasPixel(match.detection.x, match.detection.y);
            const model = canvasPixelFromImagePixel(match.star.x, match.star.y);
            segments.push(detected[0], detected[1], model[0], model[1]);
        }
        gl.useProgram(lineProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(segments), gl.DYNAMIC_DRAW);
        const aPixel = gl.getAttribLocation(lineProgram, "a_pixel");
        gl.enableVertexAttribArray(aPixel);
        gl.vertexAttribPointer(aPixel, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(gl.getUniformLocation(lineProgram, "u_canvas_size"), canvas.width, canvas.height);
        gl.uniform4f(gl.getUniformLocation(lineProgram, "u_color"), 0.2, 1.0, 0.45, 0.55);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINES, 0, segments.length / 2);
        gl.disable(gl.BLEND);
    }

    function matchResidualRows() {
        if (!state.image || state.matches.length === 0) {
            return [];
        }
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        const optmod = Number(controls.optmod.value);
        const optpar = currentOptpar();
        const rows = [];
        for (const match of state.matches) {
            const azze = AidaTools.radecToAzZe(match.catalog.raHours, match.catalog.decDeg, date, lat, lon);
            const xy = AidaTools.cameraModel(azze.az, azze.ze, optpar, optmod, state.image.width, state.image.height);
            if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
                continue;
            }
            const [rawX, rawY] = rawImagePixelFromModelImagePixel(xy.x, xy.y);
            const dx = rawX - match.image.x;
            const dy = rawY - match.image.y;
            rows.push({
                match,
                model: {x: rawX, y: rawY},
                dx,
                dy,
                r: Math.hypot(dx, dy),
            });
        }
        return rows;
    }

    function drawFitResiduals(rows = matchResidualRows()) {
        if (rows.length === 0) {
            return;
        }
        const segments = [];
        for (const row of rows) {
            const detected = imageMarkerCanvasPixel(row.match.image.x, row.match.image.y);
            const model = imageMarkerCanvasPixel(row.model.x, row.model.y);
            segments.push(detected[0], detected[1], model[0], model[1]);
        }
        gl.useProgram(lineProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(segments), gl.DYNAMIC_DRAW);
        const aPixel = gl.getAttribLocation(lineProgram, "a_pixel");
        gl.enableVertexAttribArray(aPixel);
        gl.vertexAttribPointer(aPixel, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(gl.getUniformLocation(lineProgram, "u_canvas_size"), canvas.width, canvas.height);
        gl.uniform4f(gl.getUniformLocation(lineProgram, "u_color"), 1.0, 0.0, 0.0, 0.9);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINES, 0, segments.length / 2);
        gl.disable(gl.BLEND);
    }

    function svgEl(tag) {
        return document.createElementNS("http://www.w3.org/2000/svg", tag);
    }

    function updateResidualHistogram(rows) {
        residualHistogram.replaceChildren();
        residualHistogram.classList.toggle("visible", state.showFitResiduals);
        if (!state.showFitResiduals) {
            return;
        }

        const title = document.createElement("div");
        title.className = "residual-histogram-title";
        if (rows.length === 0) {
            title.textContent = "Fit residuals: no paired stars";
            residualHistogram.appendChild(title);
            return;
        }

        const rms = Math.sqrt(rows.reduce((acc, row) => acc + row.r * row.r, 0) / rows.length);
        const maxAbs = Math.max(1, ...rows.map(row => Math.max(Math.abs(row.dx), Math.abs(row.dy))));
        const span = Math.ceil(maxAbs * 1.15);
        title.textContent = `Fit residuals: ${rows.length} stars, RMS ${rms.toFixed(2)} px, axis +/-${span} px`;
        residualHistogram.appendChild(title);

        const svg = svgEl("svg");
        svg.setAttribute("viewBox", "0 0 240 180");
        svg.classList.add("residual-scatter-svg");
        const plot = {x0: 34, y0: 12, w: 184, h: 136};
        const sx = value => plot.x0 + (value + span) / (2 * span) * plot.w;
        const sy = value => plot.y0 + plot.h - (value + span) / (2 * span) * plot.h;
        const addLine = (x1, y1, x2, y2, className) => {
            const line = svgEl("line");
            line.setAttribute("x1", x1.toFixed(2));
            line.setAttribute("y1", y1.toFixed(2));
            line.setAttribute("x2", x2.toFixed(2));
            line.setAttribute("y2", y2.toFixed(2));
            line.classList.add(className);
            svg.appendChild(line);
        };
        addLine(plot.x0, sy(-span), plot.x0 + plot.w, sy(-span), "residual-scatter-grid");
        addLine(plot.x0, sy(span), plot.x0 + plot.w, sy(span), "residual-scatter-grid");
        addLine(sx(-span), plot.y0, sx(-span), plot.y0 + plot.h, "residual-scatter-grid");
        addLine(sx(span), plot.y0, sx(span), plot.y0 + plot.h, "residual-scatter-grid");
        addLine(plot.x0, sy(0), plot.x0 + plot.w, sy(0), "residual-scatter-axis");
        addLine(sx(0), plot.y0, sx(0), plot.y0 + plot.h, "residual-scatter-axis");

        for (const row of rows) {
            const point = svgEl("circle");
            point.setAttribute("cx", sx(row.dx).toFixed(2));
            point.setAttribute("cy", sy(row.dy).toFixed(2));
            point.setAttribute("r", "3.4");
            point.classList.add("residual-scatter-point");
            svg.appendChild(point);
        }

        const labels = [
            [`x residual (px)`, plot.x0 + plot.w / 2, 174, "middle"],
            [`y residual (px)`, 10, plot.y0 + plot.h / 2, "middle", -90],
            [`-${span}`, plot.x0, 164, "middle"],
            [`+${span}`, plot.x0 + plot.w, 164, "middle"],
            [`+${span}`, 22, plot.y0 + 3, "end"],
            [`-${span}`, 22, plot.y0 + plot.h + 3, "end"],
        ];
        for (const [text, x, y, anchor, rotate] of labels) {
            const label = svgEl("text");
            label.textContent = text;
            label.setAttribute("x", x.toFixed(2));
            label.setAttribute("y", y.toFixed(2));
            label.setAttribute("text-anchor", anchor);
            if (rotate) {
                label.setAttribute("transform", `rotate(${rotate} ${x.toFixed(2)} ${y.toFixed(2)})`);
            }
            label.classList.add("residual-scatter-label");
            svg.appendChild(label);
        }
        residualHistogram.appendChild(svg);
    }

    function drawAzElGridLabels(optpar, optmod) {
        if (!state.showAzElGrid) {
            return;
        }
        for (let az = 0; az < 360; az += 30) {
            const point = horizonPointForAz(az, optpar, optmod);
            if (point) {
                addOverlayLabel(`${az}° az`, point, "grid-label azel-label", true);
            }
        }

        for (const el of [15, 30, 45, 60, 75]) {
            const point = projectAzEl(90, el, optpar, optmod, false);
            if (point) {
                addOverlayLabel(`${el}° el`, point, "grid-label azel-label", true);
            }
        }
    }

    function drawRaDecGridLabels(optpar, optmod) {
        if (!state.showRaDecGrid) {
            return;
        }
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;

        for (let ra = 0; ra < 24; ra += 4) {
            const point = projectRaDec(ra, 0, date, lat, lon, optpar, optmod, false);
            if (point) {
                addOverlayLabel(`${ra}h`, point, "grid-label radec-label", true);
            }
        }

        for (const dec of [-60, -30, 0, 30, 60, 80]) {
            const point = projectRaDec(0, dec, date, lat, lon, optpar, optmod, false);
            if (point) {
                const sign = dec > 0 ? "+" : "";
                addOverlayLabel(`${sign}${dec}° dec`, point, "grid-label radec-label", true);
            }
        }
    }

    function drawStarNameLabels() {
        if (!state.showStarNames) {
            return;
        }
        const maxMag = Number(controls.maxMag.value) || 4;
        const margin = 20 * (window.devicePixelRatio || 1);
        const offset = 12 * (window.devicePixelRatio || 1);
        for (const star of state.projected) {
            if (star.mag > maxMag || isMatchedCatalogStar(star)) {
                continue;
            }
            const [x, y] = canvasPixelFromImagePixel(star.x, star.y);
            if (!Number.isFinite(x) || !Number.isFinite(y) ||
                    x < -margin || x > canvas.width + margin ||
                    y < -margin || y > canvas.height + margin) {
                continue;
            }
            const label = star.name && star.name.trim()
                ? star.name.trim()
                : `mag ${star.mag.toFixed(1)}`;
            addOverlayLabel(label, [x + offset, y - offset], "star-name-label");
        }
    }

    function drawMatchMarkers(optpar, optmod) {
        drawAutoDetectionMarkers();
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        for (const match of state.matches) {
            if (state.showPickedMatchMarkers) {
                const imagePoint = imageMarkerCanvasPixel(match.image.x, match.image.y);
                if (addOverlayCircle(imagePoint, "paired-marker")) {
                    addOverlayLabel(String(match.id), [imagePoint[0] + 16 * (window.devicePixelRatio || 1),
                        imagePoint[1] - 16 * (window.devicePixelRatio || 1)], "match-label");
                }
            }

            const catalogPoint = projectRaDec(
                match.catalog.raHours,
                match.catalog.decDeg,
                date,
                lat,
                lon,
                optpar,
                optmod,
                false
            );
            if (catalogPoint && addOverlayCircle(catalogPoint, "paired-marker")) {
                addOverlayLabel(String(match.id), [catalogPoint[0] + 16 * (window.devicePixelRatio || 1),
                    catalogPoint[1] - 16 * (window.devicePixelRatio || 1)], "match-label");
            }
        }

        if (state.pendingMatch) {
            addOverlayCircle(imageMarkerCanvasPixel(state.pendingMatch.image.x, state.pendingMatch.image.y),
                "paired-marker match-pending");
        }

        if (state.pixelProbe && state.pixelProbe.star) {
            const starPoint = canvasPixelFromImagePixel(state.pixelProbe.star.x, state.pixelProbe.star.y);
            addOverlayCircle(starPoint, "probe-marker");
        }
    }

    function drawAutoDetectionMarkers() {
        if (!state.image || !state.showDetectionCircles) {
            return;
        }
        const matchedIds = new Set(state.autoMatches.map(match => match.detection.id));
        const fittingIds = new Set(state.matches
            .map(match => match.detectionId)
            .filter(id => id !== undefined && id !== null));
        for (const detection of state.detectedStars) {
            if (state.deletedDetectionIds.has(detection.id)) {
                continue;
            }
            if (fittingIds.has(detection.id)) {
                continue;
            }
            if (matchedIds.has(detection.id)) {
                addOverlayCircle(imageMarkerCanvasPixel(detection.x, detection.y), "auto-match-marker");
                continue;
            }
            addOverlayCircle(imageMarkerCanvasPixel(detection.x, detection.y), "detected-marker");
        }
    }

    function drawOverlayLabels() {
        cardinalLayer.replaceChildren();
        if (!state.image) {
            return;
        }
        const optpar = currentOptpar();
        const optmod = Number(controls.optmod.value);
        const directions = [
            ["N", 0], ["NE", 45], ["E", 90], ["SE", 135],
            ["S", 180], ["SW", 225], ["W", 270], ["NW", 315],
        ];

        for (const [label, azDeg] of directions) {
            const backingPixel = horizonPointForAz(azDeg, optpar, optmod);
            if (backingPixel) {
                addOverlayLabel(label, backingPixel, "", true);
            }
        }

        drawAzElGridLabels(optpar, optmod);
        drawRaDecGridLabels(optpar, optmod);
        drawStarNameLabels();
        drawMatchMarkers(optpar, optmod);
    }

    function render() {
        resizeCanvas();
        canvas.classList.toggle("match-mode", state.starMatchMode);
        canvas.classList.toggle("probe-mode", state.pixelProbeMode);
        canvas.classList.toggle("delete-mode", state.deleteDetectionMode);
        canvas.classList.toggle("mask-mode", state.maskMode);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawImage();
        if (state.showFitResiduals) {
            const rows = matchResidualRows();
            cardinalLayer.replaceChildren();
            drawFitResiduals(rows);
            updateResidualHistogram(rows);
        } else {
            updateResidualHistogram([]);
            drawAzElGrid();
            drawRaDecGrid();
            drawStars();
            drawOverlayLabels();
        }
        controls.brightnessValue.textContent = Number(controls.brightness.value).toFixed(2);
        controls.contrastValue.textContent = Number(controls.contrast.value).toFixed(2);
        controls.magValue.textContent = Number(controls.maxMag.value).toFixed(1);
        controls.detectorThresholdValue.textContent = Number(controls.detectorThreshold.value).toFixed(1);
        controls.detectorMaxStarsValue.textContent = Number(controls.detectorMaxStars.value).toFixed(0);
        controls.detectorStarRadiusValue.textContent = Number(controls.detectorStarRadius.value).toFixed(0);
        matchInstructions.textContent = matchInstructionText();
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const optpar = currentOptpar();
        statusEl.textContent =
            `image: ${state.imageName || "none"}\n` +
            `test case: ${state.activeCase ? state.activeCase.label : "none"}\n` +
            `timestamp: ${date.toISOString()}\n` +
            `site: lat ${controls.latDeg.value} deg, lon ${controls.lonDeg.value} deg, alt ${controls.altM.value} m\n` +
            `catalog stars <= mag ${controls.maxMag.value}: ` +
            `${state.projected.filter(star => star.mag <= Number(controls.maxMag.value)).length}\n` +
            `f1/f2: ${optpar[0].toFixed(6)}, ${optpar[1].toFixed(6)} ` +
            `(multipliers x/y ${Number(controls.fScaleX.value).toFixed(4)}, ${Number(controls.fScaleY.value).toFixed(4)})\n` +
            `boresight az/el: ${boresightAzElFromCameraAngles(Number(controls.rotAlpha.value) || 0, Number(controls.rotBeta.value) || 0).az.toFixed(2)}, ` +
            `${boresightAzElFromCameraAngles(Number(controls.rotAlpha.value) || 0, Number(controls.rotBeta.value) || 0).el.toFixed(2)} deg\n` +
            `du/dv: ${controls.du.value}, ${controls.dv.value}\n` +
            `mouse drag: edits lens parameters directly\n` +
            `overlay flip x/y: ${state.flipX}/${state.flipY}\n` +
            `image flip x/y: ${state.imageFlipX}/${state.imageFlipY}\n` +
            `image masks: ${state.maskRegions.length}\n` +
            `RA/Dec grid: ${state.showRaDecGrid ? "on" : "off"}\n` +
            `az/el grid: ${state.showAzElGrid ? "on" : "off"}\n` +
            `detection circles: ${state.showDetectionCircles ? "on" : "off"}\n` +
            `star names: ${state.showStarNames ? "on" : "off"}\n` +
            `fit residuals: ${state.showFitResiduals ? "on" : "off"}\n` +
            `star match mode: ${state.starMatchMode ? "on" : "off"}${state.pendingMatch ? " (select catalog star)" : ""}\n` +
            `matched star pairs: ${state.matches.length}\n` +
            `${fitResidualStatusText()}\n` +
            `${autoDetectionStatusText()}\n` +
            `${pixelProbeText()}\n` +
            state.fitMessage;
    }

    function recomputeAndRender() {
        updateProjection();
        render();
    }

    function matchInstructionText() {
        if (!state.image) {
            return "Load an image first. Then hold s to select matched image/catalog stars.";
        }
        if (state.showFitResiduals) {
            return "Fit residual mode: normal markings are hidden. Red lines connect each identified image star to its fitted catalog position; press r to return.";
        }
        if (state.deleteDetectionMode) {
            return "Detection delete mode: click an automatically detected star to remove it from proximity matching.";
        }
        if (state.maskMode) {
            return "Mask mode: click the image to black out a 100 px radius region and exclude it from starfinding.";
        }
        if (state.zoomMode) {
            return "Zoom mode: move the mouse over the image to inspect a 100 x 100 raw-pixel region.";
        }
        if (!state.starMatchMode) {
            return "Left-drag moves the 90 deg elevation point in x/y. Right-drag rotates the azimuth grid around that point. Wheel edits the focal multiplier. Press c to show/hide detection circles, n to show/hide star names. Hold s to match stars, p to probe pixels, d to delete an auto detection, m to mask image regions, or z to zoom.";
        }
        if (!state.pendingMatch) {
            return "Star matching: click a visible starfinder detection first. Orange detections are auto-paired; red detections are unpaired.";
        }
        return "Starfinder detection selected. Keep holding s and click the matching visible catalog star below the current magnitude limit.";
    }

    function autoDetectionStatusText() {
        if (!state.image) {
            return "auto detections: no image";
        }
        const active = state.detectedStars.length - state.deletedDetectionIds.size;
        let text = `auto detections: ${active}/${state.detectedStars.length} active; ` +
            `${state.autoMatches.length} centroid/catalog matches within 28 px`;
        if (state.autoMatches.length > 0) {
            const rms = Math.sqrt(state.autoMatches.reduce((acc, match) => acc + match.distance * match.distance, 0) /
                state.autoMatches.length);
            const med = median(state.autoMatches.map(match => match.distance));
            text += `; RMS ${rms.toFixed(2)} px, median ${med.toFixed(2)} px`;
        }
        return `${text}; ${state.detectorStatus}`;
    }

    function fitResidualStatusText() {
        const rows = matchResidualRows();
        if (rows.length === 0) {
            return "fit residual scatter: no identified stars";
        }
        let sumDx = 0;
        let sumDy = 0;
        let sumR2 = 0;
        for (const row of rows) {
            sumDx += row.dx;
            sumDy += row.dy;
            sumR2 += row.r * row.r;
        }
        const meanDx = sumDx / rows.length;
        const meanDy = sumDy / rows.length;
        let varDx = 0;
        let varDy = 0;
        for (const row of rows) {
            varDx += (row.dx - meanDx) * (row.dx - meanDx);
            varDy += (row.dy - meanDy) * (row.dy - meanDy);
        }
        const sigmaDx = Math.sqrt(varDx / rows.length);
        const sigmaDy = Math.sqrt(varDy / rows.length);
        const rms = Math.sqrt(sumR2 / rows.length);
        const sortedR = rows.map(row => row.r).sort((a, b) => a - b);
        const medianR = sortedR[Math.floor(sortedR.length / 2)];
        const maxR = sortedR[sortedR.length - 1];
        return `fit residual scatter: ${rows.length} stars, RMS ${rms.toFixed(2)} px, ` +
            `median ${medianR.toFixed(2)} px, max ${maxR.toFixed(2)} px, ` +
            `mean dx/dy ${meanDx.toFixed(2)}/${meanDy.toFixed(2)} px, ` +
            `sigma dx/dy ${sigmaDx.toFixed(2)}/${sigmaDy.toFixed(2)} px`;
    }

    function wrapDegrees180(value) {
        let wrapped = ((value + 180) % 360 + 360) % 360 - 180;
        if (wrapped === -180) {
            wrapped = 180;
        }
        return wrapped;
    }

    function imageGray(x, y) {
        if (!state.imagePixels) {
            return 0;
        }
        const ix = Math.max(0, Math.min(state.image.width - 1, Math.round(x)));
        const iy = Math.max(0, Math.min(state.image.height - 1, Math.round(y)));
        if (isMaskedImagePixel(ix, iy)) {
            return 0;
        }
        const k = 4 * (iy * state.image.width + ix);
        const data = state.imagePixels.data;
        return 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
    }

    function imageGrayAtIndex(ix, iy) {
        if (isMaskedImagePixel(ix, iy)) {
            return 0;
        }
        const k = 4 * (iy * state.image.width + ix);
        const data = state.imagePixels.data;
        return 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
    }

    function median(values) {
        if (values.length === 0) {
            return 0;
        }
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
    }

    function percentile(sortedValues, fraction) {
        if (sortedValues.length === 0) {
            return 0;
        }
        const idx = Math.max(0, Math.min(sortedValues.length - 1,
            Math.round(fraction * (sortedValues.length - 1))));
        return sortedValues[idx];
    }

    function autoAdjustDisplayStretch() {
        if (!state.imagePixels || !state.image) {
            controls.brightness.value = "0.00";
            controls.contrast.value = "1.00";
            return;
        }
        const values = [];
        const data = state.imagePixels.data;
        const width = state.image.width;
        const height = state.image.height;
        const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 90000)));
        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                const k = 4 * (y * width + x);
                values.push(0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]);
            }
        }
        values.sort((a, b) => a - b);
        const lo = percentile(values, 0.08);
        const hi = percentile(values, 0.997);
        const span = Math.max(8, hi - lo);
        const contrast = Math.max(0.25, Math.min(4.0, 0.9 * 255 / span));
        const mid = 0.5 * (lo + hi) / 255;
        const brightness = Math.max(-1.0, Math.min(1.0, -(mid - 0.5) * contrast));
        controls.contrast.value = contrast.toFixed(2);
        controls.brightness.value = brightness.toFixed(2);
    }

    function setLoadingProgress(percent, text) {
        loadingOverlay.classList.add("visible");
        loadingBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        loadingText.textContent = text;
    }

    function hideLoadingProgress() {
        loadingBar.style.width = "100%";
        window.setTimeout(() => {
            loadingOverlay.classList.remove("visible");
        }, 180);
    }

    function detectImageStars() {
        state.detectedStars = [];
        state.deletedDetectionIds = new Set();
        state.autoMatches = [];
        if (!state.imagePixels || !state.image) {
            state.detectorStatus = "detector: image readback unavailable";
            return;
        }

        const width = state.image.width;
        const height = state.image.height;
        const samples = [];
        for (let y = 4; y < height; y += 8) {
            for (let x = 4; x < width; x += 8) {
                if (isMaskedImagePixel(x, y)) {
                    continue;
                }
                samples.push(imageGrayAtIndex(x, y));
            }
        }
        if (samples.length === 0) {
            state.detectorStatus = "detector: image fully masked";
            return;
        }
        const bg = median(samples);
        const absDev = samples.map(value => Math.abs(value - bg));
        const sigma = Math.max(1, 1.4826 * median(absDev));
        const thresholdSigma = Number(controls.detectorThreshold.value) || 2.0;
        const starRadius = Math.max(3, Math.min(14, Math.round(Number(controls.detectorStarRadius.value) || 5)));
        const centroidRadius = starRadius;
        const wideCentroidRadius = Math.max(centroidRadius + 1, Math.round(1.6 * starRadius));
        const annulusInner = Math.max(4, 1.3 * starRadius);
        const annulusOuter = Math.max(annulusInner + 2, 2.2 * starRadius);
        const maxRadius2 = Math.max(28.0, Math.pow(1.45 * starRadius, 2));
        const preThreshold = bg + Math.max(2, 0.35 * thresholdSigma * sigma);
        const candidates = [];

        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                if (isMaskedImagePixel(x, y, annulusOuter + 2)) {
                    continue;
                }
                const value = imageGrayAtIndex(x, y);
                if (value < preThreshold) {
                    continue;
                }
                let isPeak = true;
                for (let dy = -1; dy <= 1 && isPeak; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if ((dx !== 0 || dy !== 0) && imageGrayAtIndex(x + dx, y + dy) > value) {
                            isPeak = false;
                            break;
                        }
                    }
                }
                if (!isPeak) {
                    continue;
                }

                const bgSamples = [];
                const bgRadius = Math.ceil(annulusOuter);
                for (let dy = -bgRadius; dy <= bgRadius; dy++) {
                    for (let dx = -bgRadius; dx <= bgRadius; dx++) {
                        const r = Math.hypot(dx, dy);
                        if (r >= annulusInner && r <= annulusOuter &&
                                x + dx >= 0 && x + dx < width &&
                                y + dy >= 0 && y + dy < height) {
                            bgSamples.push(imageGrayAtIndex(x + dx, y + dy));
                        }
                    }
                }
                const localBg = bgSamples.length ? median(bgSamples) : bg;
                const localDev = bgSamples.map(sample => Math.abs(sample - localBg));
                const localSigma = Math.max(1, 1.4826 * median(localDev));
                const peakContrast = value - localBg;
                const localContrastThreshold = Math.max(thresholdSigma * localSigma, 3 + 2 * thresholdSigma);
                if (peakContrast < localContrastThreshold) {
                    continue;
                }
                let centroid = weightedCentroid(x, y, centroidRadius, localBg);
                if (!Number.isFinite(centroid.x) || !Number.isFinite(centroid.y)) {
                    continue;
                }
                let peak = imageGray(centroid.x, centroid.y);
                let flux = 0;
                let moment = 0;
                let mxx = 0;
                let myy = 0;
                let mxy = 0;
                let saturated = 0;
                let radius2 = Infinity;
                let elongation = Infinity;
                for (const apertureRadius of [centroidRadius, wideCentroidRadius]) {
                    flux = 0;
                    moment = 0;
                    mxx = 0;
                    myy = 0;
                    mxy = 0;
                    saturated = 0;
                    for (let dy = -apertureRadius; dy <= apertureRadius; dy++) {
                        for (let dx = -apertureRadius; dx <= apertureRadius; dx++) {
                            if (dx * dx + dy * dy <= apertureRadius * apertureRadius) {
                                const sample = imageGray(centroid.x + dx, centroid.y + dy);
                                if (sample >= 252) {
                                    saturated += 1;
                                }
                                const w = Math.max(0, sample - localBg);
                                flux += w;
                                moment += w * (dx * dx + dy * dy);
                                mxx += w * dx * dx;
                                myy += w * dy * dy;
                                mxy += w * dx * dy;
                            }
                        }
                    }
                    if (flux <= 0) {
                        continue;
                    }
                    radius2 = moment / flux;
                    const trace = (mxx + myy) / flux;
                    const delta = Math.hypot((mxx - myy) / flux, 2 * mxy / flux);
                    const minor = Math.max(1e-6, 0.5 * (trace - delta));
                    const major = Math.max(minor, 0.5 * (trace + delta));
                    elongation = Math.sqrt(major / minor);
                    if (radius2 > 0.3 * starRadius * starRadius && apertureRadius === centroidRadius) {
                        centroid = weightedCentroid(x, y, wideCentroidRadius, localBg);
                        peak = imageGray(centroid.x, centroid.y);
                        continue;
                    }
                    break;
                }
                const saturatedLimit = Math.max(18, 0.55 * Math.PI * wideCentroidRadius * wideCentroidRadius);
                if (flux <= 0 || !Number.isFinite(centroid.x) || !Number.isFinite(centroid.y) ||
                        saturated > saturatedLimit) {
                    continue;
                }
                if (radius2 < 0.25 || radius2 > maxRadius2 || elongation > 3.4) {
                    continue;
                }
                const compactness = peakContrast / Math.max(1, Math.sqrt(radius2));
                const score = compactness * Math.sqrt(Math.max(1, flux)) / elongation;
                candidates.push({
                    x: centroid.x,
                    y: centroid.y,
                    peak,
                    flux,
                    background: localBg,
                    radius: Math.sqrt(radius2),
                    elongation,
                    score,
                });
            }
        }

        candidates.sort((a, b) => b.score - a.score);
        const selected = [];
        const suppression2 = 8 * 8;
        const maxDetections = Math.max(1, Number(controls.detectorMaxStars.value) || 250);
        for (const candidate of candidates) {
            if (selected.length >= maxDetections) {
                break;
            }
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
        }
        state.detectedStars = selected.map((det, i) => ({...det, rank: i + 1}));
        state.detectorStatus = `DAO-style detector: bg ${bg.toFixed(1)}, sigma ${sigma.toFixed(1)}, ` +
            `prefilter ${preThreshold.toFixed(1)}, threshold ${thresholdSigma.toFixed(1)} local sigma, ` +
            `radius ${starRadius} px, ${candidates.length} candidates, max ${maxDetections}`;
        updateAutoMatches();
    }

    function scheduleDetectImageStars() {
        controls.detectorThresholdValue.textContent = Number(controls.detectorThreshold.value).toFixed(1);
        controls.detectorMaxStarsValue.textContent = Number(controls.detectorMaxStars.value).toFixed(0);
        controls.detectorStarRadiusValue.textContent = Number(controls.detectorStarRadius.value).toFixed(0);
        if (detectorUpdateTimer) {
            window.clearTimeout(detectorUpdateTimer);
        }
        detectorUpdateTimer = window.setTimeout(() => {
            detectorUpdateTimer = null;
            detectImageStars();
            render();
        }, 160);
    }

    function hideZoomCanvas() {
        zoomCanvas.classList.remove("visible");
    }

    function updateZoomCanvas(event) {
        if (!state.zoomMode || !state.imagePixels || !state.image) {
            hideZoomCanvas();
            return;
        }
        const point = eventToImagePixel(event);
        if (!point) {
            hideZoomCanvas();
            return;
        }

        const size = 100;
        const half = size / 2;
        const source = state.imagePixels.data;
        const width = state.image.width;
        const height = state.image.height;
        const patch = zoomContext.createImageData(size, size);
        for (let py = 0; py < size; py++) {
            const sy = Math.round(point.y - half + py);
            for (let px = 0; px < size; px++) {
                const sx = Math.round(point.x - half + px);
                const dst = 4 * (py * size + px);
                if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
                    patch.data[dst] = 0;
                    patch.data[dst + 1] = 0;
                    patch.data[dst + 2] = 0;
                    patch.data[dst + 3] = 255;
                    continue;
                }
                const src = 4 * (sy * width + sx);
                patch.data[dst] = source[src];
                patch.data[dst + 1] = source[src + 1];
                patch.data[dst + 2] = source[src + 2];
                patch.data[dst + 3] = 255;
            }
        }
        zoomContext.putImageData(patch, 0, 0);
        zoomContext.strokeStyle = "rgba(250, 204, 21, 0.95)";
        zoomContext.lineWidth = 1;
        zoomContext.beginPath();
        zoomContext.moveTo(50, 42);
        zoomContext.lineTo(50, 58);
        zoomContext.moveTo(42, 50);
        zoomContext.lineTo(58, 50);
        zoomContext.stroke();

        const panelRect = canvas.parentElement.getBoundingClientRect();
        const cssX = event.clientX - panelRect.left;
        const cssY = event.clientY - panelRect.top;
        const zoomSize = 300;
        let left = cssX + 18;
        let top = cssY + 18;
        if (left + zoomSize > panelRect.width) {
            left = cssX - zoomSize - 18;
        }
        if (top + zoomSize > panelRect.height) {
            top = cssY - zoomSize - 18;
        }
        zoomCanvas.style.left = `${Math.max(8, left)}px`;
        zoomCanvas.style.top = `${Math.max(8, top)}px`;
        zoomCanvas.classList.add("visible");
    }

    function uploadImagePixelsToTexture() {
        if (!state.texture || !state.imagePixels) {
            return;
        }
        gl.bindTexture(gl.TEXTURE_2D, state.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.imagePixels);
    }

    function maskImageRegion(rawX, rawY, radius = 100) {
        if (!state.imagePixels || !state.image) {
            return false;
        }
        const cx = Math.round(rawX);
        const cy = Math.round(rawY);
        const r = Math.round(radius);
        const r2 = r * r;
        const width = state.image.width;
        const height = state.image.height;
        const data = state.imagePixels.data;
        const x0 = Math.max(0, cx - r);
        const x1 = Math.min(width - 1, cx + r);
        const y0 = Math.max(0, cy - r);
        const y1 = Math.min(height - 1, cy + r);
        for (let y = y0; y <= y1; y++) {
            const dy = y - cy;
            for (let x = x0; x <= x1; x++) {
                const dx = x - cx;
                if (dx * dx + dy * dy > r2) {
                    continue;
                }
                const k = 4 * (y * width + x);
                data[k] = 0;
                data[k + 1] = 0;
                data[k + 2] = 0;
                data[k + 3] = 255;
            }
        }
        state.maskRegions.push({x: cx, y: cy, radius: r});
        uploadImagePixelsToTexture();
        detectImageStars();
        updateAutoMatches();
        return true;
    }

    function solveLinearSystem(a, b) {
        const n = b.length;
        const m = a.map((row, i) => row.concat([b[i]]));
        for (let col = 0; col < n; col++) {
            let pivot = col;
            for (let r = col + 1; r < n; r++) {
                if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) {
                    pivot = r;
                }
            }
            if (Math.abs(m[pivot][col]) < 1e-12) {
                return null;
            }
            [m[col], m[pivot]] = [m[pivot], m[col]];
            const div = m[col][col];
            for (let c = col; c <= n; c++) {
                m[col][c] /= div;
            }
            for (let r = 0; r < n; r++) {
                if (r === col) {
                    continue;
                }
                const factor = m[r][col];
                for (let c = col; c <= n; c++) {
                    m[r][c] -= factor * m[col][c];
                }
            }
        }
        return m.map(row => row[n]);
    }

    function weightedCentroid(cx, cy, radius, background = null) {
        let sum = 0;
        let sx = 0;
        let sy = 0;
        const bg = background === null ? imageGray(cx - radius, cy - radius) : background;
        const sigma = Math.max(1.5, radius / 2.2);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const r2 = dx * dx + dy * dy;
                if (r2 > radius * radius) {
                    continue;
                }
                const weight = Math.max(0, imageGray(cx + dx, cy + dy) - bg) * Math.exp(-0.5 * r2 / (sigma * sigma));
                sum += weight;
                sx += weight * (cx + dx);
                sy += weight * (cy + dy);
            }
        }
        if (sum <= 1e-9) {
            return {x: cx, y: cy, method: "peak"};
        }
        return {x: sx / sum, y: sy / sum, method: "moment"};
    }

    function gaussianCentroid(clickX, clickY) {
        if (!state.imagePixels) {
            return {x: clickX, y: clickY, method: "click"};
        }
        const searchRadius = 8;
        let peakX = Math.round(clickX);
        let peakY = Math.round(clickY);
        let peak = -Infinity;
        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const value = imageGray(clickX + dx, clickY + dy);
                if (value > peak) {
                    peak = value;
                    peakX = Math.round(clickX + dx);
                    peakY = Math.round(clickY + dy);
                }
            }
        }

        const bgSamples = [];
        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const r = Math.hypot(dx, dy);
                if (r >= searchRadius - 2 && r <= searchRadius) {
                    bgSamples.push(imageGray(peakX + dx, peakY + dy));
                }
            }
        }
        const background = median(bgSamples);

        // Iterate a Gaussian-weighted centroid around the local peak. This is
        // more stable for clipped or slightly trailed stars than using all
        // pixels in a square window.
        let center = weightedCentroid(peakX, peakY, 5, background);
        for (let iter = 0; iter < 4; iter++) {
            const next = weightedCentroid(center.x, center.y, 5, background);
            if (Math.hypot(next.x - center.x, next.y - center.y) < 0.02) {
                center = next;
                break;
            }
            center = next;
        }

        const radius = 4;
        const normal = Array.from({length: 6}, () => Array(6).fill(0));
        const rhs = Array(6).fill(0);
        let samples = 0;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const px = center.x + dx;
                const py = center.y + dy;
                const r2 = dx * dx + dy * dy;
                const intensity = imageGray(px, py) - background;
                if (intensity <= 2 || r2 > radius * radius) {
                    continue;
                }
                const row = [1, dx, dy, dx * dx, dx * dy, dy * dy];
                const value = Math.log(intensity);
                for (let r = 0; r < 6; r++) {
                    rhs[r] += row[r] * value;
                    for (let c = 0; c < 6; c++) {
                        normal[r][c] += row[r] * row[c];
                    }
                }
                samples += 1;
            }
        }
        if (samples < 8) {
            return center;
        }

        const p = solveLinearSystem(normal, rhs);
        if (!p) {
            return center;
        }
        const [, ax, ay, bxx, bxy, byy] = p;
        const det = 4 * bxx * byy - bxy * bxy;
        if (Math.abs(det) < 1e-9 || bxx >= 0 || byy >= 0) {
            return center;
        }
        const x0 = (bxy * ay - 2 * byy * ax) / det;
        const y0 = (bxy * ax - 2 * bxx * ay) / det;
        if (Math.abs(x0) > radius + 1 || Math.abs(y0) > radius + 1) {
            return center;
        }
        const fitX = center.x + x0;
        const fitY = center.y + y0;
        if (Math.hypot(fitX - clickX, fitY - clickY) > searchRadius + 2) {
            return center;
        }
        return {x: fitX, y: fitY, method: "gaussian"};
    }

    function nearestProjectedStar(event) {
        const [cx, cy] = eventToCanvasPixel(event);
        return nearestProjectedStarFromCanvasPixel(cx, cy);
    }

    function isMatchedDetection(detection) {
        return state.matches.some(match => match.detectionId === detection.id);
    }

    function nearestDetectedStar(event) {
        const imagePoint = eventToImagePixel(event);
        if (!imagePoint || state.detectedStars.length === 0) {
            return null;
        }
        let best = null;
        let bestD2 = Infinity;
        for (const detection of state.detectedStars) {
            if (state.deletedDetectionIds.has(detection.id) || isMatchedDetection(detection)) {
                continue;
            }
            const dx = detection.x - imagePoint.x;
            const dy = detection.y - imagePoint.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                best = detection;
                bestD2 = d2;
            }
        }
        const maxDist = 18;
        return best && bestD2 <= maxDist * maxDist ? {...best, distancePx: Math.sqrt(bestD2)} : null;
    }

    function nearestProjectedStarFromCanvasPixel(cx, cy) {
        const maxMag = Number(controls.maxMag.value) || 4;
        const margin = 20 * (window.devicePixelRatio || 1);
        let best = null;
        let bestD2 = Infinity;
        for (const star of state.projected) {
            if (star.mag > maxMag || isMatchedCatalogStar(star)) {
                continue;
            }
            const [x, y] = canvasPixelFromImagePixel(star.x, star.y);
            if (!Number.isFinite(x) || !Number.isFinite(y) ||
                    x < -margin || x > canvas.width + margin ||
                    y < -margin || y > canvas.height + margin) {
                continue;
            }
            const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
            if (d2 < bestD2) {
                const [displayedX, displayedY] = displayedImagePixelFromModelImagePixel(star.x, star.y);
                const [rawX, rawY] = rawImagePixelFromDisplayedImagePixel(displayedX, displayedY);
                best = {...star, displayedX, displayedY, rawX, rawY};
                bestD2 = d2;
            }
        }
        const maxDist = 35 * (window.devicePixelRatio || 1);
        return best && bestD2 <= maxDist * maxDist ? {...best, distancePx: Math.sqrt(bestD2) / (window.devicePixelRatio || 1)} : null;
    }

    function removeNearestMatchedStar(event) {
        if (state.matches.length === 0) {
            return false;
        }
        const [cx, cy] = eventToCanvasPixel(event);
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        const optmod = Number(controls.optmod.value);
        const optpar = currentOptpar();
        let bestIndex = -1;
        let bestD2 = Infinity;
        for (let i = 0; i < state.matches.length; i++) {
            const match = state.matches[i];
            const imagePoint = imageMarkerCanvasPixel(match.image.x, match.image.y);
            const imageD2 = (imagePoint[0] - cx) * (imagePoint[0] - cx) +
                (imagePoint[1] - cy) * (imagePoint[1] - cy);
            if (imageD2 < bestD2) {
                bestD2 = imageD2;
                bestIndex = i;
            }

            const azze = AidaTools.radecToAzZe(match.catalog.raHours, match.catalog.decDeg, date, lat, lon);
            const xy = AidaTools.cameraModel(azze.az, azze.ze, optpar, optmod, state.image.width, state.image.height);
            if (Number.isFinite(xy.x) && Number.isFinite(xy.y)) {
                const catalogPoint = canvasPixelFromImagePixel(xy.x, xy.y);
                const catalogD2 = (catalogPoint[0] - cx) * (catalogPoint[0] - cx) +
                    (catalogPoint[1] - cy) * (catalogPoint[1] - cy);
                if (catalogD2 < bestD2) {
                    bestD2 = catalogD2;
                    bestIndex = i;
                }
            }
        }
        const maxDist = 20 * (window.devicePixelRatio || 1);
        if (bestIndex < 0 || bestD2 > maxDist * maxDist) {
            return false;
        }
        const [removed] = state.matches.splice(bestIndex, 1);
        state.matches.forEach((match, i) => {
            match.id = i + 1;
        });
        state.pendingMatch = null;
        state.lastFitVector = null;
        updateAutoMatches();
        state.fitMessage = `removed paired star ${removed.id}: ${removed.catalog.name || "(unnamed)"}`;
        render();
        return true;
    }

    function handleStarMatchClick(event) {
        if (removeNearestMatchedStar(event)) {
            return;
        }
        if (!state.pendingMatch) {
            const detection = nearestDetectedStar(event);
            if (!detection) {
                state.fitMessage = "star match: click a visible starfinder detection first";
                render();
                return;
            }
            state.pendingMatch = {
                image: {x: detection.x, y: detection.y, method: "starfinder"},
                detectionId: detection.id,
            };
            render();
            return;
        }

        const star = nearestProjectedStar(event);
        if (!star) {
            return;
        }
        state.matches.push({
            id: state.matches.length + 1,
            image: state.pendingMatch.image,
            detectionId: state.pendingMatch.detectionId,
            catalog: {
                key: catalogKey(star),
                raHours: star.raHours,
                decDeg: star.decDeg,
                mag: star.mag,
                name: star.name,
                az: star.az,
                ze: star.ze,
            },
        });
        state.pendingMatch = null;
        state.showPickedMatchMarkers = true;
        render();
    }

    function handlePixelProbeClick(event) {
        const imagePoint = eventToImagePixel(event);
        const [cx, cy] = eventToCanvasPixel(event);
        const star = nearestProjectedStarFromCanvasPixel(cx, cy);
        if (!imagePoint) {
            state.pixelProbe = {
                message: "pixel probe: click was outside the displayed image",
                star,
            };
            render();
            return;
        }
        state.pixelProbe = {
            image: imagePoint,
            gray: imageGray(imagePoint.x, imagePoint.y),
            star,
            message: "",
        };
        render();
    }

    function handleDeleteDetectionClick(event) {
        const imagePoint = eventToImagePixel(event);
        if (!imagePoint || state.detectedStars.length === 0) {
            return;
        }
        let best = null;
        let bestD2 = Infinity;
        for (const detection of state.detectedStars) {
            if (state.deletedDetectionIds.has(detection.id)) {
                continue;
            }
            const dx = detection.x - imagePoint.x;
            const dy = detection.y - imagePoint.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                best = detection;
                bestD2 = d2;
            }
        }
        if (!best || bestD2 > 18 * 18) {
            state.fitMessage = "delete detection: no auto-detected star within 18 px";
            render();
            return;
        }
        state.deletedDetectionIds.add(best.id);
        state.fitMessage = `deleted auto detection ${best.id} at x/y ${best.x.toFixed(2)}, ${best.y.toFixed(2)}`;
        updateAutoMatches();
        render();
    }

    function pixelProbeText() {
        if (!state.pixelProbe) {
            return "pixel probe: hold p and click to inspect image/catalog pixel coordinates";
        }
        if (state.pixelProbe.message) {
            return state.pixelProbe.message;
        }
        const image = state.pixelProbe.image;
        const star = state.pixelProbe.star;
        let text = `pixel probe image raw x/y: ${image.x.toFixed(2)}, ${image.y.toFixed(2)}; gray ${state.pixelProbe.gray.toFixed(1)}`;
        if (star) {
            text += `\nnearest shown catalog star: ${star.name || "(unnamed)"} mag ${star.mag.toFixed(2)}` +
                `\nmodel raw image x/y: ${star.rawX.toFixed(2)}, ${star.rawY.toFixed(2)}` +
                `\nmodel internal x/y: ${star.x.toFixed(2)}, ${star.y.toFixed(2)}; screen distance ${star.distancePx.toFixed(1)} px`;
        } else {
            text += "\nnearest shown catalog star: none within picker radius";
        }
        return text;
    }

    function fitPenalty(x) {
        if (x.length < 5 ||
                x[0] < Math.log(0.05) || x[0] > Math.log(5) ||
                x[1] < Math.log(0.05) || x[1] > Math.log(5) ||
                Math.abs(x[2]) > 720 || Math.abs(x[3]) > 0.5 ||
                Math.abs(x[4]) > 0.5) {
            return 1e12;
        }
        return 0;
    }

    function matchObjectiveFactory() {
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        const optmod = Number(controls.optmod.value);
        const rows = state.matches.map(match => {
            const azze = AidaTools.radecToAzZe(match.catalog.raHours, match.catalog.decDeg, date, lat, lon);
            return {az: azze.az, ze: azze.ze, image: match.image};
        });
        return x => {
            const penalty = fitPenalty(x);
            if (penalty > 0 || rows.length === 0) {
                return penalty;
            }
            const optpar = optparFromFitVector(x);
            let sumSquaredResiduals = 0;
            for (const row of rows) {
                const xy = AidaTools.cameraModel(row.az, row.ze, optpar, optmod, state.image.width, state.image.height);
                if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
                    return 1e12;
                }
                const [rawX, rawY] = rawImagePixelFromModelImagePixel(xy.x, xy.y);
                // Least-squares objective: after applying the same overlay and
                // image flips used on screen, model-projected catalog stars
                // should match the picked centroids in raw image pixels.
                const dx = rawX - row.image.x;
                const dy = rawY - row.image.y;
                sumSquaredResiduals += dx * dx + dy * dy;
            }
            return sumSquaredResiduals;
        };
    }

    function nelderMead(objective, start, steps, maxIter) {
        const n = start.length;
        let simplex = [{x: start.slice(), fx: objective(start)}];
        for (let i = 0; i < n; i++) {
            const x = start.slice();
            x[i] += steps[i];
            simplex.push({x, fx: objective(x)});
        }

        const alpha = 1.0;
        const gamma = 2.0;
        const rho = 0.5;
        const sigma = 0.5;
        let iterations = 0;

        for (; iterations < maxIter; iterations++) {
            simplex.sort((a, b) => a.fx - b.fx);
            const best = simplex[0].fx;
            const spread = simplex.reduce((acc, p) => Math.max(acc, Math.abs(p.fx - best)), 0);
            if (spread < 1e-6) {
                break;
            }

            const centroid = Array(n).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    centroid[j] += simplex[i].x[j] / n;
                }
            }

            const worst = simplex[n].x;
            const reflected = centroid.map((c, j) => c + alpha * (c - worst[j]));
            const fr = objective(reflected);

            if (fr < simplex[0].fx) {
                const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
                const fe = objective(expanded);
                simplex[n] = fe < fr ? {x: expanded, fx: fe} : {x: reflected, fx: fr};
            } else if (fr < simplex[n - 1].fx) {
                simplex[n] = {x: reflected, fx: fr};
            } else {
                const contracted = centroid.map((c, j) => c + rho * (worst[j] - c));
                const fc = objective(contracted);
                if (fc < simplex[n].fx) {
                    simplex[n] = {x: contracted, fx: fc};
                } else {
                    for (let i = 1; i <= n; i++) {
                        const x = simplex[0].x.map((v, j) => v + sigma * (simplex[i].x[j] - v));
                        simplex[i] = {x, fx: objective(x)};
                    }
                }
            }
        }
        simplex.sort((a, b) => a.fx - b.fx);
        return {x: simplex[0].x, fx: simplex[0].fx, iterations};
    }

    function fitStartCandidates(objective, start) {
        const starts = [];
        const seen = new Set();
        const addStart = x => {
            if (fitPenalty(x) > 0) {
                return;
            }
            const key = x.map(value => value.toFixed(5)).join(",");
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            const fx = objective(x);
            if (Number.isFinite(fx)) {
                starts.push({x: x.slice(), fx});
            }
        };

        addStart(start);
        if (state.lastFitVector && state.lastFitVector.length === start.length) {
            addStart(state.lastFitVector);
        }

        const logFocalOffsets = [-0.08, 0, 0.08];
        const gammaOffsets = [-5, 0, 5];
        const duOffsets = [-0.015, 0, 0.015];
        const dvOffsets = [-0.015, 0, 0.015];

        for (const dFx of logFocalOffsets) {
            for (const dFy of logFocalOffsets) {
                for (const dGamma of gammaOffsets) {
                    for (const dDu of duOffsets) {
                        for (const dDv of dvOffsets) {
                            addStart([
                                start[0] + dFx,
                                start[1] + dFy,
                                start[2] + dGamma,
                                start[3] + dDu,
                                start[4] + dDv,
                            ]);
                        }
                    }
                }
            }
        }

        starts.sort((a, b) => a.fx - b.fx);
        return starts.slice(0, Math.min(10, starts.length));
    }

    function fitLensFromMatches() {
        if (!state.image || state.matches.length < 4) {
            state.fitMessage = "lens fit: need at least 4 matched star pairs";
            render();
            return;
        }

        const objective = matchObjectiveFactory();
        const start = currentFitVector();
        const startFx = objective(start);
        const steps = [0.02, 0.02, 0.5, 0.002, 0.002];
        const starts = fitStartCandidates(objective, start);
        let result = null;
        let totalIterations = 0;
        for (const candidate of starts) {
            const candidateResult = nelderMead(objective, candidate.x, steps, 300);
            totalIterations += candidateResult.iterations;
            if (!result || candidateResult.fx < result.fx) {
                result = candidateResult;
            }
        }
        if (!result) {
            state.fitMessage = "lens fit rejected: no valid grid-search start points";
            render();
            return;
        }
        const rmsBefore = Math.sqrt(startFx / state.matches.length);
        const rmsAfter = Math.sqrt(result.fx / state.matches.length);
        if (!Number.isFinite(rmsAfter) || rmsAfter > Math.max(50, rmsBefore * 1.25)) {
            state.fitMessage = `lens fit rejected: RMS ${rmsBefore.toFixed(2)} -> ${rmsAfter.toFixed(2)} px`;
            render();
            return;
        }
        applyFitVector(result.x);
        state.lastFitVector = result.x.slice();
        state.pendingMatch = null;
        state.pixelProbe = null;
        state.showPickedMatchMarkers = false;
        state.fitMessage = `lens fit: RMS ${rmsBefore.toFixed(2)} -> ${rmsAfter.toFixed(2)} px, ` +
            `${starts.length} starts, ${totalIterations} Nelder-Mead iterations; fitted fx, fy, gamma, du, dv only`;
        recomputeAndRender();
    }

    function clearIdentifiedStars() {
        const count = state.matches.length;
        state.matches = [];
        state.pendingMatch = null;
        state.lastFitVector = null;
        state.showPickedMatchMarkers = true;
        updateAutoMatches();
        state.fitMessage = count > 0
            ? `removed ${count} identified star${count === 1 ? "" : "s"}`
            : "no identified stars to remove";
        render();
    }

    function updateFitResidualButton() {
        controls.toggleFitResiduals.textContent =
            state.showFitResiduals ? "Hide fit residual view (R)" : "Show fit residual view (R)";
        controls.toggleFitResiduals.classList.toggle("toggle-on", state.showFitResiduals);
    }

    function toggleFitResiduals() {
        state.showFitResiduals = !state.showFitResiduals;
        updateFitResidualButton();
        render();
    }

    function calibrationCaseBasename(testCase) {
        if (!testCase || !testCase.image) {
            return "";
        }
        return testCase.image.split("/").pop();
    }

    function findCalibrationCaseForImageName(name) {
        const filename = name.split(/[\\/]/).pop();
        const cases = window.AIDA_CALIBRATION_CASES || [];
        return cases.find(testCase => calibrationCaseBasename(testCase) === filename) || null;
    }

    function resetInteractiveState() {
        state.matches = [];
        state.pendingMatch = null;
        state.pixelProbe = null;
        state.showPickedMatchMarkers = true;
        state.lastFitVector = null;
        state.fitMessage = "lens fit: not run";
    }

    function applyCalibrationCaseDefaults(testCase) {
        state.activeCase = testCase;
        if (!testCase) {
            state.baseOptpar = null;
            state.fitMessage = "lens fit: not run";
            return;
        }

        const cases = window.AIDA_CALIBRATION_CASES || [];
        const index = cases.indexOf(testCase);
        if (index >= 0) {
            controls.testCase.value = String(index);
        }
        if (testCase.timestampUtc) {
            controls.timestampUtc.value = testCase.timestampUtc;
        }
        if (Number.isFinite(testCase.latDeg)) {
            controls.latDeg.value = Number(testCase.latDeg).toFixed(6);
        }
        if (Number.isFinite(testCase.lonDeg)) {
            controls.lonDeg.value = Number(testCase.lonDeg).toFixed(6);
        }
        applyOptpar(testCase.optpar);
        controls.optmod.value = "2";
        state.flipX = false;
        state.flipY = false;
        state.imageFlipX = false;
        state.imageFlipY = false;
        state.fitMessage = `known lens model loaded from ${testCase.label}`;
    }

    function loadImageSource(url, name, onLoaded = null, revokeWhenLoaded = false) {
        const loadId = ++state.imageLoadId;
        const img = new Image();
        setLoadingProgress(8, `Loading ${name}...`);
        img.onload = () => {
            if (loadId !== state.imageLoadId) {
                if (revokeWhenLoaded) {
                    URL.revokeObjectURL(url);
                }
                return;
            }
            setLoadingProgress(30, "Reading image pixels...");
            window.setTimeout(() => {
                if (loadId !== state.imageLoadId) {
                    return;
                }
                if (state.texture) {
                    gl.deleteTexture(state.texture);
                }
                state.image = img;
                state.imageName = name;
                state.maskRegions = [];
                hideZoomCanvas();
                const imageCanvas = document.createElement("canvas");
                imageCanvas.width = img.width;
                imageCanvas.height = img.height;
                const imageContext = imageCanvas.getContext("2d", {willReadFrequently: true});
                imageContext.drawImage(img, 0, 0);
                try {
                    state.imagePixels = imageContext.getImageData(0, 0, img.width, img.height);
                    setLoadingProgress(50, "Adjusting brightness and contrast...");
                    autoAdjustDisplayStretch();
                } catch (error) {
                    state.imagePixels = null;
                    controls.brightness.value = "0.00";
                    controls.contrast.value = "1.00";
                    state.fitMessage = `image pixel readback unavailable for ${name}; display still works, centroid picking disabled`;
                }
                setLoadingProgress(68, "Detecting stars...");
                detectImageStars();
                setLoadingProgress(84, "Uploading image texture...");
                state.texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, state.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                // Keep WebGL texture rows in the same top-left-origin convention
                // used by the image pixel buffer and the AIDA calibration model.
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                hint.style.display = "none";
                const guessed = AidaTools.guessTimestampFromAllsky7Name(name);
                if (guessed) {
                    controls.timestampUtc.value = AidaTools.dateToDatetimeLocal(guessed);
                }
                state.pendingMatch = null;
                if (onLoaded) {
                    onLoaded(img);
                }
                if (revokeWhenLoaded) {
                    URL.revokeObjectURL(url);
                }
                setLoadingProgress(96, "Rendering calibration view...");
                recomputeAndRender();
                hideLoadingProgress();
            }, 0);
        };
        img.onerror = () => {
            if (loadId !== state.imageLoadId) {
                return;
            }
            state.fitMessage = `image load failed: ${name}. If using a web server, serve python/examples/ rather than only aida_js_calibrator/.`;
            hideLoadingProgress();
            render();
        };
        img.src = url;
    }

    function loadImageFile(file) {
        resetInteractiveState();
        const knownCase = findCalibrationCaseForImageName(file.name);
        applyCalibrationCaseDefaults(knownCase);
        if (!knownCase) {
            state.fitMessage = `no bundled lens model matched ${file.name}`;
        }
        if (state.localImageUrl) {
            URL.revokeObjectURL(state.localImageUrl);
        }
        state.localImageUrl = URL.createObjectURL(file);
        loadImageSource(state.localImageUrl, file.name, null, false);
    }

    function loadCalibrationCase(index) {
        const cases = window.AIDA_CALIBRATION_CASES || [];
        if (index < 0 || index >= cases.length) {
            return;
        }
        controls.testCase.value = String(index);
        const testCase = cases[index];
        resetInteractiveState();
        applyCalibrationCaseDefaults(testCase);
        recomputeAndRender();
    }

    function populateCalibrationCases() {
        const cases = window.AIDA_CALIBRATION_CASES || [];
        controls.testCase.replaceChildren();
        for (let i = 0; i < cases.length; i++) {
            const option = document.createElement("option");
            option.value = String(i);
            option.textContent = cases[i].label;
            controls.testCase.appendChild(option);
        }
        if (cases.length > 0) {
            controls.testCase.value = "0";
            resetInteractiveState();
            applyCalibrationCaseDefaults(cases[0]);
            render();
        }
    }

    function updateDetectionCircleButton() {
        controls.toggleDetectionCircles.textContent =
            state.showDetectionCircles ? "Hide detection circles (C)" : "Show detection circles (C)";
        controls.toggleDetectionCircles.classList.toggle("toggle-on", state.showDetectionCircles);
    }

    function toggleDetectionCircles() {
        state.showDetectionCircles = !state.showDetectionCircles;
        updateDetectionCircleButton();
        render();
    }

    function updateStarNameButton() {
        controls.toggleStarNames.textContent =
            state.showStarNames ? "Hide star names (N)" : "Show star names (N)";
        controls.toggleStarNames.classList.toggle("toggle-on", state.showStarNames);
    }

    function toggleStarNames() {
        state.showStarNames = !state.showStarNames;
        updateStarNameButton();
        render();
    }

    function handleMaskClick(event) {
        const imagePoint = eventToImagePixel(event);
        if (!imagePoint) {
            return;
        }
        if (maskImageRegion(imagePoint.x, imagePoint.y, 100)) {
            state.fitMessage = `masked 100 px radius at raw image pixel ${imagePoint.x.toFixed(1)}, ` +
                `${imagePoint.y.toFixed(1)}`;
            render();
        }
    }

    controls.file.addEventListener("change", () => {
        if (controls.file.files.length > 0) {
            loadImageFile(controls.file.files[0]);
        }
    });

    controls.testCase.addEventListener("change", () => {
        loadCalibrationCase(Number(controls.testCase.value) || 0);
    });
    controls.prevCase.addEventListener("click", () => {
        const cases = window.AIDA_CALIBRATION_CASES || [];
        if (cases.length === 0) {
            return;
        }
        const idx = Number(controls.testCase.value) || 0;
        loadCalibrationCase((idx - 1 + cases.length) % cases.length);
    });
    controls.nextCase.addEventListener("click", () => {
        const cases = window.AIDA_CALIBRATION_CASES || [];
        if (cases.length === 0) {
            return;
        }
        const idx = Number(controls.testCase.value) || 0;
        loadCalibrationCase((idx + 1) % cases.length);
    });
    for (const el of document.querySelectorAll(".controls input, .controls select")) {
        if (el !== controls.file && el !== controls.testCase &&
                el !== controls.detectorThreshold && el !== controls.detectorMaxStars &&
                el !== controls.detectorStarRadius) {
            el.addEventListener("input", recomputeAndRender);
        }
    }
    controls.detectorThreshold.addEventListener("input", scheduleDetectImageStars);
    controls.detectorMaxStars.addEventListener("input", scheduleDetectImageStars);
    controls.detectorStarRadius.addEventListener("input", scheduleDetectImageStars);

    controls.flipX.addEventListener("click", () => {
        state.flipX = !state.flipX;
        updateAutoMatches();
        render();
    });
    controls.flipY.addEventListener("click", () => {
        state.flipY = !state.flipY;
        updateAutoMatches();
        render();
    });
    controls.flipImageX.addEventListener("click", () => {
        state.imageFlipX = !state.imageFlipX;
        updateAutoMatches();
        render();
    });
    controls.flipImageY.addEventListener("click", () => {
        state.imageFlipY = !state.imageFlipY;
        updateAutoMatches();
        render();
    });
    controls.toggleRaDecGrid.addEventListener("click", () => {
        state.showRaDecGrid = !state.showRaDecGrid;
        controls.toggleRaDecGrid.textContent = state.showRaDecGrid ? "Hide RA/Dec grid" : "Show RA/Dec grid";
        render();
    });
    controls.toggleAzElGrid.addEventListener("click", () => {
        state.showAzElGrid = !state.showAzElGrid;
        controls.toggleAzElGrid.textContent = state.showAzElGrid ? "Hide az/el grid" : "Show az/el grid";
        render();
    });
    controls.toggleDetectionCircles.addEventListener("click", toggleDetectionCircles);
    controls.toggleStarNames.addEventListener("click", toggleStarNames);
    controls.toggleFitResiduals.addEventListener("click", toggleFitResiduals);
    controls.resetOffset.addEventListener("click", () => {
        setCameraAnglesFromBoresightAzEl(0, 90);
        recomputeAndRender();
    });
    controls.fitLens.addEventListener("click", fitLensFromMatches);
    controls.clearMatches.addEventListener("click", clearIdentifiedStars);

    canvas.addEventListener("pointerdown", event => {
        if (state.maskMode && event.button === 0) {
            event.preventDefault();
            handleMaskClick(event);
            return;
        }
        if (state.deleteDetectionMode && event.button === 0) {
            event.preventDefault();
            handleDeleteDetectionClick(event);
            return;
        }
        if (state.pixelProbeMode && event.button === 0) {
            event.preventDefault();
            handlePixelProbeClick(event);
            return;
        }
        if (state.starMatchMode && event.button === 0) {
            event.preventDefault();
            handleStarMatchClick(event);
            return;
        }
        state.dragging = true;
        state.lensDragMode = event.button === 0 ? "zenithPosition" : "azimuthGridRoll";
        state.lastMouse = [event.clientX, event.clientY];
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
        if (state.zoomMode) {
            updateZoomCanvas(event);
        }
        if (!state.dragging || !state.image) {
            return;
        }
        const dpr = window.devicePixelRatio || 1;
        const dxCss = event.clientX - state.lastMouse[0];
        const dyCss = event.clientY - state.lastMouse[1];
        const alpha = Number(controls.rotAlpha.value) || 0;
        const beta = Number(controls.rotBeta.value) || 0;
        const gamma = Number(controls.rotGamma.value) || 0;
        if (state.lensDragMode === "zenithPosition") {
            const zenith = zenithCanvasPixelForCameraAngles(alpha, beta, gamma);
            if (!zenith) {
                return;
            }
            solveCameraAnglesForZenithPixel(
                [zenith[0] + dxCss * dpr * 0.45, zenith[1] + dyCss * dpr * 0.45],
                alpha,
                beta,
                gamma
            );
            recomputeAndRender();
        } else if (state.lensDragMode === "azimuthGridRoll") {
            const zenith = zenithCanvasPixelForCameraAngles(alpha, beta, gamma);
            if (!zenith) {
                return;
            }
            const newGamma = wrapDegrees180(gamma + dxCss * 0.06);
            controls.rotGamma.value = newGamma.toFixed(2);
            solveCameraAnglesForZenithPixel(zenith, alpha, beta, newGamma);
            recomputeAndRender();
        }
        state.lastMouse = [event.clientX, event.clientY];
    });
    canvas.addEventListener("pointerup", event => {
        state.dragging = false;
        state.lensDragMode = "none";
        canvas.releasePointerCapture(event.pointerId);
    });
    canvas.addEventListener("contextmenu", event => {
        event.preventDefault();
    });
    canvas.addEventListener("pointerleave", () => {
        hideZoomCanvas();
    });
    canvas.addEventListener("wheel", event => {
        event.preventDefault();
        const currentX = Math.max(0.05, Number(controls.fScaleX.value) || 1.0);
        const currentY = Math.max(0.05, Number(controls.fScaleY.value) || 1.0);
        const factor = Math.exp(-event.deltaY * 0.00045);
        controls.fScaleX.value = Math.max(0.05, Math.min(10.0, currentX * factor)).toFixed(4);
        controls.fScaleY.value = Math.max(0.05, Math.min(10.0, currentY * factor)).toFixed(4);
        recomputeAndRender();
    }, {passive: false});

    document.addEventListener("keydown", event => {
        const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "select" || tag === "textarea") {
            return;
        }
        if ((event.key === "s" || event.key === "S") && !event.repeat) {
            event.preventDefault();
            state.starMatchMode = true;
            state.pixelProbeMode = false;
            state.deleteDetectionMode = false;
            state.maskMode = false;
            state.zoomMode = false;
            hideZoomCanvas();
            render();
        } else if ((event.key === "p" || event.key === "P") && !event.repeat) {
            event.preventDefault();
            state.pixelProbeMode = true;
            state.starMatchMode = false;
            state.deleteDetectionMode = false;
            state.maskMode = false;
            state.zoomMode = false;
            hideZoomCanvas();
            state.pendingMatch = null;
            render();
        } else if ((event.key === "d" || event.key === "D") && !event.repeat) {
            event.preventDefault();
            state.deleteDetectionMode = true;
            state.pixelProbeMode = false;
            state.starMatchMode = false;
            state.maskMode = false;
            state.zoomMode = false;
            hideZoomCanvas();
            state.pendingMatch = null;
            render();
        } else if ((event.key === "m" || event.key === "M") && !event.repeat) {
            event.preventDefault();
            state.maskMode = true;
            state.deleteDetectionMode = false;
            state.pixelProbeMode = false;
            state.starMatchMode = false;
            state.zoomMode = false;
            hideZoomCanvas();
            state.pendingMatch = null;
            render();
        } else if ((event.key === "z" || event.key === "Z") && !event.repeat) {
            event.preventDefault();
            state.zoomMode = true;
            state.maskMode = false;
            state.deleteDetectionMode = false;
            state.pixelProbeMode = false;
            state.starMatchMode = false;
            state.pendingMatch = null;
            render();
        } else if ((event.key === "c" || event.key === "C") && !event.repeat) {
            event.preventDefault();
            toggleDetectionCircles();
        } else if ((event.key === "n" || event.key === "N") && !event.repeat) {
            event.preventDefault();
            toggleStarNames();
        } else if ((event.key === "r" || event.key === "R") && !event.repeat) {
            event.preventDefault();
            toggleFitResiduals();
        } else if ((event.key === "f" || event.key === "F") && !event.repeat) {
            event.preventDefault();
            fitLensFromMatches();
        } else if (event.key === "Escape" && state.pendingMatch) {
            event.preventDefault();
            state.pendingMatch = null;
            render();
        }
    });
    document.addEventListener("keyup", event => {
        if (event.key === "s" || event.key === "S") {
            event.preventDefault();
            state.starMatchMode = false;
            state.pendingMatch = null;
            render();
        } else if (event.key === "p" || event.key === "P") {
            event.preventDefault();
            state.pixelProbeMode = false;
            state.pixelProbe = null;
            render();
        } else if (event.key === "d" || event.key === "D") {
            event.preventDefault();
            state.deleteDetectionMode = false;
            render();
        } else if (event.key === "m" || event.key === "M") {
            event.preventDefault();
            state.maskMode = false;
            render();
        } else if (event.key === "z" || event.key === "Z") {
            event.preventDefault();
            state.zoomMode = false;
            hideZoomCanvas();
            render();
        }
    });

    window.addEventListener("resize", render);
    populateCalibrationCases();
    updateDetectionCircleButton();
    updateStarNameButton();
    updateFitResidualButton();
    render();
})();
