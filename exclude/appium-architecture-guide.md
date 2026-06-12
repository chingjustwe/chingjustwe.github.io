---
layout: post
title:  "Appium 架构设计与工作流详解"
date:   2026-06-05 18:00:00 +0800
categories: testing
---

## 一、Appium 是什么

Appium 是一个开源的跨平台 UI 自动化测试框架，覆盖**移动端**（Android / iOS）和**桌面端**（Windows）。核心思想是充当"翻译官"——测试脚本不直接操控被测应用，而是通过 Appium 将指令转译为各平台原生 API 调用。

**三大核心优势：**

- **不修改 App 代码**：无需植入 SDK 或重新打包，直接测试生产包
- **跨平台 & 跨语言**：一套 API 同时覆盖 Android、iOS、Windows，支持 Python / Java / JavaScript / Ruby / C# 等语言
- **跨应用类型**：原生应用（Native）、移动端浏览器页面（Web）、混合应用（Hybrid）全覆盖

---

## 二、核心组件清单

三个平台的组件对比如下。注意"组件"不等于"进程"——有些组件是独立进程，有些是加载到其他进程内的库（详见第七节）：

| 层次 | Android | iOS | Windows |
|------|---------|-----|---------|
| **测试脚本** | 任意语言编写 | 同左 | 同左 |
| **Client Library** | 脚本进程内的库，封装 W3C WebDriver HTTP 请求 | 同左 | 同左 |
| **Appium Server** | Node.js 独立进程，监听 4723，路由与 Session 管理 | 同左 | 同左 |
| **Driver 插件** | `appium-uiautomator2-driver`（Server 进程内加载） | `appium-xcuitest-driver`（同上） | `appium-windows-driver`（同上） |
| **跨机通道** | ADB（USB / TCP） | libimobiledevice | WinAppDriver（本地 HTTP 或远程） |
| **设备端代理** | UIAutomator2 Server APK（:6790） | WebDriverAgent（:8100） | WinAppDriver.exe（独立进程） |
| **系统 UI 框架** | UIAutomator2（Accessibility） | XCUITest | Windows UI Automation (UIA) |
| **被测目标** | Android App | iOS App | Win32 / WPF / WinForms / UWP 应用 |

> **Appium 1.x vs 2.x**：1.x 时代所有 Driver 内置于 Server；2.x 起 Driver 独立为可插拔插件，按需安装。但无论哪个版本，Driver 始终在 Appium Server 进程内运行，不是独立进程。

**Windows 的关键差异：**

- 不需要在设备上额外安装代理 APK/IPA——Windows UIA 是操作系统内置的，WinAppDriver 直接调用即可
- 当测试机与被测机是**同一台 PC** 时，所有组件共驻一台机器，无物理线缆、无网络链路
- 被测目标是桌面应用程序窗口，而非移动 App

---

## 三、架构设计：三层模型（全平台）

```
                测试脚本（任意语言）
                      │
               HTTP · WebDriver 协议
                      │
             ┌──────────────────┐
             │   Appium Server   │  ← 协议转换 + 能力聚合层
             └───┬─────┬─────┬──┘
                 │     │     │
     platformName:  android  iOS    windows
                 │     │     │
                 ▼     ▼     ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ UIA2     │ │ XCUITest │ │ Windows      │
        │ Driver   │ │ Driver   │ │ Driver       │  ← 均在 Server 进程内
        └────┬─────┘ └────┬─────┘ └──────┬───────┘
             │ ADB        │ libimobiledevice │ HTTP (本地或远程)
             ▼            ▼                  ▼
        ┌──────────┐ ┌──────────┐    ┌──────────────┐
        │ UIA2     │ │ WDA      │    │ WinAppDriver │
        │ Server   │ │ (:8100)  │    │ .exe (:4724) │  ← 独立进程
        │ (:6790)  │ │          │    │              │
        └────┬─────┘ └────┬─────┘    └──────┬───────┘
             │            │                 │
             ▼            ▼                 ▼
        UIAutomator2  XCUITest       Windows UIA
             │            │                 │
             ▼            ▼                 ▼
        Android App  iOS App         Windows Desktop App
```

Appium Server 根据 Session 创建时的 `platformName` 决定将请求路由到哪个 Driver，Driver 再通过平台特定通道下发到设备端代理执行。

---

## 四、一次请求的完整流程

### 4.1 Android（经典跨机流程）

```
① driver.find_element(By.ID, "btn_login").click()

② Client Library → POST /session/{id}/element/click  (W3C WebDriver)

③ Appium Server (:4723) → 查 platformName → 路由给 UIA2 Driver

④ UIA2 Driver → 通过 ADB TCP 隧道转发到设备

⑤ UIA2 Server APK (:6790) → 调用 Accessibility API

⑥ UIAutomator2 框架 → 遍历控件树定位按钮

⑦ Android 系统注入 MotionEvent → App 收到 onClick 回调

⑧ 结果原路返回
```

### 4.2 Windows（本地同机流程）⭐

当测试机就是 Windows 本机、被测应用也跑在同一台电脑上时，链路大幅简化：

```
① driver.find_element(By.NAME, "计算").click()

② Client Library → POST /session/{id}/element/click  (W3C WebDriver)

③ Appium Server (:4723) → 查 platformName → 路由给 Windows Driver

④ Windows Driver → HTTP 转发至 WinAppDriver（本地 localhost）

⑤ WinAppDriver → 调用 Windows UI Automation COM API

⑥ UIA → 定位窗口控件树中的目标按钮

⑦ 系统注入点击事件 → 桌面应用收到回调

⑧ 结果原路返回
```

**同机场景的特点：**

- 所有组件（脚本、Server、Driver、WinAppDriver、被测应用）共驻一台 Windows PC
- 无需 USB 线缆、无需网络穿透——全部走 localhost 本地通信
- WinAppDriver 承担了"设备端代理"的角色，但它本质上是一个普通 Windows 进程，不需要 root / 越狱 / Accessibility 权限
- 延迟极低，调试方便：断点 → 单步 → 即时看桌面变化

### 4.3 iOS

流程与 Android 结构一致，设备侧替换为 WebDriverAgent → XCUITest → iOS 系统即可。

---

## 五、Appium 如何测浏览器？跟 Selenium 一样吗？

Appium 的浏览器测试与桌面应用测试**体验相似但机制完全不同**。这里分两种情况讨论。

### 5.1 移动端浏览器（Appium 的核心 Web 场景）

在 Android 上测试 Chrome 或在 iOS 上测试 Safari 时，Appium 的架构是这样的：

```
测试脚本
   │  driver.find_element(By.CSS, ".login-btn").click()
   │           ↑ 注意：用 CSS/XPath，而非 UIA/Accessibility 选择器
   ▼
Appium Server (:4723)
   │  根据 Session 配置，判断当前是 WebView 上下文
   │  将 WebDriver 指令委托给 ......
   ▼
Chromedriver（Android）或 Safari Remote Debug（iOS）
   │  ← 这是一个被 Appium 管理的子进程，而非 Appium Driver
   │  ← 通信协议：Chrome DevTools Protocol 或 WebKit Remote Debug
   ▼
浏览器进程（Chrome / Safari）
   │  在渲染后的 DOM 中定位元素
   ▼
页面中的按钮被点击
```

**与桌面应用测试的关键区别：**

| | 桌面应用（Windows Driver） | 移动端浏览器（Appium） |
|---|---|---|
| **定位策略** | `By.NAME`, `By.CLASS_NAME`, `AutomationId` — UIA 控件树 | `By.CSS`, `By.XPATH`, `By.ID` — DOM 树 |
| **底层通路** | WinAppDriver → Windows UIA | Appium 管理的 Chromedriver → Chrome DevTools |
| **是否需要上下文切换** | 不需要，天然只有一个 Native 上下文 | **需要**：`driver.switch_to.context('WEBVIEW_xxx')` |
| **元素查看器** | inspect.exe / Accessibility Insights | Chrome DevTools |

### 5.2 桌面端浏览器

**Appium 不能以"浏览器"的身份测试桌面浏览器。** Appium 的 Windows Driver 只能将浏览器视为一个 Win32 窗口——它能看到菜单栏、地址栏、标签栏这些 **浏览器外壳控件**（UIA 控件），但**看不到页面内部的 DOM**。

如果目标是测试网页内容，应直接用 Selenium：

```
# 正确：Selenium 测桌面浏览器
from selenium import webdriver
driver = webdriver.Chrome()
driver.find_element(By.CSS, ".btn").click()  # 直接操作 DOM

# 错误：Appium 测桌面浏览器
driver.find_element(By.NAME, "地址栏")  # 只能找到浏览器外壳控件
```

### 5.3 总结：Appium vs Selenium 的浏览器测试

| 维度 | Appium 测浏览器 | Selenium 测浏览器 |
|------|----------------|-------------------|
| **定位元素** | DOM 选择器（CSS / XPath）——**与 Selenium 相同** | DOM 选择器 |
| **底层引擎** | Appium 代理 Chromedriver —— **多一跳** | Chromedriver 直连浏览器 |
| **API 表面** | `find_element()` | `find_element()` —— **几乎一致** |
| **上下文管理** | 需要手动切换 NATIVE_APP ↔ WEBVIEW | 不涉及（始终在页面内） |
| **适用场景** | 移动端混合应用，需要在原生页面和 WebView 之间切换 | 纯 Web 测试 |

> **一句话结论：** Appium 测移动端浏览器的操作体验跟 Selenium **表面上很像**（都用 CSS/XPath，都发 WebDriver 协议），但底层**多了一层 Appium 代理**，且 Appium 的独特价值在于能在 Native 和 WebView 之间做上下文切换——这是 Selenium 做不到的。至于**桌面浏览器**，请直接用 Selenium，Appium 无法接触到页面 DOM。

---

## 六、桌面应用 vs 浏览器自动化：技术路线一览

综合上面两节，将三种自动化场景的技术路线完整对比如下：

```
场景 A：桌面原生应用                   场景 B：移动端浏览器              场景 C：桌面浏览器
                                    
Appium Client                       Appium Client                    Selenium Client
    │ WebDriver                          │ WebDriver                      │ WebDriver
    ▼                                   ▼                                ▼
Appium Server                        Appium Server                    ChromeDriver
    │                                   │                                │
Windows Driver                       Chromedriver (子进程)             Chrome DevTools
    │                                   │                                │
WinAppDriver                         Chrome DevTools                    ▼
    │                                   │                            Chrome 浏览器
Windows UIA                              ▼                                │
    │                              Chrome 浏览器                          DOM
    ▼                                   │                                  
桌面 App                               DOM
```

| 对比维度 | 桌面原生应用 | 移动端浏览器 | 桌面浏览器 |
|----------|------------|------------|-----------|
| **工具** | Appium + Windows Driver | Appium + Chromedriver | Selenium + ChromeDriver |
| **定位体系** | UIA 控件树 | DOM | DOM |
| **上下文** | 单一（Native） | 可切换（Native ↔ WebView） | 单一（Web） |
| **元素选择器** | Name, ClassName, AutomationId | CSS, XPath, ID | CSS, XPath, ID |
| **链路跳数** | 3 跳 | 3 跳（Appium → Chromedriver → Browser） | 1 跳（Selenium → Browser） |

---

## 七、Windows 环境下的进程全景图

厘清"逻辑组件"和"操作系统进程"的区别，是理解 Appium 架构的关键。

### 7.1 哪些必须作为独立进程运行？

当你在 Windows 上测试一个桌面应用时，实际运行着的进程是：

```
┌──────────────────────────────────────────────────────┐
│                    Windows PC                        │
│                                                      │
│  ┌─────────────┐   HTTP (:4723)   ┌───────────────┐ │
│  │ python.exe   │ ───────────────→ │ node.exe       │ │
│  │ (测试脚本)   │                  │ (Appium Server │ │
│  │ + Client Lib │                  │  + Windows     │ │
│  └─────────────┘                  │    Driver 插件) │ │
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
│                                   │ (被测桌面应用)  │ │
│                                   └───────────────┘ │
└──────────────────────────────────────────────────────┘
```

**一共 4 个进程：**

| 进程 | 可执行文件 | 何时启动 | 是否必须常驻 |
|------|-----------|---------|-------------|
| **测试脚本** | `python.exe` / `java.exe` | 执行测试时 | 否，测试结束即退出 |
| **Appium Server** | `node.exe`（运行 `appium` 命令） | 测试开始前手动启动 | **是**，整个测试期间 |
| **WinAppDriver** | `WinAppDriver.exe` | 测试开始前手动启动 | **是**，整个测试期间 |
| **被测应用** | `TargetApp.exe` | 测试中由 Appium 启动或预先手动启动 | Session 期间存在 |

### 7.2 哪些不是独立进程？

| 逻辑组件 | 实际形态 | 运行位置 |
|----------|---------|---------|
| **Client Library** | Python/Java 包（如 `Appium-Python-Client`），纯库代码 | 测试脚本进程内 |
| **Windows Driver** | Appium 2.x 插件（npm 包），被 `require()` 加载 | Appium Server 进程内 |
| **UIA** | Windows 操作系统内置的 COM 组件 | 内核/系统服务，非独立进程 |

### 7.3 完整启动流程

以 Windows 同机测试为例，操作顺序如下：

```bash
# 1. 启动 WinAppDriver（如不手动启动，Appium 也可配置自动拉起）
"C:\Program Files\Windows Application Driver\WinAppDriver.exe"

# 2. 启动 Appium Server
appium

# 3. 运行测试脚本
python test_calculator.py
# → 脚本执行完毕后自动退出
# → Appium Server 和 WinAppDriver 保持运行，供后续测试复用
```

### 7.4 与移动端的进程对比

| | Windows（同机） | Android 真机 | iOS 真机 |
|---|---|---|---|
| **PC 侧进程数**（非脚本） | 2（Appium Server、WinAppDriver） | 2（Appium Server、ADB daemon） | 1（Appium Server） |
| **设备侧进程数** | 0（被测 App 本身也是 PC 进程） | 2（UIA2 Server APK、被测 App） | 2（WDA、被测 App） |
| **总计** | 4 | 5 | 4 |

---

## 八、为什么采用这种链路？

链路中存在**分层代理**，这是 Appium 架构的核心设计：

```
测试脚本 ──→ Client Library ──→ Appium Server ──→ Driver 插件
                                                      │
                     ┌────────────────────────────────┘
                     ▼
               设备端 Agent
    (UIA2 Server / WDA / WinAppDriver)
                     │
                     ▼
               系统 UI 框架
```

### 8.1 Client ↔ Server：跨语言 + 跨平台

各平台的底层 UI 框架（UIAutomator2 / XCUITest / Windows UIA）各自使用私有协议，且每种语言 SDK 难以逐一适配。Appium Server 收束了这种复杂性：

- **语言解耦**：所有语言 Client 只说统一的"WebDriver 普通话"，Server 独自承担底层协议转换
- **平台屏蔽**：无论测 Android、iOS 还是 Windows，脚本中永远是 `element.click()`，Server 根据 `platformName` 自动路由
- **能力聚合**：Session 管理、录制回放、截图、日志等通用能力统一在 Server 层实现

### 8.2 Driver ↔ 设备端 Agent：跨越安全边界

- **Android / iOS**：系统安全机制禁止外部进程直接操控 UI，必须在设备内部运行一个持有权限的代理进程——UIA2 Server APK 或 WDA
- **Windows**：WinAppDriver 也是独立的本地代理进程，通过 UIA COM 接口访问桌面控件树。Windows 的安全限制比移动端宽松（同一用户会话内），因此链路短于移动端

### 8.3 架构解耦的长期价值

操作系统和官方测试框架频繁迭代（Apple 从 UIAutomation 迁到 XCUITest，Microsoft 持续更新 UIA）。由于 Server 与 Driver 之间通过插件机制解耦：

- 底层框架大换血时，只需更新或替换对应 Driver 插件
- 测试脚本无需重构，长期积累的测试资产得以保留

**特别地，Windows 同机场景完美展示了这种架构的灵活性：** 链路虽短（去掉 USB/网络层），但插件模型不变——Windows Driver 和其他 Driver 在 Appium Server 看来是对等的插件，架构层面没有特殊化处理。

---

## 九、总结

> **Appium Server 是协议转换 + 能力聚合的中台。** 链路看似冗长，但它用微小的传输延迟换来了：编程语言绝对自由、多平台代码逻辑高度统一、以及面向未来升级的极强扩展性。

| 场景 | 进程数 | 典型延迟来源 |
|------|-------|-------------|
| Android / iOS 真机 | 4~5 | USB 传输 + 网络往返 |
| Android / iOS 模拟器 | 4~5 | 模拟器虚拟化开销 |
| **Windows 桌面应用（同机）** | **4** | 几乎可忽略（全 localhost） |
