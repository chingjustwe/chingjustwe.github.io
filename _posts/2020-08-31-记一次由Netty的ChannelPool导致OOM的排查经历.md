---
layout: post
title: 记一次由Netty的ChannelPool导致内存泄漏的排查经历
date: 2020-08-31
categories:
  - Troubleshooting
tags:
  - Netty
  - OOM
---

# 背景

接到了线上机器的报警，登上服务器，发现是`Java`进程挂了，看日志报了OOM：
~~~
java.lang.OutOfMemoryError: Java heap space
~~~

# 问题描述

内存溢出，那当然是看**dump**文件了。这里推荐大家在产线机器上都加上`JVM`参数`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath={path}/{to}/{dump}`，这样，`JVM`在`OOM`的时候，会自动做一个内存**dump**，相当于保存现场。
拿到**dump**文件，放到[MAT](https://www.eclipse.org/mat/)里面分析，以下是部分截图：
![dump1](/src/img/article-img/Troubleshooting/channel_pool_oom/mat_dump1.png)

不看不知道，一看吓一跳：有一个`class`(包括其`reference`)竟然占据了**1.6G**的内存！
这个类叫`NettyHttpClientService`，是工程里面用来提供异步`Http`服务的，其实就是对`Netty`做了一层包装。这个类上线已久，之前工作得很好没出什么问题。最近一次上线，也没有对这个类做什么改动，只是新增了一处调用它的地方。

需要进一步挖掘`NettyHttpClientService`这个类。

# 问题分析

继续分析内存占用情况，发现其大头是一个`ConcurrentHashMap`，里面的每个`node`都占用了**10M**-**20M**的空间，而这个`Map`里面，已经存在了**135**个`node`：
![dump2](/src/img/article-img/Troubleshooting/channel_pool_oom/mat_dump2.png)

看来还得去代码里面寻找真相。找到源头，以下是简化版的代码：
~~~java
public class NettyHttpClientServiceImpl implements NettyHttpClientService, DisposableBean {
    // channelPoolMap是一个InetSocketAddress与ChannelPool的映射关系
    private AbstractChannelPoolMap<InetSocketAddress, FixedChannelPool> channelPoolMap = new AbstractChannelPoolMap<InetSocketAddress, FixedChannelPool>() {
        // 构建新的大小为200的ChannelPool
        @Override
        protected FixedChannelPool newPool(InetSocketAddress key) {
            return new FixedChannelPool(bootstrap.remoteAddress(key), new NettyHttpPoolHandler(), 200);
        }
    };

    // NettyHttpClientService的入口，参数是请求体RequestEntity，成功回调successCallback，失败回调errorCallback
    @Override
    public Promise<SimpleResponse> get(RequestEntity bean, Consumer<SimpleResponse> successCallback, Consumer<Throwable> errorCallback) throws PlatformException {
        final URL url= new URL(bean.getUrl());
        // 构造远程服务的InetSocketAddress
        InetSocketAddress address = new InetSocketAddress(url.getHost(), url.getPort() == -1 ? url.getDefaultPort() : url.getPort());
        Promise<SimpleResponse> promise = newPromise();
        // 从ChannelPool中获取channel
        acquireChannel(address).addListener(future -> {
            if (!future.isSuccess()) {
                promise.tryFailure(future.cause());
                return;
            }
            try {
                // 发送request
                send(bean, (Channel) future.get(), promise);
            } catch (Exception e) {
                promise.tryFailure(e);
            }
        });

        // 回调
        promise.addListener(future -> {
            if (future.isSuccess()) {
                successCallback.accept(future.get());
            } else {
                errorCallback.accept(future.cause());
            }
        });
        return promise;
    }

    private Future<Channel> acquireChannel(InetSocketAddress address) {
        Promise<Channel> promise = newPromise();
        // 找到address对应的那个ChannelPool，再从ChannelPool中获取一个Channel
        channelPoolMap.get(address).acquire().addListener(future -> {
            if (future.isSuccess()) {
                Channel channel = (Channel) future.get();
                promise.trySuccess(channel);
            } else {
                promise.tryFailure(future.cause());
            }
        });
        return promise;
    }
}
~~~

`ChannelPool`的理念类似于线程池和数据库连接池，为了减少`Channel`频繁创建与销毁的开销。不难理解，上述设计意在为每个远程服务维护一个`ChannelPool`，这样每个服务之间可以做到隔离，互不影响。
![channel pool](/src/img/article-img/Troubleshooting/channel_pool_oom/channel_pool.jpg)

代码的大体逻辑很简单，根据请求的地址，获取对应的`ChannelPool`，然后从中获取一个`Channel`来进行`Http`交互。理论上来说，程序与几个`Http`服务有交互，那么就会创建几个`ChannelPool`(像`abc.com/v1/api1`，`abc.com/v1/api2`，`abc.com/v1/api3`都属于`abc.com`这个服务)。之前，程序只会去请求**4**个`Http`服务，最近一次上线新增了**1**个，所以目前总共应该是**5**个`ChannelPool`，但是从`MAT`的分析结果来看，产线上存在了**135**个`ChannelPool`！

没有其他外部作用的情况下，产线运行出现问题，最先应该怀疑新上线的功能，所以盯上了`NettyHttpClientService`新增的一处调用(`feature-a.nf.com`)。
`channelPoolMap`是用`InetSocketAddress`作为`key`的，难道`feature-a.nf.com`对应的`InetSocketAddress`会存在多个值？我们尝试多次运行`InetAddress.getByName("feature-a.nf.com")`，果然每隔一段时间，域名所对应的ip就会发生变化，导致`channelPoolMap`对这个服务创建了多个`ChannelPool`。

为什么会存在这么多个`ChannelPool`的原因总算是找到了。但是，为什么每个`Pool`的内存占用会这么高达到十几二十兆呢？继续翻看代码以及`MAT`的分析报告，找到了原因：
~~~java
    private void send(RequestEntity bean, Channel channel, Promise<SimpleResponse> promise) {
        // 将entity放到channel的attribute中作为上下文
        channel.attr(REQUEST_ENTITY_KEY).set(bean);
        HttpRequest request = createHttpRequest(bean);
        QueryStringEncoder getEncoder = new QueryStringEncoder(String.valueOf(new URI(bean.getUrl())));
        for (Entry<String, String> entry : bean.getHeaders().entrySet()) {
            getEncoder.addParam(entry.getKey(), entry.getValue());
        }
        channel.writeAndFlush(request);
    }
~~~

在真正发送请求的`send()`方法里，把请求体`RequestEntity`作为了一个`channel`的`attribute`，所以只要`Channel`不释放，那么`RequestEntity`就不会被`GC`。而这个`RequestEntity`不仅会存放请求的信息如请求头，目标地址等，还会存放请求返回值。该`API`的`ResponseBody`大小一般是**几十K**。
假设`RequestEntity`最终大小是**50k**，每个`ChannelPool`的大小是**200**，共有**135**个`ChannelPool`，那么无法被GC的内存大小为：`50k * 200 * 135 = 1.35G`，这就是内存泄漏的元凶。

至于为什么需要将`RequestEntity`放到`channel`的`attribute`中，是因为当遇到返回码类似**401**或者**302**的时候要处理重发的逻辑，需要保存请求的上下文。
而为什么`feature-a.nf.com`会解析对应这么多个IP，怀疑因为这个服务是做的**4层**负载均衡。

# 问题解决

既然找到了root cause，解决起来就简单了。两点：
1. 用`String`类型的`hostname`作为`channelPoolMap`的key，防止为一个服务创建多个`ChannelPool`。
2. 在`ChannelPool`的`release()`方法中，释放`Channel`对`RequestEntity`的引用(清理attribute)，避免内存泄漏。

# 总结

在使用常驻内存的类时，需要小心是否有内存泄漏的情况。如本例`ChannelPool`中的`Channel`使用完毕是不会释放的，所以要谨慎使用`Channel`的`Attribute`。正如`ThreadLocal`中引入**弱引用**一样，就是因为`ThreadLocal`变量通常是常驻内存的，而且由它导致的内存泄漏常常更隐蔽，所以使用**弱引用**可以很好地避免绝大多数潜在的`OOM`危机。