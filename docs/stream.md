This document discusses the design of stream class in `impress`.

initiator and responder

responder side: source (writable), sink (readable, respond)

initiator side: up-stream (writable, request), down-stream (readable)


| action \ stream | source | sink               | up     | down      |
|-----------------|--------|--------------------|--------|-----------|
| handle PUSH     | no     | yes                | n/a    | yes       |
| handle DELETE   | abort  | abort/end (reply)  | abort  | abort/end |
| handle RESPOND  | no     | no                 | yes    | no        |
| connectionError | yes    | yes                | yes    | yes       |



Stacked Concept Model

```
--------------------
|      Stream      |
--------------------
| Request/Response |
--------------------
```

A stream is either a sequence of fragmented request, or a sequence of fragmented response.

