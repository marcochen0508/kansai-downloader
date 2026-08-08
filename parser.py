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

# Cookie file path (same directory as this script)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_IG_COOKIE_FILE = os.path.join(_SCRIPT_DIR, 'ig_cookies.txt')

def _get_cookie_opts(url=''):
    """Return cookiefile option if ig_cookies.txt exists and URL is Meta (IG/Threads/FB)."""
    url_lower = url.lower()
    is_meta = any(d in url_lower for d in ['instagram.com', 'instagr.am', 'threads.net', 'threads.com', 'facebook.com', 'fb.watch', 'fb.com'])
    if is_meta and os.path.isfile(_IG_COOKIE_FILE):
        return {'cookiefile': _IG_COOKIE_FILE}
    return {}

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
    elif 't.me/' in url_lower or 'telegram.me' in url_lower:
        return {'id': 'telegram', 'name': 'Telegram', 'icon': '✈️', 'color': '#0088cc'}
    else:
        return {'id': 'general', 'name': extractor_key or '社群影音平台', 'icon': '🌐', 'color': '#3b82f6'}

def _media_id_to_shortcode(media_id):
    """Convert an Instagram/Threads integer media ID to its base64url shortcode."""
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    result = ''
    n = int(media_id)
    while n > 0:
        result = alphabet[n % 64] + result
        n //= 64
    return result

def _ytdlp_resolve(url):
    """
    Run yt-dlp on a Threads URL.  Returns the resolved post URL string if
    successful, or raises an exception whose message may contain the real URL.
    """
    from yt_dlp import YoutubeDL
    ydl_opts = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'nocheckcertificate': True, **_get_cookie_opts(url)}
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if info and info.get('webpage_url'):
            resolved = info['webpage_url']
            resolved = re.sub(r'https?://(www\.)?threads\.com', 'https://www.threads.net',
                              resolved, flags=re.IGNORECASE)
            return resolved.split('?')[0]
    return None

def resolve_threads_share(share_url):
    """Resolve a Threads /share/ short-link to the real @username/post/ID URL.

    Strategy:
    1. Run yt-dlp; it internally follows the JS redirect and either succeeds or
       raises "Unsupported URL: <real_url>".
    2. From the error, try to extract "@username/post/ID".
    3. If yt-dlp returned an "injected_media_ids" URL instead, decode the media
       ID to a shortcode and try yt-dlp again on /p/<shortcode>/.
    4. Fall back to the share URL if nothing works.
    """
    net_url = re.sub(r'https?://(www\.)?threads\.com', 'https://www.threads.net',
                     share_url, flags=re.IGNORECASE)
    try:
        result = _ytdlp_resolve(net_url)
        if result:
            return result
    except Exception as e:
        err_str = str(e)
        # Case A: error contains @username/post/ID
        m = re.search(r'threads\.(?:com|net)/(@[^/\s?&"]+/post/[^/\s?&"]+)', err_str, re.IGNORECASE)
        if m:
            return f"https://www.threads.net/{m.group(1)}"

        # Case B: error contains injected_media_ids with a numeric media ID
        m2 = re.search(r'injected_media_ids[^"]*?%5B%22(\d+)', err_str)
        if not m2:
            m2 = re.search(r'injected_media_ids[^"]*?\["(\d+)', err_str)
        if m2:
            shortcode = _media_id_to_shortcode(m2.group(1))
            candidate = f"https://www.threads.net/p/{shortcode}/"
            try:
                result2 = _ytdlp_resolve(candidate)
                if result2:
                    return result2
            except Exception as e2:
                err2 = str(e2)
                m3 = re.search(r'threads\.(?:com|net)/(@[^/\s?&"]+/post/[^/\s?&"]+)', err2, re.IGNORECASE)
                if m3:
                    return f"https://www.threads.net/{m3.group(1)}"

    return net_url  # fallback – will likely produce wrong results

def normalize_url(url):
    url = url.strip()
    # Handle threads.com → threads.net domain alias
    url = re.sub(r'https?://(www\.)?threads\.com', 'https://www.threads.net', url, flags=re.IGNORECASE)
    if 'threads.net' in url:
        # /share/ short-links require JS to resolve – use yt-dlp to extract the real URL
        if re.search(r'threads\.net/share/', url, re.IGNORECASE):
            url = resolve_threads_share(url)
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

def scrape_telegram_fallback(url):
    m = re.search(r't\.me/([^/]+)/(\d+)', url)
    if not m:
        return {"success": False, "error": "無效的 Telegram 貼文連結。"}
    channel, msg_id = m.group(1), m.group(2)
    embed_url = f"https://t.me/{channel}/{msg_id}?embed=1"
    
    req = urllib.request.Request(embed_url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            html_text = resp.read().decode('utf-8')
            
        videos_raw = re.findall(r'<video[^>]+src=["\']([^"\']+)["\']', html_text)
        images_raw = re.findall(r'background-image:url\([\'"]?([^\'"]+)[\'"]?\)', html_text)
        title_m = re.search(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', html_text, re.DOTALL)
        
        description = ""
        if title_m:
            description = re.sub(r'<[^>]+>', '', title_m.group(1)).strip()
        description = html_lib.unescape(description)
        
        title = description[:40].replace('\n', ' ') if description else f"Telegram 頻道貼文 ({channel})"
        uploader = f"@{channel}"
        
        videos = []
        audios = []
        images = []
        
        for idx, v_url in enumerate(videos_raw, 1):
            clean_v_url = html_lib.unescape(v_url)
            v_label = f"影片 {idx} (MP4)" if len(videos_raw) > 1 else "高畫質影片 (MP4)"
            videos.append({
                'quality': v_label,
                'height': 720,
                'ext': 'mp4',
                'has_audio': True,
                'size': '',
                'url': clean_v_url,
                'format_id': 'direct',
                'webpage_url': url
            })
            a_label = f"提取影片 {idx} 原聲 (MP3)" if len(videos_raw) > 1 else "提取原聲 (MP3)"
            audios.append({
                'quality': a_label,
                'ext': 'mp3',
                'size': '',
                'url': clean_v_url,
                'format_id': 'bestaudio',
                'webpage_url': url
            })
            
        for img in images_raw:
            clean_img = html_lib.unescape(img)
            if 'telegram.org' not in clean_img and clean_img not in images:
                images.append(clean_img)
                
        thumbnail = images[0] if images else (videos[0]['url'] if videos else "")
        
        if not videos and not images:
            return {"success": False, "error": "該 Telegram 貼文無可下載的影音或圖片。"}
            
        return {
            "success": True,
            "platform": {"id": "telegram", "name": "Telegram", "icon": "✈️", "color": "#0088cc"},
            "title": f"{uploader} - {title}",
            "description": description,
            "uploader": uploader,
            "thumbnail": thumbnail,
            "videos": videos,
            "audios": audios,
            "images": images,
            "webpage_url": url
        }
    except Exception as e:
        return {"success": False, "error": f"Telegram 解析失敗: {str(e)}"}

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
            
            # Decode efg query param if present to detect video cover frames
            efg_m = re.search(r'efg=([A-Za-z0-9%_\-]+)', ci)
            if efg_m:
                try:
                    efg_raw = urllib.parse.unquote(efg_m.group(1))
                    efg_raw += '=' * (-len(efg_raw) % 4)
                    decoded_efg = base64.b64decode(efg_raw).decode('utf-8', errors='ignore').lower()
                    if 'video' in decoded_efg or 'cover_frame' in decoded_efg:
                        continue
                except Exception:
                    pass

            if 'video' in ci.lower() or 'cover_frame' in ci.lower():
                continue
            
            # Extract photo asset id for dedup (prefer xpv_asset_id from efg, fall back to ig_cache_key)
            photo_asset_id = None
            cache_key_m = re.search(r'ig_cache_key=([A-Za-z0-9_\-]+)', ci)
            if cache_key_m:
                photo_asset_id = cache_key_m.group(1)
            else:
                photo_asset_id = ci.split('?')[0]
            
            if photo_asset_id not in seen_image_keys:
                seen_image_keys.add(photo_asset_id)
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


def _friendly_error(err_msg, url=''):
    """Convert raw yt-dlp error strings into friendly Traditional Chinese messages."""
    e = err_msg.lower()

    # Instagram rate-limit / login required
    if 'instagram' in e or 'instagram' in url.lower():
        if 'rate-limit' in e or 'rate limit' in e or 'login' in e or 'redirected to the login' in e:
            return (
                '⚠️ Instagram 今日解析次數已達上限（伺服器 IP 被 IG 暫時限制）。\n\n'
                '📌 建議做法：\n'
                '1. 請稍等 1～2 小時後再試。\n'
                '2. 或改用手機直接在 IG App 內長按影片儲存。\n'
                '3. 如果貼文有影片，可以試試從 Threads 分享的連結來下載。'
            )
        if 'private' in e or 'not accessible' in e:
            return '❌ 此 Instagram 貼文為私人帳號內容，系統無法存取私人帳號的貼文，請確認該帳號是否為公開帳號。'

    # Facebook private or login required
    if 'facebook' in e or 'facebook' in url.lower() or 'fb.watch' in url.lower():
        if 'login' in e or 'private' in e or 'not accessible' in e:
            return '❌ 此 Facebook 影片為私人內容或需要登入才能觀看，系統無法下載私人貼文，請確認該影片是否設定為「公開」。'

    # Bilibili login / region lock
    if 'bilibili' in e or 'bilibili' in url.lower() or 'b23.tv' in url.lower():
        if 'login' in e or 'vip' in e or 'member' in e:
            return '❌ 此 B 站影片需要登入或 B 站大會員才能觀看，系統目前無法下載需要付費或登入的 B 站內容。'

    # YouTube age restriction / private / live
    if 'youtube' in e or 'youtube' in url.lower() or 'youtu.be' in url.lower():
        if 'private' in e:
            return '❌ 此 YouTube 影片為不公開或私人影片，無法下載。'
        if 'age' in e or 'sign in' in e:
            return '⚠️ 此 YouTube 影片有年齡限制，需要登入驗證才能存取，系統目前無法下載此類影片。'
        if 'live' in e:
            return '⚠️ 此 YouTube 影片為直播進行中，無法下載尚未結束的直播，請等直播結束後再試。'

    # Generic network / timeout errors
    if 'timeout' in e or 'timed out' in e or 'connection' in e or 'network' in e:
        return '⚠️ 伺服器連線逾時或網路不穩，請稍後再試一次。'

    # Generic unsupported URL
    if 'unsupported url' in e or 'no video formats' in e:
        return '❌ 無法辨識此連結的影音內容，請確認網址是否正確，以及該貼文是否包含影片或圖片。'

    # Default fallback — still in Chinese but trimmed
    short = err_msg[:120] if len(err_msg) > 120 else err_msg
    return f'解析失敗，請確認連結是否正確且公開。（{short}）'


def parse_url(target_url):
    clean_target_url = normalize_url(target_url)

    if 'twitter.com' in clean_target_url or 'x.com' in clean_target_url:
        x_res = scrape_twitter_fallback(clean_target_url)
        if x_res.get('success'):
            return x_res

    if 't.me/' in clean_target_url or 'telegram.me' in clean_target_url:
        tg_res = scrape_telegram_fallback(clean_target_url)
        if tg_res.get('success'):
            return tg_res

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
        **_get_cookie_opts(clean_target_url),
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
            is_youtube = 'youtube.com' in clean_target_url or 'youtu.be' in clean_target_url
            is_instagram = 'instagram.com' in clean_target_url or 'instagr.am' in clean_target_url
            is_facebook = 'facebook.com' in clean_target_url or 'fb.watch' in clean_target_url or 'fb.com' in clean_target_url

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

                # Instagram / Facebook progressive formats (has audio + video) → mark as 'direct' for fast CDN streaming.
                # DASH video-only formats are kept but stay as-is; server will re-run yt-dlp to merge audio+video.

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

                    effective_format_id = format_id
                    # YouTube: tag progressive (combined) formats as 'direct' so server streams without merge
                    if is_youtube and acodec != 'none' and vcodec != 'none':
                        effective_format_id = 'direct'
                        res_label += ' (直接下載)'
                    # Instagram / Facebook progressive (has audio): mark as 'direct' for fast CDN streaming
                    elif (is_instagram or is_facebook) and acodec != 'none' and vcodec != 'none':
                        effective_format_id = 'direct'
                    # Instagram / Facebook DASH video-only: keep format_id as-is, server will use yt-dlp to merge
                    elif (is_instagram or is_facebook) and acodec == 'none':
                        res_label += ' (需合併音訊)'

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
                            'format_id': effective_format_id,
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
        if 't.me/' in clean_target_url or 'telegram.me' in clean_target_url:
            tg_res = scrape_telegram_fallback(clean_target_url)
            if tg_res.get('success'):
                return tg_res

        # Friendly Chinese error messages for common platform errors
        friendly_msg = _friendly_error(err_msg, clean_target_url)
        return {"success": False, "error": friendly_msg}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "請提供有效的影片或貼文網址。"}))
        sys.exit(1)

    target_url = sys.argv[1]
    res = parse_url(target_url)
    print(json.dumps(res, ensure_ascii=False))
