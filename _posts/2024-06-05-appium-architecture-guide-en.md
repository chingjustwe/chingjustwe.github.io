---
layout: post
title: Appium Architecture Design and Workflow
date: 2024-06-05
categories: 
  - testing
---

## 1. What Is Appium?

Appium is an open-source, cross-platform UI automation testing framework covering **mobile** (Android / iOS) and **desktop** (Windows). Its core philosophy is to act as a "translator" — test scripts never directly manipulate the device; instead, Appium translates commands into each platform's native API calls.

**Three core advantages:**

- **No App modification required**: Test production builds directly without injecting any SDK or re-packaging
- **Cross-platform & cross-language**: One API covers Android, iOS, and Windows simultaneously, with support for Python, Java, JavaScript, Ruby, C#, and more
- **Cross-application type**: Native apps, mobile browser pages (Web), and hybrid apps (Hybrid) are all covered

---

## 2. Core Component Inventory

A side-by-side comparison across the three platforms. Note that "component" does not equal "process" — some are standalone processes, while others are libraries loaded into other processes (see Section 7 for details):

| Layer | Android | iOS | Windows |
|-------|---------|-----|---------|
| **Test Script** | Written in any language | Same | Same |
| **Client Library** | In-process library, wraps calls into W3C WebDriver HTTP requests | Same | Same |
| **Appium Server** | Standalone Node.js process, listens on :4723, handles routing & session management | Same | Same |
| **Driver Plugin** | `appium-uiautomator2-driver` (loaded inside Server process) | `appium-xcuitest-driver` (same) | `appium-windows-driver` (same) |
| **Cross-machine Channel** | ADB (USB / TCP) | libimobiledevice | WinAppDriver (local HTTP or remote) |
| **Device-side Agent** | UIAutomator2 Server APK (:6790) | WebDriverAgent (:8100) | WinAppDriver.exe (standalone process) |
| **System UI Framework** | UIAutomator2 (Accessibility) | XCUITest | Windows UI Automation (UIA) |
| **Test Target** | Android App | iOS App | Win32 / WPF / WinForms / UWP applications |

> **Appium 1.x vs 2.x**: In the 1.x era, all drivers were bundled inside the Server. Starting with 2.x, drivers became independent pluggable plugins installed on demand. However, regardless of the version, drivers **always run inside the Appium Server process** — they are never standalone processes.

**Key differences on Windows:**

- No need to install an agent APK/IPA on the device — Windows UIA is built into the OS; WinAppDriver calls it directly
- When the test machine and the device under test are the **same PC**, all components co-reside on one machine — no physical cables, no network traversal
- The test target is a desktop application window, not a mobile app

---

## 3. Architecture: The Three-Layer Model (All Platforms)

```
                Test Script (any language)
                      │
              HTTP · WebDriver Protocol
                      │
             ┌──────────────────┐
             │   Appium Server   │  ← Protocol translation & capability aggregation
             └───┬─────┬─────┬──┘
                 │     │     │
     platformName: android  iOS    windows
                 │     │     │
                 ▼     ▼     ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ UIA2     │ │ XCUITest │ │ Windows      │
        │ Driver   │ │ Driver   │ │ Driver       │  ← All inside Server process
        └────┬─────┘ └────┬─────┘ └──────┬───────┘
             │ ADB        │ libimobiledevice │ HTTP (local or remote)
             ▼            ▼                  ▼
        ┌──────────┐ ┌──────────┐    ┌──────────────┐
        │ UIA2     │ │ WDA      │    │ WinAppDriver │
        │ Server   │ │ (:8100)  │    │ .exe (:4724) │  ← Standalone processes
        │ (:6790)  │ │          │    │              │
        └────┬─────┘ └────┬─────┘    └──────┬───────┘
             │            │                 │
             ▼            ▼                 ▼
        UIAutomator2  XCUITest       Windows UIA
             │            │                 │
             ▼            ▼                 ▼
        Android App  iOS App         Windows Desktop App
```

Appium Server routes requests to the appropriate Driver based on the `platformName` set during Session creation. The Driver then sends commands down to the device-side agent through the platform-specific channel for execution.

---

## 4. End-to-End Request Flow

### 4.1 Android (Classic Cross-Machine Flow)

```
① driver.find_element(By.ID, "btn_login").click()

② Client Library → POST /session/{id}/element/click  (W3C WebDriver)

③ Appium Server (:4723) → Look up platformName → Route to UIA2 Driver

④ UIA2 Driver → Forward via ADB TCP tunnel to the device

⑤ UIA2 Server APK (:6790) → Call Accessibility API

⑥ UIAutomator2 framework → Traverse control tree to locate the button

⑦ Android system injects MotionEvent → App receives onClick callback

⑧ Result returns along the same path in reverse
```

### 4.2 Windows (Local Same-Machine Flow) ⭐

When the test machine and the app under test both run on the same Windows PC, the chain is significantly simplified:

```
① driver.find_element(By.NAME, "Calculate").click()

② Client Library → POST /session/{id}/element/click  (W3C WebDriver)

③ Appium Server (:4723) → Look up platformName → Route to Windows Driver

④ Windows Driver → Forward via HTTP to WinAppDriver (localhost)

⑤ WinAppDriver → Call Windows UI Automation COM API

⑥ UIA → Locate the target button within the window's control tree

⑦ System injects click event → Desktop app receives callback

⑧ Result returns along the same path in reverse
```

**Same-machine characteristics:**

- All components (script, Server, Driver, WinAppDriver, app under test) co-reside on a single Windows PC
- No USB cable, no network traversal — everything communicates over localhost
- WinAppDriver plays the role of "device-side agent", but it is just a regular Windows process — no root/jailbreak/Accessibility permissions required
- Ultra-low latency, easy debugging: set breakpoint → step through → watch the desktop change instantly

### 4.3 iOS

The flow structure is identical to Android; replace the device-side chain with WebDriverAgent → XCUITest → iOS system.

---

## 5. How Does Appium Test Browsers? Is It Like Selenium?

Appium's browser testing looks similar to desktop app testing on the surface, but the underlying mechanism is entirely different. There are two cases to distinguish.

### 5.1 Mobile Browsers (Appium's Core Web Scenario)

When testing Chrome on Android or Safari on iOS, Appium's architecture looks like this:

```
Test Script
   │  driver.find_element(By.CSS, ".login-btn").click()
   │           ↑ Note: CSS/XPath selectors, not UIA/Accessibility
   ▼
Appium Server (:4723)
   │  Based on session config, determines current context is WebView
   │  Delegates WebDriver commands to ...
   ▼
Chromedriver (Android) or Safari Remote Debug (iOS)
   │  ← A subprocess managed by Appium, NOT an Appium Driver
   │  ← Protocol: Chrome DevTools Protocol or WebKit Remote Debug
   ▼
Browser Process (Chrome / Safari)
   │  Locates the element within the rendered DOM
   ▼
Button on the page gets clicked
```

**Key differences from desktop app testing:**

| | Desktop App (Windows Driver) | Mobile Browser (Appium) |
|---|---|---|
| **Locator Strategy** | `By.NAME`, `By.CLASS_NAME`, `AutomationId` — UIA control tree | `By.CSS`, `By.XPATH`, `By.ID` — DOM tree |
| **Underlying Path** | WinAppDriver → Windows UIA | Appium-managed Chromedriver → Chrome DevTools |
| **Context Switching** | Not needed; only one Native context exists | **Required**: `driver.switch_to.context('WEBVIEW_xxx')` |
| **Element Inspector** | inspect.exe / Accessibility Insights | Chrome DevTools |

### 5.2 Desktop Browsers

**Appium cannot test desktop browsers as "browsers".** Appium's Windows Driver can only see the browser as a Win32 window — it can see the menu bar, address bar, and tab bar as **browser chrome controls** (UIA controls), but it **cannot see the DOM inside the page**.

If your goal is to test web page content, use Selenium directly:

```python
# Correct: Selenium for desktop browser testing
from selenium import webdriver
driver = webdriver.Chrome()
driver.find_element(By.CSS, ".btn").click()  # Operates directly on the DOM

# Wrong: Appium for desktop browser testing
driver.find_element(By.NAME, "Address bar")  # Can only find browser chrome controls
```

### 5.3 Summary: Appium vs Selenium for Browser Testing

| Dimension | Appium Testing Browser | Selenium Testing Browser |
|-----------|----------------------|--------------------------|
| **Element Location** | DOM selectors (CSS / XPath) — **same as Selenium** | DOM selectors |
| **Underlying Engine** | Appium proxies Chromedriver — **one extra hop** | Chromedriver talks directly to browser |
| **API Surface** | `find_element()` | `find_element()` — **nearly identical** |
| **Context Management** | Manual context switching NATIVE_APP ↔ WEBVIEW required | None (always within the page) |
| **Use Case** | Mobile hybrid apps requiring switching between native pages and WebViews | Pure web testing |

> **Bottom line:** Testing mobile browsers with Appium **feels similar** to Selenium on the surface (both use CSS/XPath, both speak WebDriver protocol), but there is **an extra Appium proxy layer** underneath. Appium's unique value lies in **context switching** between Native and WebView — something Selenium cannot do. As for **desktop browsers**, use Selenium directly; Appium simply cannot reach the page DOM.

---

## 6. Desktop App vs Browser Automation: Full Technical Comparison

Bringing together the previous two sections, here is a complete side-by-side comparison of the three automation scenarios:

```
Scenario A: Desktop Native App       Scenario B: Mobile Browser        Scenario C: Desktop Browser

Appium Client                       Appium Client                    Selenium Client
    │ WebDriver                          │ WebDriver                      │ WebDriver
    ▼                                   ▼                                ▼
Appium Server                        Appium Server                    ChromeDriver
    │                                   │                                │
Windows Driver                       Chromedriver (subprocess)        Chrome DevTools
    │                                   │                                │
WinAppDriver                         Chrome DevTools                    ▼
    │                                   │                            Chrome Browser
Windows UIA                              ▼                                │
    │                              Chrome Browser                        DOM
    ▼                                   │
Desktop App                            DOM
```

| Dimension | Desktop Native App | Mobile Browser | Desktop Browser |
|-----------|-------------------|----------------|-----------------|
| **Tool** | Appium + Windows Driver | Appium + Chromedriver | Selenium + ChromeDriver |
| **Location System** | UIA control tree | DOM | DOM |
| **Context** | Single (Native) | Switchable (Native ↔ WebView) | Single (Web) |
| **Element Selectors** | Name, ClassName, AutomationId | CSS, XPath, ID | CSS, XPath, ID |
| **Hop Count** | 3 hops | 3 hops (Appium → Chromedriver → Browser) | 1 hop (Selenium → Browser) |

---

## 7. Windows Process Topology

Distinguishing between "logical components" and "OS processes" is key to understanding Appium's architecture.

### 7.1 Which Components Must Run as Standalone Processes?

When testing a desktop application on Windows, the actual running processes are:

```
┌──────────────────────────────────────────────────────┐
│                    Windows PC                        │
│                                                      │
│  ┌─────────────┐   HTTP (:4723)   ┌───────────────┐ │
│  │ python.exe   │ ───────────────→ │ node.exe       │ │
│  │ (test script)│                  │ (Appium Server │ │
│  │ + Client Lib │                  │  + Windows     │ │
│  └─────────────┘                  │    Driver)      │ │
│                                   └───────┬───────┘ │
│                                           │         │
│                                   HTTP (:4724)      │
│                                           │         │
│                                   ┌───────▼───────┐ │
│                                   │ WinAppDriver.  │ │
│                                   │ exe            │ │
│                                   └───────┬───────┘ │
│                                           │ UIA COM │
│                                   ┌───────▼───────┐ │
│                                   │ TargetApp.exe  │ │
│                                   │ (app under     │ │
│                                   │  test)          │ │
│                                   └───────────────┘ │
└──────────────────────────────────────────────────────┘
```

**4 processes in total:**

| Process | Executable | When Started | Must Stay Running? |
|---------|-----------|--------------|-------------------|
| **Test Script** | `python.exe` / `java.exe` | During test execution | No — exits when tests finish |
| **Appium Server** | `node.exe` (running `appium` command) | Manually started before tests | **Yes** — throughout the test session |
| **WinAppDriver** | `WinAppDriver.exe` | Manually started before tests | **Yes** — throughout the test session |
| **App Under Test** | `TargetApp.exe` | Launched by Appium during tests or pre-launched manually | Exists for the session duration |

### 7.2 What Is NOT a Standalone Process?

| Logical Component | Actual Form | Where It Runs |
|-------------------|-------------|---------------|
| **Client Library** | Python/Java package (e.g., `Appium-Python-Client`) — pure library code | Inside the test script process |
| **Windows Driver** | Appium 2.x plugin (npm package), loaded via `require()` | Inside the Appium Server process |
| **UIA** | COM component built into Windows OS | Kernel/system service, not a standalone process |

### 7.3 Complete Startup Sequence

For same-machine Windows testing, the operational order is:

```bash
# 1. Start WinAppDriver (Appium can also auto-launch it if configured)
"C:\Program Files\Windows Application Driver\WinAppDriver.exe"

# 2. Start Appium Server
appium

# 3. Run the test script
python test_calculator.py
# → Script auto-exits after execution
# → Appium Server and WinAppDriver stay running for subsequent test reuse
```

### 7.4 Process Count Comparison with Mobile

| | Windows (Same-Machine) | Android Physical Device | iOS Physical Device |
|---|---|---|---|
| **PC-side processes** (excl. script) | 2 (Appium Server, WinAppDriver) | 2 (Appium Server, ADB daemon) | 1 (Appium Server) |
| **Device-side processes** | 0 (app under test is also a PC process) | 2 (UIA2 Server APK, app under test) | 2 (WDA, app under test) |
| **Total** | 4 | 5 | 4 |

---

## 8. Why This Architecture?

The chain contains **layered proxies** — this is the core design of Appium's architecture:

```
Test Script ──→ Client Library ──→ Appium Server ──→ Driver Plugin
                                                       │
                     ┌────────────────────────────────┘
                     ▼
               Device-side Agent
    (UIA2 Server / WDA / WinAppDriver)
                     │
                     ▼
              System UI Framework
```

### 8.1 Client ↔ Server: Cross-Language + Cross-Platform

Each platform's underlying UI framework (UIAutomator2 / XCUITest / Windows UIA) uses its own proprietary protocol, and it is impractical for every language SDK to adapt to each one individually. Appium Server consolidates this complexity:

- **Language decoupling**: All language Clients only need to speak the universal "WebDriver lingua franca"; the Server alone handles the heavy lifting of translating to each underlying protocol
- **Platform abstraction**: Whether testing Android, iOS, or Windows, the script always calls `element.click()` — the Server auto-routes based on `platformName`
- **Capability aggregation**: Session management, recording/playback, screenshots, logging, and other shared capabilities are uniformly implemented at the Server layer

### 8.2 Driver ↔ Device-side Agent: Crossing Security Boundaries

- **Android / iOS**: The system security model prohibits external processes from directly manipulating the UI. A privileged agent process must run **inside the device** to reach the control tree — that is the role of UIA2 Server APK or WDA
- **Windows**: WinAppDriver is also an independent local agent process that accesses the desktop control tree through the UIA COM interface. Windows' security boundary is more relaxed than mobile (within the same user session), so the chain is shorter

### 8.3 The Long-Term Value of Decoupling

Mobile operating systems and official testing frameworks iterate frequently (e.g., Apple migrated from UIAutomation to XCUITest; Microsoft continuously updates UIA). Because the Server and Driver are decoupled through the plugin mechanism:

- When the underlying framework undergoes a major overhaul, only the corresponding Driver plugin needs to be updated or replaced
- Test scripts require zero refactoring — long-accumulated test assets are preserved

**The Windows same-machine scenario perfectly demonstrates this flexibility:** even though the chain is short (no USB/network layer), the plugin model remains the same — from Appium Server's perspective, the Windows Driver is a peer plugin alongside all others, with no architectural special-casing.

---

## 9. Summary

> **Appium Server is a middle platform for protocol translation and capability aggregation.** The chain may appear long, but it trades negligible transmission latency for: absolute programming language freedom, highly unified cross-platform code logic, and extreme extensibility for future upgrades.

| Scenario | Process Count | Typical Latency Sources |
|----------|--------------|------------------------|
| Android / iOS physical devices | 4–5 | USB transmission + network round-trips |
| Android / iOS emulators | 4–5 | Emulator virtualization overhead |
| **Windows desktop app (same-machine)** | **4** | Nearly negligible (all localhost) |
