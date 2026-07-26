/**
 * PixelRestoreEngine — 像素还原引擎（浏览器本地）
 *
 * 从低清/截图图中按当前珠子宽度提取每个格子的代表色，再放大输出：
 * - 格子采样：内缩后多点取中位数颜色，抗锯齿与压缩噪点
 * - sharp 模式：最近邻整数倍放大，得到清晰像素底图
 * - smooth 模式：分步平滑放大 + 轻微模糊与饱和度微调，得到插画感输出
 * - 支持 2x / 4x / 8x 倍率
 *
 * 结果可应用回主图，用于后续拼豆转换。
 */
class PixelRestoreEngine {
    static _matteToWhite(r, g, b, a) {
        const alpha = a / 255;
        return [
            Math.round(r * alpha + 255 * (1 - alpha)),
            Math.round(g * alpha + 255 * (1 - alpha)),
            Math.round(b * alpha + 255 * (1 - alpha)),
        ];
    }

    static _median(values) {
        if (!values.length) return 255;
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 1) return sorted[mid];
        return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    static _getSourceSize(image) {
        return {
            width: image.naturalWidth || image.width || 0,
            height: image.naturalHeight || image.height || 0,
        };
    }

    static _normalizeGridWidth(image, gridWidth) {
        const { width } = this._getSourceSize(image);
        const requested = Math.max(1, parseInt(gridWidth, 10) || width || 1);
        return Math.max(1, Math.min(width || requested, requested));
    }

    static _normalizeScale(scale) {
        const allowed = [2, 4, 8];
        const requested = parseInt(scale, 10) || 4;
        return allowed.includes(requested) ? requested : 4;
    }

    static _sampleCellColor(sourceData, sourceWidth, sourceHeight, x0, y0, x1, y1) {
        const spanX = Math.max(1, x1 - x0);
        const spanY = Math.max(1, y1 - y0);
        const insetRatio = 0.18;
        const innerX0 = x0 + spanX * insetRatio;
        const innerX1 = x1 - spanX * insetRatio;
        const innerY0 = y0 + spanY * insetRatio;
        const innerY1 = y1 - spanY * insetRatio;
        const sampleCols = spanX >= 18 ? 7 : spanX >= 10 ? 6 : 5;
        const sampleRows = spanY >= 18 ? 7 : spanY >= 10 ? 6 : 5;
        const reds = [];
        const greens = [];
        const blues = [];

        for (let sampleY = 0; sampleY < sampleRows; sampleY++) {
            const fy = innerY0 + (sampleY + 0.5) * (innerY1 - innerY0) / sampleRows;
            const py = Math.max(0, Math.min(sourceHeight - 1, Math.floor(fy)));
            for (let sampleX = 0; sampleX < sampleCols; sampleX++) {
                const fx = innerX0 + (sampleX + 0.5) * (innerX1 - innerX0) / sampleCols;
                const px = Math.max(0, Math.min(sourceWidth - 1, Math.floor(fx)));
                const index = (py * sourceWidth + px) * 4;
                const [r, g, b] = this._matteToWhite(
                    sourceData[index],
                    sourceData[index + 1],
                    sourceData[index + 2],
                    sourceData[index + 3],
                );
                reds.push(r);
                greens.push(g);
                blues.push(b);
            }
        }

        return [
            this._median(reds),
            this._median(greens),
            this._median(blues),
        ];
    }

    static sampleToGrid(image, gridWidth) {
        const { width: sourceWidth, height: sourceHeight } = this._getSourceSize(image);
        if (!sourceWidth || !sourceHeight) {
            throw new Error('原图尺寸无效，无法执行像素还原');
        }

        const targetWidth = this._normalizeGridWidth(image, gridWidth);
        const targetHeight = Math.max(1, Math.round(targetWidth * sourceHeight / sourceWidth));
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = sourceWidth;
        sourceCanvas.height = sourceHeight;
        const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        sourceCtx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
        const sourceData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight).data;

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(targetWidth, targetHeight);

        for (let gridY = 0; gridY < targetHeight; gridY++) {
            const y0 = gridY * sourceHeight / targetHeight;
            const y1 = (gridY + 1) * sourceHeight / targetHeight;
            for (let gridX = 0; gridX < targetWidth; gridX++) {
                const x0 = gridX * sourceWidth / targetWidth;
                const x1 = (gridX + 1) * sourceWidth / targetWidth;
                const [r, g, b] = this._sampleCellColor(sourceData, sourceWidth, sourceHeight, x0, y0, x1, y1);
                const index = (gridY * targetWidth + gridX) * 4;
                imageData.data[index] = r;
                imageData.data[index + 1] = g;
                imageData.data[index + 2] = b;
                imageData.data[index + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    static renderSharp(sampleCanvas, scale) {
        const normalizedScale = this._normalizeScale(scale);
        const canvas = document.createElement('canvas');
        canvas.width = sampleCanvas.width * normalizedScale;
        canvas.height = sampleCanvas.height * normalizedScale;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sampleCanvas, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    static _scale2xImageData(sourceImageData) {
        const srcWidth = sourceImageData.width;
        const srcHeight = sourceImageData.height;
        const src = sourceImageData.data;
        const dest = new ImageData(srcWidth * 2, srcHeight * 2);
        const out = dest.data;

        const srcIndex = (x, y) => (y * srcWidth + x) * 4;
        const outIndex = (x, y) => (y * dest.width + x) * 4;
        const samePixel = (a, b) => (
            src[a] === src[b] &&
            src[a + 1] === src[b + 1] &&
            src[a + 2] === src[b + 2] &&
            src[a + 3] === src[b + 3]
        );
        const writePixel = (index, sourceIndex) => {
            out[index] = src[sourceIndex];
            out[index + 1] = src[sourceIndex + 1];
            out[index + 2] = src[sourceIndex + 2];
            out[index + 3] = src[sourceIndex + 3];
        };

        for (let y = 0; y < srcHeight; y++) {
            for (let x = 0; x < srcWidth; x++) {
                const p = srcIndex(x, y);
                const a = y > 0 ? srcIndex(x, y - 1) : p;
                const b = x < srcWidth - 1 ? srcIndex(x + 1, y) : p;
                const c = x > 0 ? srcIndex(x - 1, y) : p;
                const d = y < srcHeight - 1 ? srcIndex(x, y + 1) : p;

                let p1 = p;
                let p2 = p;
                let p3 = p;
                let p4 = p;

                if (!samePixel(c, b) && !samePixel(a, d)) {
                    if (samePixel(a, c)) p1 = a;
                    if (samePixel(a, b)) p2 = b;
                    if (samePixel(d, c)) p3 = c;
                    if (samePixel(d, b)) p4 = b;
                }

                const dx = x * 2;
                const dy = y * 2;
                writePixel(outIndex(dx, dy), p1);
                writePixel(outIndex(dx + 1, dy), p2);
                writePixel(outIndex(dx, dy + 1), p3);
                writePixel(outIndex(dx + 1, dy + 1), p4);
            }
        }

        return dest;
    }

    static renderSmooth(sampleCanvas, scale) {
        const normalizedScale = this._normalizeScale(scale);
        let currentCanvas = sampleCanvas;
        let currentScale = 1;
        let stages = 0;

        while (currentScale < normalizedScale) {
            const nextScale = Math.min(normalizedScale, currentScale * 2);
            const nextCanvas = document.createElement('canvas');
            nextCanvas.width = sampleCanvas.width * nextScale;
            nextCanvas.height = sampleCanvas.height * nextScale;
            const nextCtx = nextCanvas.getContext('2d');
            nextCtx.imageSmoothingEnabled = true;
            if ('imageSmoothingQuality' in nextCtx) nextCtx.imageSmoothingQuality = 'high';
            nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
            nextCtx.drawImage(currentCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
            currentCanvas = nextCanvas;
            currentScale = nextScale;
            stages += 1;
        }

        const canvas = document.createElement('canvas');
        canvas.width = currentCanvas.width;
        canvas.height = currentCanvas.height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        if ('filter' in ctx) ctx.filter = 'blur(0.35px) saturate(102%)';
        ctx.drawImage(currentCanvas, 0, 0);
        if ('filter' in ctx) ctx.filter = 'none';
        return { canvas, passes: stages };
    }

    static restore(image, { gridWidth, mode = 'sharp', scale = 4 } = {}) {
        const sampledCanvas = this.sampleToGrid(image, gridWidth);
        const normalizedScale = this._normalizeScale(scale);

        if (mode === 'smooth') {
            const { canvas, passes } = this.renderSmooth(sampledCanvas, normalizedScale);
            return {
                mode,
                scale: normalizedScale,
                passes,
                sampledWidth: sampledCanvas.width,
                sampledHeight: sampledCanvas.height,
                outputWidth: canvas.width,
                outputHeight: canvas.height,
                outputCanvas: canvas,
            };
        }

        const canvas = this.renderSharp(sampledCanvas, normalizedScale);
        return {
            mode: 'sharp',
            scale: normalizedScale,
            passes: 0,
            sampledWidth: sampledCanvas.width,
            sampledHeight: sampledCanvas.height,
            outputWidth: canvas.width,
            outputHeight: canvas.height,
            outputCanvas: canvas,
        };
    }
}

window.PixelRestoreEngine = PixelRestoreEngine;