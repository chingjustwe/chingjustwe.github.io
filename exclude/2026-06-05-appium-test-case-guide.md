---
layout: post
title:  "Appium 实战：编写测试用例与元素定位完全指南"
date:   2026-06-05 20:00:00 +0800
categories: 
  - testing
---

本文假设你已经搭建好 Appium 环境（Server 与对应 Driver 均已安装）， focus 在**如何写一条可运行的测试用例**以及**如何找到元素的定位信息**。

---

## 一、最小可运行示例（Python）

以 Windows 计算器为例，展示一条完整的测试用例长什么样：

```python
from appium import webdriver
from appium.options.windows import WindowsOptions
from selenium.webdriver.common.by import By

# 1. 配置 Desired Capabilities（启动参数）
options = WindowsOptions()
options.app = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"  # 计算器 UWP 的 AUMID

# 2. 建立会话（Session）
driver = webdriver.Remote(
    command_executor="http://127.0.0.1:4723",  # Appium Server 地址
    options=options
)

# 3. 定位元素并操作
driver.find_element(By.NAME, "一").click()
driver.find_element(By.NAME, "加").click()
driver.find_element(By.NAME, "二").click()
driver.find_element(By.NAME, "等于").click()

# 4. 断言结果
result = driver.find_element(By.ACCESSIBILITY_ID, "CalculatorResults").text
assert "3" in result, f"预期结果是 3，实际得到：{result}"

# 5. 结束会话
driver.quit()
```

**代码骨架拆解：**

| 步骤 | 作用 | 关键概念 |
|------|------|---------|
| 配置 Capabilities | 告诉 Appium 测什么平台、什么应用、什么设备 | `platformName`, `app`, `deviceName` 等 |
| `webdriver.Remote(...)` | 与 Appium Server 建立 HTTP 长连接，创建 Session | Session ID 是后续所有请求的上下文 |
| `find_element(...)` | 在控件树/DOM 中查找单个元素 | 需要指定**定位策略**和**定位值** |
| 元素操作 | `.click()`, `.send_keys()`, `.text` 等 | 触发真实用户交互 |
| `driver.quit()` | 销毁 Session，释放设备资源 | 必须调用，否则设备会被占住 |

---

## 二、核心 API：元素定位策略一览

`find_element(By.XXX, "value")` 中的 `By.XXX` 是定位策略。不同平台支持的策略不同：

| 定位策略 | Android | iOS | Windows | 适用场景 |
|---------|---------|-----|---------|---------|
| `By.ID` | ✅ `resource-id` | ❌ 不支持原生 ID | ⚠️ 不常用 | Android 首选 |
| `By.ACCESSIBILITY_ID` | ✅ `content-desc` | ✅ `accessibility-id` / `label` | ✅ `Name` | 跨平台首选（推荐） |
| `By.XPATH` | ✅ 完整 XPath | ✅ 完整 XPath | ⚠️ 支持但慢 | 兜底方案 |
| `By.CLASS_NAME` | ✅ `class`（如 `android.widget.Button`） | ✅ `type`（如 `XCUIElementTypeButton`） | ✅ `ClassName` | 结合其他条件使用 |
| `By.NAME` | ⚠️ `text`（已废弃） | ✅ `name` | ✅ `Name` | Windows 常用 |
| `By.CSS_SELECTOR` | ❌ | ❌ | ❌ | 仅 WebView 上下文 |
| `By.IMAGE` | ✅ | ✅ | ❌ | 图像识别（AI 驱动） |
| `-android uiautomator` | ✅ UiSelector 表达式 | ❌ | ❌ | Android 复杂查询 |
| `-ios predicate string` | ❌ | ✅ NSPredicate | ❌ | iOS 复杂查询 |

**选择优先级（从高到低）：**

```
ACCESSIBILITY_ID  >  ID  >  CLASS_NAME（结合层级） >  XPATH  >  IMAGE
```

---

## 三、如何获取元素的定位信息

这是开发者最关心的部分。三个平台各有官方工具。

### 3.1 Android：三种工具

#### 工具 A：Appium Inspector（最推荐，跨平台统一）

Appium 官方提供的可视化元素查看器，同时支持 Android / iOS / Windows。

**使用步骤：**

1. 下载 [Appium Inspector](https://github.com/appium/appium-inspector)（桌面应用，独立于 Appium Server）
2. 配置 Desired Capabilities：
   ```json
   {
     "platformName": "Android",
     "appium:deviceName": " emulator-5554",
     "appium:appPackage": "com.example.myapp",
     "appium:appActivity": ".MainActivity"
   }
   ```
3. 点击 **Start Session**，等待设备界面同步到 Inspector
4. 鼠标悬停在左侧截图上，右侧自动显示该元素的完整属性：

```
│ Element │ Attributes │
├─────────┼────────────┤
│ id      │ com.example.myapp:id/btn_login    ← 这就是 By.ID 的值
│ content-desc │ 登录按钮                        ← 这就是 By.ACCESSIBILITY_ID 的值
│ class   │ android.widget.Button              ← 这就是 By.CLASS_NAME 的值
│ text    │ 登录                                ← 注意：text 不是稳定定位方式
│ bounds  │ [100,200][300,400]                 ← 坐标，不建议直接用
```

5. 选中元素后，Inspector 会自动生成推荐的定位代码：
   ```python
   el = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value="登录按钮")
   ```

#### 工具 B：Android Studio Layout Inspector

Android Studio 内置工具，适合开发阶段使用：

```
Android Studio → Tools → Layout Inspector → 选择设备/进程
```

优势：能看到 Compose 布局的语义树（Compose 没有传统 resource-id，需依赖 `testTag` 或 `semantics`）。

#### 工具 C：uiautomatorviewer（已过时，不推荐）

```bash
$ANDROID_HOME/tools/bin/uiautomatorviewer
```

仅支持传统 XML 布局，无法查看 Compose，且 Android SDK 已逐步弃用。

---

### 3.2 iOS：两种工具

#### 工具 A：Appium Inspector（同样最推荐）

配置 Capabilities：

```json
{
  "platformName": "iOS",
  "appium:deviceName": "iPhone 15",
  "appium:platformVersion": "17.0",
  "appium:bundleId": "com.example.myapp",
  "appium:automationName": "XCUITest"
}
```

同步后，右侧属性面板会显示：

```
│ Element │ Attributes │
├─────────┼────────────┤
│ name          │ 登录按钮              ← By.NAME / By.ACCESSIBILITY_ID
│ label         │ 登录按钮              ← 辅助功能标签
│ type          │ XCUIElementTypeButton ← By.CLASS_NAME
│ value         │ nil
│ accessible    │ true                  ← 是否为辅助功能元素
```

#### 工具 B：Xcode Accessibility Inspector

```
Xcode → Open Developer Tool → Accessibility Inspector
```

无需启动 Appium，直接查看任何已连接 iOS 设备或模拟器的辅助功能树。适合开发阶段快速验证 `accessibilityIdentifier` 是否设置正确。

**iOS 开发者注意：** 想让测试稳定，务必在代码里显式设置 `accessibilityIdentifier`：

```swift
// SwiftUI
Button("登录") {}
    .accessibilityIdentifier("login_button")  // ← 测试用 By.ACCESSIBILITY_ID 定位

// UIKit
let btn = UIButton()
btn.accessibilityIdentifier = "login_button"
```

---

### 3.3 Windows：两种工具

#### 工具 A：Appium Inspector

配置 Capabilities：

```json
{
  "platformName": "Windows",
  "appium:app": "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
  "appium:automationName": "Windows"
}
```

**注意：** Windows 应用需要预先启动（或配置 `app` 让 Appium 自动拉起）。Inspector 同步后显示：

```
│ Element │ Attributes │
├─────────┼────────────┤
│ Name          │ 一                    ← By.NAME / By.ACCESSIBILITY_ID
│ ClassName     │ Button                ← By.CLASS_NAME
│ AutomationId  │ num1Button            ← Windows 最稳定的定位方式（但不是 WebDriver 标准）
│ RuntimeId     │ [42,1234,2]           ← 每次启动会变，不可用
```

Windows 的 `AutomationId` 最稳定，但 Appium 的 `By.ID` **不直接映射** `AutomationId`。正确做法：

```python
# ❌ 错误：By.ID 在 Windows Driver 下行为不一致
# driver.find_element(By.ID, "num1Button")

# ✅ 正确：用 XPath 匹配 AutomationId，或用 Name
from appium.webdriver.common.appiumby import AppiumBy

driver.find_element(AppiumBy.XPATH, "//*[@AutomationId='num1Button']")
driver.find_element(By.NAME, "一")
```

#### 工具 B：Microsoft Accessibility Insights（Windows 原生最强）

微软官方工具，比 Appium Inspector 对 Windows 控件树的解析更精确：

```
下载：https://accessibilityinsights.io/
模式：Live Inspect → 鼠标悬停到目标窗口 → 查看右侧属性树
```

优势：能显示 Appium Inspector 可能遗漏的深层 UIA 属性，特别适合企业级 Win32/WPF 应用。

---

## 四、完整测试用例：从定位到断言

以 **Android 登录页面**为例，演示完整的元素定位思路：

### 4.1 页面结构（开发视角）

```xml
<!-- res/layout/activity_login.xml -->
<EditText
    android:id="@+id/et_username"
    android:contentDescription="用户名输入框" />

<EditText
    android:id="@+id/et_password"
    android:contentDescription="密码输入框" />

<Button
    android:id="@+id/btn_login"
    android:contentDescription="登录按钮"
    android:text="登录" />

<TextView
    android:id="@+id/tv_error"
    android:visibility="gone" />
```

### 4.2 测试代码

```python
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# 1. 启动配置
options = UiAutomator2Options()
options.platform_name = "Android"
options.device_name = "emulator-5554"
options.app_package = "com.example.myapp"
options.app_activity = ".LoginActivity"
options.automation_name = "UiAutomator2"

driver = webdriver.Remote("http://127.0.0.1:4723", options=options)

# 2. 显式等待：页面加载完成
wait = WebDriverWait(driver, 10)
wait.until(EC.presence_of_element_located((By.ID, "com.example.myapp:id/et_username")))

# 3. 输入用户名（优先用 resource-id）
username = driver.find_element(By.ID, "com.example.myapp:id/et_username")
username.send_keys("test_user")

# 4. 输入密码（用 content-desc / accessibility id，更稳定）
password = driver.find_element(AppiumBy.ACCESSIBILITY_ID, "密码输入框")
password.send_keys("test_pass")

# 5. 点击登录按钮
login_btn = driver.find_element(By.ID, "com.example.myapp:id/btn_login")
login_btn.click()

# 6. 断言：检查错误提示是否出现（用 XPath 兜底）
error_msg = wait.until(
    EC.visibility_of_element_located(
        (AppiumBy.XPATH, "//android.widget.TextView[contains(@text, '错误')]")
    )
)
assert "用户名或密码错误" in error_msg.text

# 7. 清理
driver.quit()
```

**定位策略选择逻辑：**

| 元素 | 首选策略 | 原因 |
|------|---------|------|
| 用户名输入框 | `By.ID` | 开发显式定义了 `android:id`，稳定且唯一 |
| 密码输入框 | `AppiumBy.ACCESSIBILITY_ID` | 若 ID 含动态生成部分，accessibility id 更可控 |
| 登录按钮 | `By.ID` | 同用户名 |
| 错误提示文本 | `By.XPATH` | 文本内容动态变化，XPath `contains()` 最灵活 |

---

## 五、开发者如何"为测试埋点"

测试能否写得稳定，**80% 取决于开发阶段有没有给元素埋好定位标记**。以下是各平台的最佳实践：

### 5.1 Android

```xml
<!-- ✅ 好：resource-id 是唯一且语义化的 -->
<Button android:id="@+id/btn_submit_order" />

<!-- ❌ 坏：id 无意义，或用了自动生成值 -->
<Button android:id="@+id/button7" />

<!-- ✅ 好：contentDescription 描述功能，而非视觉文本 -->
<ImageView
    android:contentDescription="用户头像"
    android:src="@drawable/avatar" />
```

**Compose 特殊处理：** Compose 没有传统 XML 的 `resource-id`，需使用 `testTag` 或语义属性：

```kotlin
Button(
    onClick = { /* ... */ },
    modifier = Modifier.testTag("submit_order_button")  // ← 测试定位用
) {
    Text("提交订单")
}
```

测试中通过 XPath 或自定义策略定位：

```python
driver.find_element(AppiumBy.XPATH, "//*[@test-tag='submit_order_button']")
```

### 5.2 iOS

```swift
// ✅ SwiftUI：显式设置 accessibilityIdentifier
Button("提交") {}
    .accessibilityIdentifier("submit_button")

// ❌ 不要依赖默认的 accessibilityLabel（会随语言变化）
// ✅ 应该同时设置 identifier（不变）和 label（本地化）
TextField("用户名", text: $username)
    .accessibilityIdentifier("username_field")
    .accessibilityLabel("用户名输入框")
```

### 5.3 Windows

```csharp
// WPF / UWP：设置 AutomationProperties.AutomationId
<Button Content="计算"
        AutomationProperties.AutomationId="calculateButton" />
```

WinAppDriver 通过 XPath 匹配：

```python
driver.find_element(AppiumBy.XPATH, "//*[@AutomationId='calculateButton']")
```

---

## 六、高级技巧

### 6.1 处理动态 ID

当 `resource-id` 包含随机后缀（如 RecyclerView 子项），用 **XPath 的相对定位**或 **父子层级**：

```python
# ❌ 坏：ID 含动态索引
# driver.find_element(By.ID, "com.app:id/item_3")

# ✅ 好：通过父容器 + 文本内容定位
parent = driver.find_element(By.ID, "com.app:id/recycler_view")
target = parent.find_element(
    AppiumBy.XPATH,
    ".//android.widget.TextView[@text='目标文本']"
)
```

### 6.2 处理列表/表格

```python
# 获取所有列表项
cells = driver.find_elements(By.CLASS_NAME, "android.widget.LinearLayout")

# 遍历查找特定文本
for cell in cells:
    title = cell.find_element(By.ID, "com.app:id/tv_title")
    if title.text == "目标项":
        cell.click()
        break
```

### 6.3 等待策略：隐式 vs 显式

```python
# ❌ 隐式等待：全局生效，不够灵活，容易掩盖真正问题
driver.implicitly_wait(10)

# ✅ 显式等待：针对单个元素，条件明确
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

wait = WebDriverWait(driver, 10)
element = wait.until(EC.element_to_be_clickable((By.ID, "btn_submit")))
element.click()
```

### 6.4 混合应用：Native ↔ WebView 切换

```python
# 查看所有可用上下文
contexts = driver.contexts
print(contexts)  # ['NATIVE_APP', 'WEBVIEW_com.example.myapp']

# 切换到 WebView
driver.switch_to.context('WEBVIEW_com.example.myapp')

# 现在可以用 Web 定位方式（CSS Selector）
driver.find_element(By.CSS_SELECTOR, ".web-login-btn").click()

# 切回原生
driver.switch_to.context('NATIVE_APP')
```

---

## 七、常见问题速查

| 问题 | 原因 | 解决 |
|------|------|------|
| `NoSuchElementException` | 元素未加载完成 / 定位值错误 | 加显式等待；用 Inspector 重新确认属性 |
| `StaleElementReferenceException` | 页面刷新后元素引用失效 | 重新 `find_element` |
| Android `resource-id` 为空 | 开发未设置 `android:id` | 要求开发补充，或降级用 XPath |
| iOS `accessibility-id` 找不到 | 未设置 `accessibilityIdentifier` | 要求开发设置；临时用 `name` 或 `type` 组合 XPath |
| Windows `AutomationId` 每次变 | 用了动态 RuntimeId | 用 `Name` 或相对 XPath 替代 |
| WebView 元素找不到 | 未切换到 WEBVIEW 上下文 | `driver.switch_to.context()` |
| Inspector 连接超时 | Server / Driver / 设备未就绪 | 检查 Appium Server 日志；确认设备已连接 |

---

## 八、Java SDK 核心类速查

Appium Java Client 提供了与 Python Client 对等的能力，以下是几个高频类的职责与关系。

### 8.1 `AppiumDriverLocalService`

**Appium Server 的进程生命周期管理器。** 它封装了 `appium` CLI 命令，让你可以在 Java 代码里程序化地启停 Server。

```java
// 在默认端口 4723 启动 Appium Server
AppiumDriverLocalService service = new AppiumServiceBuilder()
    .withIPAddress("127.0.0.1")
    .usingPort(4723)
    .build();
service.start();

// 获取 URL 供 Driver 连接
URL serverUrl = service.getUrl();  // http://127.0.0.1:4723

// 测试结束后关闭
service.stop();
```

> **注意：** 这个类管理的是 **Node.js Appium Server 进程**，不是测试 Session。它是 Java 里对 `appium` 终端命令的等价封装。

### 8.2 `AppiumDriver`

**所有平台 Driver 的基类。** 继承自 Selenium 的 `RemoteWebDriver`，并补充了 Appium 特有的能力。

```java
// 通用写法（平台无关）
AppiumDriver driver = new AppiumDriver(serverUrl, options);
driver.findElement(AppiumBy.accessibilityId("login"));
driver.context("WEBVIEW_xxx");  // 切换 WebView — Selenium 没有这个方法
```

**相比 Selenium 额外提供的能力：**

| 能力 | 说明 |
|------|------|
| Appium 专属定位器 | `accessibilityId`、`-android uiautomator`、`-ios predicate string` 等 |
| 上下文切换 | `context()` 方法，用于 Native ↔ WebView 切换（混合应用必备） |
| 移动端手势 | `tap()`、`swipe()`、`pinch()`、`zoom()` |
| 设备控制 | `lockDevice()`、`unlockDevice()`、`hideKeyboard()` |

**实际开发中：** 很少直接 `new AppiumDriver()`，而是使用平台子类（`AndroidDriver`、`IOSDriver`、`WindowsDriver`）以获得类型安全的平台专属方法。

### 8.3 `WindowsDriver`

**Windows 桌面应用的专用 Driver。** 继承自 `AppiumDriver`。

```java
WindowsDriver driver = new WindowsDriver(serverUrl, options);
driver.findElement(By.name("Calculate")).click();
```

**平台特性：**
- 自动在 Capabilities 中设置 `platformName=Windows`
- 支持通过 AUMID 启动 UWP 应用（如 `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`）

**继承链：** `WindowsDriver` → `AppiumDriver` → `RemoteWebDriver`

### 8.4 `ChromiumDriver`

**Android 上 Chrome/Chromium 浏览器（或 WebView）的专用 Driver。** 继承自 `AppiumDriver`。

```java
// 测试 Android 上的 Chrome 浏览器
ChromiumDriver driver = new ChromiumDriver(serverUrl, options);
```

**为什么单独抽成一个类：**
- 底层由 Appium 管理一个 **Chromedriver 子进程**，专门负责与 Chrome DevTools Protocol 通信
- `ChromiumDriver` 充当 Appium Server 与 Chromedriver 之间的桥梁
- 既支持 Web 标准操作，又保留 Appium 能力（如设备控制、上下文切换）

> **注意：** 在 **Selenium** 生态中，`ChromiumDriver` 是 `ChromeDriver`/`EdgeDriver` 的父类；但在 **Appium Java Client** 中，它特指**移动端浏览器自动化**场景。

### 8.5 类关系总图

```
AppiumDriverLocalService          (管理进程)          node.exe (Appium Server)
        │                                                   │
        │                                         ┌─────────┼─────────┐
        │                                         ▼         ▼         ▼
        │                                   AndroidDriver  IOSDriver  WindowsDriver
        │                                   ChromiumDriver   (均继承自 AppiumDriver)
        │                                         │
        └─────────────────────────────────────────┘
                                                  │
                                                  ▼
                                          AppiumDriver
                                                  │
                                                  ▼
                                          RemoteWebDriver (Selenium)
```

### 8.6 多个 `AppiumDriverLocalService` 能同时测多个 App 吗？

**技术上可以，但通常没必要。**

| 方案 | 原理 | 推荐场景 |
|------|------|---------|
| **单 Server，多 Session** | 一个 `AppiumDriverLocalService` 在 4723 端口，创建多个 `Driver` 实例（不同设备/应用） | **首选。** 单个 Appium Server 原生支持并发多 Session。 |
| **多 Server，各管各** | 多个 `AppiumDriverLocalService` 分别监听 4723、4724、4725... | 需要**完全隔离**时（不同 Appium 版本、不同 Driver 集合、CI 流水线隔离）。 |

**单 Server 多 Session 示例：**

```java
AppiumDriverLocalService service = new AppiumServiceBuilder()
    .usingPort(4723).build();
service.start();

// Session 1：Android 应用
AndroidDriver androidDriver = new AndroidDriver(service.getUrl(), androidOptions);

// Session 2：Windows 应用（同一 Server，不同 Session）
WindowsDriver windowsDriver = new WindowsDriver(service.getUrl(), windowsOptions);
```

**多 Server 示例（隔离场景）：**

```java
AppiumDriverLocalService service1 = new AppiumServiceBuilder().usingPort(4723).build();
AppiumDriverLocalService service2 = new AppiumServiceBuilder().usingPort(4724).build();
service1.start();
service2.start();

AndroidDriver driver1 = new AndroidDriver(service1.getUrl(), options1);
AndroidDriver driver2 = new AndroidDriver(service2.getUrl(), options2);
```

> **核心洞察：** Appium Server 本质上是一个**多租户路由器**，单实例就能承载跨平台、跨设备的并发测试。启动多个 `AppiumDriverLocalService` 类似于在同一栋楼里装多台路由器——除非有特殊隔离需求，否则一台足矣。

---

## 九、总结

| 环节 | 核心要点 |
|------|---------|
| **写测试** | `webdriver.Remote()` 建立 Session → `find_element()` 定位 → 操作 → 断言 → `quit()` |
| **找元素** | Appium Inspector 是跨平台统一工具；各平台辅以原生工具（Android Studio / Xcode Accessibility Insights） |
| **选策略** | `ACCESSIBILITY_ID` > `ID` > `CLASS_NAME` + 层级 > `XPATH` > `IMAGE` |
| **埋点协作** | 开发阶段显式设置 `android:id` / `accessibilityIdentifier` / `AutomationId`，测试阶段省去大量 XPath 兜底 |
| **稳定性** | 永远用**显式等待**代替 `time.sleep()`；动态内容用 `find_elements()` + 遍历 |
| **Java 类关系** | `AppiumDriverLocalService` 管进程 → `AppiumDriver` / `WindowsDriver` / `ChromiumDriver` 管会话 → 均继承 `RemoteWebDriver` |
