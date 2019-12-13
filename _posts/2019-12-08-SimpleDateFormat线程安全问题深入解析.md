---
layout: post
title: SimpleDateFormat线程安全问题深入解析
date: 2019-12-08
categories: Source Code
tags: 
  - Java
  - SimpleDateFormat
  - 线程安全
  - 多线程
---

# 背景

众所周知，Java中的**SimpleDateFormat**不是线程安全的，在多线程下会出现意想不到的问题。本文将解析**SimpleDateFormat**线程不安全的具体原因，从而加深对**线程安全**的理解。

# 例子

简单的测试代码，当多个线程同时调用**parse**方法的时候会出问题：
~~~Java
public class SimpleDateFormatTest {
    private static SimpleDateFormat format = new SimpleDateFormat("yyyy/MM/dd HH:mm:ss");

    public static void main(String[] args) {
        for (int i = 0; i < 20; i++) {
            new Thread(() -> {
                try {
                    System.out.println(format.parse("2019/11/11 11:11:11"));
                } catch (ParseException e) {
                    e.printStackTrace();
                }
            }).start();
        }
    }
}
~~~

部分输出如下：
~~~Java
Mon Nov 11 11:11:11 GMT 2019
Thu Jan 01 00:00:00 GMT 1970
java.lang.NumberFormatException: For input string: ""
	at java.lang.NumberFormatException.forInputString(NumberFormatException.java:65)
	at java.lang.Long.parseLong(Long.java:601)
	at java.lang.Long.parseLong(Long.java:631)
	at java.text.DigitList.getLong(DigitList.java:195)
	at java.text.DecimalFormat.parse(DecimalFormat.java:2051)
	at java.text.SimpleDateFormat.subParse(SimpleDateFormat.java:2162)
	at java.text.SimpleDateFormat.parse(SimpleDateFormat.java:1514)
	at java.text.DateFormat.parse(DateFormat.java:364)
	at package1.SimpleDateFormatTest.lambda$0(SimpleDateFormatTest.java:17)
	at package1.SimpleDateFormatTest
	at java.lang.Thread.run(Thread.java:745)
java.lang.NumberFormatException: empty String
	at sun.misc.FloatingDecimal.readJavaFormatString(FloatingDecimal.java:1842)
	at sun.misc.FloatingDecimal.parseDouble(FloatingDecimal.java:110)
	at java.lang.Double.parseDouble(Double.java:538)
	at java.text.DigitList.getDouble(DigitList.java:169)
	at java.text.DecimalFormat.parse(DecimalFormat.java:2056)
	at java.text.SimpleDateFormat.subParse(SimpleDateFormat.java:2162)
	at java.text.SimpleDateFormat.parse(SimpleDateFormat.java:1514)
	at java.text.DateFormat.parse(DateFormat.java:364)
	at package1.SimpleDateFormatTest.lambda$0(SimpleDateFormatTest.java:17)
	at package1.SimpleDateFormatTest
	at java.lang.Thread.run(Thread.java:745)
~~~

不出意外，每次跑都会报错，偶尔还会出现输出初始时间**Thu Jan 01 00:00:00 GMT 1970**以及其他莫名其妙的时间。好的，记住这两个错误，下面我们仔细分析。

# 分析

**SimpleDateFormat**继承自**DateFormat**这个抽象类，UML图如下：
![SimpleDateFormat UML](/assets/img/article-img/SourceCode/SimpleDateFormat%20Thread%20Safe/SimpleDateFormat%20UML.png)

**DateFormat**中有两个全局变量需要注意
~~~Java
public abstract class DateFormat extends Format {

    //日历变量，作为DateFormat的辅助
    protected Calendar calendar;

    //用来Format数字，默认为DecimalFormat
    protected NumberFormat numberFormat;
}

public class DecimalFormat extends NumberFormat {
    //DecimalFormat中的全局变量，用来存放转化好的数据
    //digitList用科学技计数表示，如2019表示成0.2019x10^4
    private transient DigitList digitList = new DigitList();
}
~~~

这两个变量的初始化在**SimpleDateFormat**的构造方法里初始化。
看了类结构，我们仔细分析一下**DateFormat**的**parse**方法，直接上代码(省略掉了一些无关紧要的代码)：
~~~Java
public Date parse(String text, ParsePosition pos)
{
    ......
    //注意这个变量calb，日期的转化是通过CalendarBuilder这个类来完成的
    CalendarBuilder calb = new CalendarBuilder();

    //按照DateFormat的pattern逐个循环(年月日时分秒...)
    for (int i = 0; i < compiledPattern.length; ) {
        ......
        //最终调用subParse方法给calb赋值
        start = subParse(text, start, tag, count, obeyCount, ambiguousYear, pos, useFollowingMinusSignAsDelimiter, calb);
    }
    Date parsedDate;
    try {
        //调用CalendarBuilder的establish方法，把值传递给变量calendar
        //通过calendar来获取最终返回的日期
        //注意，这里calendar是个全局变量
        parsedDate = calb.establish(calendar).getTime();
    }
    ......

    return parsedDate;
}
~~~

主要分为如下几个步骤：
> 1. 定义一个**CalendarBuilder**对象**calb**，用来临时保存parse结果。
> 2. 根据**DateFormat**定义的**Pattern**，for循环调用**subParse**方法，将目标字符串逐个(年月日时分秒...)转化，并存储在**calb**变量里。
> 3. 调用**calb.establish(calendar)**方法，把暂存在**calb**里的数据设置到全局变量**calendar**里。
> 4. 现在**calendar**里已经包含转换过的日期数据，最后调用**Calendar.getTime()**方法返回日期。

## 问题之一
下面看一下**subParse**方法里面做了什么，实现上有什么问题。先看代码(省略掉了一些无关紧要的代码)：
~~~Java
public class SimpleDateFormat extends DateFormat {
    private int subParse(String text, int start, int patternCharIndex, int count,
                    boolean obeyCount, boolean[] ambiguousYear,
                    ParsePosition origPos,
                    boolean useFollowingMinusSignAsDelimiter, CalendarBuilder calb) {
        //一些变量初始化
        ......

        //内部调用numberFormat的parse方法，转化数字
        //这里的numberFormat就是上面分析过的那个全局变量，默认实例是DecimalFormat
        //text是代转字符串"2019/11/11 11:11:11", pos是位置，如2019会被转化为0.2019x10^4
        number = numberFormat.parse(text, pos);
        if (number != null) {
            //转化成int值，如0.2019x10^4会转化成2019
            value = number.intValue();
        }
        int index;
        switch (patternCharIndex) {
        case PATTERN_YEAR:      // 'y'
            //有年，月，日等等各种case，这里只拿PATTERN_YEAR(年)这种情况举例子
            //将numberFormat parse出来的值set到calb里面去
            calb.set(field, value);
            return pos.index;
        }

        ......

        // 转义失败
        origPos.errorIndex = pos.index;
        return -1;
    }
}

//numberFormat.parse(text, pos)方法实现
public class DecimalFormat extends NumberFormat {

    public Number parse(String text, ParsePosition pos) {
        //内部调用subparse方法，将text的内容set到digitList上
        if (!subparse(text, pos, positivePrefix, negativePrefix, digitList, false, status)) {
            return null;
        }
        ......

        //将digitList转变为目标格式
        if (digitList.fitsIntoLong(status[STATUS_POSITIVE], isParseIntegerOnly())) {
            //parse为Long型
            longResult = digitList.getLong();
        } else {
            //parse为double型
            doubleResult = digitList.getDouble();
        }
        .....

        return gotDouble ? (Number)new Double(doubleResult) : (Number)new Long(longResult);
    }

    private final boolean subparse(String text, ParsePosition parsePosition,
                String positivePrefix, String negativePrefix,
                DigitList digits, boolean isExponent,
                boolean status[]) {
        //一些判断及变量初始化准备
        ......

        //digitList在这个方法里面叫digits,先对digits先清零处理。
        //decimalAt指小数点位置，如0.2019x10^4中decimalAt就是4
        //count指数字位数，如0.2019x10^4中count就是4
        digits.decimalAt = digits.count = 0;

        backup = -1;
        for (; position < text.length(); ++position) {
            //循环内部对digits一顿猛如虎的赋值操作，设置科学计数法各个部分的变量
            //注意这个digits是一个全局变量
            ......
        }

        //还要对digits继续操作
        if (!sawDecimal) {
            digits.decimalAt = digitCount; // Not digits.count!
        }
        digits.decimalAt += exponent;

        ......
        return true;
    }
}
~~~

看到这里，有点并发编程经验的同学估计就能看出问题了。在**subparse**这个方法里面不加保护，当多个线程同时对全局变量**digits(digitList)**进行操作时，这个变量很可能是个无效的值。比如线程A把值设置了一半，另一个线程B把值又清零初始化了。于是线程A在后面**digitList.getDouble()**和**digitList.getLong()**的时候要么得到意料之外的值，要么直接报错**NumberFormatException**。

## 问题之二

那么后面的步骤有没有问题呢？继续往下看。
前面说到，方法会先把parse好的值放到**CalendarBuilder**型的临时变量**calb**里面，然后调用**establish**方法，将**calb**中缓存的值设置到**SimpleDateFormat**的**calendar**变量中，下面看看**establish**方法：
~~~Java
class CalendarBuilder {
    Calendar establish(Calendar cal) {
        ......
        //这个cal是SimpleDateFormat中的成员变量calendar
        //先将cal中的数据清除初始化，跟上面digitList一样的套路
        cal.clear();
        
        for (int stamp = MINIMUM_USER_STAMP; stamp < nextStamp; stamp++) {
            for (int index = 0; index <= maxFieldIndex; index++) {
                if (field[index] == stamp) {
                    //前面CalendarBuild暂存的值都放在field数组里，
                    //这里将数组中的值逐个赋给cal
                    cal.set(index, field[MAX_FIELD + index]);
                    break;
                }
            }
        }

        if (weekDate) {
            //设置cal的weekdate field
            cal.setWeekDate(field[MAX_FIELD + WEEK_YEAR], weekOfYear, dayOfWeek);
        }
        return cal;
    }
}
~~~

还是同样的问题，由于**calendar(cal)**是个全局变量，当多个线程同时调用establish方法的时候，会有线程安全问题。举个简单的例子，线程A原先赋值好了"2019/11/11 11:11:11"，结果线程B调用了**cal.clear()**将数据又给清掉了，于是线程A回到了解放前，输出了日期"1970/01/01 00:00:00"。

# 解决办法
对于线程安全的解决办法，给方法加同步**synchronize**是最简单的，相当于线程只能一个一个地访问**parse**方法：
~~~Java
    synchronize (this) {
        System.out.println(format.parse("2019/11/11 11:11:11"));
    }
~~~

当然更common的使用姿势是配合**ThreadLocal**使用，相当于给每个线程都定义了一个**format**变量，线程间互不影响：
~~~Java
    private ThreadLocal<SimpleDateFormat> format = new ThreadLocal<SimpleDateFormat>(){  
        @Override  
        protected SimpleDateFormat initialValue() {  
            return new SimpleDateFormat("yyyy/MM/dd HH:mm:ss");  
        }  
    };

    System.out.println(format.get().parse("2019/11/11 11:11:11"));
~~~

不过最推荐的还是，不要用**SimpleDateFormat**，而是用Java8新引入的类**LocalDateTime**或者**DateTimeFormatter**，不仅线程安全，而且效率更高。

# 总结

本文从代码层面分析了**SimpleDateFormat**线程不安全的原因。**subparse**和**establish**两个方法都可能导致问题，前者还会抛出*Exception*。
总结下来，问题都是出在**全局变量**上。所以当我们定义**全局变量**的时候一定要谨慎，注意变量是不是线程安全。
