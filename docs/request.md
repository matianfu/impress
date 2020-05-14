# Initiator

`Initiator` is the client request library for RP, similar to `ClientRequest` and `IncommingMessage` (for response) in Node http.

`Initiator` separates its interfaces into three distinct objects.

1. The `initiator` object talks to transport layer.
2. `initiator.req` is the request object.
3. `initiator.res` is the response object.

Internally, three objects works synchronously like a single object.

# Transport Interface

1. `send`, required, same signature with `writable.write()`; 
2. `drain`, provided;
3. `handleMessage`, provided;

# Request Object

`initiator.req` represents the asynchronous operation for request => response.

If the request consists of only one message, `initiator.req` is a `Emitter` with `destroy()` and emits `error`, `response` and `close` events.

If the request has multiple messages, `initiator.req` is a `Writable`, indicating that `write()`, `end()` and `finish` event are also available.

`initiator.req` guarantees to emit either `error` or `response`, which also means `destroy()` always trigger an `error` event. If no error provided as argument, `Destroy()` constructs an Error with `EDESTROYED` as error code.

`initiator.req` *closes* right after the first response message arrives. This differs from that of Node `http.ClientRequest`, which is modeled as an underlying stream with a response stream as its sub-stream and closes simultaneously with the response stream.

# Response Object

`initiator.res` is defined as `{ status, error, data, chunk, stream }`.

For error status, only `error` property is concerned. For successful status, `data`, `chunk` and `stream` are concerned. 

`stream` is only available when the response contains of multiple messages. It is a subclass of `Readable` buffering not only data, but also error before `readable.resume()` is invoked. This guarantees the newly constructed stream could be passed asynchronously. Errors won't be thrown until handlers are hooked.

# Internal States

*State Pattern* is used for robust error handling.

1. Handshaking (request stream)
2. Requesting (request stream)
3. Requested (expecting response)
4. Responded (may have sub-states)
5. Error (error status code is not considered to be an error)

# Notes

* This is a sugar-free implementation. Everthing should be kept minimal and orthogonal for easy testing.

