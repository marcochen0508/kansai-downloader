const fs = require('fs');
const path = require('path');
const https = require('https');

const binDir = path.join(__dirname, 'bin');
if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
}

const platform = process.platform;
let filename = 'yt-dlp';
if (platform === 'win32') {
    filename = 'yt-dlp.exe';
} else if (platform === 'darwin') {
    filename = 'yt-dlp_macos';
}

const targetPath = path.join(binDir, filename);
const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${filename}`;

console.log(`🌸 Platform: ${platform}`);
console.log(`🌸 Downloading latest yt-dlp from: ${downloadUrl}`);
console.log(`🌸 Target path: ${targetPath}`);

function download(url, dest, cb) {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
        // Handle redirect
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            file.close();
            fs.unlink(dest, () => {});
            return download(response.headers.location, dest, cb);
        }

        if (response.statusCode !== 200) {
            file.close();
            fs.unlink(dest, () => {});
            return cb(new Error(`Server responded with status code: ${response.statusCode}`));
        }

        response.pipe(file);

        file.on('finish', () => {
            file.close(() => {
                // Set executable permission on Linux/macOS
                if (process.platform !== 'win32') {
                    try {
                        fs.chmodSync(dest, 0o755);
                        console.log(`🌸 Set executable permissions (chmod +x) for ${dest}`);
                    } catch (err) {
                        console.warn(`⚠️ Failed to set executable permissions: ${err.message}`);
                    }
                }
                cb(null);
            });
        });
    }).on('error', (err) => {
        file.close();
        fs.unlink(dest, () => {});
        cb(err);
    });
}

download(downloadUrl, targetPath, (err) => {
    if (err) {
        console.error('❌ Failed to download yt-dlp:', err);
        process.exit(1);
    } else {
        console.log('✅ yt-dlp downloaded successfully!');
        process.exit(0);
    }
});
