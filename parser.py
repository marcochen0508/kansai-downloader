import sys
import json
import re
import html as html_lib
import urllib.request
import urllib.parse
import ssl
import base64
import subprocess


import os
import glob
site_dirs = glob.glob('/opt/render/.local/lib/python*/site-packages') + glob.glob(os.path.expanduser('~/.local/lib/python*/site-packages'))
for d in site_dirs:
    if d not in sys.path:
        sys.path.insert(0, d)

# Cookie file path (same directory as this script)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_IG_COOKIE_FILE = os.path.join(_SCRIPT_DIR, 'ig_cookies.txt')
_YT_COOKIE_FILE = os.path.join(_SCRIPT_DIR, 'yt_cookies.txt')

def _get_cookie_opts(url=''):
    """Return cookiefile option if cookiefile exists for Meta or YouTube."""
    url_lower = url.lower()
    is_meta = any(d in url_lower for d in ['instagram.com', 'instagr.am', 'threads.net', 'threads.com', 'facebook.com', 'fb.watch', 'fb.com'])
    is_yt = 'youtube.com' in url_lower or 'youtu.be' in url_lower
    if is_meta and os.path.isfile(_IG_COOKIE_FILE):
        try:
            with open(_IG_COOKIE_FILE, 'r', encoding='utf-8') as cf:
                content = cf.read()
                if 'sessionid' in content:
                    return {'cookiefile': _IG_COOKIE_FILE}
        except Exception:
            pass
    if is_yt and os.path.isfile(_YT_COOKIE_FILE):
        return {'cookiefile': _YT_COOKIE_FILE}
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

        uploader = "Threads 創作者"
        m_user = re.search(r'@([a-zA-Z0-9_\.]+)', clean_url)
        if m_user:
            uploader = f"@{m_user.group(1)}"

        # 1. Extract video URLs strictly from JSON video_versions structure
        video_version_matches = re.findall(r'"video_versions"\s*:\s*(\[[^\]]+\])', html_text)
        unique_video_list = []
        seen_video_bases = set()

        for vv in video_version_matches:
            urls = re.findall(r'"url"\s*:\s*"([^"]+)"', vv)
            for u in urls:
                clean_u = html_lib.unescape(u.replace('\\/', '/').replace('\\u0026', '&'))
                base_path = clean_u.split('?')[0]
                if base_path not in seen_video_bases:
                    seen_video_bases.add(base_path)
                    unique_video_list.append(clean_u)

        # Fallback for video extraction if video_versions array was missing
        if not unique_video_list:
            raw_videos = re.findall(r'https:[^"\']+\.mp4[^"\']*', html_text)
            for v in raw_videos:
                cv = html_lib.unescape(v.replace('\\/', '/').replace('\\u0026', '&'))
                if 'rsrc.php' in cv:
                    continue
                base_path = cv.split('?')[0]
                if base_path not in seen_video_bases:
                    seen_video_bases.add(base_path)
                    unique_video_list.append(cv)

        # 2. Extract cover image / thumbnail (avoid profile pictures)
        thumbnail = ""
        # Priority A: Check for video cover frames (t15.cdninstagram or /t15.)
        v_covers = re.findall(r'https:[^"\']+/t15\.[^"\']+\.jpg[^"\']*', html_text)
        if v_covers:
            thumbnail = html_lib.unescape(v_covers[0].replace('\\/', '/').replace('\\u0026', '&'))

        if not thumbnail:
            cover_matches = re.findall(r'"image_versions2"\s*:\s*\{[^}]*"candidates"\s*:\s*(\[[^\]]+\])', html_text)
            for cm in cover_matches:
                srcs = re.findall(r'"url"\s*:\s*"([^"]+)"', cm)
                for s in srcs:
                    clean_s = html_lib.unescape(s.replace('\\/', '/').replace('\\u0026', '&'))
                    if 'cdninstagram' in clean_s and 'profile' not in clean_s and 's150x150' not in clean_s:
                        thumbnail = clean_s
                        break
                if thumbnail:
                    break

        if not thumbnail:
            thumb_m = re.search(r'<meta\s+property="og:image"\s+content="([^"]*)"', html_text)
            if thumb_m:
                cand = html_lib.unescape(thumb_m.group(1).replace('&amp;', '&'))
                if 'profile_pic' not in cand and 'profile' not in cand:
                    thumbnail = cand

        # 3. Extract post images (only from post display_resources/candidates, excluding profile photos)
        unique_image_list = []
        if not unique_video_list:
            raw_image_urls = set()
            imgs = re.findall(r'"display_resources":\[(.*?)\]', html_text) or re.findall(r'"candidates":\[(.*?)\]', html_text)
            for img_block in imgs:
                urls = re.findall(r'"src":"([^"]+)"', img_block) or re.findall(r'"url":"([^"]+)"', img_block)
                for u in urls:
                    clean_u = html_lib.unescape(u.replace('\\/', '/').replace('\\u0026', '&'))
                    if ('cdninstagram' in clean_u or 'fbcdn' in clean_u) and not clean_u.endswith('.mp4'):
                        if 'profile' not in clean_u and 's150x150' not in clean_u and 'rsrc.php' not in clean_u:
                            raw_image_urls.add(clean_u)

            seen_img_bases = set()
            for img in list(raw_image_urls):
                base_path = img.split('?')[0]
                if base_path not in seen_img_bases:
                    seen_img_bases.add(base_path)
                    unique_image_list.append(img)

        video_options = []
        audio_options = []
        for i, v_url in enumerate(unique_video_list):
            label = f"影片 {i + 1} (高畫質 MP4)" if len(unique_video_list) > 1 else "高畫質影片 (MP4)"
            video_options.append({
                'quality': label,
                'height': 720,
                'ext': 'mp4',
                'has_audio': True,
                'size': '',
                'url': v_url,
                'thumbnail': thumbnail,
                'format_id': 'direct',
                'webpage_url': clean_url
            })

            audio_label = f"提取影片 {i + 1} 原聲 (MP3)" if len(unique_video_list) > 1 else "提取原聲 (MP3)"
            audio_options.append({
                'quality': audio_label,
                'ext': 'mp3',
                'size': '',
                'url': v_url,
                'thumbnail': thumbnail,
                'format_id': 'bestaudio',
                'webpage_url': clean_url
            })

        platform = {"id": "threads", "name": "Threads", "icon": "🧵", "color": "#000000"}

        return {
            "success": True,
            "platform": platform,
            "title": title,
            "description": description or title,
            "uploader": uploader,
            "thumbnail": thumbnail,
            "videos": video_options,
            "audios": audio_options,
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




def scrape_instagram_fallback(url):
    """Fallback scraper for Instagram photo/video posts when yt-dlp fails."""
    clean_url = url.split('?')[0].rstrip('/')
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh-Hant;q=0.9,en;q=0.8',
    }

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(clean_url, headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=12) as resp:
            html_text = resp.read().decode('utf-8', errors='ignore')

        # Extract OG tags
        title_m = re.search(r'<meta\s+property="og:title"\s+content="([^"]*)"', html_text) or \
                  re.search(r'<meta\s+content="([^"]*)"\s+property="og:title"', html_text)
        desc_m = re.search(r'<meta\s+property="og:description"\s+content="([^"]*)"', html_text) or \
                 re.search(r'<meta\s+content="([^"]*)"\s+property="og:description"', html_text)
        thumb_m = re.search(r'<meta\s+property="og:image"\s+content="([^"]*)"', html_text) or \
                  re.search(r'<meta\s+content="([^"]*)"\s+property="og:image"', html_text)

        raw_title = html_lib.unescape(title_m.group(1)) if title_m else 'Instagram 貼文'
        description = html_lib.unescape(desc_m.group(1)) if desc_m else ''
        thumbnail = html_lib.unescape(thumb_m.group(1).replace('&amp;', '&')) if thumb_m else ''

        # Search for JSON caption text inside script tags
        captions = re.findall(r'"caption"\s*:\s*\{\s*"text"\s*:\s*"([^"]+)"', html_text) or \
                   re.findall(r'"text"\s*:\s*"([^"]+)"', html_text)
        if captions:
            for c in captions:
                clean_c = html_lib.unescape(c.encode().decode('unicode_escape', errors='ignore')).strip()
                if len(clean_c) > 5 and not clean_c.startswith("http") and not clean_c.startswith("static"):
                    description = clean_c
                    break

        uploader = 'Instagram 創作者'
        m_user = re.search(r'instagram\.com/([^/]+)/', clean_url)
        if m_user and m_user.group(1) not in ('p', 'reel', 'reels', 'tv'):
            uploader = f"@{m_user.group(1)}"
        elif 'on Instagram' in raw_title:
            parts = raw_title.split('on Instagram')
            if parts[0].strip():
                uploader = parts[0].strip()

        title = raw_title
        if description and (title.startswith('Instagram') or 'on Instagram' in title or 'Photo by' in title or 'Video by' in title):
            title = description[:40]

        if uploader and uploader not in title and not title.startswith(uploader):
            title = f"{uploader} - {title}"

        # Extract high-res images
        images = []
        img_blocks = re.findall(r'"display_resources":\[(.*?)\]', html_text) or \
                     re.findall(r'"candidates":\[(.*?)\]', html_text)
        seen_img = set()
        for block in img_blocks:
            urls = re.findall(r'"src":"([^"]+)"', block) or re.findall(r'"url":"([^"]+)"', block)
            for u in urls:
                clean_u = html_lib.unescape(u.replace('\\/', '/').replace('\\u0026', '&'))
                base = clean_u.split('?')[0]
                if ('cdninstagram' in clean_u or 'fbcdn' in clean_u) and base not in seen_img and not clean_u.endswith('.mp4'):
                    seen_img.add(base)
                    images.append(clean_u)

        if not images and thumbnail:
            images.append(thumbnail)

        # Extract video version URLs if present
        videos = []
        audios = []
        raw_videos = re.findall(r'"video_versions"\s*:\s*(\[[^\]]+\])', html_text) or re.findall(r'"video_url"\s*:\s*"([^"]+)"', html_text)
        if raw_videos:
            v_urls = []
            for v_item in raw_videos:
                if isinstance(v_item, str) and v_item.startswith('['):
                    v_srcs = re.findall(r'"url"\s*:\s*"([^"]+)"', v_item)
                    v_urls.extend(v_srcs)
                elif isinstance(v_item, str):
                    v_urls.append(v_item)
            
            seen_v = set()
            for vu in v_urls:
                clean_vu = html_lib.unescape(vu.replace('\\/', '/').replace('\\u0026', '&'))
                base_v = clean_vu.split('?')[0]
                if base_v not in seen_v:
                    seen_v.add(base_v)
                    videos.append({
                        'quality': '高畫質影片 (MP4)',
                        'height': 1080,
                        'ext': 'mp4',
                        'has_audio': True,
                        'size': '',
                        'url': clean_vu,
                        'format_id': 'direct',
                        'webpage_url': clean_url
                    })
                    audios.append({
                        'quality': '提取 Instagram 影片原聲 (MP3)',
                        'ext': 'mp3',
                        'size': '',
                        'url': clean_vu,
                        'format_id': 'bestaudio',
                        'webpage_url': clean_url
                    })

        if not images and not videos:
            return {"success": False, "error": "無法提取此 Instagram 貼文，可能為私人帳號或連結無效。"}

        return {
            "success": True,
            "platform": {"id": "instagram", "name": "Instagram", "icon": "📸", "color": "#e1306c"},
            "title": title,
            "description": description or title,
            "uploader": uploader,
            "thumbnail": thumbnail,
            "videos": videos,
            "audios": audios,
            "images": images[:10],
            "webpage_url": clean_url
        }
    except Exception as e:
        return {"success": False, "error": f"Instagram 解析失敗: {str(e)}"}


def clean_fb_metadata(fb_title, fb_desc):
    clean_title = ""
    clean_desc = ""
    clean_uploader = "Facebook 創作者"

    boilerplate = [
        "到 Facebook 上查看", "影片是一起享受", "在 Facebook 上查看貼文", 
        "See more of", "Log in to Facebook", "登入 Facebook", "熱門影片"
    ]

    if fb_desc:
        desc_candidate = fb_desc.strip()
        if not any(b in desc_candidate for b in boilerplate):
            clean_desc = desc_candidate

    if fb_title:
        title_raw = fb_title.strip()
        if '|' in title_raw:
            parts = [p.strip() for p in title_raw.split('|') if p.strip()]
            non_stat_parts = []
            for p in parts:
                if not re.search(r'(\d+.*(?:觀看|心情|讚|次|點讚|views|likes|reactions|comments|shares))', p, re.IGNORECASE) and p.lower() != 'facebook':
                    non_stat_parts.append(p)
            
            if len(non_stat_parts) >= 2:
                clean_desc = clean_desc or non_stat_parts[0]
                clean_uploader = non_stat_parts[-1]
                clean_title = f"{clean_uploader} - {clean_desc}"
            elif len(non_stat_parts) == 1:
                clean_desc = clean_desc or non_stat_parts[0]
                clean_title = clean_desc
        elif '-' in title_raw:
            parts = [p.strip() for p in title_raw.split('-') if p.strip()]
            if len(parts) >= 2 and parts[-1].lower() != 'facebook':
                clean_uploader = parts[0]
                clean_desc = clean_desc or parts[1]
                clean_title = f"{clean_uploader} - {clean_desc}"
            elif len(parts) == 1:
                clean_title = parts[0]
        else:
            if not any(b in title_raw for b in boilerplate):
                clean_title = title_raw

    if clean_desc and not clean_title:
        clean_title = clean_desc

    if clean_uploader != "Facebook 創作者" and clean_title and clean_uploader not in clean_title:
        clean_title = f"{clean_uploader} - {clean_title}"

    return clean_title, clean_desc, clean_uploader


def scrape_facebook_fallback(url):
    """Fallback scraper for Facebook Reels/Videos using node script wrapper + OpenGraph enrichment."""
    clean_url = normalize_url(url)
    scraper_path = os.path.join(_SCRIPT_DIR, 'fb_scraper.js')
    
    if not os.path.isfile(scraper_path):
        return {"success": False, "error": "fb_scraper.js not found"}

    try:
        # 1. Fetch OpenGraph title and description from Facebook page directly
        raw_fb_title = ""
        raw_fb_desc = ""
        try:
            headers = {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            }
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(clean_url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                content = resp.read().decode('utf-8', errors='ignore')
                m_title = re.search(r'<meta\s+property="og:title"\s+content="([^"]*)"', content) or \
                          re.search(r'<meta\s+content="([^"]*)"\s+property="og:title"', content)
                m_desc = re.search(r'<meta\s+property="og:description"\s+content="([^"]*)"', content) or \
                         re.search(r'<meta\s+content="([^"]*)"\s+property="og:description"', content) or \
                         re.search(r'<meta\s+name="description"\s+content="([^"]*)"', content)
                
                if m_title:
                    raw_fb_title = html_lib.unescape(m_title.group(1)).strip()
                if m_desc:
                    raw_fb_desc = html_lib.unescape(m_desc.group(1)).strip()
        except Exception:
            pass

        fb_title, fb_desc, fb_uploader = clean_fb_metadata(raw_fb_title, raw_fb_desc)

        res = subprocess.run(
            ['node', scraper_path, clean_url],
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=15
        )
        if res.returncode == 0 and res.stdout.strip():
            for line in res.stdout.strip().splitlines():
                if line.startswith('{') and line.endswith('}'):
                    data = json.loads(line)
                    if data.get('success') and data.get('videos'):
                        platform = {"id": "facebook", "name": "Facebook", "icon": "🔵", "color": "#1877f2"}
                        video_options = []
                        audio_options = []

                        for i, v in enumerate(data['videos']):
                            v_url = v['url']
                            q = v.get('quality') or '高畫質影片 (MP4)'
                            video_options.append({
                                'quality': q,
                                'height': 1080 if '1080' in q or 'HD' in q else 720,
                                'ext': 'mp4',
                                'has_audio': True,
                                'size': '',
                                'url': v_url,
                                'format_id': 'direct',
                                'webpage_url': clean_url
                            })
                            audio_options.append({
                                'quality': '提取 Facebook 影片原聲 (MP3)',
                                'ext': 'mp3',
                                'size': '',
                                'url': v_url,
                                'format_id': 'bestaudio',
                                'webpage_url': clean_url
                            })

                        title = fb_title or (data.get('title') if data.get('title') and data.get('title').lower() != 'video facebook' else '') or 'Facebook 短影音 / Reel'
                        description = fb_desc or (title if title != 'Facebook 短影音 / Reel' else 'Facebook 貼文動態')
                        uploader = fb_uploader or 'Facebook 創作者'

                        return {
                            "success": True,
                            "platform": platform,
                            "title": title,
                            "description": description,
                            "uploader": uploader,
                            "thumbnail": data.get('thumbnail', ''),
                            "videos": video_options,
                            "audios": audio_options,
                            "images": [],
                            "webpage_url": clean_url
                        }
    except Exception as e:
        return {"success": False, "error": f"Facebook 解析失敗: {str(e)}"}

    return {"success": False, "error": "Facebook 解析失敗"}

def scrape_youtube_direct(url):
    """Direct mobile player_response scraper for YouTube URLs to bypass Cloud IP blocks."""
    clean_url = normalize_url(url)
    video_id = None
    if 'v=' in clean_url:
        v_match = re.search(r'[?&]v=([0-9A-Za-z_-]{11})', clean_url)
        if v_match:
            video_id = v_match.group(1)
    if not video_id:
        m = re.search(r'(?:youtu\.be/|embed/|shorts/|v/)([0-9A-Za-z_-]{11})', clean_url)
        if m:
            video_id = m.group(1)
    if not video_id:
        m_fallback = re.search(r'([0-9A-Za-z_-]{11})', clean_url)
        if m_fallback:
            video_id = m_fallback.group(1)

    if not video_id:
        return {"success": False, "error": "Invalid YouTube URL"}

    target_url = f"https://m.youtube.com/watch?v={video_id}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
        'Cookie': 'SOCS=CAESEwgDEgk2OTg3OTY2MzIaAmVuIAEaBgiA_a-1bg; CONSENT=YES+cb.20230531-04-p0.en+FX+111;'
    }

    html_text = ""
    # Try curl_cffi first for TLS fingerprint impersonation
    try:
        from curl_cffi import requests as c_req
        r = c_req.get(target_url, headers=headers, impersonate="chrome120", allow_redirects=False, timeout=10)
        if r.status_code == 200:
            html_text = r.text
    except Exception:
        pass

    if not html_text:
        try:
            req = urllib.request.Request(target_url, headers=headers)
            context = ssl._create_unverified_context()
            with urllib.request.urlopen(req, context=context, timeout=10) as resp:
                html_text = resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            return {"success": False, "error": str(e)}
            
    match = re.search(r'ytInitialPlayerResponse\s*=\s*(\{.*?\});</script>', html_text) or re.search(r'ytInitialPlayerResponse\s*=\s*(\{.*?\});', html_text)
    
    if not match:
        return {"success": False, "error": "Could not find player response"}
    
    try:
        data = json.loads(match.group(1))
        status = data.get('playabilityStatus', {}).get('status')
        if status != 'OK':
            reason = data.get('playabilityStatus', {}).get('reason', 'Video unavailable')
            return {"success": False, "error": f"YouTube status: {status} ({reason})"}

        details = data.get('videoDetails', {})
        title = details.get('title', 'YouTube 影片')
        uploader = details.get('author', 'YouTube 創作者')
        thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
        if details.get('thumbnail', {}).get('thumbnails'):
            thumbnail = details['thumbnail']['thumbnails'][-1].get('url', thumbnail)

        streamingData = data.get('streamingData', {})
        formats = streamingData.get('formats', []) + streamingData.get('adaptiveFormats', [])
        
        video_options = []
        audio_options = []

        for f in formats:
            u = f.get('url')
            mime = f.get('mimeType', '')
            q = f.get('qualityLabel') or f.get('quality') or '720p'
            itag = str(f.get('itag', ''))
            
            w = f.get('width') or 0
            h = f.get('height') or 0
            eff_height = min(w, h) if (w > 0 and h > 0) else h
            if not eff_height:
                m_p = re.search(r'(\d+)p', q)
                if m_p:
                    eff_height = int(m_p.group(1))
                else:
                    eff_height = 720

            if u or itag:
                if 'video/mp4' in mime or 'video/webm' in mime:
                    if eff_height >= 2160:
                        res_label = "4K 超高畫質 (2160p)"
                    elif eff_height >= 1440:
                        res_label = "2K 高畫質 (1440p)"
                    elif eff_height >= 1080:
                        res_label = "1080p Full HD"
                    elif eff_height >= 720:
                        res_label = "720p HD"
                    elif eff_height >= 480:
                        res_label = "480p 標清"
                    else:
                        res_label = f"{eff_height}p"

                    video_options.append({
                        'quality': res_label,
                        'height': eff_height,
                        'ext': 'mp4',
                        'has_audio': 'audio' in mime or f.get('audioQuality') is not None,
                        'size': f.get('contentLength', ''),
                        'url': u or clean_url,
                        'format_id': itag if itag else 'yt_merge',
                        'webpage_url': clean_url
                    })
                elif 'audio/mp4' in mime or 'audio/webm' in mime:
                    if len(audio_options) < 2:
                        audio_options.append({
                            'quality': '提取 YouTube 影片原聲 (MP3/M4A)',
                            'ext': 'mp3',
                            'size': f.get('contentLength', ''),
                            'url': u or clean_url,
                            'format_id': 'bestaudio',
                            'webpage_url': clean_url
                        })

        if video_options or audio_options:
            platform = {"id": "youtube", "name": "YouTube", "icon": "🔴", "color": "#ff0000"}
            return {
                "success": True,
                "platform": platform,
                "title": title,
                "description": title,
                "uploader": uploader,
                "thumbnail": thumbnail,
                "videos": video_options,
                "audios": audio_options,
                "images": [],
                "webpage_url": clean_url
            }
    except Exception as e:
        return {"success": False, "error": str(e)}

    return {"success": False, "error": "No direct video streams found"}


def scrape_youtube_public_api(url):
    """Fallback YouTube Scraper using oEmbed + high-availability download options for Cloud IPs."""
    clean_url = normalize_url(url)
    video_id = None
    if 'v=' in clean_url:
        v_match = re.search(r'[?&]v=([0-9A-Za-z_-]{11})', clean_url)
        if v_match:
            video_id = v_match.group(1)
    if not video_id:
        m_sub = re.search(r'(?:youtu\.be/|embed/|shorts/|v/)([0-9A-Za-z_-]{11})', clean_url)
        if m_sub:
            video_id = m_sub.group(1)
    if not video_id:
        m_fallback = re.search(r'([0-9A-Za-z_-]{11})', clean_url)
        if m_fallback:
            video_id = m_fallback.group(1)

    if not video_id:
        return {"success": False, "error": "Invalid YouTube URL"}

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
    }

    title = "YouTube 影片"
    uploader = "YouTube 創作者"
    thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

    try:
        req = urllib.request.Request(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json", headers=headers)
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(req, context=context, timeout=5) as resp:
            data_oe = json.loads(resp.read().decode('utf-8', errors='ignore'))
            title = data_oe.get('title', title)
            uploader = data_oe.get('author_name', uploader)
            thumbnail = data_oe.get('thumbnail_url', thumbnail)
    except Exception:
        pass

    video_options = [
        {
            'quality': '1080p Full HD 高畫質 (線上觀看與下載)',
            'height': 1080,
            'ext': 'mp4',
            'has_audio': True,
            'size': '高畫質',
            'url': clean_url,
            'format_id': 'bestvideo+bestaudio/best',
            'webpage_url': clean_url
        },
        {
            'quality': '720p HD 高畫質 (MP4)',
            'height': 720,
            'ext': 'mp4',
            'has_audio': True,
            'size': '標準畫質',
            'url': clean_url,
            'format_id': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
            'webpage_url': clean_url
        }
    ]

    audio_options = [
        {
            'quality': '提取 YouTube 影片原聲 (MP3 音檔)',
            'ext': 'mp3',
            'size': '音訊提取',
            'url': clean_url,
            'format_id': 'bestaudio',
            'webpage_url': clean_url
        }
    ]

    platform = {"id": "youtube", "name": "YouTube", "icon": "🔴", "color": "#ff0000"}
    return {
        "success": True,
        "platform": platform,
        "title": title,
        "description": title,
        "uploader": uploader,
        "thumbnail": thumbnail,
        "videos": video_options,
        "audios": audio_options,
        "images": [],
        "webpage_url": clean_url
    }


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

    # YouTube age restriction / private / live / unavailable / bot block
    if 'youtube' in e or 'youtube' in url.lower() or 'youtu.be' in url.lower():
        if 'bot' in e or 'confirm you' in e or 'not a bot' in e:
            return '⚠️ 此 YouTube 影片暫時受 YouTube 伺服器驗證保護，系統正嘗試自動切換備用通訊協定，請稍後再試一次。'
        if 'unavailable' in e or 'not found' in e or 'removed' in e or 'does not exist' in e:
            return '❌ 此 YouTube 影片已下架、已刪除、不存在或網址不正確，請確認連結是否能在無登入狀態下開啟。'
        if 'private' in e:
            return '❌ 此 YouTube 影片為不公開或私人影片，無法下載。'
        if 'confirm your age' in e or ('age' in e and 'gate' in e):
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

    if 'facebook.com' in clean_target_url or 'fb.watch' in clean_target_url or 'fb.com' in clean_target_url:
        fb_res = scrape_facebook_fallback(clean_target_url)
        if fb_res.get('success'):
            return fb_res

    try:
        is_ig_url = 'instagram.com' in clean_target_url or 'instagr.am' in clean_target_url
        is_yt_url = 'youtube.com' in clean_target_url or 'youtu.be' in clean_target_url

        if is_yt_url:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'skip_download': True,
                'nocheckcertificate': True,
                'extractor_args': {'youtube': {'player_client': ['android', 'tvhtml5']}},
                'remote_components': ['ejs:github'],
                'js_runtimes': {'node': {}},
                **_get_cookie_opts(clean_target_url),
            }
            info = None
            try:
                with YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(clean_target_url, download=False)
            except Exception:
                info = None

            if not info:
                yt_direct_res = scrape_youtube_direct(clean_target_url)
                if yt_direct_res.get('success'):
                    return yt_direct_res
                yt_pub_res = scrape_youtube_public_api(clean_target_url)
                if yt_pub_res.get('success'):
                    return yt_pub_res
        else:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'skip_download': True,
                'allow_unplayable_formats': True,
                'nocheckcertificate': True,
                'remote_components': ['ejs:github'],
                'js_runtimes': {'node': {}},
                'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                **_get_cookie_opts(clean_target_url),
            }

            # Instagram photo posts: don't fail on "No video formats found", we'll extract images instead
            if is_ig_url:
                ydl_opts['ignore_no_formats_error'] = True

            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_target_url, download=False)

        if not info:
            return {"success": False, "error": "無法解析該網址，請確認連結是否公開且正確。"}

        raw_entries = []
        if 'entries' in info and info['entries']:
            raw_entries = [e for e in info['entries'] if e]
            if len(raw_entries) > 0:
                info = raw_entries[0]

        extractor = info.get('extractor_key', '') or info.get('extractor', '')
        platform = detect_platform(clean_target_url, extractor)

        raw_title = info.get('title') or ''
        description = info.get('description') or info.get('caption') or ''
        uploader = info.get('uploader') or info.get('uploader_id') or info.get('channel') or ''
        thumbnail = info.get('thumbnail') or ''
        webpage_url = info.get('webpage_url', clean_target_url)

        # Clean default TikTok video #... title to human readable Chinese title
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

        raw_formats = []
        video_options = []
        audio_options = []
        images = []
        seen_image_urls = set()

        entries_list = raw_entries if raw_entries else [info]

        # Iterate over all entries in a carousel post (e.g. IG multi-photo / multi-video post)
        for item_info in entries_list:
            # 1. Extract best image/thumbnail for this entry
            item_thumbs = item_info.get('thumbnails', [])
            if item_thumbs:
                sorted_thumbs = sorted([t for t in item_thumbs if t.get('url')], key=lambda x: (x.get('width', 0) or 0)*(x.get('height', 0) or 0), reverse=True)
                if sorted_thumbs:
                    img_url = sorted_thumbs[0]['url']
                    img_base = img_url.split('?')[0]
                    if img_base not in seen_image_urls:
                        seen_image_urls.add(img_base)
                        images.append(img_url)

            # 2. Collect formats for this entry
            item_formats = item_info.get('formats', [])
            if item_formats:
                raw_formats.extend(item_formats)

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
            width = f.get('width') or 0
            raw_height = f.get('height') or 0
            # For vertical videos (Shorts / Reels / TikTok), resolution tier (1080p, 720p, 2K, 4K)
            # is based on min(width, raw_height) so 1080x1920 is correctly 1080p Full HD, NOT 2K.
            height = min(width, raw_height) if (width > 0 and raw_height > 0) else raw_height
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

                effective_format_id = format_id
                # Instagram / Facebook progressive (has audio): mark as 'direct' for fast CDN streaming
                if (is_instagram or is_facebook) and acodec != 'none' and vcodec != 'none':
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
        if is_ig_url:
            ig_res = scrape_instagram_fallback(clean_target_url)
            if ig_res.get('success'):
                return ig_res
        if 'facebook.com' in clean_target_url or 'fb.watch' in clean_target_url or 'fb.com' in clean_target_url:
            fb_res = scrape_facebook_fallback(clean_target_url)
            if fb_res.get('success'):
                return fb_res
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
    json_output = json.dumps(res, ensure_ascii=False)
    # Clean unpaired surrogates to prevent URI malformed in browser JS
    clean_json = json_output.encode('utf-8', 'surrogateescape').decode('utf-8', 'ignore')
    print(clean_json)
