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

// API: Parse social media URL via parser.py
app.post('/api/parse', (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: '請提供有效的網址' });
    }

    const pythonProcess = spawn('python', ['parser.py', url]);
    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString('utf-8');
    });

    pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString('utf-8');
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Parser process exited with code ${code}:`, errorData);
            return res.status(500).json({ 
                success: false, 
                error: `解析程式執行失敗: ${errorData || '未知錯誤'}` 
            });
        }

        try {
            const result = JSON.parse(outputData.trim());
            return res.json(result);
        } catch (e) {
            console.error('Failed to parse Python JSON output:', outputData);
            return res.status(500).json({ 
                success: false, 
                error: '解析回應格式錯誤，請重試。' 
            });
        }
    });
});

// API: Download Handler with yt-dlp Video+Audio Merge & Headers Proxy
app.get('/api/download', async (req, res) => {
    const { url, filename, type, webpageUrl } = req.query;
    if (!url) {
        return res.status(400).send('缺少下載連結');
    }

    const safeFilename = (filename || 'download.mp4').replace(/[\\/:*?"<>|]/g, '_');
    const isYouTube = webpageUrl && (webpageUrl.includes('youtube.com') || webpageUrl.includes('youtu.be'));
    
    // For direct image/audio or direct social media video streams (TikTok, Threads, X, Instagram)
    if (type === 'image' || type === 'audio' || (type === 'video' && !isYouTube && url.startsWith('http'))) {
        const contentType = type === 'image' ? 'image/jpeg' : (type === 'audio' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
        res.setHeader('Content-Type', contentType);

        return fetchAndStream(url, res, webpageUrl);
    }

    // For YouTube videos requiring format merging via yt-dlp
    downloadViaYtdlp(url, webpageUrl, safeFilename, res);
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

function fetchAndStream(mediaUrl, res, webpageUrl) {
    try {
        const parsed = new URL(mediaUrl);
        let referer = webpageUrl || 'https://www.google.com';
        if (parsed.hostname.includes('bilibili') || parsed.hostname.includes('hdslb')) {
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
            if (streamRes.statusCode >= 400) {
                // Fallback attempt without Referer
                protocol.get(mediaUrl, { headers: { 'User-Agent': options.headers['User-Agent'] } }, (fbRes) => {
                    if (fbRes.statusCode >= 400) {
                        return downloadViaYtdlp(mediaUrl, webpageUrl, 'download.mp4', res);
                    }
                    fbRes.pipe(res);
                }).on('error', () => {
                    downloadViaYtdlp(mediaUrl, webpageUrl, 'download.mp4', res);
                });
                return;
            }
            streamRes.pipe(res);
        }).on('error', () => {
            downloadViaYtdlp(mediaUrl, webpageUrl, 'download.mp4', res);
        });
    } catch (e) {
        downloadViaYtdlp(mediaUrl, webpageUrl, 'download.mp4', res);
    }
}

function downloadViaYtdlp(url, webpageUrl, safeFilename, res) {
    const targetUrl = webpageUrl || url;
    const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);

    const args = [
        targetUrl,
        '-f', 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', tempFilePath
    ];

    if (targetUrl.includes('bilibili')) {
        args.push('--add-header', 'Referer:https://www.bilibili.com/');
    }

    const ytdlp = spawn('python', ['-m', 'yt_dlp', ...args]);

    ytdlp.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempFilePath)) {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
            res.setHeader('Content-Type', 'video/mp4');

            const fileStream = fs.createReadStream(tempFilePath);
            fileStream.pipe(res);

            fileStream.on('end', () => {
                fs.unlink(tempFilePath, () => {});
            });
        } else {
            if (fs.existsSync(tempFilePath)) {
                fs.unlink(tempFilePath, () => {});
            }
            res.status(500).send('影片下載合併失敗，請重試。');
        }
    });
}

app.listen(PORT, () => {
    console.log(`🌸 社群影音與圖文下載系統已啟動：http://localhost:${PORT}`);
});
