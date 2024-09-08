---
layout: post
title: Experience of JDK 8 to 17, JAX-RS to Spring Web upgrade
date: 2024-07-20
categories:
  - Handbook
tags:
  - JDK Upgrade
---

## Jersey vs SpringBoot Web

**Jersey**:
    - The implementation of *JAX-RS* (Java API for RESTful Web Services), which is a Java programming language API spec that provides support in **creating web services** according to the **Representational State Transfer (REST) architectural** pattern.
    - Introduced in Java EE 5 (within JDK), renamed to Jakarta EE (outside of JDK) in version 9.
    - Need to run within a servlet container or an application server.
    - Package prefix `javax.ws.rs.` / `jakarta.ws.rs.`, examples: `@Path`, `@GET`, `@PathParam`...

**Spring Boot Web**:
    - Based on Spring MVC, is a part of Spring Boot that focuses on building **web applications**, either RESTful or using traditional Spring MVC (Model-View-Controller) style.
    - package prefix `org.springframework.`, examples: `@RequestMapping`, `@GetMapping`, `@PathVariable`...

### Trying `spring-boot-starter-jersey`

`com.sun.jersey.*` -> `spring-boot-starter-jersey`
`web.xml` -> `JerseyConfig`

```java
    @Configuration
    public class JerseyConfiguration extends ResourceConfig {
        public JerseyConfiguration() {
            packages("com.example.api");

            property("com.sun.jersey.api.json.POJOMappingFeature", "true");

            register(MultiPartFeature.class);
            register(WadlFeature.class);
            OpenApiResource openApiResource = new OpenApiResource();
            openApiResource.setResourcePackages(Set.of("com.example.api"));
            register(openApiResource);
            register(PreMatchRequestFilter.class);
            register(PostProcessResponseFilter.class);
            register(ResponseHeaderFilter.class);
            register(InternalRequestFilter.class);
            register(XssFilter.class);
        }
    }
```

`ThreadLocalParameterHolder` -> `ContainerRequestContext`

### Migrate to `spring-boot-starter-web`

Why: `spring-boot-starter-web` is incompatible with open api.

**Key changes:**

- `@GET` / `@POST` / `@PUT` / `@DELETE` / `@Produce` / `@Consume` / `@Path` -> `@RestController` / `@RequestMapping(method, consume, produce)`
- `Response` -> `ResponseEntity`
- `ContainerRequestFilter` / `ContainerResponseFilter` -> `jakarta.servlet.Filter` + `@WebFilter`
- `FormDataParam` -> `MultiPartFile`
- `PathParam` -> `PathVariable`
- `QueryParam` / `DefaultValue` -> `RequestParam(defaultValue, required)`
  - default `required = false` -> `required = true`, so need to manually add `required = false` to keep same behavior for api.
  - default value for primitive wrapper Object -> `null`, so need to manually add `defaultValue = 0 / false / 0L` to keep same behavior for api.
- Need to add `RequestBody` for payload

## Key features migration

### MQ

`com.rabbitmq` -> `spring-boot-starter-amqp`, xml to configuration, leveraged spring boot `@Conditional` feature.

### Mail

`javax.mail` -> `spring-boot-starter-mail`, some compatibility change.

### `org.mybatis` -> `mybatis-spring-boot-starter`

```xml
    <!-- Before -->
    <select id="queryById" resultMap="MyResultMap" parameterType="String">
        SELECT * FROM MY_TABLE WHERE ID=#{id}
    </select>

    <!-- After -->
    <select id="queryById" resultMap="MyResultMap" parameterType="long">
        SELECT * FROM MY_TABLE WHERE ID=#{id}
    </select>
```

### API Document

`io.swagger.swagger-jersey-jaxrs` 1.x -> `org.springdoc.springdoc-openapi-starter-webmvc-ui` 3.0.
Key changes:
    - `@Api(hidden)` -> `@Tag`, `@Hidden`
    - `@ApiOperation` -> `@Operation`
    - `@SecurityRequirement`

```java
    @Configuration
    @SecurityScheme(
            name = "ciToken",
            type = SecuritySchemeType.HTTP,
            scheme = "bearer",
            bearerFormat = "JWT"
    )
    @OpenAPIDefinition(
            info = @Info(
                    title = "MY API",
                    version = "v1",
                    description = "OpenAPI endpoint of MY Central API",
                    contact = @Contact(name = "Support Team", email = "ching91@sina.com")
            ),
            servers = {
                    @Server(url = "http://localhost:8021/api", description = "local server"),
                    @Server(url = "https://api.qa.com/api", description = "QA server"),
                    @Server(url = "https://api.com/api", description = "Production server")
            },
            security = @SecurityRequirement(name = "bearerToken")
    )
    public class OpenApiConfiguration {
    }
```

### Configuration

oauth.properties + redis.properties + api.properties + vip.properties + rabbitSSL.properties -> application.properties + profile

### Injection

`GetConfig.getAttribute` -> `@Value`

1. Spring way
2. User friendly for UT
3. Property access in fat jar

### Jasypt

`org.jasypt.jasypt` -> `spring-boot-starter-jasypt`, some compatibility changes.

### log4j2 -> logback

Spring boot default

### Fat class to single DTO

Single fat entity wrapper changed to one DTO per entity.

### serializer JAX-B -> Jackson

Why: seems new version of JAX-B do not support interface serialize:

```
org.glassfish.jaxb.runtime.v2.runtime.IllegalAnnotationsException: 2 counts of IllegalAnnotationExceptions
java.util.List is an interface, and JAXB can't handle interfaces.
this problem is related to the following location:
at java.util.List
at public java.util.HashMap com.example.entity.infrastructure.BRQFull.getServerMap()
at com.example.entity.infrastructure.BRQFull
at public com.example.entity.infrastructure.BRQFull com.example.entity.APIResultBase.getBRQFull()
at com.example.entity.APIResultBase
java.util.Set is an interface, and JAXB can't handle interfaces.
this problem is related to the following location:
at java.util.Set
at public java.util.HashMap com.example.entity.infrastructure.BRQFull.getVipNamesMap()
at com.example.entity.infrastructure.BRQFull
at public com.example.entity.infrastructure.BRQFull com.example.entity.APIResultBase.getBRQFull()
at com.example.entity.APIResultBase
```

Action:

```xml
<!-- JAXB API -->
<dependency>
    <groupId>jakarta.xml.bind</groupId>
    <artifactId>jakarta.xml.bind-api</artifactId>
</dependency>
<!-- JAXB Runtime -->
<dependency>
    <groupId>org.glassfish.jaxb</groupId>
    <artifactId>jaxb-runtime</artifactId>
</dependency>

<!-- Jackson -->
<dependency>
    <groupId>com.fasterxml.jackson.dataformat</groupId>
    <artifactId>jackson-dataformat-xml</artifactId>
</dependency>
```

**Key changes:**

- `@XmlRootElement(name)` -> `@JacksonXmlRootElement(localName)`
- `@XmlElement(name)` + `@XmlAttribute(name)` -> `@JacksonXmlProperty(isAttribute, localName)` + `@JsonProperty()`
- Add `@JsonInclude(JsonInclude.Include.NON_NULL)`
    - Jackson includes null properties by default
- Add `@JacksonXmlElementWrapper(useWrapping = false)` for collection entities (for content type `application/xml`).
    - By default, collection response will be wrapped by default:
    ~~~xml
    <!-- wrappered result -->
    <result errorCode="OKOKOK">
        <statusList>
            <statusList id="123" status="0"/>
            <statusList id="234" status="1"/>
        </statusList>
    </result>
    <!-- expected -->
    <result errorCode="OKOKOK">
        <statusList id="123" status="0"/>
        <statusList id="234" status="1"/>
    </result>
    ~~~

### remove useless code

#### DB Connection

Removed two side DB connection logic on api.

#### Dependencies

Optimized the dependencies: removed useless ones and resolved version conflict

#### Interfaces

- AutoConfigurationWebService
- EMSWebService
- GSBWebService
- GomezWebService
- ImpactRateWebService
- JabberWebService
- MappingTemplateWebService
- MavWebService
- RegisterManageWebService
- ServerPromoteWebService

## Some Interesting features

### `/` in the URL

Difference between `/api/v1/example` and `/api/v1/example/`?

```java
@GetMapping()
public String case1() {

}
@GetMapping("/")
public String case2() {
  
}
```

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void configurePathMatch(PathMatchConfigurer configurer) {
        configurer.setUseTrailingSlashMatch(true); // deprecated
    }
}
```

### `org.mybatis` -> `mybatis-spring-boot-starter`

MyBatis auto mapping: `OS` -> `os`

```xml
    <resultMap type="PluginPackage" id="PackageResultMap">
        <result property="os" column="STATION_OS"/>
        <result property="uploadTime" column="UPLOAD_TIME"/>
        <result property="packageName" column="PACKAGE_NAME"/>
    </resultMap>

    <select id="queryGrayPluginPackages" resultType="PluginPackage" resultMap="PackageResultMap">
        SELECT * FROM MY_PACKAGE 
        <where>
            PACKAGE_NAME_GRAY IS NOT NULL
            <if test="os != null and os != ''">
                AND UPPER(OS) = UPPER(#{os})
            </if>
        </where>
    </select>
```

```sql
create table my_package
(
    id                bigint       primary key,
    os                varchar(50),
    upload_time       timestamp,
    package_name      varchar(500),
    lastmodifiedtime  timestamp,
);
```
