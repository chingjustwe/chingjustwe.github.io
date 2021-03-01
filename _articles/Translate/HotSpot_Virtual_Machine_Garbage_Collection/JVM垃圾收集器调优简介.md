---
layout: post
title: JVM垃圾收集器调优简介
date: 2020-11-03
categories:
  - Translate
tags:
  - Garbage Collector
---

垃圾收集器(`Garbage Collector`)是`Java`的重要组件，它免去了我们手动管理内存的繁杂工作，也一定程度上避免了内存泄漏的可能。为了支持`Java`广泛的应用场景(从**applet**小程序到**Web Service**的大型后端服务)，**HotSpot**提供了多种类型的**收集器**，并会根据计算机的性能自动选择最合适的。但是对于响应性能要求高的场景，往往无法通过单纯的选择何种收集器来满足需求