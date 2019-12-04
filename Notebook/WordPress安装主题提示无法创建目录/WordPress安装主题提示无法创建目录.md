# 背景
通过WordPress搭建了个人网站之后，可以去定制自己博客的主题，可以直接从WordPress主题管理页面上下载，也可以在本地将主题下载好之后，通过WordPress管理页面上传上去。今天上传博客主题的时候，提示**无法创建目录（Could not create directory）**
![无法创建目录](https://raw.githubusercontent.com/chingjustwe/my-blogs/master/Notebook/WordPress%E5%AE%89%E8%A3%85%E4%B8%BB%E9%A2%98%E6%8F%90%E7%A4%BA%E6%97%A0%E6%B3%95%E5%88%9B%E5%BB%BA%E7%9B%AE%E5%BD%95/wordpress%20update%20fail.png)
# 解决
本人的博客是基于CentOS7和Nginx搭建的，猜测应该是权限的问题。因为WordPress的主题默认都是下载在**wp-content/themes**文件夹下的，所以检查了一下此文件的权限
![文件夹原始权限](https://raw.githubusercontent.com/chingjustwe/my-blogs/master/Notebook/WordPress%E5%AE%89%E8%A3%85%E4%B8%BB%E9%A2%98%E6%8F%90%E7%A4%BA%E6%97%A0%E6%B3%95%E5%88%9B%E5%BB%BA%E7%9B%AE%E5%BD%95/theme%20privilege.png)
发现访问权限已经是**755**了，但是用户和组是**root**，于是执行以下命令
```
chown nginx:nginx themes
```
然后重新upload，果然成功了
![上传成功](https://raw.githubusercontent.com/chingjustwe/my-blogs/master/Notebook/WordPress%E5%AE%89%E8%A3%85%E4%B8%BB%E9%A2%98%E6%8F%90%E7%A4%BA%E6%97%A0%E6%B3%95%E5%88%9B%E5%BB%BA%E7%9B%AE%E5%BD%95/wordpress%20upload%20theme%20success.png)
同时，为了保证当主题比较大的时候我们也能上传成功，最好调大**PHP**和**Nginx**对file size的控制，在**nginx.conf**增加参数*client_max_body_size*
> http {
    client_max_body_size 32m;
    (other parameters)
}

在**php.ini**中增加/修改*upload_max_filesize*和*post_max_size*参数
> upload_max_filesize = 32M
post_max_size = 32M

# 总结
WordPress无法下载或者上传主题或者插件，如果是提示目录无法创建，一般是权限的问题，确保目标文件/文件夹要有**755**的访问权限，而且用户要设为网络用户，如果用**Nginx**作为web server，那用户就是**nginx**；如果是用**Apache**，那用户就应该是**apache**。