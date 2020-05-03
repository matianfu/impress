<span style="font-size:24pt;">Appendix</span>



# 回顾HTTP

一次HTTP请求包括两个stream，request和response，泛化的步骤可以见下表；


| step | request             |    | response | message |
|------|---------------------|----|----------|---------|
| 1    | uri, method, [auth] | -> |          | {}      |
| 2    |                     | <- |404 not found<br/>405 method not allowed<br/>401 unauthorized<br/>100 continue |
| 3    |	request data stream, (close)| -><br/><- |400 bad request<br/>403 forbidden<br/>500 internal error<br/>503 unavailable<br/>|
| 4    |                     | <- |200 success|
| 5    |  (close)            | <- | response data stream, (close) |





请求方的消息种类：

1. 非流式请求（步骤1）
2. 流式请求开始（步骤1）
3. 流式请求数据（步骤3）
4. 流式请求数据结束（步骤3）
5. 流式请求数据中止（步骤3）
6. 中止流失应答（步骤5）

应答方的消息种类：

1. 应答继续（步骤2）
2. 应答错误（步骤2/4）
3. 非流式应答成功（步骤4）
4. 流式应答数据（步骤4）
5. 流式应答数据结束（步骤5）
6. 流式应答数据中止（步骤5）





在请求数据较大的时，请求方应先发送部分请求（步骤1），在应答方验证通过后（步骤2）再继续传输数据（步骤3）。

如果请求数据不大，请求方步骤1/3合并，应答方步骤2/4合并；如果应答数据不大，应答方步骤4/5合并。

在请求方发送请求数据时（步骤3），如果应答方认为数据有误操作无法完成，应答方无需等待到全部请求数据传输结束，可立刻返回（步骤4）中的错误。

HTTP基于TCP连接假设设计；如下错误由TCP层提供，无对应HTTP原语：

1. 步骤3请求方提前关闭连接（中止发送）；
3. 步骤5请求方提前关闭连接（放弃接受）；
3. 步骤5应答方提前关闭连接（中止发送）；

# 讨论

RP使用消息传递和一个可靠连接替代HTTP的网络传输层。

一个消息格式如下：

```js
{
    to: '/path/to/target',
    from: '/return/address',
    method: 'VERB',
    status: 200,
        
    error: 'for error',        
    meta: 'for streaming',
    data: 'for json value',
    chunk: 'for binary data'
}
```

`to`是每个消息的目标；

`from`可以是多重角色；

`method`包括GET, POST, PUT, PATCH, DELETE



















最基本的method是`PUSH`，没有提供method的message缺省当作`PUSH`，它是最基础的send原语。

Request和Response模式是基于message passing构建的。它包含：

request message (handshake + data)

response message (handshake + data)

error, meta, (data + chunk), 看作三个channel，

error不是in-band data，而且它的scope比meta高，error可以终止request/response过程，meta则仅和stream的



# Request Message

