# 1. Initiator

`Initiator` is the client request library for RP, similar to `ClientRequest` and `IncommingMessage` (for response) in Node [http](https://nodejs.org/dist/latest/docs/api/http.html).

`Initiator` separates its interfaces into three distinct objects.

1. The `initiator` object talks to transport layer.
2. `initiator.req` is the request object.
3. `initiator.res` is the response object.

Internally, three objects works synchronously like a single object.

# 2. Transport Interface

1. `send`, required, same signature with `writable.write()`; 
2. `drain`, provided;
3. `handleMessage`, provided;

# 3. Request Object

`initiator.req` represents the asynchronous operation for request => response.

If the request consists of only one message, `initiator.req` is a `Emitter` with `destroy()` and emits `error`, `response` and `close` events.

If the request has multiple messages, `initiator.req` is a `Writable`, indicating that `write()`, `end()` and `finish` event are also available.

`initiator.req` guarantees to emit either `error` or `response`, which also means `destroy()` always trigger an `error` event. If no error provided as argument, `Destroy()` constructs an Error with `EDESTROYED` as error code.

`initiator.req` *closes* right after the first response message arrives. This differs from that of Node `http.ClientRequest`, which is modeled as an underlying stream with a response stream as its sub-stream and closes simultaneously with the response stream.

# 4. Response Object

`initiator.res` is defined as `{ status, error, data, chunk, stream }`.

For error status, only `error` property is concerned. For successful status, `data`, `chunk` and `stream` are concerned. 

`stream` is only available when the response contains of multiple messages. It is a subclass of `Readable` buffering not only data, but also error before `readable.resume()` is invoked. This guarantees the newly constructed stream could be passed asynchronously. Errors won't be thrown until handlers are hooked.

# 5. State Machine

*State Pattern* is used for robust error handling.

## 5.1. States

1. Handshaking (request stream)
2. Requesting (request stream)
3. Requested (expecting response)
4. Successful (status code)
   1. Single (only one message)
   2. Source (indicating a stream)
   3. Streaming
   4. End
   5. Failed
5. Failed (error or error status code)

## 5.2. Methods and Events

- initiator
   - disconnect
   - drain
   - handleMessage
      - EBOIDMNA
   - destroy

## 5.3. Transition Table

### 5.3.1. Handshaking

This state does not send `abort` message to the other party.

This state does not emit anything.

|            | valid | Handshaking  |
| ---------- | ----- | ------------ |
| disconnect | y     | Failed       | 
| drain      | y     | (do nothing) |
| write      | y     | (buffer)     |
| end        | y     | (buffer)     |
| destroy    | y     | Failed       | 
| error      | y     | Failed       |
| body       |       | Failed       |
| source     |       | Failed       |
| sink       | y     | Requesting   |
| data       |       | Failed       |
| meta       |       | Failed       |
| null       |       | Failed       |
| abort      |       | Failed       |



# 6. Notes

* This is a sugar-free implementation. Everything is kept minimal and orthogonal for easy testing.

