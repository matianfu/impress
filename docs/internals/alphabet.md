This document defines message format.

# 1. Properties

All messages in RP can be represented by a JavaScript object that could be converted from a JSON object, plus an optional `chunk` property holding a node Buffer.

A message may have the following properties:

| name     | type                                |
| -------- | ----------------------------------- |
| `to`     | path string                         |
| `from`   | path string                         |
| `method` | enum string                         |
| `status` | ranged integer                      |
| `error`  | object `{ code, message }`          |
| `stream` | object `{ sink, source, flow }`     |
| `data`   | anything could be converted to JSON |
| `chunk`  | node Buffer                         |

# 2. Message Formats

There are 4 classes and 10 types of message defined:

1. Request
   1. Non-Streaming
   2. Streaming
2. Response
   1. Error
   2. Successful, Non-Streaming
   3. Successful, Streaming / Source
3. Stream
   1. Sink
   2. Data
   3. Meta Data (flow control)
   4. End (NULL)
4. Abort

## 2.1. Common and Specific Properties

All messages must have `to` property, otherwise it can not be routed.

`method` and `from` are specific to Request message; `status` is specific to Response message.

## 2.2. Request Message

### 2.2.1. Non-Streaming

Non-streaming request uses single message to send request data (if any). 

The message:

1. must have `method`;
2. `data` and `chunk` are optional;
3. `from` is optional. If not provided, there won't be a response. This is equivalent to *no_reply* option in some IPC or RPC design. 

Example:

```json
{
  "to": "/path/to/target",
  "from": "/path/of/source",
  "method": "GET",
  "data": "hello"
}
```

### 2.2.2. Streaming

Streaming request sends request data via a message stream. The first message is the request message, which

1. must have `method`, `from` and `stream`;
2. `data` and `chunk` are optional;

> `data` and `chunk` are allowed in current implementation, but may be forbidden in future if no real world use case is found.

Example:

```json
{
	"to": "/path/to/target",
	"from": "/path/of/source",
	"method": "GET",
  "stream": {}
}
```

## 2.3. Response Message

Response message replies to a request and has a status code. It may be an *error* or a *successful* response, depending on the status code like HTTP.

A *successful* response may carry all response data, or it may allocate a stream source for transferring data.

### 2.3.1. Error

1. must have a `status` ranging over `[400..600)`;
2. `error` is optional;

Example:

```json
{
  "to": "/path/to/request/source",
  "status": 400,
  "error": {
    "message": "data out of range",
    "code": "EINVAL"
  }
}
```

### 2.3.2. Successful, Non-Streaming

1. must a `status` ranging over `[200..300)`;
2. `data` and `chunk` are optional;

Example:

```json
{
  "to": "/path/to/request/source",
  "status": 200,
  "data": "data you want"
}
```

### 2.3.3. Successful, Streaming

1. must have a `status` ranging over `[200..300)`, 
2. must have `stream` with `stream.source` set to a valid resource path;
3. `data` and `chunk` are optional;

Example:

```json
{
  "to": "/path/to/request/source",
  "status": 200,
  "stream": {
    "source": "/path/to/requested/resource/#streams/1"
  }
}
```

## 2.4. Stream

### 2.4.1. Sink

This message replies to *streaming* request message. The message:

1. must have `stream` with `stream.sink` set to a valid resource path;
2. `stream` may have custom properties other than `sink`;

Example:

```json
{
  "to": "/path/to/request/source",
  "stream": {
    "sink": "/path/to/requested/resource/#streams/2"
  }
}
```

### 2.4.2. Data

This message carries stream data. It:

1. must have `to` set to the `stream.sink` in received Sink message;
2. must have either `data` or `chunk`;

Example:

```json
{
  "to": "/path/to/requested/resource/#streams/2",
  "data": {
    "hello": "world"
  }
}
```

## 2.5. Meta Data

The message is for exchanging stream-related meta data.

So far, only one kind of meta data is defined: `stream.flow`, which is a boolean value for flow-control.

The receiver sends `{ stream: { flow: false} }` to the sender to pause the stream and `{ stream: { flow: true } }` to resume it. 

The message has only `to` and `stream` properties.

Example:

```json
{
  "to": "/path/to/responding/resource/#streams/3",
  "stream": {
    "flow": "false"
  }
}
```

## 2.6. End

This message is equivalent to a NULL termination. It has only `to` property.

Example:

```json
{
  "to": "/path/to/responding/resource/#streams/4"
}
```

## 2.7. Abort

This message could be sent by either party to abort the stream.

It has only `to` and `error` properties.

Example:

```json
{
  "to": "/path/to/responding/resource/#streams/5",
  "error": {
    "message": "I cannot move on, sorry."
  }
}
```
> For allowing the request initiator to abort the request, the responder could reply with a stream, even if there is only single object. The responder could do so if preparing response is time consuming, or the operation is buffered in a queue. Responding with a stream gives the request initiator a chance to abort it.

# 3. Alphabet

Each type of message are assigned a letter in the following table, including an inaction.

| message type                       | letter     |
| ---------------------------------- | ---------- |
| Non-Streaming Request              | Q          |
| Streaming Request                  | U (upload) |
| Error Response                     | E          |
| Successful Response, Non-Streaming | B (body)   |
| Successful Response, Streaming     | O (source) |
| Stream Sink                        | I          |
| Stream Data                        | D          |
| Stream Meta Data                   | M          |
| Stream End                         | N (null)   |
| Stream Abort                       | A          |
| inaction                           | T          |

The set of all letters is the *alphabet*.

# 4. Language

A *language* a is a set of all possible message sequences.

The following diagrams are the language of RP. 

```
1. Non-Streaming Request, Error or Non-Streaming Successful Response:

Q       ->
            <- E|B

2. Non-Streaming Request, Streaming Successful Response:

Q       -> 
            <- O
M*A?    ->  <- D*(N|A)    # Strictly, the first `M` on left side 
                          # should not be sent before the first `D` 
                          # arrives. But this is harmless.

3. Streaming Request, Error Response

U       ->
            <- I
D*(N|A) ->  <- M*E

4. Streaming Request, Non-Streaming Successful Response

U       ->
            <- I
D*N     ->  <- M*
            <- B
5. Streaming Request, Streaming Successful Response

U       ->
            <- I
D*N     ->  <- M*
            <- O
M*A?    ->  <- D*(N|A)
```

# 5. Discussion on the Diagram

The diagram is essentially a sequence diagram, where messages are arranged top-down to indicate time sequence.

In our diagram, we have two modifications:
- messages from both sides are allowed in the same line, indicating the concurrency; in sequence diagram, this is drawn by a *parallel block*;
- multiple messages may be grouped into a regular expression, which is more flexible and expressive.

For example (the last case in previous chapter):

```
 1. U       ->
 2.             <-  I           # I after U
 3. D*N     ->  <-  M*          # D after I
 4.             <-  O           # O after N
 5. M*A?    ->  <-  D*(N|A)     # M after U
```

A new line is started when one side is allowed to send certain messages *after* certain message from the other side arrives.

This *expected* message is a `synchronizer`. In line 1 to 4, `U`, `I`, `N`, `O` are synchronizers.

Line 3 shows concurrency, where both sides send message freely. Fortunately the line has only one synchronizer `N`, so no confusion is raised on when to move to the next line in either side. The initiator moves to the next line after `N` is sent and the responder moves to the next line after `N` is received.

If both sides have synchronizers, there is a confusion. When does one side moves to the next line? The answer maybe:

1. after both ones received AND sent.
2. after one received.
3. after one sent.
4. after either one received OR sent.

Line 5 picks the last logic. Either side moves to the next line, either after it sends a synchrononizer, or after it receives one. (The next line may be a fictional one containing only *inaction*).

This OR logic is also applicable for line 3, if M is not treatd as a synchronizer. It also works in the last line in scenario 3.

Now we have a strict definition of how to move to next line for either side: 

*One side moves to the next line after either it sends its synchronizer, or it receives one from the other side*.





