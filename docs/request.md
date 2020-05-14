# Initiator

`Initiator` is the client request library for RP, similar to `ClientRequest` (request) and `IncommingMessage` (response) in Node http.

`Initiator` separates its interfaces into three distinct objects.

1. The `initiator` object interfaces itself to underlying transport layer.
2. `initiator.req` is the request object.
3. `initiator.res` is the response object. 

Internally, three objects works synchronously like a single object.

# Transport Interface

1. `send`, required, same signature with `writable.write()`; 
2. `drain`, provided;
3. `handleMessage`, provided;

# Stages

`Initiator` models request-response as an asynchronous operation, possibly with a response stream, which is NOT included in the asynchronous operation in in terms of life cycle.

Request object (`initiator.req`) is responsible for the asynchronous operation, which **closes** when the first response message arrives. Then the object is unusable.

If there is a response stream, it has its own `destroy()`, `error` and `close` events.

This model differs from that of Node http, where request is a stream and response is a sub-stream.

# Request Object

`initiator.req` represents the asynchronous operation for request => response, where the request data consists of one or more messages (stream).

It is a `Emitter` if the request consists of one message, or a `Writable` if the request have multiple messages. 

In either case, it has `destroy` and emits `error`, `response` and `close`. If it is `Writable`, `write`, `end` and `finish` event are available.

`destroy` always trigger an `error` event with `EDESTROYED` as its error code.

After request object terminates, the destroy is an alias to destroy method on the response stream.

# Response Object

`initiator.res` is a plain object defined as `{ status, error, data, chunk, stream }`.

For error status, only `error` property is concerned. For successful status, `data`, `chunk` and `stream` are concerned. 

`stream` is only available when the response contains of multiple messages. It is a `Readable` stream. 

> Actually it is implemented by a subclass of `Readable` which buffers not only data, but also error events before `readable.resume()` is invoked. This guarantees the stream could be passed asynchronously until someone hooks its handlers.

`stream` duplicates the `destroy` method and `error` events from `initiator.req`.

Noting that the object who is responsible for handling errors from one or more requests, and the object(s) who consume(s) response data, may not be the same one. Either one can trigger the `destroy()` for its own reason and the other or others get notified.

# Internal States

*State Pattern* is used for robust error handling.

1. Initial, tick to Handshaking or Requested
2. Handshaking (optional)
3. Requesting (optional)
4. Requested
5. Responded (may have sub-states)
6. Error, before emitting `error`, `initiator` should enter this state.

When emitting `response`, `Initiator` should be in `Responded` state; when emitting `error`, it should be in `Error` state.

When error occurs, `Initiator` goes to `Error` state, where all interface methods are frozen and `error` is emitted via `initiator.req`, and `initiator.res.stream` if available.

For life cycle management, `peer` can hook on the `close` event on `initiator.req`.

# `http.ClientRequest` in Node.js

In node.js, `http.ClientRequest` class has `write`, `end`, `destroy` methods and emits `finish` and `close` events. All methods and event handlers have the same signature with that of `stream.Writable`. But a class object is NOT an `instanceof stream.Writable`.

This could be done like how `stream.Duplex` inherits `stream.Writable`.

REF: [how can instanceof duplex be both writable and readable](https://stackoverflow.com/questions/41154544/how-can-instanceof-duplex-be-both-writable-and-readable)

