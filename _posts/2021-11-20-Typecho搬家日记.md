---
layout: post
title: Typecho搬家笔记
date: 2021-11-20
categories: 
  - Handbook
tags: 
  - Typecho
  - LNMP
  - Docker
  - Docker Compose
  - Self Website
---

# 背景
由于云主机马上就要到期了，所以最近对比了几家云服务器提供商。最终决定尝试一下 [UCloud](https://www.ucloud.cn/site/active/kuaijie.html#shanghai)。于是不得不把原博客（typecho）迁移过来。下面是流水账式地记录一下过程。

# 过程记录
本想尝试按照[以前的笔记](https://nightfield.com.cn/index.php/archives/30/)重新搭建一套环境，然后再把数据导过来，但是一想到这一长串的步骤，以及可能碰到的问题就头疼，于是决定构建一个基于容器的 **LNMP** 环境，一劳永逸，也方便日后继续做博客迁移。当然如果有同学也想搭建基于 **LNMP** 的博客如 [Typecho](https://typecho.org)，则可以参考我的模板:-)（文末有 **Github** 链接）。
注：以下命令及配置都是基于 **CentOS7**。

## 容器环境
由于此次环境的搭建是用的 [docker](https://www.docker.com/)，所以先保证机器上安装了 **docker** 和 **docker-compose**：
~~~sh
# 安装 docker
sudo yum install -y yum-utils
sudo yum-config-manager \
  --add-repo \
  http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io
sudo systemctl enable docker
sudo systemctl start docker

# 安装 docker-compose
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
~~~

## LNMP 环境配置
构建基于 `docker-compose`，目录结构如下：
~~~sh
.
├── docker-compose.yml # docker-compose 配置文件
├── mysql
│   ├── conf # mysql 配置文件目录
│   │   ├── my.cnf
│   └── data # mysql 数据文件目录
├── nginx
│   ├── cert # nginx ssl 证书目录
│   │   ├── nightfield.com.cn.key
│   │   ├── nightfield.com.cn.pem
│   ├── conf # nginx 配置目录
│   │   ├── nightfield.com.cn.conf
│   ├── html # nginx Web 根目录
│   │   ├── info.php
│   └── log # nginx 日志目录
├── php
│   ├── conf # php 配置目录
│   │   └── php.ini
│   └── Dockerfile # php 的 Dockerfile 配置
~~~

可以看到主要是对应软件的一些配置文件。`docker-compose.yml` 文件内容如下：
~~~yml
version: "3"
services:
    nginx:
        image: nginx:latest
        container_name: nginx
        networks:
            - lnmp
        depends_on:
            - php
        ports:
            - "80:80"
            - "443:443"
        expose:
            - "80"
            - "443"
        volumes:
            - /opt/docker/nginx/html:/usr/share/nginx/html # nginx web 根目录
            - /opt/docker/nginx/conf/:/etc/nginx/conf.d # 配置目录
            - /opt/docker/nginx/log:/var/log/nginx # 日志目录
            - /opt/docker/nginx/cert:/etc/nginx/cert # ssl 证书目录
        links:
            - php
    php:
        build: # 由于 PHP 的构建相对较为复杂，所以用了 Dockerfile 的方式
            context: ./php
            dockerfile: Dockerfile
        container_name: php
        volumes:
            - /opt/docker/nginx/html:/usr/share/nginx/html # nginx web 根目录
            - /opt/docker/php/conf/:/usr/local/etc/php/conf.d # 配置目录
        networks:
            - lnmp
        depends_on:
            - mysql
        expose:
            - "9000"
    mysql:
        image: mysql:5.7
        container_name: mysql
        volumes:
            - /opt/docker/mysql/conf/:/etc/mysql/conf.d # 配置目录
            - /opt/docker/mysql/data:/var/lib/mysql # 数据目录
        environment:
            MYSQL_ROOT_PASSWORD: password # 改为自定义密码
        networks:
            - lnmp
        expose:
            - "3306"
        ports:
            - "3306:3306"

networks:
    lnmp:
~~~

### Mysql
**Mysql** 的配置较为简单不再赘述，注意将对应的配置目录以及数据目录从容器中映射出来便于管理。

### Nginx
将 **Nginx** 的配置从容器中映射出来，模版如下：
~~~ruby
# https ssl, 对应 443 端口
server {
    listen       443 ssl;
    server_name  nightfield.com.cn; # 域名或者服务器 ip
    error_log  /var/log/nginx/error.log;
    access_log /var/log/nginx/access.log;
    index index.php;
    root         /usr/share/nginx/html;
    # ssl 配置
    ssl_certificate_key cert/nightfield.com.cn.key; # 证书 key
    ssl_certificate cert/nightfield.com.cn.pem; # 证书 pem
    ssl_session_cache    shared:SSL:1m;
    ssl_session_timeout  5m;
    ssl_prefer_server_ciphers  on;

    location ~ .*\.php(\/.*)*$ { # 注意这里的正则
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass php:9000;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_split_path_info ^(.+.php)(/.+)$;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
    }
}

# https，对应 80 端口
server {
    listen 80;
    server_name nightfield.com.cn; # 域名或者服务器 ip
    rewrite ^(.*)$ https://${server_name}$1 permanent; # 重定向到 https
}
~~~

### PHP
**PHP** 的构建相对复杂，除了从官网拉 **PHP** 镜像外，还需要安装额外的模块如 **mysqli pdo_mysql**，所以做了一个 `Dockerfile`，内容如下：
~~~sh
FROM php:7.0-fpm # 基础镜像
RUN cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone
RUN apt-get update && apt-get install -y \ # 一些 lib 库
        libfreetype6-dev \
        libjpeg62-turbo-dev \
        libmcrypt-dev \
        libpng-dev \
        libmemcached-dev \
        zlib1g-dev \
        libcurl4-openssl-dev \
        libxml2-dev \
        --no-install-recommends && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install -j$(nproc) \ # 插件安装
        iconv mcrypt gettext curl mysqli pdo pdo_mysql zip \
        mbstring bcmath opcache xml simplexml sockets hash soap \
    && docker-php-ext-configure gd --with-freetype-dir=/usr/include/ --with-jpeg-dir=/usr/include/ \
    && docker-php-ext-install -j$(nproc) gd

CMD ["php-fpm", "-F"]
~~~

## LNMP 环境构建及验证
配置都完成之后，启动容器环境：
~~~sh
docker-componse up -d
~~~

在云服务器的安全组规则配置中，开放对应端口：**80**，**443**，**3306**（完成数据迁移之后可以关闭），然后打开浏览器访问 `${hostname}/info.php`，可以看到如下页面：
![info,php](https://user-images.githubusercontent.com/13643747/142363791-a2a96d06-be56-4a8c-ace7-c4ad6206a437.png)
说明环境已安装成功！

## 数据迁移
接下来要做的就是把博客数据从老的库迁移到新的库。

### Typecho 数据
将整个 **Typecho** 目录打包，用 `scp` 传到新机器的 `./nginx/html/` 目录下。

### Mysql
我这里用了比较老套的方法：从老库导出数据再导入新库，用工具是 [DBeaver](https://dbeaver.io/)。这里记录一下 **Typecho** 相关的一些表结构。
~~~sql
use typecho;
CREATE TABLE `typecho_comments` (
  `coid` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cid` int(10) unsigned DEFAULT '0',
  `created` int(10) unsigned DEFAULT '0',
  `author` varchar(200) DEFAULT NULL,
  `authorId` int(10) unsigned DEFAULT '0',
  `ownerId` int(10) unsigned DEFAULT '0',
  `mail` varchar(200) DEFAULT NULL,
  `url` varchar(200) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `agent` varchar(200) DEFAULT NULL,
  `text` text,
  `type` varchar(16) DEFAULT 'comment',
  `status` varchar(16) DEFAULT 'approved',
  `parent` int(10) unsigned DEFAULT '0',
  PRIMARY KEY (`coid`),
  KEY `cid` (`cid`),
  KEY `created` (`created`)
) ENGINE=MyISAM AUTO_INCREMENT=51476 DEFAULT CHARSET=utf8;

CREATE TABLE `typecho_contents` (
  `cid` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(200) DEFAULT NULL,
  `slug` varchar(200) DEFAULT NULL,
  `created` int(10) unsigned DEFAULT '0',
  `modified` int(10) unsigned DEFAULT '0',
  `text` longtext,
  `order` int(10) unsigned DEFAULT '0',
  `authorId` int(10) unsigned DEFAULT '0',
  `template` varchar(32) DEFAULT NULL,
  `type` varchar(16) DEFAULT 'post',
  `status` varchar(16) DEFAULT 'publish',
  `password` varchar(32) DEFAULT NULL,
  `commentsNum` int(10) unsigned DEFAULT '0',
  `allowComment` char(1) DEFAULT '0',
  `allowPing` char(1) DEFAULT '0',
  `allowFeed` char(1) DEFAULT '0',
  `parent` int(10) unsigned DEFAULT '0',
  `views` int(10) DEFAULT '0',
  PRIMARY KEY (`cid`),
  UNIQUE KEY `slug` (`slug`),
  KEY `created` (`created`)
) ENGINE=MyISAM AUTO_INCREMENT=199 DEFAULT CHARSET=utf8;

CREATE TABLE `typecho_fields` (
  `cid` int(10) unsigned NOT NULL,
  `name` varchar(200) NOT NULL,
  `type` varchar(8) DEFAULT 'str',
  `str_value` text,
  `int_value` int(10) DEFAULT '0',
  `float_value` float DEFAULT '0',
  PRIMARY KEY (`cid`,`name`),
  KEY `int_value` (`int_value`),
  KEY `float_value` (`float_value`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE `typecho_metas` (
  `mid` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) DEFAULT NULL,
  `slug` varchar(200) DEFAULT NULL,
  `type` varchar(32) NOT NULL,
  `description` varchar(200) DEFAULT NULL,
  `count` int(10) unsigned DEFAULT '0',
  `order` int(10) unsigned DEFAULT '0',
  `parent` int(10) unsigned DEFAULT '0',
  PRIMARY KEY (`mid`),
  KEY `slug` (`slug`)
) ENGINE=MyISAM AUTO_INCREMENT=52 DEFAULT CHARSET=utf8;

CREATE TABLE `typecho_options` (
  `name` varchar(32) NOT NULL,
  `user` int(10) unsigned NOT NULL DEFAULT '0',
  `value` text,
  PRIMARY KEY (`name`,`user`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE `typecho_relationships` (
  `cid` int(10) unsigned NOT NULL,
  `mid` int(10) unsigned NOT NULL,
  PRIMARY KEY (`cid`,`mid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE `typecho_users` (
  `uid` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(32) DEFAULT NULL,
  `password` varchar(64) DEFAULT NULL,
  `mail` varchar(200) DEFAULT NULL,
  `url` varchar(200) DEFAULT NULL,
  `screenName` varchar(32) DEFAULT NULL,
  `created` int(10) unsigned DEFAULT '0',
  `activated` int(10) unsigned DEFAULT '0',
  `logged` int(10) unsigned DEFAULT '0',
  `group` varchar(16) DEFAULT 'visitor',
  `authCode` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`uid`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `mail` (`mail`)
) ENGINE=MyISAM AUTO_INCREMENT=3 DEFAULT CHARSET=utf8;
~~~

## 域名重解析
去域名的配置页面，将 **A 记录** 重新解析到新的 **ip** 上，等待生效后（`ping` 以下域名看结果），访问 https://nightfield.com.cn 已经可以正确打开博客，**还是原来的味道，只是换了配方:-)**。

# 问题记录
## 1. 博客的配置丢失
还不知道具体原因，用最笨的方法解决了：主题和插件重新配置了一下。

## 2. PHP 无法连接数据库
报的错误是：
~~~
Uncaught Error: Class 'mysqli' not found
~~~
原因一般是没有安装 `mysqli` 导致的，但是我们在 `Dockerfile` 里面确实有安装此模块。在配置文件 `./php/conf/php.ini` 中加上以下配置，问题解决：
~~~conf
extension=mysqli.so
extension=pdo_mysql.so
~~~

## 3. 打开很多 Typecho 页面报 Cannot modify header information
报的错误是：
~~~
Warning: Cannot modify header information - headers already sent by (output started at /data/dy-pages/store-1/262/1634262/www/install.php:202) in /data/dy-pages/store-1/262/1634262/www/var/Typecho/Cookie.php on line 102
~~~
在配置文件 `./php/conf/php.ini` 中加上以下配置，问题解决：
~~~conf
output_buffering=on
~~~

## 4. 无法登陆 Typecho 管理页面，报 404
这个问题是无法正确解析 URL 导致的。**Typecho** 登陆之后的 url 类似 **https://www.nightfield.com.cn/index.php/action/login?_=7**，而我在 **Nginx** 配置的 **PHP** location 为 `location ~ .*\.php$`，无法处理上述 url。将 location 改为 `location ~ .*\.php(\/.*)*$` 问题解决。

# 附录
本次基于 docker 的 LNMP 环境的代码 **Github** 地址：[Docker-LNMP](https://github.com/chingjustwe/Docker-LNMP)。