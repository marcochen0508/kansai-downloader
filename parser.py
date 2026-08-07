import sys
import json
import re
import html as html_lib
import urllib.request
import urllib.parse
import ssl
import base64

import os
import glob
site_dirs = glob.glob('/opt/render/.local/lib/python*/site-packages') + glob.glob(os.path.expanduser('~/.local/lib/python*/site-packages'))
for d in site_dirs:
    if d not in sys.path:
        sys.path.insert(0, d)

# Force stdout to UTF-8 for Windows compatibility
sys.stdout.reconfigure(encoding='utf-8')

from yt_dlp import YoutubeDL

def detect_platform(url, extractor_key=None):
    url_lower = url.lower()
    if 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return {'id': 'youtube', 'name': 'YouTube', 'icon': '🔴', 'color': '#ff0000'}
    elif 'instagram.com' in url_lower or 'instagr.am' in url_lower:
        return {'id': 'instagram', 'name': 'Instagram', 'icon': '📸', 'color': '#e1306c'}
    elif 'facebook.com' in url_lower or 'fb.watch' in url_lower or 'fb.com' in url_lower:
        return {'id': 'facebook', 'name': 'Facebook', 'icon': '🔵', 'color': '#1877f2'}
    elif 'tiktok.com' in url_lower or 'douyin.com' in url_lower:
        return {'id': 'tiktok', 'name': 'TikTok / 抖音', 'icon': '🎵', 'color': '#000000'}
    elif 'threads.net' in url_lower or 'threads.com' in url_lower:
        return {'id': 'threads', 'name': 'Threads', 'icon': '🧵', 'color': '#000000'}
    elif 'twitter.com' in url_lower or 'x.com' in url_lower:
        return {'id': 'twitter', 'name': 'X (Twitter)', 'icon': '🖤', 'color': '#1da1f2'}
    elif 'xiaohongshu.com' in url_lower or 'xhslink.com' in url_lower:
        return {'id': 'xiaohongshu', 'name': '小紅書 RED', 'icon': '📕', 'color': '#ff2442'}
    elif 'bilibili.com' in url_lower or 'b23.tv' in url_lower:
        return {'id': 'bilibili', 'name': 'Bilibili 嗶哩嗶哩', 'icon': '📺', 'color': '#00a1d6'}
    elif 'pinterest.com' in url_lower or 'pin.it' in url_lower:
        return {'id': 'pinterest', 'name': 'Pinterest', 'icon': '📌', 'color': '#e60023'}
    else:
        return {'id': 'general', 'name': extractor_key or '社群影音平台', 'icon': '🌐', 'color': '#3b82f6'}

def normalize_url(url):
    url = url.strip()
    url = re.sub(r'https?://(www\.)?threads\.com', 'https://www.threads.net', url, flags=re.IGNORECASE)
    if 'threads.net' in url:
        m = re.search(r'threads\.net/(@[^/]+/post/[^/\?]+)', url, re.IGNORECASE)
        if m:
            url = f"https://www.threads.net/{m.group(1)}"
        else:
            url = url.split('?')[0]
    elif 'tiktok.com' in url or 'douyin.com' in url:
        url = url.split('?')[0]
    return url

def scrape_twitter_fallback(url):
    m = re.search(r'(?:twitter|x)\.com/([^/]+)/status/(\d+)', url, re.IGNORECASE)
    if not m:
        return {"success": False, "error": "無效的 X (Twitter) 網址格式。"}
    
    screen_name = m.group(1)
    status_id = m.group(2)
    api_url = f"https://api.vxtwitter.com/{screen_name}/status/{status_id}"
    
    req = urllib.request.Request(api_url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            
            uploader = data.get('user_name') or f"@{screen_name}"
            text = data.get('text') or "X (Twitter) 動態"
            
            title = text[:50].replace('\n', ' ')
            if uploader not in title:
                title = f"{uploader} - {title}"

            media_extended = data.get('media_extended', [])
            
            videos = []
            audios = []
            images = []
            
            vid_idx = 1
            img_idx = 1
            
            for item in media_extended:
                m_type = item.get('type')
                m_url = item.get('url')
                
                if not m_url:
                    continue
                    
                if m_type in ['video', 'gif']:
                    label = f"影片 {vid_idx} (高畫質 MP4)" if vid_idx > 1 else "高畫質影片 (MP4)"
                    videos.append({
                        'quality': label,
                        'height': 720,
                        'ext': 'mp4',
                        'has_audio': True,
                        'size': '',
                        'url': m_url,
                        'format_id': 'direct',
                        'webpage_url': url
                    })
                    
                    audio_label = f"提取影片 {vid_idx} 原聲 (MP3)" if vid_idx > 1 else "提取原聲 (MP3)"
                    audios.append({
                        'quality': audio_label,
                        'ext': 'mp3',
                        'size': '',
                        'url': m_url,
                        'format_id': 'bestaudio',
                        'webpage_url': url
                    })
                    vid_idx += 1
                    
                elif m_type == 'image':
                    high_res_photo = m_url
                    if 'pbs.twimg.com/media/' in high_res_photo:
                        base = high_res_photo.split('?')[0]
                        high_res_photo = f"{base}?name=large"
                    images.append(high_res_photo)
                    img_idx += 1

            thumbnail = images[0] if images else (videos[0]['url'] if videos else "")

            return {
                "success": True,
                "platform": {"id": "twitter", "name": "X (Twitter)", "icon": "🖤", "color": "#1da1f2"},
                "title": title,
                "description": text,
                "uploader": uploader,
                "thumbnail": thumbnail,
                "videos": videos,
                "audios": audios,
                "images": images,
                "webpage_url": url
            }
    except Exception as e:
        return {"success": False, "error": f"X (Twitter) 解析失敗: {str(e)}"}

def scrape_threads_fallback(url):
    clean_url = normalize_url(url)
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept-Language': 'zh-TW,zh-Hant;q=0.9,en;q=0.8'
    }
    
    req = urllib.request.Request(clean_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            html_text = resp.read().decode('utf-8')
            
            # Extract video URLs
            raw_video_urls = set()
            vids = re.findall(r'"video_versions":\[(.*?)\]', html_text)
            for v in vids:
                urls = re.findall(r'"url":"([^"]+)"', v)
                for u in urls:
                    clean_u = html_lib.unescape(u.replace('\\/', '/').replace('\\u0026', '&'))
                    raw_video_urls.add(clean_u)
                    
            if not raw_video_urls:
                mp4_matches = re.findall(r'https:[^\s"&]*?\.mp4[^\s"&]*', html_text)
                for m in mp4_matches:
                    clean_u = html_lib.unescape(urllib.parse.unquote(m).replace('\\/', '/').replace('\\u0026', '&'))
                    raw_video_urls.add(clean_u)

            # Deduplicate video URLs
            unique_video_list = []
            seen_video_bases = set()
            for v in list(raw_video_urls):
                base_path = v.split('?')[0]
                if base_path not in seen_video_bases:
                    seen_video_bases.add(base_path)
                    unique_video_list.append(v)

            # Thumbnail / Cover Image
            thumbnail = ""
            thumb_m = re.search(r'<meta\s+property="og:image"[^>]*content="([^"]*)"', html_text)
            if thumb_m:
                thumbnail = html_lib.unescape(thumb_m.group(1).replace('&amp;', '&'))

            # Extract photos
            unique_image_list = []
            if unique_video_list:
                if thumbnail:
                    unique_image_list.append(thumbnail)
            else:
                raw_image_urls = set()
                imgs = re.findall(r'"display_resources":\[(.*?)\]', html_text) or re.findall(r'"candidates":\[(.*?)\]', html_text)
                for img_block in imgs:
                    urls = re.findall(r'"src":"([^"]+)"', img_block) or re.findall(r'"url":"([^"]+)"', img_block)
                    for u in urls:
                        clean_u = html_lib.unescape(u.replace('\\/', '/').replace('\\u0026', '&'))
                        if ('cdninstagram' in clean_u or 'fbcdn' in clean_u) and not clean_u.endswith('.mp4'):
                            raw_image_urls.add(clean_u)

                if not raw_image_urls and thumbnail:
                    raw_image_urls.add(thumbnail)

                seen_img_bases = set()
                for img in list(raw_image_urls):
                    base_path = img.split('?')[0]
                    if base_path not in seen_img_bases:
                        seen_img_bases.add(base_path)
                        unique_image_list.append(img)

            # Caption & Title
            desc_m = re.search(r'<meta\s+property="og:description"[^>]*content="([^"]*)"', html_text)
            description = html_lib.unescape(desc_m.group(1)) if desc_m else ""
            
            uploader = "Threads 創作者"
            m_user = re.search(r'@([a-zA-Z0-9_\.]+)', clean_url)
            if m_user:
                uploader = f"@{m_user.group(1)}"

            title = description[:45] if description else "Threads 影音動態"
            if uploader and uploader not in title:
                title = f"{uploader} - {title}"

            videos = []
            audios = []
            for i, v_url in enumerate(unique_video_list):
                label = f"影片 {i + 1} (高畫質 MP4)" if len(unique_video_list) > 1 else "高畫質影片 (MP4)"
                videos.append({
                    'quality': label,
                    'height': 720,
                    'ext': 'mp4',
                    'has_audio': True,
                    'size': '',
                    'url': v_url,
                    'format_id': 'direct',
                    'webpage_url': clean_url
                })

                audio_label = f"提取影片 {i + 1} 原聲 (MP3)" if len(unique_video_list) > 1 else "提取原聲 (MP3)"
                audios.append({
                    'quality': audio_label,
                    'ext': 'mp3',
                    'size': '',
                    'url': v_url,
                    'format_id': 'bestaudio',
                    'webpage_url': clean_url
                })

            return {
                "success": True,
                "platform": {"id": "threads", "name": "Threads", "icon": "🧵", "color": "#000000"},
                "title": title,
                "description": description,
                "uploader": uploader,
                "thumbnail": thumbnail,
                "videos": videos,
                "audios": audios,
                "images": unique_image_list[:8],
                "webpage_url": clean_url
            }
    except Exception as e:
        return {"success": False, "error": f"Threads 解析失敗: {str(e)}"}

def scrape_tiktok_fallback(url):
    clean_url = normalize_url(url)
    api_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(clean_url)}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    }
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(api_url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('code') == 0:
                d = data.get('data', {})
                raw_title = d.get('title') or "TikTok 短影音"
                uploader = d.get('author', {}).get('nickname') or d.get('author', {}).get('unique_id') or "TikTok 創作者"
                video_url = d.get('play')
                music_url = d.get('music')
                cover_url = d.get('cover')

                videos = []
                audios = []
                images = []

                if video_url:
                    videos.append({
                        'quality': '高畫質無浮水印影片 (MP4)',
                        'height': 720,
                        'ext': 'mp4',
                        'has_audio': True,
                        'size': '',
                        'url': video_url,
                        'format_id': 'direct',
                        'webpage_url': clean_url
                    })

                if music_url:
                    audios.append({
                        'quality': '提取原聲 (MP3)',
                        'ext': 'mp3',
                        'size': '',
                        'url': music_url,
                        'format_id': 'bestaudio',
                        'webpage_url': clean_url
                    })

                if cover_url:
                    images.append(cover_url)

                title = f"{uploader} - {raw_title[:35]}" if uploader not in raw_title else raw_title[:45]

                return {
                    "success": True,
                    "platform": {"id": "tiktok", "name": "TikTok / 抖音", "icon": "🎵", "color": "#000000"},
                    "title": title,
                    "description": raw_title,
                    "uploader": uploader,
                    "thumbnail": cover_url or "",
                    "videos": videos,
                    "audios": audios,
                    "images": images,
                    "webpage_url": clean_url
                }
    except Exception as e:
        pass

    return {"success": False, "error": "TikTok 解析失敗。"}

def scrape_red_fallback(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh-Hant;q=0.9,en;q=0.8',
        'Cookie': 'webId=guest;'
    }
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            html_text = resp.read().decode('utf-8')
            
            title_m = re.search(r'<meta\s+property="og:title"\s+content="([^"]*)"', html_text) or re.search(r'<title>([^<]*)</title>', html_text)
            title = html_lib.unescape(title_m.group(1)) if title_m else "小紅書動態"
            
            desc_m = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html_text) or re.search(r'<meta\s+property="og:description"\s+content="([^"]*)"', html_text)
            description = html_lib.unescape(desc_m.group(1)) if desc_m else ""

            video_m = re.search(r'<meta\s+property="og:video"\s+content="([^"]*)"', html_text) or re.search(r'"originVideoKey":"([^"]+)"', html_text) or re.search(r'https:[^\s"&]*?\.mp4[^\s"&]*', html_text)
            video_url = html_lib.unescape(video_m.group(1).replace('\\/', '/')) if video_m else None
            
            raw_images = set()
            img_matches = re.findall(r'https:[^\s"&]*?xhscdn\.com[^\s"&]*', html_text)
            for m in img_matches:
                clean_u = html_lib.unescape(m.replace('\\/', '/').replace('\\u0026', '&'))
                if not clean_u.endswith('.mp4') and 'avatar' not in clean_u and 'logo' not in clean_u:
                    raw_images.add(clean_u.split('?')[0] + "?imageMogr2/format/jpg")

            images = list(raw_images)[:8]
            
            videos = []
            audios = []
            if video_url:
                videos.append({
                    'quality': '高畫質影片 (MP4)',
                    'height': 720,
                    'ext': 'mp4',
                    'has_audio': True,
                    'size': '',
                    'url': video_url,
                    'format_id': 'direct',
                    'webpage_url': url
                })
                audios.append({
                    'quality': '提取原聲 (MP3)',
                    'ext': 'mp3',
                    'size': '',
                    'url': video_url,
                    'format_id': 'bestaudio',
                    'webpage_url': url
                })

            return {
                "success": True,
                "platform": {"id": "xiaohongshu", "name": "小紅書 RED", "icon": "📕", "color": "#ff2442"},
                "title": title,
                "description": description,
                "uploader": "小紅書創作者",
                "thumbnail": images[0] if images else "",
                "videos": videos,
                "audios": audios,
                "images": images,
                "webpage_url": url
            }
    except Exception as e:
        return {"success": False, "error": f"小紅書解析失敗: {str(e)}"}

def scrape_threads_fallback(url):
    clean_url = url.replace('threads.com', 'threads.net').split('?')[0].rstrip('/')
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh-Hant;q=0.9,en;q=0.8',
    }

    try:
        html_text = ""
        try:
            from curl_cffi import requests as cffi_requests
            r = cffi_requests.get(clean_url, headers=headers, impersonate="chrome120", timeout=10)
            if r.status_code == 200:
                html_text = r.text
        except Exception:
            pass

        if not html_text:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(clean_url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                html_text = resp.read().decode('utf-8')

        title_m = re.search(r'<meta\s+property="og:title"\s+content="([^"]*)"', html_text) or re.search(r'<title>([^<]*)</title>', html_text)
        title = html_lib.unescape(title_m.group(1)) if title_m else "Threads 貼文"
        
        desc_m = re.search(r'<meta\s+property="og:description"\s+content="([^"]*)"', html_text) or re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html_text)
        description = html_lib.unescape(desc_m.group(1)) if desc_m else ""

        thumb_m = re.search(r'<meta\s+property="og:image"\s+content="([^"]*)"', html_text)
        thumbnail = html_lib.unescape(thumb_m.group(1)) if thumb_m else ""

        # Extract primary video URL (filter out duplicate segment streams)
        raw_videos = re.findall(r'https:[^"\']+\.mp4[^"\']*', html_text)
        best_video_url = None
        for v in raw_videos:
            cv = html_lib.unescape(v.replace('\\/', '/').replace('\\u0026', '&'))
            if 'progressive' in cv or '720' in cv:
                best_video_url = cv
                break
        if not best_video_url and raw_videos:
            best_video_url = html_lib.unescape(raw_videos[0].replace('\\/', '/').replace('\\u0026', '&'))

        video_options = []
        audio_options = []
        if best_video_url:
            video_options.append({
                "quality": "高畫質影片 (MP4)",
                "height": 720,
                "ext": "mp4",
                "has_audio": True,
                "size": "",
                "url": best_video_url,
                "thumbnail": thumbnail,
                "format_id": "direct",
                "webpage_url": clean_url
            })
            audio_options.append({
                "quality": "提取原聲 (MP3)",
                "ext": "mp3",
                "size": "",
                "url": best_video_url,
                "thumbnail": thumbnail,
                "format_id": "bestaudio",
                "webpage_url": clean_url
            })

        # Deduplicate images cleanly & filter out video cover frame thumbnails
        clean_images = []
        seen_image_keys = set()
        
        raw_images = re.findall(r'https:[^"\']+\.jpg[^"\']*', html_text)
        for img in raw_images:
            ci = html_lib.unescape(img.replace('\\/', '/').replace('\\u0026', '&'))
            if 'cdninstagram.com' not in ci or '.mp4' in ci or 's150x150' in ci or 'rsrc.php' in ci or 'profile' in ci:
                continue
            
            # Filter out video cover frame thumbnails (both plain and URL encoded)
            if 'cover_frame' in ci.lower() or 'video_default' in ci.lower() or 'video_cover' in ci.lower():
                continue
            
            id_m = re.search(r'/(\d+_\d+_\d+_[a-z0-9_]+\.jpg)', ci) or re.search(r'/(\d+_\d+_\d+_n\.jpg)', ci)
            img_key = id_m.group(1) if id_m else ci.split('?')[0]
            
            if img_key not in seen_image_keys:
                seen_image_keys.add(img_key)
                if ci not in clean_images:
                    clean_images.append(ci)

        platform = {"id": "threads", "name": "Threads", "icon": "🧵", "color": "#000000"}

        return {
            "success": True,
            "platform": platform,
            "title": title,
            "description": description or title,
            "uploader": "Threads 創作者",
            "thumbnail": thumbnail,
            "videos": video_options,
            "audios": audio_options,
            "images": clean_images[:5],
            "webpage_url": clean_url
        }
    except Exception as e:
        return {"success": False, "error": f"Threads 解析失敗: {str(e)}"}

def parse_url(target_url):
    clean_target_url = normalize_url(target_url)

    if 'twitter.com' in clean_target_url or 'x.com' in clean_target_url:
        x_res = scrape_twitter_fallback(clean_target_url)
        if x_res.get('success'):
            return x_res

    if 'threads.net' in clean_target_url or 'threads.com' in clean_target_url:
        threads_res = scrape_threads_fallback(clean_target_url)
        if threads_res.get('success'):
            return threads_res

    if 'threads.net' in clean_target_url or 'threads.com' in clean_target_url:
        threads_res = scrape_threads_fallback(clean_target_url)
        if threads_res.get('success'):
            return threads_res

    if 'tiktok.com' in clean_target_url or 'douyin.com' in clean_target_url:
        tt_res = scrape_tiktok_fallback(clean_target_url)
        if tt_res.get('success'):
            return tt_res

    if 'xiaohongshu.com' in clean_target_url or 'xhslink.com' in clean_target_url:
        red_res = scrape_red_fallback(clean_target_url)
        if red_res.get('success'):
            return red_res

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'allow_unplayable_formats': True,
        'nocheckcertificate': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_target_url, download=False)
            
            if not info:
                return {"success": False, "error": "無法解析該網址，請確認連結是否公開且正確。"}

            if 'entries' in info and info['entries']:
                entries = [e for e in info['entries'] if e]
                if len(entries) > 0:
                    info = entries[0]
            
            extractor = info.get('extractor_key', '') or info.get('extractor', '')
            platform = detect_platform(clean_target_url, extractor)

            raw_title = info.get('title') or ''
            description = info.get('description') or info.get('caption') or ''
            uploader = info.get('uploader') or info.get('uploader_id') or info.get('channel') or ''
            thumbnail = info.get('thumbnail') or ''
            webpage_url = info.get('webpage_url', clean_target_url)

            # Clean default TikTok video #... title to human readable Chinese title
            raw_title = re.sub(r'TikTok video #\d+', 'TikTok 短影音', raw_title, flags=re.IGNORECASE)
            
            title = raw_title.strip()
            if not title or title.lower().startswith('video by') or title.lower().startswith('reel by') or title.lower().startswith('post by') or title.lower().startswith('photo by'):
                clean_desc = re.sub(r'[\r\n]+', ' ', description).strip()
                clean_desc = re.sub(r'#\w+', '', clean_desc).strip()
                if clean_desc:
                    title = clean_desc[:40]
                elif uploader:
                    title = f"{uploader} 的社群動態"
                else:
                    title = "社群影音"

            if uploader and uploader not in title and not title.startswith(uploader):
                title = f"{uploader} - {title}"

            raw_formats = info.get('formats', [])
            video_options = []
            audio_options = []
            images = []

            thumbnails = info.get('thumbnails', [])
            if thumbnails:
                sorted_thumbs = sorted([t for t in thumbnails if t.get('url')], key=lambda x: (x.get('width', 0) or 0)*(x.get('height', 0) or 0), reverse=True)
                if sorted_thumbs:
                    images.append(sorted_thumbs[0]['url'])

            seen_res = set()

            for f in raw_formats:
                f_url = f.get('url')
                if not f_url:
                    continue

                vcodec = f.get('vcodec', 'none')
                acodec = f.get('acodec', 'none')
                ext = f.get('ext', 'mp4')
                height = f.get('height') or 0
                format_note = f.get('format_note', '') or ''
                filesize = f.get('filesize') or f.get('filesize_approx') or 0
                format_id = f.get('format_id') or ''
                
                size_str = ""
                if filesize > 0:
                    size_mb = filesize / (1024 * 1024)
                    size_str = f"{size_mb:.1f} MB"

                if vcodec != 'none':
                    res_label = f"{height}p" if height else (format_note or "預設畫質")
                    if height >= 2160:
                        res_label = "4K 超高畫質 (2160p)"
                    elif height >= 1440:
                        res_label = "2K 高畫質 (1440p)"
                    elif height >= 1080:
                        res_label = "1080p Full HD"
                    elif height >= 720:
                        res_label = "720p HD"
                    elif height >= 480:
                        res_label = "480p 標清"
                    elif height > 0:
                        res_label = f"{height}p"

                    res_key = f"{height}"
                    if res_key not in seen_res:
                        seen_res.add(res_key)
                        video_options.append({
                            'quality': res_label,
                            'height': height,
                            'ext': ext,
                            'has_audio': acodec != 'none',
                            'size': size_str,
                            'url': f_url,
                            'format_id': format_id,
                            'webpage_url': webpage_url
                        })

                elif acodec != 'none' and vcodec == 'none':
                    abr = f.get('abr') or 128
                    audio_options.append({
                        'quality': f"純音檔 ({int(abr)} kbps)",
                        'ext': ext,
                        'size': size_str,
                        'url': f_url,
                        'format_id': format_id,
                        'webpage_url': webpage_url
                    })

            video_options = sorted(video_options, key=lambda x: x['height'], reverse=True)

            if not video_options and info.get('url'):
                video_options.append({
                    'quality': '最佳高畫質',
                    'height': 720,
                    'ext': info.get('ext', 'mp4'),
                    'has_audio': True,
                    'size': '',
                    'url': info.get('url'),
                    'format_id': 'best',
                    'webpage_url': webpage_url
                })

            if video_options and not audio_options:
                audio_options.append({
                    'quality': '提取原聲 (MP3/M4A)',
                    'ext': 'mp3',
                    'size': '',
                    'url': video_options[0]['url'],
                    'format_id': 'bestaudio',
                    'webpage_url': webpage_url
                })

            result = {
                "success": True,
                "platform": platform,
                "title": title,
                "description": description,
                "uploader": uploader or "社群創作者",
                "thumbnail": thumbnail,
                "videos": video_options[:6],
                "audios": audio_options[:3],
                "images": images,
                "webpage_url": webpage_url
            }
            return result

    except Exception as e:
        err_msg = str(e)
        if 'tiktok.com' in clean_target_url or 'douyin.com' in clean_target_url:
            tt_res = scrape_tiktok_fallback(clean_target_url)
            if tt_res.get('success'):
                return tt_res
        if 'threads.com' in clean_target_url or 'threads.net' in clean_target_url:
            th_res = scrape_threads_fallback(clean_target_url)
            if th_res.get('success'):
                return th_res
        return {"success": False, "error": f"解析失敗: {err_msg}"}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "請提供有效的影片或貼文網址。"}))
        sys.exit(1)

    target_url = sys.argv[1]
    res = parse_url(target_url)
    print(json.dumps(res, ensure_ascii=False))
