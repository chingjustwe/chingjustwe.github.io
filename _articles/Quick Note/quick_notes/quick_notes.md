---
layout: post
title: 快速笔记
date: 2023-11-29
categories:
  - QuickNote
tags:
  - Quick Note
---

## Redis 主从复制机制

1. 当 master 和 replica 正常通信时，master 通过向 replica 发送命令流来保持更新，以复制由于以下原因在主端发生的对数据集的影响：写入命令(write)、键过期(expire)或被驱逐(evicted)，以及任何其他对数据集的修改操作。
2. 当 master 和 replica 的连接断开之后（由于网络问题或者 redis 检测到连接超时），replica 会跟 master 重连并尝试**部分同步**（partial resynchronization），也就是说它只会同步连接断开期间的所有命令流。
3. 当无法**部分同步**时，replica 会进行一次比较复杂的**全量同步**（full resynchronization），其中 master 需要为当前所有数据创建一个快照（snapshot）并发送给 replica，同时记录此后的所有命令流，待 replica 同步完快照后发送过去。

Redis 默认使用低延迟，高性能的**异步复制**（asynchronous replication），replicas 定期与 master 确认接收到的数据量。

## HTTPS 加密流程

1. 服务端将明文通过 hash 算法生成摘要，摘要通过私钥加密生成签名
2. 服务端将报文，签名，公钥和数字证书一起发给客户端
3. 客户端验证证书是否合法
4. 客户端使用公钥解密数字签名得到摘要，再对报文进行 hash 算法计算摘要，对比是否与服务端生成的的摘要相同

### 问题

1. 为什么需要数字证书
    数字证书则是由证书认证机构（CA, Certificate Authority）对证书申请者真实身份验证之后，用CA的根证书对申请人的一些基本信息以及申请人的公钥进行签名（相当于加盖发证书机构的公章）后形成的一个数字文件。如果没有数字证书，那么中间人可以假装成服务端，将客户端的公钥替换成自己的公钥，以便和客户端沟通，从而窃取信息。
2. 为什么需要用 hash 算法生成摘要并签名
    如果没有签名，中间人可以截获服务端发送的报文并篡改，然后再转发给客户端，客户端无从验证
