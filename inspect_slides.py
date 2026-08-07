import urllib.request
import re
import html as html_lib

url = 'https://www.threads.net/@llu318871/post/Dbr5GN-DsYQ'
req = urllib.request.Request(url, headers={
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
})

try:
    with urllib.request.urlopen(req) as resp:
        html_text = resp.read().decode('utf-8')
        
        # Split HTML by carousel media items or "pk":
        # Find all carousel items by looking for items in JSON
        # A slide with video has "video_versions"
        # A slide with photo only does NOT have "video_versions" inside its block
        
        # Find all "image_versions2" blocks
        img_v2_blocks = re.findall(r'"image_versions2":\{"candidates":\[(.*?)\]\}', html_text)
        print("image_versions2 blocks found:", len(img_v2_blocks))
        
        # Find all "video_versions" blocks
        vid_v_blocks = re.findall(r'"video_versions":\[(.*?)\]', html_text)
        print("video_versions blocks found:", len(vid_v_blocks))
        
        # Let's inspect the actual slides in this post
        # Is Dbr5GN-DsYQ a post with 3 videos and 0 real photos? Or 3 videos and 1 real photo?
        # Let's check how many unique video base URLs exist vs unique photo base URLs:
        
        video_urls = set()
        for v in vid_v_blocks:
            urls = re.findall(r'"url":"([^"]+)"', v)
            for u in urls:
                clean_u = html_lib.unescape(u.replace('\\/', '/').replace('\\u0026', '&'))
                video_urls.add(clean_u.split('?')[0])

        print(f"Unique Video Base URLs ({len(video_urls)}):")
        for v in video_urls:
            print("  Video Base:", v)

except Exception as e:
    print("Error:", e)
