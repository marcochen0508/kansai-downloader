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
    const { url, filename, type, webpageUrl, formatId: rawFormatId } = req.query;
    const formatId = rawFormatId || '';

    // Prioritize real webpage URL over raw CDN stream URL (googlevideo.com) for yt-dlp extraction
    let targetWebpageUrl = webpageUrl || '';
    if (!targetWebpageUrl && url && (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('instagram.com') || url.includes('facebook.com') || url.includes('bilibili.com'))) {
        targetWebpageUrl = url;
    }

    const safeFilename = (filename || 'download.mp4').replace(/[\\/:*?"<>|]/g, '_');
    const mediaUrl = url || targetWebpageUrl;

    if (!mediaUrl && !targetWebpageUrl) {
        return res.status(400).send('缺少下載連結');
    }

    const isYouTube = (targetWebpageUrl && (targetWebpageUrl.includes('youtube.com') || targetWebpageUrl.includes('youtu.be'))) ||
                      (mediaUrl && (mediaUrl.includes('googlevideo.com') || mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('ssyoutube.com')));
    const isBilibili = (targetWebpageUrl && (targetWebpageUrl.includes('bilibili.com') || targetWebpageUrl.includes('b23.tv'))) || (mediaUrl && mediaUrl.includes('.m4s'));
    const isInstagram = targetWebpageUrl && (targetWebpageUrl.includes('instagram.com') || targetWebpageUrl.includes('instagr.am'));
    const isFacebookDash = targetWebpageUrl &&
        (targetWebpageUrl.includes('facebook.com') || targetWebpageUrl.includes('fb.watch') || targetWebpageUrl.includes('fb.com')) &&
        formatId !== 'direct';

    // Route platforms requiring audio+video merging or fresh backend stream extraction through yt-dlp
    const requiresYtdlpProxy = isYouTube || isBilibili || isInstagram || isFacebookDash;

    if (type === 'image') {
        setContentDisposition(res, safeFilename);
        res.setHeader('Content-Type', 'image/jpeg');
        return fetchAndStream(mediaUrl, res, targetWebpageUrl, safeFilename);
    }

    const isDirectStream = (formatId === 'direct') && !isYouTube && !isBilibili && !isInstagram;

    // Direct stream only for progressive non-YouTube non-IG non-Bilibili formats
    if (isDirectStream || (type === 'video' && !requiresYtdlpProxy && mediaUrl.startsWith('http'))) {
        const contentType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
        setContentDisposition(res, safeFilename);
        res.setHeader('Content-Type', contentType);

        return fetchAndStream(mediaUrl, res, targetWebpageUrl, safeFilename);
    }

    // ALWAYS use backend yt-dlp proxy stream for YouTube, Bilibili, Instagram, and FB DASH
    downloadViaYtdlp(mediaUrl, targetWebpageUrl, safeFilename, res, formatId, type, req);
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
    let targetUrl = webpageUrl || '';
    if (!targetUrl || targetUrl.includes('googlevideo.com') || targetUrl.includes('.m4s')) {
        if (url && !url.includes('googlevideo.com') && !url.includes('.m4s')) {
            targetUrl = url;
        }
    }
    if (!targetUrl) {
        targetUrl = url;
    }

    const isAudio = type === 'audio' || formatId === 'bestaudio';
    const ext = isAudio ? 'mp3' : 'mp4';
    const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`);

    const isYouTubeUrl = targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be') || (url && url.includes('googlevideo.com'));
    const isInstagramUrl = targetUrl.includes('instagram') || targetUrl.includes('instagr.am');
    const isFacebookUrl = targetUrl.includes('facebook') || targetUrl.includes('fb.watch') || targetUrl.includes('fbcdn');

    let formatStr;
    if (isAudio) {
        formatStr = 'bestaudio/best';
    } else if (formatId && formatId !== 'direct' && formatId !== 'best' && formatId !== 'yt_merge') {
        if (formatId.includes('+') || formatId.includes('/')) {
            formatStr = `${formatId}/bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/18/b/best`;
        } else {
            formatStr = `${formatId}+bestaudio/${formatId}/bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/18/b/best`;
        }
    } else if (isInstagramUrl || isFacebookUrl) {
        formatStr = 'best[ext=mp4][acodec!=none]/bestvideo+bestaudio/best';
    } else {
        formatStr = 'bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/18/b/best';
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
        if (fs.existsSync(ffmpegPath) && process.platform !== 'win32') {
            try { fs.chmodSync(ffmpegPath, 0o755); } catch(e) {}
        }
        args.push('--ffmpeg-location', ffmpegPath);
    }

    if (isYouTubeUrl) {
        args.push('--remote-components', 'ejs:github');
        args.push('--js-runtimes', 'node');
        args.push('--extractor-args', 'youtube:player_client=android_vr,web');
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

    args.push('--concurrent-fragments', '4');

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
        if (fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, () => {});
        }
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
        if (code === 0 && fs.existsSync(tempFilePath)) {
            const stat = fs.statSync(tempFilePath);
            setContentDisposition(res, safeFilename);
            res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('X-Content-Type-Options', 'nosniff');

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
            console.error(`ytdlp exit code non-zero (${code}):`, stderrData);
            cleanup();

            // FALLBACK: If yt-dlp fails on Cloud IP, fallback to streaming direct CDN url (only if direct media link)
            const isDirectCdnUrl = url && (url.includes('googlevideo.com') || url.includes('.mp4') || url.includes('.m4s') || url.includes('fbcdn') || url.includes('cdninstagram'));
            if (isDirectCdnUrl && !res.headersSent) {
                console.log('yt-dlp failed, falling back to direct stream via fetchAndStream for:', url);
                const contentType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
                setContentDisposition(res, safeFilename);
                res.setHeader('Content-Type', contentType);
                return fetchAndStream(url, res, webpageUrl, safeFilename);
            }

            if (!res.headersSent) {
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
