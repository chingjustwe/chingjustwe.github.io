---
layout: post
title: Java四种引用详解
date: 2019-12-28
categories:
  - SourceCode
tags:
  - Java
  - Java Reference
  - Garbage Collector
---

# 前言

为了满足对不同情况的垃圾回收需求，从Java从版本1.2开始，引入了4种引用类型(其实是额外增加了三种)的概念。本文将详细介绍这四种引用。

# Java 4种引用类型

Java中的4中引用类型分别为**强引用(String Reference)**，**软引用(Soft Reference)**，**弱引用(Weak Reference)**和**虚引用(Phantom Reference)**。

## 概念及应用场景

> - 强引用：Java中的引用，默认都是**强引用**。比如**new**一个对象，对它的引用就是**强引用**。对于被**强引用**指向的对象，就算JVM内存不足OOM，也不会去回收它们。
> - 软引用：若一个对象只被**软引用**所引用，那么它将在JVM内存不足的时候被回收，即如果JVM内存足够，则**软引用**所指向的对象不会被垃圾回收(其实这个说法也不够准确，具体原因后面再说)。根据这个性质，**软引用**很适合做内存缓存：既能提高查询效率，也不会造成内存泄漏。
> - 弱引用：若一个对象只被**弱引用**所引用，那么它将在下一次GC中被回收掉。如**ThreadLocal**和**WeakHashMap**中都使用了**弱引用**，防止内存泄漏。
> - 虚引用：**虚引用**是四种引用中最弱的一种引用。我们永远无法从虚引用中拿到对象，被**虚引用**引用的对象就跟不存在一样。**虚引用**一般用来跟踪垃圾回收情况，或者可以完成垃圾收集器之外的一些定制化操作。Java **NIO**中的**堆外内存(DirectByteBuffer)**因为不受GC的管理，这些内存的清理就是通过**虚引用**来完成的。

## 引用队列

**引用队列(Reference Queue)**是一个链表，顾名思义，存放的是引用对象(Reference对象)的队列。
**软引用**与**弱引用**可以和一个**引用队列(Reference Queue)**配合使用，当引用所指向的对象被垃圾回收之后，该引用对象本身会被添加到与之关联的**引用队列**中，从而方便后续一些跟踪或者额外的清理操作。
因为无法从**虚引用**中拿到目标对象，**虚引用**必须和一个**引用队列(Reference Queue)**配合使用。

# 案例解析

设置JVM的启动参数为
> -Xms10m -Xmx10m

~~~java
public class ReferenceTest {
    private static int _1MB = 1024 * 1024;
    private static int _1KB = 1024;

    public static void main(String[] args) throws InterruptedException {
        // 引用队列，存放Reference对象
        ReferenceQueue queue = new ReferenceQueue();
        // 定义四种引用对象，强/弱/虚引用为1kb，软引用为1mb
        Byte[] strong = new Byte[_1KB];
        SoftReference<Byte[]> soft = new SoftReference<>(new Byte[_1MB], queue);
        WeakReference<Byte[]> weak = new WeakReference<>(new Byte[_1KB], queue);
        PhantomReference<Byte[]> phantom = new PhantomReference<>(new Byte[_1KB], queue);

        Reference<String> collectedReference;
        // 初始状态
        System.out.println("Init: Strong Reference is " + strong);
        System.out.println("Init: Soft Reference is " + soft.get());
        System.out.println("Init: Weak Reference is " + weak.get());
        System.out.println("Init: Phantom Reference is " + phantom.get());
        do {
            collectedReference = queue.poll();
            System.out.println("Init: Reference In Queue is " + collectedReference);
        }
        while (collectedReference != null);
        System.out.println("********************");

        // 第一次手动触发GC
        System.gc();
        // 停100ms保证垃圾回收已经执行
        Thread.sleep(100);

        System.out.println("After GC: Strong Reference is " + strong);
        System.out.println("After GC: Soft Reference is " + soft.get());
        System.out.println("After GC: Weak Reference is " + weak.get());
        System.out.println("After GC: Phantom Reference is " + phantom.get());
        do {
            collectedReference = queue.poll();
            System.out.println("After GC: Reference In Queue is " + collectedReference);
        }
        while (collectedReference != null);
        System.out.println("********************");

        // 再分配1M的内存，以模拟OOM的情况
        Byte[] newByte = new Byte[_1MB];

        System.out.println("After OOM: Strong Reference is " + strong);
        System.out.println("After OOM: Soft Reference is " + soft.get());
        System.out.println("After OOM: Weak Reference is " + weak.get());
        System.out.println("After OOM: Phantom Reference is " + phantom.get());
        do {
            collectedReference = queue.poll();
            System.out.println("After OOM: Reference In Queue is " + collectedReference);
        }
        while (collectedReference != null);
    }
}
~~~

上述代码的输出结果为:
~~~java
Init: Strong Reference is [Ljava.lang.Byte;@74a14482
Init: Soft Reference is [Ljava.lang.Byte;@1540e19d
Init: Weak Reference is [Ljava.lang.Byte;@677327b6
Init: Phantom Reference is null
Init: Reference In Queue is null
********************
After GC: Strong Reference is [Ljava.lang.Byte;@74a14482
After GC: Soft Reference is [Ljava.lang.Byte;@1540e19d
After GC: Weak Reference is null
After GC: Phantom Reference is null
After GC: Reference In Queue is java.lang.ref.WeakReference@14ae5a5
After GC: Reference In Queue is java.lang.ref.PhantomReference@7f31245a
After GC: Reference In Queue is null
********************
After OOM: Strong Reference is [Ljava.lang.Byte;@74a14482
After OOM: Soft Reference is null
After OOM: Weak Reference is null
After OOM: Phantom Reference is null
After OOM: Reference In Queue is java.lang.ref.SoftReference@6d6f6e28
After OOM: Reference In Queue is null
~~~

1. 初始状态下，**虚引用**用就返回*null*，其他三个引用都有值。
2. 当触发GC之后，**弱引用**指向的对象也被回收了，而且可以看到**弱引用**和**虚引用**两个引用对象被加到了它们相关联的**引用队列**中了；**强引用**和**软引用**还是可以取到值。
3. 当JVM内存不足之后，**软引用**也被内存回收了，同时该**软引用**也被加到了与之关联的**引用队列**中了。而**强引用**依然能取到值。

# 源码解析

以下是引用类的UML图

![Reference UML](/src/img/article-img/SourceCode/JavaReference/reference_uml.png)

**弱引用**，**软引用**和**虚引用**都继承自**Reference**类，我们从**Reference**类看起

## Reference类

~~~java
// 此Reference对象可能会有四种状态：active, pending, enqueued, inactive
// avtive: 新创建的对象状态是active
// pending: 当Reference所指向的对象不可达，并且Reference与一个引用队列关联，那么垃圾收集器
//     会将Reference标记为pending，并且会将之加到pending队列里面
// enqueued: 当Reference从pending队列中，移到引用队列中之后，就是enqueued状态
// inactive: 如果Reference所指向的对象不可达，并且Reference没有与引用队列关联，Reference
//     从引用队列移除之后，变为inactive状态。inactive就是最终状态
public abstract class Reference<T> {
    // 该对象就是Reference所指向的对象，垃圾收集器会对此对象做特殊处理。
    private T referent;         /* Treated specially by GC */
    // Reference相关联的引用队列
    volatile ReferenceQueue<? super T> queue;
    // 当Reference是active时，next为null
    // 当该Reference处于引用队列中时，next指向队列中的下一个Reference
    // 其他情况next指向this，即自己
    // 垃圾收集器只需判断next是不是为null，来看是否需要对此Reference做特殊处理
    volatile Reference next;
    // 当Reference在pending队列中时，该值指向下一个队列中Reference对象
    // 另外垃圾收集器在GC过程中，也会用此对象做标记
    transient private Reference<T> discovered;  /* used by VM */

    // 锁对象
    static private class Lock { }
    private static Lock lock = new Lock();

    // pending队列，这里的pending是pending链表的队首元素，一般与上面的discovered变量一起使用
    private static Reference<Object> pending = null;
    // 获取Reference指向的对象。默认返回referent对象
    public T get() {
        return this.referent;
    }
}
~~~

**Reference**类跟垃圾收集器紧密关联，其状态变化如下图所示：

![Reference State](/src/img/article-img/SourceCode/JavaReference/Reference_state.jpg)

上述步骤大多数都是由GC线程来完成，其中*Pending*到*Enqueued*是用户线程来做的。**Reference**类中定义了一个子类**ReferenceHandler**，专门用来处理*Pending*状态的**Reference**。我们来看看它具体做了什么。

## ReferenceHandler类

~~~java
public abstract class Reference<T> {
    // 静态块，主要逻辑是启动ReferenceHandler线程
    static {
        // 创建ReferenceHandler线程
        ThreadGroup tg = Thread.currentThread().getThreadGroup();
        for (ThreadGroup tgn = tg; tgn != null; tg = tgn, tgn = tg.getParent());
            Thread handler = new ReferenceHandler(tg, "Reference Handler");
        // 设置成守护线程，最高优先级，并启动
        handler.setPriority(Thread.MAX_PRIORITY);
        handler.setDaemon(true);
        handler.start();
        // 访问控制
        SharedSecrets.setJavaLangRefAccess(new JavaLangRefAccess() {
            @Override
            public boolean tryHandlePendingReference() {
                return tryHandlePending(false);
            }
        });
    }

    // 内部类ReferenceHandler，用来处理Pending状态的Reference
    private static class ReferenceHandler extends Thread {
        private static void ensureClassInitialized(Class<?> clazz) {
            try {
                Class.forName(clazz.getName(), true, clazz.getClassLoader());
            } catch (ClassNotFoundException e) {
                throw (Error) new NoClassDefFoundError(e.getMessage()).initCause(e);
            }
        }
        // 静态块，确保InterruptedException和Cleaner已经被ClassLoader加载
        // 因为后面会用到这两个类
        static {
            ensureClassInitialized(InterruptedException.class);
            ensureClassInitialized(Cleaner.class);
        }

        ReferenceHandler(ThreadGroup g, String name) {
            super(g, name);
        }

        public void run() {
            // 死循环调用tryHandlePending方法
            while (true) {
                tryHandlePending(true);
            }
        }
    }
}
~~~

**Reference**类在加载进JVM的时候，会启动**ReferenceHandler**线程，并将它设成最高优先级的守护线程，不断循环调用*tryHandlePending*方法。
接下来看*tryHandlePending*方法：

~~~java
    // waitForNotify默认是true。
    static boolean tryHandlePending(boolean waitForNotify) {
        Reference<Object> r;
        Cleaner c;
        try {
            // 需要在同步块中进行
            synchronized (lock) {
                // 判断pending队列是否为空，pending是队首元素
                if (pending != null) {
                    // 取到pending队列队首元素，赋值给r
                    r = pending;
                    // Cleaner类是Java NIO中专门用来清理堆外内存(DirectByteBufer)的类，这里对它做了特殊处理
                    // 当没有其他引用指向堆外内存时，与之关联的Cleaner会被加到pending队列中
                    // 如果该Reference是Cleaner实例，那么取到该Cleaner，后续可以做一些清理操作。
                    c = r instanceof Cleaner ? (Cleaner) r : null;
                    // r.discovered就是下一个元素
                    // 以下操作即为将队首元素从pending队列移除
                    pending = r.discovered;
                    r.discovered = null;
                } else {
                    // 如果pending队列为空，则释放锁等待
                    // 当有Reference添加到pending队列中时，ReferenceHandler线程会从此处被唤醒
                    if (waitForNotify) {
                        lock.wait();
                    }
                    return waitForNotify;
                }
            }
        } catch (OutOfMemoryError x) {
            // OOM时，让出cpu
            Thread.yield();
            return true;
        } catch (InterruptedException x) {
            return true;
        }
        // 给Cleaner的特殊处理，调用clean()方法，以释放与之关联的堆外内存
        if (c != null) {
            c.clean();
            return true;
        }
        // 此处，将此Reference加入到与之关联的引用队列
        ReferenceQueue<? super Object> q = r.queue;
        if (q != ReferenceQueue.NULL) q.enqueue(r);
        return true;
    }
~~~

看到这里，豁然开朗。**ReferenceHandler**线程专门用来处理*pending*状态的**Reference**，跟GC线程组成类似生产者消费者的关系。当*pending*队列为空，则等待；当**Reference**关联的对象被回收，**Reference**被加入到*pending*队列中之后，**ReferenceHandler**线程会被唤醒来处理*pending*的**Reference**，主要做三件事：
1. 将该**Reference**从*pending*队列移除
2. 如果该**Reference**是**Cleaner**的实例，那么调用*clean*方法，释放堆外内存
3. 将**Reference**加入到与之关联的引用队列

## ReferenceQueue

引用队列比较简单，可以直接理解为一个存放**Reference**的链表，在此不再费笔墨。

## 虚引用PhantomReference

~~~java
// 灰常简单，只重写了一个构造方法，一个get方法
public class PhantomReference<T> extends Reference<T> {
    // get方法永远返回null
    public T get() {
        return null;
    }

    // 只提供了一个包含ReferenceQueue的构造方法，说明它必须和引用队列一起使用
    public PhantomReference(T referent, ReferenceQueue<? super T> q) {
        super(referent, q);
    }
}
~~~

一般情况下**虚引用**使用得比较少，最为人所熟知的就是**PhantomReference**的子类**Cleaner**了，它用来清理NIO中的堆外内存。有机会可以专门写篇文章来讲讲它。

## 弱引用WeakReference

~~~java
// 更加简单，只重写了两个构造方法
public class WeakReference<T> extends Reference<T> {
    public WeakReference(T referent) {
        super(referent);
    }

    public WeakReference(T referent, ReferenceQueue<? super T> q) {
        super(referent, q);
    }
}
~~~

太过简单，不做额外讲解。

## 软引用SoftReference

~~~java
// 相比WeakReference，它增加了两个时间戳，clock和timestamp
// 这两个参数是实现他们内存回收上区别的关键
public class SoftReference<T> extends Reference<T> {
    // 每次GC之后，若该引用指向的对象没有被回收，则垃圾收集器会将clock更新成当前时间
    static private long clock;
    // 每次调用get方法的时候，会更新该时间戳为clock值
    // 所以该值保存的是上一次(最近一次)GC的时间戳
    private long timestamp;

    public SoftReference(T referent) {
        super(referent);
        this.timestamp = clock;
    }

    public SoftReference(T referent, ReferenceQueue<? super T> q) {
        super(referent, q);
        this.timestamp = clock;
    }
    // 每次调用，更新timestamp的值，使之等于clock的值，即最近一次gc的时间
    public T get() {
        T o = super.get();
        if (o != null && this.timestamp != clock)
            this.timestamp = clock;
        return o;
    }
}
~~~

**SoftReference**除了多了两个时间戳之外，跟**WeakReference**几乎没有区别，它是如何做到在**内存不足时被回收**这件事的呢？其实这是垃圾收集器干的活。垃圾收集器回收**SoftReference**所指向的对象，会看两个维度：
1. SoftReference.timestamp有多老(距上一次GC过了多久)
2. JVM的堆空闲空间有多大

而具体什么时候回收**SoftReference**所指向的对象呢，可以参考如下公式：
> interval <= free_heap * ms_per_mb

其中**interval**为上一次GC与当前时间的差值，以毫秒为单位；**free_heap**为当前JVM中剩余的堆空间大小，以MB为单位；**ms_per_mb**可以理解为一个常数，即每兆空闲空间可维持的**SoftReference**的对象生存的时长，默认为1000，可以通过JVM参数*-XX:SoftRefLRUPolicyMSPerMB*设置。
如果上述表达式返回**false**，则清理**SoftReference**所指向的对象，并将该**SoftReference**加入到*pending*队列中；否则不做处理。所以说**在JVM内存不足的时候回收软引用**这个说法不是非常准确，只是个经验说法，**软引用**的回收，还跟它存活的时间有关，甚至跟JVM参数设置(-XX:SoftRefLRUPolicyMSPerMB)都有关系！


# 参考
[How Hotspot Clear Softreference](http://jeremymanson.blogspot.com/2009/07/how-hotspot-decides-to-clear_07.html)