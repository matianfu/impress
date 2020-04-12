本文档描述RP协议的设计和实现。

RP协议本身不限语言，有Wire Format定义；但本文档假设是讨论RP在`node.js`中的实现。

# 1. Message

message是RP协议传输数据的最小单元；一个message是一个自包含、完整的数据结构。

message有两种格式，一种以JavaScript对象定义，另一种是传输格式，*Wire Format*；两者可以一一对应。

一个JavaScript对象格式的message例子如下：

```js
{
    to: '/path/to/target',      // target, mandatory
    from: '/path/to/source',    // source, optional
    method: 'GET',
    body: {                     // mandatory
        data,                   // object, array, primitive values, optional
        chunk                   // Buffer, optional
    }
}
```

它看起来很象一个node里的request/response对象，只是简化很多。

# 2. Message Type

RP中使用message替代HTTP来实现restful资源模型。

如果request/response均为不大的JSON数据，在RP中，使用一个request message和一个response message即可完成任务。

如果request/response中有一个为stream；RP要求通讯双方首先通过一轮message交换显式建立stream，然后通过stream message传输stream内容；最终在流结束时，如果有需要，应答方向请求方再次发送response。

以上要求可以看出RP需要三种类型的message：request, response, 和stream message；

在message的数据结构中，并没有一个`kind`或者`type`字段标识message类型；如果message具有`method`字段，该message为request message；如果message具有`status`字段，该message为response message；如果message不具有method或者status字段，该message为raw message；目前仅在stream中使用raw message，所以raw message也称为stream message。











在介绍Message的属性之前先说一下Message的类型。

RP的Message仅用于下面两种情况：

1. Request/Response模式，一方发出Message请求，另一方应答；
2. 如果Request或者Response中的一个是Stream；

每个message包含`to`, `from`, 和`body`；

`to`是一个`path string`，类似url，所有message必须提供该属性；

`from`也是一个`path string`；`from`不是必须提供的；从命名上，`from`与`to`相对且简洁，但实际上`from`在不同上下文下有不同的解释；对于*request/response*模式来说，`from`相当于请求方提供了一个`reply-to`地址；对于`stream`来说，`from`相当于提供了一个先准备好的`source`或者`sink`；



`from`属性实际上是向对方发送一个channel，这样对方可以向该channel发送数据，或者对该channel执行资源操作；不是所有的情况下都需要这个属性，例如：

1. request message中，`POST`, `PUT`, `PATCH`, `DELETE`操作允许不提供该属性，意味着noreply；
2. response message不需要该属性；
3. raw stream message不需要该属性；在建立stream的时候，source/sink双方已经有对方的channel了。

如果一个message有method，意味着这是一个request message，如果有status，意味着这个message是response message；如果两者都没有，这是一个raw message，raw message仅用于stream；

body是应用层交换的数据内容，可以是一个JavaScript对象，值，Buffer，或者`undefined`。

在传输时，`body`从`message`对象中取出，单独发送，其余部分称为`header`，这个`header`和`body`分离的message格式称为wire format；

如果message不具有body属性，则header和message没有区别；其wire format为message转换称为单行的JSON格式，加上`\n`结尾；

```
${header}\n
```

如果message有body属性，header为message中移除body属性的部分，加上length属性；

如果length为正整数，则body为json格式，length是字符串的长度；如果length为0，则body为json格式，length未提供，接收方可以以lf结尾为判断依据；如果length为负整数，则body是二进制数据，即Buffer。在实现上，length=0暂不支持。

length不包含结尾的linefeed (`\n`)。

```
${header}\n${body}\n
```

Wire format的问题：

1. 是否允许body直接内嵌在header里？

好处：减少一次JSON

# 3. Message Properties

## 3.1. `to`

`to`是message recipient，格式为path string

## 3.2. `from`

`from`在字面的含义上是消息的发出者；但它实际上的含义是接收方拿到的一个channel（π calculus意义上的name/channel），在request/response上下文下，它应该被解释为`reply-to`；在stream上下文下，它应该被解释为`source`，可以类比(input) file descriptor。










在传输时一个Message的header和body永远是分开的；在header中包含body的长度，这样对


有三种类型的Message，分别是Request，Response，和Stream。

Request具有`method`属性；`method`支持`GET`, `POST`, `PUT`, `PATCH`， `DELETE`五种操作。

```js
{
    to: '/path/to/sink',
    from: '/path/to/source',
    method: 'GET',  // GET, POST, PUT/PUTN, PATCH/PATCHN, DELETE
    length: 0
    type: 
}
```

Response具有`status`属性，status可以是1xx, 2xx, 3xx, 4xx, 5xx的status code (number).

```js
{
    to: '/path/to/sink',
    from: '/path/to/source',
    status: 100,
    body: {

    }
}
‵‵`


```js
{
    to: '/path/to/sink',
    from: '/path/to/source',
    eof: true, // optional
    body: {

    }
}
```


一个message可以有`method`，如果它是


关于Data

Data是可以支持所有JavaScript的primitive类型的值的，但是实现上，在流中使用null，是不安全的；

实现上，在流中的message，如果data是null，这个message将不会产生任何消息。


GET object

- -> GET /path/to/replication from /path/to/source
- <- status 2xx/4xx/5xx body

GET stream

- -> to REPLICATION from SINK, GET ...  
- <- to SINK, status 100 + body { source, binary: true }
- <- to SINK, data packet
- <- to eof flag or DELETE

POST stream

- -> to REPLICATION from SOURCE, POST { binary: true }
- <- to SOURCE, status 100 + body { sink, }
- -> to SINK
- -> to SINK, data packet with eof or DELETE
- <- 
