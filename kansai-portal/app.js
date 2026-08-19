// 各平台專用精選下載工具（100% 實測可通、免登入、無次數限制為主）
const PLATFORMS_DATA = [
    {
        id: 'instagram',
        name: 'Instagram (IG)',
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <defs>
                <radialGradient id="igGrad" cx="30%" cy="107%" r="150%">
                    <stop offset="0%" stop-color="#fdf497" />
                    <stop offset="5%" stop-color="#fdf497" />
                    <stop offset="45%" stop-color="#fd5949" />
                    <stop offset="60%" stop-color="#d6249f" />
                    <stop offset="90%" stop-color="#285AEB" />
                </radialGradient>
            </defs>
            <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#igGrad)" />
            <rect x="5.5" y="5.5" width="13" height="13" rx="3.5" fill="none" stroke="#ffffff" stroke-width="1.8" />
            <circle cx="12" cy="12" r="3.2" fill="none" stroke="#ffffff" stroke-width="1.8" />
            <circle cx="15.8" cy="8.2" r="0.9" fill="#ffffff" />
        </svg>`,
        color: '#e1306c',
        tag: '熱門',
        desc: 'Reels 短影音・貼文多圖・限時動態',
        tools: [
            {
                name: 'SaveClip (IG 繁中首選)',
                tag: '🔥 繁中低廣告・推薦',
                desc: '支援 IG Reels 短影音、貼文多圖輪播相簿與限動下載，介面清爽無彈窗',
                url: 'https://saveclip.app/zh-tw8'
            },
            {
                name: 'FastDl (iGram 備用)',
                tag: '免登入備用',
                desc: '支援 IG 貼文多圖輪播相簿 (Carousel) 與 1080p 影片原檔提取',
                url: 'https://fastdl.app/'
            }
        ]
    },
    {
        id: 'youtube',
        name: 'YouTube',
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
            <polygon points="9.545,15.568 15.818,12 9.545,8.432" fill="#FFFFFF"/>
        </svg>`,
        color: '#ff0000',
        tag: '高畫質/MP3',
        desc: 'Shorts 短片・1080p 影片・MP3 音訊',
        tools: [
            {
                name: 'VD6S (YouTube 繁中首選)',
                tag: '🔥 繁中高清・推薦',
                desc: '支援 1080p、4K 高畫質影片與 MP3 下載，純繁體中文介面、極速且無煩人彈窗廣告',
                url: 'https://vd6s.net/zh-tw4/'
            },
            {
                name: 'OnlyMP3 (純音樂 MP3 備用)',
                tag: '純音樂 320k',
                desc: '專門將 YouTube 影片一鍵轉換為 320kbps 高音質 MP3 音樂',
                url: 'https://en.onlymp3.to/'
            }
        ]
    },
    {
        id: 'tiktok',
        name: 'TikTok / 抖音',
        icon: `<svg width="26" height="26" viewBox="0 0 24 24" fill="#000000">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 2.89 3.5 2.76 1.29-.03 2.45-.8 2.93-1.99.27-.6.36-1.27.35-1.93l.05-17.86z"/>
        </svg>`,
        color: '#fe2c55',
        tag: '無浮水印',
        desc: '抖音／TikTok 高清無水印影片・BGM 提取',
        tools: [
            {
                name: 'SnapTik',
                tag: '🔥 免登入無限次',
                desc: '全球最受歡迎 TikTok 無浮水印高清影片下載工具，免登入無限制',
                url: 'https://snaptik.app/'
            },
            {
                name: 'SSSTik',
                tag: '🔥 免登入無限次',
                desc: '免費下載 TikTok 影片及單獨提取熱門背景音樂 MP3',
                url: 'https://ssstik.io/'
            }
        ]
    },
    {
        id: 'threads',
        name: 'Threads',
        icon: `<svg width="26" height="26" viewBox="0 0 192 192" fill="#000000">
            <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.481 72.7303C80.8933 64.5126 89.2892 61.127 97.222 61.127C97.3005 61.127 97.379 61.127 97.4574 61.127C107.562 61.1914 117.864 67.2497 122.581 81.3323C114.778 80.0898 106.326 79.7997 97.222 80.4705C66.8624 82.7099 49.208 99.4144 50.8407 121.654C52.4172 143.125 70.8943 154.269 92.1793 154.269C110.74 154.269 123.864 145.459 131.066 137.382C136.079 146.467 144.137 151.785 156.402 151.785C168.04 151.785 178.694 144.606 182.261 130.825L166.425 126.721C164.887 132.662 160.771 135.405 156.402 135.405C148.653 135.405 144.156 128.528 144.156 116.891V114.869C137.493 118.847 129.589 121.737 120.378 123.277C118.431 129.549 113.882 134.409 107.039 136.634C102.138 138.227 96.8687 138.077 92.1793 138.077C78.072 138.077 67.4338 130.686 66.8406 122.585C66.2474 114.484 73.9781 97.9042 98.4116 96.103C105.897 95.5518 113.111 95.8931 119.866 97.0505C121.365 106.183 125.132 113.376 130.569 118.064C130.935 108.109 127.346 99.4042 121.657 93.3079C128.093 91.0776 134.919 90.0766 141.537 88.9883ZM103.885 113.109C97.1082 113.608 90.697 114.502 85.3409 116.636C82.8809 117.616 81.3857 119.206 81.5647 121.642C81.8219 125.143 85.6791 127.604 92.1793 127.604C94.4984 127.604 96.7975 127.319 98.9823 126.61C102.392 125.503 104.708 123.018 105.748 119.689C104.996 117.382 104.351 115.158 103.885 113.109Z"/>
        </svg>`,
        color: '#0f172a',
        tag: '熱門新社群',
        desc: '脆 Threads 影音貼文・多圖原檔下載',
        tools: [
            {
                name: 'Throk AI (Threads 無廣告首選)',
                tag: '✨ 極簡清爽・無廣告',
                desc: '超乾淨無干擾介面，一鍵提取 Threads 高畫質影片與相片原檔',
                url: 'https://www.throk.ai/tools/threads-downloader'
            },
            {
                name: 'ThreadsDownloader (備用)',
                tag: '免登入備用',
                desc: '專為 Threads 打造，一鍵保存高清影片、圖片與音訊',
                url: 'https://threadsdownloader.io/'
            }
        ]
    },
    {
        id: 'facebook',
        name: 'Facebook (FB)',
        icon: `<svg width="26" height="26" viewBox="0 0 24 24" fill="#1877F2">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>`,
        color: '#1877f2',
        tag: '高畫質',
        desc: 'FB 影片・Reels 短影音・公開社團影音',
        tools: [
            {
                name: 'FDownloader (FB 繁中高清首選)',
                tag: '🔥 繁中高清・推薦',
                desc: '支援 1080p/2K/4K 原畫質影片與 FB Reels，繁體中文介面、下載速度快',
                url: 'https://fdownloader.net/zh-tw'
            },
            {
                name: 'SnapSave (備用)',
                tag: '高清備用',
                desc: 'Facebook 高清影片下載神器，支援 Full HD 與 4K 畫質，免登入',
                url: 'https://snapsave.app/'
            }
        ]
    },
    {
        id: 'xiaohongshu',
        name: '小紅書 RED',
        icon: `<svg width="28" height="28" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="22" fill="#FF2442"/>
            <text x="50" y="65" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="36" fill="#ffffff" text-anchor="middle" letter-spacing="-1">RED</text>
        </svg>`,
        color: '#ff2442',
        tag: '旅遊攻略必備',
        desc: '小紅書無水印筆記・高清原圖・旅遊攻略影片',
        tools: [
            {
                name: 'SnapAny (小紅書去水印)',
                tag: '🔥 去水印首選',
                desc: '完美去除小紅書浮水印，支援多圖筆記打包與影片下載',
                url: 'https://snapany.com/zh-Hant'
            }
        ]
    },
    {
        id: 'twitter',
        name: 'X (Twitter)',
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#000000">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>`,
        color: '#0f172a',
        tag: '極速下載',
        desc: '推特推文影片・GIF 動圖・高清原檔',
        tools: [
            {
                name: 'TwDown',
                tag: '🔥 免登入無限次',
                desc: '支援多種解析度 MP4 下載與 MP3 音訊轉換',
                url: 'https://twdown.net/'
            },
            {
                name: 'SSSTwitter',
                tag: '🔥 免登入無限次',
                desc: '快速解析 X (Twitter) 推文內的所有高畫質 MP4 與 GIF',
                url: 'https://ssstwitter.com/'
            }
        ]
    },
    {
        id: 'bilibili',
        name: 'Bilibili 嗶哩嗶哩',
        icon: `<svg width="26" height="26" viewBox="0 0 24 24" fill="#00A1D6">
            <path d="M18.8 3.5l2.2-2.2a1 1 0 0 0-1.4-1.4l-2.7 2.7H7.1L4.4.1A1 1 0 0 0 3 1.5l2.2 2.2C2.3 4.2 0 6.8 0 10v9a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5v-9c0-3.2-2.3-5.8-5.2-6.5zM8 15a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
        </svg>`,
        color: '#0284c7',
        tag: 'B站專用',
        desc: 'B站高畫質影片・彈幕音訊提取',
        tools: [
            {
                name: 'SaveFrom (B站專區)',
                tag: '免登入解析',
                desc: '支援 Bilibili 公開影片高畫質解析下載',
                url: 'https://zh.savefrom.net/'
            },
            {
                name: 'SnapAny (B站備用)',
                tag: '多畫質',
                desc: '支援 B站影片音訊提取',
                url: 'https://snapany.com/zh-Hant'
            }
        ]
    }
];

// DOM Elements
const platformGrid = document.getElementById('platformGrid');
const destinationPanel = document.getElementById('destinationPanel');
const destinationGrid = document.getElementById('destinationGrid');
const panelTitle = document.getElementById('panelTitle');
const panelDesc = document.getElementById('panelDesc');
const panelIcon = document.getElementById('panelIcon');
const closePanelBtn = document.getElementById('closePanelBtn');
const platformSearch = document.getElementById('platformSearch');

// Initialize Platform Cards with Direct Linking
function renderPlatforms(filterQuery = '') {
    if (!platformGrid) return;
    platformGrid.innerHTML = '';
    const filtered = PLATFORMS_DATA.filter(p => {
        if (!filterQuery) return true;
        const q = filterQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || 
               p.desc.toLowerCase().includes(q) || 
               p.id.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
        platformGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
                🔍 沒有找到符合「${filterQuery}」的平台，請嘗試搜尋 IG、YouTube 或 TikTok 等關鍵字。
            </div>
        `;
        return;
    }

    filtered.forEach(platform => {
        const primaryTool = platform.tools[0];
        const backupTools = platform.tools.slice(1);
        const shortPrimaryName = primaryTool.name.replace(/ \(.*?\)/, '');

        const card = document.createElement('a');
        card.className = 'platform-card';
        card.style.setProperty('--card-color', platform.color);
        card.id = `card-${platform.id}`;
        card.href = primaryTool.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.title = `點擊直接開啟 ${primaryTool.name}`;

        card.innerHTML = `
            <div class="card-header-row">
                <div class="platform-icon-wrap">${platform.icon}</div>
                <span class="direct-pill">⚡ 一鍵直達</span>
            </div>
            <div class="platform-name">${platform.name}</div>
            <div class="platform-desc">${platform.desc}</div>
            <div class="card-primary-action">
                <span class="action-btn-text">前往 ${shortPrimaryName} 下載</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </div>
            ${backupTools.length > 0 ? `
            <div class="backup-tools-row">
                <span class="backup-label">備用：</span>
                ${backupTools.map(bt => `
                    <button type="button" class="backup-chip" data-url="${bt.url}" title="${bt.desc}">
                        ${bt.name.replace(/ \(.*?\)/, '')} ↗
                    </button>
                `).join('')}
            </div>
            ` : ''}
        `;

        // Handle backup chip clicks independently
        card.querySelectorAll('.backup-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(chip.dataset.url, '_blank', 'noopener,noreferrer');
            });
        });

        platformGrid.appendChild(card);
    });
}

// Search input listener
if (platformSearch) {
    platformSearch.addEventListener('input', (e) => {
        renderPlatforms(e.target.value.trim());
    });
}

// Initial Render
renderPlatforms();

// ==========================================
// PWA Service Worker & Add to Home Screen
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('SW registration error:', err);
        });
    });
}

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
        if (pwaIosGuide) pwaIosGuide.style.display = 'block';
        if (pwaAndroidGuide) pwaAndroidGuide.style.display = 'none';
        if (btnPwaInstall) {
            btnPwaInstall.innerHTML = '我知道了';
            btnPwaInstall.onclick = hidePwaModal;
        }
    } else {
        // Android / Desktop Chrome / Edge layout: Trigger native prompt
        if (pwaIosGuide) pwaIosGuide.style.display = 'none';
        if (pwaAndroidGuide) pwaAndroidGuide.style.display = 'block';
        if (btnPwaInstall) {
            btnPwaInstall.innerHTML = '立即新增到桌面';
            btnPwaInstall.onclick = async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        localStorage.setItem('pwa_prompt_dismissed', 'true');
                        if (btnHeaderInstall) btnHeaderInstall.style.display = 'none';
                    }
                    deferredPrompt = null;
                }
                hidePwaModal();
            };
        }
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
