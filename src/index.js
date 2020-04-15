const path = require('path')
const EventEmitter = require('events')
const stream = require('stream')
const net = require('net')

const uuid = require('uuid')
const { flatten } = require('array-flatten')

const { Duplex } = stream

const methods = require('./router/methods')
const Router = require('./router')

const finalhandler = () => {}

const Peer = require('./peer')

/**
 * message in JavaScript object
 * {
 *   to: 'path string',
 *   from: 'path string',
 *   method: 'GET',     // request message
 *   status: 100,       // response message (verb: respond)
 *   body: {
 *     data: 'any JSON object, including array, or values',
 *     chunk: Buffer.alloce(12345)
 *   }
 * }
 *
 * message header in JSON format
 * ```json
 * {
 *   "to": "path string",
 *   "from": "path string",
 *   "method": "GET",
 *   "status": 100,
 *   "data": 123, 
 *   "chunk": 345 
 * }
 * ```
 *
 * ${header}\n    
 * ${data}\n      # only if data is provided (not undefined)
 * ${chunk}\n     # only if chunk is provided (not undefined)
 */

class Impress extends EventEmitter {
  /**
   * @param {object} options
   */
  constructor (opts) {
    super()

    // each connection is a peer
    this.peers = []

    /**
     * root router
     */
    this.router = Router({ caseSensitive: true, strict: true })

    this.router.route('/#requests/:peerId/:id')
      .respond((msg, peer) => {
        const { peerId, id } = msg.params
        const req = peer.requests.get(id)
        
        if (req) {
          if (msg.status === 200) {
            peer.requests.delete(id)
            return req.callback(null, msg.body)
          } 

          if (msg.status === 201) {
            if (req.method === 'GET') {
              const readable = new stream.Readable({ 
                objectMode: true, 
                read (size) {} 
              })
              req.readable = readable
              req.source = msg.body.data
              const callback = req.callback
              delete req.callback 
              callback (null, readable) 
            } else {
              req.writable.handle(msg)
            }
          } else {
            const err = new Error()
            req.callback(err)
          }
        }
      }) 
      .push((msg, peer) => {
        const { peerId, id } = msg.params
        const req = peer.requests.get(id)

        const { data, error, chunk } = msg.body

        if (error) return this.emit(error)

        if (data !== undefined || chunk) {
          const body = {}
          if (data !== undefined) body.data = data
          if (chunk) body.chunk = chunk
          req.readable.push(body)
        }

        if (error === null) req.readable.push(null)
      })

    // this.conn.on('end', () => console.log(this.role + ' end'))
    // this.conn.on('finish', () => console.log(this.role + ' finish'))
    // this.conn.on('close', () => console.log(this.role + ' close'))
  }

  addPeer (conn) {
    const peer = new Peer(this, conn)   
    peer.on('data', msg => this.handle(msg, peer)) 
    peer.on('error', error => this.handleError(err))

    peer.on('finish', () => console.log(peer.tag || peer.id, 'finished'))
    peer.on('end', () => {
      const idx = this.peers.find(p => p === peer)
      if (idx === -1) return
      this.peers = [...this.peers.slice(0, idx), ...this.peers.slice(idx + 1)]
      
      console.log(peer.tag || peer.id, 'end')
    })

    this.peers.push(peer)
    return peer
  }

  /**
   * listen on a port or socket, all incomming connections are added to peers
   */
  listen (...args) {
    const listener = args.length && typeof args[args.length - 1] === 'function' && args.pop()

    this.server = net.createServer(conn => {
      const peer = this.addPeer(conn)
    })

    this.server.on('error', err => {}) 
    this.server.listen(...args, () => {
      if (listener) listener()
    })
  }

  close () {
    this.server.close()
  }

  /**
   * connect to given host
   */
  connect (...args) {
    const conn = net.createConnection(...args)
    return this.addPeer(conn)
  }

  /**
   * callback is used to override default finalhandler (404)
   */
  handle (msg, peer, callback = finalhandler(msg, peer, {})) {
    msg.url = msg.to

    msg.method = msg.method || (msg.status ? 'RESPOND' : 'PUSH')
    this.router.handle(msg, peer, callback)
  }

  peerGet (peer, to, body, callback) {
    if (typeof body === 'function') {
      callback = body
      body = {}
    } 

    if (typeof body !== 'object') {
      process.nextTick(() => callback(new TypeError('body not an object')))
      return
    }

    const id = uuid.v4()
    const from = path.join('/#requests', peer.id, id) 
    const msg = { to, from, method: 'GET', body }
    const req = { id, method: 'GET', msg, callback }

    peer.write(msg)
    peer.requests.set(id, req)
  }

  peerPosts (peer, to, body = {}) {
    const id = uuid.v4()
    const from = path.join('/#requests', peer.id, id)
    const msg = { to, from, method: 'POSTS', body }

    class Writable1 extends stream.Writable {
      constructor (peer, to, body) {
        super({ objectMode: true })
        this.state = 0    // expect status message
        this.peer = peer
        this.sink = null
      }

      _write (body, _, callback) {
        if (this.sink) {
          this.peer.write({ to: this.sink, body })
          callback()
        } else {
          this.pending = { body, callback }
        }
      }

      _final (callback) {
        this.peer.delete(this.sink, (err, body) => {
          this.endResponse = { err, body }
          callback()
        })
      }

      end (callback) {
        super.end(() => {
          const { err, body } = this.endResponse
          callback(err, body)
        })
      }

      handle (msg) {
        if (this.state === 0) {
          if (msg.status === 201) {
            this.state = 1

            this.sink = msg.body.data
            if (this.pending) {
              const { body, callback } = this.pending
              delete this.pending
              this.peer.write({ to: this.sink, body })
              callback()
            }
          }
        }
      }
    } 

    const writable = new Writable1(peer, to, body)
    const req = { id, msg, writable }
    peer.write(msg)    
    peer.requests.set(id, req)
    return writable
  }

  peerDelete (peer, to, body, callback) {
    if (typeof to !== 'string') throw new TypeError('invalid recipient')

    if (typeof body === 'function') {
      callback = body
      body = {}
    }

    const id = uuid.v4()
    const from = path.join('/#requests', peer.id, id)
    const msg = { to, from, method: 'DELETE', body }
    const req = { id, method: 'DELETE', callback }

    peer.write(msg)
    peer.requests.set(id, req)
  }
}

methods.forEach(method => {
  Impress.prototype[method] = function (...args) {
    this.router[method](...args)
    return this
  } 
})

const impress = (opts) => new Impress(opts)
impress.Router = Router

module.exports = impress
