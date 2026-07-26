/**
 * 功能点击追踪脚本（pindou.top）
 *
 * 把用户关键操作上报到后端 /api/track/click：
 * - 自动监听带 data-track 属性的元素点击
 * - 绑定核心按钮：生成图案、导出 PNG/PDF、图库、对比、裁剪、像素还原、小红书导入、上传图片
 * - 记录页面访问
 * - 本地队列串行发送，失败静默；登录用户附带 Token
 * - 暴露 window.pdTrack 供手动埋点
 */
/**
 * 功能点击追踪 — pindou.top
 * 自动追踪带 data-track 属性的元素 + 核心操作
 */
(function () {
    const API = 'https://api.pindou.top';
    const PAGE = location.pathname.replace(/\/$/, '') || '/';
    const _q = [];          // offline queue
    let _sending = false;

    function send(feature) {
        if (!feature) return;
        _q.push(feature);
        _flush();
    }

    function _flush() {
        if (_sending || !_q.length) return;
        _sending = true;
        const feature = _q.shift();
        const body = JSON.stringify({ feature: feature, page: PAGE });
        const hdrs = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('pindou_token');
        if (token) hdrs['Authorization'] = 'Bearer ' + token;

        fetch(API + '/api/track/click', { method: 'POST', headers: hdrs, body: body })
            .catch(function () { })
            .finally(function () { _sending = false; _flush(); });
    }

    // 1) Auto-track elements with data-track="featureName"
    document.addEventListener('click', function (e) {
        var el = e.target.closest('[data-track]');
        if (el) send(el.getAttribute('data-track'));
    }, true);

    // 2) Track core app operations by hooking known buttons
    document.addEventListener('DOMContentLoaded', function () {
        var hooks = {
            'convertBtn': '转换图案',
            'exportBtn': '导出PNG',
            'exportPdfBtn': '导出PDF',
            'galleryBtn': '打开模板库',
            'compareBtn': '对比模式',
            'cropToggle': '裁剪',
            'restoreBtn': '像素修复',
            'xhsImportBtn': '小红书导入'
        };
        Object.keys(hooks).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('click', function () { send(hooks[id]); }, true);
        });

        // Track file upload
        var dropZone = document.getElementById('dropZone');
        if (dropZone) dropZone.addEventListener('click', function () { send('上传图片'); }, true);
        var fi = document.getElementById('fileInput');
        if (fi) fi.addEventListener('change', function () { if (fi.files.length) send('选择图片'); }, true);

        // Track page visit
        send('页面访问');
    });

    // Expose for manual tracking
    window.pdTrack = send;
})();
