import re
import html

text = open('threads_dump.html', encoding='utf-8').read()
matches = re.findall(r'https?:[^\s"\'<>]+\.mp4[^\s"\'<>]*', text)
print("COUNT:", len(matches))
for m in matches[:5]:
    clean = html.unescape(m.replace('\\/', '/').replace('\\u0026', '&'))
    print("MATCH:", clean)
