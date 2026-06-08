---
layout: post
title: "领域驱动设计（Domain-Driven Design）知识指南"
date: 2023-12-08
categories:
  - Tech
tags:
  - DDD
  - 领域驱动设计
  - 架构
  - 设计模式
---

> 本文档整合了领域驱动设计的核心概念、代码示例与架构约束方法，用于团队知识库建设。

---

## 1. 什么是领域驱动设计？

领域驱动设计（DDD）是一种以业务领域为核心的软件开发方法。它有三个重点：

- 通用语言（Ubiquitous Language）：开发人员与领域专家使用同一套术语，这套术语直接反映在代码里。
- 聚焦业务复杂度：把核心价值放在领域模型上，而不是技术框架上。
- 战略与战术分离：通过限界上下文划分系统边界，通过实体、值对象、聚合等模式细化模型。

---

## 2. DDD 解决的核心问题：贫血模型与业务腐化

传统贫血模型将数据与行为分离，代码大概是这样的：

```java
// 贫血的订单对象 -- 只有数据，没有行为
public class Order {
    private Long id;
    private String status;  // "PENDING", "PAID", "CANCELLED"
    private BigDecimal totalAmount;
    private List<OrderItem> items;
    // 只有 getter/setter ...
}

// 业务逻辑散落在各种 Service 中
@Service
public class OrderService {
    public void payOrder(Long orderId) {
        Order order = orderMapper.selectById(orderId);
        if (!"PENDING".equals(order.getStatus())) {
            throw new RuntimeException("状态错误");
        }
        if (order.getCreatedAt().plusMinutes(30).isBefore(LocalDateTime.now())) {
            order.setStatus("CANCELLED");
            throw new RuntimeException("订单超时取消");
        }
        order.setStatus("PAID");
        orderMapper.updateById(order);
    }
}
```

这样写会带来几个问题：

- 业务规则碎片化，修改时容易遗漏。
- 数据完整性无法保证，setter 可以被任意调用。
- 代码与业务语言脱节，沟通成本高。

DDD 的做法是把行为放回对象，同时施加边界约束，让模型自己守住自己的规则。

---

## 3. 战略设计：划分业务疆界

### 3.1 通用语言（Ubiquitous Language）

团队统一使用领域专家的术语，并把这些术语直接作为类名和方法名。

| 业务语言           | 代码体现                |
|-------------------|------------------------|
| 订单已支付         | `order.pay()`          |
| 订单超时作废       | `order.cancel()`       |
| 商品快照           | `ProductSnapshot` 类   |

### 3.2 限界上下文（Bounded Context）

一个限界上下文是一个清晰的业务边界，内部模型具有独立的含义。

举个例子：电商系统中"商品"在不同上下文中的含义是不同的。

在订单上下文里，商品只是一个快照（名称、价格）；在商品上下文里，商品是一个完整的实体（名称、描述、SKU、库存）。

```java
// 订单上下文中的商品（值对象）
public class ProductSnapshot {
    private ProductId id;
    private String name;
    private Money price;
}

// 商品上下文中的商品（实体）
public class Product {
    private ProductId id;
    private String name;
    private String description;
    private List<Sku> skus;
}
```

### 3.3 上下文映射（Context Map）

上下文之间的协作关系，常见模式有防腐层（ACL，隔离外部系统并转换模型）、共享内核（Shared Kernel）和上游/下游（明确依赖方向）。

防腐层代码示例：

```java
public class ProductAdapterImpl implements ProductAdapter {
    private final ProductServiceClient client;

    @Override
    public ProductSnapshot getProductSnapshot(ProductId id) {
        ProductDTO dto = client.getProduct(id.getValue());
        return new ProductSnapshot(
            new ProductId(dto.getId()),
            dto.getName(),
            new Money(dto.getPrice(), "CNY")
        );
    }
}
```

---

## 4. 战术设计：细化领域模型

### 4.1 实体（Entity）

实体拥有唯一标识，生命周期内可变，行为封装业务规则。

```java
public class Order {
    private OrderId id;                // 唯一标识（值对象）
    private UserId userId;
    private OrderStatus status;
    private Money totalAmount;         // 值对象
    private List<OrderItem> items;     // 内部集合
    private PaymentType paymentType;
    private LocalDateTime createdAt;

    // 工厂方法创建订单，内置校验
    public static Order create(UserId userId, List<OrderItem> items,
                               PaymentType paymentType) {
        if (items.isEmpty()) throw new OrderException("订单必须有商品");
        return new Order(new OrderId(), userId, items, paymentType);
    }

    // 支付行为 -- 规则锁定在此处
    public void pay() {
        if (status != OrderStatus.NEW) throw new OrderException("只有新订单可支付");
        if (paymentType == PaymentType.ONLINE && isTimeout()) {
            this.status = OrderStatus.CANCELLED;
            throw new OrderException("订单超时取消");
        }
        this.status = OrderStatus.PAID;
    }

    // 修改订单项数量 -- 由聚合根保证总金额一致性
    public void changeItemQuantity(ProductId productId, int newQty) {
        // ... 找到对应 item，调用其包级私有的 changeQuantity
        recalculateTotalAmount();
    }

    private boolean isTimeout() {
        return createdAt.plusMinutes(30).isBefore(LocalDateTime.now());
    }

    // 不提供公共 setter
}
```

### 4.2 值对象（Value Object）

值对象没有标识，通过属性值定义相等性。不可变，行为自包含。

```java
public class Money {
    public static final Money ZERO = new Money(BigDecimal.ZERO, "CNY");
    private final BigDecimal amount;
    private final String currency;

    public Money add(Money other) {
        if (!this.currency.equals(other.currency))
            throw new IllegalArgumentException("币种不同");
        return new Money(this.amount.add(other.amount), this.currency);
    }

    // 无 setter，equals/hashCode 基于 amount 和 currency
}
```

### 4.3 聚合（Aggregate）

聚合是一组实体和值对象的集合，由聚合根统一访问，保证业务规则在聚合范围内的一致性。

```java
// Order 是聚合根，OrderItem 的修改方法限定为包级私有
public class OrderItem {
    private ProductId productId;
    private Money unitPrice;
    private int quantity;

    // 只有同包下的 Order 才能调用
    void changeQuantity(int newQuantity) {
        this.quantity = newQuantity;
    }
}
```

规则：外部对象只能持有聚合根的引用，聚合内对象不能从外部直接修改。

### 4.4 领域服务（Domain Service）

无状态操作，不适合归属到某个实体或值对象。通常用于跨实体的业务逻辑或外部依赖的抽象。

```java
// 领域层接口
public interface InventoryService {
    boolean isStockSufficient(ProductId productId, int requiredQuantity);
    void reserveStock(ProductId productId, int quantity);
}

// 应用层使用
public class OrderApplicationService {
    public OrderId placeOrder(UserId userId, List<OrderItemRequest> items,
                              PaymentType paymentType) {
        // 校验库存
        items.forEach(item -> {
            if (!inventoryService.isStockSufficient(item.getProductId(), item.getQuantity()))
                throw new OrderException("库存不足");
        });
        Order order = Order.create(userId, toOrderItems(items), paymentType);
        orderRepository.save(order);
        items.forEach(item -> inventoryService.reserveStock(item.getProductId(), item.getQuantity()));
        return order.getId();
    }
}
```

### 4.5 仓储（Repository）

提供类似内存集合的接口，隐藏持久化细节。接口定义在领域层，实现在基础设施层。

```java
// 领域层接口
public interface OrderRepository {
    Optional<Order> findById(OrderId id);
    void save(Order order);
}

// 基础设施层实现（如 MyBatis）
@Repository
public class MyBatisOrderRepository implements OrderRepository {
    // 将 Order 与持久化对象互相转换
}
```

### 4.6 领域事件（Domain Event）

记录领域中发生的重要事实，用于解耦上下文。

```java
public class Order {
    private List<DomainEvent> events = new ArrayList<>();

    public void pay() {
        // ... 状态变更
        events.add(new OrderPaidEvent(this.id, this.userId, this.totalAmount));
    }

    public List<DomainEvent> getEvents() {
        return Collections.unmodifiableList(events);
    }
}
```

---

## 5. 架构约束：从"自觉"到"强制"

DDD 不一定要靠开发者自觉，可以通过一些手段把规则硬化为可自动检查的约束。

### 5.1 分层架构与依赖反转

```
  ┌──────────────────────────────┐
  │         接口层 (API)         │
  ├──────────────────────────────┤
  │        应用层 (App)          │
  ├──────────────────────────────┤
  │         领域层 (Domain)      │  ← 核心，不依赖任何框架
  └──────────────────────────────┘
                ↑
  ┌──────────────────────────────┐
  │     基础设施层 (Infra)       │  ← 实现领域层定义的接口
  └──────────────────────────────┘
```

### 5.2 使用 ArchUnit 自动化检测

```java
// 1. 领域层不能依赖基础设施层
@Test
public void domain_should_not_depend_on_infrastructure() {
    JavaClasses classes = new ClassFileImporter().importPackages("com.example");
    noClasses().that().resideInAPackage("..domain..")
              .should().dependOnClassesThat().resideInAPackage("..infrastructure..")
              .check(classes);
}

// 2. 非聚合根不能调用聚合内对象的修改方法
@Test
public void only_aggregate_root_can_modify_order_item() {
    noClasses().that().resideOutsideOfPackage("..domain.model.order")
              .should().callMethod(OrderItem.class, "changeQuantity", int.class);
}

// 3. 实体不应有公开 setter
@Test
public void entities_should_not_have_public_setters() {
    noClasses().that().resideInAPackage("..domain.model..")
              .should().haveSimpleNameStartingWith("set");
}
```

### 5.3 多模块工程强制边界

用 Maven/Gradle 模块化，配合依赖排除实现硬隔离。

```groovy
// order-context/build.gradle
dependencies {
    // 只允许依赖 product-context 的 API 模块，不能依赖其领域模块
    implementation project(':product-context-api')
}
```

---

## 6. DDD 与面向对象原则的关系

| 面向对象/设计模式原则       | DDD 如何将其落地                                     |
|----------------------------|------------------------------------------------------|
| 封装                       | 实体/聚合通过方法暴露行为，不暴露 setter              |
| 迪米特法则                 | 外部只能访问聚合根，不能穿透聚合访问内部对象          |
| 接口隔离原则               | 仓储、领域服务接口定义在领域层，外部依赖抽象          |
| 依赖反转原则               | 领域层定义接口，基础设施层实现，领域不依赖框架        |
| 单一职责原则               | 一个限界上下文只负责一块核心业务                      |

DDD 不是要替代面向对象原则，它是为复杂业务系统提供的一套可操作的模式体系，让 OO 原则能被团队一致执行。

---

## 7. 落地建议

1. 从核心域开始：识别系统中最具业务价值的区域，优先建模。
2. 事件风暴：跟领域专家一起梳理业务流程，形成通用语言和限界上下文草图。
3. 迭代建模：别指望一次建成完美模型，持续重构才是正路。
4. 自动化架构测试：引入 ArchUnit 等工具，把架构约束放进 CI 管道。
5. 团队共识：所有人理解 DDD 的价值，代码评审时盯住模型的纯洁性。

说实话，第五条是最难的。工具可以自动化，但观念不改，代码评审走过场，模型迟早会腐化。

---

## 8. 总结

领域驱动设计是一套从业务出发的系统化建模方法。它用战略设计（通用语言、限界上下文、上下文映射）划分复杂系统，用战术设计（实体、值对象、聚合、领域服务）精细化表达业务逻辑，再用架构约束（分层、依赖反转、自动化测试）防住设计腐化。

当简单的 CRUD 扛不住业务复杂度的时候，DDD 值得认真考虑。
