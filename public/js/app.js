document.addEventListener('DOMContentLoaded', () => {
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

    // Clean filename helper for downloading readable files
    function makeCleanFilename(title, qualityStr, ext) {
        let clean = (title || '社群影音')
            .replace(/TikTok video #\d+/gi, 'TikTok短影音')
            .replace(/video #\d+/gi, '短影音')
            .replace(/video by \w+/gi, '')
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
        return `/api/proxy-image?url=${encodeURIComponent(rawUrl)}`;
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
        } else if (val.includes('pinterest.com') || val.includes('pin.it')) {
            p = { icon: '📌', name: 'Pinterest' };
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

        try {
            const response = await fetch('/api/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: targetUrl })
            });

            const data = await response.json();
            loadingState.style.display = 'none';
            btnParse.disabled = false;

            if (!data.success) {
                showError(data.error || '解析失敗，請確認連結是否正確與公開。');
                return;
            }

            renderResult(data);
        } catch (err) {
            loadingState.style.display = 'none';
            btnParse.disabled = false;
            showError('後端連線異常，請確認伺服器是否正常執行中。');
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
                const dlProxyUrl = `/api/download?url=${encodeURIComponent(vid.url)}&filename=${encodeURIComponent(targetFilename)}&type=video&webpageUrl=${encodeURIComponent(vid.webpage_url || '')}&formatId=${encodeURIComponent(vid.format_id || '')}`;

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
                const dlProxyUrl = `/api/download?url=${encodeURIComponent(aud.url)}&filename=${encodeURIComponent(targetFilename)}&type=audio&webpageUrl=${encodeURIComponent(aud.webpage_url || '')}&formatId=${encodeURIComponent(aud.format_id || '')}`;

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
                    <a href="/api/download?url=${encodeURIComponent(imgUrl)}&filename=${encodeURIComponent(cleanName)}&type=image" download="${cleanName}" class="btn-dl" style="background-color: #ec4899;">
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
});
