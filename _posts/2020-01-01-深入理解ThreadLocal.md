---
layout: post
title: 深入理解ThreadLocal
date: 2020-01-01
categories:
  - SourceCode
tags:
  - Java
  - 多线程
  - Java Reference
---

# 前言

**并发**是Java开发中绕不开的一个话题。现代处理器都是多核心，想要更好地榨干机器的性能，多线程编程是必不可少，所以，**线程安全**是每位Java Engineer的必修课。

应对**线程安全**问题，可大致分为两种方式：
> 1. 同步： 用**Synchronized**关键字，或者用**java.util.concurrent.locks.Lock**工具类给临界资源加锁。
> 2. 避免资源争用： 将全局资源放在**ThreadLocal**变量中，避免并发访问。

本文将介绍第二种方式：**ThreadLocal**的实现原理以及为什么能保证线程安全。

# ThreadLocal

下面是**ThreadLocal**的一个常见使用场景：
~~~java
public class ThreadLocalTest {
    // 一般都将ThreadLocal定义为静态变量
    private static final ThreadLocal<DateFormat> format = new ThreadLocal<DateFormat>(){
        // 初始化ThreadLocal的值
        protected DateFormat initialValue() {
            return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        }
    };

    public static void main(String[] args) {
        // 启动20个线程
        for (int i = 0; i < 20; i++) {
            new Thread(() -> {
                try {
                    // 得到SimpleDateFormat在本线程中的副本
                    DateFormat localFormat = format.get();
                    // 解析日期，这里并不会报错
                    Date date = localFormat.parse("2000-11-11 11:11:11");
                    System.out.println(date);
                } catch (ParseException e) {
                    e.printStackTrace();
                }
            }).start();
        }
    }
}
~~~

大家应该都知道，Java中**SimpleDateFormat**不是线程安全的，参考[这篇文章](https://nightfield.com.cn/index.php/archives/43/)。然而上述代码的确不会报错，说明**ThreadLocal**确实能保证并发安全。

# 源码解析

## ThreadLocal概览

上面的例子中，我们调用了**ThreadLocal**的*initialValue*和*get*方法，且来看一下*get*方法的实现：
~~~java
// 此类的作者是两个大神，前者是《Effective Java》的作者，后者是Java并发包的作者，并发大师
/*
 * @author  Josh Bloch and Doug Lea
 * @since   1.2
 */
public class ThreadLocal<T> {
    public T get() {
        // 得到当前线程
        Thread t = Thread.currentThread();
        // 根据当前线程，拿到一个Map，暂且可以将之类比为HashMap键值对形式
        // 可见这个Map是与本线程相关的
        ThreadLocalMap map = getMap(t);
        if (map != null) {
            // 通过this从Map中拿Entry，说明Map中的Key就是ThreadLocal变量本身
            // value就是ThreadLocal中所保存的对象
            ThreadLocalMap.Entry e = map.getEntry(this);
            if (e != null) {
                @SuppressWarnings("unchecked")
                T result = (T)e.value;
                return result;
            }
        }
        // 若Map没有初始化(map == null)，或者当前ThreadLocal变量没有初始化(e == null)
        // 则调用此方法完成初始化
        return setInitialValue();
    }

    // 原来，这个ThreadLocalMap只是线程的一个成员变量！
    ThreadLocalMap getMap(Thread t) {
        return t.threadLocals;
    }
}

public class Thread implements Runnable {
    // Thread类中定义了一个全局变量ThreadLocalMap
    // 用来存放本线程中所有的ThreadLocal类型变量，初始值为null
    ThreadLocal.ThreadLocalMap threadLocals = null;
}
~~~

由*get*方法，我们可以得到如下信息：
> 1. **ThreadLocal**变量保存在一个Map中，而这个Map正是**Thread**类的一个全局变量。这也是**ThreadLocal**实现线程安全的一个关键点：各个线程都有自己的Map，每个线程操作的都是自己的ThreadLocal变量副本，互不影响。
> 2. **ThreadLocalMap**保存线程中所有的**ThreadLocal**变量，**ThreadLocal**变量是Key，**ThreadLocal**所对应的值为Value。（在本文开始的例子中，Key为**format**变量，Value为*initialValue*方法返回的值**new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")**
> 3. **ThreadLocal**是懒加载的，当发现**ThreadLocalMap**或者当前**ThreadLocal**变量未初始化时，会调用*setInitialValue*方法进行初始化。

![ThreadLocal](/src/img/article-img/SourceCode/ThreadLocal/ThreadLocal.jpg)

## ThreadLocal其他方法

继续来看*setInitialValue*方法做了什么事情：
~~~java
    private T setInitialValue() {
        // 调用initialValue方法初始化
        // 这个方法即为我们定义ThreadLocal变量的时候重写的方法
        T value = initialValue();
        Thread t = Thread.currentThread();
        // 获取当前线程的ThreadLocalMap
        ThreadLocalMap map = getMap(t);
        if (map != null)
            // 如果Map已经初始化好了，那直接初始化当前ThreadLocal变量：
            // 将自己(当前ThreadLocal变量)作为key，保存的值作为value，set到Map里面去
            map.set(this, value);
        else
            // 如果Map还未初始化，则初始化Map
            createMap(t, value);
        return value;
    }

    // 默认的initialValue方法定义为protected，就是给我们重写的
    protected T initialValue() {
        return null;
    }

    void createMap(Thread t, T firstValue) {
        // 新建一个ThreadLocalMap，赋值给当前Thread
        t.threadLocals = new ThreadLocalMap(this, firstValue);
    }
~~~

其他还有*set*和*remove*方法，很简单这里不另外讲解。

难道**ThreadLocal**就此结束了么？有这么简单么？当然没有。因为**ThreadLocalMap**是**Thread**的一个成员变量，所以它的生命周期跟线程是一样长的。也就是说，只要线程还没有被销毁，那么Map就会常驻内存，无法被GC，很容易造成内存泄漏。那**ThreadLocal**是如何解决的呢？

答案是**弱引用**，Java中的引用类型，可以参考[这篇文章](https://nightfield.com.cn/index.php/archives/71/)。

# ThreadLocalMap

**ThreadLocalMap**是**ThreadLocal**的一个内部类。Java中有现成的类**HashMap**，而**ThreadLocal**又费劲千辛万苦自己实现了一个**ThreadLocalMap**，就是出于防止内存泄漏考虑。

下面我们来探秘**ThreadLocalMap**，它跟普通的**HashMap**有什么区别。

## ThreadLocalMap的数据结构
~~~java
static class ThreadLocalMap {

    // 内部类Entry继承了WeakReference
    static class Entry extends WeakReference<ThreadLocal<?>> {
        // ThreadLocal变量中保存的值
        Object value;

        // 可以看到，Entry只是简单的Key-Value，并没有类似HashMap中的链表
        Entry(ThreadLocal<?> k, Object v) {
            super(k);
            value = v;
        }
    }
    // ThreadLocalMap默认大小
    private static final int INITIAL_CAPACITY = 16;
    // 此Entry数组，就是所有ThreadLocal存放的地方
    private Entry[] table;
}
~~~

**ThreadLocalMap**维护了一个**Entry**数组(没有链表，这是跟HashMap不一样的地方)，用来存放线程中所有的**ThreadLocal**变量。**Entry**继承了**WeakReference**，并关联了**ThreadLocal**，当外界没有其他强引用指向**ThreadLocal**对象时，该**ThreadLocal**对象会在下一次GC时被**内存回收**，也就是**Entry**中的Key会被回收掉，所以下面会看到**清理key为null的Entry**的操作。

## Set操作

当**HashMap**遇到**哈希冲突**的时候，是通过在同一个*Hash Key*上建立链表来解决的。既然**ThreadLocalMap**只维护了一个**Entry**数组，那它是怎么解决**哈希冲突**的呢？我们来看*set*方法的源码：
~~~java
    private void set(ThreadLocal<?> key, Object value) {
        Entry[] tab = table;
        int len = tab.length;
        // 根据ThreadLocal的hashcode，计算出在table中的槽位(index)
        int i = key.threadLocalHashCode & (len-1);
        // 从位置i开始，逐个往后循环，找到第一个空的槽位(条件e == null)
        for (Entry e = tab[i]; e != null; e = tab[i = nextIndex(i, len)]) {
            ThreadLocal<?> k = e.get();
            // 如果key相等，则直接将旧value覆盖掉，换成新value
            if (k == key) {
                // 新值替换掉旧值，并return掉
                e.value = value;
                return;
            }
            // key == null，说明弱引用之前已经被内存回收，则将值设在此槽位
            if (k == null) {
                // 该方法后面再解析
                replaceStaleEntry(key, value, i);
                return;
            }
        }

        // 走到这里，这个i 是从key真正所在的hash槽之后数，第一个非空槽位
        // 将value包装成Entry，放到位置i中
        tab[i] = new Entry(key, value);
        int sz = ++size;
        // 查找是否有Entry已经被回收
        // 如果找到有Entry被回收，或者table的size大于阈值，执行rehash操作
        if (!cleanSomeSlots(i, sz) && sz >= threshold)
            rehash();
    }
    
    // 获取下一个index。其实就是i + 1。当超出table长度的时候，归0重新来
    private static int nextIndex(int i, int len) {
        return ((i + 1 < len) ? i + 1 : 0);
    }
~~~

**ThreadLocalMap**是用**开放地址发**来解决哈希冲突的。如果目标槽位已经有值了，首先判断该值是不是就是自己。如果是，那就替换旧值；如果不是，再判断该槽位的值是否有效(槽位上的ThreadLocal变量有没有被垃圾回收)，如果无效，则直接设置在该槽位，并执行一些清理操作。如果该槽位上是一个有效的值，那么往后继续寻找，直到找到空槽位为止。流程大概如下：
![ThreadLocalMap](/src/img/article-img/SourceCode/ThreadLocal/ThreadLocalHashMap.jpg)

## 清理无效的Entry

到这里，我们应该带着一个疑问：**弱引用**清除的只是**Entry**中的key，也就是**ThreadLocal**变量，而**Entry**本身依然占据着table中的槽位。那代码中是在哪里清理这些无效的**Entry**的呢？我们重点看一下上面没有分析的两个方法*replaceStaleEntry*和*cleanSomeSlots*

#### cleanSomeSlots

~~~java
    // 顾名思义，清除部分槽位，默认扫描log(n)个槽位
    private boolean cleanSomeSlots(int i, int n) {
        boolean removed = false;
        Entry[] tab = table;
        int len = tab.length;
        do {
            i = nextIndex(i, len);
            Entry e = tab[i];
            // 注意无效Entry的判断条件是，e.get() == null
            // 即Entry中保存的弱引用已经被GC，这种情况需要将对应Entry清除
            if (e != null && e.get() == null) {
                // 如果发现有无效entry，那n会重新设置为table的长度
                // 即会继续查找log(n)个槽位，判断有没有无效Entry
                n = len;
                removed = true;
                // 调用expungeStaleEntry方法清除i位置的槽位
                i = expungeStaleEntry(i);
            }
        // 循环条件为n右移一位，即除以2。所以默认是循环log(n)次
        } while ( (n >>>= 1) != 0);
        // 如果有槽位被清除，返回true
        return removed;
    }

    private int expungeStaleEntry(int staleSlot) {
        Entry[] tab = table;
        int len = tab.length;
        // 将i位置的槽位置为空
        tab[staleSlot].value = null;
        tab[staleSlot] = null;
        size--;

        Entry e;
        int i;
        // 继续往后检查是否有无效Entry，直到遇到空的槽位tab[i]==null为止
        for (i = nextIndex(staleSlot, len); (e = tab[i]) != null; i = nextIndex(i, len)) {
            ThreadLocal<?> k = e.get();
            // 如果Entry无效，将其清除
            if (k == null) {
                e.value = null;
                tab[i] = null;
                size--;
            } else {
                // 重新计算hash值h
                int h = k.threadLocalHashCode & (len - 1);
                // 如果新hash值h不等于当前位置的槽位值i，这种情况需要rehash
                // 给当前i位置的e，重新找更合理的槽位
                if (h != i) {
                    // 将i位置置空
                    tab[i] = null;
                    // 从h位置往后找第一个空槽位
                    while (tab[h] != null)
                        h = nextIndex(h, len);
                    // 将e放在第一个空槽位上
                    tab[h] = e;
                }
            }
        }
        // 返回接下来第一个空槽位的下标
        return i;
    }
~~~

*cleanSomeSlots*方法会扫描部分的槽位，查看是否有无效的**Entry**。如果没有找到，那么只扫描log(n)个槽位；如果有找到无效槽位，则会清除该槽位，并额外再扫描log(n)个槽位，以此类推。
清空槽位的工作是*expungeStaleEntry*方法做的，除了清除当前位置的**Entry**之外，它还会检查往后连续的非空**Entry**，并清除其中无效值。同时还会判断并处理**rehash**。这里为什么要**rehash**？因为前面有无效**Entry**被清除掉了，如果后面的**Entry**是因为hash冲突而被延到后面的，就可以把后面的**Entry**移到前面空出来的位置上，从而提高查询效率。

#### cleanSomeSlots举例

![cleanSomeSlots example](/src/img/article-img/SourceCode/ThreadLocal/ExpungeStaleEntry.jpg)

上图的情况，我们分两种情况讨论：
- 如果从i=2开始找：
  1. tab[2]所在位置为null，继续循环i=nextIndex(i, len)=nextIndex(2, 8)=3
  2. tab[3]所在位置(k3,v3)有效，继续循环i=nextIndex(i, len)=nextIndex(3, 4)=0
  3. tab[0]所在位置(k1,v1)有效，继续循环i=nextIndex(i, len)=nextIndex(0, 2)=1
  4. tab[1]所在位置(k2,v2)有效，继续循环i=nextIndex(i, len)=nextIndex(1, 1)=0
  5. tab[0]所在位置(k1,v1)有效，n==0结束

- 如果从i=11开始找：
  1. tab[11]所在位置(null,v7)无效，调用expungeStaleEntry方法，expungeStaleEntry方法清空tab[11]，并会往后循环判断。因为tab[12]位置(null,v8)无效，所以tab[12]也会被清空；tab[13]位置(k9,v9)有效，则会判断是否需要给(k9,v9)重新放位置。如果对k9执行rehash之后依然是12，则不作处理；如果对k9执行rehash之后是11，说明该元素是因为hash碰撞被放到了12的位置，那么需要把元素放到tab[11]的位置。expungeStaleEntry方法返回第一个为null的下标14，n重新设置为16，i=nextIndex(i, len)=nextIndex(14, 16)=15
  2. tab[15]所在位置(k10,v10)有效，继续循环i=nextIndex(i, len)=nextIndex(15, 8)=0
  3. tab[0]所在位置(k1,v1)有效，继续循环i=nextIndex(i, len)=nextIndex(0, 2)=1
  4. tab[1]所在位置(k2,v2)有效，继续循环i=nextIndex(i, len)=nextIndex(1, 1)=0
  5. tab[0]所在位置(k1,v1)有效，n==0结束

#### replaceStaleEntry方法

~~~java
    private void replaceStaleEntry(ThreadLocal<?> key, Object value, int staleSlot) {
        Entry[] tab = table;
        int len = tab.length;
        Entry e;
        // slotToExpunge记录了包含staleSlot的连续段上，第一个无效Entry的下标
        int slotToExpunge = staleSlot;
        // 往前遍历非空槽位，找到第一个无效Entry的下标，记录为slotToExpunge
        for (int i = prevIndex(staleSlot, len); (e = tab[i]) != null; i = prevIndex(i, len))
            if (e.get() == null)
                slotToExpunge = i;
        // 往后遍历非空段，查找key所在的位置，即检查key之前是否之前已经被添加过
        // 为什么到tab[i]==null为止？因为空的槽之后的hash值肯定已经不一样
        for (int i = nextIndex(staleSlot, len); (e = tab[i]) != null; i = nextIndex(i, len)) {
            ThreadLocal<?> k = e.get();
            if (k == key) {
                // 如果找到了key，那么说明此key之前已经添加过，直接覆盖旧值
                // 因为staleSlot小于i，需要将两个槽位的值进行交换，以提高查询效率
                // 而被换到i处的无效Entry，会在之后的cleanSomeSlots被清除掉
                e.value = value;
                tab[i] = tab[staleSlot];
                tab[staleSlot] = e;
                // 如果slotToExpunge的值并没有变，说明往前查找的过程中并未发现无效Entry
                // 那么以当前位置作为cleanSomeSlots的起点
                if (slotToExpunge == staleSlot)
                    slotToExpunge = i;
                // 这两个方法都已经分析过，从slotToExpunge位置开始清理无效Entry
                cleanSomeSlots(expungeStaleEntry(slotToExpunge), len);
                return;
            }

            // 如果前面往前查找没有发现无效Entry，且此处的Entry无效(k==null)
            // 那么将说明i处是第一个无效Entry，将slotToExpunge计为i
            if (k == null && slotToExpunge == staleSlot)
                slotToExpunge = i;
        }
        // 如果key没有找到，说明这是一个新Entry，那么直接新建一个Entry放在staleSlot位置
        tab[staleSlot].value = null;
        tab[staleSlot] = new Entry(key, value);
        if (slotToExpunge != staleSlot)
            // 这两个方法都已经分析过，从slotToExpunge位置开始清理无效Entry
            cleanSomeSlots(expungeStaleEntry(slotToExpunge), len);
    }
~~~

这个方法其实就是三个步骤：
1. 往后查找该key在table中是否存在。如果存在，即之前已经*set*过该key，那么需要覆盖掉旧值，并且将key所在元素移到staleSlot位置。(为什么要移位置？因为原元素所在的位置i，肯定在staleSlot之后，所以将元素往前放到staleSlot上可以提高查询效率，并避免后续的rehash操作。)
2. 如果key不存在，说明是新set的操作，直接新建**Entry**，放在staleSlot位置。
3. 调用*cleanSomeSlots*方法，清除无效的**Entry**

#### 其他方法

剩下的方法都比较简单，解析见源码注释，不另外解释
*get*方法：
~~~java
    // get操作的方法
    private Entry getEntry(ThreadLocal<?> key) {
        int i = key.threadLocalHashCode & (table.length - 1);
        Entry e = table[i];
        // i位置元素即为要找的元素，直接返回
        if (e != null && e.get() == key)
            return e;
        else
            // 否则调用getEntryAfterMiss方法
            return getEntryAfterMiss(key, i, e);
    }

    private Entry getEntryAfterMiss(ThreadLocal<?> key, int i, Entry e) {
        Entry[] tab = table;
        int len = tab.length;
        // 从i位置开始，往后遍历查找，直到空槽位为止。为什么到空槽位为止？
        // 根据开地址法，空槽位之后的元素hash值肯定已经不一样，没必要再继续
        while (e != null) {
            ThreadLocal<?> k = e.get();
            // key相等，这就是目标元素，直接返回
            if (k == key)
                return e;
            // key为null，则是无效元素，调用expungeStaleEntry方法清除i位置的元素
            if (k == null)
                expungeStaleEntry(i);
            else
                // 继续寻找下一个元素
                i = nextIndex(i, len);
            e = tab[i];
        }
        // 没有找到目标元素，返回null
        return null;
    }
~~~

*remove*方法：
~~~java
    private void remove(ThreadLocal<?> key) {
        Entry[] tab = table;
        int len = tab.length;
        int i = key.threadLocalHashCode & (len-1);
        // 还是一样的遍历逻辑
        for (Entry e = tab[i]; e != null; e = tab[i = nextIndex(i, len)]) {
            // 找到目标元素
            if (e.get() == key) {
                e.clear();
                // 调用expungeStaleEntry方法清除i位置的元素
                expungeStaleEntry(i);
                return;
            }
        }
    }
~~~

*resize*方法
~~~java
    // 当元素个数大于threshold(默认是table长度的2/3)时，需要resize
    private void resize() {
        Entry[] oldTab = table;
        int oldLen = oldTab.length;
        // 新table长度是旧table的2倍
        int newLen = oldLen * 2;
        Entry[] newTab = new Entry[newLen];
        int count = 0;
        // 遍历旧table
        for (int j = 0; j < oldLen; ++j) {
            Entry e = oldTab[j];
            if (e != null) {
                ThreadLocal<?> k = e.get();
                // 如果key为null，则这是个无效Entry，直接跳过(将值置为空方便GC)
                if (k == null) {
                    e.value = null; // Help the GC
                } else {
                    // 根据新table的长度重新计算hash值
                    int h = k.threadLocalHashCode & (newLen - 1);
                    // 根据开地址法，从h开始找到第一个空槽位
                    while (newTab[h] != null)
                        h = nextIndex(h, newLen);
                    // 将该值放到该位置
                    newTab[h] = e;
                    count++;
                }
            }
        }
        // 设置新table的一些参数
        setThreshold(newLen);
        size = count;
        table = newTab;
    }
~~~

# 总结

本文从代码层面，深入介绍了**ThreadLocal**的实现原理。
**ThreadLocal**可以保证线程安全，是因为它给为每个线程都创建了一个变量的副本。每个线程访问的都是自己内部的变量，不会有并发冲突。
作为线程内部变量，它跟局部变量有什么区别呢？一般**ThreadLocal**都被定义为**static**，也就是说，每个线程只需要创建一份，生命周期跟线程一样。而局部变量生命周期跟方法与方法一样，每调用一次方法，创建一次变量，方法结束，对象销毁。**ThreadLocal**可以避免一些大对象的重复创建销毁。

**ThreadLocalMap**的**Entry**继承自**WeakReference**，当没有其他的强引用指向**ThreadLocal**变量时，该**ThreadLocal**变量会在下次GC中被回收。对于被回收掉的**ThreadLocal**变量，不会显式地去清理，而是在接下来的*get*，*set*，*remove*操作中去检查删除掉这些无效**ThreadLocal**变量所在的**Entry**，防止可能的内存泄漏。