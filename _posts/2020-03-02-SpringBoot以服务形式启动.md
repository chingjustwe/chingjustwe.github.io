---
layout: post
title: SpringBoot以服务形式启动，并设置JVM启动参数
date: 2020-03-03
categories:
  - Handbook
tags:
  - Java
  - SpringBoot
---

# 1 概述

*SpringBoot*使得我们可以快速地上手以及开发Spring项目。我们可以把工程打成一个*jar*包，然后部署到服务器上(这里只讨论Linux，因为没多少人会拿Windows当服务器)。**nohup**命令可以让程序作为后台进程执行，但是它不好管理维护，也显得很不专业。更好的方法是将*SpringBoot*作为*Service*启动。

# 2 步骤

## 2.1 Maven打包

通过*package*命令打*jar*包：
~~~
mvn clean package
~~~

这里注意一点，一定要将**org.springframework.boot** plugin添加到*pom*文件里面，其中“<executable>true</executable>”一定要加，标示该*jar*为可执行，否则机器启动*SpringBoot*服务会报错。plugin如下所示：
~~~xml
<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
            <configuration>
                <executable>true</executable>
            </configuration>
        </plugin>
    </plugins>
</build>
~~~

## 2.2 配置SpringBoot服务

要将程序注册成服务，必须保证*jar*有执行(下面例子中的**x**)的权限，否则服务无法启动。

~~~shell
[nightfield@mthf2mulsvr001 ~]$ ls -l
total 10904
-rwx------. 1 nightfield nightfield 11164464 Mar  5 13:01 myApp.jar
~~~

有两种比较主流的方式配置*springBoot*服务

#### 2.2.1 System V Init服务

**System V Init**服务都在目录/etc/init.d/下面。只需在此目录下创建一个到*SpringBoot Jar*的链接，就可以注册Service。假设我们的*jar*的目录为/home/nightfield/myApp.jar：
~~~shell
sudo ln -s /home/nightfield/myApp.jar /etc/init.d/myApp
~~~

这里，必须指定*jar*的绝对路径。
然后，我们就可以通过如下命令来启动服务了：
~~~shell
sudo service myApp start
~~~

这个服务以那个用户来运行，取决于jar包所属的用户。在该例子中，jar包属于用户*nightfield*，那么它将以*nightfield*用户来运行。
~~~shell
[nightfield@mthf2mulsvr001 ~]$ ps -ef | grep myApp
nightfi+ 19741     1  0 13:44 ?        00:00:00 /bin/bash /home/nightfield/myApp.jar
nightfi+ 19756 19741 99 13:44 ?        00:00:16 /usr/bin/java -Dsun.misc.URLClassPath.disableJarChecking=true -jar /home/nightfield/myApp.jar
nightfi+ 19851  7759  0 13:45 pts/0    00:00:00 grep --color=auto myApp
~~~

可以看到，应用正以*nightfield*用户跑在后台，其实服务只是以下命令的包装：
~~~shell
/usr/bin/java -Dsun.misc.URLClassPath.disableJarChecking=true -jar /home/nightfield/myApp.jar
~~~

同时，服务对应的**PID**会放在/var/run/myApp/myApp.pid，而程序运行的日志则放在/var/log/myApp.log。

#### 2.2.2 Systemd服务

**Systemd**服务的目录在/etc/systemd/system/，我们需要在此目录下创建一个名叫**myApp.service**的文件，并将如下内容写入文件：
~~~
[Unit]
Description=My Spring Boot Service
After=syslog.target
 
[Service]
User=nightfield
ExecStart=/home/nightfield/myApp.jar SuccessExitStatus=143 
 
[Install] 
WantedBy=multi-user.target
~~~

这里要把*ExecStart*和*Descriptino*改成自己的，把*ExecStart*指定到*jar*所在的目录，一样，也需要文件的绝对路径。同时别忘了设置**myApp.service**的执行权限。
服务启动命令为：
~~~shell
sudo systemctl start myApp
~~~

将服务设置为开机启动：
~~~shell
sudo systemctl enable myApp
~~~

**Systemd**作为后起之秀，功能更加强大，支持的命令和参数也更多，具体可以参考[这里](https://www.freedesktop.org/software/systemd/man/systemd.service.html)。

# 3 自定义JVM参数

如果是用*java -jar*的方式启动的*java*应用，我们可以直接在命令行中指定*JVM*参数，那以Service形式启动的Java程序，该如何指定*JVM*参数呢？
一般，我们在用*maven*编*jar*包的时候，可以指定*JVM*参数，比如用如下方式:
~~~shell
mvn clean package -DargLine="-Xmx1024m" 
~~~

但是如果我们希望在服务器上独立额外设置一些参数呢？
其实也很简单，在启动*SpringBoot*服务之前，会先去*jar*包所在的同级目录下查找，有没有此*jar*的**同名配置文件**。在这里，我们只需要在/home/nightfield/目录下，添加一个叫*myApp.conf*的配置文件(名字要和*jar*的名字相同)，在文件里面自定义*JVM*参数**JAVA_OPTS**：
~~~shell
[nightfield@mthf2mulsvr001 ~]$ pwd
/home/nightfield
[nightfield@mthf2mulsvr001 ~]$ ls -l
total 27532
-rwx------. 1 nightfield nightfield       39 Mar  5 14:10 myApp.conf
-rwx------. 1 nightfield nightfield 28186505 Mar  5 13:12 myApp.jar
[nightfield@mthf2mulsvr001 ~]$ cat myApp.conf 
export JAVA_OPTS="-Xmx4096m -Xms4096m"
[nightfield@mthf2mulsvr001 ~]$ 
~~~

添加配置文件之后，重启服务，再次查看服务进程：
~~~shell
[nightfield@mthf2mulsvr001 bin]$ ps -ef | grep myApp
ciscowe+ 11343     1  0 14:13 ?        00:00:00 /bin/bash /homt/nightfield/myApp.jar
ciscowe+ 11358 11343 48 14:13 ?        00:00:38 /usr/bin/java -Dsun.misc.URLClassPath.disableJarChecking=true -Xmx4096m -Xms4096m -jar /homt/nightfield/myApp.jar
nightfi+ 11908 11884  0 14:14 pts/0    00:00:00 grep --color=auto myApp
~~~

可以看到，*Java*进程的启动参数上多了“-Xmx4096m -Xms4096m”。

# 4 总结

本文介绍了将*SpringBoot*在*Linux*下作为服务启动的两种方式，同时介绍了自定义*JVM*启动参数的方法。

# 5 参考

[Spring Boot Application as a Service](https://www.baeldung.com/spring-boot-app-as-a-service)
[Deploying Spring Boot Applications](https://docs.spring.io/spring-boot/docs/current/reference/html/deployment.html#deployment-install)