---
layout: post
title: 解决pyinstaller打包的程序无法执行，提示Operation not permitted
date: 2020-02-16
categories:
  - QuickNote
tags:
  - python
  - fstab
---

# 前言

[PyInstaller](http://www.pyinstaller.org/)是一个强大的工具，它可以分析我们的python脚本，发现脚本执行所依赖的模块，并将他们打包到一个文件夹，或者封装成一个可执行文件(exe或者binary)。然后，我们就可以将这个文件(文件夹)放到其他机器上去执行，目标机器甚至可以不用安装python环境！这跟**docker**有异曲同工之妙。

# 问题描述

在*Centos7*上，用**PyInstaller**将*py*文件打成一个binary，把该可执行文件放到其他的*Centos7*上去执行，结果报如下的错误：
> error while loading shared libraries: libz.so.1: failed to map segment from shared object: Operation not permitted

# 问题定位

一般**Operation not permitted**都是权限不足导致的，但是看了一下文件，是有**执行**(x)的权限的。
把这个文件放到其他的机器上去执行，发现有的机器可以跑，有的机器不能跑！所以肯定是机器配置上的差异。

回到**PyInstaller**官网，看到如下介绍：
> The bootloader is the heart of the one-file bundle also. When started it creates a temporary folder in the appropriate temp-folder location for this OS. The folder is named _MEIxxxxxx, where xxxxxx is a random number.
> In GNU/Linux and related systems, it is possible to mount the /tmp folder with a “no-execution” option. That option is not compatible with a PyInstaller one-file bundle. It needs to execute code out of /tmp.

可见，可执行文件在执行的时候，会去/tmp目录下创建一个临时文件夹*_MEIxxxxxx*，里面包含了运行时需要的类库。当程序执行完毕，临时文件夹会自动被删除。
所以，我们必须保证对/tmp目录需要有可执行的权限。于是用*mount*命令查看了一下有问题的机器：
~~~shell
[root@localhost ~]# mount | grep noexec
/dev/sda1 on /boot type ext4 (rw,noexec,nosuid,nodev)
/dev/sda5 on /tmp type ext4 (rw,noexec,nosuid,nodev)
~~~

果不其然，/tmp目录被打上了**noexec**的flag。这个flag的意思是，在此目录下的所有文件都不能被执行。
一般/tmp目录的权限是很大的，都是*777*，所以通常是很多黑客或者是恶意程序的攻击对象。如果将/tmp目录以**noexec**的形式来mount，可以很好的保护计算机。

# 问题解决

究其根源，是/tmp目录缺少可执行权限，导致程序运行所需的lib库没法生成。这里有两个解决方案

1. 用如下命令，将/tmp目录的**noexec**改成**exec**:
> mount -o remount,exec /tmp

2. 如果/tmp目录确实需要用**noexec**加以保护，那可以在**PyInstaller**打包的时候，加上*--runtime-tmpdir*参数，用以显示指定临时lib库存放的目录。这样的话，程序就不会用/tmp目录而改用显示指定的目录。

# 总结

当运行程序报**Operation not permitted**错误时，不仅需要考虑程序本身是否有可执行权限，还要查看看文件系统是否以**noexec**形式mount了。该问题不仅出现在**PyInstaller**中，在**docker**中也很常见。

# 参考

[PyInstaller](https://pyinstaller.readthedocs.io/en/stable/operating-mode.html)
[fstab](https://en.wikipedia.org/wiki/Fstab)