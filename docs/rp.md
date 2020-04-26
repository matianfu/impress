本文档描述RP协议的设计和实现。

RP协议本身不限语言，有Wire Format定义；但本文档假设是讨论RP在`node.js`中的实现。

# 1. Request/Response

HTTP Request/Response是简单实用的设计。

简单体现在它的应用API事实上把TCP的Duplex Stream退化成了Half Duplex Stream，且只通讯一轮（round-trip）。

实用体现在它的泛化过程可以如下描述：

| step | request             |    | response |
|------|---------------------|----|----------|
| 1    | uri, method, [auth] | -> |          |
| 2    |                     | <- | 404 resouce not found<br/> 405 method not allowed<br/> 401 unauthorized<br/> 100 continue |
| 3    | request data        | ->
| 4    |			         | <- | 400 bad request<br/> 403 forbidden<br/> 500 internal error<br/> 503 unavailable<br/> 200 success
| 5    |                     | <- | response data	

在这个设计里充分考虑了网络带宽的有效利用和降低总体访问延迟，体现在：
1. 在上传大量request data之前，先检查uri, method, auth是否满足要求；如果满足，以100 CONTINUE继续；
2. 这个泛化过程可以退化，step 3 request data可以并入 step 1，相应的step 2和4合并，也可以继续合并step 5；
3. 没有提供流语义，step 3/5的流控、取消和结束都是在TCP层面完成，应用以流事件或错误事件处理；

> 这里存在*worse is better*的设计哲学，例如step 4的`200`返回后，step 5仍然可能出现错误，但这样设计容易处理；另一种设计方式是混合Request/Response语义和流语义（编程上相当于implements两个interface），例如把response data看作fragmented response，

# 2. Message

message是RP协议传输数据的最小单元；一个message是一个自包含、完整的数据结构。

message有两种格式，一种以JavaScript对象定义，另一种是传输格式，*Wire Format*；两者可以一一对应。

一个JavaScript对象格式的message例子如下：

```js
{
    to: '/path/to/recipient',   // 
    from: '/path/to/source',    // return address, source, or sink, optional
    method: 'GET',              // request
    status: 200,                // response
    body: {                     // mandatory
        meta,                   // metadata describe 
        data,                   // any JavaScript values excepts undefined
        error,                  // null or object
        chunk                   // Buffer,
    }
}
```

在RP中，通讯的双方均需维护一个namespace，即时一方只是请求方的角色；

`to`是目标资源标识；所有message必须有这个属性；其值是一个resource path；

`from`是可选的字段，它可以是`request`消息中的`return address`，或者在创建流的时候，作为先创建的source或者sink；`from`也是一个resource path；

resource path是一个normalized绝对路径，不可以有trailing slash；

一个message可以是request message，response message，或者raw message；

request message必须有method属性；method的合法值包括：

```
GET, 
POST, POST$, POSTS,
PUT， PUST$, PUTS,
PATCH, PATCH$, PATCHS,
DELETE, DELETE$  
``` 

`$`结尾的版本是这些操作无需返回，相当于no reply；

`S`结尾的版本，包括`POSTS`/`PUTS`/`PATCHS`，是流式上传内容的操作；

GET可以获得一个单一message返回，也可以获得一个下行stream，取决于应答方；

POST/PUT/PATCH只能是单一request message获得单一response message的方式；

如果一个message有status字段，则为response message；对于response message，如果status code为2xx，body包含data和chunk；如果status code为4xx/5xx，body只包含返回的error；







它看起来很象一个node里的request/response对象，只是简化很多。

# 3. Message Type

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

# 4. Message Properties

## 4.1. `to`

`to`是message recipient，格式为path string

## 4.2. `from`

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

## Stream

在RP里，stream用一对source和sink资源表述。

在restful语义下，source和sink都是动态的；stream仅作为`GET/POSTS/PUTS/PATCHS`中的内嵌过程实现；但这不意味着不可以存在静态的stream，比如通讯双方约定的、无需动态创建的source和sink资源。

stream的建立需要一轮请求和应答，双方分别建立sink和source，然后source一方开始向sink发送数据；这个『需要双方各自建立sink/source的资源标识』的设计方式不常见，这里用unix i/o类比一下。

如果两个unix进程需要通过pipe级联io，例如`A | B`，此时
1. `A`有一个output file descriptor；
2. `B`有一个input file descriptor；
3. `A`和`B`可以各自独立对file descriptor执行操作，例如close；

在这个例子里我们发现，如果一个stream是动态的：
1. 建立stream时，分配标识（file descriptor）的操作不可避免；
2. stream的双方，都需要一个stream的资源标识以执行close操作；这个资源标识看起来是“内部”的，但实际上影响的是对方；

在RP里，Sink一方的资源标识对Source一方而言就是它的file descriptor，反之亦然。双方都可以通过操作**对方**的资源标识，来实现对stream的操作。

1. DELETE sink相当于从发送方close流，包括正常的和异常的；
2. DELETE source相当于从接收方close流，取消继续接受；
3. PATCH source可以用于实现flow control；

流的数据传输使用raw message，在处理的时候当作`PUSH`操作处理，`PUSH`应该理解为一个伪操作，它和restful method的不同在于它不是一个request/response模式的操作。

## Null Termination

Stream支持使用raw message实现结束，包括正常和异常的；

在message body包含error的时候，认为是流结束标记，如果error是null，是正常结束；否则是异常结束；

## POSTS/PUTS/PATCHS

这一组以`S`结尾的操作，表示会通过Stream上传。

- 请求方先创建一个资源标识，该资源标识既是`respo

第一阶段，请求方先发出请求，应答方分配一个sink path；应答方应该记录`method`属性，但不需要记录`from`，协议不要求后续操作的`from`和第一个消息一致。

请求方获得sink path之后可以开始发送流消息；标准的结束方法是使用`DELETE`操作结束sink，`DELETE`的body如果包含error对象，则视为取消；否则视为`end`。

`eof`标记视为与无参数的`DELETE`等价，有`eof`标记的消息，需提供`from`。

## Source Stream

A source stream is created on 'server' side to respond a GET request. The stream is a Writable stream.


Events:

Write -> send written body to peer
End -> send EoF to peer (shouldUnmount)

Destroy -> send Error to peer (shouldUnmount)

Peer Delete -> emit Error and destroy
Peer Disconnect -> emit Error and destroy