---
layout: post
title: Linux的内存管理机制
date: 2019-06-08
categories:
  - Translate
tags:
  - Linux Kernel
---

本文翻译自[The Linux Documentation Project](https://www.tldp.org/)中的[Memory Management](https://www.tldp.org/LDP/tlk/mm/memory.html)。

# Linux的内存管理

内存管理系统(memory management subsystem)是操作系统中非常重要的一个模块。一个长久以来的需求是，应用程序需要比物理内存更大的存储空间。为突破这一限制，人们开发出了一些应对策略，其中最成功的当属虚拟内存(virtual memory)。通过在进程之间共享虚拟内存，使得系统“看上去”有更多的存储空间。

虚拟内存不仅仅“扩展”了系统的内存，它还带来了以下一些便利：
- 更大的地址空间：使得系统“看上去”有更大的内存，一般虚拟内存可以是实际内存的数倍大小。
- 写入保护：系统中的每个进程都有自己的虚拟地址空间(virtual address space)。这些虚拟地址空间是彼此独立的，因此应用程序的进程间不会相互影响。同样的，硬件的虚拟内存*制也给内存区域给予保护以防止恶意写入。
- 内存映射(Memory Mapping)：内存映射可以将数据文件映射到进程地址空间(process address space)，文件的内容直接链接到进程的虚拟地址空间。
- 公平分配物理内存：内存管理系统允许每个进程公平地分配系统的物理内存。
- 共享虚拟内存(Shared Virtual Memory)：尽管虚拟内存允许进程具有单独的(虚拟)地址空间，然而进程间共享内存也是必要的。例如，系统中可能有多个`bash shell`进程，与其给每个进程分配一个虚拟地址空间副本，不如让所有`bash`进程共享一个内存空间。进程间共享代码的另一个常见的例子是动态库(Dynamic libraries)。另外，共享内存还可以用作进程间通信(Inter Process Communication--`IPC`)机制，多个进程可以通过共享内存来交换信息。`Linux`支持**Unix TM System V**的共享内存进程间通信。

# 1 虚拟内存的抽象模型

![Abstract model of Virtual to Physical address mapping](/src/img/article-img/Translate/Virtual_physical_address_mapping.jpg)

我们先来学习一个简单的抽象模型，这有助于理解`Linux`是如何支持**虚拟内存**的。

程序执行时，`CPU`会从内存中读取指令并将它解码。解码过程中，它还会从内存的指定位置获取或存储数据，`CPU`在执行完该指令后会继续获取下一个程序指令。由此往复，`CPU`总是在从内存中获取指令，或者在与内存交互存取数据。在**虚拟内存**系统中，所有地址都是虚拟的，而不是物理地址。`CPU`会根据操作系统维护的表(table)中保存的信息，将虚拟地址转换为物理地址。为方便此转换，虚拟和物理内存都被分为了一个个小块，称之为页(page)，页的大小都是相同的，以方便操作系统管理。在`Alpha AXP`系统上，`Linux`页大小为**8KB**；在`Intel x86`系统上，页大小为**4KB**。每个页都有一个唯一的编号，称之为页帧号(page frame number，以下简称`PFN`)。在此模型中，虚拟地址由两部分组成：偏移量(offset)和虚拟页帧号(virtual page frame number，以下简称`VPFN`)。如果页的大小为**4KB**，则虚拟地址的第0-11位(bit)表示偏移量，第12位之上部分表示虚拟页帧号。当`CPU`碰到虚拟地址时，为了访问对应的物理页，需要从虚拟地址中得到偏移量以及`VPFN`，然后查找页表(page table)以获取其物理地址。

图1中展示了两个进程(X和Y)的虚拟地址空间，每个进程都有自己独立的页表。页表会将进程的虚拟页映射到内存中的物理页。如图1所示：进程X编号为0的`VPFN`映射到了物理页帧号(physical page frame number)1，进程Y编号为1的`VPFN`映射到了编号为4的`PFN`。理论上页表的每一个页表项(entry)都包含以下信息：
- 有效标识(Valid Flag)：表示此页表项是否有效。
- 此页表项所对应的物理页帧号`PFN`。
- 访问控制信息(Access Control Information)：描述了页的使用方式，即是否可写，以及是否包含可执行代码等。

页表用`VPFN`作为偏移量，例如`VPFN5`将是表中的第六个元素(下标从0开始)。
注：本人对这一段内容有疑虑，原文为：The page table is accessed using the virtual page frame number as an offset. Virtual page frame 5 would be the 6th element of the table (0 is the first element).

为了将虚拟地址转换成物理地址，`CPU`需要从物理页中计算出`VPFN`和偏移量。为方便使用位操作以提高计算效率，页的大小一般都是2的幂次。如图1中，假设页大小为`0x2000B`(十进制的`8192B`)，在进程Y中有一个虚拟地址为`0x2194`，那么`CPU`会将该地址转换为偏移量`0x194`，虚拟页帧1--`VPFN1` (`0x2194` = `0x2000`*1 + `0x194`)。

`CPU`将`VPFN`作为索引去进程的页表中获取对应的页表项，如果页表项是无效的(invalid)，说明进程访问了其虚拟内存不存在的区域，这种情况下，`CPU`无法解析地址，需要抛给操作系统来处理。这一般被称作缺页异常(page fault)，通常虚拟地址和缺页异常的原因也会通知给操作系统；如果此页表项是有效的(valid)，`CPU`会取出对应的物理页帧号`PFN`，并将其乘以页的大小，再加上偏移量，便可以得到物理内存中该页的地址。还是拿图1举例子：进程Y的`VPFN1`映射到了`PFN4`，也就是地址`0x8000`(4 * `0x2000`)，再加上偏移量`0x194`最终可以得到物理地址为`0x8194`。

通过这种映射的方式，虚拟内存可以以任意顺序映射到系统的物理页。如图1，进程X的`VPFN0`映射到`PFN1`，而`VPFN7`映射到`PFN0`(映射关系是无顺序的)。这说明了虚拟内存的一个有趣的特点：虚拟内存的页不需要以任何特定顺序出现在物理内存中。

## 1.1 按需取页(Demand Paging)

操作系统必须高效地使用物理内存，因为它比虚拟内存要小得多。一种节省内存开销的方法是，只加载应用程序正在使用的虚拟页。例如，对于数据库程序来说，只需要加载被`SQL`语句查询到的数据即可，而不需要加载整个数据库到内存。这种当数据被访问时，才将虚拟页加载进内存的技术，被称为按需取页(demand paging)。

当进程尝试访问未加载进内存的虚拟地址时，`CPU`便无法找到所对应的虚拟页的页表项(table entry)。如图1中，进程X的页表中没有2号`VPFN`的页表项，因此，进程X无法获取2号`VPFN`中对应的物理地址，因为`CPU`无法完成对应的转换。当这种情况发生的时候，`CPU`会给操作系统发送一个缺页异常(page fault)。如果报告异常的的虚拟地址是无效的，则意味着该进程访问了不不合法的地址，这一般发生在应用程序出错的情况下，如往内存的随机地址写值。此时，操作系统会终止此程序以保护其他进程免受侵害。如果报告异常的虚拟地址有效，但其对应的物理页不在内存中，则操作系统需要将相应的页从磁盘上加载到内存中。相对而言，磁盘访问比较耗时，所以过程中`CPU`可以运行其他任务。新加载的物理页会被写入到一个空闲的物理页帧中，同时页表中会加入一个新的页表项来维护物理页与虚拟页的对应关系。此后，`CPU`便可以完成虚拟地址到物理地址的正常转换，程序也得以从缺页中断处继续运行。

`Linux`使用按需取页的方式将可执行文件加载到进程虚拟内存中。每当执行一个命令，该命令所对应的文件会被打开，其内容也会被映射到程序虚拟内存中，这通常被称为内存映射(memory mapping)。然而，实际上只有文件的开头部分被加载进了物理内存，其余的数据仍在磁盘上。随着程序的执行，它不断产生缺页异常，系统便使用进程的内存映射来寻找对应地址的数据，并载入内存以供执行。

## 1.2 交换(Swapping)

如果进程需要将虚拟页载入物理内存，但没有可用的物理页时，操作系统需要丢弃其他物理页以腾出空间。如果被丢弃的物理页尚未被写入(未被修改)，则可以直接将其丢弃，如果进程再次需要该页，需要将其重新加载回内存中；如果物理页已被修改，则操作系统必须保留该页的内容，以备后续访问。这种类型的页被称为脏页(dirty page)，当它从内存中删除时，会被保存在一种特殊的文件中，称为交换文件(swap file)。相对于`CPU`和内存的速度，访问交换文件的时间非常长，所以操作系统必须兼顾将页写入磁盘的场景以及将其保留在内存中以便再次使用的场景。

决定物理页丢弃还是交换的算法叫做交换算法(the swap algorithm)，如果算法效率不高，则会发生抖动(thrashing)的情况。该种情况下，页会被不断写入磁盘，又被读回内存，操作系统便会因为太繁忙而无法执行实际工作，所以一般定期会被访问的物理页不应该被交换到硬盘。

进程当前正在使用的页集合称为工作集(working set)。一个好的交换算法应该确保所有进程的工作集都在物理内存中。`Linux`采用最近最少使用(LRU)策略来选择需要移除的页。在该策略下，每个页都有一个年龄(age)，当页面被访问后，年龄会被更新，于是越常被访问的页越年轻，而年老的页，则更适合被交换(移除)。

## 1.3 共享虚拟内存(Shared Virtual Memory)

虚拟内存可以让进程间共享内存。每个进程都有自己独立的页表，不同进程的页表项，可以指向同一个物理页。如图1中，进程X和Y共享了物理页帧`PFN4`。

## 1.4 寻址模式(Physical and Virtual Addressing Modes)

在虚拟内存中运行操作系统是不合理的，因为操作系统给自己也维护一个页表将复杂。目前多数现代`CPU`都支持两种寻址模式：物理寻址模式(physical address mode)和虚拟寻址模式(virtual address mode)。物理寻址模式不需要页表，`CPU`也不需要任何地址转换操作。`Linux`内核就是被链接为在物理地址空间中运行的。

The Alpha AXP processor does not have a special physical addressing mode. Instead, it divides up the memory space into several areas and designates two of them as physically mapped addresses. This kernel address space is known as KSEG address space and it encompasses all addresses upwards from 0xfffffc0000000000. In order to execute from code linked in KSEG (by definition, kernel code) or access data there, the code must be executing in kernel mode. The Linux kernel on Alpha is linked to execute from address 0xfffffc0000310000.

## 1.5 访问控制(Access Control)

The page table entries also contain access control information. As the processor is already using the page table entry to map a processes virtual address to a physical one, it can easily use the access control information to check that the process is not accessing memory in a way that it should not.

There are many reasons why you would want to restrict access to areas of memory. Some memory, such as that containing executable code, is naturally read only memory; the operating system should not allow a process to write data over its executable code. By contrast, pages containing data can be written to but attempts to execute that memory as instructions should fail. Most processors have at least two modes of execution: kernel and user. You would not want kernel code executing by a user or kernel data structures to be accessible except when the processor is running in kernel mode.

# 2 缓存(Caches)

应用上述理论模型开发的系统，确实可以正常运行，但是运行效率不会太高。事实上，无论是操作系统设计者，还是`CPU`工程师，都努力地在提升系统的性能，除了提高`CPU`，内存，硬盘等的访问速度之外，最佳的方式是使用缓存，从而使某些操作更迅速。`Linux`使用了一些与内存管理相关的缓存。

#### 缓冲区缓存(Buffer Cache)

缓冲区缓存包含了块设备驱动程序(block device drivers)的数据缓冲。这些缓冲区大小是固定的(如`512B`)，并包含已从块设备(block device)中读取或正在写入的块信息。块设备是指只能读写固定大小数据块来访问的设备----所有的硬盘均为块设备。缓冲区缓存通过设备标识符(device identifier)和块号(block number)建立索引，用于数据块的快速查找。数据如果可以在此缓存中找到，便无需从物理块设备(如硬盘)中加载，以此提高访问速度。

- 页缓存(Page Cache)
**页缓存**用来加快对磁盘数据的访问。当页从磁盘读入内存时，会被缓存在**页缓存**中。文件的逻辑内容按页的方式缓存，并可以通过文件和偏移量进行访问。

- 交换缓存(Swap Cache)
只有被修改了的页(脏页)会保存在**交换文件**中。如果某页被写入**交换文件**之后没有修改，则当出现**换页**需求时，可以简单地将该页丢弃。在有大量**换页**操作的系统中，这可以节省许多不必要和昂贵的磁盘操作。

- 硬件缓存(Hardware Caches)
`CPU`中通常会使用**硬件缓存**：缓存**页表项**。在`CPU`读取**页表**时，会缓存对应的**页表项**。下次`CPU`再需要读取某个地址，如果可以在缓存中找到，就不需要再读**页表**了。这种缓存通常被叫做**页表缓存**(Translation Look-aside Buffers，以下简称`TLB`)，可能来自于多个进程。当程序引用了虚拟地址，`CPU`首先尝试在`TLB`中查找对应项，若成功找到，则可以将虚拟地址直接转换为物理地址。

使用缓存的缺点是，为了节省精力，`Linux`系统需要使用更多的时间和空间来维护这些缓存。并且如果缓存损坏之后，系统会崩溃。

# 3 Linux页表

![Three Level Page Tables](/src/img/article-img/Translate/Three_Level_Page_Table.jpg)

`Linux`假定页表分为三个级别。每一级页表都包含下一级页表的`PFN`。如图2所示，虚拟地址被分为多个段，每个段上的值代表了到下一级页表的偏移量。全局页目录(Page Global Directory，简称`PGD`)上记录了所有页表的索引。要将虚拟地址转换为物理地址，`CPU`需要获取每个级别上的偏移量值，从`PGD`中读取下一级页表的页帧号。如此重复操作3次，直到找到所要找的物理页`PFN`为止。虚拟地址中的最后一个段，用于查找页内的数据。平台需要给`Linux`内核(kernel)提供遍历进程页表的转换宏(translation macros)，这样，内核无需知道平台页表项的格式，无论是有三个级别页表的`Alpha`处理器，还是有三个级别页表的`Intel x86`处理器，`Linux`内核可以使用统一的代码来处理。

# 4 页的分配与解除(Page Allocation and Deallocation)

