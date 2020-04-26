const path = require('path')
const { Readable, Writable, Duplex } = require('stream')

const uuid = require('uuid')

const ErrorStringify = error => error === null 
  ? JSON.stringify(error)
  : JSON.stringify(error, Object.getOwnPropertyNames(error).slice(1))

class Peer extends Duplex {
  constructor (im, conn) {
    super({ 
      allowHalfOpen: false,
      readableObjectMode: true,
      writableObjectMode: true
    })

    this.bufs = []
    this.message = null
    
    this.id = uuid.v4()

    this.im = im
    this.conn = conn

    /**
     * id (uuid) => { id, msg, callback || Readable } 
     */
    this.requests = new Map()

    /**
     * id (uuid) => { id, msg, Writable }
     */
    this.sinks = new Map()

    this.responses = new Map()

    conn.on('data', data => {
      this.receive(data)
    })

    conn.on('finish', () => {
      console.log(this.tag || this.id, 'conn finish')
    })

    conn.on('end', () => {
      console.log(this.tag || this.id, 'conn end')
      this.push(null)
    })

    conn.on('close', () => {
      console.log(this.tag || this.id, 'conn close')
    })
  }

  _write (msg, _, callback) {
    const { to, from, method, status, body } = msg 

    const header = { to, from, method, status  }
    const { error, meta, data, chunk } = body

    // error could be an Error, an object, a string
    const hasError = !!error
    // meta must be an object 
    const hasMeta = !!meta
    // data could be anything 
    const hasData = data !== undefined
    // chunk must be a Buffer
    const hasChunk = chunk instanceof Buffer

    if (hasError) header.error = ErrorStringify(error).length
    if (hasMeta) header.meta = JSON.stringify(meta).length 
    if (hasData) header.data = JSON.stringify(data).length
    if (hasChunk) header.chunk = chunk.length

    this.conn.write(JSON.stringify(header))
    this.conn.write('\n')

    if (hasError) {
      this.conn.write(ErrorStringify(error))
      this.conn.write('\n')
    }

    if (hasMeta) {
      this.conn.write(JSON.stringify(meta))
      this.conn.write('\n')
    }

    if (hasData) {
      this.conn.write(JSON.stringify(data))
      this.conn.write('\n')
    }

    if (hasChunk) {
      this.conn.write(chunk)
      this.conn.write('\n')
    }

    callback()
  }

  _final (callback) {
    this.conn.end(callback)
  }

  _read (size) {
  }

  receive (data) {
    while (data.length) {
      if (this.message) { 
        // expecting data or chunk
        const msg = this.message

        const hasError = Number.isInteger(msg.error)
        const hasMeta = Number.isInteger(msg.meta)
        const hasData = Number.isInteger(msg.data)
        const hasChunk = Number.isInteger(msg.chunk)

        console.log('hasMeta', hasMeta)

        // buffer length
        const buflen = this.bufs.reduce((sum, c) => sum + c.length, 0)

        const bodylen = (hasError ? msg.error + 1 : 0) +
          (hasMeta ? msg.meta + 1 : 0) +
          (hasData ? msg.data + 1 : 0) +
          (hasChunk ? msg.chunk + 1 : 0)

        if (buflen + data.length >= bodylen) {
          this.message = null
          let body = Buffer.concat([...this.bufs, data.slice(0, bodylen - buflen)])
          this.bufs = []
          data = data.slice(bodylen - buflen)
          msg.body = {}

          if (hasError) {
            const len = msg.error
            msg.body.error = JSON.parse(body.slice(0, len))
            body = body.slice(len + 1)
          }
          delete msg.error

          if (hasMeta) {
            const len = msg.meta
            msg.body.meta = JSON.parse(body.slice(0, len))
            body = body.slice(len + 1)
          }
          delete msg.meta

          if (hasData) {
            const len = msg.data
            msg.body.data = JSON.parse(body.slice(0, len)) // OK with trailing LF
            body = body.slice(len + 1)
          }
          delete msg.data

          if (hasChunk) {
            msg.body.chunk = body.slice(0, msg.chunk)
          }
          delete msg.chunk
          this.push(msg)

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
          if (msg.error || msg.meta || msg.data || msg.chunk) {
            this.message = msg
          } else {
            this.push(msg)
          }
        }
      }
    }
  }

  /**
   *
   */
  handleRequest (msg, peer, next) {
     
  }

  /**
   *
   */
  request (to, method, body, callback) {
    if (typeof to !== 'string') {
      throw new TypeError('request path not a string')
    }

    if (path.normalize(to) !== to) {
      throw new Error('request path not normalized')
    }

    if (!path.isAbsolute(to)) {
      throw new Error('request path not an absolute one')
    }

    if (to !== '/' && to.endsWith('/')) {
      throw new Error('trailing slash (/) not allowed in request path')
    }

    const methods = ['GET', 'POST', 'POST$', 'PUT', 'PUT$', 'PATCH', 'PATCH$', 'DELETE']
    if (!methods.includes(method)) {
      throw new Error(`unknown method ${method}`)
    }

    if (typeof body === 'function') {
      callback = body
      body = {}
    }

    if (typeof body !== 'object' || body === null) {
      throw new Error('body not a non-null object')
    }

    if (typeof callback !== 'function') {
      throw new Error('callback not a function')
    }

    const id = uuid.v4()
    const from = path.join('/#requests/', this.id, id) 
    const msg = { to, from, method, body }
    const req = { id, method, callback }

    this.write(msg)
    this.requests.set(id, req) 
  }

  get (to, body, callback) {
    this.request(to, 'GET', body, callback)
  }

  post (to, body, callback) {
    this.request(to, 'POST', body, callback)
  }

  postNr (to, body, callback) {
    this.request(to, 'POST$', body, callback)
  }

  put (to, body, callback) {
    this.request(to, 'PUT', body, callback)
  }

  putNr (to, body, callback) {
    this.request(to, 'PUT$', body, callback)
  }

  patch (to, body, callback) {
    this.request(to, 'PATCH', body, callback)
  }

  patchNr (to, body, callback) {
    this.request(to, 'PATCH$', body, callback)
  }

  delete (to, body, callback) {
    this.request(to, 'DELETE', body, callback)
  }

  deleteNr (to, body, callback) {
    this.request(to, 'DELETE$', body, callback)
  }

  posts (to, body) {
    return this.im.peerPosts(this, to, body)
  }

  respond (msg, status, body) {
    if (typeof msg.from !== 'string' || msg.noreply) return
    this.write({ to: msg.from, status, body })
  }

  createSourceStream (msg, peer) {
    const id = uuid.v4() 
    const from = path.join(msg.to, '#sources', this.id, id)
   
    const writable = new stream.Writable({
      objectMode: true,
      write (body, encoding, callback) {
        this.write({ to: this.to, body })
        callback()
      },

      destroy () {
        // TODO
      },

      final (body, encoding, callback) {
        if (typeof body === 'function') {
            
        }
      },

      detach () {
        
      }
    })

    writable.to = msg.from
    writable.from = from
    writable.peer = peer
  }
}

module.exports = Peer
