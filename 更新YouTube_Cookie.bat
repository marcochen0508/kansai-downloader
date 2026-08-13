@echo off
chcp 65001 > nul
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║         YouTube Cookie 更新工具                              ║
echo ║         出現「Sign in to confirm」錯誤時使用此工具           ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo 【步驟 1】先安裝 Chrome 擴充功能匯出 Cookie
echo   - 在 Chrome 搜尋並安裝：Get cookies.txt LOCALLY
echo   - 網址：https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc
echo.
echo 【步驟 2】匯出 YouTube Cookie
echo   1. 用 Chrome 打開 https://www.youtube.com 並確認已登入
echo   2. 點擊擴充功能圖示（拼圖icon）→ 找到 Get cookies.txt LOCALLY
echo   3. 點「Export」→ 選「For current site」→ 存成 yt_cookies.txt
echo   4. 把 yt_cookies.txt 複製到這個資料夾（取代舊的）
echo.
pause

echo.
echo 【步驟 3】正在轉換 Cookie 為 base64 格式...
echo.

python -c "
import base64, os, sys

cookie_file = 'yt_cookies.txt'
if not os.path.exists(cookie_file):
    print('❌ 錯誤：找不到 yt_cookies.txt，請先完成步驟 2！')
    sys.exit(1)

with open(cookie_file, 'r', encoding='utf-8') as f:
    content = f.read()

if 'youtube.com' not in content:
    print('❌ 錯誤：這不是有效的 YouTube Cookie 檔案！')
    sys.exit(1)

encoded = base64.b64encode(content.encode('utf-8')).decode('ascii')

print('=' * 70)
print('✅ 轉換成功！請複製以下整串文字（從頭到尾）：')
print('=' * 70)
print(encoded)
print('=' * 70)
print()
print('【步驟 4】更新 Render 環境變數：')
print('  1. 開啟 https://dashboard.render.com/')
print('  2. 點選 kansai-downloader 服務')
print('  3. 左側選 Environment')
print('  4. 找到 YT_COOKIES_B64 → 點編輯 → 貼上上面的文字')
print('  5. 按 Save Changes → Render 會自動重新部署（約 2-3 分鐘）')
print()
print('部署完成後即可正常下載 YouTube 影片！')
"

echo.
pause
