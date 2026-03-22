# Make hero videos under 10 MB each

Some hosts (or your own rule) need each **`vid1.mp4` … `vid5.mp4`** under **~10 MB**. Web hero clips don’t need 4K — **720p** and stronger compression usually look fine.

---

## Option A — Script (Windows, recommended)

1. **Install FFmpeg** (once):
   - Open PowerShell **as Administrator** and run:
   ```powershell
   winget install --id Gyan.FFmpeg -e
   ```
   - Close and reopen the terminal, then run `ffmpeg -version` to confirm.

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
ffmpeg -y -i INPUT.mp4 -vf "scale=720:-2" -c:v libx264 -crf 28 -preset medium -c:a aac -b:a 128k -movflags +faststart OUTPUT.mp4
```

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
