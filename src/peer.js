const Path = require('path')
const { Readable, Writable, Duplex } = require('stream')

const uuid = require('uuid')
const debug = require('debug')('impress:peer')

const IncomingMessage = require('./incoming-message')
const ServerResponse = require('./server-response')
const ClientRequest = require('./client-request')

const ErrorStringify = error => error === null 
  ? JSON.stringify(error)
  : JSON.stringify(error, Object.getOwnPropertyNames(error).slice(1))

/**
 *
 */
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
          if (msg.error || msg.stream || msg.data || msg.chunk) {
            this.message = msg
          } else {
            this.handleMessage(msg)
          }
        }
      }
    }
  }

  /**
   *
   */
  handleMessage (msg) {
    debug(msg)

    if (msg.hasOwnProperty('body')) throw new Error('old school message format')

    if (msg.method) {
      if (msg.stream) {
        const id = uuid.v4()
        const imsg = new IncomingMessage({ id,
          path: Path.join(msg.to, '#streams', this.id, id) }, msg)
        this.push(imsg)
      } else {
        this.push(msg) 
      }
    } else if (msg.status) {
      this.handleResponse(msg)
    } else {
      this.handleRaw(msg)
    }
  }

  handleMessage (msg) {
    debug(msg)

    if (msg.method) {
      const id = uuid.v4()
      const path = Path.join(msg.to, '#streams', this.id, id)
      const props = { id, path, send: this.write.bind(this), }
      const res = new ServerResponse(props, msg)

      this.handlers.set(res.path, res)

      res.on('close', () => this.handlers.delete(path))
      this.push({ req: res.req, res }) 
    } else {
      const res = this.handlers.get(msg.to)
      if (res) {
        res.handleMessage(msg)
      } else {
        console.log('res not found')
      }
    }
  }

  /**
   * TODO rethink this function
   */
  respond (msg, status, body) {
    if (typeof msg.from !== 'string') return
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

    if (Path.normalize(to) !== to) {
      throw new Error('request path not normalized')
    }

    if (!Path.isAbsolute(to)) {
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
    const from = Path.join('/#requests/', this.id, id) 
    const path = from

    const send = msg => this.write(msg)

    // TODO
    const onClose = (id, path) => {
    }

    // TODO
    const { data, chunk, stream } = body

    const req = ClientRequest({ 
      id, to, path, method, send, onClose, data, chunk, stream
    })

    this.handlers.set(req.path, req)

    if (callback) {
      req
        .then(response => callback(null, response)) 
        .catch(err => callback(err, {}))
    }

    return req
  }

  /**
   * the callback signature is (err, msg) => {} where 
   * msg is { data, chunk, readable } 
   */
  get (to, body, callback) {
    if (typeof body === 'function') {
      callback = body
      body = {}
    }

    if (!callback) {

      body = body || {}

      return new Promise((resolve, reject) => {
        this.request('GET', to, body, (err, response) => {
          if (err) {
            reject(err)
          } else {
            resolve(response)
          }
        }) 
      })
    } else {
      return this.request('GET', to, body, callback)
    }
  }

  post (to, body, callback) {
    return this.request('POST', to, body, callback)
  }

  put (to, body, callback) {
    return this.request('PUT', to, body, callback)
  }

  patch (to, body, callback) {
    return this.request('PATCH', to, body, callback)
  }

  delete (to, body, callback) {
    return this.request('DELETE', to, body, callback)
  }
}

module.exports = Peer
