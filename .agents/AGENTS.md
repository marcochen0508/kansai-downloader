# Agent Rules & Architectural Guidelines

## 1. 巨觀架構優先 (Architecture First)
- 在排查與重構下載、網路請求或 API 相關問題時，切勿立刻陷入微觀細節修補（例如單純修改小參數）。
- 必須先跳脫出來從巨觀架構審視：
  - 前後端資料傳遞契約是否合理（例如避免傳遞超長 CDN 網址、過期 Token 或造成 403 封鎖的直連鏈結）。
  - 是否應採用標準的「後端代理串流 (Proxy Stream / Pipe)」模式。

## 2. 部署完整性 (Deployment Rule)
- 任何程式碼修改與驗證完成後，必須自動將變更提交並推送至 GitHub 遠端分支 (`git push origin main`)，確保雲端平台（如 Zeabur / Render）能同步完成部署，供使用者存取。
