---
layout: post
title: Mybatis 批量插入 Oracle 记录
date: 2022-01-04
categories:
  - QuickNote
tags:
  - Oracle
  - Mybatis
---

# 基本环境
> 语言：Java 8
> 数据库：Oracle 
> ORM 框架：MyBatis 3.4.5

# 需求
批量插入数据，数据需要有自增 `id`。每次插入有一个唯一的 `sessionId` 来标记这些记录，插入完成之后返回这个 `sessionId`。

# 方案
循环插入单条记录，伪代码：
~~~java
int sessionId = dao.querySessionId();
for (Record record : recordList) {
    dao.insertRecord(record, sessionId);
}
return sessionId;
~~~

上述解决方案很简明易懂，但是循环中每次 `insert` 操作都会与 **DB** 交互一次，当数据量很大时，会花费很多时间在网络传输上，导致性能问题。

# 改进
问题可以通过批量插入来改善。
## 带自增 id 的批量插入
**Oracle** 中比较常见的批量插入模版是：
~~~sql
INSERT ALL
   INTO target_table (col1, col2, col3) VALUES ('id1_1', 'val1_2', 'val1_3')
   INTO target_table (col1, col2, col3) VALUES ('id2_1', 'val2_2', 'val2_3')
   ...
Subquery;
~~~

但是每条记录都需要有一个自增 `id`，**Oracle** 中一般用 **Sequence** 来实现，于是比较容易想到的是用下面这种方式：
~~~sql
INSERT ALL
   INTO table (col1, col2, col3) VALUES (SEQUENCE.NEXTVAL, 'val1_2', 'val1_3')
   INTO table (col1, col2, col3) VALUES (SEQUENCE.NEXTVAL, 'val2_2', 'val2_3')
   ...
SELECT 1 FROM DUAL;
~~~

不过遗憾的是，上述方案行不通，因为所有的 `SEQUENCE.NEXTVAL` 都会是同一个值，会产生主键冲突。

接着尝试其他的方案。**Oracle** 支持从一个表里批量选取数据插入另一个表中：
~~~sql
INSERT INTO target_table (col1, col2, col3)
SELECT col1,
       col2,
       col3
FROM source_table
WHERE condition;
~~~

用上述方式，我们可以把被插入的数据用 `UNION ALL` 构造一个子表，也就是上面的 **source_table** 来实现批量插入。跟 `INSERT ALL INTO` 相比的好处是，可以使用 **Sequence** 的自增值：
~~~sql
INSERT INTO target_table (col1, col2, col3)
SELECT SEQUENCE.NEXTVAL,
       col2,
       col3
FROM (
    SELECT 'val1_2' col2, 'val1_3' col3 FROM dual UNION ALL
    SELECT 'val2_2' col2, 'val2_3' col3 FROM dual UNION ALL
    ...
);
~~~

用 **MyBatis** 的 **dynamic sql** 来实现大致如下：
~~~xml
<insert id="sampleInsert" parameterType="java.util.List">
    INSERT INTO target_table (col1, col2, col3)
    SELECT SEQUENCE.NEXTVAL,, col2, col3 FROM
    <foreach collection="list" item="item" index="index" open="(" close=")" separator=" UNION ALL ">
        SELECT #{item.val2} col2, #{item.val2} col3 FROM dual
    </foreach>
</insert>
~~~

## 插入完成之后返回 sessionId
在 **Mybatis** 中，返回某个 property 可以用 [SelectKey](https://mybatis.org/mybatis-3/apidocs/org/apache/ibatis/annotations/SelectKey.html)。`SelectKey` 是 `Insert` 的子标签，实现原理是在执行插入语句之前先做一次 `SelectKey` 的子查询，此处，可以将子查询的结果赋值到查询的参数当中，例如
~~~java
public class Foo {
    private int id;
    private String col2;
    private String col3;
}
public interface FooDao {
    void sampleInsert(Foo foo);
}
~~~
~~~xml
<insert id="sampleInsert" useGeneratedKeys="true" parameterType="Foo" keyProperty="id">
    <selectKey keyProperty="id" order="BEFORE" resultType="int">
        SELECT SESSION_SEQUENCE.NEXTVAL FROM DUAL
    </selectKey>
    INSERT INTO target_table (col1, col2, col3)
    VALUES (#{id}, #{col2}, #{col3})
</insert>
~~~

当插入结束之后，参数 `foo.id` 就会是 `SESSION_SEQUENCE` 的自增值（注意在 `Dao` 中不能用 `@Param()` 标注参数）。

然而这种方式只支持单条记录的插入，**Oracle** 中批量插入的情况就无法完成赋值了。所以此处只能分成两步来做：
1. 获取 `sessionId`（`SESSION_SEQUENCE.NEXTVAL`）
2. 批量插入带 `sessionId` 的记录
或者
1. 用 **SelectKey** 选出 `sessionId`（`SESSION_SEQUENCE.NEXTVAL`）并批量插入记录
2. 获取 `sessionId`（`SESSION_SEQUENCE.CURRVAL`）

注意上述第二种方式，需要保证两个方法在同一个 **Transaction** 里面，否则 **Sequence** 的值会不一致。

# 总结
本文简单总结了在 **MyBatis** 中往 **Oracle** 批量插入数据的方法，作一个快速笔记。

# Reference
[The Ultimate Guide to Oracle INSERT ALL Statement](https://www.oracletutorial.com/oracle-basics/oracle-insert-all/)
[Oracle INSERT INTO SELECT](https://www.oracletutorial.com/oracle-basics/oracle-insert-into-select/)
[Inserting Multiple Rows Using a Single Statement](https://livesql.oracle.com/apex/livesql/file/content_BM1LJQ87M5CNIOKPOWPV6ZGR3.html)  
[Inserting multiple rows with sequence in Oracle](https://stackoverflow.com/questions/31968093/inserting-multiple-rows-with-sequence-in-oracle)