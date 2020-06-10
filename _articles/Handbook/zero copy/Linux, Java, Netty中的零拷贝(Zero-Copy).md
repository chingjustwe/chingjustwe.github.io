---
layout: post
title: Linux, NIO和Netty中的零拷贝(Zero-Copy)
date: 2020-06-08
categories:
  - Handbook
tags:
  - Zero Copy
  - Netty
  - NIO
  - Linux Kernel
---

# 背景

**零拷贝**(Zero Copy)是一个耳熟能详的术语，众多高性能的网络框架如[Netty](https://netty.io/)，[Kafka](https://kafka.apache.org/)，[Rocket MQ](https://rocketmq.apache.org/)都将**零拷贝**标榜为其特性。那么究竟什么是**零拷贝**？

# 零拷贝

[Wikipedia](https://en.wikipedia.org/wiki/Zero-copy)上对**零拷贝**的解释如下：
> "Zero-copy" describes computer operations in which the CPU does not perform the task of copying data from one memory area to another. This is frequently used to save CPU cycles and memory bandwidth when transmitting a file over a network.

**零拷贝**防止了数据在内存中的复制，可以提升网络传输的性能。由此产生两个疑问：
1. 为什么会出现数据的复制？
2. **零拷贝**真的是**0**次数据复制吗？

# Linux系统中的零拷贝

继续往下之前，需要了解几个`OS`的概念：
1. 内核空间：计算机内存被分为**用户空间**和**内核空间**。**内核空间**运行OS内核代码，并可以访问所有内存，机器指令和硬件资源，具有最高的权限。
2. 用户空间：即内核以外的所有空间，用于正常用户进程运行。**用户空间**的进程无权访问**内核空间**，只能通过内核暴露的接口----系统调用(`system calls`)去访问内核的一小部分。如果用户进程请求执行系统调用，需要给内核发送系统中断(software interrupt)，内核会分派相应的中断处理器处理请求。
3. DMA：**Direct Memory Access**(`DMA`)是来应对`CPU`与**硬盘**之间速度量级不匹配的问题的，它允许某些硬件子系统访问独立于`CPU`的主内存。如果没有`DMA`，`CPU`进行IO操作的整个过程都是阻塞的，无法执行其他工作，这会使计算机陷入**假死状态**。如果有`DMA`介入，IO过程变成这样：`CPU`启动`DMA`传输，期间它可以执行其他操作；**DMA控制器**(`DMAC`)在传输完成后，会给`CPU`发送中断信号，这时`CPU`便可以处理传输好的数据。

## 传统的网络传输

网络IO的一个常见场景是，将文件从硬盘读取出来，并通过网卡发送至网络。以下是简单的伪代码：
~~~java
// 从硬盘读取数据
File.read(fileDesc, buf, len);
// 发送数据到网络
Socket.write(socket, buf, len);
~~~

代码层面，这是一个非常简单的操作，但是深入到系统层面，我们来看看背后发生了什么：
![traditional flow](/src/img/article-img/Handbook/zero%20copy/traditional_flow.jpg)

由于**用户空间**无法直接访问文件系统，所以，这个场景涉及到了三个模块的交互：**用户空间**，**内核空间**和**硬件**。
1. 用户发起`read()`系统调用(`syscall`)，请求硬盘数据。此时，会发生一次**上下文切换**(context switch)。
2. `DMA`从硬盘读取文件，这时，产生一次复制：**硬盘**-->**DMA缓冲区**。
3. `DMA`将数据复制到**用户空间**，`read()`调用返回。此时，发生一次**上下文切换**以及一次数据复制：**DMA缓冲区**-->**用户空间**。
4. 用户发起`write()`系统调用，请求发送数据。此时发生一次**上下文切换**和一次数据复制：**用户空间**-->**DMA缓冲区**。
5. `DMA`将数据复制到网卡，以备网络发送。此时发生第四次数据复制：**DMA缓冲区**-->**套接字缓冲区**
6. `write()`调用返回，再次发生**上下文切换**。

数据流如下：
![traditional data flow](/src/img/article-img/Handbook/zero%20copy/traditional_data_flow.jpg)

可以发现，其中共涉及到了4次**上下文切换**以及4次数据复制。对于单纯的网络文件发送，有很多不必要的开销。

## `sendfile`传输

对于上述场景，我们发现从**DMA缓冲**到**用户空间**，和从**用户空间**到**套接字缓冲**的两次`CPU`复制是完全没必要的，**零拷贝**由此而生。针对这种情况，`Linux`内核提供了[sendfile](https://man7.org/linux/man-pages/man2/sendfile.2.html)系统调用。如果用`sendfile()`执行上述请求，系统流程可以简化如下：
![sendfile flow](/src/img/article-img/Handbook/zero%20copy/sendfile_flow.jpg)

`sendfile()`系统调用，可以实现数据在`DMA`内部的复制，而不需要将数据copy到**用户空间**。由此，**上下文切换**次数减少为了2次，数据复制次数减少为了3次。这已经实现了**用户空间**的**零拷贝**。

这里有一个问题：为什么`DMA`内部会出现一次复制(此次复制需要`CPU`参与)？这是因为，早期的网卡，要求被发送的数据在物理空间上是连续的，所以，需要有`Socket Buffer`。但是如果网卡本身支持收集操作(scatter-gather)，即可以从不连续的内存地址聚集并发送数据，那么还可以进一步优化。

## 网卡支持`scatter-gather`的`sendfile`传输

在`Linux`内核版本2.4之后对此做了优化，如果计算机网卡支持收集操作，`sendfile()`操作可以省去到`Socket Buffer`的数据复制，取而代之的是，直接将数据位置和长度的描述符(descriptors)，传递给`Socket Buffer`：
![sendfile with gather flow](/src/img/article-img/Handbook/zero%20copy/sendfile_DMA_flow.jpg)

借由网卡的支持，**上下文切换**的次数为2次，数据复制的次数也降低为2次。而这两次的数据复制是必须的，也就是说，数据在**内存中的复制**已经完全避免。
对于从硬盘向网络发送文件的场景，如果网卡支持收集操作，那么`sendfile()`系统调用，真正意义上的做到了**零拷贝**

## 内存映射(mmap)

对于“网络发送文件”的情况，用`sendfile()`系统调用可以极大地提高性能(据测试吞吐量可达传统方式的三倍)。但有一点不足的是，它只支持“读取->发送”这一“连贯操作”，所以，`sendfile()`一般用于处理一些静态网络资源，如果要对数据进行额外的操作，它无能为力。

**内存映射**(Memory mapping--`mmap`)对此提供了解决方案。`mmap`是一种内存映射文件的方法，它可以将一个文件映射到进程的地址空间，实现文件磁盘地址和进程虚拟地址空间中的虚拟地址的对应。如此一来，用户进程可以采用指针读写操作这一段内存，而内核空间对这段区域的修改也直接反映到用户空间。简而言之，`mmap`实现了**用户空间**和**内核空间**数据的共享。可以猜到，如果使用`mmap`系统调用，上文中所述场景的步骤如下：
![mmap flow](/src/img/article-img/Handbook/zero%20copy/mmap_flow.jpg)

用户发起`mmap()`系统调用，`DMA`直接将数据复制到**用户空间**和**内核空间**的共享虚拟内存，之后，用户便可以正常操作数据。期间进行了2次**上下文切换**，1次数据复制。接下来往网卡发送数据的流程，与前面一样采用`write()`系统调用。

数据流如下：
![mmap data flow](/src/img/article-img/Handbook/zero%20copy/mmap_data_flow.jpg)

可以看到，相比于传统的方式，`mmap`省去了一次数据的复制，广义上也可以称之为**零拷贝**。与此同时，它还使得用户可以自定义地操作数据，这是相较于`sendfile`的优势所在。

不过，如果数据量很小(比如`KB`级别)，使用`mmap`的效率反而不如单纯的`read`系统调用高。这是因为`mmap`虽然避免了多余的复制，但是增加了`OS`维护此共享内存的成本。

# NIO中的零拷贝

从1.4版本开始，`JDK`引入了`NIO`，提供了对**零拷贝**的支持。由于`JVM`是运行在`OS`之上的，其功能只是对系统底层api的封装，如果`OS`本身不支持**零拷贝**(`mmap`/`sendfile`)，那`JVM`对此也无能为力。`JDK`对**零拷贝**的封装，主要体现在[FileChannel](https://docs.oracle.com/javase/8/docs/api/java/nio/channels/FileChannel.html)这个类上。

## `map()`方法

`map()`的签名如下：
~~~java
public abstract class FileChannel
    extends AbstractInterruptibleChannel
    implements SeekableByteChannel, GatheringByteChannel, ScatteringByteChannel {

    public abstract MappedByteBuffer map(MapMode mode, long position, long size) throws IOException;
}
~~~

以下引自方法注释：
> Maps a region of this channel's file directly into memory...For most operating systems, mapping a file into memory is more expensive than reading or writing a few tens of kilobytes of data via the usual read and write methods. From the standpoint of performance it is generally only worth mapping relatively large files into memory.

`map()`方法可以直接将一个文件映射到内存中。来简单看看`FileChannelImpl`中方法的具体实现：
~~~java
public class FileChannelImpl extends FileChannel {
    public MappedByteBuffer map(MapMode mode, long position, long size) throws IOException {
        ...
        synchronized (positionLock) {
             ...
            try {
                // 实际调用的是调用map0方法
                addr = map0(imode, mapPosition, mapSize);
            } catch (OutOfMemoryError x) {
                // An OutOfMemoryError may indicate that we've exhausted
                // memory so force gc and re-attempt map
                System.gc();
                ...
            }
        }
        ...
    }
    // Creates a new mapping
    private native long map0(int prot, long position, long length) throws IOException;
}
~~~

最终调用的是一个**native**的`map0()`方法。`solaris`版的方法的源码在[FileChannelImpl.c](https://github.com/frohoff/jdk8u-jdk/blob/master/src/solaris/native/sun/nio/ch/FileChannelImpl.c)中：
~~~c++
JNIEXPORT jlong JNICALL
Java_sun_nio_ch_FileChannelImpl_map0(JNIEnv *env, jobject this,
                                     jint prot, jlong off, jlong len)
{
    ...
    // 发现，内部果然是通过mmap系统调用来实现的
    mapAddress = mmap64(
        0,                    /* Let OS decide location */
        len,                  /* Number of bytes to map */
        protections,          /* File permissions */
        flags,                /* Changes are shared */
        fd,                   /* File descriptor of mapped file */
        off);                 /* Offset into file */

    if (mapAddress == MAP_FAILED) {
        if (errno == ENOMEM) {
            JNU_ThrowOutOfMemoryError(env, "Map failed");
            return IOS_THROWN;
        }
        return handle(env, -1, "Map failed");
    }

    return ((jlong) (unsigned long) mapAddress);
}
~~~

最终`map()`方法会返回一个`MappedByteBuffer`，熟悉`NIO`的同学估计对这个类不会陌生，大名鼎鼎的`DirectByteBuffer`便是它的子类。它引用了一块独立于`JVM`之外的内存，不受`GC`机制所管制，需要自己来管理创建与销毁的操作。

## `transferTo()`方法

`mmap`系统调用有了`Java`版的马甲，那`sendfile`呢？来看看`FileChannel`的`transferTo()`方法，签名如下：
~~~java
public abstract class FileChannel
    extends AbstractInterruptibleChannel
    implements SeekableByteChannel, GatheringByteChannel, ScatteringByteChannel {

    public abstract long transferTo(long position, long count, WritableByteChannel target) throws IOException;
}
~~~

以下引自方法注释：
> Transfers bytes from this channel's file to the given writable byte channel...
This method is potentially much more efficient than a simple loop that reads from this channel and writes to the target channel. Many operating systems can transfer bytes directly from the filesystem cache to the target channel without actually copying them.

后半句其实隐式地说明了，如果操作系统支持“transfer without copying”，`transferTo()`方法就能做到相应的支持。来看看`FileChannelImpl`中方法的实现：
~~~java
public long transferTo(long position, long count, WritableByteChannel target) throws IOException {
    ...
    // Attempt a direct transfer, if the kernel supports it
    // 如果内核支持，采用直接传送的方式
    if ((n = transferToDirectly(position, icount, target)) >= 0)
        return n;

    // Attempt a mapped transfer, but only to trusted channel types
    // 尝试使用mmap传送方式
    // 其实这里也用到了mmap，由于上面已经简要介绍过，故不再展开
    if ((n = transferToTrustedChannel(position, icount, target)) >= 0)
        return n;

    // Slow path for untrusted targets
    // 传统的传送方式
    return transferToArbitraryChannel(position, icount, target);
}
~~~

由注释可以看出来，`sendfile()`调用应该就发生在`transferToDirectly()`方法中，我们进去看看：
~~~java
private long transferToDirectly(long position, int icount, WritableByteChannel target) throws IOException {
    if (!transferSupported)
        return IOStatus.UNSUPPORTED;
    // 一系列检查判断
    ...
    if (nd.transferToDirectlyNeedsPositionLock()) {
        synchronized (positionLock) {
            long pos = position();
            try {
                // 调用的是transferToDirectlyInternal()方法
                return transferToDirectlyInternal(position, icount, target, targetFD);
            } finally {
                position(pos);
            }
        }
    } else {
        // 调用的是transferToDirectlyInternal()方法
        return transferToDirectlyInternal(position, icount, target, targetFD);
    }
}

private long transferToDirectlyInternal(long position, int icount, WritableByteChannel target, FileDescriptor targetFD) throws IOException {
    try {
        begin();
        ti = threads.add();
        if (!isOpen())
            return -1;
        do {
            // 转到native方法transferTo0()
            n = transferTo0(fd, position, icount, targetFD);
        } while ((n == IOStatus.INTERRUPTED) && isOpen());
        ...
        return IOStatus.normalize(n);
    } finally {
        threads.remove(ti);
        end (n > -1);
    }
}

// Transfers from src to dst, or returns -2 if kernel can't do that
private native long transferTo0(FileDescriptor src, long position, long count, FileDescriptor dst);
~~~

可见，最终`transferTo()`方法还是需要委托给`native`的方法`transferTo0()`来完成调用，此方法的源码依然在[FileChannelImpl.c](https://github.com/frohoff/jdk8u-jdk/blob/master/src/solaris/native/sun/nio/ch/FileChannelImpl.c)中：
~~~c++
JNIEXPORT jlong JNICALL
Java_sun_nio_ch_FileChannelImpl_transferTo0(JNIEnv *env, jobject this,
                                            jobject srcFDO,
                                            jlong position, jlong count,
                                            jobject dstFDO)
{
    jint srcFD = fdval(env, srcFDO);
    jint dstFD = fdval(env, dstFDO);

#if defined(__linux__)
    off64_t offset = (off64_t)position;
    // 果然，内部确实是sendfile()系统调用
    jlong n = sendfile64(dstFD, srcFD, &offset, (size_t)count);
    ...
    return n;
#elif defined (__solaris__)
    sendfilevec64_t sfv;
    size_t numBytes = 0;
    jlong result;

    sfv.sfv_fd = srcFD;
    sfv.sfv_flag = 0;
    sfv.sfv_off = (off64_t)position;
    sfv.sfv_len = count;
    // 果然，内部确实是sendfile()系统调用
    result = sendfilev64(dstFD, &sfv, 1, &numBytes);

    /* Solaris sendfilev() will return -1 even if some bytes have been
     * transferred, so we check numBytes first.
     */
    ...
    return result;
...
~~~

果不其然，最终方法还是通过`sendfile()`系统调用来达到传输的目的。注意，由于`sendfile()`只适用于往`Socket Buffer`发送数据，所以，通过**零拷贝**技术来提升性能，只能用于网络发送数据的场景。什么意思呢？如果单纯的用`transferTo()`把数据从硬盘上的一个文件写入到另一个文件中，是没有性能提升效果的，详见[SendFile and transferTo in Java](https://stackoverflow.com/questions/32606000/sendfile-and-transferto-in-java)和[Most efficient way to copy a file in Linux](https://stackoverflow.com/questions/7463689/most-efficient-way-to-copy-a-file-in-linux)。

# Netty中的零拷贝

分析完了`Linux`内核和`JVM`层面的**零拷贝**，再来看看`Netty`中的**零拷贝**又是怎么回事。

类似的，由于`Netty`是构建在`NIO`之上的一个高性能网络IO框架，它也支持系统层面的**零拷贝**。举一个简单的例子，`DefaultFileRegion`类可以进行高效的网络文件传输，因为它封装了`NIO`中`FileChannel`的`transferTo()`方法：
~~~java
public class DefaultFileRegion extends AbstractReferenceCounted implements FileRegion {
    private FileChannel file;

    public long transferTo(WritableByteChannel target, long position) throws IOException {
        long count = this.count - position;
        if (count < 0 || position < 0) {
            throw new IllegalArgumentException(
                    "position out of range: " + position +
                    " (expected: 0 - " + (this.count - 1) + ')');
        }
        if (count == 0) {
            return 0L;
        }
        if (refCnt() == 0) {
            throw new IllegalReferenceCountException(0);
        }
        open();
        // 方法内部调用的是FileChannel的transferTo方法，
        // 可以得到系统层面零拷贝的支持
        long written = file.transferTo(this.position + position, count, target);
        if (written > 0) {
            transferred += written;
        }
        return written;
    }
}
~~~

那是不是`Netty`中所谓的**零拷贝**，完全依赖于系统支持呢？其实，**零拷贝**在`Netty`中还有另外一层意义：防止`JVM`中不必要的内存复制。

[Netty in Action](https://www.manning.com/books/netty-in-action)第5.1节是这么介绍**ByteBuf API**的：
> Transparent zero-copy is achieved by a built-in composite buffer type.

通过内置的**composite buffer**实现了透明的**零拷贝**，什么意思呢？`Netty`将物理上的多个`Buffer`组合成了一个逻辑上完整的`CompositeByteBuf`，它一般用在需要合成多个`Buffer`的场景。这在网络编程中很常见，如一个完整的`http`请求常常会被分散到多个`Buffer`中。用`CompositeByteBuf`很容易将多个分散的`Buffer`组装到一起，而无需额外的复制：
~~~java
ByteBuf header = Unpooled.buffer();// 模拟http请求头
ByteBuf body = Unpooled.buffer();// 模拟http请求主体
CompositeByteBuf httpBuf = Unpooled.compositeBuffer();
// 这一步，不需要进行header和body的额外复制，httpBuf只是持有了header和body的引用
// 接下来就可以正常操作完整httpBuf了
httpBuf.addComponents(header, body);
~~~

![compositeByteBuf](/src/img/article-img/Handbook/zero%20copy/compositeByteBuf.jpg)


反观`JDK`的实现`ByteBuffer`是如何完成这一需求的：
~~~java
ByteBuffer header = ByteBuffer.allocate(1024);// 模拟http请求头
ByteBuffer body = ByteBuffer.allocate(1024);// 模拟http请求主体

// 需要创建一个新的ByteBuffer来存放合并后的buffer信息，这涉及到复制操作
ByteBuffer httpBuffer = ByteBuffer.allocate(header.remaining() + body.remaining());
// 将header和body放入新创建的Buffer中
httpBuffer.put(header);
httpBuffer.put(body);
httpBuffer.flip();
~~~

相比于`JDK`，`Netty`的实现更合理，省去了不必要的内存复制，可以称得上是`JVM`层面的**零拷贝**。除此之外，整个`ByteBuf`的**API**都贯穿了**零拷贝**的设计理念：尽量避免`Buffer`复制带来的开销。比如关于**派生缓冲区**(Derived buffers)的操作，`duplicate()`(复制)，`slice()`(切分)，`order()`(排序)等，虽然都会返回一个新的`ByteBuf`实例，但它们只是具有自己独立的读索引、写索引和标记索引而已，内部存储(`Buffer`数据)是共享的，也就是过程中并没有复制操作。由此带来的一个负面影响是，使用这些操作的时候需要注意：修改原对象会影响派生对象，修改派生对象也会影响原对象。

# 总结

- 由于`Linux`系统中**内核空间**和**用户空间**的区别，数据的读取和发送需要有内存中的复制。`mmap`系统调采用**内存映射**的方式，让**内核空间**和**用户控件**共享同一块内存，省去了从**内核空间**往**用户空间**复制的开销。`sendfile`系统调用可以将文件直接从硬盘经由`DMA`传输到**套接字缓冲区**，而无需经过**用户空间**。如果网卡支持收集操作(scatter-gather)，那么可以做到真正意义上的**零拷贝**。
- `NIO`中`FileChannel`的`map()`和`transferTo()`方法封装了底层的`mmap`和`sendfile`系统调用，从而在`Java`语言上提供了系统层面**零拷贝**的支持。
- `Netty`通过封装，也可以支持系统级别的**零拷贝**。此外，`Netty`中的**零拷贝**有另一层应用层面的含义：设计良好的`ByteBuf` API，防止了`JVM`内部不必要的`Buffer`复制。

# 参考

[Efficient data transfer through zero copy](https://developer.ibm.com/articles/j-zerocopy/)
[Netty in Action](https://www.manning.com/books/netty-in-action)