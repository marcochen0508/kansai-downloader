const vm = require('vm');

async function getSnapSaveData(targetUrl) {
    try {
        const response = await fetch('https://snapsave.app/action.php', {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Origin': 'https://snapsave.app',
                'Referer': 'https://snapsave.app/',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: new URLSearchParams({ url: targetUrl })
        });

        const rawHtml = await response.text();
        
        let innerHTMLResult = '';
        const mockElement = new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'classList') return { add: () => {}, remove: () => {}, contains: () => false };
                if (prop === 'style') return {};
                if (prop === 'remove' || prop === 'setAttribute' || prop === 'appendChild' || prop === 'addEventListener') return () => {};
                return () => mockElement;
            },
            set: (target, prop, val) => {
                if (prop === 'innerHTML') innerHTMLResult = val;
                return true;
            }
        });

        const sandbox = {
            evalResult: '',
            window: { location: { hostname: 'snapsave.app' } },
            document: {
                getElementById: () => mockElement,
                querySelector: () => mockElement,
                querySelectorAll: () => [mockElement]
            },
            gtag: () => {},
            getPosition: () => ({ x: 0, y: 0 }),
            animate: () => {},
            Math: Math,
            Date: Date
        };
        sandbox.window.location = sandbox.window.location;

        vm.createContext(sandbox);
        
        let scriptToRun = rawHtml;
        if (scriptToRun.startsWith('eval(')) {
            scriptToRun = scriptToRun.replace(/^eval\((.*)\);?$/s, 'evalResult = $1;');
        } else {
            scriptToRun = scriptToRun.replace(/eval\s*\(/g, 'evalResult = (');
        }

        vm.runInContext(scriptToRun, sandbox);

        const rawResult = innerHTMLResult || sandbox.evalResult || '';
        const htmlResult = rawResult.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');

        const videoLinks = [];
        
        // 1. Extract from table rows
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(htmlResult)) !== null) {
            const rowHtml = rowMatch[1];
            const hrefMatch = rowHtml.match(/href="([^"]+)"/i);
            const qualityMatch = rowHtml.match(/class="video-quality"[^>]*>([^<]+)</i);
            
            if (hrefMatch) {
                const u = hrefMatch[1].replace(/&amp;/g, '&');
                const qText = qualityMatch ? qualityMatch[1].trim() : 'HD';
                if ((u.includes('rapidcdn') || u.includes('.mp4') || u.includes('fbcdn')) && !u.startsWith('/')) {
                    videoLinks.push({
                        url: u,
                        quality: qText.includes('1080') || qText.includes('HD') ? `1080p Full HD 高畫質 (MP4)` : `${qText} 標清 (MP4)`
                    });
                }
            }
        }

        // 2. Fallback: match any anchor tag with href containing download link
        if (videoLinks.length === 0) {
            const aRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
            let aMatch;
            while ((aMatch = aRegex.exec(htmlResult)) !== null) {
                const u = aMatch[1].replace(/&amp;/g, '&');
                const label = aMatch[2].replace(/<[^>]+>/g, '').trim();
                if ((u.includes('rapidcdn') || u.includes('.mp4') || u.includes('fbcdn')) && !u.startsWith('/')) {
                    videoLinks.push({
                        url: u,
                        quality: label || '高畫質影片 (MP4)'
                    });
                }
            }
        }

        const thumbMatch = htmlResult.match(/<img [^>]*src="([^"]+)"/i);
        const thumbnail = thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&') : '';

        const titleMatch = htmlResult.match(/<strong>([^<]+)<\/strong>/i);
        let title = titleMatch ? titleMatch[1].trim() : 'Facebook 短影音 / Reel';
        if (title.toLowerCase() === 'video facebook') {
            title = 'Facebook 短影音 / Reel';
        }

        return {
            success: videoLinks.length > 0,
            title,
            thumbnail,
            videos: videoLinks
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function scrapeFacebook(shareUrl) {
    if (!shareUrl) {
        console.log(JSON.stringify({ success: false, error: 'No URL provided' }));
        return;
    }

    // 1. Try initial URL directly
    let res = await getSnapSaveData(shareUrl);
    if (res.success && res.videos && res.videos.length > 0) {
        console.log(JSON.stringify(res));
        return;
    }

    // 2. If initial URL fails or is a share link (/share/r/, /share/v/, /share/p/), resolve the redirect
    try {
        const headRes = await fetch(shareUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept-Language': 'zh-TW,zh;q=0.9'
            },
            redirect: 'follow'
        });
        const finalUrl = headRes.url;
        
        // Extract fbid or v parameter
        let fbid = null;
        const mFbid = finalUrl.match(/story_fbid=(\d+)/) || finalUrl.match(/[\?&]v=(\d+)/) || finalUrl.match(/\/reel\/(\d+)/) || finalUrl.match(/\/videos\/(\d+)/);
        if (mFbid) {
            fbid = mFbid[1];
        }

        const candidates = [];
        if (finalUrl !== shareUrl) candidates.push(finalUrl);
        if (fbid) {
            candidates.push(`https://www.facebook.com/reel/${fbid}`);
            candidates.push(`https://www.facebook.com/watch/?v=${fbid}`);
        }

        for (const cand of candidates) {
            const candRes = await getSnapSaveData(cand);
            if (candRes.success && candRes.videos && candRes.videos.length > 0) {
                console.log(JSON.stringify(candRes));
                return;
            }
        }
    } catch (err) {
        // ignore resolution error
    }

    console.log(JSON.stringify({ success: false, error: 'Facebook 影片解析失敗' }));
}

const targetUrl = process.argv[2];
scrapeFacebook(targetUrl);
