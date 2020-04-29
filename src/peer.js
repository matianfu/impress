const path = require('path')
const { Readable, Writable, Duplex } = require('stream')

const uuid = require('uuid')

const Request = require('./request')

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
     * path => Request or Response
     */
    this.handlers = new Map()

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

  /**
   * Encode message to wire format
   */
  _write (msg, _, callback) {

    if (msg.body) throw new Error('deprecated message format')

    const { to, from, method, status, error, stream, data, chunk } = msg 
    const header = { to, from, method, status  }

    // error could be an Error, an object, a string TODO
    const hasError = !!error
    // stream must be an object 
    const hasStream = !!stream
    // data could be anything 
    const hasData = data !== undefined
    // chunk must be a Buffer
    const hasChunk = Buffer.isBuffer(chunk)

    if (hasError) header.error = ErrorStringify(error).length
    if (hasStream) header.stream = JSON.stringify(stream).length 
    if (hasData) header.data = JSON.stringify(data).length
    if (hasChunk) header.chunk = chunk.length

    this.conn.write(JSON.stringify(header))
    this.conn.write('\n')

    if (hasError) {
      this.conn.write(ErrorStringify(error))
      this.conn.write('\n')
    }

    if (hasStream) {
      this.conn.write(JSON.stringify(stream))
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

  /**
   * Decode message from raw data
   */
  receive (data) {
    while (data.length) {
      if (this.message) { 
        // expecting data or chunk
        const msg = this.message

        const hasError = Number.isInteger(msg.error)
        const hasStream = Number.isInteger(msg.stream)
        const hasData = Number.isInteger(msg.data)
        const hasChunk = Number.isInteger(msg.chunk)

        // buffer length
        const buflen = this.bufs.reduce((sum, c) => sum + c.length, 0)

        const bodylen = (hasError ? msg.error + 1 : 0) +
          (hasStream ? msg.stream + 1 : 0) +
          (hasData ? msg.data + 1 : 0) +
          (hasChunk ? msg.chunk + 1 : 0)

        if (buflen + data.length >= bodylen) {
          this.message = null
          let body = Buffer.concat([...this.bufs, 
            data.slice(0, bodylen - buflen)])
          this.bufs = []
          data = data.slice(bodylen - buflen)

          if (hasError) {
            const len = msg.error
            msg.error = JSON.parse(body.slice(0, len))
            body = body.slice(len + 1)
          }

          if (hasStream) {
            const len = msg.stream
            msg.stream = JSON.parse(body.slice(0, len))
            body = body.slice(len + 1)
          }

          if (hasData) {
            const len = msg.data
            msg.data = JSON.parse(body.slice(0, len)) // trailing LF is OK
            body = body.slice(len + 1)
          }

          if (hasChunk) {
            msg.chunk = body.slice(0, msg.chunk)
          }
          this.handleMsg(msg)
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
          if (msg.error || msg.stream || msg.data || msg.chunk) {
            this.message = msg
          } else {
            this.handleMsg(msg)
          }
        }
      }
    }
  }

  /**
   *
   */
  handleMsg (msg) {

    if (msg.hasOwnProperty('body')) throw new Error('old school message format')

    if (msg.method) {
      this.push(msg) 
    } else if (msg.status) {
      this.handleResponse(msg)
    } else {
      this.handleRaw(msg)
    }
  }

  /**
   *
   */
  handleResponse (msg) {
    const handler = this.handlers.get(msg.to)
    if (!handler) return
    handler.handleResponse(msg)
  }

  /**
   *
   */
  handleRaw (msg) {
    const handler = this.handlers.get(msg.to)
    if (!handler) return
    handler.handleRaw(msg)
  }

  /**
   * TODO rethink this function
   */
  respond (msg, status, body) {
    if (typeof msg.from !== 'string' || msg.noreply) return
    const { error, data, chunk } = body
    this.write({ to: msg.from, status, error, data, chunk })
  }

  /**
   * request callback
   * 
   * @callback requestCallback
   * @param {object} err
   * @param {object} props
   * @param {*}      props.data - JavaScript data
   * @param {buffer} props.buffer - node Buffer
   * @param {Readable} props.readable - readable stream
   * @param {Writable} props.writable - writable stream
   */

  /**
   * @param {string} method - verb
   * @param {string} to - resource path
   * @param {object} [body] - data to sent or stream settings 
   * @param {function} [callback] - callback must be provided if request is not
   *                                a stream
   */
  request (method, to, body, callback) {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    if (!methods.includes(method)) {
      throw new Error(`unknown method ${method}`)
    }

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
      throw new Error('trailing slash not allowed in path')
    }

    if (typeof body === 'function') {
      callback = body
      body = {}
    }

    if (typeof body !== 'object' || body === null) {
      throw new Error('body not a non-null object')
    }

    if (callback !== undefined && typeof callback !== 'function') {
      throw new Error('callback not a function')
    }

    const id = uuid.v4()
    const from = path.join('/#requests/', this.id, id) 

    const send = msg => this.write(msg)

    // TODO
    const onTerminated = from => {
    }

    // TODO
    const { data, chunk, stream } = body

    const req = new Request({ 
      id, to, from, method, send, onTerminated, data, chunk, stream
    })

    this.handlers.set(req.from, req)

    if (callback) {
      req
        .then(response => {
          callback(null, response) 
        }) 
        .catch(err => {
          try {
            callback(err)
          } catch (e) {
            console.log(e)
          }
        })
    }

    return req
  }

  /**
   * the callback signature is (err, response, body) => {} 
   */
  get (to, body, callback) {
    this.request('GET', to, body, callback)
  }

  post (to, body, callback) {
    this.request(to, 'POST', body, callback)
  }

  put (to, body, callback) {
    this.request(to, 'PUT', body, callback)
  }

  patch (to, body, callback) {
    this.request(to, 'PATCH', body, callback)
  }

  delete (to, body, callback) {
    this.request(to, 'DELETE', body, callback)
  }

}

module.exports = Peer
