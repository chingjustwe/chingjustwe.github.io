# 背景

我们有一个Plugin的管理系统，可以实现Jar包的热装载，内部是基于一个Plugin管理类库[PF4J](https://github.com/pf4j/pf4j)，类似于**OSGI**，现在是GitHub上一个千星项目。
以下是该类库的官网介绍
> A plugin is a way for a third party to extend the functionality of an application. A plugin implements extension points declared by application or other plugins. Also a plugin can define extension points. With PF4J you can easily transform a monolithic java application in a modular application.

大致意思就是，**PF4J**可以动态地加载Class文件。同时，它还可以实现动态地卸载Class文件。

# 问题描述

有个新需求，热更新Plugin的版本。也就是说，将已经被load进**JVM**的旧Plugin版本ubload掉，然后load新版本的Plugin。**PF4J**工作得很好。为了防止过期的Plugin太多，每次更新都会删除旧版本。然而，奇怪的事发生了：
> - 调用File.delete()方法返回true，但是旧文件却还在
> - 手动去删除文件，报*进程占用*的错误
> - 当程序结束JVM退出之后，文件就跟着没了

以下是简单的测试代码，目前基于**PF4j**版本*3.0.1*：
~~~java
public static void main(String[] args) throws InterruptedException {
    // create the plugin manager
    PluginManager pluginManager = new DefaultPluginManager();
    // start and load all plugins of application
    Path path = Paths.get("test.jar");
    pluginManager.loadPlugin(path);
    pluginManager.startPlugins();

    // do something with the plugin

    // stop and unload all plugins
    pluginManager.stopPlugins();
    pluginManager.unloadPlugin("test-plugin-id");
    try {
        // 这里并没有报错
        Files.delete(path);
    } catch (IOException e) {
        e.printStackTrace();
    }

    // 文件一直存在，直到5s钟程序退出之后，文件自动被删除
    Thread.sleep(5000);
}
~~~

去google了一圈，没什么收获，反而在**PF4J**工程的**Issues**里面，有人报过相同的[Bug](https://github.com/pf4j/pf4j/issues/217)，但是后面不了了之被Close了。

# 问题定位

看来只能自己解决了。
从上面的代码可以看出，**PF4J**的Plugin管理是通过**PluginManager**这个类来操作的。该类定义了一系列的操作：**getPlugin()**, **loadPlugin()**, **stopPlugin()**, **unloadPlugin()**...

## unloadPlugin

核心代码如下：
~~~java
private boolean unloadPlugin(String pluginId) {
    try {
        // 将Plugin置为Stop状态
        PluginState pluginState = this.stopPlugin(pluginId, false);
        if (PluginState.STARTED == pluginState) {
            return false;
        } else {
            // 得到Plugin的包装类(代理类)，可以认为这就是Plugin类
            PluginWrapper pluginWrapper = this.getPlugin(pluginId);
            // 删除PluginManager中对该Plugin各种引用，方便GC
            this.plugins.remove(pluginId);
            this.getResolvedPlugins().remove(pluginWrapper);
            // 触发unload的事件
            this.firePluginStateEvent(new PluginStateEvent(this, pluginWrapper, pluginState));
            // 热部署的一贯作风，一个Jar一个ClassLoader：Map的Key是PluginId，Value是对应的ClassLoader
            // ClassLoader是自定义的，叫PluginClassLoader
            Map<String, ClassLoader> pluginClassLoaders = this.getPluginClassLoaders();
            if (pluginClassLoaders.containsKey(pluginId)) {
                // 将ClassLoader的引用也删除，方便GC
                ClassLoader classLoader = (ClassLoader)pluginClassLoaders.remove(pluginId);
                if (classLoader instanceof Closeable) {
                    try {
                        // 将ClassLoader给close掉，释放掉所有资源
                        ((Closeable)classLoader).close();
                    } catch (IOException var8) {
                        throw new PluginRuntimeException(var8, "Cannot close classloader", new Object[0]);
                    }
                }
            }

            return true;
        }
    } catch (IllegalArgumentException var9) {
        return false;
    }
}

public class PluginClassLoader extends URLClassLoader {
}
~~~

代码逻辑比较简单，是标准的卸载Class的流程：将Plugin的引用置空，然后将对应的**ClassLoader** close掉以释放资源。这里特别要注意，这个ClassLoader是**URLClassLoader**的子类，而**URLClassLoader**实现了**Closeable**接口，可以释放资源，如有疑惑可以参考[这篇]([https://blogs.oracle.com/corejavatechtips/closing-a-urlclassloader](https://blogs.oracle.com/corejavatechtips/closing-a-urlclassloader)
)文章。
类卸载部分，暂时没看出什么问题。

## loadPlugin

加载Plugin的部分稍复杂，核心逻辑如下
~~~java
protected PluginWrapper loadPluginFromPath(Path pluginPath) {
    // 得到PluginDescriptorFinder，用来查找PluginDescriptor
    // 有两种Finder，一种是通过Manifest来找，一种是通过properties文件来找
    // 可想而知，这里会有IO读取操作
    PluginDescriptorFinder pluginDescriptorFinder = getPluginDescriptorFinder();
    // 通过PluginDescriptorFinder找到PluginDescriptor
    // PluginDescriptor记录了Plugin Id，Plugin name， PluginClass等等一系列信息
    // 其实就是加载配置在Java Manifest中，或者plugin.properties文件中关于plugin的信息
    PluginDescriptor pluginDescriptor = pluginDescriptorFinder.find(pluginPath);

    pluginId = pluginDescriptor.getPluginId();
    String pluginClassName = pluginDescriptor.getPluginClass();

    // 加载Plugin
    ClassLoader pluginClassLoader = getPluginLoader().loadPlugin(pluginPath, pluginDescriptor);
    // 创建Plugin的包装类(代理)，这个包装类包含Plugin相关的所有信息
    PluginWrapper pluginWrapper = new PluginWrapper(this, pluginDescriptor, pluginPath, pluginClassLoader);
    // 设置Plugin的创建工厂，后续Plugin的实例是通过工厂模式创建的
    pluginWrapper.setPluginFactory(getPluginFactory());

    // 一些验证
    ......

    // 将已加载的Plugin做缓存
    // 可以跟上述unloadPlugin的操作可以对应上
    plugins.put(pluginId, pluginWrapper);
    getUnresolvedPlugins().add(pluginWrapper);
    getPluginClassLoaders().put(pluginId, pluginClassLoader);

    return pluginWrapper;
}
~~~

有四个比较重要的类
> 1. PluginDescriptor：用来描述Plugin的类。一个**PF4J**的Plugin，必须在Jar的**Manifest**(pom的"manifestEntries"或者"MANIFEST.MF"文件)里标识Plugin的信息，如入口Class，PluginId，Plugin Version等等。
> 2. PluginDescriptorFinder：用来寻找**PluginDescriptor**的工具类，默认有两个实现：**ManifestPluginDescriptorFinder**和**PropertiesPluginDescriptorFinder**，顾名思义，对应两种Plugin信息的寻找方式。
> 3. PluginWrapper：Plugin的包装类，持有Plugin实例的引用，并提供了相对应信息(如PluginDescriptor，ClassLoader)的访问方法。
> 4. PluginClassLoader: 自定义类加载器，继承自URLClassLoader并重写了**loadClass()**方法，实现目标Plugin的加载。

回顾开头所说的问题，文件删不掉一般是别的进程占用导致的，文件流打开之后没有及时Close掉。但是我们查了一遍上述过程中出现的文件流操作都有Close。至此似乎陷入了僵局。

## MAT

换一个思路，既然文件删不掉，那就看看赖在JVM里面到底是什么东西。
跑测试代码，然后通过命令**jps**查找Java进程id(这里是11210)，然后用以下命令dump出JVM中alive的对象到一个文件tmp.bin：
> jmap -dump:live,format=b,file=tmp.bin 11210

接着在内存分析工具**MAT**中打开dump文件，结果如下图：
![dump](https://upload-images.jianshu.io/upload_images/19724978-85c69af07ece8b13.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

发现有一个类**com.sun.nio.zipfs.ZipFileSystem**占了大半的比例(68.8%)，该类被**sun.nio.fs.WindowsFileSystemProvider**持有着引用。根据这个线索，我们去代码里面看哪里有调用FileSystem相关的api，果然，在**PropertiesPluginDescriptorFinder**中找到了幕后黑手(只保留核心代码)：
~~~java
/**
 * Find a plugin descriptor in a properties file (in plugin repository).
 */
public class PropertiesPluginDescriptorFinder implements PluginDescriptorFinder {
    // 调用此方法去寻找plugin.properties，并加载Plugin相关的信息
    public PluginDescriptor find(Path pluginPath) {
        // 关注getPropertiesPath这个方法
        Path propertiesPath = getPropertiesPath(pluginPath, propertiesFileName);

        // 读取properties文件内容
        ......

        return createPluginDescriptor(properties);
    }
	
    protected Properties readProperties(Path pluginPath) {
        Path propertiesPath;
        try {
            // 文件最终是通过工具类FileUtils去得到Path变量
            propertiesPath = FileUtils.getPath(pluginPath, propertiesFileName);
        } catch (IOException e) {
            throw new PluginRuntimeException(e);
        }
        
        // 加载properties文件
        ......
        return properties;
    }
}

public class FileUtils {
    public static Path getPath(Path path, String first, String... more) throws IOException {
        URI uri = path.toUri();
        // 其他变量的初始化，跳过
		......
		
        // 通过FileSystem去加载Path，出现了元凶FileSystem！！！
        // 这里拿到FileSystem之后，没有关闭资源！！！
        // 隐藏得太深了
        return getFileSystem(uri).getPath(first, more);
    }
	
    // 这个方法返回一个FileSystem实例，注意方法签名，是会有IO操作的
    private static FileSystem getFileSystem(URI uri) throws IOException {
        try {
            return FileSystems.getFileSystem(uri);
        } catch (FileSystemNotFoundException e) {
            // 如果uri不存在，也返回一个跟此uri绑定的空的FileSystem
            return FileSystems.newFileSystem(uri, Collections.<String, String>emptyMap());
        }
    }
}
~~~

刨根问底，终于跟**MAT**的分析结果对应上了。原来**PropertiesPluginDescriptorFinder**去加载Plugin描述的时候是通过FileSystem去做的，但是加载好之后，没有调用**FileSystem.close()**方法释放资源。我们工程里面使用的**DefaultPluginManager**默认包含两个DescriptorFinder：
~~~java
    protected PluginDescriptorFinder createPluginDescriptorFinder() {
        // DefaultPluginManager的PluginDescriptorFinder是一个List
        // 使用了组合模式，按添加的顺序依次加载PluginDescriptor
        return new CompoundPluginDescriptorFinder()
            // 添加PropertiesPluginDescriptorFinder到List中
            .add(new PropertiesPluginDescriptorFinder())
            // 添加ManifestPluginDescriptorFinder到List中
            .add(new ManifestPluginDescriptorFinder());
    }
~~~

最终我们用到的其实是**ManifestPluginDescriptorFinder**，但是代码里先会用**PropertiesPluginDescriptorFinder**加载一遍(**无论加载是否成功持都会持了文件的引用**)，发现加载不到，然后再用**ManifestPluginDescriptorFinder**。所以也就解释了，当JVM退出之后，文件自动就删除了，因为资源被强制释放了。

# 问题解决

自己写一个类继承**PropertiesPluginDescriptorFinder**，重写其中的**readProperties()**方法调用自己写的**MyFileUtil.getPath()**方法，当使用完**FileSystem.getPath**之后，把**FileSystem** close掉，核心代码如下：
~~~java
public class FileUtils {
    public static Path getPath(Path path, String first, String... more) throws IOException {
        URI uri = path.toUri();
        ......
        // 使用完毕，调用FileSystem.close()
        try (FileSystem fs = getFileSystem(uri)) {
            return fs.getPath(first, more);
        }
    }
    
    private static FileSystem getFileSystem(URI uri) throws IOException {
        try {
            return FileSystems.getFileSystem(uri);
        } catch (FileSystemNotFoundException e) {
            return FileSystems.newFileSystem(uri, Collections.<String, String>emptyMap());
        }
    }
}
~~~

# 后续

隐藏得如此深的一个bug...虽然这并不是个大问题，但确实困扰了我们一段时间，而且确实有同仁也碰到过类似的问题。给**PF4J**上发了PR解决这个顽疾，也算是对开源社区尽了一点绵薄之力，以防后续同学再遇到类似情况。

# 总结

文件无法删除，95%的情况都是因为资源未释放干净。
**PF4J**去加载Plugin的描述信息有两种方式，一种是根据配置文件*plugin.progerties*，一种是根据*Manifest*配置。默认的行为是先通过*plugin.progerties*加载，如果加载不到，再通过*Manifest*加载。
而通过*plugin.progerties*加载的方法，内部是通过nio的**FileSystem**实现的。而当通过**FileSystem**加载之后，直至Plugin unload之前，都没有去调用**FileSystem.close()**方法释放资源，导致文件无法删除的bug。

**FileSystem**的创建是通过**FileSystemProvider**来完成的，不通的系统下有不同的实现。如Windows下的实现如下：
![file system的windows实现](https://upload-images.jianshu.io/upload_images/19724978-062017dd02e8f091.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)


**FileSystemProvider**被创建之后会被缓存起来，作为工具类**FIleSystems**的一个*static*成员变量，所以**FileSystemProvider**是不会被GC的。每当**FileSystemProvider**创建一个**FileSystem**，它会把该**FileSystem**放到自己的一个Map里面做缓存，所以正常情况**FileSystem**也是不会被GC的，正和上面MAT的分析结果一样。而**FileSystem**的**close()**方法，其中一步就是释放引用，所以在**close**之后，类就可以被内存回收，资源得以释放，文件就可以被正常删除了
~~~java
public class ZipFileSystem extends FileSystem {
    // FileSystem自己所对应的provider
    private final ZipFileSystemProvider provider;
    public void close() throws IOException {
        ......
        // 从provider中，删除自己的引用
        this.provider.removeFileSystem(this.zfpath, this);
        ......
    }
}

public class ZipFileSystemProvider extends FileSystemProvider {
    // 此Map保存了所有被这个Provider创建出来的FileSystem
    private final Map<Path, ZipFileSystem> filesystems = new HashMap();

    void removeFileSystem(Path zfpath, ZipFileSystem zfs) throws IOException {
        // 真正删除引用的地方
        synchronized(this.filesystems) {
            zfpath = zfpath.toRealPath();
            if (this.filesystems.get(zfpath) == zfs) {
                this.filesystems.remove(zfpath);
            }

        }
    }
}
~~~