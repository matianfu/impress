const EventEmitter = require('events')
const { Readable, Writable, Duplex } = require('stream')

/**
 *
 * | step | client-request       |    | server-response         |
 * |------|----------------------|----|-------------------------|
 * | 1    | uri, method, [auth]  | -> |                         |
 * | 2    |                      | <- | 404 not found           |
 * |      |                      |    | 405 method not allowed  |
 * |      |                      |    | 401 unauthorized        |
 * |      |                      |    | 100 continue            |
 * | 3    | request data (close) | -> | (incoming-message)      |
 * |      |                      | <- | 400 bad request         |
 * |      |                      |    | 403 forbidden           |
 * |      |                      |    | 500 internal error      |
 * |      |                      |    | 503 unavailable         |
 * | 4    |                      | <- | 200 success             |
 * | 5    | (close)              | <- | response data (close)   |
 *
 * Request is a duplex stream and a thenable.
 * Request does NOT support builder pattern.
 *
 * Request is HEAVY for non-stream request/response round-trip.
 */
const Mixin = Base => class extends Base {
  /**
   * @param {object}          props
   * @param {function}        props.send
   * @param {function}        props.onTerminated
   * @param {string}          props.id
   * @param {string}          props.path
   * @param {string}          props.method
   * @param {string}          [props.accept] -
   * @param {*}               [props.data] - any js value except undefined
   * @param {buffer}          [props.buffer] - node buffer
   * @param {object}          [props.stream] - object
   */
  constructor (props) {
    super(props)
    this._send = props.send
    this._onClose = props.onClose

    this.id = props.id
    this.to = props.to
    this.path = props.path
    this.method = props.method

    this.promise = new Promise((resolve, reject) => {
      const listenResponse = response => {
        this.removeListener('error', listenError)
        resolve(response)
      }

      const listenError = err => {
        this.removeListener('response', listenResponse)
        reject(err)
      }

      this.once('response', listenResponse)
      this.once('error', listenError)
    })

    this.promise.then(() => {}).catch(e => {})

    this.state = 'INIT'

    this.sink = undefined
    this.response = null

    this.once('error', err => {
      // this.destroy(err) 
    })

    this.once('close', () => this._onClose(this.id, this.from))
  }

  /**
   *
   */
  handleConnectionLost () {

  }

  /**
   * thenable
   */
  then (...args) {
    return this.promise.then(...args)
  }
}

/**
 * Error Handling
 *
 *
 */
class StreamRequest extends Mixin(Duplex) {
  constructor (props) {
    props.objectMode = true
    props.autoDestroy = true

    super(props)

    const { data, chunk, stream } = props
    this.stream = stream
    this._send({
      to: this.to,
      from: this.path,
      method: this.method,
      data,
      chunk,
      stream
    })
    this.sink = undefined
    this.state = 'HANDSHAKE'
  }

  /**
   * stream.Writable's internal _write method
   */
  _write (msg, encoding, callback) {
    if (this.sink) {
      const { data, chunk } = msg
      this._send({
        to: this.sink,
        from: this.from,
        data,
        chunk
      })
      callback()
    } else {
      this.pendingWrite = { msg, encoding, callback }
    }
  }

  /**
   * stream.Writable's internal _final method
   */
  _final (callback) {
    if (this.sink) {
      this._send({ to: this.sink })
      this.state = 'REQUESTED'
      callback()
    } else {
      this.pendingEnd = { callback } 
    }
  }

  /**
   *
   */
  _destroy (err, callback) {
    if (this._stream) {
      callback()
    } else {
      callback()
    }
  }

  /**
   *
   * | state         | sink       | 4xx/5xx | 2xx       |
   * |---------------|------------|---------|-----------|
   * | HANDSHAKE     | REQUESTING | ERROR   | ERROR     |
   * | REQUESTING    | ERROR      | ERROR   | ERROR     |
   * | REQUESTED     | ERROR      | ERROR   | RESPONDED |
   *
   * HANDSHAKE - first message sent, expecting a stream.sink
   * REQUESTING - writing stream data, expecting nothing
   * REQUESTED - stream is ended, expecting a response with status code
   * ERROR - final state with error
   * RESPONDED -  success, may be but not necessarily a final state
   */
  handleMessage ({ status, error, stream: opts, data, chunk }) {
    switch (this.state) {
      case 'HANDSHAKE': {
        if (opts.sink) {
          this.sink = opts.sink
          this.state = 'REQUESTING'
          if (this.pendingWrite) {
            const { msg, encoding, callback } = this.pendingWrite
            delete this.pendingWrite
            const { data, chunk } = msg
            this._send({ to: this.sink, from: this.path, data, chunk })
            callback()
          } else if (this.pendingEnd) {
          }
        }
      } break
      case 'REQUESTED': {
        if (status === 200) {
          if (opts) {
            this.source = opts.source

            const stream = new Readable({
              objectMode: true,
              autoDestroy: true,
              read () {}
            })
            stream.opts = opts
            this.response = { data, chunk, stream }
          } else {
            this.response = { data, chunk }
          }

          this.state = 'RESPONDED'
          this.emit('response', this.response)
        }
      } break
      case 'RESPONDED': {
        if (this.source) {
          if (data !== undefined || chunk) {
            const msg = {}
            if (data !== undefined) msg.data = data
            if (chunk) msg.chunk = chunk
            this.response.stream.push(msg) 
          } else {
            this.response.stream.push(null) 
          }
        }
      } break
      default: {
      }
    }
  }
}

/**
 * SimpleRequest simulates destroy method and emits error, end, close
 */
class SimpleRequest extends Mixin(Readable) {
  constructor (props) {
    props.objectMode = true
    props.autoDestroy = true

    super(props)
    const { to, path, method, data, chunk } = props

    process.nextTick(() => {
      const msg = { to, from: path, method }
      if (data !== undefined) msg.data = data
      if (chunk) msg.chunk = chunk

      // this._send({ to, from: path, method, data, chunk })
      this._send(msg)
      this.state = 'REQUESTED'
      this.emit('end')
    })
  }

  /**
   * > Destroy the stream, and emit the passed 'error' and a 'close' event. 
   * > After this call, the writable stream has ended and subsequent calls to 
   * > write() or end() will result in an ERR_STREAM_DESTROYED error. 
   * 
   * Send an error/abort message to the responder if appropriate
   *  
   * node stream.Writable: 
   * 1. destory() calls _destroy() synchronously
   * 2. _destroy callback emits error and close asynchronously (nextTick)
   * see: https://gist.github.com/matianfu/39127d0ddd99d8fb2b1c15592bd4b8b4
   *
   * destroy is the fuse-blowing method for error handling
   */
  destroy (err) {
    if (this.state === 'INIT') {
         
    } 

    process.nextTick(() => {
      if (err) this.emit('error', err)
      this.emit('close')
    })
  }

  handleMessage ({ status, error, stream, data, chunk }) {
    if (this.state === 'REQUESTED') {
      // TODO error if status not set or invalid

      const res = {}
      if (status >= 200 && status < 300) {
        if (stream) {

          const destroy = err => this.destroy(err)

          res.stream = Object.assign(new Readable({
            objectMode: true,
            autoDestroy: true,
            read (size) {}
          }), stream)

          // this.stream = stream
          // res.stream = this

        } else {
          if (data !== undefined) res.data = data
          if (chunk) res.chunk = chunk
        }
      } else {
        // TODO accept string
        if (error) res.error = error
      }

      this.response = res
      this.state = 'RESPONDED'
      this.emit('response', res)
    } else {
      const msg = {}
      if (data !== undefined) msg.data = data
      if (chunk) msg.chunk = chunk

      if (Object.keys(msg).length) {
        this.response.stream.push(msg)
      } else {
        this.response.stream.push(null)
      }
    }
  }
}

/**
 * @param {object}          props
 * @param {function}        props.send
 * @param {function}        [props.onClose]
 * @param {string}          props.id
 * @param {string}          props.path
 * @param {string}          props.method
 * @param {*}               [props.data] - any js value except undefined
 * @param {buffer}          [props.chunk] - node buffer
 * @param {object}          [props.stream] - stream opts
 */
const ClientRequest = props => {
  if (props.stream) {
    return new StreamRequest(props)
  } else {
    return new SimpleRequest(props)
  }
}

ClientRequest.SimpleRequest = SimpleRequest
ClientRequest.StreamRequest = StreamRequest

module.exports = ClientRequest
