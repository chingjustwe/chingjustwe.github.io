---
layout: post
title: 漫谈zookeeper watcher单次触发特性
date: 2021-04-01
categories:
  - Thinking
tags:
  - zookeeper
  - watcher
---

架构师 Hooya 正带领着他的团队着手开发一款**高性能分布式协调工具**，暂名 **zookeeper**。

**Hooya开场白**：同学们，作为一个**分布式协调软件**，通知功能是必不可少的。今天我们来 brainstorm 一下如何设计咱 **zookeeper** 的通知机制吧。

**攻城狮小A抢先道**：这简单呀，不就是实现一个大号的[观察者模式](https://www.nightfield.com.cn/index.php/archives/135/)嘛，Client 注册 **watcher**，Server 在数据改动的时候通知 Client，目测不会太复杂。

**Hooya**：再简单也要从头开始，我们先定义一下通知的事件吧。

**小A一拍脑门**：**zookeeper** 目录按结构存储节点，同时节点上可以存储数据，有了：
~~~java
enum EventType {
    NodeCreated,
    NodeDeleted,
    DataChanged,
    ChildrenChanged;
}
~~~

**Hooya笑道**：小伙子思维很活跃啊。

**小A害羞道**：嘿嘿，跟据事件类型，Client 注册 **watcher** 也很简单：
~~~java
Client.addWatcher(path, eventType, callback);
~~~

**程序猿小B发问**：那 Server 端触发事件的方法该如何表示呢？

**小A解释**：当 Server 节点数据发生变化的时候，找到其对应的所有 **watcher**，挨个触发相应的事件，不同事件签名也不一样：
~~~java
Server.fireDataChangedEvent(path, dataBefore, dataAfter);
Server.fireChildrenChangedEvent(path, childrenBefore, childrenAfter);
Server.fireNodeCreatedEvent(path);
Server.fireNodeDeletedEvent(path);
~~~

**Hooya端起咖啡喝了一口**：不错不错，很直观。不过在触发 `DataChanged` 和 `ChildrenChanged` 事件的时候带上 before 和 after 的数据，真的有必要吗？

**小B若有所思**：确实，绝大多数情况下，Client 并不需要知道 before 的数据，它们更关心的是**最新**的数据。如果节点存储的数据量很大，或者子节点很多的情况下，每次通知的网络开销都很大哎。

**小A尴尬地笑了一下**：对对有道理，那对于数据的传输我们这样设计吧，可以节省约一半的网络开销！
~~~java
Server.fireDataChangedEvent(path, currentData);
Server.fireChildrenChangedEvent(path, currentChildren);
~~~

**Hooya摇摇头**：这样确实每次都能拿到最新的数据，但每次的数据都是 Client 关心的吗？想一下，比如某个节点的数据瞬间被改变了 100 次，Client 是否关心每次的数据变化？

**小B想了一下**：那拿 **zookeeper** 可能会使用到的场景来举例子呗：命名服务，注册中心，分布式锁，集群选主...咦，貌似这些场景，Client 都更关心节点**最终**的状态，而不是**每次**的变更！

**Hooya点头示意**：是的。

**小A挠挠头**：呃，但是 Server 端也没法判断某次变更是否就是**最终**态呀。这样，我们把这个责任交给 Client 吧：Server 端只负责通知，Client 收到通知之后，自己来获取最新的数据，完整流程的伪代码类似这样：
~~~java
Client.addWatcher(path, eventType, callback);

Server.fireEvent(path, eventType);

byte[] latestData = Client.getData(path);
Client.Callback.process(latestData);
~~~

**小B赞同道**：嗯不错，这样的通知机制确实轻量级了许多，避免了过多不必要的数据传输，可以保持 **zookeeper** 的高性能。

**Hooya补充**：但是这样的设计有一个前提，Server 端要控制**触发事件**与 **Client 端再次查询最新数据**之间，不会再次触发事件，否则，依然会有不必要的数据传输开销。

**小B摸摸下巴**：的确，为了维护这个逻辑 Server 端需要增加些许开销。

**小A灵机一动**：诶我说，我们逆向思维，**watcher** 触发完事件就将之删除不就行了嘛，类似如下伪代码：
~~~java
Client.addWatcher(path, eventType, callback);

Server.fireEvent(path, eventType);
Server.removeWatcher(path, eventType);

byte[] latestData = Client.getData(path);
Client.Callback.process(latestData);
~~~

**小B反驳道**：如果我需要一直监听某个节点的状态，那还要每次 `getData()` 结束再调用 `addWatcher()` 重新添加 **watcher** 吗？这不是多了一次网络交互？。

**Hooya扶了一下眼镜**：我觉得小A说得很有道理，把 **watcher** 做成**单次触发**（one time trigger）很符合目前的场景。
1. 能避免太多 **watcher** 占用过多内存
2. 天生能避免当节点更新太频繁时，给 Client 发送大量不必要的通知
3. 一定程度上免去了删除 **watcher** 的工作
4. 符合某些（如分布式锁）确实只需要触发一次事件的情况

总体来说利远大于弊。至于小B说的问题，把 `addWatcher()` 和 `getData()` 的操作统一，不就好了么？

**得到了肯定的小A嘿嘿一笑**：对对，把 `addWatcher()` 和 `getData()` 统一合情合理呀，在我们前面的讨论中，如果要重复设置 **watcher** 的话，需要在 `getData()` 之后操作。不如直接加一个 `Watcher` 参数在 `getData()` 方法中表示是否给当前节点添加 **watcher**，如果想持续监听某个节点的话：
~~~java
Client.getData(path, watcher);

Server.fireEvent(path, eventType);
Server.removeWatcher(path, eventType);

// watcher reset
byte[] latestData = Client.getData(path, watcher);
Client.Watcher.process(latestData);
~~~

**Hooya拍拍手**：没错，同理，对于 `exists()` 和 `getChildren()` 的操作中，也可以添加一个 `Watcher` 参数。

**小A和小B同时鼓掌**：**watcher 单次触发** 的设计是神来之笔啊，同时配合 `getData()`，`exists()` 和 `getChildren()` 可以对 **watcher** 进行 “reset”，**zookeeper** 性能不高都不行了呀哈哈

注：[zookeeper3.6](https://zookeeper.apache.org/doc/r3.7.0/zookeeperProgrammers.html#ch_zkWatches) 引入了 [永久递归监听器](https://issues.apache.org/jira/browse/ZOOKEEPER-1416)，但对于单个节点的事件来说，它依然是**单次触发**的。

# 参考
[add api support for "subscribe" method](https://issues.apache.org/jira/browse/ZOOKEEPER-153)
[zookeeper的watcher机制详解](https://www.nightfield.com.cn/index.php/archives/189/)