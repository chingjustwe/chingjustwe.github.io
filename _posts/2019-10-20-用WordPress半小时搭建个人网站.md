---
layout: post
title: 用WordPress半小时搭建个人网站
date: 2019-10-20
categories: 
  - Handbook
tags: 
  - WordPress
  - Self Website
  - Blog
  - LAMP 
---

# 前言

本篇文章将介绍如何基于WordPress快速搭建个人网站。

## WordPress

[WordPress](https://wordpress.org/)是一个用PHP开发的，开源的内容管理系统(Content Management System)，是目前世界上最流行的CMS解决方案。截至2019年4月，全球最大的1000万个网站中有33.6%都在使用WordPress。在个人网站及小型网站上，WordPress的使用也十分广泛。
## 为什么选择WordPress？
主要有以下几点原因：
> - 快速上手，开源免费，开箱即用
> - 功能强大，插件丰富，页面美观，满足建站的大部分需求
> - 非常流行，用户基础庞大，社区活跃，日常遇到的大部分问题都能得到解答
> - 安全，很多的政府机构都在使用

# 环境
WordPress是需要有运行环境的，即所谓的**LAMP(Linux, Apache, MySQL, PHP)**。因为是用PHP开发的，所以必须要有**PHP**的运行环境，数据库可以选择**MySQL**，也可以安装[MariaDB](https://en.wikipedia.org/wiki/MariaDB "MariaDB")。两者的区别这里不做扩展说明。当然WordPress对于各个操作系统(Linux, Mac OS, Windows)都是有各自的版本的，但是既然考虑作为服务器使用，还是推荐用**Linux**。Web服务器也并不限定于Apache，像Nginx也是一个很好的选择，但考虑到Apache相对来说更加简单，所以我们选择**Apache**来建站。
## Linux环境
首先得要有一个服务器，国外国内的云服务器都可以选。国外的推荐[AWS](https://aws.amazon.com/)，国内的可以选择[阿里云](https://cn.aliyun.com/)，[腾讯云](https://cloud.tencent.com/)，[华为云](https://activity.huaweicloud.com/)等。这里我选择了Ubuntu系统(CentOS也强烈推荐，区别在于安装软件环境的命令会有所不同)。当然，还要标配一个域名，申请也很方便。

## Apache

#### 安装**Apache**

执行以下代码来安装**Apache**
~~~shell
sudo apt-get install apache2 apache2-utils
~~~

Apache默认监听端口80,配置文件目录为
>/etc/apache2/apache2.conf

网络资源文件目录为
>/var/www/html/

#### 启动**Apache**

执行以下代码以启动**Apache**
~~~shell
sudo systemctl enable apache2
sudo systemctl start apache2
~~~

这时候我们在浏览器里，通过机器的ip或者hostname访问80端口，就可以看到Apache的欢迎页面了
![apache welcome page](/src/img/article-img/Handbook/build%20wordpress/apache_welcome.png)

一般我们不需要做额外的配置。如果需要修改端口，只需要修改**ports.conf**中的**Listen**参数，因为**apache2.conf**中include了文件**ports.conf**。

在这里，如果遇到http请求访问不通，需要查一下防火墙的设置，将端口加入白名单。
同时对于云主机，出于安全考虑可能厂家对端口也默认设置了一些规则，拿阿里云的机器举例子，需要自己在控制台配置规则，打开相应端口
![ACS rule](/src/img/article-img/Handbook/build%20wordpress/rule.png)
## MySQL

#### 安装MySQL
~~~shell
sudo apt-get install mysql-client mysql-server
~~~
如果要安装**MariaDB**，那么执行
~~~shell
sudo apt-get install mariadb-server mariadb-client
~~~
以MySQL为例，在安装过程中需要设置密码。
#### 启动数据库
~~~shell
sudo systemctl enable mysql
sudo systemctl start mysql
~~~
#### 登录数据库
~~~shell
mysql -u root -p
~~~
为方便**WordPress**后面连接，我们预先给创建一个instance，比如叫**wp_myblog**
~~~sql
mysql> CREATE DATABASE wp_myblog;
mysql> GRANT ALL PRIVILEGES ON wp_myblog.* TO 'root'@'localhost' IDENTIFIED BY '${your_password}';
mysql> FLUSH PRIVILEGES;
mysql> EXIT;
~~~
因为后面我们会把WordPress也安装在本地，所以不需要给MySQL开启远程访问权限。
## PHP
#### 安装**PHP**
~~~shell
sudo apt-get install php7.0 php7.0-mysql libapache2-mod-php7.0 php7.0-cli php7.0-cgi php7.0-gd  
~~~
#### 测试PHP
首先在Apache的**html**文件夹下建立一个测试文件**info.php**
~~~shell
sudo vi /var/www/html/info.php
~~~
添加以下内容
~~~php
<?php
phpinfo();
?>
~~~
保存之后，浏览器访问**info.php**这个文件，可以看到PHP的信息页面
![php info page](/src/img/article-img/Handbook/build%20wordpress/php_welcome.png)
# 安装WordPress
#### 下载WordPress
直接从官网下载最新版本到本地
~~~shell
cd /tmp
wget -c http://wordpress.org/latest.tar.gz
~~~
#### 安装WordPress
将安装包解压并且放到**Apache**的**html**目录下
~~~shell
tar -xzvf latest.tar.gz
cp -rf wordpress/* /var/www/html/
~~~
设置**html**目录的访问权限，将用户和组设置为网络服务**www-data**
~~~shell
sudo chown -R www-data:www-data /var/www/html/
sudo chmod -R 755 /var/www/html/
~~~
如此一来，就可以从浏览器访问到**WordPress**的服务了
![WordPress welcome page](/src/img/article-img/Handbook/build%20wordpress/word_press_start.png)
#### 配置WordPress
这里有两个方式，一个方式是直接从浏览器安装，填写数据库连接信息。另一个方式是修改手动配置数据库信息
**WordPress**提供了一个配置文件的样本**wp-config-sample.php**，我们直接拿来用
~~~shell
mv /var/www/html/wp-config-sample.php /var/www/html/wp-config.php
~~~
然后在文件里面添加如下配置，包括数据库地址用户名密码，DB instance名字：
~~~php
/** The name of the database for WordPress */
define( 'DB_NAME', 'wp_myblog' );
/** MySQL database username */
define( 'DB_USER', 'root' );
/** MySQL database password */
define( 'DB_PASSWORD', '${your_password}' );
/** MySQL hostname */
define( 'DB_HOST', 'localhost' );
~~~
至此，大工告成，可以用**WordPress**写文章了~
![first blog](/src/img/article-img/Handbook/build%20wordpress/blog_preview.png)
# 总结
通过**WordPress**可以快速地搭建一个个人网站，需要安装**LAMP**的环境。