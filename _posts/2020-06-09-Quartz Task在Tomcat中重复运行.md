---
layout: post
title: Quartz Task在Tomcat中重复运行
date: 2020-06-09
categories:
  - Troubleshooting
tags:
  - Spring
  - Quartz
---

# 问题描述

[Spring Quartz](https://docs.spring.io/spring-boot/docs/2.0.0.M3/reference/html/boot-features-quartz.html)是很常用的定时任务框架。把一个`Quartz`的工程部署到`Tomcat`中启动，意外地发现，每个`Task`都在同一时间跑了两次，而本地在开发的过程中却没有问题。

# 问题排查

为了防止多线程问题，有部分`Task`上是加了锁的，类似如下方式：
~~~java
@Component
public class ExampleTask{
	private ReentrantLock lock = new ReentrantLock();
    protected void executeInternal(){
    	if (lock.tryLock()) {
            try {
                // task main logic
            } finally {
                lock.unlock();
            }
        }
    }
}
~~~

按理说，`Spring`中`Bean`默认是单例的，加了锁之后，同一时间，只会有一个线程能拿到锁，然后执行`Task`的逻辑才对。难道锁不生效？于是我们又新增了类似如下日志，把`ReentrantLock`对象和`this`都打印出来：
~~~java
logger.info("lock: " + lock + ", this: " + this);
~~~

得到：
~~~
2020-05-12 06:26:40 INFO  ExampleTask:30 - 7db46a61-e1e6-4d26-a038-d2f6721f70ac|lock: java.util.concurrent.locks.ReentrantLock@1cd8d32a[Unlocked], this: cn.com.nightfield.ExampleTask@121f2ec1
2020-05-12 06:26:40 INFO  ExampleTask:30 - 51afa06a-7d61-493c-943d-6e1f8c2ecc79|lock: java.util.concurrent.locks.ReentrantLock@7e7aab34[Unlocked], this: cn.com.nightfield.ExampleTask@70bd5a8b
~~~

表示震惊：`ReentrantLock`和`this`竟然都不是同一个实例！
于是我们大致可以有一个结论：应该是工程跑了两遍导致的。果然，在**log**中看到，`QuartzScheduler`被初始化了两次：
~~~
......
2020-05-12 06:26:23 INFO  QuartzScheduler:240 - Quartz Scheduler v.2.2.1 created.
2020-05-12 06:26:23 INFO  RAMJobStore:155 - RAMJobStore initialized.
......
2020-05-12 06:26:28 INFO  QuartzScheduler:240 - Quartz Scheduler v.2.2.1 created.
2020-05-12 06:26:28 INFO  RAMJobStore:155 - RAMJobStore initialized.
......
~~~

自然的，把目标放到了`Tomcat`身上。

检查了一下`server.xml`文件：
~~~xml
<Host name="localhost" appBase="webapps" unpackWARs="true" autoDeploy="true">
	<Context path="nightfield" docBase="/usr/local/tomcat/webapps/nightfield" debug="0" reloadable="false"/>
    <Valve className="org.apache.catalina.valves.AccessLogValve" directory="logs"
            prefix="localhost_access_log" suffix=".txt"
            pattern="%h %l %u %t &quot;%r&quot; %s %b" />
</Host>
~~~

问题就出在这里：我们把工程放到了`Tomcat`的`webapps`下面，而且把`autoDeploy`设成了**true**。
根据`Tomcat`官网对[Automatic Application Deployment](https://tomcat.apache.org/tomcat-7.0-doc/config/host.html#Automatic_Application_Deployment)的介绍，当`autoDeploy`是**true**的时候，`Tomcat`会起线程监控`appBase`下的文件变化，当检测到有文件变化的时候，工程会被重新加载(reload)或被重新部署(redeploy)。所以在`autoDeploy`模式下，工程目录(`docBase`)需要指定在`appBase`目录之外：
> When using automatic deployment, the docBase defined by an XML Context file should be outside of the appBase directory. If this is not the case, difficulties may be experienced deploying the web application or the application may be deployed twice. The deployIgnore attribute can be used to avoid this situation.

> Note that if you are defining contexts explicitly in server.xml, you should probably turn off automatic application deployment or specify deployIgnore carefully. Otherwise, the web applications will each be deployed twice, and that may cause problems for the applications.

#### 3. 问题解决

有了官网的指导，问题解决也就很简单了，有三种方法：
1. 把工程放到`webapps`外面：
~~~xml
<Context path="nightfield" docBase="/usr/local/nightfield" debug="0" reloadable="false"/>
~~~
2. 把`appBase`设置成空：
~~~xml
<Host name="localhost" appBase="" unpackWARs="true" autoDeploy="true">
~~~
3. 把`autoDeploy`设成**false**，顺便把`deployOnStartup`也设置成**false**
~~~xml
<Host name="localhost" appBase="webapps" unpackWARs="true" autoDeploy="false" deployOnStartup="false">
~~~

# 总结

一般情况下，`Tomcat`的`autoDeploy`功能在开发过程中很有用，能节省调试过程中重启服务的时间；但是在服务器环境上，推荐关闭此功能。不当的使用，可能会使服务多次部署，导致无法预料的bug。

