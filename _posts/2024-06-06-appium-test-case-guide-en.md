---
layout: post
title:  "Appium in Practice: Writing Test Cases and Locating Elements"
date:   2024-06-06
categories:
  - testing
---

This article assumes you have already set up the Appium environment (Server and corresponding Drivers installed). The focus is on **how to write a runnable test case** and **how to find element locator information**.

---

## 1. Minimal Runnable Example (Python)

Using the Windows Calculator as an example, here is what a complete test case looks like:

```python
from appium import webdriver
from appium.options.windows import WindowsOptions
from selenium.webdriver.common.by import By

# 1. Configure Desired Capabilities (launch parameters)
options = WindowsOptions()
options.app = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"  # Calculator UWP AUMID

# 2. Establish a Session
driver = webdriver.Remote(
    command_executor="http://127.0.0.1:4723",  # Appium Server address
    options=options
)

# 3. Locate elements and interact
driver.find_element(By.NAME, "One").click()
driver.find_element(By.NAME, "Plus").click()
driver.find_element(By.NAME, "Two").click()
driver.find_element(By.NAME, "Equals").click()

# 4. Assert the result
result = driver.find_element(By.ACCESSIBILITY_ID, "CalculatorResults").text
assert "3" in result, f"Expected 3, got: {result}"

# 5. End the session
driver.quit()
```

**Code Skeleton Breakdown:**

| Step | Purpose | Key Concept |
|------|---------|-------------|
| Configure Capabilities | Tell Appium which platform, app, and device to test | `platformName`, `app`, `deviceName`, etc. |
| `webdriver.Remote(...)` | Establish an HTTP long connection with Appium Server, create a Session | Session ID is the context for all subsequent requests |
| `find_element(...)` | Find a single element in the control tree / DOM | Must specify a **locator strategy** and a **locator value** |
| Element Actions | `.click()`, `.send_keys()`, `.text`, etc. | Trigger real user interactions |
| `driver.quit()` | Destroy the Session, release device resources | Must be called, otherwise the device remains occupied |

---

## 2. Core API: Element Locator Strategies Overview

`find_element(By.XXX, "value")` — the `By.XXX` part is the locator strategy. Different platforms support different strategies:

| Locator Strategy | Android | iOS | Windows | Use Case |
|-----------------|---------|-----|---------|----------|
| `By.ID` | ✅ `resource-id` | ❌ No native ID support | ⚠️ Not commonly used | Android first choice |
| `By.ACCESSIBILITY_ID` | ✅ `content-desc` | ✅ `accessibility-id` / `label` | ✅ `Name` | Cross-platform first choice (recommended) |
| `By.XPATH` | ✅ Full XPath | ✅ Full XPath | ⚠️ Supported but slow | Fallback option |
| `By.CLASS_NAME` | ✅ `class` (e.g. `android.widget.Button`) | ✅ `type` (e.g. `XCUIElementTypeButton`) | ✅ `ClassName` | Combine with other conditions |
| `By.NAME` | ⚠️ `text` (deprecated) | ✅ `name` | ✅ `Name` | Commonly used on Windows |
| `By.CSS_SELECTOR` | ❌ | ❌ | ❌ | Only in WebView context |
| `By.IMAGE` | ✅ | ✅ | ❌ | Image recognition (AI-driven) |
| `-android uiautomator` | ✅ UiSelector expressions | ❌ | ❌ | Android complex queries |
| `-ios predicate string` | ❌ | ✅ NSPredicate | ❌ | iOS complex queries |

**Selection Priority (high to low):**

```
ACCESSIBILITY_ID  >  ID  >  CLASS_NAME (with hierarchy)  >  XPATH  >  IMAGE
```

---

## 3. How to Obtain Element Locator Information

This is the part developers care about most. Each platform has its official tools.

### 3.1 Android: Three Tools

#### Tool A: Appium Inspector (most recommended, cross-platform unified)

Appium's official visual element inspector, supporting Android / iOS / Windows simultaneously.

**Usage Steps:**

1. Download [Appium Inspector](https://github.com/appium/appium-inspector) (desktop app, independent of Appium Server)
2. Configure Desired Capabilities:
   ```json
   {
     "platformName": "Android",
     "appium:deviceName": "emulator-5554",
     "appium:appPackage": "com.example.myapp",
     "appium:appActivity": ".MainActivity"
   }
   ```
3. Click **Start Session** and wait for the device screen to sync to the Inspector
4. Hover over the screenshot on the left, and the right panel automatically shows the complete attributes of that element:

```
│ Element │ Attributes │
├─────────┼────────────┤
│ id      │ com.example.myapp:id/btn_login    ← This is the value for By.ID
│ content-desc │ Login Button                   ← This is the value for By.ACCESSIBILITY_ID
│ class   │ android.widget.Button              ← This is the value for By.CLASS_NAME
│ text    │ Login                              ← Note: text is not a stable locator
│ bounds  │ [100,200][300,400]                 ← Coordinates, not recommended for direct use
```

5. After selecting an element, the Inspector automatically generates the recommended locator code:
   ```python
   el = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value="Login Button")
   ```

#### Tool B: Android Studio Layout Inspector

Built into Android Studio, suitable for the development phase:

```
Android Studio → Tools → Layout Inspector → Select device / process
```

Advantage: Can view the semantic tree of Compose layouts (Compose has no traditional resource-id; relies on `testTag` or `semantics`).

#### Tool C: uiautomatorviewer (outdated, not recommended)

```bash
$ANDROID_HOME/tools/bin/uiautomatorviewer
```

Only supports traditional XML layouts, cannot inspect Compose, and is being phased out by the Android SDK.

---

### 3.2 iOS: Two Tools

#### Tool A: Appium Inspector (also most recommended)

Configure Capabilities:

```json
{
  "platformName": "iOS",
  "appium:deviceName": "iPhone 15",
  "appium:platformVersion": "17.0",
  "appium:bundleId": "com.example.myapp",
  "appium:automationName": "XCUITest"
}
```

After syncing, the right-side attribute panel shows:

```
│ Element │ Attributes │
├─────────┼────────────┤
│ name          │ Login Button          ← By.NAME / By.ACCESSIBILITY_ID
│ label         │ Login Button          ← Accessibility label
│ type          │ XCUIElementTypeButton ← By.CLASS_NAME
│ value         │ nil
│ accessible    │ true                  ← Whether it is an accessibility element
```

#### Tool B: Xcode Accessibility Inspector

```
Xcode → Open Developer Tool → Accessibility Inspector
```

No need to start Appium; directly inspects the accessibility tree of any connected iOS device or simulator. Suitable for quickly verifying whether `accessibilityIdentifier` is set correctly during development.

**Note for iOS developers:** To make tests stable, you must explicitly set `accessibilityIdentifier` in code:

```swift
// SwiftUI
Button("Login") {}
    .accessibilityIdentifier("login_button")  // ← Located by By.ACCESSIBILITY_ID in tests

// UIKit
let btn = UIButton()
btn.accessibilityIdentifier = "login_button"
```

---

### 3.3 Windows: Two Tools

#### Tool A: Appium Inspector

Configure Capabilities:

```json
{
  "platformName": "Windows",
  "appium:app": "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
  "appium:automationName": "Windows"
}
```

**Note:** Windows applications need to be pre-launched (or configure `app` to let Appium auto-launch). After Inspector syncs, it shows:

```
│ Element │ Attributes │
├─────────┼────────────┤
│ Name          │ One                   ← By.NAME / By.ACCESSIBILITY_ID
│ ClassName     │ Button                ← By.CLASS_NAME
│ AutomationId  │ num1Button            ← Most stable locator on Windows (not a WebDriver standard)
│ RuntimeId     │ [42,1234,2]           ← Changes on every launch, unusable
```

Windows `AutomationId` is the most stable, but Appium's `By.ID` **does not directly map** to `AutomationId`. The correct approach:

```python
# ❌ Wrong: By.ID behavior is inconsistent under Windows Driver
# driver.find_element(By.ID, "num1Button")

# ✅ Correct: Use XPath to match AutomationId, or use Name
from appium.webdriver.common.appiumby import AppiumBy

driver.find_element(AppiumBy.XPATH, "//*[@AutomationId='num1Button']")
driver.find_element(By.NAME, "One")
```

#### Tool B: Microsoft Accessibility Insights (the strongest native Windows tool)

Microsoft's official tool, more accurate than Appium Inspector for parsing the Windows control tree:

```
Download: https://accessibilityinsights.io/
Mode: Live Inspect → Hover over target window → View right-side property tree
```

Advantage: Can display deep UIA attributes that Appium Inspector might miss, especially suitable for enterprise-grade Win32/WPF applications.

---

## 4. Complete Test Case: From Locating to Asserting

Using an **Android login page** as an example, demonstrating the complete element location thought process:

### 4.1 Page Structure (Developer Perspective)

```xml
<!-- res/layout/activity_login.xml -->
<EditText
    android:id="@+id/et_username"
    android:contentDescription="Username input" />

<EditText
    android:id="@+id/et_password"
    android:contentDescription="Password input" />

<Button
    android:id="@+id/btn_login"
    android:contentDescription="Login button"
    android:text="Login" />

<TextView
    android:id="@+id/tv_error"
    android:visibility="gone" />
```

### 4.2 Test Code

```python
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# 1. Launch configuration
options = UiAutomator2Options()
options.platform_name = "Android"
options.device_name = "emulator-5554"
options.app_package = "com.example.myapp"
options.app_activity = ".LoginActivity"
options.automation_name = "UiAutomator2"

driver = webdriver.Remote("http://127.0.0.1:4723", options=options)

# 2. Explicit wait: page loaded
wait = WebDriverWait(driver, 10)
wait.until(EC.presence_of_element_located((By.ID, "com.example.myapp:id/et_username")))

# 3. Enter username (prefer resource-id)
username = driver.find_element(By.ID, "com.example.myapp:id/et_username")
username.send_keys("test_user")

# 4. Enter password (use content-desc / accessibility id, more stable)
password = driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Password input")
password.send_keys("test_pass")

# 5. Click login button
login_btn = driver.find_element(By.ID, "com.example.myapp:id/btn_login")
login_btn.click()

# 6. Assert: check if error message appears (XPath fallback)
error_msg = wait.until(
    EC.visibility_of_element_located(
        (AppiumBy.XPATH, "//android.widget.TextView[contains(@text, 'Error')]")
    )
)
assert "Invalid username or password" in error_msg.text

# 7. Cleanup
driver.quit()
```

**Locator Strategy Selection Logic:**

| Element | Preferred Strategy | Reason |
|---------|-------------------|--------|
| Username input | `By.ID` | Developer explicitly defined `android:id`, stable and unique |
| Password input | `AppiumBy.ACCESSIBILITY_ID` | If ID contains dynamically generated parts, accessibility id is more controllable |
| Login button | `By.ID` | Same as username |
| Error message text | `By.XPATH` | Text content changes dynamically, XPath `contains()` is most flexible |

---

## 5. How Developers Should "Instrument for Testing"

Test stability depends **80% on whether elements were properly instrumented with locator markers during development**. Here are best practices for each platform:

### 5.1 Android

```xml
<!-- ✅ Good: resource-id is unique and semantic -->
<Button android:id="@+id/btn_submit_order" />

<!-- ❌ Bad: id is meaningless or auto-generated -->
<Button android:id="@+id/button7" />

<!-- ✅ Good: contentDescription describes function, not visual text -->
<ImageView
    android:contentDescription="User avatar"
    android:src="@drawable/avatar" />
```

**Special Handling for Compose:** Compose has no traditional XML `resource-id`; use `testTag` or semantic properties:

```kotlin
Button(
    onClick = { /* ... */ },
    modifier = Modifier.testTag("submit_order_button")  // ← For test location
) {
    Text("Submit Order")
}
```

Locate in tests via XPath or custom strategy:

```python
driver.find_element(AppiumBy.XPATH, "//*[@test-tag='submit_order_button']")
```

### 5.2 iOS

```swift
// ✅ SwiftUI: Explicitly set accessibilityIdentifier
Button("Submit") {}
    .accessibilityIdentifier("submit_button")

// ❌ Don't rely on default accessibilityLabel (changes with language)
// ✅ Should set both identifier (immutable) and label (localized)
TextField("Username", text: $username)
    .accessibilityIdentifier("username_field")
    .accessibilityLabel("Username input")
```

### 5.3 Windows

```csharp
// WPF / UWP: Set AutomationProperties.AutomationId
<Button Content="Calculate"
        AutomationProperties.AutomationId="calculateButton" />
```

Match via XPath in WinAppDriver:

```python
driver.find_element(AppiumBy.XPATH, "//*[@AutomationId='calculateButton']")
```

---

## 6. Advanced Techniques

### 6.1 Handling Dynamic IDs

When `resource-id` contains random suffixes (e.g., RecyclerView items), use **XPath relative location** or **parent-child hierarchy**:

```python
# ❌ Bad: ID contains dynamic index
# driver.find_element(By.ID, "com.app:id/item_3")

# ✅ Good: Locate via parent container + text content
parent = driver.find_element(By.ID, "com.app:id/recycler_view")
target = parent.find_element(
    AppiumBy.XPATH,
    ".//android.widget.TextView[@text='Target text']"
)
```

### 6.2 Handling Lists / Tables

```python
# Get all list items
cells = driver.find_elements(By.CLASS_NAME, "android.widget.LinearLayout")

# Iterate to find specific text
for cell in cells:
    title = cell.find_element(By.ID, "com.app:id/tv_title")
    if title.text == "Target item":
        cell.click()
        break
```

### 6.3 Wait Strategies: Implicit vs Explicit

```python
# ❌ Implicit wait: global effect, not flexible, can mask real issues
driver.implicitly_wait(10)

# ✅ Explicit wait: targets a single element with clear conditions
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

wait = WebDriverWait(driver, 10)
element = wait.until(EC.element_to_be_clickable((By.ID, "btn_submit")))
element.click()
```

### 6.4 Hybrid Apps: Native ↔ WebView Switching

```python
# View all available contexts
contexts = driver.contexts
print(contexts)  # ['NATIVE_APP', 'WEBVIEW_com.example.myapp']

# Switch to WebView
driver.switch_to.context('WEBVIEW_com.example.myapp')

# Now you can use web locator strategies (CSS Selector)
driver.find_element(By.CSS_SELECTOR, ".web-login-btn").click()

# Switch back to native
driver.switch_to.context('NATIVE_APP')
```

---

## 7. Quick Troubleshooting Guide

| Issue | Cause | Solution |
|-------|-------|----------|
| `NoSuchElementException` | Element not loaded / wrong locator value | Add explicit wait; re-verify attributes with Inspector |
| `StaleElementReferenceException` | Element reference invalidated after page refresh | Re-`find_element` |
| Android `resource-id` is empty | Developer didn't set `android:id` | Ask developer to add, or fallback to XPath |
| iOS `accessibility-id` not found | `accessibilityIdentifier` not set | Ask developer to set; temporarily use `name` or `type` in XPath |
| Windows `AutomationId` changes every time | Using dynamic RuntimeId | Use `Name` or relative XPath instead |
| WebView elements not found | Not switched to WEBVIEW context | `driver.switch_to.context()` |
| Inspector connection timeout | Server / Driver / device not ready | Check Appium Server logs; confirm device is connected |

---

## 8. Java SDK Core Classes Quick Reference

The Appium Java Client provides capabilities equivalent to the Python Client. Below are the responsibilities and relationships of frequently used classes.

### 8.1 `AppiumDriverLocalService`

**Process lifecycle manager for the Appium Server.** It wraps the `appium` CLI command, allowing you to start and stop the Server programmatically from Java code.

```java
// Start Appium Server on default port 4723
AppiumDriverLocalService service = new AppiumServiceBuilder()
    .withIPAddress("127.0.0.1")
    .usingPort(4723)
    .build();
service.start();

// Get URL for the Driver to connect to
URL serverUrl = service.getUrl();  // http://127.0.0.1:4723

// Shutdown after tests
service.stop();
```

> **Note:** This class manages the **Node.js Appium Server process**, not the test Session. It is the Java equivalent of the `appium` terminal command.

### 8.2 `AppiumDriver`

**The base class for all platform-specific Drivers.** Inherits from Selenium's `RemoteWebDriver` and adds Appium-specific capabilities.

```java
// Generic usage (platform-agnostic)
AppiumDriver driver = new AppiumDriver(serverUrl, options);
driver.findElement(AppiumBy.accessibilityId("login"));
driver.context("WEBVIEW_xxx");  // Switch WebView — Selenium doesn't have this method
```

**Additional capabilities over Selenium:**

| Capability | Description |
|------------|-------------|
| Appium-specific locators | `accessibilityId`, `-android uiautomator`, `-ios predicate string`, etc. |
| Context switching | `context()` method for Native ↔ WebView switching (essential for hybrid apps) |
| Mobile gestures | `tap()`, `swipe()`, `pinch()`, `zoom()` |
| Device control | `lockDevice()`, `unlockDevice()`, `hideKeyboard()` |

**In practice:** You rarely instantiate `new AppiumDriver()` directly. Instead, use platform subclasses (`AndroidDriver`, `IOSDriver`, `WindowsDriver`) for type-safe platform-specific methods.

### 8.3 `WindowsDriver`

**Dedicated Driver for Windows desktop applications.** Inherits from `AppiumDriver`.

```java
WindowsDriver driver = new WindowsDriver(serverUrl, options);
driver.findElement(By.name("Calculate")).click();
```

**Platform features:**
- Automatically sets `platformName=Windows` in Capabilities
- Supports launching UWP apps via AUMID (e.g., `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`)

**Inheritance chain:** `WindowsDriver` → `AppiumDriver` → `RemoteWebDriver`

### 8.4 `ChromiumDriver`

**Dedicated Driver for Chrome/Chromium browsers (or WebViews) on Android.** Inherits from `AppiumDriver`.

```java
// Test Chrome browser on Android
ChromiumDriver driver = new ChromiumDriver(serverUrl, options);
```

**Why it exists as a separate class:**
- Under the hood, Appium manages a **Chromedriver subprocess** dedicated to communicating via the Chrome DevTools Protocol
- `ChromiumDriver` acts as the bridge between Appium Server and Chromedriver
- Supports web-standard operations while retaining Appium capabilities (e.g., device control, context switching)

> **Note:** In the **Selenium** ecosystem, `ChromiumDriver` is the parent class of `ChromeDriver`/`EdgeDriver`. In the **Appium Java Client**, it specifically refers to the **mobile browser automation** scenario.

### 8.5 Class Relationship Overview

```
AppiumDriverLocalService          (manages process)          node.exe (Appium Server)
        │                                                   │
        │                                         ┌─────────┼─────────┐
        │                                         ▼         ▼         ▼
        │                                   AndroidDriver  IOSDriver  WindowsDriver
        │                                   ChromiumDriver   (all inherit AppiumDriver)
        │                                         │
        └─────────────────────────────────────────┘
                                                  │
                                                  ▼
                                          AppiumDriver
                                                  │
                                                  ▼
                                          RemoteWebDriver (Selenium)
```

### 8.6 Can Multiple `AppiumDriverLocalService` Instances Test Multiple Apps Simultaneously?

**Technically yes, but usually unnecessary.**

| Approach | How It Works | Recommended Scenario |
|----------|-------------|----------------------|
| **Single Server, Multiple Sessions** | One `AppiumDriverLocalService` on port 4723, create multiple `Driver` instances (different devices / apps) | **Preferred.** A single Appium Server natively supports concurrent multi-session. |
| **Multiple Servers, Each Managing Its Own** | Multiple `AppiumDriverLocalService` instances listening on 4723, 4724, 4725... | When **complete isolation** is needed (different Appium versions, different driver sets, CI pipeline separation). |

**Single Server, Multiple Sessions Example:**

```java
AppiumDriverLocalService service = new AppiumServiceBuilder()
    .usingPort(4723).build();
service.start();

// Session 1: Android app
AndroidDriver androidDriver = new AndroidDriver(service.getUrl(), androidOptions);

// Session 2: Windows app (same Server, different Session)
WindowsDriver windowsDriver = new WindowsDriver(service.getUrl(), windowsOptions);
```

**Multiple Servers Example (isolation scenario):**

```java
AppiumDriverLocalService service1 = new AppiumServiceBuilder().usingPort(4723).build();
AppiumDriverLocalService service2 = new AppiumServiceBuilder().usingPort(4724).build();
service1.start();
service2.start();

AndroidDriver driver1 = new AndroidDriver(service1.getUrl(), options1);
AndroidDriver driver2 = new AndroidDriver(service2.getUrl(), options2);
```

> **Core Insight:** Appium Server is essentially a **multi-tenant router** — a single instance can handle concurrent testing across platforms and devices. Starting multiple `AppiumDriverLocalService` instances is like installing multiple routers in the same building — unless you have specific isolation needs, one is sufficient.

---

## 9. Summary

| Aspect | Key Point |
|--------|-----------|
| **Writing Tests** | `webdriver.Remote()` creates Session → `find_element()` locates → action → assertion → `quit()` |
| **Finding Elements** | Appium Inspector is the cross-platform unified tool; supplemented by platform-native tools (Android Studio / Xcode / Accessibility Insights) |
| **Strategy Selection** | `ACCESSIBILITY_ID` > `ID` > `CLASS_NAME` + hierarchy > `XPATH` > `IMAGE` |
| **Instrumentation Collaboration** | Explicitly set `android:id` / `accessibilityIdentifier` / `AutomationId` during development; saves massive XPath fallback during testing |
| **Stability** | Always use **explicit waits** instead of `time.sleep()`; for dynamic content use `find_elements()` + iteration |
| **Java Class Relations** | `AppiumDriverLocalService` manages process → `AppiumDriver` / `WindowsDriver` / `ChromiumDriver` manage sessions → all inherit `RemoteWebDriver` |
