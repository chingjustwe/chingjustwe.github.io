---
layout: post
title:  "Appium 屏幕录制方案选型报告"
date:   2026-06-05 21:00:00 +0800
categories: testing
---

## 摘要

本文面向**以 Windows 桌面应用和浏览器测试为主**的 Appium 自动化场景，对比三种屏幕录制方案，最终推荐**"ffmpeg 外挂进程为主、WebDriver 截图兜底"的混合架构**。

---

## 一、背景与约束条件

| 约束 | 说明 |
|------|------|
| **主平台** | Windows（桌面应用 + 浏览器并重） |
| **性能优先** | 录屏不能拖慢测试执行，CPU 占用需可控 |
| **可用性优先** | Appium / 浏览器 crash 后，报错现场视频必须能落盘 |
| **浏览器占比高** | 需同时覆盖桌面原生应用和 Chrome/Edge 浏览器 |
| **无头 & 无人值守** | 需支持 headless 浏览器、无 RDP 的 Windows VM/CI 环境 |

> **关键事实：** `appium-windows-driver` **不支持** `start_recording_screen()` API。Windows 桌面测试无法使用 Appium 原生录屏。

---

## 二、方案一：Appium 原生录屏

### 2.1 原理

通过 `driver.start_recording_screen()` / `stop_recording_screen()` 调用。Driver 内部拉起平台原生录屏能力：

- **Android**：调用设备端的 `screenrecord` 二进制（或模拟器内置 API）
- **iOS**：XCUITest Driver 内部集成视频捕获
- **Windows**：❌ **不支持**

```python
# Android / iOS 可用，Windows 直接抛异常
driver.start_recording_screen()
# ... 执行测试 ...
video = driver.stop_recording_screen()  # 返回 base64，需自行解码落盘
```

### 2.2 优劣势分析

| 维度 | 评估 |
|------|------|
| **Windows 支持** | ❌ 完全不支持。`appium-windows-driver` 未实现该 API |
| **性能** | ⚠️ 中等。编码在设备端或 Appium Server 完成，占用被测设备 CPU |
| **视频质量** | ⚠️ 一般。fps、码率受限于平台原生实现，可调参数少 |
| **Crash 可用性** | ❌ **差**。录屏数据在内存中缓存，Appium crash 后数据丢失 |
| **浏览器测试** | ⚠️ 支持但有限。移动端浏览器可用；桌面浏览器需换其他方案 |
| **Headless 支持** | ⚠️ 视平台而定。Android/iOS 与是否 headless 无关；桌面端不可用 |
| **工程复杂度** | ✅ 低。代码内直接调用，无需外部进程管理 |

### 2.3 结论

**本场景下直接排除。** Windows 无原生支持，且 crash 后视频丢失违背可用性约束。

---

## 三、方案二：外挂 ffmpeg 进程录屏 ⭐

### 3.1 原理

在操作系统层面启动独立的 `ffmpeg` 进程，直接捕获屏幕或特定窗口。与 Appium 进程完全解耦。

```bash
# Windows：捕获整个桌面（gdigrab）
ffmpeg -f gdigrab -framerate 10 -i desktop -c:v libx264 -preset ultrafast -pix_fmt yuv420p output.mp4

# Windows：捕获特定窗口（按窗口标题）
ffmpeg -f gdigrab -framerate 10 -i title="Calculator" -c:v libx264 -preset ultrafast output.mp4

# 硬件加速（Intel QSV，显著降低 CPU）
ffmpeg -f gdigrab -framerate 10 -i desktop -c:v h264_qsv -preset fast output.mp4
```

**与测试框架的集成方式：**

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
            "-c:v", "h264_qsv",  # 或 libx264 / h264_nvenc
            "-preset", "fast",
            "-pix_fmt", "yuv420p",
            "-y",  # 覆盖已存在文件
            output_path
        ])
        atexit.register(self.stop)  # 确保进程被清理

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()  # 发送 SIGTERM，ffmpeg 会优雅收尾
            self.process.wait(timeout=5)

# 测试前启动
recorder = FfmpegRecorder("test_login.mp4")

# ... 执行 Appium 测试（即使 Appium crash，ffmpeg 仍在运行） ...

# 测试后停止
recorder.stop()
```

### 3.2 优劣势分析

| 维度 | 评估 |
|------|------|
| **Windows 支持** | ✅ 完美支持。`gdigrab` 是 Windows 原生 GDI 抓屏 |
| **性能** | ✅ **优秀**。独立进程，不占用 Appium 线程；支持硬件编码（QSV/NVENC），CPU 占用 < 5% |
| **视频质量** | ⚠️ 中等。受限于 GDI 抓屏（非 DirectX），无法捕获 GPU 加速层；但满足调试需求 |
| **Crash 可用性** | ✅ **最强**。ffmpeg 是独立 OS 进程，Appium / 浏览器 crash 后视频继续录制直至主动停止 |
| **浏览器测试** | ✅ 支持。录制的是整个屏幕，浏览器窗口自然在内 |
| **Headless 支持** | ❌ **不支持**。Headless 浏览器不渲染到屏幕，gdigrab 捕获不到 |
| **无 RDP VM 支持** | ⚠️ 有条件支持。见第 5.2 节 |
| **工程复杂度** | ⚠️ 中等。需管理进程生命周期、文件命名、磁盘清理 |

### 3.3 适用边界

- **最佳场景**：Windows 桌面应用测试、有界面（headful）浏览器测试
- **失效场景**：Headless 浏览器、Windows 会话被锁定/无桌面（黑屏）

---

## 四、方案三：WebDriver 高频截图合成视频

### 4.1 原理

在测试执行的同时，启动独立线程/进程，以固定频率（如 5~10 fps）调用 WebDriver 截图 API，事后用 ffmpeg 将图片序列合成为 MP4。

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
                # 全页截图（对浏览器支持最好）
                png = self.driver.get_screenshot_as_png()
                with open(f"{self.output_dir}/frame_{idx:05d}.png", "wb") as f:
                    f.write(png)
                idx += 1
            except Exception:
                # WebDriver 连接断开时退出循环
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

# 使用示例
recorder = ScreenshotRecorder(driver, "/tmp/frames", fps=5)
recorder.start()
# ... 执行测试 ...
recorder.stop()
recorder.encode("/tmp/test_output.mp4")
```

### 4.2 优劣势分析

| 维度 | 评估 |
|------|------|
| **Windows 支持** | ✅ 支持。不依赖 GDI，纯 WebDriver 协议 |
| **性能** | ❌ **差**。每张截图都是一次完整的 PNG 编码 + 网络传输 + 磁盘 I/O。5 fps 下 CPU 占用 15%~30% |
| **视频质量** | ⚠️ 低帧率，但画面精确（无压缩损失）。适合看 DOM 变化，不适合看动画 |
| **Crash 可用性** | ⚠️ **中等**。WebDriver crash 后截图线程会中断，但**已落盘的帧不会丢失**（优于方案一） |
| **浏览器测试** | ✅ **最佳**。尤其适合 headless 浏览器 |
| **Headless 支持** | ✅ **完美支持**。Headless Chrome 的 screenshot API 基于内部渲染缓冲区，与是否显示无关 |
| **无 RDP VM 支持** | ✅ **完美支持**。不依赖桌面会话 |
| **工程复杂度** | ⚠️ 中等偏高。需处理线程同步、文件清理、丢帧补偿 |

### 4.3 适用边界

- **最佳场景**：Headless 浏览器测试、CI/云环境（无桌面会话）
- **失效场景**：高频交互测试（帧率跟不上）、桌面应用测试（截图只能 capture 浏览器窗口，如果测的是原生桌面应用需额外处理）

---

## 五、特殊场景深度分析

### 5.1 Headless 浏览器录屏

**问题：** Headless Chrome/Edge 不经过操作系统显示层，`ffmpeg -f gdigrab` 捕获不到任何内容。

**解决方案对比：**

| 方案 | 可行性 | 说明 |
|------|--------|------|
| 改用 Headful + 虚拟显示 | ⚠️ 复杂 | Windows 无原生 Xvfb，需借助 RDP 常驻会话或第三方虚拟显示驱动 |
| **WebDriver 截图** | ✅ 推荐 | Headless 浏览器仍支持 `get_screenshot_as_png()`，基于内部渲染缓冲区 |
| Chrome DevTools Screencast | ✅ 推荐 | CDP `Page.startScreencast` 事件流，chrome-headless 原生支持 |
| ffmpeg + 浏览器内置录制 | ❌ 不可行 | Headless 无画面输出 |

**推荐实现（CDP Screencast）：**

```python
# 通过 Chrome DevTools Protocol 获取视频帧流
# 不依赖 WebDriver，也不依赖屏幕输出
from selenium.webdriver.chrome.service import Service
from selenium.webdriver import Chrome

driver = Chrome()
# 启用 CDP Screencast
driver.execute_cdp_cmd("Page.startScreencast", {
    "format": "jpeg",
    "quality": 80,
    "maxWidth": 1280,
    "maxHeight": 720,
    "everyNthFrame": 2  # 降低帧率以减少开销
})

# 在事件监听器中接收帧数据并写入文件
# （此处省略事件回调实现，可用 websocket 或 selenium-devtools 库）
```

> **结论：** Headless 浏览器场景下，**CDP Screencast** 或 **WebDriver 高频截图** 是唯一可行方案。`ffmpeg` 完全不适用。

### 5.2 无 RDP 连接的 Windows VM / CI 环境

**问题：** Windows 的 `gdigrab` 需要**活跃的用户桌面会话**（Active WinStation/Desktop）。在以下情况会捕获黑屏：

- RDP 断开后会话被锁定
- 通过 SSH / WinRM 启动测试（Session 0，无桌面）
- 云服务器默认未登录

**解决方案：**

| 方案 | 操作步骤 | 稳定性 |
|------|---------|--------|
| **配置自动登录** | 设置 `AutoAdminLogon` + `DefaultPassword` 注册表，开机自动进入桌面 | ✅ 高 |
| **RDP 断开保活** | `tscon %sessionname% /dest:console` 断开 RDP 但不锁定会话 | ✅ 高 |
| **禁用锁屏** | 组策略 `Do not display the lock screen` + 电源选项关闭屏幕保护 | ✅ 高 |
| **使用计划任务** | 在"只有用户登录时运行"模式下触发测试，确保有交互式会话 | ✅ 高 |
| **改用 WebDriver 截图** | 不依赖 GDI，SSH 启动也能工作 | ✅ 高，但仅限浏览器 |

**推荐组合拳：**

```powershell
# 1. 配置自动登录（管理员 PowerShell）
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "AutoAdminLogon" -Value "1"
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "DefaultUserName" -Value "tester"
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "DefaultPassword" -Value "password"

# 2. 禁用锁屏（组策略或注册表）
Set-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization" -Name "NoLockScreen" -Value "1"

# 3. 测试脚本以计划任务方式启动，确保在交互式会话中
# （或者通过已登录的 RDP 会话断开保活后运行）
```

**验证会话状态：**

```powershell
query user  # 查看当前会话状态
# 状态应为 "Active"，不能是 "Disc" 或锁定
```

> **结论：** 通过**自动登录 + 禁用锁屏 + 计划任务**，可以让 Windows VM 在无人值守时保持活跃桌面会话，使 `ffmpeg gdigrab` 正常工作。若 CI 环境严格禁止桌面会话，则**必须降级为 WebDriver 截图方案**。

---

## 六、综合对比矩阵

| 维度 | 方案一：Appium 原生 | 方案二：ffmpeg 外挂 | 方案三：WebDriver 截图 |
|------|-------------------|-------------------|----------------------|
| **Windows 桌面应用** | ❌ 不支持 | ✅ 完美 | ⚠️ 需额外处理（只能截浏览器窗口） |
| **Windows Headful 浏览器** | ❌ 不支持 | ✅ 完美 | ✅ 支持 |
| **Headless 浏览器** | ❌ 不支持 | ❌ 不支持 | ✅ 完美 |
| **无 RDP VM / CI** | ❌ 不支持 | ⚠️ 需配置保活 | ✅ 完美 |
| **性能（CPU）** | 中等 | ✅ **最优**（硬件编码） | ❌ **最差**（PNG 编码开销大） |
| **视频文件大小** | 小 | ✅ 小（H.264 压缩） | ⚠️ 中等（原始帧 + 合成后） |
| **Crash 后视频保留** | ❌ 丢失 | ✅ **保留** | ⚠️ 部分保留（已落盘的帧） |
| **实现复杂度** | 低 | 中等 | 中等偏高 |
| **帧率（fps）** | 10~30 | ✅ 可配置 1~60 | 受限于截图速度，通常 2~10 |
| **调试定位能力** | 一般 | ✅ 高（完整桌面上下文） | ⚠️ 中等（仅浏览器视口） |
| **磁盘实时写入** | 否（内存缓冲） | ✅ 是（边录边写） | ✅ 是（逐帧写 PNG） |

---

## 七、最终推荐：混合架构

没有任何单一方案能覆盖全部场景。推荐根据被测目标类型**动态选择**录制后端：

```
测试启动
    │
    ▼
判断被测目标类型
    │
    ├── 桌面原生应用（Calculator、WPF 客户端等）
    │       │
    │       ▼
    │   启动 ffmpeg gdigrab 录整个桌面
    │       │
    │       └── 输出：H.264 MP4（低 CPU、高可用性）
    │
    ├── Headful 浏览器（Chrome/Edge 有界面模式）
    │       │
    │       ▼
    │   启动 ffmpeg gdigrab 录整个桌面
    │       │
    │       └── 输出：H.264 MP4（同时覆盖浏览器和系统弹窗）
    │
    └── Headless 浏览器 或 无桌面会话的 CI 环境
            │
            ▼
        启动 WebDriver 高频截图线程（或 CDP Screencast）
            │
            └── 输出：PNG 序列 → 测试结束后 ffmpeg 合成 MP4
```

### 7.1 统一封装示例

```python
import os
import platform
from enum import Enum

class RecordingBackend(Enum):
    FFMPEG_GDIGRAB = "ffmpeg_gdigrab"      # Windows 桌面 / Headful 浏览器
    WEBDRIVER_SCREENSHOT = "webdriver_ss"   # Headless / 无桌面会话
    CDP_SCREENCAST = "cdp_screencast"       # Headless Chrome 最优

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

# 使用：一行代码自动选择最优后端
recorder = UnifiedRecorder(driver, "output/test_login.mp4", target_type="browser")
recorder.start()
# ... 执行测试 ...
recorder.stop()
```

### 7.2 关键配置建议

| 场景 | 推荐后端 | ffmpeg 参数 / 截图频率 | 备注 |
|------|---------|----------------------|------|
| Windows 桌面 App | ffmpeg gdigrab | `-framerate 10 -c:v h264_qsv` | 硬件编码优先 |
| Windows Headful 浏览器 | ffmpeg gdigrab | `-framerate 10 -c:v h264_qsv` | 能捕获系统弹窗、下载框 |
| Windows Headless 浏览器 | WebDriver 截图 或 CDP | `fps=5`，`get_screenshot_as_png()` | 不依赖桌面会话 |
| Linux CI (Xvfb) | ffmpeg x11grab | `-f x11grab -i :99` | Xvfb 提供虚拟显示 |
| Linux Headless | WebDriver 截图 | `fps=5` | 同 Windows headless |

### 7.3 灾难恢复机制

无论选择哪种后端，必须保证**测试进程异常退出时视频不丢失**：

```python
import atexit
import signal

recorder = UnifiedRecorder(driver, output_path)
recorder.start()

# 注册多重保险
atexit.register(recorder.stop)  # 正常退出 / 未捕获异常
signal.signal(signal.SIGTERM, lambda *_: recorder.stop())  # kill -15
signal.signal(signal.SIGINT, lambda *_: recorder.stop())   # Ctrl+C

# 对 ffmpeg 后端额外保护：ffmpeg 自身是独立进程，即使 Python crash，
# 只需确保 ffmpeg 进程最终被 terminate（可用 watchdog 进程监控）
```

---

## 八、结论

| 问题 | 答案 |
|------|------|
| **Appium 原生录屏能在 Windows 上用吗？** | **不能。** `appium-windows-driver` 未实现该 API |
| **性能最好的方案是什么？** | **ffmpeg 外挂 + 硬件编码**（Intel QSV / NVIDIA NVENC），CPU 占用最低 |
| **Appium crash 了视频还在吗？** | **ffmpeg 方案：在。** 它是独立 OS 进程。**WebDriver 截图：部分在。** 已落盘的帧保留。**Appium 原生：不在。** |
| **Headless 浏览器怎么录？** | 不能用 ffmpeg。用 **WebDriver 高频截图** 或 **Chrome DevTools Screencast** |
| **无 RDP 的 Windows VM 怎么录？** | 配置**自动登录 + 禁用锁屏**，让桌面会话保持活跃，即可用 ffmpeg；若 CI 禁止，降级为 WebDriver 截图 |

**最终选型：以 ffmpeg 外挂进程为默认方案，WebDriver 截图为 headless/CI 兜底，通过统一封装层自动切换。**
