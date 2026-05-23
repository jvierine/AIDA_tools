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
    const lensEquation = document.getElementById("lensEquation");
    const densityPopup = document.getElementById("densityPopup");
    const densityPopupSubtitle = document.getElementById("densityPopupSubtitle");
    const densityPopupClose = document.getElementById("densityPopupClose");
    const densityCanvas = document.getElementById("densityCanvas");
    const densityContext = densityCanvas.getContext("2d");
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingBar = document.getElementById("loadingBar");
    const loadingText = document.getElementById("loadingText");
    const defaultImage = {
        url: "calibration_images/2025_02_19_03_47_01_000_010881_ams0882_first1s.png",
        name: "2025_02_19_03_47_01_000_010881_ams0882_first1s.png",
    };
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
        highPassImage: document.getElementById("highPassImage"),
        highPassWidth: document.getElementById("highPassWidth"),
        highPassWidthValue: document.getElementById("highPassWidthValue"),
        maxMag: document.getElementById("maxMag"),
        magValue: document.getElementById("magValue"),
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
        fitLensLm: document.getElementById("fitLensLm"),
        copyOptpar: document.getElementById("copyOptpar"),
        copyPythonMapper: document.getElementById("copyPythonMapper"),
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
        displayPixels: null,
        highPassCacheKey: "",
        imageName: "",
        localImageUrl: null,
        baseOptpar: null,
        imageLoadId: 0,
        flipX: false,
        flipY: false,
        imageFlipX: false,
        imageFlipY: false,
        displayMode: "image",
        maxMagByMode: {image: 4.0, stellarium: 6.0, pairing: 4.0},
        starNamesByMode: {image: true, stellarium: false, pairing: true},
        showRaDecGrid: false,
        showAzElGrid: true,
        showStarNames: true,
        dragging: false,
        lensDragMode: "none",
        lastMouse: [0, 0],
        projected: [],
        starMatchMode: false,
        deleteDetectionMode: false,
        maskMode: false,
        zoomMode: false,
        maskRegions: [],
        detectedStars: [],
        deletedDetectionIds: new Set(),
        autoMatches: [],
        detectorCache: null,
        detectorStatus: "detector: no image",
        pendingMatch: null,
        centroidPreview: null,
        centroidDensity: null,
        matches: [],
        showPickedMatchMarkers: true,
        showFitResiduals: false,
        fitMessage: "lens fit: not run",
        lastFitVector: null,
        lastLensEquation: "",
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
        uniform float u_max_mag;
        varying float v_mag;
        varying float v_alpha;
        void main() {
            vec2 clip = vec2(
                (a_pixel.x / u_canvas_size.x) * 2.0 - 1.0,
                1.0 - (a_pixel.y / u_canvas_size.y) * 2.0
            );
            gl_Position = vec4(clip, 0.0, 1.0);
            float size = 2.4 + 12.5 * pow(10.0, -0.13 * (a_mag + 1.0));
            gl_PointSize = clamp(size * u_point_scale, 2.5, 26.0 * u_point_scale);
            v_mag = a_mag;
            v_alpha = clamp(0.18 + 0.82 * (u_max_mag - a_mag + 0.5) / max(1.0, u_max_mag + 1.0), 0.16, 1.0);
        }
    `, `
        precision mediump float;
        varying float v_mag;
        varying float v_alpha;
        void main() {
            vec2 d = gl_PointCoord - vec2(0.5);
            float r = length(d);
            if (r > 0.5) discard;
            float core = exp(-r * r / 0.010);
            float halo = exp(-r * r / 0.085);
            float edge = smoothstep(0.5, 0.42, r);
            float alpha = clamp(2.30 * core + 0.84 * halo, 0.0, 1.0) * edge * v_alpha;
            vec3 coolWhite = vec3(0.78, 0.88, 1.0);
            vec3 warmWhite = vec3(1.0, 0.96, 0.84);
            vec3 color = mix(warmWhite, coolWhite, clamp((2.5 - v_mag) / 4.0, 0.0, 1.0));
            gl_FragColor = vec4(min(color * 2.0, vec3(1.0)), alpha);
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
        return [
            Number(controls.fScaleX.value) || 1.0,
            Number(controls.fScaleY.value) || 1.0,
            Number(controls.rotAlpha.value) || 0,
            Number(controls.rotBeta.value) || 0,
            Number(controls.rotGamma.value) || 0,
            Number(controls.du.value) || 0,
            Number(controls.dv.value) || 0,
            Number(controls.radialAlpha.value) || 0.35,
        ];
    }

    function optparFromFitVector(x) {
        return [
            x[0],
            x[1],
            x[2],
            x[3],
            x[4],
            x[5],
            x[6],
            x[7],
        ];
    }

    function currentFitVector() {
        return currentOptpar();
    }

    function applyFitVector(x) {
        controls.fScaleX.value = x[0].toFixed(6);
        controls.fScaleY.value = x[1].toFixed(6);
        controls.rotAlpha.value = Math.max(-90, Math.min(90, x[2])).toFixed(3);
        controls.rotBeta.value = Math.max(-90, Math.min(90, x[3])).toFixed(3);
        controls.rotGamma.value = wrapDegrees180(x[4]).toFixed(3);
        controls.du.value = Math.max(-0.5, Math.min(0.5, x[5])).toFixed(6);
        controls.dv.value = Math.max(-0.5, Math.min(0.5, x[6])).toFixed(6);
        controls.radialAlpha.value = Math.max(0.05, Math.min(2.5, x[7])).toFixed(6);
    }

    function applyOptpar(optpar) {
        if (!optpar || optpar.length < 8) {
            state.baseOptpar = null;
            controls.fScaleX.value = "1.0000";
            controls.fScaleY.value = "1.7700";
            return;
        }
        state.baseOptpar = optpar.slice();
        controls.fScaleX.value = optpar[0].toFixed(6);
        controls.fScaleY.value = optpar[1].toFixed(6);
        controls.rotAlpha.value = optpar[2].toFixed(3);
        controls.rotBeta.value = optpar[3].toFixed(3);
        controls.rotGamma.value = wrapDegrees180(optpar[4]).toFixed(3);
        controls.du.value = optpar[5].toFixed(6);
        controls.dv.value = optpar[6].toFixed(6);
        controls.radialAlpha.value = optpar[7].toFixed(6);
    }

    function latexNumber(value, digits = 4) {
        if (!Number.isFinite(value)) {
            return "0";
        }
        const text = Number(value).toFixed(digits);
        return text.replace(/\.?0+$/, "") || "0";
    }

    function lensEquationLatex(optpar, optmod) {
        const radial = optmod === 2
            ? "q(\\theta)=\\sin(a_r\\theta)"
            : "q(\\theta)=a_r\\theta+(1-a_r)\\tan\\theta";
        return "\\[" +
            "\\begin{aligned}" +
            "\\mathbf{o}&=[f_1,f_2,\\alpha,\\beta,\\gamma,d_u,d_v,a_r]\\\\" +
            `&=[${optpar.map((value, idx) => latexNumber(value, idx >= 2 && idx <= 4 ? 3 : 5)).join(", ")}]` +
            "\\\\" +
            "\\theta&=\\tan^{-1}\\!\\left(\\frac{\\sqrt{s_1^2+s_2^2}}{s_3}\\right),\\quad " +
            radial + "\\\\" +
            "x&=W\\left(f_1\\frac{s_1}{\\sqrt{s_1^2+s_2^2}}q(\\theta)+\\frac{1}{2}+d_u\\right)-1\\\\" +
            "y&=H\\left(f_2\\frac{s_2}{\\sqrt{s_1^2+s_2^2}}q(\\theta)+\\frac{1}{2}+d_v\\right)-1" +
            "\\end{aligned}" +
            "\\]";
    }

    function updateLensEquation(optpar, optmod) {
        if (!lensEquation) {
            return;
        }
        const latex = lensEquationLatex(optpar, optmod);
        if (latex === state.lastLensEquation) {
            return;
        }
        state.lastLensEquation = latex;
        lensEquation.textContent = latex;
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([lensEquation]).catch(() => {});
        }
    }

    function pythonFloat(value) {
        if (!Number.isFinite(value)) {
            return "0.0";
        }
        return Number(value).toPrecision(12);
    }

    function optparPythonArrayText() {
        const optpar = currentOptpar();
        return `optpar = [${optpar.map(pythonFloat).join(", ")}]`;
    }

    function pythonImageToAzElFunctionText() {
        const optpar = currentOptpar();
        const optmod = Number(controls.optmod.value) || 2;
        const width = state.image ? state.image.width : 1920;
        const height = state.image ? state.image.height : 1080;
        return `import numpy as np
from scipy.optimize import least_squares

optpar = np.array([${optpar.map(pythonFloat).join(", ")}], dtype=float)
optmod = ${optmod}
image_width = ${width}
image_height = ${height}

def _camera_rot(alpha_deg, beta_deg, gamma_deg):
    a = np.deg2rad(alpha_deg)
    b = np.deg2rad(beta_deg)
    g = np.deg2rad(gamma_deg)
    rot1 = np.array([[np.cos(g), -np.sin(g), 0.0],
                     [np.sin(g),  np.cos(g), 0.0],
                     [0.0,        0.0,       1.0]])
    rot2 = np.array([[ np.cos(a), 0.0, np.sin(a)],
                     [0.0,        1.0, 0.0],
                     [-np.sin(a), 0.0, np.cos(a)]])
    rot3 = np.array([[1.0, 0.0,       0.0],
                     [0.0, np.cos(b), np.sin(b)],
                     [0.0, -np.sin(b), np.cos(b)]])
    return rot2 @ rot3 @ rot1

def az_el_to_image(az_deg, el_deg, optpar=optpar, optmod=optmod,
                   width=image_width, height=image_height):
    az = np.deg2rad(az_deg)
    ze = np.deg2rad(90.0 - el_deg)
    rot = _camera_rot(optpar[2], optpar[3], optpar[4])
    sinze = np.sin(ze)
    es = np.array([sinze * np.sin(az), sinze * np.cos(az), np.cos(ze)])
    s1, s2, s3 = es @ rot
    radial = np.hypot(s1, s2)
    f1, f2, du, dv, radial_alpha = optpar[0], optpar[1], optpar[5], optpar[6], optpar[7]
    if radial <= 1e-12:
        u_norm = 0.5 + du
        v_norm = 0.5 + dv
    elif optmod == 2:
        theta = np.arctan2(radial, s3)
        r = np.sin(radial_alpha * theta)
        u_norm = f1 * s1 / radial * r + 0.5 + du
        v_norm = f2 * s2 / radial * r + 0.5 + dv
    else:
        theta = np.arctan2(radial, s3)
        safe_s3 = max(s3, 1e-12)
        u_norm = f1 * (1.0 - radial_alpha) * s1 / safe_s3 + f1 * radial_alpha * s1 / radial * theta + 0.5 + du
        v_norm = f2 * (1.0 - radial_alpha) * s2 / safe_s3 + f2 * radial_alpha * s2 / radial * theta + 0.5 + dv
    return np.array([u_norm * width - 1.0, v_norm * height - 1.0])

def image_to_az_el(x, y, optpar=optpar, optmod=optmod,
                   width=image_width, height=image_height):
    """Invert the fitted AIDA camera model for one image pixel.

    Returns (azimuth_deg, elevation_deg). Azimuth is wrapped to 0..360 deg.
    This numerical inverse is intended for calibrated all-sky pixels above
    the horizon; outside the fitted field of view the result can be ambiguous.
    """
    target = np.array([x, y], dtype=float)

    def residual(q):
        az_deg = q[0] % 360.0
        el_deg = q[1]
        return az_el_to_image(az_deg, el_deg, optpar, optmod, width, height) - target

    starts = [
        np.array([0.0, 90.0]),
        np.array([0.0, 60.0]),
        np.array([90.0, 60.0]),
        np.array([180.0, 60.0]),
        np.array([270.0, 60.0]),
        np.array([0.0, 25.0]),
        np.array([90.0, 25.0]),
        np.array([180.0, 25.0]),
        np.array([270.0, 25.0]),
    ]
    best = None
    for start in starts:
        result = least_squares(residual, start, bounds=([-720.0, 0.0], [720.0, 90.0]))
        err = np.linalg.norm(result.fun)
        if best is None or err < best[0]:
            best = (err, result.x)
    az_deg = best[1][0] % 360.0
    el_deg = best[1][1]
    return az_deg, el_deg
`;
    }

    function copyTextToClipboard(text, label) {
        const done = () => {
            state.fitMessage = `${label} copied to clipboard`;
            render();
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done).catch(() => {
                fallbackCopyText(text);
                done();
            });
            return;
        }
        fallbackCopyText(text);
        done();
    }

    function fallbackCopyText(text) {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
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

    function fittingMatches() {
        const maxMag = Number(controls.maxMag.value) || 4;
        return state.matches.filter(match => match.catalog.mag <= maxMag);
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
        gl.uniform1f(gl.getUniformLocation(pointProgram, "u_point_scale"),
            window.devicePixelRatio ? 1.15 * window.devicePixelRatio : 1.15);
        gl.uniform1f(gl.getUniformLocation(pointProgram, "u_max_mag"), maxMag);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.POINTS, 0, data.length / 3);
        gl.disable(gl.BLEND);
    }

    function visibleCatalogStars(maxMag = Number(controls.maxMag.value) || 4) {
        const margin = 20 * (window.devicePixelRatio || 1);
        return state.projected.filter(star => {
            if (star.mag > maxMag) {
                return false;
            }
            const [x, y] = canvasPixelFromImagePixel(star.x, star.y);
            return Number.isFinite(x) && Number.isFinite(y) &&
                x >= -margin && x <= canvas.width + margin &&
                y >= -margin && y <= canvas.height + margin;
        });
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
        const matches = fittingMatches();
        if (!state.image || matches.length === 0) {
            return [];
        }
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        const optmod = Number(controls.optmod.value);
        const optpar = currentOptpar();
        const rows = [];
        for (const match of matches) {
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
        drawWorstResidualMarker(rows);
    }

    function drawWorstResidualMarker(rows) {
        if (rows.length === 0) {
            return;
        }
        const medianDx = median(rows.map(row => row.dx));
        const medianDy = median(rows.map(row => row.dy));
        let worst = null;
        for (const row of rows) {
            const modeDistance = Math.hypot(row.dx - medianDx, row.dy - medianDy);
            if (!worst || modeDistance > worst.modeDistance) {
                worst = {...row, modeDistance};
            }
        }
        if (!worst) {
            return;
        }
        const imagePoint = imageMarkerCanvasPixel(worst.match.image.x, worst.match.image.y);
        if (!addOverlayCircle(imagePoint, "worst-residual-marker")) {
            return;
        }
        const offset = 20 * (window.devicePixelRatio || 1);
        addOverlayLabel(`outlier ${worst.modeDistance.toFixed(1)} px from median residual`,
            [imagePoint[0] + offset, imagePoint[1] - offset],
            "worst-residual-label");
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
        const offset = 12 * (window.devicePixelRatio || 1);
        for (const star of visibleCatalogStars()) {
            const [x, y] = canvasPixelFromImagePixel(star.x, star.y);
            const label = star.name && star.name.trim()
                ? star.name.trim()
                : `mag ${star.mag.toFixed(1)}`;
            addOverlayLabel(label, [x + offset, y - offset], "star-name-label");
        }
    }

    function drawCatalogPairingMarkers() {
        const offset = 12 * (window.devicePixelRatio || 1);
        for (const star of visibleCatalogStars()) {
            if (isMatchedCatalogStar(star)) {
                continue;
            }
            const [x, y] = canvasPixelFromImagePixel(star.x, star.y);
            addOverlayCircle([x, y], "catalog-pairing-marker");
            if (state.showStarNames) {
                const label = star.name && star.name.trim()
                    ? star.name.trim()
                    : `mag ${star.mag.toFixed(1)}`;
                addOverlayLabel(label, [x + offset, y - offset], "catalog-pairing-label");
            }
        }
    }

    function drawMatchMarkers(optpar, optmod) {
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        const labelOffset = 16 * (window.devicePixelRatio || 1);
        for (const match of state.matches) {
            const matchLabel = match.catalog.name && match.catalog.name.trim()
                ? match.catalog.name.trim()
                : `mag ${match.catalog.mag.toFixed(1)}`;
            if (state.showPickedMatchMarkers) {
                const imagePoint = imageMarkerCanvasPixel(match.image.x, match.image.y);
                const visible = addOverlayCircle(imagePoint, "paired-marker");
                if (visible && state.showStarNames) {
                    addOverlayLabel(matchLabel, [imagePoint[0] + labelOffset, imagePoint[1] - labelOffset],
                        "match-label");
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
                if (state.showStarNames) {
                    addOverlayLabel(matchLabel, [catalogPoint[0] + labelOffset, catalogPoint[1] - labelOffset],
                        "match-label");
                }
            }
        }

        if (state.pendingMatch) {
            addOverlayCircle(imageMarkerCanvasPixel(state.pendingMatch.image.x, state.pendingMatch.image.y),
                "paired-marker match-pending");
        }
        if (state.centroidPreview && Date.now() < state.centroidPreview.expiresAt) {
            const point = imageMarkerCanvasPixel(state.centroidPreview.x, state.centroidPreview.y);
            addOverlayCircle(point, "centroid-preview-marker");
        }

    }

    function drawAutoDetectionMarkers() {
        if (!state.image || state.displayMode !== "pairing") {
            return;
        }
        for (const detection of state.detectedStars) {
            if (state.deletedDetectionIds.has(detection.id)) {
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
        if (state.displayMode === "pairing") {
            drawCatalogPairingMarkers();
            drawMatchMarkers(optpar, optmod);
        } else {
            drawStarNameLabels();
        }
    }

    function render() {
        resizeCanvas();
        canvas.classList.toggle("match-mode", state.starMatchMode);
        canvas.classList.toggle("probe-mode", false);
        canvas.classList.toggle("delete-mode", state.deleteDetectionMode);
        canvas.classList.toggle("mask-mode", state.maskMode);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (state.showFitResiduals || state.displayMode === "image" || state.displayMode === "pairing") {
            drawImage();
        }
        if (state.showFitResiduals) {
            const rows = matchResidualRows();
            cardinalLayer.replaceChildren();
            drawFitResiduals(rows);
            updateResidualHistogram(rows);
        } else {
            updateResidualHistogram([]);
            drawAzElGrid();
            drawRaDecGrid();
            if (state.displayMode === "stellarium") {
                drawStars();
            }
            drawOverlayLabels();
        }
        controls.brightnessValue.textContent = Number(controls.brightness.value).toFixed(2);
        controls.contrastValue.textContent = Number(controls.contrast.value).toFixed(2);
        controls.highPassWidthValue.textContent = Number(controls.highPassWidth.value).toFixed(0);
        controls.magValue.textContent = Number(controls.maxMag.value).toFixed(1);
        matchInstructions.textContent = matchInstructionText();
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const optpar = currentOptpar();
        updateLensEquation(optpar, Number(controls.optmod.value));
        statusEl.textContent =
            `image: ${state.imageName || "none"}\n` +
            `timestamp: ${date.toISOString()}\n` +
            `site: lat ${controls.latDeg.value} deg, lon ${controls.lonDeg.value} deg, alt ${controls.altM.value} m\n` +
            `image high-pass: ${controls.highPassImage.checked ? `${controls.highPassWidth.value} px Gaussian` : "off"}\n` +
            `catalog stars <= mag ${controls.maxMag.value}: ` +
            `${state.projected.filter(star => star.mag <= Number(controls.maxMag.value)).length}\n` +
            `f1/f2: ${optpar[0].toFixed(6)}, ${optpar[1].toFixed(6)}\n` +
            `boresight az/el: ${boresightAzElFromCameraAngles(Number(controls.rotAlpha.value) || 0, Number(controls.rotBeta.value) || 0).az.toFixed(2)}, ` +
            `${boresightAzElFromCameraAngles(Number(controls.rotAlpha.value) || 0, Number(controls.rotBeta.value) || 0).el.toFixed(2)} deg\n` +
            `du/dv: ${controls.du.value}, ${controls.dv.value}\n` +
            `mouse drag: edits lens parameters directly\n` +
            `overlay flip x/y: ${state.flipX}/${state.flipY}\n` +
            `image flip x/y: ${state.imageFlipX}/${state.imageFlipY}\n` +
            `image masks: ${state.maskRegions.length}\n` +
            `RA/Dec grid: ${state.showRaDecGrid ? "on" : "off"}\n` +
            `az/el grid: ${state.showAzElGrid ? "on" : "off"}\n` +
            `display mode: ${state.displayMode}\n` +
            `star names: ${state.showStarNames ? "on" : "off"}\n` +
            `fit residuals: ${state.showFitResiduals ? "on" : "off"}\n` +
            `star pairing armed: ${state.starMatchMode ? "on" : "off"}${state.pendingMatch ? " (select catalog star)" : ""}\n` +
            `matched star pairs: ${state.matches.length}\n` +
            `${fitResidualStatusText()}\n` +
            state.fitMessage;
    }

    function recomputeAndRender() {
        updateProjection();
        render();
    }

    function setDisplayMode(mode) {
        if (!state.maxMagByMode[mode]) {
            return;
        }
        state.maxMagByMode[state.displayMode] = Number(controls.maxMag.value) || 4.0;
        state.starNamesByMode[state.displayMode] = state.showStarNames;
        state.displayMode = mode;
        controls.maxMag.value = state.maxMagByMode[mode].toFixed(1);
        state.showStarNames = state.starNamesByMode[mode];
        updateStarNameButton();
    }

    function matchInstructionText() {
        if (!state.image) {
            return "Load an image first. Press s for star picking, or c to switch between image and Stellarium views.";
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
            return "Left-drag moves the 90 deg elevation point in x/y. Right-drag rotates the azimuth grid around that point. Wheel edits f1/f2 together. Press c to switch image/Stellarium view, s for star picking, n to show/hide star names, d to delete an auto detection, m to mask image regions, or z to zoom.";
        }
        if (!state.pendingMatch) {
            return "Star pairing: hold s and click the image star. A KDE centroid fit will select the sub-pixel star position.";
        }
        return "Image star selected. Release s, then click the matching red catalog star below the current magnitude limit.";
    }

    function autoDetectionStatusText() {
        if (!state.image) {
            return "auto detections: no image";
        }
        const active = state.detectedStars.length - state.deletedDetectionIds.size;
        return `auto detections: ${active}/${state.detectedStars.length} active; ${state.detectorStatus}`;
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
        const medianDx = median(rows.map(row => row.dx));
        const medianDy = median(rows.map(row => row.dy));
        return `fit residual scatter: ${rows.length} stars, RMS ${rms.toFixed(2)} px, ` +
            `median ${medianR.toFixed(2)} px, max ${maxR.toFixed(2)} px, ` +
            `median dx/dy ${medianDx.toFixed(2)}/${medianDy.toFixed(2)} px, ` +
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

    function detectorStarRadius() {
        return 5;
    }

    function detectorCacheKey(starRadius) {
        const maskKey = state.maskRegions
            .map(region => `${region.x},${region.y},${region.radius}`)
            .join(";");
        return `${state.imageName}:${state.image.width}x${state.image.height}:r${starRadius}:m${maskKey}`;
    }

    function buildDetectorCandidateCache(starRadius) {
        const width = state.image.width;
        const height = state.image.height;
        const samples = [];
        for (let y = 4; y < height; y += 8) {
            for (let x = 4; x < width; x += 8) {
                if (!isMaskedImagePixel(x, y)) {
                    samples.push(imageGrayAtIndex(x, y));
                }
            }
        }
        if (samples.length === 0) {
            return {
                key: detectorCacheKey(starRadius),
                starRadius,
                bg: 0,
                sigma: 1,
                candidates: [],
                rawCandidateCount: 0,
                status: "detector: image fully masked",
            };
        }
        const bg = median(samples);
        const absDev = samples.map(value => Math.abs(value - bg));
        const sigma = Math.max(1, 1.4826 * median(absDev));
        const minThresholdSigma = 1.0;
        const centroidRadius = starRadius;
        const wideCentroidRadius = Math.max(centroidRadius + 1, Math.round(1.6 * starRadius));
        const annulusInner = Math.max(4, 1.3 * starRadius);
        const annulusOuter = Math.max(annulusInner + 2, 2.2 * starRadius);
        const maxRadius2 = Math.max(28.0, Math.pow(1.45 * starRadius, 2));
        const preThreshold = bg + Math.max(2, 0.35 * minThresholdSigma * sigma);
        const candidates = [];
        let rawCandidateCount = 0;

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
                const localContrastThreshold = Math.max(
                    minThresholdSigma * localSigma,
                    3 + 2 * minThresholdSigma
                );
                if (peakContrast < localContrastThreshold) {
                    continue;
                }
                rawCandidateCount += 1;
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
                    peakValue: value,
                    peakContrast,
                    localSigma,
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
        return {
            key: detectorCacheKey(starRadius),
            starRadius,
            bg,
            sigma,
            candidates,
            rawCandidateCount,
            status: `DAO-style detector: bg ${bg.toFixed(1)}, sigma ${sigma.toFixed(1)}, ` +
                `cached ${candidates.length}/${rawCandidateCount} candidates at radius ${starRadius} px`,
        };
    }

    function applyDetectorThreshold(cache) {
        const thresholdSigma = 2.0;
        const preThreshold = cache.bg + Math.max(2, 0.35 * thresholdSigma * cache.sigma);
        const candidates = cache.candidates.filter(candidate =>
            candidate.peakValue >= preThreshold &&
            candidate.peakContrast >= Math.max(
                thresholdSigma * candidate.localSigma,
                3 + 2 * thresholdSigma
            )
        );
        const selected = [];
        const suppression2 = 8 * 8;
        const maxDetections = 250;
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
        state.detectorStatus = `${cache.status}; ` +
            `prefilter ${preThreshold.toFixed(1)}, threshold ${thresholdSigma.toFixed(1)} local sigma, ` +
            `${candidates.length} thresholded candidates, max ${maxDetections}`;
        updateAutoMatches();
    }

    function detectImageStars() {
        state.detectedStars = [];
        state.autoMatches = [];
        if (!state.imagePixels || !state.image) {
            state.detectorCache = null;
            state.detectorStatus = "detector: image readback unavailable";
            return;
        }

        const starRadius = detectorStarRadius();
        const key = detectorCacheKey(starRadius);
        if (!state.detectorCache || state.detectorCache.key !== key) {
            state.deletedDetectionIds = new Set();
            state.detectorCache = buildDetectorCandidateCache(starRadius);
        }
        applyDetectorThreshold(state.detectorCache);
    }

    function scheduleDetectImageStars() {
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
        if ((!state.zoomMode && !state.starMatchMode) || !state.imagePixels || !state.image) {
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
        const displayPixels = displayImagePixels();
        const source = displayPixels.data;
        const width = state.image.width;
        const height = state.image.height;
        const brightness = Number(controls.brightness.value) || 0;
        const contrast = Number(controls.contrast.value) || 1;
        const displayChannel = value => {
            const adjusted = ((value / 255) - 0.5) * contrast + 0.5 + brightness;
            return Math.round(Math.max(0, Math.min(1, adjusted)) * 255);
        };
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
                patch.data[dst] = displayChannel(source[src]);
                patch.data[dst + 1] = displayChannel(source[src + 1]);
                patch.data[dst + 2] = displayChannel(source[src + 2]);
                patch.data[dst + 3] = 255;
            }
        }
        zoomContext.putImageData(patch, 0, 0);
        zoomContext.strokeStyle = "rgba(250, 204, 21, 0.95)";
        zoomContext.lineWidth = 1;
        zoomContext.beginPath();
        zoomContext.moveTo(50, 36);
        zoomContext.lineTo(50, 46);
        zoomContext.moveTo(50, 54);
        zoomContext.lineTo(50, 64);
        zoomContext.moveTo(36, 50);
        zoomContext.lineTo(46, 50);
        zoomContext.moveTo(54, 50);
        zoomContext.lineTo(64, 50);
        zoomContext.stroke();
        drawKdeContoursOnZoom(point, size, half);

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

    function drawKdeContoursOnZoom(point, size, half) {
        if (!state.centroidPreview || !state.centroidDensity ||
                Date.now() >= state.centroidPreview.expiresAt) {
            return;
        }
        const cx = state.centroidPreview.x - point.x + half;
        const cy = state.centroidPreview.y - point.y + half;
        if (cx < -20 || cx > size + 20 || cy < -20 || cy > size + 20) {
            return;
        }
        zoomContext.save();
        drawDensityContoursOnZoom(point);
        zoomContext.strokeStyle = "rgba(255, 255, 255, 0.9)";
        zoomContext.beginPath();
        zoomContext.moveTo(cx - 4, cy);
        zoomContext.lineTo(cx + 4, cy);
        zoomContext.moveTo(cx, cy - 4);
        zoomContext.lineTo(cx, cy + 4);
        zoomContext.stroke();
        zoomContext.restore();
    }

    function drawDensityContoursOnZoom(point) {
        const density = state.centroidDensity;
        const thresholds = [0.72, 0.5, 0.32];
        const colors = ["rgba(94, 234, 212, 0.95)", "rgba(94, 234, 212, 0.68)", "rgba(94, 234, 212, 0.42)"];
        zoomContext.lineWidth = 1.1;
        for (let level = 0; level < thresholds.length; level++) {
            zoomContext.strokeStyle = colors[level];
            const threshold = density.maxValue * thresholds[level];
            zoomContext.beginPath();
            for (let y = 0; y < density.height - 1; y++) {
                for (let x = 0; x < density.width - 1; x++) {
                    const v00 = density.values[y * density.width + x];
                    const v10 = density.values[y * density.width + x + 1];
                    const v01 = density.values[(y + 1) * density.width + x];
                    const v11 = density.values[(y + 1) * density.width + x + 1];
                    addMarchingSquareContour(density, point, x, y, v00, v10, v11, v01, threshold);
                }
            }
            zoomContext.stroke();
        }
    }

    function addMarchingSquareContour(density, point, x, y, v00, v10, v11, v01, threshold) {
        const points = [];
        const addEdgePoint = (edge, a, b) => {
            const denom = b.value - a.value;
            const t = Math.abs(denom) > 1e-12 ? (threshold - a.value) / denom : 0.5;
            const fx = a.x + Math.max(0, Math.min(1, t)) * (b.x - a.x);
            const fy = a.y + Math.max(0, Math.min(1, t)) * (b.y - a.y);
            points[edge] = {
                x: density.originX + fx / density.upsample - point.x + 50,
                y: density.originY + fy / density.upsample - point.y + 50,
            };
        };
        const p00 = {x, y, value: v00};
        const p10 = {x: x + 1, y, value: v10};
        const p11 = {x: x + 1, y: y + 1, value: v11};
        const p01 = {x, y: y + 1, value: v01};
        if ((v00 >= threshold) !== (v10 >= threshold)) addEdgePoint(0, p00, p10);
        if ((v10 >= threshold) !== (v11 >= threshold)) addEdgePoint(1, p10, p11);
        if ((v11 >= threshold) !== (v01 >= threshold)) addEdgePoint(2, p11, p01);
        if ((v01 >= threshold) !== (v00 >= threshold)) addEdgePoint(3, p01, p00);
        const present = points.filter(Boolean);
        if (present.length === 2) {
            zoomContext.moveTo(present[0].x, present[0].y);
            zoomContext.lineTo(present[1].x, present[1].y);
        } else if (present.length === 4) {
            zoomContext.moveTo(points[0].x, points[0].y);
            zoomContext.lineTo(points[1].x, points[1].y);
            zoomContext.moveTo(points[2].x, points[2].y);
            zoomContext.lineTo(points[3].x, points[3].y);
        }
    }

    function closeDensityPopup() {
        densityPopup.classList.remove("visible");
        densityPopup.setAttribute("aria-hidden", "true");
    }

    function clearDensityEstimate() {
        state.centroidPreview = null;
        state.centroidDensity = null;
        closeDensityPopup();
        hideZoomCanvas();
    }

    function showDensityPopup(event = null) {
        if (!state.centroidPreview || !state.centroidDensity) {
            return;
        }
        positionDensityPopupAwayFromEvent(event);
        densityPopup.classList.add("visible");
        densityPopup.setAttribute("aria-hidden", "false");
        densityPopupSubtitle.textContent =
            `selected x/y ${state.centroidPreview.x.toFixed(4)}, ${state.centroidPreview.y.toFixed(4)} px; ` +
            `fine-grid value ${state.centroidDensity.selectedValue.toFixed(3)}`;
        drawDensityPopup();
    }

    function positionDensityPopupAwayFromEvent(event) {
        const panel = canvas.parentElement.getBoundingClientRect();
        const popupWidth = Math.min(620, Math.max(280, panel.width - 36));
        const popupHeight = Math.min(560, Math.max(360, panel.height - 36));
        let clickX = panel.width / 2;
        let clickY = panel.height / 2;
        if (event) {
            clickX = event.clientX - panel.left;
            clickY = event.clientY - panel.top;
        }
        const margin = 18;
        const candidates = [
            {left: margin, top: margin},
            {left: panel.width - popupWidth - margin, top: margin},
            {left: margin, top: panel.height - popupHeight - margin},
            {left: panel.width - popupWidth - margin, top: panel.height - popupHeight - margin},
        ].map(candidate => ({
            left: Math.max(margin, Math.min(panel.width - popupWidth - margin, candidate.left)),
            top: Math.max(margin, Math.min(panel.height - popupHeight - margin, candidate.top)),
        }));
        candidates.sort((a, b) => {
            const acx = a.left + popupWidth / 2;
            const acy = a.top + popupHeight / 2;
            const bcx = b.left + popupWidth / 2;
            const bcy = b.top + popupHeight / 2;
            return Math.hypot(bcx - clickX, bcy - clickY) - Math.hypot(acx - clickX, acy - clickY);
        });
        densityPopup.style.width = `${popupWidth}px`;
        densityPopup.style.left = `${candidates[0].left}px`;
        densityPopup.style.top = `${candidates[0].top}px`;
        densityPopup.style.right = "auto";
        densityPopup.style.bottom = "auto";
    }

    function drawDensityPopup() {
        const density = state.centroidDensity;
        const selected = state.centroidPreview;
        if (!density || !selected) {
            return;
        }
        const w = densityCanvas.width;
        const h = densityCanvas.height;
        const plot = {x0: 58, y0: 24, w: w - 86, h: h - 78};
        densityContext.clearRect(0, 0, w, h);
        densityContext.fillStyle = "#020617";
        densityContext.fillRect(0, 0, w, h);
        densityContext.fillStyle = "#dbeafe";
        densityContext.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        densityContext.fillText("Gaussian-smoothed density contours from 40x interpolated image patch", plot.x0, 16);

        const sx = fineX => plot.x0 + (fineX / (density.width - 1)) * plot.w;
        const sy = fineY => plot.y0 + plot.h - (fineY / (density.height - 1)) * plot.h;
        densityContext.strokeStyle = "rgba(148, 163, 184, 0.42)";
        densityContext.lineWidth = 1;
        densityContext.strokeRect(plot.x0, plot.y0, plot.w, plot.h);
        for (let i = 0; i <= 4; i++) {
            const x = plot.x0 + (i / 4) * plot.w;
            const y = plot.y0 + (i / 4) * plot.h;
            densityContext.beginPath();
            densityContext.moveTo(x, plot.y0);
            densityContext.lineTo(x, plot.y0 + plot.h);
            densityContext.moveTo(plot.x0, y);
            densityContext.lineTo(plot.x0 + plot.w, y);
            densityContext.strokeStyle = "rgba(51, 65, 85, 0.62)";
            densityContext.stroke();
        }

        const levels = [0.9, 0.78, 0.64, 0.5, 0.38, 0.28, 0.18, 0.1];
        for (let i = 0; i < levels.length; i++) {
            densityContext.beginPath();
            densityContext.strokeStyle = `hsla(${170 + i * 9}, 86%, ${68 - i * 3}%, ${0.95 - i * 0.055})`;
            densityContext.lineWidth = i < 2 ? 1.8 : 1.2;
            const threshold = density.maxValue * levels[i];
            for (let y = 0; y < density.height - 1; y++) {
                for (let x = 0; x < density.width - 1; x++) {
                    const v00 = density.values[y * density.width + x];
                    const v10 = density.values[y * density.width + x + 1];
                    const v01 = density.values[(y + 1) * density.width + x];
                    const v11 = density.values[(y + 1) * density.width + x + 1];
                    addPopupContourSegment(x, y, v00, v10, v11, v01, threshold, sx, sy);
                }
            }
            densityContext.stroke();
        }

        const px = sx(density.selectedFineX);
        const py = sy(density.selectedFineY);
        densityContext.strokeStyle = "#fef08a";
        densityContext.fillStyle = "#fef08a";
        densityContext.lineWidth = 1.5;
        densityContext.beginPath();
        densityContext.arc(px, py, 5, 0, 2 * Math.PI);
        densityContext.stroke();
        densityContext.beginPath();
        densityContext.moveTo(px - 10, py);
        densityContext.lineTo(px + 10, py);
        densityContext.moveTo(px, py - 10);
        densityContext.lineTo(px, py + 10);
        densityContext.stroke();

        densityContext.fillStyle = "rgba(15, 23, 42, 0.88)";
        densityContext.fillRect(plot.x0, h - 46, plot.w, 30);
        densityContext.fillStyle = "#e5e7eb";
        densityContext.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        densityContext.fillText(
            `selected interpolated pixel: (${density.selectedFineX}, ${density.selectedFineY}), value ${density.selectedValue.toFixed(3)}`,
            plot.x0 + 8,
            h - 27
        );
        densityContext.fillStyle = "#a7f3d0";
        densityContext.fillText(
            `image x/y ${selected.x.toFixed(4)}, ${selected.y.toFixed(4)}; background ${density.background.toFixed(2)}; Gaussian support ${density.gaussianSupportPx} fine px`,
            plot.x0 + 8,
            h - 12
        );
    }

    function addPopupContourSegment(x, y, v00, v10, v11, v01, threshold, sx, sy) {
        const points = [];
        const addEdgePoint = (edge, a, b) => {
            const denom = b.value - a.value;
            const t = Math.abs(denom) > 1e-12 ? (threshold - a.value) / denom : 0.5;
            const fx = a.x + Math.max(0, Math.min(1, t)) * (b.x - a.x);
            const fy = a.y + Math.max(0, Math.min(1, t)) * (b.y - a.y);
            points[edge] = {x: sx(fx), y: sy(fy)};
        };
        const p00 = {x, y, value: v00};
        const p10 = {x: x + 1, y, value: v10};
        const p11 = {x: x + 1, y: y + 1, value: v11};
        const p01 = {x, y: y + 1, value: v01};
        if ((v00 >= threshold) !== (v10 >= threshold)) addEdgePoint(0, p00, p10);
        if ((v10 >= threshold) !== (v11 >= threshold)) addEdgePoint(1, p10, p11);
        if ((v11 >= threshold) !== (v01 >= threshold)) addEdgePoint(2, p11, p01);
        if ((v01 >= threshold) !== (v00 >= threshold)) addEdgePoint(3, p01, p00);
        const present = points.filter(Boolean);
        if (present.length === 2) {
            densityContext.moveTo(present[0].x, present[0].y);
            densityContext.lineTo(present[1].x, present[1].y);
        } else if (present.length === 4) {
            densityContext.moveTo(points[0].x, points[0].y);
            densityContext.lineTo(points[1].x, points[1].y);
            densityContext.moveTo(points[2].x, points[2].y);
            densityContext.lineTo(points[3].x, points[3].y);
        }
    }

    function uploadImagePixelsToTexture() {
        if (!state.texture || !state.imagePixels) {
            return;
        }
        gl.bindTexture(gl.TEXTURE_2D, state.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, displayImagePixels());
    }

    function gaussianKernel(sigma) {
        const radius = Math.max(1, Math.ceil(3 * sigma));
        const kernel = [];
        let sum = 0;
        for (let i = -radius; i <= radius; i++) {
            const value = Math.exp(-0.5 * (i / sigma) * (i / sigma));
            kernel.push(value);
            sum += value;
        }
        return kernel.map(value => value / sum);
    }

    function downsampleGrayImage(imageData, factor) {
        const width = imageData.width;
        const height = imageData.height;
        const smallWidth = Math.ceil(width / factor);
        const smallHeight = Math.ceil(height / factor);
        const sums = new Float32Array(smallWidth * smallHeight);
        const counts = new Uint16Array(smallWidth * smallHeight);
        const data = imageData.data;
        for (let y = 0; y < height; y++) {
            const sy = Math.floor(y / factor);
            for (let x = 0; x < width; x++) {
                const sx = Math.floor(x / factor);
                const src = 4 * (y * width + x);
                const dst = sy * smallWidth + sx;
                sums[dst] += 0.2126 * data[src] + 0.7152 * data[src + 1] + 0.0722 * data[src + 2];
                counts[dst] += 1;
            }
        }
        for (let i = 0; i < sums.length; i++) {
            sums[i] /= Math.max(1, counts[i]);
        }
        return {width: smallWidth, height: smallHeight, gray: sums};
    }

    function convolveHorizontal(src, width, height, kernel) {
        const radius = Math.floor(kernel.length / 2);
        const dst = new Float32Array(src.length);
        for (let y = 0; y < height; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    const ix = Math.max(0, Math.min(width - 1, x + k));
                    sum += src[row + ix] * kernel[k + radius];
                }
                dst[row + x] = sum;
            }
        }
        return dst;
    }

    function convolveVertical(src, width, height, kernel) {
        const radius = Math.floor(kernel.length / 2);
        const dst = new Float32Array(src.length);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    const iy = Math.max(0, Math.min(height - 1, y + k));
                    sum += src[iy * width + x] * kernel[k + radius];
                }
                dst[y * width + x] = sum;
            }
        }
        return dst;
    }

    function blurredGrayBackground(imageData, widthPx) {
        const factor = Math.max(1, Math.min(12, Math.round(widthPx / 16)));
        const small = downsampleGrayImage(imageData, factor);
        const sigma = Math.max(1, widthPx / factor);
        const kernel = gaussianKernel(sigma);
        const horizontal = convolveHorizontal(small.gray, small.width, small.height, kernel);
        const blurred = convolveVertical(horizontal, small.width, small.height, kernel);
        return {factor, width: small.width, height: small.height, blurred};
    }

    function sampledBackground(bg, x, y) {
        const gx = Math.max(0, Math.min(bg.width - 1, x / bg.factor));
        const gy = Math.max(0, Math.min(bg.height - 1, y / bg.factor));
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const x1 = Math.min(bg.width - 1, x0 + 1);
        const y1 = Math.min(bg.height - 1, y0 + 1);
        const tx = gx - x0;
        const ty = gy - y0;
        const a = bg.blurred[y0 * bg.width + x0] * (1 - tx) + bg.blurred[y0 * bg.width + x1] * tx;
        const b = bg.blurred[y1 * bg.width + x0] * (1 - tx) + bg.blurred[y1 * bg.width + x1] * tx;
        return a * (1 - ty) + b * ty;
    }

    function highPassImageData(imageData, widthPx) {
        const bg = blurredGrayBackground(imageData, widthPx);
        const out = new ImageData(imageData.width, imageData.height);
        const src = imageData.data;
        const dst = out.data;
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const k = 4 * (y * imageData.width + x);
                const gray = 0.2126 * src[k] + 0.7152 * src[k + 1] + 0.0722 * src[k + 2];
                const value = Math.max(0, Math.min(255, 128 + 1.6 * (gray - sampledBackground(bg, x, y))));
                dst[k] = value;
                dst[k + 1] = value;
                dst[k + 2] = value;
                dst[k + 3] = src[k + 3];
            }
        }
        return out;
    }

    function displayImagePixels() {
        if (!controls.highPassImage.checked || !state.imagePixels) {
            state.displayPixels = null;
            state.highPassCacheKey = "";
            return state.imagePixels;
        }
        const widthPx = Math.max(10, Math.min(300, Number(controls.highPassWidth.value) || 100));
        const cacheKey = `${state.imageName}:${state.maskRegions.length}:${widthPx}`;
        if (state.displayPixels && state.highPassCacheKey === cacheKey) {
            return state.displayPixels;
        }
        state.displayPixels = highPassImageData(state.imagePixels, widthPx);
        state.highPassCacheKey = cacheKey;
        return state.displayPixels;
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

    function kdeCentroid(clickX, clickY) {
        if (!state.imagePixels) {
            return {x: clickX, y: clickY, sigma: 0, method: "click"};
        }
        const upsample = 40;
        const patchRadius = 8;
        const size = 2 * patchRadius + 1;
        const fineWidth = size * upsample;
        const fineHeight = size * upsample;
        const originX = clickX - patchRadius;
        const originY = clickY - patchRadius;
        const raw = new Float32Array(fineWidth * fineHeight);
        const bgSamples = [];
        for (let y = 0; y < fineHeight; y++) {
            const iy = originY + y / upsample;
            for (let x = 0; x < fineWidth; x++) {
                const ix = originX + x / upsample;
                const value = imageGray(ix, iy);
                raw[y * fineWidth + x] = value;
                if (x < upsample || x >= fineWidth - upsample ||
                        y < upsample || y >= fineHeight - upsample) {
                    bgSamples.push(value);
                }
            }
        }
        const background = bgSamples.length ? median(bgSamples) : 0;
        for (let i = 0; i < raw.length; i++) {
            raw[i] = Math.max(0, raw[i] - background);
        }

        // 80x80 interpolated-pixel Gaussian support. Sigma=13.3 fine pixels
        // gives a practical +/-40 fine-pixel smoothing footprint.
        const kernel = gaussianKernel(13.3);
        const horizontal = convolveHorizontal(raw, fineWidth, fineHeight, kernel);
        const smooth = convolveVertical(horizontal, fineWidth, fineHeight, kernel);
        let bestIndex = 0;
        let bestValue = -Infinity;
        for (let i = 0; i < smooth.length; i++) {
            if (smooth[i] > bestValue) {
                bestValue = smooth[i];
                bestIndex = i;
            }
        }
        const bestFineX = bestIndex % fineWidth;
        const bestFineY = Math.floor(bestIndex / fineWidth);
        let cx = originX + bestFineX / upsample;
        let cy = originY + bestFineY / upsample;

        // A local quadratic interpolation of the smoothed upsampled peak gives
        // a small additional sub-fine-pixel correction when the peak is not on
        // the edge of the patch.
        if (bestFineX > 0 && bestFineX < fineWidth - 1 && bestFineY > 0 && bestFineY < fineHeight - 1) {
            const c = smooth[bestFineY * fineWidth + bestFineX];
            const l = smooth[bestFineY * fineWidth + bestFineX - 1];
            const r = smooth[bestFineY * fineWidth + bestFineX + 1];
            const u = smooth[(bestFineY - 1) * fineWidth + bestFineX];
            const d = smooth[(bestFineY + 1) * fineWidth + bestFineX];
            const denomX = l - 2 * c + r;
            const denomY = u - 2 * c + d;
            const dx = Math.abs(denomX) > 1e-9 ? 0.5 * (l - r) / denomX : 0;
            const dy = Math.abs(denomY) > 1e-9 ? 0.5 * (u - d) / denomY : 0;
            cx += Math.max(-0.5, Math.min(0.5, dx)) / upsample;
            cy += Math.max(-0.5, Math.min(0.5, dy)) / upsample;
        }
        state.centroidDensity = {
            values: smooth,
            width: fineWidth,
            height: fineHeight,
            originX,
            originY,
            upsample,
            maxValue: Math.max(bestValue, 1e-9),
            selectedFineX: bestFineX,
            selectedFineY: bestFineY,
            selectedValue: bestValue,
            background,
            gaussianSupportPx: 80,
        };
        return {x: cx, y: cy, sigma: 13.3 / upsample, method: "upsampled KDE"};
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
        const imagePoint = eventToImagePixel(event);
        if (!imagePoint) {
            state.fitMessage = "star match: click on an image star while holding s";
            render();
            return;
        }
        const centroid = kdeCentroid(imagePoint.x, imagePoint.y);
        state.pendingMatch = {
            image: {x: centroid.x, y: centroid.y, method: centroid.method},
            detectionId: null,
        };
        state.centroidPreview = {
            x: centroid.x,
            y: centroid.y,
            sigma: centroid.sigma,
            method: centroid.method,
            expiresAt: Infinity,
        };
        hideZoomCanvas();
        showDensityPopup(event);
        state.fitMessage = `image star selected with ${centroid.method}: x/y ` +
            `${centroid.x.toFixed(3)}, ${centroid.y.toFixed(3)}, sigma ${centroid.sigma.toFixed(2)} px; ` +
            "release s and click the matching catalog star";
        render();
    }

    function handleCatalogPairClick(event) {
        const star = nearestProjectedStar(event);
        if (!star) {
            state.fitMessage = "star match: click the matching red catalog star";
            render();
            return;
        }
        state.matches.push({
            id: state.matches.length + 1,
            image: state.pendingMatch.image,
            detectionId: null,
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
        clearDensityEstimate();
        state.showPickedMatchMarkers = true;
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

    function fitPenalty(x) {
        if (x.length < 8 ||
                Math.abs(x[0]) < 0.05 || Math.abs(x[0]) > 10 ||
                Math.abs(x[1]) < 0.05 || Math.abs(x[1]) > 10 ||
                Math.abs(x[2]) > 90 || Math.abs(x[3]) > 90 ||
                Math.abs(x[4]) > 720 || Math.abs(x[5]) > 0.5 ||
                Math.abs(x[6]) > 0.5 || x[7] < 0.05 || x[7] > 2.5) {
            return 1e12;
        }
        return 0;
    }

    function matchResidualFactory() {
        const date = AidaTools.datetimeLocalToDate(controls.timestampUtc.value);
        const lat = Number(controls.latDeg.value) || 0;
        const lon = Number(controls.lonDeg.value) || 0;
        const optmod = Number(controls.optmod.value);
        const rows = fittingMatches().map(match => {
            const azze = AidaTools.radecToAzZe(match.catalog.raHours, match.catalog.decDeg, date, lat, lon);
            return {az: azze.az, ze: azze.ze, image: match.image};
        });
        return x => {
            if (fitPenalty(x) > 0 || rows.length === 0) {
                return null;
            }
            const optpar = optparFromFitVector(x);
            const residuals = [];
            for (const row of rows) {
                const xy = AidaTools.cameraModel(row.az, row.ze, optpar, optmod, state.image.width, state.image.height);
                if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
                    return null;
                }
                const [rawX, rawY] = rawImagePixelFromModelImagePixel(xy.x, xy.y);
                // Least-squares objective: after applying the same overlay and
                // image flips used on screen, model-projected catalog stars
                // should match the picked centroids in raw image pixels.
                residuals.push(rawX - row.image.x, rawY - row.image.y);
            }
            return residuals;
        };
    }

    function residualSumSquares(residuals) {
        if (!residuals) {
            return 1e12;
        }
        return residuals.reduce((acc, value) => acc + value * value, 0);
    }

    function robustResidualScale(residuals) {
        if (!residuals || residuals.length < 2) {
            return 8;
        }
        const radii = [];
        for (let i = 0; i < residuals.length; i += 2) {
            radii.push(Math.hypot(residuals[i], residuals[i + 1]));
        }
        return Math.max(4, 1.4826 * median(radii));
    }

    function robustLoss(residuals) {
        if (!residuals) {
            return 1e12;
        }
        const c = 1.345 * robustResidualScale(residuals);
        let loss = 0;
        for (let i = 0; i < residuals.length; i += 2) {
            const r = Math.hypot(residuals[i], residuals[i + 1]);
            loss += r <= c ? r * r : 2 * c * r - c * c;
        }
        return loss;
    }

    function robustWeightedResiduals(residuals) {
        if (!residuals) {
            return null;
        }
        const c = 1.345 * robustResidualScale(residuals);
        const weighted = residuals.slice();
        for (let i = 0; i < weighted.length; i += 2) {
            const r = Math.hypot(weighted[i], weighted[i + 1]);
            if (r > c && r > 1e-9) {
                const scale = Math.sqrt(c / r);
                weighted[i] *= scale;
                weighted[i + 1] *= scale;
            }
        }
        return weighted;
    }

    function matchObjectiveFactory(residualFn = matchResidualFactory()) {
        return x => {
            const penalty = fitPenalty(x);
            if (penalty > 0) {
                return penalty;
            }
            return robustLoss(residualFn(x));
        };
    }

    function leastSquaresObjectiveFactory(residualFn = matchResidualFactory()) {
        return x => {
            const penalty = fitPenalty(x);
            if (penalty > 0) {
                return penalty;
            }
            return residualSumSquares(residualFn(x));
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

        const axisOffsets = [0.08, 0.08, 3, 3, 8, 0.02, 0.02, 0.08];
        for (let i = 0; i < start.length; i++) {
            for (const sign of [-1, 1]) {
                const x = start.slice();
                x[i] += sign * axisOffsets[i];
                addStart(x);
            }
        }
        addStart([-start[0], start[1], ...start.slice(2)]);
        addStart([start[0], -start[1], ...start.slice(2)]);
        addStart([-start[0], -start[1], ...start.slice(2)]);

        for (let i = 0; i < 120; i++) {
            const f1Factor = Math.exp((Math.random() * 2 - 1) * 0.25);
            const f2Factor = Math.exp((Math.random() * 2 - 1) * 0.25);
            addStart([
                start[0] * f1Factor * (Math.random() < 0.06 ? -1 : 1),
                start[1] * f2Factor * (Math.random() < 0.06 ? -1 : 1),
                start[2] + (Math.random() * 2 - 1) * 12,
                start[3] + (Math.random() * 2 - 1) * 12,
                start[4] + (Math.random() * 2 - 1) * 25,
                start[5] + (Math.random() * 2 - 1) * 0.06,
                start[6] + (Math.random() * 2 - 1) * 0.06,
                start[7] + (Math.random() * 2 - 1) * 0.18,
            ]);
        }

        starts.sort((a, b) => a.fx - b.fx);
        return starts.slice(0, Math.min(32, starts.length));
    }

    function solveLinearSystem(a, b) {
        const n = b.length;
        const m = a.map((row, i) => row.slice().concat([b[i]]));
        for (let col = 0; col < n; col++) {
            let pivot = col;
            for (let row = col + 1; row < n; row++) {
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
            for (let j = col; j <= n; j++) {
                m[col][j] /= pivotValue;
            }
            for (let row = 0; row < n; row++) {
                if (row === col) {
                    continue;
                }
                const factor = m[row][col];
                for (let j = col; j <= n; j++) {
                    m[row][j] -= factor * m[col][j];
                }
            }
        }
        return m.map(row => row[n]);
    }

    function levenbergMarquardt(residualFn, start, maxIter = 80) {
        const n = start.length;
        const diffSteps = [1e-4, 1e-4, 1e-3, 1e-3, 1e-3, 1e-5, 1e-5, 1e-4];
        let x = start.slice();
        let residuals = residualFn(x);
        let fx = residualSumSquares(residuals);
        let lambda = 1e-3;
        let iterations = 0;
        let accepted = 0;
        for (; iterations < maxIter; iterations++) {
            if (!residuals || !Number.isFinite(fx)) {
                break;
            }
            const m = residuals.length;
            const jac = Array.from({length: m}, () => Array(n).fill(0));
            for (let col = 0; col < n; col++) {
                const h = diffSteps[col];
                const xp = x.slice();
                xp[col] += h;
                const rp = residualFn(xp);
                if (!rp) {
                    continue;
                }
                for (let row = 0; row < m; row++) {
                    jac[row][col] = (rp[row] - residuals[row]) / h;
                }
            }
            const jtj = Array.from({length: n}, () => Array(n).fill(0));
            const jtr = Array(n).fill(0);
            for (let row = 0; row < m; row++) {
                for (let i = 0; i < n; i++) {
                    jtr[i] += jac[row][i] * residuals[row];
                    for (let j = 0; j < n; j++) {
                        jtj[i][j] += jac[row][i] * jac[row][j];
                    }
                }
            }
            let improved = false;
            for (let attempt = 0; attempt < 8; attempt++) {
                const a = jtj.map((row, i) => row.map((value, j) => {
                    if (i !== j) {
                        return value;
                    }
                    return value + lambda * Math.max(1, Math.abs(value));
                }));
                const step = solveLinearSystem(a, jtr.map(value => -value));
                if (!step) {
                    lambda *= 10;
                    continue;
                }
                const xCandidate = x.map((value, i) => value + step[i]);
                if (fitPenalty(xCandidate) > 0) {
                    lambda *= 10;
                    continue;
                }
                const candidateResiduals = residualFn(xCandidate);
                const candidateFx = residualSumSquares(candidateResiduals);
                if (candidateResiduals && candidateFx < fx) {
                    x = xCandidate;
                    residuals = candidateResiduals;
                    fx = candidateFx;
                    lambda = Math.max(lambda / 3, 1e-9);
                    accepted += 1;
                    improved = true;
                    if (Math.sqrt(step.reduce((acc, value) => acc + value * value, 0)) < 1e-7) {
                        return {x, fx, iterations: iterations + 1, accepted};
                    }
                    break;
                }
                lambda *= 10;
            }
            if (!improved) {
                break;
            }
        }
        return {x, fx, iterations, accepted};
    }

    function acceptFitResult(result, start, residualFn, methodLabel, detail, fitCount, objectiveLabel) {
        const startSse = residualSumSquares(residualFn(start));
        const resultSse = residualSumSquares(residualFn(result.x));
        const rmsBefore = Math.sqrt(startSse / fitCount);
        const rmsAfter = Math.sqrt(resultSse / fitCount);
        if (!Number.isFinite(rmsAfter) || rmsAfter > Math.max(50, rmsBefore * 1.25)) {
            state.fitMessage = `${methodLabel} rejected: RMS ${rmsBefore.toFixed(2)} -> ${rmsAfter.toFixed(2)} px`;
            render();
            return false;
        }
        applyFitVector(result.x);
        state.lastFitVector = result.x.slice();
        state.pendingMatch = null;
        state.showPickedMatchMarkers = false;
        state.fitMessage = `${methodLabel}: RMS ${rmsBefore.toFixed(2)} -> ${rmsAfter.toFixed(2)} px, ` +
            `${detail}; ${objectiveLabel}; fitted all 8 optpar values using ${fitCount}/${state.matches.length} pairs ` +
            `with mag <= ${Number(controls.maxMag.value).toFixed(1)}`;
        recomputeAndRender();
        return true;
    }

    function fitLensFromMatches() {
        const fitCount = fittingMatches().length;
        if (!state.image || fitCount < 4) {
            state.fitMessage = `lens fit: need at least 4 matched star pairs with mag <= ` +
                `${Number(controls.maxMag.value).toFixed(1)} (${fitCount}/${state.matches.length} available)`;
            render();
            return;
        }

        const residualFn = matchResidualFactory();
        const objective = matchObjectiveFactory(residualFn);
        const start = currentFitVector();
        const steps = [0.05, 0.05, 1.5, 1.5, 2.0, 0.006, 0.006, 0.03];
        const starts = fitStartCandidates(objective, start);
        let result = null;
        let totalIterations = 0;
        for (const candidate of starts) {
            const candidateResult = nelderMead(objective, candidate.x, steps, 800);
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
        acceptFitResult(
            result,
            start,
            residualFn,
            "Nelder-Mead lens fit",
            `${starts.length} starts including random perturbations, ${totalIterations} iterations`,
            fitCount,
            "robust Huber objective"
        );
    }

    function fitLensLevenbergMarquardt() {
        const fitCount = fittingMatches().length;
        if (!state.image || fitCount < 4) {
            state.fitMessage = `LM lens fit: need at least 4 matched star pairs with mag <= ` +
                `${Number(controls.maxMag.value).toFixed(1)} (${fitCount}/${state.matches.length} available)`;
            render();
            return;
        }
        const residualFn = matchResidualFactory();
        const objective = leastSquaresObjectiveFactory(residualFn);
        const start = currentFitVector();
        const starts = fitStartCandidates(objective, start).slice(0, 12);
        let result = null;
        let totalIterations = 0;
        let accepted = 0;
        for (const candidate of starts) {
            const candidateResult = levenbergMarquardt(residualFn, candidate.x, 80);
            totalIterations += candidateResult.iterations;
            accepted += candidateResult.accepted;
            if (!result || candidateResult.fx < result.fx) {
                result = candidateResult;
            }
        }
        if (!result) {
            state.fitMessage = "LM lens fit rejected: no valid start points";
            render();
            return;
        }
        acceptFitResult(
            result,
            start,
            residualFn,
            "Levenberg-Marquardt lens fit",
            `${starts.length} starts, ${totalIterations} iterations, ${accepted} accepted steps`,
            fitCount,
            "ordinary least-squares objective"
        );
    }

    function clearIdentifiedStars() {
        const count = state.matches.length;
        state.matches = [];
        state.pendingMatch = null;
        state.lastFitVector = null;
        state.showPickedMatchMarkers = true;
        updateAutoMatches();
        state.fitMessage = count > 0
            ? `removed ${count} star pairing${count === 1 ? "" : "s"}`
            : "no star pairings to remove";
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

    function refreshDisplayImage() {
        state.displayPixels = null;
        state.highPassCacheKey = "";
        uploadImagePixelsToTexture();
        render();
    }

    function resetInteractiveState() {
        state.matches = [];
        state.pendingMatch = null;
        state.showPickedMatchMarkers = true;
        state.lastFitVector = null;
        state.fitMessage = "lens fit: not run";
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
                setLoadingProgress(68, "Preparing calibration view...");
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
                if (state.imagePixels) {
                    state.displayPixels = null;
                    state.highPassCacheKey = "";
                    uploadImagePixelsToTexture();
                } else {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                }
                hint.style.display = "none";
                const guessed = AidaTools.guessTimestampFromAllsky7Name(name);
                if (guessed) {
                    controls.timestampUtc.value = AidaTools.dateToDatetimeLocal(guessed);
                }
                const station = AidaTools.guessAllsky7StationMetadata(name);
                if (station) {
                    controls.latDeg.value = station.latDeg.toFixed(6);
                    controls.lonDeg.value = station.lonDeg.toFixed(6);
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
            state.fitMessage = `image load failed: ${name}. If using a web server, serve the AIDA_tools directory rather than only aida_js_calibrator/.`;
            hideLoadingProgress();
            render();
        };
        img.src = url;
    }

    function loadImageFile(file) {
        resetInteractiveState();
        state.baseOptpar = null;
        applyOptpar(null);
        state.fitMessage = "lens fit: not run";
        if (state.localImageUrl) {
            URL.revokeObjectURL(state.localImageUrl);
        }
        state.localImageUrl = URL.createObjectURL(file);
        loadImageSource(state.localImageUrl, file.name, null, false);
    }

    function updateDetectionCircleButton() {
        controls.toggleDetectionCircles.textContent =
            state.displayMode === "stellarium" ? "Image view (C)" : "Stellarium view (C)";
        controls.toggleDetectionCircles.classList.toggle("toggle-on", state.displayMode === "stellarium");
    }

    function toggleDetectionCircles() {
        setDisplayMode(state.displayMode === "stellarium" ? "image" : "stellarium");
        state.starMatchMode = false;
        state.pendingMatch = null;
        updateDetectionCircleButton();
        recomputeAndRender();
    }

    function enableStarPairingMode(armed = false) {
        setDisplayMode("pairing");
        state.starMatchMode = armed;
        state.deleteDetectionMode = false;
        state.maskMode = false;
        state.zoomMode = false;
        if (!armed) {
            hideZoomCanvas();
        }
        updateDetectionCircleButton();
        recomputeAndRender();
    }

    function updateStarNameButton() {
        controls.toggleStarNames.textContent =
            state.showStarNames ? "Hide star names (N)" : "Show star names (N)";
        controls.toggleStarNames.classList.toggle("toggle-on", state.showStarNames);
    }

    function toggleStarNames() {
        state.showStarNames = !state.showStarNames;
        state.starNamesByMode[state.displayMode] = state.showStarNames;
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

    for (const el of document.querySelectorAll(".controls input, .controls select")) {
        if (el !== controls.file &&
                el !== controls.highPassImage && el !== controls.highPassWidth &&
                el !== controls.maxMag) {
            el.addEventListener("input", recomputeAndRender);
        }
    }
    controls.highPassImage.addEventListener("change", refreshDisplayImage);
    controls.highPassWidth.addEventListener("input", refreshDisplayImage);
    controls.maxMag.addEventListener("input", () => {
        state.maxMagByMode[state.displayMode] = Number(controls.maxMag.value) || 4.0;
        recomputeAndRender();
    });

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
    densityPopupClose.addEventListener("click", () => {
        clearDensityEstimate();
        render();
    });
    controls.resetOffset.addEventListener("click", () => {
        setCameraAnglesFromBoresightAzEl(0, 90);
        recomputeAndRender();
    });
    controls.fitLens.addEventListener("click", fitLensFromMatches);
    controls.fitLensLm.addEventListener("click", fitLensLevenbergMarquardt);
    controls.copyOptpar.addEventListener("click", () => {
        copyTextToClipboard(optparPythonArrayText(), "optpar Python array");
    });
    controls.copyPythonMapper.addEventListener("click", () => {
        copyTextToClipboard(pythonImageToAzElFunctionText(), "image-to-az/el Python function");
    });
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
        if (state.displayMode === "pairing" && state.starMatchMode && event.button === 0) {
            event.preventDefault();
            handleStarMatchClick(event);
            return;
        }
        if (state.displayMode === "pairing" && state.pendingMatch && event.button === 0) {
            event.preventDefault();
            handleCatalogPairClick(event);
            return;
        }
        state.dragging = true;
        state.lensDragMode = event.button === 0 ? "zenithPosition" : "azimuthGridRoll";
        state.lastMouse = [event.clientX, event.clientY];
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
        if (state.zoomMode || state.starMatchMode) {
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
        const currentX = Number(controls.fScaleX.value) || 1.0;
        const currentY = Number(controls.fScaleY.value) || 1.0;
        const factor = Math.exp(-event.deltaY * 0.00045);
        const scaleFocal = value => {
            const sign = value < 0 ? -1 : 1;
            return sign * Math.max(0.05, Math.min(10.0, Math.abs(value) * factor));
        };
        controls.fScaleX.value = scaleFocal(currentX).toFixed(4);
        controls.fScaleY.value = scaleFocal(currentY).toFixed(4);
        recomputeAndRender();
    }, {passive: false});

    document.addEventListener("keydown", event => {
        const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "select" || tag === "textarea") {
            return;
        }
        if ((event.key === "s" || event.key === "S") && !event.repeat) {
            event.preventDefault();
            enableStarPairingMode(true);
        } else if ((event.key === "d" || event.key === "D") && !event.repeat) {
            event.preventDefault();
            state.deleteDetectionMode = true;
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
        } else if ((event.key === "g" || event.key === "G") && !event.repeat) {
            event.preventDefault();
            fitLensLevenbergMarquardt();
        } else if (event.key === "Escape" && state.pendingMatch) {
            event.preventDefault();
            clearDensityEstimate();
            state.pendingMatch = null;
            render();
        } else if (event.key === "Escape" && densityPopup.classList.contains("visible")) {
            event.preventDefault();
            clearDensityEstimate();
            render();
        } else if (event.key === "Escape" && state.starMatchMode) {
            event.preventDefault();
            state.starMatchMode = false;
            setDisplayMode("image");
            state.pendingMatch = null;
            clearDensityEstimate();
            updateDetectionCircleButton();
            recomputeAndRender();
        }
    });
    document.addEventListener("keyup", event => {
        if (event.key === "s" || event.key === "S") {
            event.preventDefault();
            state.starMatchMode = false;
            if (!state.centroidPreview || Date.now() >= state.centroidPreview.expiresAt) {
                hideZoomCanvas();
            }
            render();
            return;
        }
        if (event.key === "d" || event.key === "D") {
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
    window.addEventListener("load", () => {
        state.lastLensEquation = "";
        updateLensEquation(currentOptpar(), Number(controls.optmod.value));
        if (!state.image) {
            resetInteractiveState();
            state.baseOptpar = null;
            applyOptpar(null);
            loadImageSource(defaultImage.url, defaultImage.name);
        }
    });
    updateDetectionCircleButton();
    updateStarNameButton();
    updateFitResidualButton();
    render();
})();
