(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    root.AidaCentroid = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    function median(values) {
        if (values.length === 0) {
            return 0;
        }
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
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

    function estimateCentroid(clickX, clickY, sample, options = {}) {
        const upsample = options.upsample ?? 40;
        const patchRadius = options.patchRadius ?? 8;
        const gaussianSigmaFinePx = options.gaussianSigmaFinePx ?? 53.2;
        const gaussianSupportFinePx = options.gaussianSupportFinePx ?? 320;
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
                const value = sample(ix, iy);
                raw[y * fineWidth + x] = value;
                if (x < upsample || x >= fineWidth - upsample ||
                        y < upsample || y >= fineHeight - upsample) {
                    bgSamples.push(value);
                }
            }
        }
        const rawValues = raw.slice();
        const background = bgSamples.length ? median(bgSamples) : 0;
        for (let i = 0; i < raw.length; i++) {
            raw[i] = Math.max(0, raw[i] - background);
        }

        const kernel = gaussianKernel(gaussianSigmaFinePx);
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
        let x = originX + bestFineX / upsample;
        let y = originY + bestFineY / upsample;

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
            x += Math.max(-0.5, Math.min(0.5, dx)) / upsample;
            y += Math.max(-0.5, Math.min(0.5, dy)) / upsample;
        }

        return {
            x,
            y,
            sigma: gaussianSigmaFinePx / upsample,
            method: "upsampled KDE",
            density: {
                values: smooth,
                rawValues,
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
                gaussianSupportPx: gaussianSupportFinePx,
            },
        };
    }

    return {
        convolveHorizontal,
        convolveVertical,
        estimateCentroid,
        gaussianKernel,
    };
}));
