const path = require('path')
const EventEmitter = require('events')
const stream = require('stream')
const uuid = require('uuid')

const { flatten } = require('array-flatten')

const methods = require('./router/methods')
const Router = require('./router')

const finalhandler = () => {}

/**
 * {
 *   to: 'path string',
 *   from: 'path string',
 *   body: {
 *     data:
 *     chunk:
 *   }
 * }
 *
 *
 * {
 *   to: 'path string',
 *   from: 'path string',
 *   data: 
 *   chunk: 
 * }
 */
class Request {
  constructor (impress) {
    this.im = impress
    this.map = new Map()

    this.dir = '/#requests'

    this.im.router
      .route(path.join(this.dir, ':id'))
      .respond(msg => {
        const id = msg.params.id
        const req = this.map.get(id)
        
        if (req) {
          if (msg.status === 200) {
            this.map.delete(id)
            return req.callback(null, msg.body)
          } 

          if (msg.status === 201) {
            const readable = new stream.Readable({ objectMode: true, read (size) {} })
            req.readable = readable
            req.source = msg.body.data

            const callback = req.callback
            delete req.callback 

            callback (null, readable) 
          } else {
            const err = new Error()
            req.callback(err)
          }
        }
      }) 
      .push(msg => {
        const id = msg.params.id
        const req = this.map.get(id)

        req.readable.push(msg.body) 
        if (msg.eof) req.readable.push(null)
      })
  }

  get (to, body, callback) {
    if (typeof body === 'function') {
      callback = body
      body = {}
    } 

    if (typeof body !== 'object') {
      return process.nextTick(() => callback(new TypeError('body not an object')))
    }

    const id = uuid.v4()
    const from = path.join(this.dir, id) 
    const msg = { to, from, method: 'GET', body }
    const req = { id, msg, callback }

    this.im.send(msg)
    this.map.set(id, req) 
  }
}

class Impress extends EventEmitter {
  /**
   * @param {object} conn - a connection
   */
  constructor (conn, role) {
    super()

    this.conn = conn
    this.role = role

    /**
     * buffer header or body fragments
     */
    this.bufs = []

    /**
     * buffer incomplete message
     */
    this.message = null

    /**
     * root router
     */
    this.router = Router({ caseSensitive: true, strict: true })
    this.request = new Request(this)

    this.conn.on('data', data => this.receive(data))

    // this.conn.on('end', () => console.log(this.role + ' end'))
    // this.conn.on('finish', () => console.log(this.role + ' finish'))
    // this.conn.on('close', () => console.log(this.role + ' close'))
  }

  /**
   * @param {object} msg
   * @param {string} msg.to - path string
   * @param {string} msg.from - path string
   * @param {string} [msg.method] - request method 
   * @param {number} [msg.status] - status code
   * @param {boolean|object} [msg.eof] - eof flag
   */

  // TODO validate method, noreply, status, eof
  send ({ to, from, method, status, eof, body }) {
    const header = { to, from, method, status, eof }
    const { data, chunk } = body

    const hasData = data !== undefined
    const hasChunk = chunk instanceof Buffer

    if (hasData) header.data = JSON.stringify(data).length
    if (hasChunk) header.chunk = chunk.length

    this.conn.write(JSON.stringify(header))
    this.conn.write('\n')

    if (hasData) {
      this.conn.write(JSON.stringify(data))
      this.conn.write('\n')
    }

    if (hasChunk) {
      this.conn.write(chunk)
      this.conn.write('\n')
    }
  }

  /**
   * Decode generate message from incoming data
   */
  receive (data) {
    while (data.length) {
      if (this.message) { 
        // expecting data or chunk
        const msg = this.message
        const hasData = Number.isInteger(msg.data)
        const hasChunk = Number.isInteger(msg.chunk)

        // buffer length
        const buflen = this.bufs.reduce((sum, c) => sum + c.length, 0)
        const bodylen = hasData ? msg.data + 1 : 0 + hasChunk ? msg.chunk + 1 : 0

        if (buflen + data.length >= bodylen) {
          this.message = null
          let body = Buffer.concat([...this.bufs, data.slice(0, bodylen - buflen)])
          this.bufs = []
          data = data.slice(bodylen - buflen)
          msg.body = {}

          if (hasData) {
            const len = msg.data
            msg.body.data = JSON.parse(body.slice(0, len)) // OK with trailing LF
            body = body.slice(len)
            delete msg.data
          }

          if (hasChunk) {
            msg.body.chunk = body.slice(0, msg.chunk)
            delete msg.chunk
          }

          this.handleMessage(msg)
        } else {
          this.bufs.push(data)
          data = data.slice(data.length)
        }
      } else {
        // expecting header
        const idx = data.indexOf('\n')
        if (idx === -1) {
          this.bufs.push(data.slice(0, data.length))
          data = data.slice(data.length)
        } else {
          const msg = JSON.parse(Buffer.concat([...this.bufs, data.slice(0, idx)]))
          this.bufs = []
          data = data.slice(idx + 1)
          if (msg.data || msg.chunk) {
            this.message = msg
          } else {
            this.handleMessage(msg)
          }
        }
      }
    }
  }

  /**
   * all messages are handled via routing, no hacking
   * not all messages have methods, messages without method will be set to 'NOP' 
   */
  handleMessage (msg) {
    msg.url = msg.to
    if (!msg.method) msg.method = msg.status ? 'RESPOND' : 'PUSH'
    msg.role = this.role
    this.handle(msg, this)
  }

  /**
   * callback is used to override default finalhandler (404)
   */
  handle (req, res, callback) {
    const router = this.router
    let done = callback || finalhandler(req, res, {})

    if (!router) {
      done()
      return
    }

    router.handle(req, this, done)
  }
}

methods.forEach(method => {
  Impress.prototype[method] = function (...args) {
    this.router[method](...args)
    return this
  } 
})

const impress = (conn, role) => new Impress(conn, role)
impress.Router = Router

module.exports = impress
