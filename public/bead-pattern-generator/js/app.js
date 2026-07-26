/**
 * BeadPatternApp — 精简版
 * 上传图片 → 裁剪/调色 → 转拼豆 → 预览编辑 → 导出 PNG/PDF
 * 依赖：converter.js、colors.js、（可选）pixel-restore.js
 */
window.onload = function () {
    alert(
        "免责声明\n\n" +
        "本工具仅用于个人学习、研究与技术交流用途，不用于任何商业目的。\n" +
        "本工具部分功能设计、交互方式及相关技术方案参考了公开网络中的已有作品。如涉及任何第三方拥有的知识产权、版权或其他合法权益，请权利人通过邮箱（barryzed@163.com）联系，我将在核实相关情况后根据实际情况进行处理。\n" +
        "本工具生成的拼豆图案、颜色匹配结果及导出内容仅作为制作参考。由于图片质量、颜色空间、显示设备、珠子品牌色卡差异等因素，生成结果可能与实际制作效果存在偏差，请使用者自行判断。\n" +
        "用户上传的图片、素材及生成内容，其版权及相关权利归原权利人所有。用户应确保自身拥有对相关素材进行使用、修改或转换的合法权限，不得利用本工具制作、传播侵犯他人权益的内容。\n" +
        "本工具不会主动存储或公开用户上传的图片文件，用户应自行妥善保管相关素材。\n" +
        "本工具目前仅进行了基础功能测试与验证，可能存在未知问题或兼容性问题。如遇到功能异常，欢迎通过邮箱（barryzed@163.com）反馈。\n\n" +
        "继续使用本工具即代表您已阅读并同意以上声明。"
    );
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

class BeadPatternApp {
    constructor() {
        this.converter = new BeadConverter();
        this.canvas = document.getElementById('patternCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.emptyState = document.getElementById('emptyState');
        this.controls = document.querySelector('.controls');
        this.uploadSection = document.querySelector('.upload-section');

        this.image = null;
        this.croppedImage = null;
        this.pattern = null;
        this._imageDataUrl = '';

        // View
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this._panning = false;
        this._lastX = 0;
        this._lastY = 0;

        // Render options
        this.CELL = 24;
        this.AXIS_M = 30;
        this.showCodes = true;
        this.showGrid = true;
        this.showBoardLines = false;
        this.hideBg = false;
        this.bgCode = null;

        // Image adjustments
        this.brightness = 0;
        this.contrast = 0;
        this.saturation = 0;

        // Crop
        this._cropping = false;
        this._cropRect = null;
        this._cropDrag = false;
        this._cropStart = null;

        // Compare / restore / edit
        this._comparing = false;
        this._restoreOriginalDataUrl = '';
        this._restoredSource = false;
        this._restoreBusy = false;
        this._restoreMode = 'sharp';
        this._restoreScale = 4;
        this._restorePreviewDataUrl = '';
        this._restorePreviewMeta = null;
        this._restoreRenderToken = 0;
        this.editMode = false;
        this._editDownPos = null;

        this._bind();
        this._syncRestoreUI();
    }

    /* ═══════════ Event binding ═══════════ */

    _bind() {
        const $ = id => document.getElementById(id);

        // Upload
        const dropZone = $('dropZone');
        const fileInput = $('fileInput');
        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const f = e.dataTransfer.files[0];
                if (f && f.type.startsWith('image/')) this._loadImage(f);
            });
            fileInput.addEventListener('change', e => {
                if (e.target.files[0]) this._loadImage(e.target.files[0]);
            });
        }

        // Pixel restore
        if ($('restoreBtn')) $('restoreBtn').addEventListener('click', () => this._restoreSourceImage());
        if ($('pixelRestoreClose') && $('pixelRestoreModal')) {
            $('pixelRestoreClose').addEventListener('click', () => this._closeRestoreModal());
            $('pixelRestoreModal').addEventListener('click', e => {
                if (e.target === $('pixelRestoreModal')) this._closeRestoreModal();
            });
        }
        document.querySelectorAll('[data-restore-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._restoreMode = btn.dataset.restoreMode || 'sharp';
                this._syncRestorePanelControls();
                this._renderRestorePreview();
            });
        });
        if ($('restoreScale')) {
            $('restoreScale').addEventListener('change', e => {
                this._restoreScale = parseInt(e.target.value, 10) || 4;
                this._syncRestorePanelControls();
                this._renderRestorePreview();
            });
        }
        if ($('restoreApplyBtn')) {
            $('restoreApplyBtn').addEventListener('click', () => this._applyRestorePreview());
        }

        // Sliders
        if ($('widthSlider')) {
            $('widthSlider').addEventListener('input', e => {
                if ($('widthValue')) $('widthValue').textContent = e.target.value;
                this._refreshHeightLabel();
            });
        }
        if ($('maxColorsSlider')) {
            $('maxColorsSlider').addEventListener('input', e => {
                const v = parseInt(e.target.value);
                if ($('maxColorsValue')) $('maxColorsValue').textContent = v === 0 ? '不限' : v;
            });
        }

        ['brightness', 'contrast', 'saturation'].forEach(name => {
            const slider = $(name + 'Slider');
            if (!slider) return;
            slider.addEventListener('input', e => {
                this[name] = parseInt(e.target.value);
                const label = $(name + 'Value');
                if (label) label.textContent = e.target.value;
            });
        });
        if ($('resetAdjust')) {
            $('resetAdjust').addEventListener('click', () => {
                ['brightness', 'contrast', 'saturation'].forEach(name => {
                    this[name] = 0;
                    const slider = $(name + 'Slider');
                    const label = $(name + 'Value');
                    if (slider) slider.value = 0;
                    if (label) label.textContent = '0';
                });
            });
        }

        // Buttons
        if ($('convertBtn')) $('convertBtn').addEventListener('click', () => this._generate());
        if ($('exportBtn')) $('exportBtn').addEventListener('click', () => this._export());
        if ($('exportPdfBtn')) $('exportPdfBtn').addEventListener('click', () => this._exportPDF());
        if ($('compareBtn')) $('compareBtn').addEventListener('click', () => this._toggleCompare());
        if ($('fullscreenBtn')) $('fullscreenBtn').addEventListener('click', () => this._toggleFullscreen());

        document.addEventListener('fullscreenchange', () => this._onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this._onFullscreenChange());
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && document.querySelector('.pattern-container.fake-fullscreen')) {
                e.preventDefault();
                this._toggleFullscreen();
            }
        });

        // Toggles
        if ($('showCodes')) $('showCodes').addEventListener('change', e => { this.showCodes = e.target.checked; this._draw(); });
        if ($('showGrid')) $('showGrid').addEventListener('change', e => { this.showGrid = e.target.checked; this._draw(); });
        if ($('showBoardLines')) $('showBoardLines').addEventListener('change', e => { this.showBoardLines = e.target.checked; this._draw(); });
        if ($('hideBg')) $('hideBg').addEventListener('change', e => { this.hideBg = e.target.checked; this._draw(); });
        if ($('editMode')) $('editMode').addEventListener('change', e => {
            this.editMode = e.target.checked;
            this._updateEditModeUI();
        });

        // Canvas hover / zoom / pan
        this.canvas.addEventListener('mousemove', e => this._onCanvasHover(e));
        this.canvas.addEventListener('mouseleave', () => {
            const tip = $('beadTooltip');
            if (tip) tip.classList.add('hidden');
        });

        this.canvas.addEventListener('wheel', e => {
            if (!this.pattern) return;
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const nz = Math.max(0.05, Math.min(15, this.zoom * factor));
            this.panX = mx - (mx - this.panX) * (nz / this.zoom);
            this.panY = my - (my - this.panY) * (nz / this.zoom);
            this.zoom = nz;
            this._draw();
        }, { passive: false });

        this.canvas.addEventListener('mousedown', e => {
            if (!this.pattern) return;
            e.preventDefault();
            this._editDownPos = { x: e.clientX, y: e.clientY };
            this._panning = true;
            this._lastX = e.clientX;
            this._lastY = e.clientY;
            if (!this.editMode) this.canvas.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', e => {
            if (!this._panning) return;
            this.panX += e.clientX - this._lastX;
            this.panY += e.clientY - this._lastY;
            this._lastX = e.clientX;
            this._lastY = e.clientY;
            this._draw();
        });
        window.addEventListener('mouseup', e => {
            if (this._panning) {
                this._panning = false;
                this.canvas.style.cursor = this.editMode ? 'crosshair' : 'grab';
                if (this.editMode && this._editDownPos) {
                    const dx = e.clientX - this._editDownPos.x;
                    const dy = e.clientY - this._editDownPos.y;
                    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) this._onBeadClick(e);
                }
            }
            this._editDownPos = null;
        });

        // Touch
        let lastTouchDist = 0;
        this.canvas.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                this._panning = true;
                this._lastX = e.touches[0].clientX;
                this._lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
            e.preventDefault();
        }, { passive: false });
        this.canvas.addEventListener('touchmove', e => {
            if (e.touches.length === 1 && this._panning) {
                this.panX += e.touches[0].clientX - this._lastX;
                this.panY += e.touches[0].clientY - this._lastY;
                this._lastX = e.touches[0].clientX;
                this._lastY = e.touches[0].clientY;
                this._draw();
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (lastTouchDist > 0) {
                    const factor = dist / lastTouchDist;
                    const nz = Math.max(0.05, Math.min(15, this.zoom * factor));
                    const rect = this.canvas.getBoundingClientRect();
                    const cx = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
                    const cy = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
                    this.panX = cx - (cx - this.panX) * (nz / this.zoom);
                    this.panY = cy - (cy - this.panY) * (nz / this.zoom);
                    this.zoom = nz;
                    this._draw();
                }
                lastTouchDist = dist;
            }
            e.preventDefault();
        }, { passive: false });
        this.canvas.addEventListener('touchend', () => { this._panning = false; lastTouchDist = 0; });

        const container = document.querySelector('.pattern-container');
        if (container) {
            const ro = new ResizeObserver(() => { if (this.pattern) this._fitAndDraw(); });
            ro.observe(container);
        }

        this._bindCrop();
    }

    /* ═══════════ Crop ═══════════ */

    _bindCrop() {
        const $ = id => document.getElementById(id);
        const overlay = $('cropOverlay');
        const cropBox = $('cropBox');
        if (!overlay || !cropBox) return;

        if ($('cropToggle')) {
            $('cropToggle').addEventListener('click', () => {
                this._cropping ? this._exitCrop() : this._enterCrop();
            });
        }
        if ($('cropApply')) $('cropApply').addEventListener('click', () => this._applyCrop());
        if ($('cropCancel')) $('cropCancel').addEventListener('click', () => this._exitCrop());

        overlay.addEventListener('mousedown', e => {
            e.preventDefault();
            const rect = overlay.getBoundingClientRect();
            this._cropDrag = true;
            this._cropStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            cropBox.style.left = this._cropStart.x + 'px';
            cropBox.style.top = this._cropStart.y + 'px';
            cropBox.style.width = '0';
            cropBox.style.height = '0';
        });
        overlay.addEventListener('mousemove', e => {
            if (!this._cropDrag) return;
            const rect = overlay.getBoundingClientRect();
            const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
            const x = Math.min(this._cropStart.x, cx);
            const y = Math.min(this._cropStart.y, cy);
            cropBox.style.left = x + 'px';
            cropBox.style.top = y + 'px';
            cropBox.style.width = Math.abs(cx - this._cropStart.x) + 'px';
            cropBox.style.height = Math.abs(cy - this._cropStart.y) + 'px';
        });
        const finishDrag = () => {
            if (!this._cropDrag) return;
            this._cropDrag = false;
            const rect = overlay.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const boxRect = cropBox.getBoundingClientRect();
            if (boxRect.width < 5 || boxRect.height < 5) return;
            this._cropRect = {
                x: Math.max(0, (boxRect.left - rect.left) / rect.width),
                y: Math.max(0, (boxRect.top - rect.top) / rect.height),
                w: Math.min(1, boxRect.width / rect.width),
                h: Math.min(1, boxRect.height / rect.height),
            };
        };
        overlay.addEventListener('mouseup', finishDrag);
        window.addEventListener('mouseup', finishDrag);
    }

    _enterCrop() {
        if (!this.image) return;
        this._cropping = true;
        this._cropRect = null;
        const overlay = document.getElementById('cropOverlay');
        const actions = document.getElementById('cropActions');
        const toggle = document.getElementById('cropToggle');
        if (overlay) overlay.classList.remove('hidden');
        if (actions) actions.classList.remove('hidden');
        if (toggle) toggle.textContent = '✂️ 裁剪中…';
    }

    _exitCrop() {
        this._cropping = false;
        this._cropRect = null;
        const overlay = document.getElementById('cropOverlay');
        const actions = document.getElementById('cropActions');
        const toggle = document.getElementById('cropToggle');
        if (overlay) overlay.classList.add('hidden');
        if (actions) actions.classList.add('hidden');
        if (toggle) toggle.textContent = '✂️ 裁剪图片';
    }

    _applyCrop() {
        if (!this._cropRect || !this.image) { this._exitCrop(); return; }
        const { x, y, w, h } = this._cropRect;
        if (w < 0.02 || h < 0.02) { this._exitCrop(); return; }

        const img = this.image;
        const sx = Math.round(x * img.naturalWidth);
        const sy = Math.round(y * img.naturalHeight);
        const sw = Math.round(w * img.naturalWidth);
        const sh = Math.round(h * img.naturalHeight);

        const cvs = document.createElement('canvas');
        cvs.width = sw; cvs.height = sh;
        cvs.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

        const cropped = new Image();
        cropped.onload = () => {
            this.croppedImage = cropped;
            this._imageDataUrl = cropped.src;
            this._restoreOriginalDataUrl = '';
            this._restoredSource = false;
            this._resetRestorePreviewState();
            const preview = document.getElementById('previewImage');
            if (preview) preview.src = cropped.src;
            this._refreshHeightLabel();
            this._exitCrop();
            this._setRestoreStatus('');
            this._syncRestoreUI();
        };
        cropped.src = cvs.toDataURL('image/png');
    }

    /* ═══════════ Image loading ═══════════ */

    _loadImage(file) {
        const reader = new FileReader();
        reader.onload = e => {
            this._applyImageDataUrl(e.target.result).catch(() => {
                alert('图片加载失败，请换一张图片再试');
            });
        };
        reader.readAsDataURL(file);
    }

    _applyImageDataUrl(dataUrl, { preserveRestoreBase = false } = {}) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.image = img;
                this.croppedImage = null;
                this._imageDataUrl = dataUrl;
                const preview = document.getElementById('previewImage');
                const previewContainer = document.getElementById('previewContainer');
                const convertBtn = document.getElementById('convertBtn');
                if (preview) preview.src = dataUrl;
                if (previewContainer) previewContainer.classList.remove('hidden');
                if (convertBtn) convertBtn.disabled = false;
                this._resetRestorePreviewState();
                this._refreshHeightLabel();
                this._exitCrop();
                if (!preserveRestoreBase) {
                    this._restoreOriginalDataUrl = '';
                    this._restoredSource = false;
                    this._setRestoreStatus('');
                }
                this._syncRestoreUI();
                resolve();
            };
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = dataUrl;
        });
    }

    _getActivePreviewDataUrl() {
        const preview = document.getElementById('previewImage');
        if (preview && preview.src && preview.src.startsWith('data:image/')) return preview.src;
        return this._imageDataUrl || '';
    }

    _refreshHeightLabel() {
        const src = this.croppedImage || this.image;
        if (!src) return;
        const slider = document.getElementById('widthSlider');
        const heightValue = document.getElementById('heightValue');
        if (!slider || !heightValue) return;
        const w = parseInt(slider.value);
        heightValue.textContent = Math.round(w * src.height / src.width);
    }

    /* ═══════════ Pixel restore ═══════════ */

    _resetRestorePreviewState() {
        this._restorePreviewDataUrl = '';
        this._restorePreviewMeta = null;
        this._restoreRenderToken += 1;
        const canvas = document.getElementById('restoreResultCanvas');
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        const meta = document.getElementById('restoreMeta');
        if (meta) meta.textContent = '';
        this._setRestorePanelStatus('');
    }

    _setRestoreStatus(message, tone = 'info') {
        const el = document.getElementById('restoreStatus');
        if (!el) return;
        if (!message) { el.textContent = ''; el.className = 'restore-status hidden'; return; }
        el.textContent = message;
        el.className = `restore-status restore-status-${tone}`;
    }

    _setRestorePanelStatus(message, tone = 'info') {
        const el = document.getElementById('restorePanelStatus');
        if (!el) return;
        if (!message) { el.textContent = ''; el.className = 'restore-panel-status hidden'; return; }
        el.textContent = message;
        el.className = `restore-panel-status restore-panel-status-${tone}`;
    }

    _syncRestoreUI() {
        const btn = document.getElementById('restoreBtn');
        if (!btn) return;
        const hasImage = !!(this.image || this.croppedImage || this._getActivePreviewDataUrl());
        btn.disabled = this._restoreBusy || !hasImage;
        btn.textContent = this._restoredSource && this._restoreOriginalDataUrl ? '↺ 恢复导入图' : '🪄 像素还原';
    }

    _syncRestorePanelControls() {
        document.querySelectorAll('[data-restore-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.restoreMode === this._restoreMode);
        });
        const scale = document.getElementById('restoreScale');
        if (scale) scale.value = String(this._restoreScale);
        const applyBtn = document.getElementById('restoreApplyBtn');
        if (applyBtn) {
            applyBtn.disabled = this._restoreBusy || !this._restorePreviewDataUrl;
            applyBtn.textContent = this._restoreBusy ? '处理中…' : '应用结果到主图';
        }
        const meta = document.getElementById('restoreMeta');
        if (!meta) return;
        if (this._restorePreviewMeta) {
            const m = this._restorePreviewMeta;
            meta.textContent = m.mode === 'smooth'
                ? `提取 ${m.sampledWidth}×${m.sampledHeight} → 平滑 ${m.scale}x → ${m.outputWidth}×${m.outputHeight}`
                : `提取 ${m.sampledWidth}×${m.sampledHeight} → 像素 ${m.scale}x → ${m.outputWidth}×${m.outputHeight}`;
        } else {
            const width = parseInt(document.getElementById('widthSlider')?.value, 10) || 50;
            meta.textContent = `将按当前珠子宽度 ${width} 提取格子颜色`;
        }
    }

    _openRestoreModal() {
        const modal = document.getElementById('pixelRestoreModal');
        const sourceDataUrl = this._getActivePreviewDataUrl();
        if (!modal || !sourceDataUrl) {
            this._setRestoreStatus('请先导入一张图片。', 'error');
            return;
        }
        const originalImg = document.getElementById('restoreOriginalImg');
        if (originalImg) originalImg.src = sourceDataUrl;
        modal.classList.remove('hidden');
        this._restorePreviewDataUrl = '';
        this._restorePreviewMeta = null;
        this._setRestorePanelStatus('正在本地提取格子颜色并生成预览...', 'info');
        this._syncRestorePanelControls();
        this._renderRestorePreview();
    }

    _closeRestoreModal() {
        const modal = document.getElementById('pixelRestoreModal');
        if (modal) modal.classList.add('hidden');
    }

    async _revertRestoredImage() {
        this._restoreBusy = true;
        this._syncRestoreUI();
        this._setRestoreStatus('正在恢复原导入图...', 'info');
        try {
            await this._applyImageDataUrl(this._restoreOriginalDataUrl);
            this._setRestoreStatus('已恢复原导入图。', 'success');
        } catch (error) {
            this._setRestoreStatus(error.message || '恢复失败', 'error');
        } finally {
            this._restoreBusy = false;
            this._syncRestoreUI();
            this._syncRestorePanelControls();
        }
    }

    async _renderRestorePreview() {
        const srcImage = this.croppedImage || this.image;
        const restoreCanvas = document.getElementById('restoreResultCanvas');
        if (!srcImage || !restoreCanvas) return;
        if (typeof PixelRestoreEngine === 'undefined') {
            this._setRestorePanelStatus('像素还原模块未加载', 'error');
            return;
        }
        const renderToken = ++this._restoreRenderToken;
        const gridWidth = parseInt(document.getElementById('widthSlider')?.value, 10) || 50;
        this._restoreBusy = true;
        this._restorePreviewDataUrl = '';
        this._restorePreviewMeta = null;
        this._syncRestoreUI();
        this._syncRestorePanelControls();
        this._setRestorePanelStatus(this._restoreMode === 'smooth' ? '正在生成平滑预览...' : '正在生成像素预览...', 'info');

        await new Promise(r => requestAnimationFrame(r));
        try {
            const result = PixelRestoreEngine.restore(srcImage, {
                gridWidth, mode: this._restoreMode, scale: this._restoreScale,
            });
            if (renderToken !== this._restoreRenderToken) return;
            restoreCanvas.width = result.outputWidth;
            restoreCanvas.height = result.outputHeight;
            const ctx = restoreCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, restoreCanvas.width, restoreCanvas.height);
            ctx.drawImage(result.outputCanvas, 0, 0);
            this._restorePreviewDataUrl = result.outputCanvas.toDataURL('image/png');
            this._restorePreviewMeta = result;
            this._setRestorePanelStatus(`已提取 ${result.sampledWidth}×${result.sampledHeight} 格子颜色`, 'success');
        } catch (error) {
            if (renderToken !== this._restoreRenderToken) return;
            this._setRestorePanelStatus(error.message || '还原失败', 'error');
        } finally {
            if (renderToken === this._restoreRenderToken) {
                this._restoreBusy = false;
                this._syncRestoreUI();
                this._syncRestorePanelControls();
            }
        }
    }

    async _applyRestorePreview() {
        if (!this._restorePreviewDataUrl || !this._restorePreviewMeta) {
            this._setRestorePanelStatus('请先等待预览生成完成。', 'error');
            return;
        }
        const originalPreview = this._getActivePreviewDataUrl();
        if (!originalPreview) {
            this._setRestorePanelStatus('请先导入一张图片。', 'error');
            return;
        }
        this._restoreBusy = true;
        this._syncRestoreUI();
        this._setRestorePanelStatus('正在应用还原结果...', 'info');
        try {
            await this._applyImageDataUrl(this._restorePreviewDataUrl, { preserveRestoreBase: true });
            this._restoreOriginalDataUrl = originalPreview;
            this._restoredSource = true;
            this._closeRestoreModal();
            this._setRestoreStatus('已应用像素还原结果。', 'success');
        } catch (error) {
            this._setRestorePanelStatus(error.message || '应用失败', 'error');
        } finally {
            this._restoreBusy = false;
            this._syncRestoreUI();
            this._syncRestorePanelControls();
        }
    }

    async _restoreSourceImage() {
        if (this._restoreBusy) return;
        if (this._restoredSource && this._restoreOriginalDataUrl) {
            await this._revertRestoredImage();
            return;
        }
        if (!this._getActivePreviewDataUrl()) {
            this._setRestoreStatus('请先导入一张图片。', 'error');
            return;
        }
        this._openRestoreModal();
    }

    /* ═══════════ Generate ═══════════ */

    _generate() {
        const srcImage = this.croppedImage || this.image;
        if (!srcImage) return;

        const btn = document.getElementById('convertBtn');
        if (btn) { btn.textContent = '⏳ 生成中…'; btn.disabled = true; }

        requestAnimationFrame(() => {
            let width = parseInt(document.getElementById('widthSlider')?.value || '50', 10);
            const brand = document.getElementById('brandSelect')?.value || 'mard';
            const maxColors = parseInt(document.getElementById('maxColorsSlider')?.value || '0', 10);
            const whiteBgEl = document.getElementById('whiteBgEmpty');
            const whiteBgEmpty = whiteBgEl ? whiteBgEl.checked : false;
            const palette = BEAD_PALETTES[brand].colors;

            const adjustedImage = this._applyAdjustments(srcImage);
            this.pattern = this.converter.convert(adjustedImage, width, palette, maxColors, { whiteBgEmpty });
            this.bgCode = this._detectBackgroundCode(this.pattern);

            if (this.emptyState) this.emptyState.classList.add('hidden');
            document.querySelector('.pattern-container')?.classList.add('has-pattern');
            this._fitAndDraw();
            this._renderLegend();
            this._renderStats();

            const exportBtn = document.getElementById('exportBtn');
            const exportPdfBtn = document.getElementById('exportPdfBtn');
            const compareBtn = document.getElementById('compareBtn');
            const fullscreenBtn = document.getElementById('fullscreenBtn');
            if (exportBtn) exportBtn.disabled = false;
            if (exportPdfBtn) exportPdfBtn.disabled = false;
            if (compareBtn) compareBtn.classList.remove('hidden');
            if (fullscreenBtn) fullscreenBtn.classList.remove('hidden');

            if (btn) { btn.textContent = '🔄 生成图案'; btn.disabled = false; }
        });
    }

    _detectBackgroundCode(pattern) {
        if (!pattern) return null;
        const { grid, width: W, height: H } = pattern;
        const edgeCounts = {};
        let perimeter = 0;
        const visit = (x, y) => {
            perimeter++;
            const c = grid[y] && grid[y][x];
            if (!c) return;
            edgeCounts[c.code] = (edgeCounts[c.code] || 0) + 1;
        };
        for (let x = 0; x < W; x++) { visit(x, 0); if (H > 1) visit(x, H - 1); }
        for (let y = 1; y < H - 1; y++) { visit(0, y); if (W > 1) visit(W - 1, y); }
        const best = Object.entries(edgeCounts).sort((a, b) => b[1] - a[1])[0];
        if (!best || !perimeter) return null;
        const [code, count] = best;
        return count / perimeter >= 0.35 ? code : null;
    }

    _applyAdjustments(img) {
        if (this.brightness === 0 && this.contrast === 0 && this.saturation === 0) return img;
        const cvs = document.createElement('canvas');
        cvs.width = img.naturalWidth || img.width;
        cvs.height = img.naturalHeight || img.height;
        const ctx = cvs.getContext('2d');
        ctx.filter = `brightness(${100 + this.brightness}%) contrast(${100 + this.contrast}%) saturate(${100 + this.saturation}%)`;
        ctx.drawImage(img, 0, 0);
        return cvs;
    }

    /* ═══════════ Canvas render ═══════════ */

    _fitAndDraw() {
        const container = document.querySelector('.pattern-container');
        if (!container) return;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.canvas.style.cursor = 'grab';
        if (!this.pattern) return;
        const pw = this.pattern.width * this.CELL + this.AXIS_M * 2;
        const ph = this.pattern.height * this.CELL + this.AXIS_M * 2;
        this.zoom = Math.min(this.canvas.width / pw, this.canvas.height / ph, 1);
        this.panX = (this.canvas.width - pw * this.zoom) / 2;
        this.panY = (this.canvas.height - ph * this.zoom) / 2;
        this._draw();
    }

    _draw() {
        if (!this.pattern) return;
        const { ctx, CELL, AXIS_M } = this;
        const { grid, width: W, height: H } = this.pattern;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.save();
        ctx.translate(this.panX, this.panY);
        ctx.scale(this.zoom, this.zoom);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(AXIS_M, AXIS_M, W * CELL, H * CELL);

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const c = grid[y][x];
                if (!c) continue;
                if (this.hideBg && this.bgCode && c.code === this.bgCode) continue;
                ctx.fillStyle = c.hex;
                ctx.fillRect(AXIS_M + x * CELL, AXIS_M + y * CELL, CELL, CELL);
            }
        }

        if (this.showGrid) {
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.lineWidth = 0.5;
            for (let x = 0; x <= W; x++) {
                const px = AXIS_M + x * CELL;
                ctx.beginPath(); ctx.moveTo(px, AXIS_M); ctx.lineTo(px, AXIS_M + H * CELL); ctx.stroke();
            }
            for (let y = 0; y <= H; y++) {
                const py = AXIS_M + y * CELL;
                ctx.beginPath(); ctx.moveTo(AXIS_M, py); ctx.lineTo(AXIS_M + W * CELL, py); ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1.2;
            for (let x = 5; x <= W; x += 5) {
                const px = AXIS_M + x * CELL;
                ctx.beginPath(); ctx.moveTo(px, AXIS_M); ctx.lineTo(px, AXIS_M + H * CELL); ctx.stroke();
            }
            for (let y = 5; y <= H; y += 5) {
                const py = AXIS_M + y * CELL;
                ctx.beginPath(); ctx.moveTo(AXIS_M, py); ctx.lineTo(AXIS_M + W * CELL, py); ctx.stroke();
            }
        }

        if (this.showCodes && this.zoom >= 0.35) {
            const fs = Math.min(10, CELL * 0.42);
            ctx.font = `bold ${fs}px -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const c = grid[y][x];
                    if (!c) continue;
                    if (this.hideBg && this.bgCode && c.code === this.bgCode) continue;
                    const brightness = (c.rgb.r * 299 + c.rgb.g * 587 + c.rgb.b * 114) / 1000;
                    ctx.fillStyle = brightness > 140 ? '#000' : '#FFF';
                    ctx.fillText(c.code, AXIS_M + x * CELL + CELL / 2, AXIS_M + y * CELL + CELL / 2);
                }
            }
        }

        ctx.fillStyle = '#555';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        for (let x = 0; x < W; x++) ctx.fillText(x + 1, AXIS_M + x * CELL + CELL / 2, AXIS_M - 3);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (let x = 0; x < W; x++) ctx.fillText(x + 1, AXIS_M + x * CELL + CELL / 2, AXIS_M + H * CELL + 3);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let y = 0; y < H; y++) ctx.fillText(y + 1, AXIS_M - 4, AXIS_M + y * CELL + CELL / 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (let y = 0; y < H; y++) ctx.fillText(y + 1, AXIS_M + W * CELL + 4, AXIS_M + y * CELL + CELL / 2);

        if (this.showBoardLines) {
            ctx.strokeStyle = '#e53935';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            for (let bx = 29; bx < W; bx += 29) {
                const px = AXIS_M + bx * CELL;
                ctx.beginPath(); ctx.moveTo(px, AXIS_M); ctx.lineTo(px, AXIS_M + H * CELL); ctx.stroke();
            }
            for (let by = 29; by < H; by += 29) {
                const py = AXIS_M + by * CELL;
                ctx.beginPath(); ctx.moveTo(AXIS_M, py); ctx.lineTo(AXIS_M + W * CELL, py); ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(AXIS_M, AXIS_M, W * CELL, H * CELL);
        ctx.restore();
    }

    _onCanvasHover(e) {
        if (!this.pattern) return;
        const tip = document.getElementById('beadTooltip');
        if (!tip) return;
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const gx = Math.floor(((mx - this.panX) / this.zoom - this.AXIS_M) / this.CELL);
        const gy = Math.floor(((my - this.panY) / this.zoom - this.AXIS_M) / this.CELL);
        const { width: W, height: H, grid } = this.pattern;
        if (gx < 0 || gx >= W || gy < 0 || gy >= H || !grid[gy][gx]) {
            tip.classList.add('hidden');
            return;
        }
        const c = grid[gy][gx];
        tip.innerHTML = `<span class="tip-swatch" style="background:${c.hex}"></span><b>${c.code}</b> ${c.name}<br><small>坐标 (${gx + 1}, ${gy + 1})</small>`;
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top = (e.clientY + 14) + 'px';
        tip.classList.remove('hidden');
    }

    /* ═══════════ Edit mode ═══════════ */

    _updateEditModeUI() {
        const container = document.querySelector('.pattern-container');
        if (this.editMode) {
            this.canvas.style.cursor = 'crosshair';
            this.canvas.classList.add('canvas-edit-mode');
            if (container && !container.querySelector('.edit-mode-hint')) {
                const hint = document.createElement('div');
                hint.className = 'edit-mode-hint';
                hint.textContent = '✏️ 编辑模式：点击珠子更换颜色';
                container.appendChild(hint);
            }
        } else {
            this.canvas.style.cursor = 'grab';
            this.canvas.classList.remove('canvas-edit-mode');
            const hint = container?.querySelector('.edit-mode-hint');
            if (hint) hint.remove();
            this._closeBeadPicker();
        }
    }

    _screenToGrid(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = clientX - rect.left, my = clientY - rect.top;
        return {
            gx: Math.floor(((mx - this.panX) / this.zoom - this.AXIS_M) / this.CELL),
            gy: Math.floor(((my - this.panY) / this.zoom - this.AXIS_M) / this.CELL),
        };
    }

    _onBeadClick(e) {
        if (!this.pattern) return;
        const { gx, gy } = this._screenToGrid(e.clientX, e.clientY);
        const { width: W, height: H } = this.pattern;
        if (gx < 0 || gx >= W || gy < 0 || gy >= H) return;
        this._openBeadPicker(gx, gy, e.clientX, e.clientY);
    }

    _openBeadPicker(gx, gy, px, py) {
        const picker = document.getElementById('beadPicker');
        if (!picker) return;
        const brand = document.getElementById('brandSelect')?.value || 'mard';
        const palette = BEAD_PALETTES[brand].colors;
        const current = this.pattern.grid[gy]?.[gx];

        const vw = window.innerWidth, vh = window.innerHeight;
        let left = px + 16, top = py - 40;
        if (left + 270 > vw) left = px - 280;
        if (top + 360 > vh) top = vh - 370;
        if (top < 8) top = 8;
        picker.style.left = left + 'px';
        picker.style.top = top + 'px';

        const title = document.getElementById('bpTitle');
        if (title) title.textContent = `坐标 (${gx + 1}, ${gy + 1})` + (current ? ` · ${current.code}` : '');
        this._editTarget = { gx, gy };

        const container = document.getElementById('bpColors');
        const searchInput = document.getElementById('bpSearch');
        if (searchInput) searchInput.value = '';

        const renderSwatches = (filter = '') => {
            if (!container) return;
            const lower = filter.toLowerCase();
            container.innerHTML = palette
                .filter(c => !filter || c.code.toLowerCase().includes(lower) || c.name.toLowerCase().includes(lower))
                .map(c => {
                    const active = current && c.code === current.code ? ' bp-active' : '';
                    return `<div class="bp-swatch${active}" data-code="${c.code}" style="background:${c.hex}" title="${c.code} ${c.name}"></div>`;
                }).join('');
            container.querySelectorAll('.bp-swatch').forEach(el => {
                el.addEventListener('click', () => this._applyBeadEdit(el.dataset.code));
            });
        };
        renderSwatches();
        if (searchInput) searchInput.oninput = () => renderSwatches(searchInput.value);
        const closeBtn = document.getElementById('bpClose');
        if (closeBtn) closeBtn.onclick = () => this._closeBeadPicker();

        picker.classList.remove('hidden');
        if (searchInput) searchInput.focus();

        setTimeout(() => {
            this._pickerOutsideHandler = e => {
                if (!picker.contains(e.target)) this._closeBeadPicker();
            };
            window.addEventListener('mousedown', this._pickerOutsideHandler);
        }, 100);
    }

    _closeBeadPicker() {
        const picker = document.getElementById('beadPicker');
        if (picker) picker.classList.add('hidden');
        if (this._pickerOutsideHandler) {
            window.removeEventListener('mousedown', this._pickerOutsideHandler);
            this._pickerOutsideHandler = null;
        }
    }

    _applyBeadEdit(code) {
        if (!this._editTarget || !this.pattern) return;
        const { gx, gy } = this._editTarget;
        const brand = document.getElementById('brandSelect')?.value || 'mard';
        const palette = BEAD_PALETTES[brand].colors;
        const newColor = palette.find(c => c.code === code);
        if (!newColor) return;

        const rgb = this.converter.hexToRgb(newColor.hex);
        const lab = this.converter.rgbToLab(rgb.r, rgb.g, rgb.b);
        const colorObj = { ...newColor, rgb, lab };
        const oldColor = this.pattern.grid[gy][gx];

        this.pattern.grid[gy][gx] = colorObj;
        if (oldColor) {
            this.pattern.colorCounts[oldColor.code]--;
            if (this.pattern.colorCounts[oldColor.code] <= 0) delete this.pattern.colorCounts[oldColor.code];
        }
        this.pattern.colorCounts[code] = (this.pattern.colorCounts[code] || 0) + 1;
        this.pattern.uniqueColors = Object.keys(this.pattern.colorCounts).length;

        this._draw();
        this._renderLegend();
        this._renderStats();
        this._closeBeadPicker();
    }

    /* ═══════════ Legend & Stats ═══════════ */

    _renderLegend() {
        if (!this.pattern) return;
        const section = document.getElementById('legendSection');
        const container = document.getElementById('legendContent');
        if (!section || !container) return;
        section.classList.remove('hidden');
        const brand = document.getElementById('brandSelect')?.value || 'mard';
        const palette = BEAD_PALETTES[brand].colors;
        const sorted = Object.entries(this.pattern.colorCounts).sort((a, b) => b[1] - a[1]);
        container.innerHTML = sorted.map(([code, count]) => {
            const c = palette.find(p => p.code === code);
            if (!c) return '';
            return `<div class="legend-item">
        <div class="legend-color" style="background:${c.hex}"></div>
        <span class="legend-code">${c.code}</span>
        <span class="legend-count">${count}颗</span>
      </div>`;
        }).join('');
    }

    _renderStats() {
        if (!this.pattern) return;
        const section = document.getElementById('statsSection');
        const content = document.getElementById('statsContent');
        if (!section || !content) return;
        section.classList.remove('hidden');
        const { width, height, totalBeads, uniqueColors } = this.pattern;
        const boards = Math.ceil(width / 29) * Math.ceil(height / 29);
        content.innerHTML = `
      <div class="stat-item"><span>尺寸</span><span class="stat-value">${width} × ${height}</span></div>
      <div class="stat-item"><span>总珠子数</span><span class="stat-value">${totalBeads.toLocaleString()}</span></div>
      <div class="stat-item"><span>使用颜色</span><span class="stat-value">${uniqueColors}</span></div>
      <div class="stat-item"><span>拼豆板 (29×29)</span><span class="stat-value">${boards} 块</span></div>
    `;
    }

    /* ═══════════ Export PNG（每颗珠子带色号） ═══════════ */

    _export() {
        if (!this.pattern) return;
        const { grid, width: W, height: H, colorCounts } = this.pattern;
        const CELL = 24, AXIS = 30;
        const brand = document.getElementById('brandSelect')?.value || 'mard';
        const palette = BEAD_PALETTES[brand].colors;
        const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);

        const legendItemW = 140;
        const legendCols = Math.max(1, Math.floor((W * CELL) / legendItemW));
        const legendRows = Math.ceil(sorted.length / legendCols);
        const legendH = 20 + legendRows * 26 + 10;
        const totalW = AXIS * 2 + W * CELL;
        const totalH = AXIS * 2 + H * CELL + legendH;

        const cvs = document.createElement('canvas');
        cvs.width = totalW; cvs.height = totalH;
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = '#FFF';
        ctx.fillRect(0, 0, totalW, totalH);

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const c = grid[y][x]; if (!c) continue;
                if (this.hideBg && this.bgCode && c.code === this.bgCode) continue;
                ctx.fillStyle = c.hex;
                ctx.fillRect(AXIS + x * CELL, AXIS + y * CELL, CELL, CELL);
                const fs = Math.min(10, CELL * 0.42);
                ctx.font = `bold ${fs}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const br = (c.rgb.r * 299 + c.rgb.g * 587 + c.rgb.b * 114) / 1000;
                ctx.fillStyle = br > 140 ? '#000' : '#FFF';
                ctx.fillText(c.code, AXIS + x * CELL + CELL / 2, AXIS + y * CELL + CELL / 2);
            }
        }

        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= W; x++) {
            ctx.beginPath(); ctx.moveTo(AXIS + x * CELL, AXIS); ctx.lineTo(AXIS + x * CELL, AXIS + H * CELL); ctx.stroke();
        }
        for (let y = 0; y <= H; y++) {
            ctx.beginPath(); ctx.moveTo(AXIS, AXIS + y * CELL); ctx.lineTo(AXIS + W * CELL, AXIS + y * CELL); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
        for (let x = 5; x <= W; x += 5) {
            ctx.beginPath(); ctx.moveTo(AXIS + x * CELL, AXIS); ctx.lineTo(AXIS + x * CELL, AXIS + H * CELL); ctx.stroke();
        }
        for (let y = 5; y <= H; y += 5) {
            ctx.beginPath(); ctx.moveTo(AXIS, AXIS + y * CELL); ctx.lineTo(AXIS + W * CELL, AXIS + y * CELL); ctx.stroke();
        }
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
        ctx.strokeRect(AXIS, AXIS, W * CELL, H * CELL);

        if (this.showBoardLines) {
            ctx.strokeStyle = '#e53935'; ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            for (let bx = 29; bx < W; bx += 29) {
                const px = AXIS + bx * CELL;
                ctx.beginPath(); ctx.moveTo(px, AXIS); ctx.lineTo(px, AXIS + H * CELL); ctx.stroke();
            }
            for (let by = 29; by < H; by += 29) {
                const py = AXIS + by * CELL;
                ctx.beginPath(); ctx.moveTo(AXIS, py); ctx.lineTo(AXIS + W * CELL, py); ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        ctx.fillStyle = '#555'; ctx.font = '9px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        for (let x = 0; x < W; x++) ctx.fillText(x + 1, AXIS + x * CELL + CELL / 2, AXIS - 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (let x = 0; x < W; x++) ctx.fillText(x + 1, AXIS + x * CELL + CELL / 2, AXIS + H * CELL + 2);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let y = 0; y < H; y++) ctx.fillText(y + 1, AXIS - 3, AXIS + y * CELL + CELL / 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (let y = 0; y < H; y++) ctx.fillText(y + 1, AXIS + W * CELL + 3, AXIS + y * CELL + CELL / 2);

        const legTop = AXIS + H * CELL + AXIS + 4;
        ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
        sorted.forEach(([code, count], i) => {
            const c = palette.find(p => p.code === code); if (!c) return;
            const col = i % legendCols, row = Math.floor(i / legendCols);
            const lx = AXIS + col * legendItemW, ly = legTop + row * 26;
            ctx.fillStyle = c.hex;
            ctx.fillRect(lx, ly, 20, 20);
            ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.5;
            ctx.strokeRect(lx, ly, 20, 20);
            ctx.fillStyle = '#333'; ctx.textAlign = 'left';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(code, lx + 24, ly + 7);
            ctx.font = '10px sans-serif'; ctx.fillStyle = '#666';
            ctx.fillText(`(${count})`, lx + 24, ly + 18);
        });

        const a = document.createElement('a');
        a.download = `bead-pattern-${W}x${H}.png`;
        a.href = cvs.toDataURL('image/png');
        a.click();
    }

    /* ═══════════ Fullscreen / Compare ═══════════ */

    _toggleFullscreen() {
        const container = document.querySelector('.pattern-container');
        if (!container) return;
        const isFs = document.fullscreenElement || document.webkitFullscreenElement;
        if (isFs) {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            return;
        }
        if (container.classList.contains('fake-fullscreen')) {
            container.classList.remove('fake-fullscreen');
            const btn = document.getElementById('fullscreenBtn');
            if (btn) btn.textContent = '⛶';
            this._fitAndDraw();
            return;
        }
        const tryNative = container.requestFullscreen || container.webkitRequestFullscreen;
        if (tryNative) {
            const timer = setTimeout(() => {
                if (!document.fullscreenElement && !document.webkitFullscreenElement) this._fakeFull(container);
            }, 300);
            const p = tryNative.call(container);
            if (p && p.then) p.catch(() => { clearTimeout(timer); this._fakeFull(container); });
        } else {
            this._fakeFull(container);
        }
    }

    _fakeFull(container) {
        container.classList.add('fake-fullscreen');
        const btn = document.getElementById('fullscreenBtn');
        if (btn) btn.textContent = '✕';
        this._fitAndDraw();
    }

    _onFullscreenChange() {
        const isFs = document.fullscreenElement || document.webkitFullscreenElement;
        const btn = document.getElementById('fullscreenBtn');
        if (btn) btn.textContent = isFs ? '✕' : '⛶';
    }

    _toggleCompare() {
        const srcImage = this.croppedImage || this.image;
        if (!this.pattern || !srcImage) return;
        this._comparing = !this._comparing;
        const btn = document.getElementById('compareBtn');
        const container = document.querySelector('.pattern-container');
        if (!container) return;

        if (this._comparing) {
            if (btn) btn.textContent = '🔀 隐藏原图';
            let overlay = container.querySelector('.compare-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'compare-overlay';
                overlay.innerHTML = `<img src="${srcImage.src}" alt="原图">
          <div class="compare-slider-wrap">
            <label>透明度</label>
            <input type="range" min="0" max="100" value="55" id="compareAlpha">
          </div>`;
                container.appendChild(overlay);
                document.getElementById('compareAlpha')?.addEventListener('input', e => {
                    overlay.querySelector('img').style.opacity = e.target.value / 100;
                });
            }
            overlay.style.display = '';
        } else {
            if (btn) btn.textContent = '🔀 对比原图';
            const overlay = container.querySelector('.compare-overlay');
            if (overlay) overlay.style.display = 'none';
        }
    }

    /* ═══════════ PDF Export ═══════════ */

    _exportPDF() {
        if (!this.pattern) return;
        if (typeof window.jspdf === 'undefined') {
            alert('PDF 库加载中，请稍后再试');
            return;
        }
        const { jsPDF } = window.jspdf;
        const { grid, width: W, height: H, colorCounts, totalBeads } = this.pattern;
        const brand = document.getElementById('brandSelect')?.value || 'mard';
        const palette = BEAD_PALETTES[brand].colors;
        const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);

        const isWide = W > H;
        const doc = new jsPDF({ orientation: isWide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 10;

        doc.setFontSize(16);
        doc.text('拼豆图案', margin, margin + 6);
        doc.setFontSize(9);
        doc.text(`${W}×${H} | ${Object.keys(colorCounts).length}色 | ${totalBeads}珠 | ${BEAD_PALETTES[brand].name}`, margin, margin + 12);

        const cellPx = 12;
        const overviewCvs = document.createElement('canvas');
        overviewCvs.width = W * cellPx;
        overviewCvs.height = H * cellPx;
        const oCtx = overviewCvs.getContext('2d');
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const c = grid[y][x]; if (!c) continue;
                oCtx.fillStyle = c.hex;
                oCtx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
            }
        }
        oCtx.strokeStyle = 'rgba(0,0,0,0.15)';
        oCtx.lineWidth = 0.5;
        for (let x = 0; x <= W; x++) { oCtx.beginPath(); oCtx.moveTo(x * cellPx, 0); oCtx.lineTo(x * cellPx, H * cellPx); oCtx.stroke(); }
        for (let y = 0; y <= H; y++) { oCtx.beginPath(); oCtx.moveTo(0, y * cellPx); oCtx.lineTo(W * cellPx, y * cellPx); oCtx.stroke(); }

        const imgData = overviewCvs.toDataURL('image/png');
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2 - 18;
        const scale = Math.min(availW / (W * cellPx) * (72 / 25.4), availH / (H * cellPx) * (72 / 25.4), 1);
        const drawW = W * cellPx * scale * (25.4 / 72);
        const drawH = H * cellPx * scale * (25.4 / 72);
        doc.addImage(imgData, 'PNG', margin, margin + 18, drawW, drawH);

        const BOARD = 29;
        const boardCols = Math.ceil(W / BOARD);
        const boardRows = Math.ceil(H / BOARD);

        for (let br = 0; br < boardRows; br++) {
            for (let bc = 0; bc < boardCols; bc++) {
                doc.addPage();
                const startX = bc * BOARD, startY = br * BOARD;
                const endX = Math.min(startX + BOARD, W);
                const endY = Math.min(startY + BOARD, H);
                const bw = endX - startX, bh = endY - startY;

                doc.setFontSize(10);
                doc.text(`拼豆板 ${br * boardCols + bc + 1} / ${boardCols * boardRows}`, margin, margin + 4);
                doc.setFontSize(8);
                doc.text(`坐标: (${startX + 1},${startY + 1}) ~ (${endX},${endY})`, margin, margin + 9);

                const boardCellPx = 18, boardAxisPx = 24;
                const boardCvs = document.createElement('canvas');
                boardCvs.width = boardAxisPx + bw * boardCellPx;
                boardCvs.height = boardAxisPx + bh * boardCellPx;
                const bCtx = boardCvs.getContext('2d');
                bCtx.fillStyle = '#fff';
                bCtx.fillRect(0, 0, boardCvs.width, boardCvs.height);

                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        const c = grid[y][x]; if (!c) continue;
                        if (this.hideBg && this.bgCode && c.code === this.bgCode) continue;
                        const px = boardAxisPx + (x - startX) * boardCellPx;
                        const py = boardAxisPx + (y - startY) * boardCellPx;
                        bCtx.fillStyle = c.hex;
                        bCtx.fillRect(px, py, boardCellPx, boardCellPx);
                        const fs = Math.min(8, boardCellPx * 0.45);
                        bCtx.font = `bold ${fs}px sans-serif`;
                        bCtx.textAlign = 'center'; bCtx.textBaseline = 'middle';
                        const br2 = (c.rgb.r * 299 + c.rgb.g * 587 + c.rgb.b * 114) / 1000;
                        bCtx.fillStyle = br2 > 140 ? '#000' : '#FFF';
                        bCtx.fillText(c.code, px + boardCellPx / 2, py + boardCellPx / 2);
                    }
                }
                bCtx.strokeStyle = 'rgba(0,0,0,0.2)'; bCtx.lineWidth = 0.5;
                for (let x = 0; x <= bw; x++) {
                    bCtx.beginPath(); bCtx.moveTo(boardAxisPx + x * boardCellPx, boardAxisPx);
                    bCtx.lineTo(boardAxisPx + x * boardCellPx, boardAxisPx + bh * boardCellPx); bCtx.stroke();
                }
                for (let y = 0; y <= bh; y++) {
                    bCtx.beginPath(); bCtx.moveTo(boardAxisPx, boardAxisPx + y * boardCellPx);
                    bCtx.lineTo(boardAxisPx + bw * boardCellPx, boardAxisPx + y * boardCellPx); bCtx.stroke();
                }
                bCtx.fillStyle = '#555'; bCtx.font = '8px sans-serif';
                bCtx.textAlign = 'center'; bCtx.textBaseline = 'bottom';
                for (let x = 0; x < bw; x++) bCtx.fillText(startX + x + 1, boardAxisPx + x * boardCellPx + boardCellPx / 2, boardAxisPx - 2);
                bCtx.textAlign = 'right'; bCtx.textBaseline = 'middle';
                for (let y = 0; y < bh; y++) bCtx.fillText(startY + y + 1, boardAxisPx - 3, boardAxisPx + y * boardCellPx + boardCellPx / 2);
                bCtx.strokeStyle = '#333'; bCtx.lineWidth = 1;
                bCtx.strokeRect(boardAxisPx, boardAxisPx, bw * boardCellPx, bh * boardCellPx);

                const boardImgData = boardCvs.toDataURL('image/png');
                const bAvailW = pageW - margin * 2;
                const bAvailH = pageH - margin * 2 - 14;
                const bScale = Math.min(bAvailW / boardCvs.width * (72 / 25.4), bAvailH / boardCvs.height * (72 / 25.4), 1);
                doc.addImage(boardImgData, 'PNG', margin, margin + 14,
                    boardCvs.width * bScale * (25.4 / 72),
                    boardCvs.height * bScale * (25.4 / 72));
            }
        }

        doc.addPage();
        doc.setFontSize(14);
        doc.text('材料清单', margin, margin + 6);
        doc.setFontSize(9);
        doc.text(`品牌: ${BEAD_PALETTES[brand].name}  |  总珠数: ${totalBeads}`, margin, margin + 13);

        let listY = margin + 20;
        doc.setFontSize(8);
        sorted.forEach(([code, count]) => {
            const c = palette.find(p => p.code === code);
            if (!c) return;
            const rgb = this.converter.hexToRgb(c.hex);
            doc.setFillColor(rgb.r, rgb.g, rgb.b);
            doc.rect(margin, listY - 2.5, 4, 4, 'F');
            doc.setDrawColor(180, 180, 180);
            doc.rect(margin, listY - 2.5, 4, 4, 'S');
            doc.setTextColor(0, 0, 0);
            doc.text(`${code}  ${count}颗`, margin + 6, listY);
            listY += 5;
            if (listY > pageH - margin) {
                doc.addPage();
                listY = margin + 8;
            }
        });

        doc.save(`bead-pattern-${W}x${H}.pdf`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new BeadPatternApp();
});