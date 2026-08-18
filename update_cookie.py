import base64
import os
import sys

print("=" * 60)
print("  雲端平台 (Render / Zeabur) Cookie 更新工具")
print("=" * 60)
print()

def convert_cookie(cookie_type, filenames, env_var_name, domain_keyword, session_keys):
    found_file = None
    for f in filenames:
        if os.path.exists(f):
            found_file = f
            break
    
    if not found_file:
        print(f"[{cookie_type}] ⚠️ 未找到檔案 ({', '.join(filenames)})")
        return
    
    print(f"[{cookie_type}] [OK] 找到 Cookie 檔案：{found_file}")
    with open(found_file, 'r', encoding='utf-8', errors='ignore') as cf:
        content = cf.read()
    
    if domain_keyword not in content:
        print(f"[{cookie_type}] [錯誤] 檔案內容中未包含 {domain_keyword} 的 Cookie，請檢查導出檔。")
        return
    
    has_session = any(k in content for k in session_keys)
    if has_session:
        print(f"[{cookie_type}] [OK] 偵測到登入 Session（品質良好）")
    else:
        print(f"[{cookie_type}] [警告] 未偵測到登入 Session，可能無法存取登入後內容")
    
    encoded = base64.b64encode(content.encode('utf-8')).decode('ascii')
    print()
    print("=" * 60)
    print(f"  請複製以下整串文字，貼到雲端平台 (Render/Zeabur) 的 {env_var_name} 環境變數：")
    print("=" * 60)
    print(encoded)
    print("=" * 60)
    print()

convert_cookie(
    cookie_type="Instagram",
    filenames=['ig_cookies.txt', 'www.instagram.com_cookies.txt', 'instagram.com_cookies.txt'],
    env_var_name="IG_COOKIES_B64",
    domain_keyword="instagram.com",
    session_keys=['sessionid', 'ds_user_id']
)

convert_cookie(
    cookie_type="YouTube",
    filenames=['yt_cookies.txt', 'youtube.com_cookies.txt', 'www.youtube.com_cookies.txt'],
    env_var_name="YT_COOKIES_B64",
    domain_keyword="youtube.com",
    session_keys=['LOGIN_INFO', 'SAPISID', 'SID']
)

print("【步驟】前往 Render / Zeabur 後台：")
print("  1. 開啟 Render (https://dashboard.render.com/) 或 Zeabur (https://zeabur.com)")
print("  2. 點選服務名稱 -> 選擇 Environment (環境變數)")
print("  3. 新增/編輯 IG_COOKIES_B64 與 YT_COOKIES_B64，貼上上方 Base64 字串")
print("  4. 儲存設定（平台會自動帶入新 Cookie 重新部署）")
print()
input("按 Enter 結束...")

