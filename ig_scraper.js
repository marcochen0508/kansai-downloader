const https = require('https');
const querystring = require('querystring');
const vm = require('vm');

function resolveSnapSave(targetUrl) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({ url: targetUrl });
        const options = {
            hostname: 'snapsave.app',
            port: 443,
            path: '/action.php?lang=en',
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://snapsave.app/',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    let decodedHtml = '';
                    const context = {
                        window: { location: { hostname: 'snapsave.app' } },
                        document: {
                            getElementById: (id) => ({
                                set innerHTML(val) { decodedHtml = val; },
                                remove: () => {}
                            }),
                            querySelector: () => null,
                            documentElement: {}
                        },
                        gtag: () => {},
                        getPosition: () => ({ y: 0 }),
                        animate: () => {}
                    };
                    vm.createContext(context);
                    vm.runInContext(body, context);

                    if (!decodedHtml) {
                        return reject(new Error('Empty decoded HTML from SnapSave'));
                    }

                    // Extract all downloadable media links from decoded HTML
                    const videos = [];
                    const images = [];

                    // Extract thumbnail
                    let thumbnail = '';
                    const thumbMatch = decodedHtml.match(/<img[^>]+src="([^"]+)"/);
                    if (thumbMatch) {
                        thumbnail = thumbMatch[1].replace(/&amp;/g, '&');
                    }

                    // Find download buttons / links
                    // Pattern A: Table or card buttons
                    const linkMatches = [...decodedHtml.matchAll(/href="([^"]+)"/g)];
                    for (const m of linkMatches) {
                        const rawUrl = m[1].replace(/&amp;/g, '&');
                        if (rawUrl.startsWith('http') && (rawUrl.includes('rapidcdn') || rawUrl.includes('cdninstagram') || rawUrl.includes('fbcdn') || rawUrl.includes('.mp4'))) {
                            if (!videos.includes(rawUrl)) {
                                videos.push(rawUrl);
                            }
                        } else if (rawUrl.startsWith('http') && (rawUrl.includes('.jpg') || rawUrl.includes('.jpeg') || rawUrl.includes('.png') || rawUrl.includes('.webp'))) {
                            if (!images.includes(rawUrl)) {
                                images.push(rawUrl);
                            }
                        }
                    }

                    if (videos.length > 0 || images.length > 0) {
                        resolve({
                            success: true,
                            videos,
                            images,
                            thumbnail: thumbnail || (images.length > 0 ? images[0] : '')
                        });
                    } else {
                        reject(new Error('No media links found in SnapSave HTML'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('SnapSave request timed out'));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function main() {
    const url = process.argv[2];
    if (!url) {
        console.log(JSON.stringify({ success: false, error: 'No URL provided' }));
        process.exit(1);
    }

    try {
        const result = await resolveSnapSave(url);
        console.log(JSON.stringify(result));
    } catch (e) {
        console.log(JSON.stringify({ success: false, error: e.message }));
    }
}

if (require.main === module) {
    main();
}

module.exports = { resolveSnapSave };
