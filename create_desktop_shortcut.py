import os
import sys
import subprocess

project_dir = os.path.dirname(os.path.abspath(__file__))
icon_path = os.path.join(project_dir, "icon.ico")
desktop_dir = os.path.join(os.path.expanduser("~"), "Desktop")

def create_windows_shortcuts(is_lite=False):
    if is_lite:
        title = "影音極速下載-極簡版"
        url = "http://localhost:3000/lite"
        bat_name = "一鍵啟動極簡版.bat"
        desc = "影音極速下載 - 手機與電腦極簡版 (最適畫質秒存)"
    else:
        title = "日本關西影音圖文下載系統"
        url = "http://localhost:3000/"
        bat_name = "一鍵啟動系統.bat"
        desc = "日本關西旅遊互助群 專用影音圖文下載系統"

    bat_path = os.path.join(project_dir, bat_name)

    # 1. Create .url file in project folder and on Desktop
    url_content = f"""[InternetShortcut]
URL={url}
IconIndex=0
IconFile={icon_path}
"""
    project_url_path = os.path.join(project_dir, f"{title}.url")
    with open(project_url_path, "w", encoding="utf-8") as f:
        f.write(url_content)
    print(f"Created project URL shortcut: {project_url_path}")

    if os.path.exists(desktop_dir):
        desktop_url_path = os.path.join(desktop_dir, f"{title}.url")
        with open(desktop_url_path, "w", encoding="utf-8") as f:
            f.write(url_content)
        print(f"Created desktop URL shortcut: {desktop_url_path}")

    # 2. VBScript helper to create .lnk without encoding issues
    scratch_dir = os.path.join(project_dir, "scratch")
    if not os.path.exists(scratch_dir):
        os.makedirs(scratch_dir, exist_ok=True)
        
    vbs_path = os.path.join(scratch_dir, "make_shortcut.vbs")
    vbs_content = f'''
Set WshShell = CreateObject("WScript.Shell")
Set Shortcut = WshShell.CreateShortcut("{os.path.join(desktop_dir, f'{title}.lnk')}")
Shortcut.TargetPath = "{bat_path}"
Shortcut.WorkingDirectory = "{project_dir}"
Shortcut.IconLocation = "{icon_path},0"
Shortcut.Description = "{desc}"
Shortcut.Save

Set ProjectShortcut = WshShell.CreateShortcut("{os.path.join(project_dir, f'{title}.lnk')}")
ProjectShortcut.TargetPath = "{bat_path}"
ProjectShortcut.WorkingDirectory = "{project_dir}"
ProjectShortcut.IconLocation = "{icon_path},0"
ProjectShortcut.Description = "{desc}"
ProjectShortcut.Save
'''
    with open(vbs_path, "w", encoding="ansi") as f:
        f.write(vbs_content)

    try:
        subprocess.run(["cscript", "//Nologo", vbs_path], check=True)
        print(f"Successfully created Windows .lnk Desktop Shortcut for [{title}] via VBScript!")
    except Exception as e:
        print("VBScript shortcut creation error:", e)

if __name__ == "__main__":
    is_lite_mode = "--lite" in sys.argv
    create_windows_shortcuts(is_lite=is_lite_mode)
