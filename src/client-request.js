const EventEmitter = require('events')
const stream = require('stream')

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
 * Request is HEAVY for non-pipe request/response round-trip.
 */
const Mixin = base => class extends base {
  /**
   * @param {object}          props
   * @param {function}        props.send
   * @param {function}        props.onTerminated
   * @param {string}          props.id
   * @param {string}          props.from
   * @param {string}          props.method
   * @param {string}          [props.accept] -
   * @param {*}               [props.data] - any js value except undefined
   * @param {buffer}          [props.buffer] - node buffer
   * @param {object}          [props.pipe] - object
   */
  constructor (props) {
    props.objectMode = true
    props.autoDestroy = true

    super(props)

    this._send = props.send
    this._onClose = props.onClose

    this.id = props.id
    this.to = props.to
    this.from = props.from

    this.sink = undefined
    this.source = undefined

    this.method = props.method

    this.promise = new Promise((resolve, reject) => {
      this.thenable = { resolve, reject }
    })

    this.response = null

    const { data, blob, pipe } = props

    /** 
     * outgoing pipe config
     */
    this._pipe = null
    if (pipe && typeof pipe === 'object' && !Array.isArray(pipe)) {
      this._pipe = pipe
    }

    this.once('error', err => this.destroy(err))
    // this.once('close', () => this._onTermidated(this.id, this.from))
    this.once('close', () => this._onClose(this.id, this.from))

    if (this._pipe) { // duplex
      this._send({
        to: this.to,
        from: this.from,
        method: this.method,
        pipe: this._pipe
      })
    } else { // readable
      this._send({
        to: this.to,
        from: this.from,
        method: this.method,
        data, 
        blob
      })
    }
  }

  /**
   * stream.Writable's internal _final method
   */
  _final (callback) {
    if (this._pipe) {
//      this._send({ to: this.sink, from 
      callback()
    } else {
      callback()
    }
  }

  /**
   *
   */
  _destroy (err, callback) {
    if (this._pipe) {
      callback()
    } else {
      callback()
    }
  }

  /**
   * stream.Readable's internal _read method
   */
  _read (size) {
  }

  handleMessage (msg) {
    if (msg.status) {
      this.handleResponse(msg)
    } else { 
      this.handleRaw(msg)
    }
  }

  /**
   *
   */
  handleResponse ({ status, data, blob, pipe }) {
    if (status >= 200 && status < 300) {
      if (pipe) {
        if (pipe.source) {
          this.source = pipe.source
        }

        if (data !== undefined || blob) {
          const msg = {}
          if (data !== undefined) msg.data = data
          if (blob) msg.blob = blob
          this.thenable.resolve(msg)
        } else {
          this.thenable.resolve({ readable: this })
        }
      } else {
        if (data !== undefined || blob) {
          const msg = {}
          if (data !== undefined) msg.data = data
          if (blob) msg.blob = blob
          this.thenable.resolve(msg)
        } else {
          this.thenable.resolve({ readable: this })
        }
      }
    } else if (status >= 400 && status < 600) {
    } else {
      // invalid status TODO
    }
  }

  /**
   *
   */
  handleRaw ({ error, pipe, data, blob }) {
    // 
    if (pipe && pipe.sink) {
      this.sink = pipe.sink
      if (this.pendingWrite) {
        const { chunk, encoding, callback } = this.pendingWrite
        delete this.pendingWrite
        const { data, blob } = chunk
        this._send({ to: this.sink, from: this.from, data, blob})
        callback()
      }
      return
    }

    if (pipe && pipe.source) {
      throw new Error('pipe.source should be set via response message')
    }

    if (data !== undefined || blob) {
      const msg = {}
      if (data !== undefined) msg.data = data
      if (blob) msg.blob = blob
      this.push(msg)
    } else {
      this.push(null)
    }
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

class Writable extends Mixin(stream.Writable) {

  /**
   * stream.Writable's internal _write method
   */
  _write (chunk, encoding, callback) {
    if (this.sink) {
      const { data, blob } = chunk
      this._send({ 
        to: this.sink, 
        from: this.from,
        data,
        blob
      })
      callback()
    } else {
      this.pendingWrite = { chunk, encoding, callback }
    }
  }

  _final (callback) {
    if (this.sink) {
      this._send({ 
        to: this.sink
      })
      callback() 
    }
    // TODO
  } 
}

class Emitter extends Mixin(EventEmitter) {

}

/**
 *
 */
class ClientRequest {
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
  constructor (props) {
    if (props.pipe) {
      return new Writable(props)
    } else {
      return new Emitter(props)
    }
  }
}

module.exports = ClientRequest
