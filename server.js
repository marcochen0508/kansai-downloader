const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

function getPythonCmd() {
    if (process.env.PYTHON) return process.env.PYTHON;
    return process.platform === 'win32' ? 'python' : 'python3';
}

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

// API: Download Handler with yt-dlp Video+Audio Merge & Headers Proxy
app.get('/api/download', async (req, res) => {
    const { url, filename, type, webpageUrl } = req.query;
    if (!url) {
        return res.status(400).send('缺少下載連結');
    }

    const safeFilename = (filename || 'download.mp4').replace(/[\\/:*?"<>|]/g, '_');
    const formatId = req.query.formatId || '';  // must be declared before isFacebookDash

    const isYouTube = (webpageUrl && (webpageUrl.includes('youtube.com') || webpageUrl.includes('youtu.be'))) || url.includes('googlevideo.com');
    const isBilibili = (webpageUrl && (webpageUrl.includes('bilibili.com') || webpageUrl.includes('b23.tv'))) || url.includes('.m4s');
    // Instagram uses yt-dlp because IG CDN links expire quickly and require fresh extraction
    // Facebook CDN progressive MP4 (formatId='direct') streams directly; DASH video-only needs yt-dlp merge
    const isInstagram = webpageUrl && (webpageUrl.includes('instagram.com') || webpageUrl.includes('instagr.am'));
    const isFacebookDash = webpageUrl &&
        (webpageUrl.includes('facebook.com') || webpageUrl.includes('fb.watch') || webpageUrl.includes('fb.com')) &&
        formatId !== 'direct';  // Facebook DASH video-only (not a progressive/direct format)

    // Route platforms requiring audio+video merging or fresh yt-dlp extraction through yt-dlp
    const requiresYtdlpMerge = isYouTube || isBilibili || isInstagram || isFacebookDash;

    if (type === 'image') {
        setContentDisposition(res, safeFilename);
        res.setHeader('Content-Type', 'image/jpeg');
        return fetchAndStream(url, res, webpageUrl, safeFilename);
    }

    const isDirectStream = (formatId === 'direct' || type === 'audio') && !isYouTube;

    // Stream directly with redirect + yt-dlp fallback for all non-DASH video platforms (including Facebook)
    if (isDirectStream || (type === 'video' && !requiresYtdlpMerge && url.startsWith('http'))) {
        const contentType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
        setContentDisposition(res, safeFilename);
        res.setHeader('Content-Type', contentType);

        return fetchAndStream(url, res, webpageUrl, safeFilename);
    }

    // For YouTube, Bilibili, or Instagram — force yt-dlp with H.264/AAC codec selection
    downloadViaYtdlp(url, webpageUrl, safeFilename, res, formatId, type, req);
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
        if (parsed.hostname.includes('bilibili') || parsed.hostname.includes('hdslb')) {
            referer = 'https://www.bilibili.com/';
        } else if (parsed.hostname.includes('tiktok') || parsed.hostname.includes('tiktokcdn')) {
            referer = 'https://www.tiktok.com/';
        } else if (parsed.hostname.includes('facebook') || parsed.hostname.includes('fbcdn') || parsed.hostname.includes('fbsbx')) {
            referer = 'https://www.facebook.com/';
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
                        return downloadViaYtdlp(mediaUrl, webpageUrl, safeFilename || 'download.mp4', res);
                    }
                    if (fbRes.headers['content-length']) {
                        res.setHeader('Content-Length', fbRes.headers['content-length']);
                    }
                    res.setHeader('X-Content-Type-Options', 'nosniff');
                    fbRes.pipe(res);
                }).on('error', () => {
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
        }).on('error', () => {
            downloadViaYtdlp(mediaUrl, webpageUrl, safeFilename || 'download.mp4', res);
        });
    } catch (e) {
        downloadViaYtdlp(mediaUrl, webpageUrl, safeFilename || 'download.mp4', res);
    }
}

let ffmpegPath = null;
try {
    ffmpegPath = require('ffmpeg-static');
} catch (e) {
    console.log('ffmpeg-static not found, using default system ffmpeg');
}

function downloadViaYtdlp(url, webpageUrl, safeFilename, res, formatId = '', type = 'video', req = null) {
    const targetUrl = webpageUrl || url;
    const isAudio = type === 'audio' || formatId === 'bestaudio';
    const ext = isAudio ? 'mp3' : 'mp4';
    const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`);

    const isYouTubeUrl = targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be') || url.includes('googlevideo.com');
    const isInstagramUrl = targetUrl.includes('instagram') || targetUrl.includes('instagr.am');
    const isFacebookUrl = targetUrl.includes('facebook') || targetUrl.includes('fb.watch') || targetUrl.includes('fbcdn');

    let formatStr;
    if (isAudio) {
        formatStr = 'bestaudio/best';
    } else if (formatId && formatId !== 'direct' && formatId !== 'best' && formatId !== 'yt_merge') {
        formatStr = `${formatId}+bestaudio/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best`;
    } else if (isInstagramUrl || isFacebookUrl) {
        formatStr = 'best[vcodec^=avc1][acodec!=none]/best[ext=mp4][acodec!=none]/bestvideo[vcodec^=avc1]+bestaudio/best';
    } else {
        formatStr = 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best';
    }

    const args = [
        targetUrl,
        '-f', formatStr,
        '-o', tempFilePath
    ];

    if (!isAudio) {
        args.push('--merge-output-format', 'mp4');
    }

    if (ffmpegPath) {
        args.push('--ffmpeg-location', ffmpegPath);
    }

    if (isYouTubeUrl) {
        args.push('--remote-components', 'ejs:github');
        const ytCookieFile = path.join(__dirname, 'yt_cookies.txt');
        if (fs.existsSync(ytCookieFile)) {
            args.push('--cookies', ytCookieFile);
        }
    } else if (targetUrl.includes('bilibili')) {
        args.push('--add-header', 'Referer:https://www.bilibili.com/');
    } else if (targetUrl.includes('instagram')) {
        args.push('--add-header', 'Referer:https://www.instagram.com/');
    }

    // Inject Meta (IG/Threads/FB) cookie file to bypass IP rate-limit blocks
    const isMeta = targetUrl.includes('instagram') || targetUrl.includes('threads') || targetUrl.includes('facebook') || targetUrl.includes('fb.watch');
    const cookieFile = path.join(__dirname, 'ig_cookies.txt');
    if (isMeta && fs.existsSync(cookieFile)) {
        args.push('--cookies', cookieFile);
    }

    // Immediately send HTTP headers to client so browser opens download prompt (0ms delay!)
    // and Render HTTP proxy knows connection is active.
    setContentDisposition(res, safeFilename);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    const pythonCmd = getPythonCmd();
    const ytdlp = spawn(pythonCmd, ['-m', 'yt_dlp', ...args]);

    // Send a periodic 5-second heartbeat empty chunk to keep Render proxy TCP socket alive while downloading/merging
    const heartbeatTimer = setInterval(() => {
        if (!res.writableEnded && res.writable) {
            res.write('');
        }
    }, 5000);

    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeatTimer);
        if (fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, () => {});
        }
    };

    ytdlp.on('error', (err) => {
        console.error('ytdlp spawn error:', err);
        cleanup();
        if (!res.writableEnded) res.end();
    });

    ytdlp.on('close', (code) => {
        clearInterval(heartbeatTimer);

        if (code === 0 && fs.existsSync(tempFilePath)) {
            const stream = fs.createReadStream(tempFilePath);
            stream.pipe(res);
            stream.on('end', () => {
                cleanup();
            });
            stream.on('error', () => {
                cleanup();
                if (!res.writableEnded) res.end();
            });
        } else {
            console.error('ytdlp exit code non-zero:', code);
            cleanup();
            if (!res.writableEnded) res.end();
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
