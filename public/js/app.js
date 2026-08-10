document.addEventListener('DOMContentLoaded', () => {
    // Detect In-App Browsers (LINE / FB / IG) on iOS
    function checkInAppBrowser() {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isInApp = /Line|FB_IAB|FBAN|FBAV|Instagram|MicroMessenger|Twitter/i.test(ua);

        if (isIOS && isInApp) {
            const banner = document.getElementById('iabWarningBanner');
            if (banner) {
                banner.style.display = 'flex';
            }
        }
    }
    checkInAppBrowser();

    const urlInput = document.getElementById('urlInput');
    const btnPaste = document.getElementById('btnPaste');
    const btnParse = document.getElementById('btnParse');
    
    const detectedBadge = document.getElementById('detectedBadge');
    const detectedIcon = document.getElementById('detectedIcon');
    const detectedName = document.getElementById('detectedName');
    
    const loadingState = document.getElementById('loadingState');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    
    const resultCard = document.getElementById('resultCard');
    const resPlatformIcon = document.getElementById('resPlatformIcon');
    const resPlatformName = document.getElementById('resPlatformName');
    const resTitle = document.getElementById('resTitle');
    const resAuthorName = document.getElementById('resAuthorName');
    const originalLink = document.getElementById('originalLink');
    
    const captionBox = document.getElementById('captionBox');
    const captionText = document.getElementById('captionText');
    const charCount = document.getElementById('charCount');
    const btnCopyText = document.getElementById('btnCopyText');
    
    const videoOptionGroup = document.getElementById('videoOptionGroup');
    const videoList = document.getElementById('videoList');
    const audioOptionGroup = document.getElementById('audioOptionGroup');
    const audioList = document.getElementById('audioList');
    const imageOptionGroup = document.getElementById('imageOptionGroup');
    const imageList = document.getElementById('imageList');
    
    const toast = document.getElementById('toast');

    // Safe URI Component Encoder (prevents URIError: URI malformed on invalid/unpaired Unicode surrogates)
    function safeEncode(str) {
        if (!str) return '';
        try {
            const cleanStr = String(str).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '');
            return encodeURIComponent(cleanStr);
        } catch (e) {
            return encodeURIComponent(String(str).replace(/[^\x00-\x7F]/g, ''));
        }
    }

    // Clean filename helper for downloading readable files
    function makeCleanFilename(title, qualityStr, ext) {
        let clean = (title || '社群影音')
            .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '')
            .replace(/TikTok video #\d+/gi, 'TikTok短影音')
            .replace(/video #\d+/gi, '短影音')
            .replace(/video by \w+/gi, '')
            .replace(/[\u201C\u201D\u2018\u2019\u00AB\u00BB\u300C\u300D]/g, '')  // Unicode quotes
            .replace(/[\\/:*?"<>|#]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .trim();
            
        let cleanQuality = (qualityStr || '')
            .replace(/\(.*\)/g, '')
            .replace(/🎬|🎵|🖼️/g, '')
            .trim();

        if (clean.length > 30) {
            clean = clean.substring(0, 30);
        }
        return `${clean}_${cleanQuality}.${ext}`.replace(/__+/g, '_');
    }

    // Proxy image helper to bypass referrer/hotlink protection
    function getProxyImageUrl(rawUrl) {
        if (!rawUrl) return '';
        return `/api/proxy-image?url=${safeEncode(rawUrl)}`;
    }

    // Real-time Platform Detector
    function detectPlatformClient(url) {
        const val = url.toLowerCase().trim();
        if (!val) {
            detectedBadge.style.display = 'none';
            return;
        }

        let p = { icon: '🌐', name: '一般社群網址' };
        if (val.includes('youtube.com') || val.includes('youtu.be')) {
            p = { icon: '🔴', name: 'YouTube' };
        } else if (val.includes('instagram.com') || val.includes('instagr.am')) {
            p = { icon: '📸', name: 'Instagram' };
        } else if (val.includes('facebook.com') || val.includes('fb.watch') || val.includes('fb.com')) {
            p = { icon: '🔵', name: 'Facebook' };
        } else if (val.includes('tiktok.com') || val.includes('douyin.com')) {
            p = { icon: '🎵', name: 'TikTok / 抖音' };
        } else if (val.includes('threads.net') || val.includes('threads.com')) {
            p = { icon: '🧵', name: 'Threads' };
        } else if (val.includes('twitter.com') || val.includes('x.com')) {
            p = { icon: '🖤', name: 'X (Twitter)' };
        } else if (val.includes('xiaohongshu.com') || val.includes('xhslink.com')) {
            p = { icon: '📕', name: '小紅書 RED' };
        } else if (val.includes('bilibili.com') || val.includes('b23.tv')) {
            p = { icon: '📺', name: 'Bilibili' };
        } else if (val.includes('t.me/') || val.includes('telegram.me')) {
            p = { icon: '✈️', name: 'Telegram' };
        }

        detectedIcon.textContent = p.icon;
        detectedName.textContent = p.name;
        detectedBadge.style.display = 'inline-flex';
    }

    urlInput.addEventListener('input', (e) => {
        detectPlatformClient(e.target.value);
    });

    // Paste Clipboard Handler
    btnPaste.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                detectPlatformClient(urlInput.value);
                showToast('已從剪貼簿貼上網址！');
            }
        } catch (err) {
            showToast('請手動右鍵貼上網址。');
        }
    });

    // Parse Click Handler
    btnParse.addEventListener('click', startParse);
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startParse();
    });

    async function startParse() {
        const targetUrl = urlInput.value.trim();
        if (!targetUrl) {
            showError('請先輸入或貼上有效的影音或貼文網址！');
            return;
        }

        // Reset UI
        errorAlert.style.display = 'none';
        resultCard.style.display = 'none';
        loadingState.style.display = 'flex';
        btnParse.disabled = true;

        let data;
        try {
            const response = await fetch('/api/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: targetUrl })
            });

            try {
                data = await response.json();
            } catch (jsonErr) {
                loadingState.style.display = 'none';
                btnParse.disabled = false;
                showError(`伺服器回應格式異常 (HTTP ${response.status})，請重新整理頁面再試。`);
                return;
            }

            loadingState.style.display = 'none';
            btnParse.disabled = false;

            if (!response.ok || !data.success) {
                showError(data.error || `解析失敗 (HTTP ${response.status})，請確認連結是否正確與公開。`);
                return;
            }
        } catch (err) {
            loadingState.style.display = 'none';
            btnParse.disabled = false;
            showError(`後端連線異常 (${err.message || '無法連線伺服器'})，伺服器可能正在重啟，請稍候 10 秒後再試一次！`);
            return;
        }

        // Safely render result outside fetch error catch block
        try {
            renderResult(data);
        } catch (renderErr) {
            console.error('Render error:', renderErr);
            showError(`頁面顯示處理異常: ${renderErr.message}`);
        }
    }

    function renderResult(data) {
        // Platform & Title Info
        resPlatformIcon.textContent = data.platform.icon || '🌐';
        resPlatformName.textContent = data.platform.name || '社群平台';
        resTitle.textContent = data.title || '社群內容';
        resAuthorName.textContent = data.uploader || '社群創作者';
        originalLink.href = data.webpage_url || '#';

        // Caption Text Section
        const caption = data.description ? data.description.trim() : '';
        if (caption) {
            captionBox.style.display = 'flex';
            captionText.textContent = caption;
            charCount.textContent = `(${caption.length} 字)`;
        } else {
            captionBox.style.display = 'none';
        }

        // Copy Text Button
        btnCopyText.onclick = () => {
            if (caption) {
                navigator.clipboard.writeText(caption);
                showToast('已成功將內文複製到剪貼簿！');
            }
        };

        // Render Media List with Inline Visual Thumbnail Previews via Proxy
        videoList.innerHTML = '';
        audioList.innerHTML = '';
        imageList.innerHTML = '';

        const posterUrl = data.thumbnail || (data.images && data.images.length > 0 ? data.images[0] : '');
        const proxiedPosterUrl = getProxyImageUrl(posterUrl);

        // Video List
        if (data.videos && data.videos.length > 0) {
            videoOptionGroup.style.display = 'flex';
            data.videos.forEach((vid, index) => {
                const item = document.createElement('div');
                item.className = 'download-item media-preview-item';
                
                const targetFilename = makeCleanFilename(data.title, vid.quality, vid.ext);
                const dlProxyUrl = `/api/download?url=${safeEncode(vid.url)}&filename=${safeEncode(targetFilename)}&type=video&webpageUrl=${safeEncode(vid.webpage_url || '')}&formatId=${safeEncode(vid.format_id || '')}`;

                const itemVidThumb = vid.thumbnail || data.thumbnail || '';
                const proxiedVidThumb = getProxyImageUrl(itemVidThumb);

                item.innerHTML = `
                    <div class="item-media-left">
                        ${proxiedVidThumb ? `<img src="${proxiedVidThumb}" class="item-thumb" alt="影片預覽">` : `<div class="item-thumb-placeholder"><i class="fa-solid fa-film"></i></div>`}
                        <div class="item-info">
                            <span class="badge-quality">🎬 ${vid.quality}</span>
                            <span class="item-name">${vid.ext.toUpperCase()} 影片 ${vid.size ? '(' + vid.size + ')' : ''}</span>
                        </div>
                    </div>
                    <a href="${dlProxyUrl}" download="${targetFilename}" class="btn-dl">
                        <i class="fa-solid fa-download"></i> 下載影片
                    </a>
                `;
                videoList.appendChild(item);
            });
        } else {
            videoOptionGroup.style.display = 'none';
        }

        // Audio List
        if (data.audios && data.audios.length > 0) {
            audioOptionGroup.style.display = 'flex';
            data.audios.forEach((aud, index) => {
                const item = document.createElement('div');
                item.className = 'download-item media-preview-item';
                
                const targetFilename = makeCleanFilename(data.title, aud.quality, aud.ext);
                const dlProxyUrl = `/api/download?url=${safeEncode(aud.url)}&filename=${safeEncode(targetFilename)}&type=audio&webpageUrl=${safeEncode(aud.webpage_url || '')}&formatId=${safeEncode(aud.format_id || '')}`;

                item.innerHTML = `
                    <div class="item-media-left">
                        ${proxiedPosterUrl ? `<img src="${proxiedPosterUrl}" class="item-thumb" alt="音檔預覽">` : `<div class="item-thumb-placeholder"><i class="fa-solid fa-music"></i></div>`}
                        <div class="item-info">
                            <span class="badge-audio">🎵 ${aud.quality}</span>
                            <span class="item-name">${aud.ext.toUpperCase()} 音訊檔 ${aud.size ? '(' + aud.size + ')' : ''}</span>
                        </div>
                    </div>
                    <a href="${dlProxyUrl}" download="${targetFilename}" class="btn-dl" style="background-color: #8b5cf6;">
                        <i class="fa-solid fa-music"></i> 提取 MP3
                    </a>
                `;
                audioList.appendChild(item);
            });
        } else {
            audioOptionGroup.style.display = 'none';
        }

        // Image List (With proxied visual photo thumbnail preview right next to each photo's download button!)
        if (data.images && data.images.length > 0) {
            imageOptionGroup.style.display = 'flex';
            data.images.forEach((imgUrl, index) => {
                const item = document.createElement('div');
                item.className = 'download-item media-preview-item';
                
                let labelText = `照片 ${index + 1}`;
                if (data.videos && data.videos.length > 0 && data.images.length === 1) {
                    labelText = "影片首圖 (高清照片)";
                } else {
                    labelText = `照片 ${index + 1} (高清原圖)`;
                }

                const cleanName = makeCleanFilename(data.title, labelText, "jpg");
                const proxiedImgUrl = getProxyImageUrl(imgUrl);

                item.innerHTML = `
                    <div class="item-media-left">
                        <img src="${proxiedImgUrl}" class="item-thumb" alt="${labelText}">
                        <div class="item-info">
                            <span class="badge-quality" style="background-color: #ec4899;">🖼️ ${labelText}</span>
                            <span class="item-name">高清 JPEG 圖片</span>
                        </div>
                    </div>
                    <a href="/api/download?url=${safeEncode(imgUrl)}&filename=${safeEncode(cleanName)}&type=image" download="${cleanName}" class="btn-dl" style="background-color: #ec4899;">
                        <i class="fa-solid fa-file-image"></i> 下載照片
                    </a>
                `;
                imageList.appendChild(item);
            });
        } else {
            imageOptionGroup.style.display = 'none';
        }

        resultCard.style.display = 'flex';
        resultCard.scrollIntoView({ behavior: 'smooth' });
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorAlert.style.display = 'flex';
    }

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // PWA Add to Home Screen Prompt Handler
    let deferredPrompt = null;

    const pwaModalOverlay = document.getElementById('pwaModalOverlay');
    const btnPwaClose = document.getElementById('btnPwaClose');
    const btnPwaInstall = document.getElementById('btnPwaInstall');
    const btnPwaDismiss = document.getElementById('btnPwaDismiss');
    const pwaIosGuide = document.getElementById('pwaIosGuide');
    const pwaAndroidGuide = document.getElementById('pwaAndroidGuide');
    const btnHeaderInstall = document.getElementById('btnHeaderInstall');

    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    const userAgentStr = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgentStr) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    function showPwaModal() {
        if (!pwaModalOverlay) return;

        if (isIOS) {
            // iOS Safari layout: Step-by-step guidance
            pwaIosGuide.style.display = 'block';
            pwaAndroidGuide.style.display = 'none';
            btnPwaInstall.innerHTML = '<i class="fa-solid fa-check"></i> 我知道了';
            btnPwaInstall.onclick = hidePwaModal;
        } else {
            // Android / Desktop layout: Direct trigger native prompt
            pwaIosGuide.style.display = 'none';
            pwaAndroidGuide.style.display = 'block';
            btnPwaInstall.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> 立即新增到桌面';
            btnPwaInstall.onclick = async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        localStorage.setItem('pwa_prompt_dismissed', 'true');
                    }
                    deferredPrompt = null;
                }
                hidePwaModal();
            };
        }

        pwaModalOverlay.style.display = 'flex';
    }

    function hidePwaModal() {
        if (pwaModalOverlay) {
            pwaModalOverlay.style.display = 'none';
        }
        localStorage.setItem('pwa_prompt_dismissed', 'true');
    }

    if (btnPwaClose) btnPwaClose.addEventListener('click', hidePwaModal);
    if (btnPwaDismiss) btnPwaDismiss.addEventListener('click', hidePwaModal);
    if (pwaModalOverlay) {
        pwaModalOverlay.addEventListener('click', (e) => {
            if (e.target === pwaModalOverlay) hidePwaModal();
        });
    }

    if (btnHeaderInstall) {
        btnHeaderInstall.addEventListener('click', () => {
            showPwaModal();
        });
    }

    // Handle Chrome/Android beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        if (btnHeaderInstall) btnHeaderInstall.style.display = 'inline-flex';

        // Auto prompt on first visit if not dismissed and not running in standalone mode
        if (!isStandalone && !localStorage.getItem('pwa_prompt_dismissed')) {
            setTimeout(showPwaModal, 1200);
        }
    });

    // Handle iOS Safari first visit auto prompt
    if (isIOS && !isStandalone) {
        if (btnHeaderInstall) btnHeaderInstall.style.display = 'inline-flex';

        if (!localStorage.getItem('pwa_prompt_dismissed')) {
            setTimeout(showPwaModal, 1200);
        }
    }
});

