---
layout: post
title: SpringBoot服务无法读取系统变量，我重新认识了profile和bashrc
date: 2020-03-07
categories:
  - Troubleshooting
tags:
  - Linux Service
---

# 背景

*CentOS*服务器上，我们用**Systemd**部署了一个*SpringBoot*服务。关于如何部署，可以参考[这篇文章](https://nightfield.com.cn/index.php/archives/93/)。这个*SpringBoot*服务会用`ProcessBuilder`去调用机器上一个`C++`的可执行文件。

# 问题描述

*SpringBoot*程序跑得很正常，但是我们发现`C++`程序却没有*log*输出，也就是说它从没被执行过。
查看了`ProcessBuilder`的返回值，是**127**。**127**的意思是**系统找不到对应的命令**。于是我们把`C++`程序对应的目录(里面包括第三方动态链接库)添加到了`LD_LIBRARY_PATH`。怎么添加的呢？我们在`~/.bash_profile`脚本中添加了命令：
~~~bash
export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/path/to/cppFoler/
~~~

经过测试，*SpringBoot*服务依然无法成功调用`C++`程序，依然返回**127**。但奇怪的是，当我们直接使用`java -jar`命令，并且用`nohup`的方式令*SpringBoot*程序跑在后台，可以正常调用`C++`程序：
~~~bash
nohup java -jar mySpringBoot.jar
~~~

# 问题分析

这里就不得不说*Linux*中`nohup`与`service`的区别了。
- `nohup`: 在*linux*中，我们通过终端(`shell`)登陆机器，会有一个进程与`shell`关联。当我们退出的时候(如`Ctrl+C`)，会向该进程发送一个`SIGHUP`信号，进程收到信号便会自动被销毁。`nohup`命令的作用，是将shell中产生的输出(`stdout`)和错误(`stderr`)重定向到文件`nohup.out`中。当我们退出shell的时候，`nohup`会忽略`SIGHUP`信号，让相关联的程序继续运行。由此看出，`nohup`进程是一次性的，其本质就是**让程序在原先的`shell`进程中继续运行**。
- `service`: 服务是一种后台守护进程，不与任何终端(`shell`)关联。它是系统的一部分，可以被`service`或`systemctl`命令方便的管理。`service`的具体的启动过程可以参考[这篇文章](https://web.archive.org/web/20120328110436/http://www.steve.org.uk/Reference/Unix/faq_2.html#SEC16)。

回到我们的问题，`nohup`的方式可以工作，而`service`不行，说明前面设置的`LD_LIBRARY_PATH`参数只对`nohup`生效，对`service`无效。这让我去重新学习了*CentOS*中`~/.bash_profile`脚本，以及相关的`/etc/profile`，`~/.bashrc`和`/etc/bashrc`。
- `/etc/profile`: 脚本设置了一些**系统级别**的环境变量，它会在有用户通过终端登陆的时候被执行，做一些初始化操作。初始化时，它会去`/etc/profile.d/`目录下，去逐个执行`.sh`文件。所以，与其直接修改`/etc/profile`文件，不如将自定义脚本放在`/etc/profile.d/`下面。
该脚本只会在**交互式登陆终端(interactive - login shell)**启动的时候运行，也就是它只在用户登陆的时候运行一次。以下摘自文件的注释
> System wide environment and startup programs, for login setup. Functions and aliases go in /etc/bashrc. It's NOT a good idea to change this file unless you know what you are doing. It's much better to create a custom.sh shell script in /etc/profile.d/ to make custom changes to your environment, as this will prevent the need for merging in future updates.
- `/etc/bashrc`: 脚本和`/etc/profile`类似。区别是，`/etc/bashrc`更侧重的是**系统级别**的别名(alias)。而且，该脚本只会在**交互式非登陆终端(interactive - non-login shell)**启动的时候运行，即在每次新打开一个`shell`的时候，都会执行一遍。以下摘自文件的注释
> System wide functions and aliases, Environment stuff goes in /etc/profile.

- `~/.bash_profile`: 作用和`/etc/profile`一样，只不过作用范围只是当前用户
- `~/.bashrc`: 作用和`/etc/bashrc`一样，只不过作用范围只是当前用户

到这里，问题已经明朗了，我们在`~/.bash_profile`中设置的环境变量，只对`shell`所对应的进程生效，而对后台的`service`无效。当用`nohup`方式执行程序的时候，因为还是在`shell`对应的线程中，所以可以正常读到设置的环境变量。

# 问题解决

解决办法是，给`service`独立设置环境变量。这里有两种方式。

## 1. Systemd Environment

在**Systemd Service**的配置文件中，显示指定**Environment**参数，来设置`service`运行时的环境变量，如：
~~~
[Unit]
Description=My SpringBoot Service
After=syslog.target

[Service]
User=nightfield
ExecStart=/path/to/mySpringBoot.jar
SuccessExitStatus=143
Restart=always
RestartSec=5
Environment="LD_LIBRARY_PATH=/path/to/cppFoler/"

[Install]
WantedBy=multi-user.target
~~~

这样，`service`运行的时候，就可以正确读到对应的变量。

## 2. ProcessBuild中指定environment()

`ProcessBuild`可以通过`environment()`方法，设置*process*运行的环境参数：
~~~java
ProcessBuilder pb = new ProcessBuilder("java -version");
Map<String, String> env = pb.environment();
env.put("LD_LIBRARY_PATH", "/path/to/cppFoler/");
Process p = pb.start();
~~~

# 总结

通过这个问题，更深刻地学习了`nohup`和`service`的区别，`profile`与`bashrc`的适用场景。