import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open("android_share.html", "r", encoding="utf-8") as f:
    html = f.read()

# Look for script tags with JSON
scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
print("Script count:", len(scripts))

for i, s in enumerate(scripts):
    if 'ScheduledServerJS' in s or 'requireLazy' in s or 'rel=' in s:
        # search for post / code / caption / username / url
        for keyword in ['post', 'code', 'caption', 'username', 'share']:
            matches = [m.group(0) for m in re.finditer(r'"{}\s*":\s*"([^"]+)"'.format(keyword), s)]
            if matches:
                print(f"Script {i} keyword '{keyword}':", matches[:3])

print("\nAll double quoted strings matching @... or post/...:")
for m in re.finditer(r'"([^"]*?(?:@[\w\.-]+|post\/[\w\.-]+|share\/[\w\.-]+)[^"]*?)"', html):
    print(" ", m.group(1)[:100])
