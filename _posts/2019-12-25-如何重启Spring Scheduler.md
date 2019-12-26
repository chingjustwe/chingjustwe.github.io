---
layout: post
title: 如何重启Spring Scheduler
date: 2019-12-25
categories:
  - Handbook
tags:
  - Java
  - Spring
  - Scheduler
---

# 背景

定时任务是一个比较常见的功能，在某些情况下，需要重新启动或者是重设Scheduler Job，但是官方的API上都没有提供类似**restart**的方法，那该如何完成此需求呢？

# 方案

## Spring Quartz

[Spring Quartz](http://www.quartz-scheduler.org/documentation/)是一整套完整的**Cron Job**架构，可以完成复杂的任务调度需求，支持任务持久化，事务化，甚至分布式。如果是基于**Spring Quartz**做的Scheduler，那么重启比较简单，Task的管理类[Scheduler](https://javadoc.io/doc/org.quartz-scheduler/quartz/latest/index.html)**提供了非常多的方法，如*scheduleJob*，*unscheduleJob*，*rescheduleJob*，*deleteJob*，*addJob*等，通过这些方法的组合就以达到**重启**的目的，参考[此回答](https://stackoverflow.com/questions/15020625/quartz-how-to-shutdown-and-restart-the-scheduler)。

## Spring Scheduler

**Spring Scheduler**相对于**Spring Quartz**来说更简单，不需要额外引入**Quartz**的包，能够实现简单的任务调度功能。它内部基于**JDK**的定时任务线程池**ScheduledExecutorService**实现，由类**ScheduledTaskRegistrar**来负责定时任务的注册，类**TaskScheduler**负责对**JDK**类**ScheduledExecutorService**的包装

![Scheduler Process](/src/img/article-img/Handbook/restart%20scheduler/Scheduler.jpg)

Spring创建Schedle有两种比较常见的方式：
> 1. 标注**@Scheduled**注解
> 2. 实现**SchedulingConfigurer**接口

#### 实现SchedulingConfigurer接口的方式

**SchedulingConfigurer**接口只有一个方法，用来做定时任务的定制化。以下是一个简单例子

~~~java
@Configuration      
@EnableScheduling   //开启定时任务
public class DynamicScheduleTask implements SchedulingConfigurer {

    @Override
    public void configureTasks(ScheduledTaskRegistrar taskRegistrar) {
        // 手动配置，添加任务
        taskRegistrar.addTriggerTask(...);
        taskRegistrar.scheduleCronTask(...);
    }
}
~~~

用这种方式，因为可以拿到任务注册类**ScheduledTasksRegistrar**，重启任务也比较简单。
**ScheduledTasksRegistrar**提供了*getScheduledTasks*方法，可以拿到所有注册上来的任务信息，**ScheduledTask**包装了**Task**的**Future**信息。只要便利这些task，逐个调用*cancel*方法，即可停止任务。

~~~java
Set<ScheduledTask> tasks = taskRegistrar.getScheduledTasks();
for (ScheduledTask task : tasks) {
    task.cancel();
}
~~~

然后再通过**ScheduledTaskRegistrar**重新设置任务即可。

#### 标注@Scheduled注解的方式

用注解的方式配置定时任务，这种方法很方便，使用也比较广泛，只需在任务入口方法上添加一个注解，如

~~~java
@Configuration
@EnableScheduling
public class ScheduleTask {
    // execute every 10 sec
    @Scheduled(cron = "0/10 * * * * ?")
    private void configureTasks() {
        System.out.println("task executing...");
    }
}
~~~

这种方式使用简单，是因为Spring屏蔽了很多实现细节。**SchedulingConfiguration**会创建一个**ScheduledAnnotationBeanPostProcessor**，在这个BeanPostProcessor里面会新建一个**ScheduledTasksRegistrar**，然后自动完成任务的配置。

![Annotation Based Process](/src/img/article-img/Handbook/restart%20scheduler/AnnotationScheduler.jpg)

在这种方案里面要实现重启，有一个大困难：无法拿到**ScheduledTasksRegistrar**：

~~~java
@Configuration
@Role(2)
public class SchedulingConfiguration {
    @Bean(name = {"org.springframework.context.annotation.internalScheduledAnnotationProcessor"})
    @Role(2)
    public ScheduledAnnotationBeanPostProcessor scheduledAnnotationProcessor() {
        // 创建基于Annotation配置的BeanPostProcessor
        return new ScheduledAnnotationBeanPostProcessor();
    }
}

public class ScheduledAnnotationBeanPostProcessor implements ScheduledTaskHolder, MergedBeanDefinitionPostProcessor, DestructionAwareBeanPostProcessor, Ordered, EmbeddedValueResolverAware, BeanNameAware, BeanFactoryAware, ApplicationContextAware, SmartInitializingSingleton, ApplicationListener<ContextRefreshedEvent>, DisposableBean {
    private final ScheduledTaskRegistrar registrar;
    // 默认的构造方法中，新建类了一个ScheduledTaskRegistrar
    // 然而并没有将之注册到Spring Context里面，所以没法拿到它
    public ScheduledAnnotationBeanPostProcessor() {
        this.registrar = new ScheduledTaskRegistrar();
    }
}
~~~

当然也可以先拿到**ScheduledAnnotationBeanPostProcessor**，然后通过反射获取私有属性**registrar**，之后做法同上一种方案，这种比较*hacker*的做法这里不考虑。那在这种情况下该怎么重启呢？

看了一下**ScheduledAnnotationBeanPostProcessor**的源码，这个类实现在工程启动的时候调用**ScheduledTasksRegistrar**去注册并启动定时任务，在工程关闭的时候会关闭并销毁定时任务：

~~~java
// 该类初始化之后调用
// 这个Bean变量，一般是标记了@Scheduled的Task类
public Object postProcessAfterInitialization(Object bean, String beanName) {
    if (!(bean instanceof AopInfrastructureBean) && !(bean instanceof TaskScheduler) && !(bean instanceof ScheduledExecutorService)) {
        Class<?> targetClass = AopProxyUtils.ultimateTargetClass(bean);
        // 找到标注了@Scheduled的方法
        Map<Method, Set<Scheduled>> annotatedMethods = MethodIntrospector.selectMethods(targetClass, (method) -> {
            Set<Scheduled> scheduledMethods = AnnotatedElementUtils.getMergedRepeatableAnnotations(method, Scheduled.class, Schedules.class);
            return !scheduledMethods.isEmpty() ? scheduledMethods : null;
        });
        // 遍历方法，配置定时任务
        annotatedMethods.forEach((method, scheduledMethods) -> {
            scheduledMethods.forEach((scheduled) -> {
                // 真正配置定时任务的地方
                this.processScheduled(scheduled, method, bean);
            });
        });

        return bean;
    } else {
        return bean;
    }
}

// 该类销毁之前调用
public void postProcessBeforeDestruction(Object bean, String beanName) {
    Set tasks;
    // 将定时任务从Collection中移除
    synchronized(this.scheduledTasks) {
        tasks = (Set)this.scheduledTasks.remove(bean);
    }

    // cancel task
    if (tasks != null) {
        Iterator var4 = tasks.iterator();

        while(var4.hasNext()) {
            ScheduledTask task = (ScheduledTask)var4.next();
            task.cancel();
        }
    }
}
~~~

有没有发现，如果要重启task，其实只要调用一下这两个方法就可以了！以下是实现的具体逻辑

~~~java
public class SchedulerServiceImpl {

    // 得到BeanPostProcessor
    @Autowired
    private ScheduledAnnotationBeanPostProcessor postProcessor;

    public void restartAllTasks() {
        // 拿到所有的task(带包装)
        Set<ScheduledTask> tasks = postProcessor.getScheduledTasks();
        Set<Object> rawTasks = new HashSet<>(tasks.size());
        for (ScheduledTask task : tasks) {
            Task t = task.getTask();
            ScheduledMethodRunnable runnable = (ScheduledMethodRunnable) t.getRunnable();
            Object taskObject = runnable.getTarget();
            // 将task所关联的对象放到Set中(就是带@Scheduled方法的类)
            rawTasks.add(taskObject);
        }

        // 调用postProcessBeforeDestruction()方法，将task移除并cancel
        for (Object obj : rawTasks) {
            postProcessor.postProcessBeforeDestruction(obj, "scheduledTasks");
        }

        // 调用postProcessAfterInitialization()方法重新schedule task
        for (Object obj : rawTasks) {
            postProcessor.postProcessAfterInitialization(obj, "scheduledTasks");
        }
    }
}
~~~

想不到，原以为最复杂的情况，只需要调用Spring提供的方法就能完成目的。可见Spring设计得多巧妙。