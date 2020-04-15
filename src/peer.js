const path = require('path')
const { Duplex } = require('stream')

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

    conn.on('data', data => this.receive(data))

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
    const { data, error, chunk } = body
 
    // data could be anything 
    const hasData = data !== undefined
    // error must be an Error
    const hasError = error === null || error instanceof Error
    // chunk must be a Buffer
    const hasChunk = chunk instanceof Buffer

    if (hasData) header.data = JSON.stringify(data).length
    if (hasError) header.error = ErrorStringify(error).length
    if (hasChunk) header.chunk = chunk.length

    this.conn.write(JSON.stringify(header))
    this.conn.write('\n')

    if (hasData) {
      this.conn.write(JSON.stringify(data))
      this.conn.write('\n')
    }

    if (hasError) {
      this.conn.write(ErrorStringify(error))
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

        const hasData = Number.isInteger(msg.data)
        const hasError = Number.isInteger(msg.error)
        const hasChunk = Number.isInteger(msg.chunk)

        // buffer length
        const buflen = this.bufs.reduce((sum, c) => sum + c.length, 0)
        const bodylen = (hasData ? msg.data + 1 : 0) + 
          (hasError ? msg.error + 1 : 0) +
          (hasChunk ? msg.chunk + 1 : 0)

        if (buflen + data.length >= bodylen) {
          this.message = null
          let body = Buffer.concat([...this.bufs, data.slice(0, bodylen - buflen)])
          this.bufs = []
          data = data.slice(bodylen - buflen)
          msg.body = {}

          if (hasData) {
            const len = msg.data
            msg.body.data = JSON.parse(body.slice(0, len)) // OK with trailing LF
            body = body.slice(len + 1)
          }
          delete msg.data

          if (hasError) {
            const len = msg.error
            msg.body.error = JSON.parse(body.slice(0, len))
            body = body.slice(len + 1)
          }
          delete msg.error

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
          if (msg.data || msg.chunk) {
            this.message = msg
          } else {
            this.push(msg)
          }
        }
      }
    }
  }

  get (to, body, callback) {
    this.im.peerGet(this, to, body, callback) 
  }

  posts (to, body) {
    return this.im.peerPosts(this, to, body)
  }

  delete (to, body, callback) {
    this.im.peerDelete(this, to, body, callback)
  }

  respond (msg, status, body) {
    if (typeof msg.from !== 'string' || msg.noreply) return
    this.write({ to: msg.from, status, body })
  }
}

module.exports = Peer
