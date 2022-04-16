---
layout: post
title: Apache HttpClient 模拟 SSO 登陆丢失 cookie 问题分析
date: 2022-04-16
categories:
  - Troubleshooting
tags:
  - Apache HttpClient
  - Cookie
---

# 背景

需要用 **Java** 访问一个被 **SSO** 保护的特殊接口获取信息。

# 方案设计

假如我们用浏览器来实现这个功能，步骤简单如下：
1. 输入目标 **API** 地址
2. （浏览器自动重定向到 **SSO** 登陆页面）
3. 输入用户名密码登陆
4. （浏览器重定向回到 **API** 地址，并附带**认证信息**）
5. 获取目标 **API** 的资源信息

其中需要用户操作的是步骤 1 和步骤 3。

但要求是用 **Java** 来实现上述功能，关键点在于如何获取**认证信息**。有了**认证信息**，我们便能直接 call 目标 **API**。
所以我们需要模拟浏览器的登陆行为，此时的初步想法是 `[HttpClient (v4.5)](https://hc.apache.org/httpcomponents-client-4.5.x/quickstart.html)` + `CookieStore`：`HttpClient` 来发送 **Http** 请求，`CookieStore` 来缓存 **Cookie** 信息，相当于保存上下文（context）。

# 方案实施与问题描述

模拟浏览器登陆实现起来稍显复杂：
1. 创建 `CookieStore`，并添加到 `HttpClient` 来保存上下文信息。
2. `HttpClient` 访问目标 **API**，因为需要 **SSO** 登陆，所以得到的 **response** 是一个 **html** 页面，即登陆页面。
3. 解析步骤 2 中返回的登陆页面，得到登陆表单提交的地址。
4. 构建登陆请求，填入用户名密码信息，并用 `HttpClient` 提交登陆请求。
5. 获取步骤 4 的 **response**。此时**认证信息**已经被添加到 `CookieStore` 中，`HttpClient` 可以直接访问目标 **API**。

简化后的代码如下：
~~~java
// 1. 创建 CookieStore 以及 HttpClient
CookieStore cookieStore = new BasicCookieStore();
HttpClient httpClient = HttpClientBuilder.create()
        .setRedirectStrategy(new LaxRedirectStrategy()) // follow redirect，即当遇到 302 时直接处理跳转
        .setDefaultCookieStore(cookieStore)
        .build();

// 2. 获取登陆表单 url
HttpResponse response = httpClient.execute(new HttpGet("{apiPath}"));
String result = EntityUtils.toString(response.getEntity());
Pattern pattern = Pattern.compile("<form id=\"login-form\" method=\"post\" name=\"login-form\" action=\"(.+?)\">"); // 表单正则
Matcher matcher = pattern.matcher(result);
if (!matcher.find()) {
    // handle error
}
String loginUrl = matcher.group(1);

// 3. 提交登陆表单
HttpPost httpPost = new HttpPost(loginUrl);
List<NameValuePair> nameValuePairs = new ArrayList<>();
nameValuePairs.add(new BasicNameValuePair("username", "{username}"));
nameValuePairs.add(new BasicNameValuePair("password", "{password}"));
httpPost.setEntity(new UrlEncodedFormEntity(nameValuePairs)); // 添加用户名密码信息
// finalResponse 即目标 API 返回的资源
HttpResponse finalResponse = httpClient.execute(httpPost);

// cookieStore 包含了 SSO 认证信息，所以现在 httpClient 可以访问任意受 SSO 保护的资源
// ...
~~~

但结果是，**finalResponse** 的状态码是 **403 Forbidden**，说明认证并没有成功。

# 问题追踪

上述步骤是没有问题的，所以错误肯定出在 `CookieStore` 上，由于某种原因，**认证信息**相关的 **cookie** 没有正确获取到。

通过与浏览器的 **Network Trace** 对比发现，**Java** 版本确实丢失了某个关键 **Domain** 的 **cookie**，见如下二图。
![Browser Cookie](/src/img/article-img/Troubleshooting/apache_httpclient_missing_cookie/browser_cookie.png)
![Java Cookie](/src/img/article-img/Troubleshooting/apache_httpclient_missing_cookie/java_cookie.png)

经过一番 Google 搜索，并没有太大的收获，于是决定看源码来调试解决。以下是 `HttpClient` 的执行链路：
~~~java
CloseableHttpClient.execute() -> InternalHttpClient.doExecute() -> RetryExec.execute() -> ProtocolExec.execute() -> MainClientExec.execute() -> HttpRequestExecutor.execute()
~~~

其中大多数步骤都是条件判断设置参数，较为关键的地方在 `ProtocolExec.execute()` 中：
~~~java
// Run request protocol interceptors
this.httpProcessor.process(request, context);

final CloseableHttpResponse response = this.requestExecutor.execute(route, request,
    context, execAware);
// Run response protocol interceptors
context.setAttribute(HttpCoreContext.HTTP_RESPONSE, response);
this.httpProcessor.process(response, context);
return response;
~~~

可以看到，在发送请求的前后都有 `interceptor` 来做处理，所以问题的线索就埋在 `this.httpProcessor.process(response, context)` 的逻辑之中。
~~~java
public final class ImmutableHttpProcessor implements HttpProcessor {
    @Override
    public void process( final HttpResponse response, final HttpContext context) throws IOException, HttpException {
        for (final HttpResponseInterceptor responseInterceptor : this.responseInterceptors) {
            responseInterceptor.process(response, context);
        }
    }
~~~

通过 debug 发现，默认的 `HttpClient` 添加了两个 `HttpResponseInterceptor`，分别是 `ResponseProcessCookies` 和 `ResponseContentEncoding`。**cookie** 处理相关的逻辑就在这里！让我们来进去探个究竟。
~~~java
public class ResponseProcessCookies implements HttpResponseInterceptor {
    @Override
    public void process(final HttpResponse response, final HttpContext context)
            throws HttpException, IOException {
        final HttpClientContext clientContext = HttpClientContext.adapt(context);

        // CookieSpec，即 cookie 的类型，用来处理不同格式的 cookie
        final CookieSpec cookieSpec = clientContext.getCookieSpec();
        // 我们自己指定的 cookie 上下文
        final CookieStore cookieStore = clientContext.getCookieStore();
        final CookieOrigin cookieOrigin = clientContext.getCookieOrigin();

        HeaderIterator it = response.headerIterator(SM.SET_COOKIE);
        processCookies(it, cookieSpec, cookieOrigin, cookieStore);

        // 对 cookie2 的处理，省略...
    }
    private void processCookies(final HeaderIterator iterator, final CookieSpec cookieSpec, final CookieOrigin cookieOrigin,
final CookieStore cookieStore) {
        while (iterator.hasNext()) {
            final Header header = iterator.nextHeader();
            try {
                // 用 CookieSpec 来解析 cookie
                final List<Cookie> cookies = cookieSpec.parse(header, cookieOrigin);
                for (final Cookie cookie : cookies) {
                    try {
                        // cookie 的验证
                        cookieSpec.validate(cookie, cookieOrigin);
                        // 验证通过，添加 cookie
                        cookieStore.addCookie(cookie);
                    } catch (final MalformedCookieException ex) {
                        this.log.warn("Cookie rejected [" + formatCooke(cookie) + "] " + ex.getMessage());
                    }
                }
            } catch (final MalformedCookieException ex) {
                if (this.log.isWarnEnabled()) {
                    this.log.warn("Invalid cookie header: \""
                            + header + "\". " + ex.getMessage());
                }
            }
        }
    }
}
~~~

当调试到这里，发现 **cookie** 解析报错了，问题出在 `cookieSpec.parse(header, cookieOrigin)`，默认的 `HttpClient` 对应的是 `DefaultCookieSpec`，它会根据情况调用不同的子 `CookieSpec` 来处理：
~~~java
public class DefaultCookieSpec implements CookieSpec {
    private final RFC2965Spec strict;
    private final RFC2109Spec obsoleteStrict;
    private final NetscapeDraftSpec netscapeDraft;
}
~~~

走到了 `NetscapeDraftSpec.parse()` 方法中，此方法会对 **cookie** 的各个属性，如 `secure`，`httponly`，`expres` 分别调用对应的 handler 来处理：
~~~java
for (int j = attribs.length - 1; j >= 0; j--) {
    final NameValuePair attrib = attribs[j];
    final String s = attrib.getName().toLowerCase(Locale.ROOT);
    cookie.setAttribute(s, attrib.getValue());
    final CookieAttributeHandler handler = findAttribHandler(s); // 找到对应属性的 handler
    if (handler != null) {
        handler.parse(cookie, attrib.getValue()); // 用 handler 来处理相应的属性
    }
}
~~~

最终，在 `BasicExpiresHandler` 处理 `expres` 属性时，看到了报错：
~~~java
public class BasicExpiresHandler extends AbstractCookieAttributeHandler implements CommonCookieAttributeHandler {
    @Override
    public void parse(final SetCookie cookie, final String value) throws MalformedCookieException {
        if (value == null) {
            throw new MalformedCookieException("Missing value for 'expires' attribute");
        }
        final Date expiry = DateUtils.parseDate(value, this.datepatterns);
        if (expiry == null) {
            throw new MalformedCookieException("Invalid 'expires' attribute: "
                    + value);
        }
        cookie.setExpiryDate(expiry);
    }
}
~~~

因为默认的 `datepatterns` 是 `EEE, dd-MMM-yy HH:mm:ss z`，而我们 cookie 中的格式为 `Sat, 23 Apr 2022 06:40:13 GMT`，格式不对应导致了错误。

# 问题解决

解决办法是换一个 `CookieSpec`：
~~~java
CookieStore cookieStore = new BasicCookieStore();
RequestConfig requestConfig = RequestConfig.custom()
                .setCookieSpec(CookieSpecs.STANDARD) // 设置为 CookieSpecs.STANDARD 而不是 CookieSpecs.DEFAULT
                .build();

HttpClient httpClient = HttpClientBuilder.create()
        .setRedirectStrategy(new LaxRedirectStrategy())
        .setDefaultRequestConfig(requestConfig)
        .setDefaultCookieStore(cookieStore)
        .build();
~~~

历史上出过多个版本的 **Cookie** 规范，如 [rfc2965](https://datatracker.ietf.org/doc/html/rfc2965)，[rfc2019](https://www.ietf.org/rfc/rfc2109.txt)，[rfc6265](https://datatracker.ietf.org/doc/html/rfc6265) 等，至于为什么默认 `HttpClient` 无法正确识别 **cookie** 的版本及格式也没有继续深究，或许是一个 bug 吧。

# Reference
[How to do a HTTP POST to a URL having SSO Authentication in Java or vbscript?](https://stackoverflow.com/questions/39383143/how-to-do-a-http-post-to-a-url-having-sso-authentication-in-java-or-vbscript)

[HttpClient HTTP state management](https://hc.apache.org/httpcomponents-client-4.5.x/current/tutorial/html/statemgmt.html)