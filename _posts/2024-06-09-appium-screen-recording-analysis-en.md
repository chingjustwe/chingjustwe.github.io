---
layout: post
title: Appium Screen Recording Solution Evaluation Report
date: 2024-06-09
categories:
  - testing
---

## Executive Summary

This report targets Appium automation scenarios focused on **Windows desktop applications and browser testing**, comparing three screen recording solutions. The final recommendation is a **hybrid architecture of "ffmpeg external process as primary, WebDriver screenshots as fallback"**.

---

## 1. Background and Constraints

| Constraint | Description |
|------------|-------------|
| **Primary Platform** | Windows (desktop apps + browsers equally important) |
| **Performance First** | Screen recording must not slow test execution; CPU usage must be controllable |
| **Availability First** | If Appium / browser crashes, the error-scene video must be preserved on disk |
| **High Browser Share** | Must cover both native desktop apps and Chrome/Edge browsers |
| **Headless & Unattended** | Must support headless browsers and Windows VMs / CI without RDP |

> **Key Fact:** `appium-windows-driver` **does not support** the `start_recording_screen()` API. Windows desktop testing cannot use Appium's native screen recording.

---

## 2. Option 1: Appium Native Screen Recording

### 2.1 Principle

Via `driver.start_recording_screen()` / `stop_recording_screen()`. Internally, the Driver invokes the platform's native screen recording capability:

- **Android**: Calls the device's `screenrecord` binary (or emulator built-in API)
- **iOS**: XCUITest Driver has internal video capture integration
- **Windows**: ❌ **Not supported**

```python
# Works on Android / iOS; throws exception on Windows
driver.start_recording_screen()
# ... run tests ...
video = driver.stop_recording_screen()  # Returns base64, must decode to disk yourself
```

### 2.2 Pros and Cons

| Dimension | Assessment |
|-----------|------------|
| **Windows Support** | ❌ Completely unsupported. `appium-windows-driver` has not implemented this API |
| **Performance** | ⚠️ Medium. Encoding runs on the device or Appium Server, consuming the DUT's CPU |
| **Video Quality** | ⚠️ Average. FPS and bitrate limited by the platform's native implementation; few tunable parameters |
| **Crash Availability** | ❌ **Poor**. Recording data is cached in memory; data is lost if Appium crashes |
| **Browser Testing** | ⚠️ Supported but limited. Mobile browsers work; desktop browsers need another solution |
| **Headless Support** | ⚠️ Platform-dependent. Android/iOS unrelated to headless mode; desktop unavailable |
| **Engineering Complexity** | ✅ Low. Direct in-code calls; no external process management |

### 2.3 Conclusion

**Eliminated for this scenario.** No native Windows support, and post-crash data loss violates the availability constraint.

---

## 3. Option 2: External ffmpeg Process ⭐

### 3.1 Principle

Launch an independent `ffmpeg` process at the OS level to directly capture the screen or a specific window. Completely decoupled from the Appium process.

```bash
# Windows: capture entire desktop (gdigrab)
ffmpeg -f gdigrab -framerate 10 -i desktop -c:v libx264 -preset ultrafast -pix_fmt yuv420p output.mp4

# Windows: capture a specific window (by window title)
ffmpeg -f gdigrab -framerate 10 -i title="Calculator" -c:v libx264 -preset ultrafast output.mp4

# Hardware acceleration (Intel QSV, significantly lowers CPU)
ffmpeg -f gdigrab -framerate 10 -i desktop -c:v h264_qsv -preset fast output.mp4
```

**Integration with the test framework:**

```python
import subprocess
import atexit

class FfmpegRecorder:
    def __init__(self, output_path):
        self.process = subprocess.Popen([
            "ffmpeg",
            "-f", "gdigrab",
            "-framerate", "10",
            "-i", "desktop",
            "-c:v", "h264_qsv",  # or libx264 / h264_nvenc
            "-preset", "fast",
            "-pix_fmt", "yuv420p",
            "-y",  # Overwrite existing file
            output_path
        ])
        atexit.register(self.stop)  # Ensure cleanup

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()  # Send SIGTERM; ffmpeg flushes gracefully
            self.process.wait(timeout=5)

# Start before tests
recorder = FfmpegRecorder("test_login.mp4")

# ... execute Appium tests (even if Appium crashes, ffmpeg keeps running) ...

# Stop after tests
recorder.stop()
```

### 3.2 Pros and Cons

| Dimension | Assessment |
|-----------|------------|
| **Windows Support** | ✅ Perfect support. `gdigrab` is Windows' native GDI screen capture |
| **Performance** | ✅ **Excellent**. Independent process, doesn't block Appium threads; supports hardware encoding (QSV/NVENC), CPU usage < 5% |
| **Video Quality** | ⚠️ Medium. Limited by GDI capture (not DirectX); cannot capture GPU-accelerated layers; sufficient for debugging |
| **Crash Availability** | ✅ **Best**. ffmpeg is an independent OS process; if Appium / browser crashes, recording continues until manually stopped |
| **Browser Testing** | ✅ Supported. Records the entire screen, so browser windows are naturally included |
| **Headless Support** | ❌ **Not supported**. Headless browsers do not render to the screen; gdigrab captures nothing |
| **No-RDP VM Support** | ⚠️ Conditionally supported. See Section 5.2 |
| **Engineering Complexity** | ⚠️ Medium. Requires process lifecycle management, file naming, and disk cleanup |

### 3.3 Applicability Boundaries

- **Best for**: Windows desktop app testing, headful browser testing
- **Fails for**: Headless browsers, Windows sessions locked / without a desktop (black screen)

---

## 4. Option 3: WebDriver High-Frequency Screenshots Compiled to Video

### 4.1 Principle

While tests are running, start an independent thread/process that calls the WebDriver screenshot API at a fixed frequency (e.g., 5~10 fps). Afterward, use ffmpeg to compile the image sequence into an MP4.

```python
import threading
import time
from selenium.webdriver.common.by import By

class ScreenshotRecorder:
    def __init__(self, driver, output_dir, fps=5):
        self.driver = driver
        self.output_dir = output_dir
        self.fps = fps
        self.frames = []
        self.running = False
        self.thread = None

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._loop)
        self.thread.start()

    def _loop(self):
        idx = 0
        interval = 1.0 / self.fps
        while self.running:
            start = time.time()
            try:
                # Full-page screenshot (works best for browsers)
                png = self.driver.get_screenshot_as_png()
                with open(f"{self.output_dir}/frame_{idx:05d}.png", "wb") as f:
                    f.write(png)
                idx += 1
            except Exception:
                # Exit loop when WebDriver connection drops
                break
            elapsed = time.time() - start
            sleep_time = interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)

    def encode(self, output_mp4):
        import subprocess
        subprocess.run([
            "ffmpeg", "-framerate", str(self.fps),
            "-i", f"{self.output_dir}/frame_%05d.png",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-y", output_mp4
        ], check=True)

# Usage example
recorder = ScreenshotRecorder(driver, "/tmp/frames", fps=5)
recorder.start()
# ... run tests ...
recorder.stop()
recorder.encode("/tmp/test_output.mp4")
```

### 4.2 Pros and Cons

| Dimension | Assessment |
|-----------|------------|
| **Windows Support** | ✅ Supported. Doesn't rely on GDI; pure WebDriver protocol |
| **Performance** | ❌ **Poor**. Each screenshot involves full PNG encoding + network transfer + disk I/O. At 5 fps, CPU usage is 15%~30% |
| **Video Quality** | ⚠️ Low frame rate, but frames are precise (no compression loss). Good for viewing DOM changes; poor for animations |
| **Crash Availability** | ⚠️ **Medium**. The screenshot thread stops if WebDriver crashes, but **frames already written to disk are preserved** (better than Option 1) |
| **Browser Testing** | ✅ **Best**. Especially suitable for headless browsers |
| **Headless Support** | ✅ **Perfect**. Headless Chrome's screenshot API uses the internal rendering buffer; display presence is irrelevant |
| **No-RDP VM Support** | ✅ **Perfect**. Doesn't depend on a desktop session |
| **Engineering Complexity** | ⚠️ Medium-high. Must handle thread synchronization, file cleanup, and frame-drop compensation |

### 4.3 Applicability Boundaries

- **Best for**: Headless browser testing, CI / cloud environments (no desktop session)
- **Fails for**: High-frequency interaction tests (frame rate can't keep up), desktop app testing (screenshots only capture the browser window; extra handling needed for native desktop apps)

---

## 5. Special Scenario Deep Dive

### 5.1 Headless Browser Screen Recording

**Problem:** Headless Chrome/Edge does not go through the OS display layer; `ffmpeg -f gdigrab` captures nothing.

**Solution Comparison:**

| Solution | Feasibility | Notes |
|----------|-------------|-------|
| Switch to headful + virtual display | ⚠️ Complex | Windows has no native Xvfb; requires persistent RDP session or third-party virtual display drivers |
| **WebDriver screenshots** | ✅ Recommended | Headless browsers still support `get_screenshot_as_png()` via internal rendering buffer |
| Chrome DevTools Screencast | ✅ Recommended | CDP `Page.startScreencast` event stream; natively supported by chrome-headless |
| ffmpeg + browser built-in recording | ❌ Not feasible | Headless produces no video output |

**Recommended Implementation (CDP Screencast):**

```python
# Obtain video frame stream via Chrome DevTools Protocol
# Doesn't rely on WebDriver or screen output
from selenium.webdriver.chrome.service import Service
from selenium.webdriver import Chrome

driver = Chrome()
# Enable CDP Screencast
driver.execute_cdp_cmd("Page.startScreencast", {
    "format": "jpeg",
    "quality": 80,
    "maxWidth": 1280,
    "maxHeight": 720,
    "everyNthFrame": 2  # Lower frame rate to reduce overhead
})

# Receive frame data in event listener and write to file
# (Event callback implementation omitted; can use websocket or selenium-devtools library)
```

> **Conclusion:** For headless browser scenarios, **CDP Screencast** or **WebDriver high-frequency screenshots** are the only viable solutions. `ffmpeg` is completely inapplicable.

### 5.2 Windows VM / CI Without RDP Connection

**Problem:** Windows `gdigrab` requires an **active user desktop session** (Active WinStation/Desktop). In the following situations, it will capture a black screen:

- RDP disconnected and session locked
- Tests launched via SSH / WinRM (Session 0, no desktop)
- Cloud server not logged in by default

**Solutions:**

| Solution | Steps | Stability |
|----------|-------|-----------|
| **Configure auto-login** | Set `AutoAdminLogon` + `DefaultPassword` registry; auto-enter desktop on boot | ✅ High |
| **RDP disconnect keep-alive** | `tscon %sessionname% /dest:console` disconnects RDP without locking session | ✅ High |
| **Disable lock screen** | Group Policy `Do not display the lock screen` + power options turn off screen saver | ✅ High |
| **Use Scheduled Task** | Trigger tests in "Run only when user is logged on" mode to ensure interactive session | ✅ High |
| **Switch to WebDriver screenshots** | Doesn't rely on GDI; works when launched via SSH | ✅ High, but browsers only |

**Recommended Combo:**

```powershell
# 1. Configure auto-login (admin PowerShell)
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "AutoAdminLogon" -Value "1"
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "DefaultUserName" -Value "tester"
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "DefaultPassword" -Value "password"

# 2. Disable lock screen (group policy or registry)
Set-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization" -Name "NoLockScreen" -Value "1"

# 3. Launch test script via Scheduled Task to ensure interactive session
# (Or run after an RDP disconnect keep-alive)
```

**Verify Session State:**

```powershell
query user  # View current session state
# Status must be "Active", not "Disc" or locked
```

> **Conclusion:** By configuring **auto-login + disable lock screen + scheduled task**, a Windows VM can maintain an active desktop session when unattended, allowing `ffmpeg gdigrab` to work normally. If the CI environment strictly prohibits desktop sessions, **the only fallback is the WebDriver screenshot solution**.

---

## 6. Comprehensive Comparison Matrix

| Dimension | Option 1: Appium Native | Option 2: ffmpeg External | Option 3: WebDriver Screenshots |
|-----------|------------------------|--------------------------|--------------------------------|
| **Windows Desktop Apps** | ❌ Unsupported | ✅ Perfect | ⚠️ Needs extra handling (only captures browser window) |
| **Windows Headful Browsers** | ❌ Unsupported | ✅ Perfect | ✅ Supported |
| **Headless Browsers** | ❌ Unsupported | ❌ Unsupported | ✅ Perfect |
| **No-RDP VM / CI** | ❌ Unsupported | ⚠️ Requires keep-alive config | ✅ Perfect |
| **Performance (CPU)** | Medium | ✅ **Best** (hardware encoding) | ❌ **Worst** (PNG encoding overhead) |
| **Video File Size** | Small | ✅ Small (H.264 compressed) | ⚠️ Medium (raw frames + post-composition) |
| **Video Preserved After Crash** | ❌ Lost | ✅ **Preserved** | ⚠️ Partially preserved (frames already on disk) |
| **Implementation Complexity** | Low | Medium | Medium-high |
| **Frame Rate (fps)** | 10~30 | ✅ Configurable 1~60 | Limited by screenshot speed, usually 2~10 |
| **Debuggability** | Average | ✅ High (full desktop context) | ⚠️ Medium (browser viewport only) |
| **Real-time Disk Write** | No (memory buffer) | ✅ Yes (write while recording) | ✅ Yes (write PNG per frame) |

---

## 7. Final Recommendation: Hybrid Architecture

No single solution covers all scenarios. We recommend **dynamically selecting the recording backend** based on the test target type:

```
Test Launch
    │
    ▼
Determine Test Target Type
    │
    ├── Desktop Native App (Calculator, WPF client, etc.)
    │       │
    │       ▼
    │   Launch ffmpeg gdigrab to record entire desktop
    │       │
    │       └── Output: H.264 MP4 (low CPU, high availability)
    │
    ├── Headful Browser (Chrome/Edge with GUI)
    │       │
    │       ▼
    │   Launch ffmpeg gdigrab to record entire desktop
    │       │
    │       └── Output: H.264 MP4 (captures both browser and system pop-ups)
    │
    └── Headless Browser or CI Without Desktop Session
            │
            ▼
        Launch WebDriver high-frequency screenshot thread (or CDP Screencast)
            │
            └── Output: PNG sequence → ffmpeg composes to MP4 after tests
```

### 7.1 Unified Wrapper Example

```python
import os
import platform
from enum import Enum

class RecordingBackend(Enum):
    FFMPEG_GDIGRAB = "ffmpeg_gdigrab"      # Windows desktop / headful browsers
    WEBDRIVER_SCREENSHOT = "webdriver_ss"   # Headless / no desktop session
    CDP_SCREENCAST = "cdp_screencast"       # Optimal for headless Chrome

class UnifiedRecorder:
    def __init__(self, driver, output_path, target_type="desktop"):
        self.output_path = output_path
        self.driver = driver
        self.target_type = target_type
        self.backend = self._select_backend()
        self.impl = self._create_impl()

    def _select_backend(self):
        system = platform.system()
        is_headless = os.environ.get("HEADLESS", "false").lower() == "true"
        has_display = os.environ.get("DISPLAY") or system == "Windows"

        if system == "Windows" and not is_headless:
            return RecordingBackend.FFMPEG_GDIGRAB
        elif is_headless or not has_display:
            return RecordingBackend.WEBDRIVER_SCREENSHOT
        else:
            return RecordingBackend.FFMPEG_GDIGRAB

    def _create_impl(self):
        if self.backend == RecordingBackend.FFMPEG_GDIGRAB:
            return FfmpegRecorder(self.output_path)
        else:
            return ScreenshotRecorder(self.driver, "/tmp/frames", output_mp4=self.output_path)

    def start(self):
        self.impl.start()

    def stop(self):
        self.impl.stop()

# Usage: one line automatically selects the optimal backend
recorder = UnifiedRecorder(driver, "output/test_login.mp4", target_type="browser")
recorder.start()
# ... run tests ...
recorder.stop()
```

### 7.2 Key Configuration Recommendations

| Scenario | Recommended Backend | ffmpeg Params / Screenshot Frequency | Notes |
|----------|---------------------|--------------------------------------|-------|
| Windows Desktop App | ffmpeg gdigrab | `-framerate 10 -c:v h264_qsv` | Hardware encoding preferred |
| Windows Headful Browser | ffmpeg gdigrab | `-framerate 10 -c:v h264_qsv` | Captures system pop-ups, download dialogs |
| Windows Headless Browser | WebDriver screenshots or CDP | `fps=5`, `get_screenshot_as_png()` | Doesn't depend on desktop session |
| Linux CI (Xvfb) | ffmpeg x11grab | `-f x11grab -i :99` | Xvfb provides virtual display |
| Linux Headless | WebDriver screenshots | `fps=5` | Same as Windows headless |

### 7.3 Disaster Recovery Mechanism

Regardless of the chosen backend, you must ensure that **the video is preserved when the test process exits abnormally**:

```python
import atexit
import signal

recorder = UnifiedRecorder(driver, output_path)
recorder.start()

# Register multiple safeguards
atexit.register(recorder.stop)  # Normal exit / uncaught exception
signal.signal(signal.SIGTERM, lambda *_: recorder.stop())  # kill -15
signal.signal(signal.SIGINT, lambda *_: recorder.stop())   # Ctrl+C

# Extra protection for ffmpeg backend: ffmpeg itself is an independent process.
# Even if Python crashes, we only need to ensure ffmpeg is eventually terminated
# (can use a watchdog process for monitoring)
```

---

## 8. Conclusion

| Question | Answer |
|----------|--------|
| **Can Appium native screen recording be used on Windows?** | **No.** `appium-windows-driver` has not implemented this API |
| **Which solution has the best performance?** | **ffmpeg external + hardware encoding** (Intel QSV / NVIDIA NVENC), lowest CPU usage |
| **Is the video still available after Appium crashes?** | **ffmpeg: Yes.** It's an independent OS process. **WebDriver screenshots: partially.** Frames already on disk are preserved. **Appium native: No.** |
| **How to record headless browsers?** | Cannot use ffmpeg. Use **WebDriver high-frequency screenshots** or **Chrome DevTools Screencast** |
| **How to record on a Windows VM without RDP?** | Configure **auto-login + disable lock screen** to keep the desktop session active; then ffmpeg works. If CI prohibits this, fallback to WebDriver screenshots |

**Final Selection: Use ffmpeg external process as the default, WebDriver screenshots as fallback for headless/CI, with a unified wrapper layer for automatic switching.**
