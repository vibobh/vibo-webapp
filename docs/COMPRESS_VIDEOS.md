# Make hero videos under 10 MB each

Some hosts (or your own rule) need each **`vid1.mp4` … `vid5.mp4`** under **~10 MB**. Web hero clips don’t need 4K — **720p** and stronger compression usually look fine.

---

## Option A — Script (Windows, recommended)

1. **Install FFmpeg** (once):
   ```powershell
   winget install --id Gyan.FFmpeg -e
   ```
   - **Important:** Close the terminal, open a **new** PowerShell window.  
   - If `ffmpeg -version` still says “not recognized”, WinGet’s FFmpeg is installed but not on your PATH — run **`.\scripts\compress-hero-videos.ps1` anyway**; it auto-finds FFmpeg under WinGet’s folder.  
   - Optional fix for PATH: **Settings → System → About → Advanced system settings → Environment Variables** → edit **Path** (User) → **New** → add the folder that contains `ffmpeg.exe` (often `...\WinGet\Packages\Gyan.FFmpeg_...\ffmpeg-*-full_build\bin`).

2. From the **project root** (`vibo_webapp`):

   ```powershell
   .\scripts\compress-hero-videos.ps1
   ```

3. Check the new files in **`public/videos/compressed/`**. If size/quality is OK, **replace** the originals:

   ```powershell
   Copy-Item public\videos\compressed\*.mp4 public\videos\ -Force
   ```

4. Re-upload the smaller files to your **GitHub Release** (or CDN).

---

## Option B — One FFmpeg command per file

Replace `INPUT.mp4` and `OUTPUT.mp4`:

```powershell
ffmpeg -y -i INPUT.mp4 -vf "scale=720:-2" -c:v libx264 -crf 28 -preset medium -an -movflags +faststart OUTPUT.mp4
```

(`-an` = no sound — fine for muted hero videos; avoids warnings if the file has no audio.)

- Still over 10 MB? Try **`-crf 30`** or **`scale=640:-2`** (smaller picture = smaller file).
- **`scale=720:-2`** keeps aspect ratio and limits height/width sensibly.

---

## Option C — HandBrake (no command line)

1. Download [HandBrake](https://handbrake.fr/).
2. Open your `.mp4` → **Dimensions** → set width to **720** (or **1280** if you accept larger files).
3. **Video** tab → **Quality** → RF **28–32** (higher RF = smaller file).
4. **Audio** → bitrate **128** or **96** kbps.
5. Encode, check file size; repeat with higher RF if needed.

---

## Quick size check (PowerShell)

```powershell
Get-ChildItem public\videos\vid*.mp4 | Select-Object Name, @{N='MB';E={[math]::Round($_.Length/1MB,2)}}
```

Each line should show **under ~10 MB** before you upload.
