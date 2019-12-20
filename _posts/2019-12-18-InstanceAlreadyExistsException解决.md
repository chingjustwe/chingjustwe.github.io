---
layout: post
title: InstanceAlreadyExistsException的解决方案
date: 2019-12-18
categories:
  - Notebook
tags:
  - Java
  - Exception
  - Jmx
---

# 背景

## JMX

Java Coder们都知道，Java提供了**JMX(Java Management Extensions) attach**的机制(如JConsole)，可以动态获取JVM运行时的一些信息。我们可以自定义MBean，来暴露指定的一些参数值，如DB连接数等。为方便故障排查，我们添加了一些DB相关的metrics，于是在Spring配置文件里面添加了如下代码
~~~xml
<bean id="jmxExporter" class="org.springframework.jmx.export.MBeanExporter" lazy-init="false" depends-on="dataSource">
    <property name="beans">
        <map>
            <entry key="Catalina:type=DataSource" value="#{dataSource.createPool().getJmxPool()}"/>
        </map>
    </property>
</bean>
~~~

**MBeanExporter**是Spring提供的一个工具类，可以用来注册自定义的MBean，只需要将目标类以map键值对的形式添加到**beans**这个属性里面。通过Jmx我们可以访问到MBean上的Public参数，从而拿到运行时的metrics。
![MBean](/src/img/article-img/Notebook/InstanceAlreadyExistsException/MBean.png)
上述是JConsole的一个截图，最后一个Tab就是由JDK默认暴露出来的一些MBean的信息。

## 问题描述

通过Spring的**MBeanExporter**注册自定义的MBean到JVM，结果工程启动报错，堆栈如下：
~~~java
org.springframework.beans.factory.BeanCreationException: Error creating bean with name 'jmxExporter' defined in class path resource [applicationContext.xml]: Invocation of init method failed; nested exception is org.springframework.jmx.export.UnableToRegisterMBeanException: Unable to register MBean [org.apache.tomcat.jdbc.pool.jmx.ConnectionPool@265c255a] with key 'Catalina:type=DataSource'; nested exception is javax.management.InstanceAlreadyExistsException: Catalina:type=DataSource
        at org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory.initializeBean(AbstractAutowireCapableBeanFactory.java:1553)
        at org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory.doCreateBean(AbstractAutowireCapableBeanFactory.java:539)
        at org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory.createBean(AbstractAutowireCapableBeanFactory.java:475)
        at org.springframework.beans.factory.support.AbstractBeanFactory$1.getObject(AbstractBeanFactory.java:304)
        at org.springframework.beans.factory.support.DefaultSingletonBeanRegistry.getSingleton(DefaultSingletonBeanRegistry.java:228)
        at org.springframework.beans.factory.support.AbstractBeanFactory.doGetBean(AbstractBeanFactory.java:300)
        at org.springframework.beans.factory.support.AbstractBeanFactory.getBean(AbstractBeanFactory.java:195)
        at org.springframework.beans.factory.support.DefaultListableBeanFactory.preInstantiateSingletons(DefaultListableBeanFactory.java:703)
        at org.springframework.context.support.AbstractApplicationContext.finishBeanFactoryInitialization(AbstractApplicationContext.java:760)
        at org.springframework.context.support.AbstractApplicationContext.refresh(AbstractApplicationContext.java:482)
        at org.springframework.web.context.ContextLoader.configureAndRefreshWebApplicationContext(ContextLoader.java:403)
        at org.springframework.web.context.ContextLoader.initWebApplicationContext(ContextLoader.java:306)
        at org.springframework.web.context.ContextLoaderListener.contextInitialized(ContextLoaderListener.java:106)
        at org.apache.catalina.core.StandardContext.listenerStart(StandardContext.java:4792)
        at org.apache.catalina.core.StandardContext.startInternal(StandardContext.java:5256)
        at org.apache.catalina.util.LifecycleBase.start(LifecycleBase.java:150)
        at org.apache.catalina.core.ContainerBase$StartChild.call(ContainerBase.java:1420)
        at org.apache.catalina.core.ContainerBase$StartChild.call(ContainerBase.java:1410)
        at java.util.concurrent.FutureTask.run(FutureTask.java:266)
        at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1142)
        at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:617)
        at java.lang.Thread.run(Thread.java:745)
~~~

# 分析

报的异常是**InstanceAlreadyExistsException**。找到MBeanExporter的源码：
~~~java
public class MBeanExporter extends MBeanRegistrationSupport
		implements MBeanExportOperations, BeanClassLoaderAware, BeanFactoryAware, InitializingBean, DisposableBean {
	  // 自定义的MBean，放在一个Map里面保存
	  private Map<String, Object> beans;

	  public void setBeans(Map<String, Object> beans) {
		    this.beans = beans;
	  }
}
~~~

它实现了**InitializingBean**接口，该接口只有一个方法**afterPropertiesSet()**。作为Spring生命周期的重要一环，当Spring Bean实例化好并且设置好属性之后，会调用这个方法：
~~~java
@Override
public void afterPropertiesSet() {
    // 确保MBeanServer存在，所有的MBean都是依附于MBeanServer的
    if (this.server == null) {
        this.server = JmxUtils.locateMBeanServer();
    }
    try {
        logger.info("Registering beans for JMX exposure on startup");
        // 调用registerBeans方法，注册配置文件中的Beans
        registerBeans();
        registerNotificationListeners();
    }
    catch (RuntimeException ex) {
        // 如果出错，将bean注销
        unregisterNotificationListeners();
        unregisterBeans();
        throw ex;
    }
}
~~~

可以看到，最终会走到**registerBeans()**方法，去注册Spring配置文件中的Bean。中间省略注册的一部分过程，只看最终部分代码，最终会走到父类**MBeanRegistrationSupport**的**doRegister()**方法：
~~~java
public class MBeanRegistrationSupport {
    // registrationPolicy默认是FAIL_ON_EXISTING，也就是当重复注册的时候，会失败
    private RegistrationPolicy registrationPolicy = RegistrationPolicy.FAIL_ON_EXISTING;

    protected void doRegister(Object mbean, ObjectName objectName) throws JMException {
        ObjectName actualObjectName;

        synchronized (this.registeredBeans) {
            ObjectInstance registeredBean = null;
            try {
                // 真正注册MBean的地方，将此MBean注册给MBeanServer
                registeredBean = this.server.registerMBean(mbean, objectName);
            }
            // 当重复MBean重复注册的时候，会抛出InstanceAlreadyExistsException异常
            catch (InstanceAlreadyExistsException ex) {
                // 当抛出重复注册异常的时候会ignore，单单打印一个日志
                if (this.registrationPolicy == RegistrationPolicy.IGNORE_EXISTING) {
                    logger.debug("Ignoring existing MBean at [" + objectName + "]");
                }
                // 当重复注册的时候，会替换掉原有的
                else if (this.registrationPolicy == RegistrationPolicy.REPLACE_EXISTING) {
                    try {
                        logger.debug("Replacing existing MBean at [" + objectName + "]");
                        // 将原有的MBean注销掉
                        this.server.unregisterMBean(objectName);
                        // 注册新的MBean
                        registeredBean = this.server.registerMBean(mbean, objectName);
                    }
                    catch (InstanceNotFoundException ex2) {
                        logger.error("Unable to replace existing MBean at [" + objectName + "]", ex2);
                        throw ex;
                    }
                }
                else {
                    throw ex;
                }
            }
        }
  	}
}
~~~

真正注册MBean的地方是**MBeanServer**的**registerMBean()**方法，这里不展开细说，最终MBean会放在一个Map里面，当要注册的MBean的key已经存在的时候，会抛出**InstanceAlreadyExistsException**异常。

**MBeanRegistrationSupport**中有一个重要参数**registrationPolicy**，有三个值分别是**FAIL_ON_EXISTING**(出异常时注册失败)，**IGNORE_EXISTING**(忽略异常)和**REPLACE_EXISTING**(出异常时替换原有的)，而默认值是**FAIL_ON_EXISTING**，也就是说，当出现MBean重复注册的时候，会将异常**InstanceAlreadyExistsException**直接抛出去。

确实，由于项目需要，我们的Tomcat里面配置了两个工程实例，导致了MBean注册冲突。

# 问题解决

## 1. 确认重复注册的MBean
找到重复注册的MBean，确认是不是真的有必要存在。如果不是，可以通过修改配置或者删除多余的MBean实例。

## 2. 修改registrationPolicy
对于通过**MBeanExporter**注册的case，修改了上述**registrationPolicy**为就能解决问题，如修改为**IGNORE_EXISTING**:
~~~xml
<bean id="jmxExporter" class="org.springframework.jmx.export.MBeanExporter" lazy-init="false" depends-on="dataSource">
    <property name="registrationPolicy" value="IGNORE_EXISTING"></property>
    <property name="beans">
        <map>
            <entry key="Catalina:type=DataSource" value="#{dataSource.createPool().getJmxPool()}"/>
        </map>
    </property>
</bean>
~~~

如果是通过注解的形式注入的，也可以手动调用**MBeanExporter**的**setRegistrationPolicy()**方法。

## 3. 关闭Jmx功能
在Java6之后，Jmx是默认打开的。如果你确实不需要这个功能，name可以将它关闭。如Spring boot工程可以在application.properties中添加以下配置来关闭：
> spring.jmx.enabled = false

或者参考[这篇](https://docs.oracle.com/javadb/10.10.1.2/adminguide/radminjmxdisable.html)文档。

## 4. 将MBean注册到不同的domain name
MBeanServer注册MBean的时候可以指定一个**domain name**，对应一个命名空间，
~~~java
public interface MBeanServer extends MBeanServerConnection {
    // name变量即为domain name
    public ObjectInstance registerMBean(Object object, ObjectName name) throws InstanceAlreadyExistsException, MBeanRegistrationException, NotCompliantMBeanException;
}
~~~
如**MBeanExporter**中只需将MBean的**Key**值设置成唯一的便可以。
如spring boot可以在application.properties中添加以下配置设置domain name：
> spring.jmx.default_domain = custom.domain

其他情况可以参考[这里](https://stackoverflow.com/questions/20669928/is-it-possible-to-create-jmx-subdomains)

# 总结

其实**InstanceAlreadyExistsException**是一个比较普遍的问题，通常是由于在同一个JVM Instance中注册了多个相同Key的MBean导致的，因为同一个Tomcat实例里面只允许存在一个相同的MBean。

如果是配置错误导致Instance启动了多次，则要找到相关的错误配置。如果是需要起多个Instance，则可以通过**关闭Jmx**，**修改registrationPolicy**或**将MBean注册到不同的domain name**来解决错误。