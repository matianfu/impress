# 1. Introduction

`impress` is a minimal Node.js implementation of the Resource Protocol, `RP`.

`RP` could be understood as *HTTP RESTful on any transport*. Services implemented via `RP` could easily be accessed by other parties via TCP/TLS, custom peer-to-peer connection, inter-process communication, or a link, such as serial or bluetooth.

`RP` is inspired by 9P in Plan 9, which is the network protocol connecting everything in a Plan 9 system.

# 2. User Interface

## 2.1. `Impress`

An `Impress` instance maintains a bunch of connections with other *peers*. The application exposes its *resources* to or accesses resources on other peers via this `Impress` instance.

### 2.1.1. factory

```js
const impress = require('impress')
const app = impress()
```

### 2.1.2. `listen` and `close`

### 2.1.3. `connect`

### 2.1.4. `addPeer`

`addPeer` is a peer connection.

### 2.1.5. use

### 2.1.6. get, put, post, patch, & delete

## 2.2. `Peer`






