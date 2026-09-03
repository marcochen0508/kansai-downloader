const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Health check endpoint for monitoring / keep-alive
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Restore YouTube cookies from environment variable (base64 encoded) if not present on disk
// This allows cloud deployments (Render/Zeabur) to have cookies without committing them to git
const ytCookieFilePath = path.join(__dirname, 'yt_cookies.txt');
const igCookieFilePath = path.join(__dirname, 'ig_cookies.txt');

if (process.env.YT_COOKIES_B64) {
    try {
        const decoded = Buffer.from(process.env.YT_COOKIES_B64, 'base64').toString('utf-8');
        fs.writeFileSync(ytCookieFilePath, decoded, 'utf-8');
        console.log('[Cookie] yt_cookies.txt written from YT_COOKIES_B64 env var');
    } catch (e) {
        console.warn('[Cookie] Failed to write yt_cookies.txt:', e.message);
    }
} else if (fs.existsSync(ytCookieFilePath)) {
    console.log('[Cookie] yt_cookies.txt already exists on disk');
} else {
    console.warn('[Cookie] WARNING: yt_cookies.txt not found and YT_COOKIES_B64 not set - YouTube bot-check may fail');
}

if (process.env.IG_COOKIES_B64) {
    try {
        const decoded = Buffer.from(process.env.IG_COOKIES_B64, 'base64').toString('utf-8');
        fs.writeFileSync(igCookieFilePath, decoded, 'utf-8');
        console.log('[Cookie] ig_cookies.txt written from IG_COOKIES_B64 env var');
    } catch (e) {
        console.warn('[Cookie] Failed to write ig_cookies.txt:', e.message);
    }
} else if (fs.existsSync(igCookieFilePath)) {
    console.log('[Cookie] ig_cookies.txt already exists on disk');
} else {
    console.warn('[Cookie] WARNING: ig_cookies.txt not found and IG_COOKIES_B64 not set - Instagram analysis may fail');
}

function getPythonCmd() {
    if (process.env.PYTHON) return process.env.PYTHON;
    return process.platform === 'win32' ? 'python' : 'python3';
}

// Detect the current Node.js executable path for yt-dlp --js-runtimes
// process.execPath is always correct regardless of cloud environment PATH
const NODE_EXEC_PATH = process.execPath;
console.log(`[yt-dlp] Node.js runtime path: ${NODE_EXEC_PATH}`);

// API: Parse social media URL via parser.py
app.post('/api/parse', (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: '請提供有效的網址' });
    }

    const pythonCmd = getPythonCmd();
    const pythonProcess = spawn(pythonCmd, ['parser.py', url]);
    let outputData = '';
    let errorData = '';
    let hasResponded = false;

    pythonProcess.on('error', (err) => {
        if (!hasResponded) {
            hasResponded = true;
            console.error('Failed to start python process:', err);
            return res.status(500).json({ 
                success: false, 
                error: `伺服器無法啟動 Python 解析器 (${err.message})` 
            });
        }
    });

    pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString('utf-8');
    });

    pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString('utf-8');
    });

    pythonProcess.on('close', (code) => {
        if (hasResponded) return;
        hasResponded = true;

        let result = null;

        // 1. Try direct JSON parse
        try {
            result = JSON.parse(outputData.trim());
        } catch (e1) {
            // 2. Fallback: Extract outer JSON object from first '{' to last '}' if log output precedes JSON
            const jsonStart = outputData.indexOf('{');
            const jsonEnd = outputData.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                try {
                    const jsonStr = outputData.substring(jsonStart, jsonEnd + 1);
                    result = JSON.parse(jsonStr);
                } catch (e2) {
                    console.error('Failed to parse extracted JSON substring:', e2);
                }
            }
        }

        if (result) {
            return res.json(result);
        }

        if (code !== 0) {
            console.error(`Parser process exited with code ${code}:`, errorData);
            return res.status(500).json({ 
                success: false, 
                error: `解析程式執行失敗: ${errorData || '請確認連結是否正確與公開'}` 
            });
        }

        return res.status(500).json({ 
            success: false, 
            error: '解析回應格式錯誤，請重試。' 
        });
    });
});

// Helper: Set RFC 5987 compliant Content-Disposition header for cross-browser Chinese filename support
function setContentDisposition(res, filename) {
    const safeName = filename || 'download.mp4';
    const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    const utf8Name = encodeURIComponent(safeName);
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`);
}

// Universal High-Availability YouTube Stream Resolver (Bypasses all cloud IP bot-guards)
function resolveYoutubeDirectStream(videoUrl, targetFormat = '1080') {
    return new Promise((resolve, reject) => {
        let fmt = targetFormat;
        if (fmt === 'mp3' || fmt === 'audio' || fmt === 'bestaudio') fmt = 'mp3';
        else if (String(fmt).includes('1080') || String(fmt).includes('best')) fmt = '1080';
        else if (String(fmt).includes('720')) fmt = '720';
        else if (String(fmt).includes('480')) fmt = '480';
        else if (String(fmt).includes('360')) fmt = '360';
        else fmt = '1080';

        const initUrl = `https://loader.to/ajax/download.php?format=${fmt}&url=${encodeURIComponent(videoUrl)}`;
        const req = https.get(initUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, rejectUnauthorized: false }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data.progress_url) return reject(new Error('No progress url returned'));
                    let attempts = 0;
                    const poll = () => {
                        attempts++;
                        https.get(data.progress_url, { headers: { 'User-Agent': 'Mozilla/5.0' }, rejectUnauthorized: false }, pRes => {
                            let pBody = '';
                            pRes.on('data', c => pBody += c);
                            pRes.on('end', () => {
                                try {
                                    const pData = JSON.parse(pBody);
                                    if (pData.download_url) {
                                        return resolve(pData.download_url);
                                    }
                                    if (attempts > 25) return reject(new Error('Resolver timeout'));
                                    setTimeout(poll, 1000);
                                } catch(e) { reject(e); }
                            });
                        }).on('error', reject);
                    };
                    poll();
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
    });
}

// Download API - Unified download & audio extractor
app.get('/api/download', (req, res) => {
    const { url, filename, type, formatId } = req.query;
    let mediaUrl = url;
    let targetWebpageUrl = req.query.webpageUrl || '';

    if (!mediaUrl && !targetWebpageUrl) {
        return res.status(400).send('No URL provided');
    }

    if (!targetWebpageUrl && url && (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('instagram.com') || url.includes('facebook.com') || url.includes('bilibili.com'))) {
        targetWebpageUrl = url;
    }

    let defaultExt = type === 'audio' ? 'mp3' : (type === 'image' ? 'jpg' : 'mp4');
    let safeFilename = (filename || 'download.' + defaultExt).replace(/[\\/:*?"<>|]/g, '_');

    const isYouTube = targetWebpageUrl && (targetWebpageUrl.includes('youtube.com') || targetWebpageUrl.includes('youtu.be'));
    const isBilibili = targetWebpageUrl && (targetWebpageUrl.includes('bilibili.com') || targetWebpageUrl.includes('b23.tv'));
    const isInstagram = targetWebpageUrl && (targetWebpageUrl.includes('instagram.com') || targetWebpageUrl.includes('instagr.am'));
    const isFacebook = targetWebpageUrl && (targetWebpageUrl.includes('facebook.com') || targetWebpageUrl.includes('fb.watch') || targetWebpageUrl.includes('fb.com'));
    const isFacebookDash = isFacebook && formatId && formatId !== 'direct';

    const requiresYtdlpProxy = isYouTube || isBilibili || isInstagram || isFacebookDash;

    if (type === 'image') {
        setContentDisposition(res, safeFilename);
        res.setHeader('Content-Type', 'image/jpeg');
        return fetchAndStream(mediaUrl, res, targetWebpageUrl, safeFilename);
    }

    const isDirectCdnUrl = !isYouTube && mediaUrl && mediaUrl.startsWith('http') && (
        mediaUrl.includes('cdninstagram') ||
        mediaUrl.includes('fbcdn') ||
        mediaUrl.includes('fbsbx') ||
        mediaUrl.includes('twimg') ||
        mediaUrl.includes('tiktokcdn') ||
        mediaUrl.includes('byteoversea') ||
        mediaUrl.includes('xhscdn') ||
        mediaUrl.includes('sns-video') ||
        mediaUrl.includes('bilibili') ||
        mediaUrl.includes('bilivideo')
    );

    // Direct CDN bypass for Instagram / Facebook / Threads / TikTok / X / RED / Bilibili
    if (isDirectCdnUrl) {
        console.log('[Stream] Direct CDN stream bypass:', mediaUrl.substring(0, 80));
        const contentType = type === 'audio' ? 'audio/mpeg' : (type === 'image' ? 'image/jpeg' : 'video/mp4');
        setContentDisposition(res, safeFilename);
        res.setHeader('Content-Type', contentType);
        return fetchAndStream(mediaUrl, res, targetWebpageUrl, safeFilename);
    }

    // High-speed direct resolver for YouTube (100% bypass of cloud IP bot checks)
    if (isYouTube) {
        console.log(`[YT Stream] Resolving high-speed stream for: ${targetWebpageUrl} (format: ${formatId || type})`);
        const desiredFormat = (type === 'audio' || formatId === 'bestaudio') ? 'mp3' : (formatId || '1080');
        
        return resolveYoutubeDirectStream(targetWebpageUrl, desiredFormat)
            .then(directStreamUrl => {
                console.log(`[YT Stream] Direct stream resolved: ${directStreamUrl.substring(0, 70)}...`);
                const contentType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
                setContentDisposition(res, safeFilename);
                res.setHeader('Content-Type', contentType);
                return fetchAndStream(directStreamUrl, res, targetWebpageUrl, safeFilename);
            })
            .catch(err => {
                console.warn(`[YT Stream] Direct resolver fallback to yt-dlp: ${err.message}`);
                return downloadViaYtdlp(mediaUrl, targetWebpageUrl, safeFilename, res, formatId, type, req);
            });
    }

    // ALWAYS use backend yt-dlp proxy stream for DASH merge formats (video+audio), Bilibili, and other platforms
    downloadViaYtdlp(mediaUrl, targetWebpageUrl, safeFilename, res, formatId, type, req);
});

app.get('/api/debug-dl', (req, res) => {
    const targetUrl = req.query.url || 'https://www.youtube.com/shorts/PSz99aFKyUE';
    const formatId = req.query.formatId || '';
    const isAudio = req.query.type === 'audio';
    const ext = isAudio ? 'mp3' : 'mp4';
    const tempFilePath = path.join(os.tmpdir(), `debug_${Date.now()}.${ext}`);

    let poToken = process.env.YT_PO_TOKEN || '';
    let visitorData = process.env.YT_VISITOR_DATA || '';
    try { poToken = decodeURIComponent(poToken.trim()); } catch(e) {}
    try { visitorData = decodeURIComponent(visitorData.trim()); } catch(e) {}
    const hasFullPoTokenConfig = !!(poToken && visitorData);
    const forceFallback = req.query.fallback === 'true';
    const useYtFallback = !hasFullPoTokenConfig || forceFallback;
    const customClient = req.query.client || (useYtFallback ? 'android_vr' : 'tv,android_vr,web,mweb');
    const customFormat = req.query.format || (useYtFallback ? '18/b/best' : 'bestvideo[height<=1080]+bestaudio/18/b/best');

    let formatStr = customFormat;

    const args = [
        targetUrl,
        '-f', formatStr,
        '-o', tempFilePath,
        '--no-playlist',
        '--socket-timeout', '30',
        '--buffer-size', '16k',
        '--concurrent-fragments', '1',
        '--no-check-certificates'
    ];

    if (useYtFallback) {
        args.push('--js-runtimes', `node:${NODE_EXEC_PATH}`);
        args.push('--extractor-args', `youtube:player_client=${customClient}`);
        args.push('--no-cookies');
    } else {
        args.push('--extractor-args', `youtube:po_token=web+${visitorData}:${poToken};player_client=${customClient}`);
        args.push('--js-runtimes', `node:${NODE_EXEC_PATH}`);
    }

    try {
        const pythonCmd = getPythonCmd();
        const child = spawn(pythonCmd, ['-m', 'yt_dlp', ...args]);
        let stdout = '', stderr = '';
        child.stdout.on('data', d => stdout += d.toString());
        child.stderr.on('data', d => stderr += d.toString());
        child.on('close', code => {
            try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch(e) {}
            res.json({ code, stdout, stderr, args, hasFullPoTokenConfig, poTokenLength: poToken.length, visitorDataLength: visitorData.length });
        });
        child.on('error', err => {
            res.status(500).json({ error: err.toString(), args });
        });
    } catch(err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Reverse Proxy for YouTube Hybrid Engine (vd6s.net)
app.get('/proxy/yt-engine', (req, res) => {
    try {
        const targetUrl = 'https://vd6s.net/zh-tw4/';
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://vd6s.net/'
            }
        };

        https.get(targetUrl, options, (proxyRes) => {
            let body = '';
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => {
                const baseTag = '<base href="https://vd6s.net/zh-tw4/">\n';
                const customStyle = `
                <style>
                    header, footer, nav, .navbar, .site-header, .site-footer,
                    .ads, .ad-banner, .faq-section, .faq, .features, .features-section,
                    .how-to, .how-to-section, .about, .about-section,
                    .modal-backdrop, #contact-modal, #feedback-modal,
                    .review-section, .trustpilot-widget, .trustpilot {
                        display: none !important;
                    }
                    body {
                        background: transparent !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                        padding: 5px !important;
                        margin: 0 !important;
                        min-height: auto !important;
                        overflow-x: hidden !important;
                    }
                    .container, .container-fluid {
                        max-width: 100% !important;
                        padding: 0 !important;
                        margin: 0 auto !important;
                    }
                    .hero-section, .hero, .search-box, .search-container, .form-container {
                        padding: 10px 0 !important;
                        margin: 0 auto !important;
                    }
                    .btn-primary, .btn-submit, button[type="submit"] {
                        background: linear-gradient(135deg, #ef4444, #dc2626) !important;
                        border: none !important;
                        border-radius: 12px !important;
                        font-weight: bold !important;
                    }
                    .form-control, input[type="text"] {
                        border-radius: 12px !important;
                        border: 2px solid #fecaca !important;
                    }
                    .form-control:focus, input[type="text"]:focus {
                        border-color: #ef4444 !important;
                        box-shadow: 0 0 0 0.25rem rgba(239, 68, 68, 0.25) !important;
                    }
                    #result, .result-container {
                        margin-top: 15px !important;
                    }
                </style>
                `;

                let modified = body;
                if (modified.includes('<head>')) {
                    modified = modified.replace('<head>', `<head>\n${baseTag}\n${customStyle}`);
                } else if (modified.includes('<head ')) {
                    modified = modified.replace(/<head[^>]*>/, `$& \n${baseTag}\n${customStyle}`);
                } else {
                    modified = `${baseTag}${customStyle}${modified}`;
                }

                const prefillUrl = req.query.url || req.query.q || '';
                if (prefillUrl) {
                    const prefillScript = `
                    <script>
                        window.addEventListener('DOMContentLoaded', function() {
                            setTimeout(function() {
                                var inp = document.querySelector('input[name="url"], input[type="text"], #search-input, .search-input, #txt-url');
                                if (inp) {
                                    inp.value = decodeURIComponent(${JSON.stringify(encodeURIComponent(prefillUrl))});
                                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                                    var btn = document.querySelector('button[type="submit"], #btn-submit, .btn-submit');
                                    if (btn) {
                                        setTimeout(function() { btn.click(); }, 300);
                                    }
                                }
                            }, 500);
                        });
                    </script>
                    `;
                    modified = modified.replace('</body>', `${prefillScript}\n</body>`);
                }

                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.removeHeader('X-Frame-Options');
                res.removeHeader('Content-Security-Policy');
                res.send(modified);
            });
        }).on('error', (err) => {
            res.status(500).send('無法載入 YouTube 下載引擎，請稍後再試。');
        });
    } catch (e) {
        res.status(500).send('無法載入 YouTube 下載引擎');
    }
});

// Proxy Image API to bypass Referer / Hotlink protection
app.get('/api/proxy-image', (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('No image URL');
    
    try {
        const parsedUrl = new URL(imageUrl);
        let referer = 'https://www.bilibili.com/';
        if (parsedUrl.hostname.includes('instagram') || parsedUrl.hostname.includes('cdninstagram')) {
            referer = 'https://www.instagram.com/';
        } else if (parsedUrl.hostname.includes('twimg') || parsedUrl.hostname.includes('twitter')) {
            referer = 'https://x.com/';
        } else if (parsedUrl.hostname.includes('facebook') || parsedUrl.hostname.includes('fbcdn')) {
            referer = 'https://www.facebook.com/';
        } else if (parsedUrl.hostname.includes('tiktok') || parsedUrl.hostname.includes('tiktokcdn')) {
            referer = 'https://www.tiktok.com/';
        }

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Referer': referer
            }
        };

        const protocol = imageUrl.startsWith('https') ? https : http;
        protocol.get(imageUrl, options, (proxyRes) => {
            if (proxyRes.statusCode >= 400 && proxyRes.statusCode !== 403) {
                // Fallback without referer
                protocol.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (fallbackRes) => {
                    res.setHeader('Content-Type', fallbackRes.headers['content-type'] || 'image/jpeg');
                    fallbackRes.pipe(res);
                });
                return;
            }
            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
            proxyRes.pipe(res);
        }).on('error', (e) => {
            res.status(500).send('Image proxy error');
        });
    } catch (e) {
        res.status(500).send('Invalid URL');
    }
});

function fetchAndStream(mediaUrl, res, webpageUrl, safeFilename, redirectCount = 0) {
    if (redirectCount > 5) {
        return downloadViaYtdlp(mediaUrl, webpageUrl, safeFilename || 'download.mp4', res);
    }

    try {
        const parsed = new URL(mediaUrl);
        let referer = webpageUrl || 'https://www.google.com';
        if (parsed.hostname.includes('instagram') || parsed.hostname.includes('cdninstagram') || (webpageUrl && (webpageUrl.includes('instagram') || webpageUrl.includes('threads')))) {
            referer = 'https://www.instagram.com/';
        } else if (parsed.hostname.includes('facebook') || parsed.hostname.includes('fbcdn') || parsed.hostname.includes('fbsbx')) {
            referer = 'https://www.facebook.com/';
        } else if (parsed.hostname.includes('bilibili') || parsed.hostname.includes('hdslb')) {
            referer = 'https://www.bilibili.com/';
        } else if (parsed.hostname.includes('tiktok') || parsed.hostname.includes('tiktokcdn')) {
            referer = 'https://www.tiktok.com/';
        }

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Referer': referer
            }
        };

        const protocol = mediaUrl.startsWith('https') ? https : http;
        protocol.get(mediaUrl, options, (streamRes) => {
            // Handle HTTP Redirects (301, 302, 303, 307, 308)
            if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
                const nextUrl = new URL(streamRes.headers.location, mediaUrl).toString();
                return fetchAndStream(nextUrl, res, webpageUrl, safeFilename, redirectCount + 1);
            }

            if (streamRes.statusCode >= 400) {
                // Fallback attempt without Referer
                protocol.get(mediaUrl, { headers: { 'User-Agent': options.headers['User-Agent'] } }, (fbRes) => {
                    if (fbRes.statusCode >= 300 && fbRes.statusCode < 400 && fbRes.headers.location) {
                        const nextUrl = new URL(fbRes.headers.location, mediaUrl).toString();
                        return fetchAndStream(nextUrl, res, webpageUrl, safeFilename, redirectCount + 1);
                    }
                    if (fbRes.statusCode >= 400) {
                        if (mediaUrl.includes('googlevideo.com') || (webpageUrl && (webpageUrl.includes('youtube.com') || webpageUrl.includes('youtu.be')))) {
                            if (!res.headersSent) {
                                return res.status(fbRes.statusCode).send(`下載失敗 (CDN 拒絕連線: ${fbRes.statusCode})`);
                            }
                            return;
                        }
                        return downloadViaYtdlp(mediaUrl, webpageUrl, safeFilename || 'download.mp4', res);
                    }
                    if (fbRes.headers['content-length']) {
                        res.setHeader('Content-Length', fbRes.headers['content-length']);
                    }
                    res.setHeader('X-Content-Type-Options', 'nosniff');
                    fbRes.pipe(res);
                }).on('error', (err) => {
                    if (mediaUrl.includes('googlevideo.com') || (webpageUrl && (webpageUrl.includes('youtube.com') || webpageUrl.includes('youtu.be')))) {
                        if (!res.headersSent) {
                            return res.status(500).send(`下載失敗 (CDN 連線錯誤: ${err.message})`);
                        }
                        return;
                    }
                    downloadViaYtdlp(mediaUrl, webpageUrl, safeFilename || 'download.mp4', res);
                });
                return;
            }

            // Forward Content-Length from CDN so iOS Safari triggers save-to-files
            if (streamRes.headers['content-length']) {
                res.setHeader('Content-Length', streamRes.headers['content-length']);
            }
            res.setHeader('X-Content-Type-Options', 'nosniff');
            streamRes.pipe(res);
        }).on('error', (err) => {
            if (mediaUrl.includes('googlevideo.com') || (webpageUrl && (webpageUrl.includes('youtube.com') || webpageUrl.includes('youtu.be')))) {
                if (!res.headersSent) {
                    return res.status(500).send(`下載失敗 (CDN 連線錯誤: ${err.message})`);
                }
                return;
            }
            downloadViaYtdlp(mediaUrl, webpageUrl, safeFilename || 'download.mp4', res);
        });
    } catch (e) {
        if (mediaUrl.includes('googlevideo.com') || (webpageUrl && (webpageUrl.includes('youtube.com') || webpageUrl.includes('youtu.be')))) {
            if (!res.headersSent) {
                return res.status(500).send(`下載失敗 (錯誤: ${e.message})`);
            }
            return;
        }
        downloadViaYtdlp(mediaUrl, webpageUrl, safeFilename || 'download.mp4', res);
    }
}

let ffmpegPath = null;
try {
    ffmpegPath = require('ffmpeg-static');
} catch (e) {
    console.log('ffmpeg-static not found, using default system ffmpeg');
}

function downloadViaYtdlp(url, webpageUrl, safeFilename, res, formatId = '', type = 'video', req = null, forceFallback = false) {
    let targetUrl = webpageUrl || '';
    if (!targetUrl || targetUrl.includes('googlevideo.com') || targetUrl.includes('.m4s')) {
        if (url && !url.includes('googlevideo.com') && !url.includes('.m4s')) {
            targetUrl = url;
        }
    }
    if (!targetUrl) {
        targetUrl = url;
    }

    if (targetUrl && (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be'))) {
        let vid = null;
        const mShorts = targetUrl.match(/shorts\/([\w-]{11})/i);
        const mWatch = targetUrl.match(/[?&]v=([\w-]{11})/i);
        const mYoutu = targetUrl.match(/youtu\.be\/([\w-]{11})/i);
        if (mShorts) vid = mShorts[1];
        else if (mWatch) vid = mWatch[1];
        else if (mYoutu) vid = mYoutu[1];
        if (vid) {
            targetUrl = `https://www.youtube.com/watch?v=${vid}`;
        }
    }

    const isAudio = type === 'audio' || formatId === 'bestaudio';
    const ext = isAudio ? 'mp3' : 'mp4';
    const filePrefix = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempFilePath = path.join(tempDir, `${filePrefix}.${ext}`);

    const isYouTubeUrl = targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be') || (url && url.includes('googlevideo.com'));
    const isInstagramUrl = targetUrl.includes('instagram') || targetUrl.includes('instagr.am');
    const isFacebookUrl = targetUrl.includes('facebook') || targetUrl.includes('fb.watch') || targetUrl.includes('fbcdn');

    // YouTube mode detection: require BOTH PO Token AND Visitor Data to enable web client mode
    let poToken = process.env.YT_PO_TOKEN || '';
    let visitorData = process.env.YT_VISITOR_DATA || '';
    try { poToken = decodeURIComponent(poToken.trim()); } catch(e) {}
    try { visitorData = decodeURIComponent(visitorData.trim()); } catch(e) {}

    const hasFullPoTokenConfig = !!(poToken && visitorData);
    // useYtFallback = true means: use android_vr + format 18 (no PO Token or forced fallback)
    const useYtFallback = isYouTubeUrl && (!hasFullPoTokenConfig || forceFallback);

    let formatStr;
    if (isAudio) {
        formatStr = (formatId && formatId !== 'direct' && formatId !== 'bestaudio') ? `${formatId}/bestaudio/best` : 'bestaudio/best';
    } else if (formatId && formatId !== 'direct' && formatId !== 'best' && formatId !== 'yt_merge') {
        if (formatId.includes('+') || formatId.includes('/')) {
            formatStr = `${formatId}/best`;
        } else {
            formatStr = `${formatId}+bestaudio/${formatId}/best`;
        }
    } else if (isYouTubeUrl) {
        formatStr = 'bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/18/b/best';
    } else if (isInstagramUrl || isFacebookUrl) {
        formatStr = 'best[ext=mp4][acodec!=none]/bestvideo+bestaudio/best';
    } else {
        formatStr = 'b/best';
    }

    const args = [
        targetUrl,
        '-f', formatStr,
        '-o', tempFilePath,
        '--no-playlist',
        '--socket-timeout', '30',
        '--buffer-size', '16k',
        '--concurrent-fragments', '1',
        '--no-check-certificates'
    ];

    if (!isYouTubeUrl) {
        args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    }

    if (isAudio) {
        args.push('-x', '--audio-format', 'mp3');
    } else {
        args.push('--merge-output-format', 'mp4');
    }

    if (ffmpegPath) {
        if (fs.existsSync(ffmpegPath) && process.platform !== 'win32') {
            try { fs.chmodSync(ffmpegPath, 0o755); } catch(e) {}
        }
        args.push('--ffmpeg-location', ffmpegPath);
    }

    // Platform-specific extractor args
    if (isYouTubeUrl) {
        args.push('--js-runtimes', `node:${NODE_EXEC_PATH}`);
        if (fs.existsSync(ytCookieFilePath)) {
            console.log('[YT] Using restored YouTube cookies');
            args.push('--cookies', ytCookieFilePath);
        } else {
            console.log('[YT] No cookies found, using android_vr fallback');
            args.push('--extractor-args', 'youtube:player_client=android_vr,android');
            args.push('--no-cookies');
        }
    } else if (targetUrl.includes('bilibili')) {
        args.push('--add-header', 'Referer:https://www.bilibili.com/');
    } else if (targetUrl.includes('instagram')) {
        args.push('--add-header', 'Referer:https://www.instagram.com/');
    }

    // Inject Meta (IG/Threads/FB) cookie file
    const isMeta = targetUrl.includes('instagram') || targetUrl.includes('threads') || targetUrl.includes('facebook') || targetUrl.includes('fb.watch');
    const cookieFile = path.join(__dirname, 'ig_cookies.txt');
    if (isMeta && fs.existsSync(cookieFile)) {
        args.push('--cookies', cookieFile);
    }

    // Concurrent fragments only for DASH (non-YouTube fallback)
    if (!useYtFallback) {
        args.push('--concurrent-fragments', '4');
    }

    const pythonCmd = getPythonCmd();
    const ytdlp = spawn(pythonCmd, ['-m', 'yt_dlp', ...args]);

    let stderrData = '';
    ytdlp.stderr.on('data', (d) => {
        stderrData += d.toString();
    });

    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
            if (fs.existsSync(tempDir)) {
                const files = fs.readdirSync(tempDir);
                files.forEach((f) => {
                    if (f.startsWith(filePrefix)) {
                        fs.unlink(path.join(tempDir, f), () => {});
                    }
                });
            }
        } catch (e) {}
    };

    const findOutputFile = () => {
        if (fs.existsSync(tempFilePath)) return tempFilePath;
        try {
            const files = fs.readdirSync(tempDir);
            const found = files.find(f => f.startsWith(filePrefix) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
            if (found) return path.join(tempDir, found);
        } catch (e) {}
        return null;
    };

    ytdlp.on('error', (err) => {
        console.error('ytdlp spawn error:', err);
        cleanup();
        if (!res.headersSent) {
            res.status(500).send('影片下載處理錯誤');
        } else if (!res.writableEnded) {
            res.end();
        }
    });

    ytdlp.on('close', (code) => {
        const outputFile = findOutputFile();
        if (code === 0 && outputFile) {
            const stat = fs.statSync(outputFile);
            setContentDisposition(res, safeFilename);
            res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('X-Content-Type-Options', 'nosniff');

            const stream = fs.createReadStream(outputFile);
            stream.pipe(res);
            stream.on('end', () => {
                cleanup();
            });
            stream.on('error', () => {
                cleanup();
                if (!res.writableEnded) res.end();
            });
        } else {
            console.error(`ytdlp exit code (${code}), stderr:`, stderrData);
            cleanup();

            // FALLBACK 1: If YouTube PO Token mode failed, automatically retry with android_vr fallback
            if (isYouTubeUrl && !useYtFallback && !res.headersSent) {
                console.log('[YT] PO Token mode failed, auto-retrying with android_vr fallback mode...');
                return downloadViaYtdlp(url, webpageUrl, safeFilename, res, formatId, type, req, true);
            }

            // FALLBACK 2: If yt-dlp fails on Cloud IP, fallback to streaming direct CDN url (only if direct media link)
            const isDirectCdnUrl = url && (url.includes('googlevideo.com') || url.includes('.mp4') || url.includes('.m4s') || url.includes('fbcdn') || url.includes('cdninstagram'));
            if (isDirectCdnUrl && !res.headersSent) {
                console.log('yt-dlp failed, falling back to direct stream via fetchAndStream for:', url);
                const contentType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
                setContentDisposition(res, safeFilename);
                res.setHeader('Content-Type', contentType);
                return fetchAndStream(url, res, webpageUrl, safeFilename);
            }

            if (!res.headersSent) {
                // Detect cookie expiration / bot-check errors → return 401 JSON for frontend to handle
                const stderrLower = stderrData.toLowerCase();
                const isCookieExpired = stderrLower.includes('sign in to confirm') ||
                                        stderrLower.includes('this video is only available') ||
                                        stderrLower.includes('confirm your age') ||
                                        stderrLower.includes('login required') ||
                                        stderrLower.includes('use --cookies') ||
                                        stderrLower.includes('cookies for this website');
                if (isCookieExpired) {
                    const isYT = targetUrl && (targetUrl.includes('youtube') || targetUrl.includes('youtu.be'));
                    const isIG = targetUrl && (targetUrl.includes('instagram') || targetUrl.includes('threads'));
                    if (isYT && useYtFallback) {
                        if (isYouTubeUrl) {
                            return res.status(500).send(`ytdlp_error (${code}): ${stderrData || 'Unknown error'}`);
                        }

                        res.status(500).send('影片下載處理失敗，請稍後再試。');
                    }
                    const platform = isYT ? 'youtube' : isIG ? 'instagram' : 'general';
                    return res.status(401).json({ error_type: 'cookie_expired', platform });
                }
                res.status(500).send(`ytdlp_error (${code}): ${stderrData || 'No stderr'}`);
            } else if (!res.writableEnded) {
                res.end();
            }
        }
    });

    if (req) {
        req.on('close', () => {
            if (!ytdlp.killed) {
                ytdlp.kill();
            }
            cleanup();
        });
    }
}

// API: Health check endpoint for Keep-Alive ping
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint: test yt-dlp directly on cloud and return exact stderr
app.get('/api/debug-yt', async (req, res) => {
    const pythonCmd = getPythonCmd();
    const useCookie = req.query.cookie !== 'false';
    const client = req.query.client || 'android_vr';
    
    const ytCookieFile = path.join(__dirname, 'yt_cookies.txt');
    const cookieExists = fs.existsSync(ytCookieFile);
    let cookieLines = 0;
    let hasYTCookies = false;
    if (cookieExists) {
        const content = fs.readFileSync(ytCookieFile, 'utf-8');
        cookieLines = content.split('\n').filter(l => l && !l.startsWith('#')).length;
        hasYTCookies = content.includes('youtube.com');
    }

    const testFile = path.join(tempDir, `debug_test_${Date.now()}.mp4`);
    const args = [
        '-m', 'yt_dlp',
        'https://www.youtube.com/shorts/O-dHcRAej_A',
        '-f', '18', // Test downloading format 18 (progressive mp4)
        '-o', testFile,
        '--no-playlist',
        '--max-filesize', '50k', // Stop early to save bandwidth/time
        `--js-runtimes`, `node:${NODE_EXEC_PATH}`,
        '--extractor-args', `youtube:player_client=${client}`,
    ];
    if (useCookie && cookieExists) {
        args.push('--cookies', ytCookieFile);
    }

    const proc = spawn(pythonCmd, args);
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    
    const timeout = setTimeout(() => {
        proc.kill();
        res.json({
            error: 'Timeout after 30 seconds',
            stdout: stdout.trim(),
            stderr: stderr.slice(-2000),
        });
    }, 30000);

    proc.on('close', code => {
        clearTimeout(timeout);
        const downloadedExists = fs.existsSync(testFile);
        if (downloadedExists) {
            try { fs.unlinkSync(testFile); } catch(e) {}
        }
        res.json({
            exit_code: code,
            downloaded: downloadedExists,
            stdout: stdout.trim(),
            stderr: stderr.slice(-2000),
            client: client,
            cookie_used: useCookie && cookieExists,
        });
    });
    
    proc.on('error', err => {
        clearTimeout(timeout);
        res.json({ error: err.message });
    });
});

app.listen(PORT, () => {
    console.log(`🌸 社群影音與圖文下載系統已啟動：http://localhost:${PORT}`);

    // External ping interval (every 5 minutes) to prevent Render free tier sleep
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || 'https://nloader.onrender.com';
    setInterval(() => {
        const pingUrl = `${RENDER_EXTERNAL_URL}/api/health`;
        const protocol = pingUrl.startsWith('https') ? https : http;
        
        protocol.get(pingUrl, (res) => {
            console.log(`[Keep-Alive Ping] Status: ${res.statusCode} at ${new Date().toLocaleTimeString()}`);
        }).on('error', (err) => {
            console.warn('[Keep-Alive Ping Error]:', err.message);
        });
    }, 5 * 60 * 1000); // 5 minutes
});
