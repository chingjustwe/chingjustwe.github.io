---
layout: post
title: 用 ThreadGroup 记录线程创建链路
date: 2021-11-07
categories:
  - Thinking
tags:
  - ThreadGroup
---

# 背景
我们维护一个监控平台，平台跑着各种各样的插件来测试不同的场景。平台捕获插件的标准输出来得到日志，获取退出码来知道运行结果。
**Java** 插件就是一个可执行的 `.jar` 文件，它会被加载到平台的 **JVM** 中，运行在一个线程池里面。针对 **Java** 插件，我们提供了一个 **SDK** 给客户以降低开发难度，主要包括一些工具方法，定义标准执行流程，异常捕获等功能。

# 难点
在 **Java SDK** 中，我们希望提供一个工具方法，来统一打印标准输出。在 **Java** 插件中，只需要调用类似 `PluginLogger.print()` 方法就可以方便地输出信息。同时，我们还需要支持打印一些带平台可识别格式的日志，这些日志可以通过调用 `PluginLogger.append()` 被暂时保存，然后最后调用 `PluginLogger.flush()` 统一打印，伪代码如下：
~~~java
PluginLogger.append("step 1");
PluginLogger.append("step 2");
...
PluginLogger.append("step n");
PluginLogger.flush();
~~~
最终输出类似：
~~~json
["step 1", "step 2"... "step n"]
~~~

## 初步设想
因为在平台中同时会有多个 **Plugin** 线程在跑，所以要保证被暂存的 log 信息的线程安全，立马就能想到的方式是，每个 **Plugin** 线程维护一个 `ThreadLocal` 变量来保存当前线程的 log 数据，这样能做到 log 在线程之间的隔离而互不影响：
~~~java
public class PluginLogger {
    ThreadLocal<LogHolder> logger = new ThreadLocal<>();

    public static void append(message) {
        logger.get().append(message);
    }
    public static void flush() {
        logger.get().flush();
    }
}
~~~

## 遇到困难
这套设计对于一些单线程的插件并没有什么大问题，然而当插件内部有多线程的情况时，我们发现在子线程（**Plugin** 线程创建的线程）中打印的 log 都丢失了。因为子线程跟 **Plugin** 线程有着自己单独的 `ThreadLocal` 变量。
想要解决这个问题，必须要让 **Plugin** 子线程跟 **Plugin** 线程间能共享 log 的上下文，而又与其他的线程保持独立。按着这个要求，在之前的设计之下，当 **Plugin** 创建子线程的时候需要把对应的 log 实例一起传下去，然而这样会给使用带来很大的不便。

## 新设计
有没有办法可以知道当前线程的父线程呢？如果可以知道的话，如果线程本身就是 **Plugin** 线程，那直接调用 `PluginLogger.append()` 即可；如果不是 **Plugin** 线程，那找线程的父线程，一直找到是 **Plugin** 线程为止，然后调用对应的 log 实例的 `append()`。

### 线程组（ThreadGroup）
官方对**线程组**的描述是：
> A thread group represents a set of threads. In addition, a thread group can also include other thread groups. The thread groups form a tree in which every thread group except the initial thread group has a parent. A thread is allowed to access information about its own thread group, but not to access information about its thread group's parent thread group or any other thread groups.

**线程组**代表的就是一组线程，除了初始**线程组**之外，都有一个父亲。
**线程组**其实从 **Java1.0** 就存在了，设计初衷是用来做线程的管理。不过自从 **Java1.5** 提供了**线程池**之后，**线程组**就被完全比下去了，所以现在很少有用到。然而在我们项目场景中，**线程组**正能满足我们的需求。

### 线程组的层级结构
每个线程都隶属于一个**线程组**，线程的 `init()` 方法会在初始化时被调用：
~~~java
public class Thread implements Runnable {
    private void init(ThreadGroup g, Runnable target, String name,
                      long stackSize, AccessControlContext acc,
                      boolean inheritThreadLocals) {
        // 省略判断逻辑
        ...

        Thread parent = currentThread();
        if (g == null) {
            g = parent.getThreadGroup();
        }
        /* checkAccess regardless of whether or not threadgroup is
           explicitly passed in. */
        g.checkAccess();
        g.addUnstarted();

        this.group = g;
        // 省略其他逻辑
        ...
    }
}
~~~
可以看到，如果线程构造方法里面传了 `ThreadGroup` 参数，那么线程就隶属于这个 `ThreadGroup`；如果没有传，那此线程就和父线程（创建此线程的线程）共用 `ThreadGroup`。那 `ThreadGroup` 又是如何维持创建的层级关系的呢？来看源码：
~~~java
public class ThreadGroup implements Thread.UncaughtExceptionHandler {
    /**
     * Creates an empty Thread group that is not in any Thread group.
     * This method is used to create the system Thread group.
     */
    private ThreadGroup() {     // called from C code
        this.name = "system";
        this.maxPriority = Thread.MAX_PRIORITY;
        this.parent = null;
    }
    public ThreadGroup(String name) {
        this(Thread.currentThread().getThreadGroup(), name);
    }
    /**
     * @exception  NullPointerException  if the thread group argument is <code>null</code>.
     */
    public ThreadGroup(ThreadGroup parent, String name) {
        this(checkParentAccess(parent), parent, name);
    }

    private ThreadGroup(Void unused, ThreadGroup parent, String name) {
        this.name = name;
        this.maxPriority = parent.maxPriority;
        this.daemon = parent.daemon;
        this.vmAllowSuspension = parent.vmAllowSuspension;
        this.parent = parent;
        parent.add(this);
    }
}
~~~
`ThreadGroup` 提供了 `public` 和 `private` 的构造方法。从注释可以发现，第一个 `private` 方法是从 `C` 代码里面被调用的，它创建一个**系统线程组**（system Thread group），对应主线程。而 `public` 的方法则需要提供一个 `ThreadGroup` 参数，作为当前 `ThreadGroup` 的父对象。由此可见，`ThreadGroup` 的顶层是 **system Thread group**，它的 **parent** 是 `null`；对于其他 `ThreadGroup`，其 **parent** 默认是创建线程的 `ThreadGroup`。

### 用 ThreadGroup 解决问题
回到我们面临的困难，我们需要知道线程的创建链路，而通过 `ThreadGroup` 正好可以达到要求。所以新设计大致如下：
1. 给每个 **Plugin** 线程分配单独的 `ThreadGroup`。
2. 创建一个 `ConcurrentHashMap`，让 **Plugin** 的 `ThreadGroup` 与 log 实例一一对应。
3. 在 `PluginLogger.append()` 方法里面判断，当前线程的 `ThreadGroup` 是否在上述 `Map` 里面，如果在，则直接跳至第 5 步，否则走第 4 步。
4. 通过 `ThreadGroup.getParent()` 一直往上找，直到找到在 `Map` 里的 `ThreadGroup` 为止。
5. 从 `Map` 中获取对应的 log 实例打印日志。

在如此设计之下，对于 **Plugin** 的开发者来说，在任何地方，任意线程中调用 `PluginLogger` 的方法，获取到的 log 上下文都是同一个。

# 总结
1. `ThreadGroup` 虽然是目前 **Java** 中一个半废弃的类，但是对于跟踪线程创建链路还是很有用的。
2. 对于 **SDK** 的开发者来说，应该提供简单，易用的接口或方法，**keep it stupid simple**。
3. 方法总比问题多。