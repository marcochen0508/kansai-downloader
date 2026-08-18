// 各平台專用精選下載工具（100% 實測可通、免登入、無次數限制為主）
const PLATFORMS_DATA = [
    {
        id: 'instagram',
        name: 'Instagram (IG)',
        icon: '📸',
        color: '#e1306c',
        tag: '熱門',
        desc: 'Reels 短影音・貼文多圖・限時動態',
        tools: [
            {
                name: 'FastDl (iGram)',
                tag: '🔥 免登入無限次',
                desc: '支援 IG 貼文多圖輪播相簿 (Carousel) 與 1080p 影片原檔提取，完全免登入',
                url: 'https://fastdl.app/'
            },
            {
                name: 'SSSInstagram',
                tag: '🔥 免登入無限次',
                desc: '免登入！直接貼上 IG 網址快速保存 Reels 短影音、貼文照片與限動',
                url: 'https://sssinstagram.com/'
            },
            {
                name: 'SaveFrom (IG 專區)',
                tag: '免登入經典',
                desc: '全球老牌影音下載工具，支援 Instagram 影片直接提取',
                url: 'https://zh.savefrom.net/'
            }
        ]
    },
    {
        id: 'youtube',
        name: 'YouTube',
        icon: '🔴',
        color: '#ff0000',
        tag: '高畫質/MP3',
        desc: 'Shorts 短片・1080p 影片・MP3 音訊',
        tools: [
            {
                name: 'VD6S (YouTube 繁中首選)',
                tag: '🔥 繁中推薦',
                desc: '支援 1080p、4K 影片與 MP3 下載，純繁體中文介面、極速且無煩人彈窗廣告',
                url: 'https://vd6s.net/zh-tw4/'
            },
            {
                name: 'Y2Mate (YouTube 備用)',
                tag: '免登入無限次',
                desc: '專門下載 YouTube 影片 (1080p/720p) 與 MP3 音樂轉換，無次數限制',
                url: 'https://y2mate.is/'
            },
            {
                name: 'OnlyMP3 (純音樂 MP3)',
                tag: '純音樂 320k',
                desc: '專門將 YouTube 影片一鍵轉換為 320kbps 高音質 MP3 音樂',
                url: 'https://en.onlymp3.to/'
            },
            {
                name: 'SaveFrom (YouTube 專區)',
                tag: '經典備用',
                desc: '經典 YouTube 影片快速保存工具，免登入直接下載',
                url: 'https://zh.savefrom.net/1-how-to-download-youtube-video.html'
            }
        ]
    },
    {
        id: 'tiktok',
        name: 'TikTok / 抖音',
        icon: '🎵',
        color: '#00f2fe',
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
        icon: '🧵',
        color: '#ffffff',
        tag: '熱門新社群',
        desc: '脆 Threads 影音貼文・多圖原檔下載',
        tools: [
            {
                name: 'ThreadsDownloader',
                tag: '🔥 免登入無限次',
                desc: '專為 Threads 打造，一鍵保存高清影片、圖片與音訊',
                url: 'https://threadsdownloader.io/'
            },
            {
                name: 'ThreadsPhotoDownloader',
                tag: '🔥 免登入無限次',
                desc: '支援下載 Threads 貼文內的所有高清原圖與多張照片',
                url: 'https://threadsphotodownloader.com/'
            }
        ]
    },
    {
        id: 'facebook',
        name: 'Facebook (FB)',
        icon: '🔵',
        color: '#1877f2',
        tag: '高畫質',
        desc: 'FB 影片・Reels 短影音・公開社團影音',
        tools: [
            {
                name: 'SnapSave',
                tag: '🔥 支援 1080p/4K',
                desc: 'Facebook 高清影片下載神器，支援 Full HD 與 4K 畫質，免登入',
                url: 'https://snapsave.app/'
            },
            {
                name: 'SaveFrom (FB 專區)',
                tag: '經典穩定',
                desc: '老牌 Facebook 公開影片與 Reels 下載工具',
                url: 'https://zh.savefrom.net/'
            }
        ]
    },
    {
        id: 'xiaohongshu',
        name: '小紅書 RED',
        icon: '📕',
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
        icon: '🖤',
        color: '#1da1f2',
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
        icon: '📺',
        color: '#00a1d6',
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

let activePlatformId = null;

// Initialize Platform Cards
function renderPlatforms(filterQuery = '') {
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
        const card = document.createElement('div');
        card.className = `platform-card ${activePlatformId === platform.id ? 'active' : ''}`;
        card.style.setProperty('--card-color', platform.color);
        card.id = `card-${platform.id}`;

        card.innerHTML = `
            <div class="platform-icon-wrap">${platform.icon}</div>
            <div class="platform-name">${platform.name}</div>
            <div class="platform-desc">${platform.desc}</div>
            <div class="card-badge">
                <span>選擇專用下載站</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
        `;

        card.addEventListener('click', (e) => {
            e.preventDefault();
            selectPlatform(platform);
        });

        platformGrid.appendChild(card);
    });
}

// Select and open panel for a platform
function selectPlatform(platform) {
    activePlatformId = platform.id;

    // Update active class on cards
    document.querySelectorAll('.platform-card').forEach(c => c.classList.remove('active'));
    const selectedCard = document.getElementById(`card-${platform.id}`);
    if (selectedCard) selectedCard.classList.add('active');

    // Populate panel data
    panelIcon.textContent = platform.icon;
    panelTitle.textContent = `${platform.name} 精選免登入站點`;
    panelDesc.textContent = `為您推薦目前線上實測 100% 可通、免登入的 ${platform.name} 專用下載工具：`;

    destinationGrid.innerHTML = '';
    platform.tools.forEach(tool => {
        const link = document.createElement('a');
        link.className = 'tool-link-card';
        link.href = tool.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        link.innerHTML = `
            <div class="tool-info">
                <h4>
                    ${tool.name}
                    ${tool.tag ? `<span class="tool-badge">${tool.tag}</span>` : ''}
                </h4>
                <p>${tool.desc}</p>
            </div>
            <div class="tool-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </div>
        `;

        destinationGrid.appendChild(link);
    });

    // Display panel and scroll into view smoothly
    destinationPanel.style.display = 'block';
    destinationPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Close Panel
if (closePanelBtn) {
    closePanelBtn.addEventListener('click', () => {
        destinationPanel.style.display = 'none';
        activePlatformId = null;
        document.querySelectorAll('.platform-card').forEach(c => c.classList.remove('active'));
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
