import os
import sys
import subprocess

project_dir = os.path.dirname(os.path.abspath(__file__))
icon_path = os.path.join(project_dir, "icon.ico")
bat_path = os.path.join(project_dir, "一鍵啟動系統.bat")

desktop_dir = os.path.join(os.path.expanduser("~"), "Desktop")

def create_windows_shortcuts():
    # 1. Create .url file in project folder and on Desktop
    url_content = f"""[InternetShortcut]
URL=http://localhost:3000/
IconIndex=0
IconFile={icon_path}
"""
    project_url_path = os.path.join(project_dir, "日本關西影音圖文下載系統.url")
    with open(project_url_path, "w", encoding="utf-8") as f:
        f.write(url_content)
    print(f"Created project URL shortcut: {project_url_path}")

    if os.path.exists(desktop_dir):
        desktop_url_path = os.path.join(desktop_dir, "日本關西影音圖文下載系統.url")
        with open(desktop_url_path, "w", encoding="utf-8") as f:
            f.write(url_content)
        print(f"Created desktop URL shortcut: {desktop_url_path}")

    # 2. VBScript helper to create .lnk without encoding issues
    vbs_path = os.path.join(project_dir, "scratch", "make_shortcut.vbs")
    vbs_content = f'''
Set WshShell = CreateObject("WScript.Shell")
Set Shortcut = WshShell.CreateShortcut("{os.path.join(desktop_dir, '日本關西影音圖文下載系統.lnk')}")
Shortcut.TargetPath = "{bat_path}"
Shortcut.WorkingDirectory = "{project_dir}"
Shortcut.IconLocation = "{icon_path},0"
Shortcut.Description = "日本關西旅遊互助群 專用影音圖文下載系統"
Shortcut.Save

Set ProjectShortcut = WshShell.CreateShortcut("{os.path.join(project_dir, '日本關西影音圖文下載系統.lnk')}")
ProjectShortcut.TargetPath = "{bat_path}"
ProjectShortcut.WorkingDirectory = "{project_dir}"
ProjectShortcut.IconLocation = "{icon_path},0"
ProjectShortcut.Description = "日本關西旅遊互助群 專用影音圖文下載系統"
ProjectShortcut.Save
'''
    with open(vbs_path, "w", encoding="ansi") as f:
        f.write(vbs_content)

    try:
        subprocess.run(["cscript", "//Nologo", vbs_path], check=True)
        print("Successfully created Windows .lnk Desktop Shortcut via VBScript!")
    except Exception as e:
        print("VBScript shortcut creation error:", e)

if __name__ == "__main__":
    create_windows_shortcuts()
