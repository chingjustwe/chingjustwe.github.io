---
layout: post
title: 解决Unable to open debugger port错误
date: 2020-01-02
categories: 
  - Notebook
tags: 
  - IDE
  - Exception
  - Tomcat
---

# 原因

**IntelliJ** Debug模式下，启动**Tomcat**报错**Unable to open debugger port**
![Error](/src/img/article-img/Notebook/UnableToOpenDebugPort/unable_open_debug_port.png)

可能的原因有二：

> 1. 目标端口被占用
> 2. 文件权限不足

# 解决

## 目标端口占用

这种情况比较常见。**Tomcat**启动需要监听一个端口，如果此端口正好被别的程序占用了，就会报这个错。有两个办法可以解决问题：
#### 1. 调整端口：

> Run/Debug Configuration -> Tomcat Server -> Startup/Connection -> Debug -> Port

按上述步骤找到Debug的端口，将之改成其他端口即可
![Error](/src/img/article-img/Notebook/UnableToOpenDebugPort/change_port.png)

2. 关闭占用端口程序。各OS都有自己查看端口占用进程的方式，kill掉目标程序即可。

## 文件权限不足

如果第一种方法不起作用，那很可能是由于文件操作权限不足导致的，多见于**Mac**或者**Ubuntu**用户。
一般这种情况**Intellij**的**Event Log**还会报类似的错
> Cannot run program "/software/tomcat8_1/bin/catalina.sh" (in directory "/software/tomcat8_1/bin"): error=13, Permission denied

说明是当前用户没有操作**Tomcat**的权限。要启动tomcat，至少需要**执行**权限，即**x**的权限。所以对于这种情况，给**Tomcat**的*bin*目录下文件加**执行**权限即可：
~~~shell
chmod a+x /software/tomcat8_1/bin/*
~~~