---
layout: post
title: Connection Timeout 问题排查
date: 2021-02-23
categories:
  - Troubleshooting
tags:
  - Network
  - Connection Timeout
  - Web Proxy
---

# 背景

我们组开发维护了一个 Agent 工程，帮客户采集一些客户有用的网络数据。客户需要下载一个 *MSI*，然后安装并注册。

# 问题描述

某个客户下载安装 Agent 之后，提示注册失败。其实 Agent 注册就是一个用户登陆验证服务，然后创建一个 **Machine ID** 的过程。所谓 **Machine ID**，就跟用户帐号一样，是 Agent 的一个唯一标识。注册的流程大致如下：
![Register Flow](/src/img/article-img/Troubleshooting/customer_connection_timeout/register_flow.png)

注册的主要目的是为 Agent 创建一个 **Machine ID**，为此需要获取一个 **token**，而这个 **token** 可以通过用户登陆来获得。但是用户登陆不会直接返回 **token** 给你，而是返回一个 **access code**，后续我们可以通过另外的 API 根据 **access code** 获取 **token**。

# 问题排查

## 初步分析
好在客户提交 Issue 的同时，把 log 也提供给我们了。看了 log，发现报的错是 
> java.net.ConnectException: Connection timed out: connect

进一步追踪发现，超时发生在根据 **access code** 获取 **token** 的时候，也就是上面的第 7 步。

在异常发生的时间点，在 **Identity Service** 中发现有用户登陆相关的 log，即第 5 步和第 6 步，然后就没有了。这就非常奇怪了，用户只可以访问 **Identity Service** 的部分 API？按理说如果有防火墙或者 ACL 的控制的话，所有 API 都应该被 block 掉才对。在问了 **Identity Service** 的网络设置之后，被告知他们服务端并没有做访问控制。

## Connection Timeout 和 Read Timeout

从 log 上似乎不能得到更多的信息。那就分析一下为什么会出现超时的情况。**Java** 中的 `HttpURLConnection` 有两个 timeout 参数如下：
~~~java
URL url = new URL("someUrl");
HttpURLConnection httpConnection = (HttpURLConnection) url.openConnection();
httpConnection.setConnectTimeout(10000);
httpConnection.setReadTimeout(10000);
~~~

其中 **Connect Timeout** 指的是客户端与服务端建立连接过程的超时时间，简而言之就是，**TCP** 三次握手的超时时间；而 **Read Timeout** 指的是客户端等待服务端返回的最长等待时间。显然这里是第一种情况，也就是说，客户端根本没有连上 **Identity Service**！

一般 **Connect Timeout** 在如下一些情况会发生：
1. 服务端的 **IP**/域名或端口书写错误，比如把 **www.google.com** 写成了 **www.gogle.com**
2. 服务端宕机了
3. 服务端 load 高，未能与之在指定超时时间内建立 **TCP** 连接
4. 客户端设置了防火墙，拦截了与服务端的连接
5. 客户端网络设置有问题，即无法上网

可以明显排除的是 1，2 和 5。第 3 条基本也可以排除，Agent 的连接超时时间比较保守，设置了 15 秒，而且 **Identity Service** 也没有收到当时服务有异常的报告。所以可能的原因，只可能是第 4 条。

但是第 4 条匪夷所思：第 1 步到第 6 步跟 **Identity Service** 交互都好好的，为什么偏偏第 7 步连接超时呢？

## Web Proxy

转念一想，发现了问题所在：前面 6 步和后面 4 步其实是由不同的客户端（Client）发起的！真实的流程图其实应该如下：
![Real Register Flow](/src/img/article-img/Troubleshooting/customer_connection_timeout/real_register_flow.png)

因为 Agent 并不提供图形界面，所以注册的动作是借由浏览器来完成的。在用户登陆完成获取 **token** 之后，会被重定向到 Agent 来完成之后的逻辑。所以这次的问题其实是，用户可以通过浏览器正常访问 **Identity Service**，但是 Agent 直接访问却超时。

为什么呢？我们猜测客户的机器上应该设置了 **Web Proxy**。**Windows** 下的配置窗口如图：
![Proxy Setting](/src/img/article-img/Troubleshooting/customer_connection_timeout/proxy_setting.png)

跟客户简单沟通了之后，果然：他们机器网络本身设置了防火墙，禁止访问 **Identity Service**，但是可以通过配置 **Web Proxy** 来作为统一出口，去访问那些被禁止的网站。由于浏览器默认是走的 **Proxy**，而 Agent 并没有做相关的设置，导致出现此次问题。

# 问题解决

为 `HttpURLConnection` 设置 **Proxy** 即可解决问题：
~~~java
URL url = new URL("someUrl");
Proxy proxy = new Proxy(Proxy.Type.HTTP, new InetSocketAddress("10.0.0.1", 8080));
HttpURLConnection httpConnection = url.openConnection(proxy);
~~~

# 总结

当遇到问题的时候，要逐步排查缩小范围，列出所有可能的情况，结果导向，结合应用的逻辑分析原因。还有，这次的情况正是因为我们没有考虑到客户可能会设置 **Proxy** 才出的问题，软件设计的时候一定要充分考虑所有可能出现的状况，才能保证万无一失，

# Reference

[java.net.ConnectException :connection timed out: connect?](https://stackoverflow.com/questions/5662283/java-net-connectexception-connection-timed-out-connect)