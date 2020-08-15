---
layout: post
title: 自定义Classloader导致ClassCastException，不要轻易破坏双亲委派模型
date: 2020-08-15
categories:
  - Notebook
tags:
  - Java
  - Exception
  - Classloader
  - Pf4j
---

# 背景

~~~
java.lang.ClassCastException: cn.com.nightfield.Plugin cannot be cast to cn.com.nightfield.Plugin
~~~
相同的`class`，竟然不能cast？这是什么鬼？

# 问题描述

自定义类加载器(`Classloader`)是很常见的，它可以让我们从自定义的**文件系统目录**，**网络**甚至是**数据库**的各种文件类型(`jar`, `war`, `zip`等)中加载`class`文件。
我们项目中使用了一个开源的类管理工具[PF4J](https://github.com/pf4j/pf4j)，来加载指定目录下的`class`文件。但奇怪的是，当我们把`class`加载进来之后，将它强转为目标类型，却报了`java.lang.ClassCastException`，两者明明是同一个`class`！

# 问题分析

先说明，错误是跟自定义类加载器有关。上一个小demo来模拟一下上述错误：
~~~java
package cn.com.nightfield.jvm.classloader;
// 在class path下定义一个类
public class Plugin {}
~~~
~~~java
package cn.com.nightfield.jvm.classloader;

import java.net.URL;
import java.net.URLClassLoader;
// 自定义一个类加载器
public class CustomizedClassLoader extends URLClassLoader {

    public CustomizedClassLoader(URL[] urls) {
        super(urls);
    }

    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        synchronized (getClassLoadingLock(name)) {
            // 如果不是自定义目录下的class，统一委托给AppClassloader去加载
            if (!name.startsWith("cn.com.nightfield.jvm.classloader")) {
                return super.loadClass(name, resolve);
            }
            // 如果是自定义目录下的class，直接加载，此处违反了双亲委派模型
            else {
                Class<?> c = findClass(name);
                if (resolve) {
                    resolveClass(c);
                }
                return c;
            }
        }
    }
}
~~~
~~~java
package cn.com.nightfield.jvm.classloader;

import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;

public class ClassLoaderTest {
    public static void main(String[] args) throws ClassNotFoundException, IllegalAccessException, InstantiationException, MalformedURLException {
        // 指定类加载器的加载路径
        URL url = new File("/Users/zhochi/demo/target/classes").toURI().toURL();
        ClassLoader customizedClassLoader = new CustomizedClassLoader(new URL[]{url});
        // 用自定义类加载器加载Plugin class
        Class clz = customizedClassLoader.loadClass("cn.com.nightfield.jvm.classloader.Plugin");
        System.out.println(clz.getClassLoader());
        Object pluginInstance = clz.newInstance();
        // pluginInstance instanceof Plugin”输出false
        System.out.println("pluginInstance instanceof Plugin: " + (pluginInstance instanceof Plugin));
        // 报java.lang.ClassCastException错误
        Plugin plugin = (Plugin) clz.newInstance();
    }
}
~~~

控制台输出如下：
~~~
cn.com.nightfield.jvm.classloader.CustomizedClassLoader@60e53b93
pluginInstance instanceof Plugin: false
Exception in thread "main" java.lang.ClassCastException: cn.com.nightfield.jvm.classloader.Plugin cannot be cast to cn.com.nightfield.jvm.classloader.Plugin
	at cn.com.nightfield.jvm.classloader.ClassLoaderTest.main(ClassLoaderTest.java:19)
~~~

要想知道错误的根源，需要了解对象可以被cast的前提：对象必须是目标类的实例。从上述输出也可以看到，`instance instanceof Plugin`的结果是`false`，为什么呢？因为对于任意一个类，都需要由它的类加载器和这个类本身，共同确立其在`JVM`中的唯一性，也就是说，`JVM`中两个类是否相等，首先要看它们是不是由同一个类加载器加载的。如果不是的话，即使这两个类来自于同一个`class`文件，它们也不相等。

上例中，`Plugin`类处于`class path`下，默认是由`AppClassloader`来加载的；但是`pluginInstance`却是由`CustomizedClassLoader`加载出来的`class`的实例。`JVM`尝试将`CustomizedClassLoader.Plugin`转成`AppClassloader.Plugin`，必然会报错。

# 问题解决

其实究其原因，是我们在自定义类加载器`CustomizedClassLoader`中，违反了**双亲委派模型**。
我们都知道，`Java`中有三大类加载器：`BootstrapClassLoader`，`ExtClassLoader`和`AppClassLoader`，它们在组合上构成**父子关系**，前者是后者的"父亲"，并且有各自的“领地”：`BootstrapClassLoader`负责加载 `Java`核心类库如`JRE`中的`rt.jar`，`resource.jar`；`ExtClassLoader`负责加载`{java.home}/lib/ext`和`java.ext.dirs`系统目录下的`class`；`AppClassLoader`则是加载`class path`路径下，也就是我们自己写的`class`文件。
所谓**双亲委派模型**，指的是当`Classloader`收到一个加载`class`请求的时候，首先会委托给其父亲去加载，如果父亲加载不成功，自己才会尝试去加载。**双亲委派**的机制是`JVM`中类的安全性的一大保障：就算有人恶意自定义了一个`String.class`，最终由类加载器加载到的依然是`rt.jar`中的`String`。以下是`loadClass`的部分源码：
~~~java
public abstract class ClassLoader {
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        synchronized (getClassLoadingLock(name)) {
            // 1. 如果类已经被加载过了，直接返回
            Class<?> c = findLoadedClass(name);
            if (c == null) {
                try {
                    // 2. 委托父类去加载
                    if (parent != null) {
                        c = parent.loadClass(name, false);
                    } else {
                        // 这种情况指的就是委托BootstrapClassLoader去加载
                        c = findBootstrapClassOrNull(name);
                    }
                } catch (ClassNotFoundException e) {
                    // ClassNotFoundException thrown if class not found
                    // from the non-null parent class loader
                }

                if (c == null) {
                    // 3. 尝试自己加载
                    c = findClass(name);
                }
            }
            if (resolve) {
                resolveClass(c);
            }
            return c;
        }
    }
~~~

不过，**双亲委派模型**并不是一个强制的约束，而是`Java`推荐的模式，所以我们在自定义类加载器的时候，推荐重写`findClass()`方法，而不是`loadClass()`方法。

回到最开始的问题，分析了一下`PF4J`的源码，可以猜到，它也定义了自己的类加载器[PluginClassLoader](https://github.com/pf4j/pf4j/blob/master/pf4j/src/main/java/org/pf4j/PluginClassLoader.java)，且它重写的`loadClass()`方法的默认实现，为了防止`class`的版本问题，违反了**双亲委派模型**。

# 总结

`Java`中的类加载器，相当于是其加载的`class`的命名空间，两个类相等，首先要保证它们是由同一个类加载器加载的。
在实现自定义类加载器的时候，除非你对类加载机制有着深刻的认知且知道自己在做什么，否则不要违反**双亲委派模型**。