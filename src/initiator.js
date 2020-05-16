const Emitter = require('events')
const { Writable } = require('stream')
const ErrorBufferedReadable = require('./error-buffered-readable')

/**
 *
 * | step | client-request       |    | server-response         |
 * |------|----------------------|----|-------------------------|
 * | 1    | uri, method, [auth]  | -> |                         | REQ
 * | 2    |                      | <- | 404 not found           | ERR-REP
 * |      |                      |    | 405 method not allowed  |
 * |      |                      |    | 401 unauthorized        |
 * |      |                      |    | 100 continue            | SINK
 * | 3    | request data (close) | -> | (incoming-message)      | RAW
 * |      |                      | <- | 400 bad request         |
 * |      |                      |    | 403 forbidden           |
 * |      |                      |    | 500 internal error      |
 * |      |                      |    | 503 unavailable         |
 * | 4    |                      | <- | 200 success             |
 * | 5    | (close)              | <- | response data (close)   |
 *
 * States:
 * 1. Handshaking (stream)
 * 2. Requesting (stream)
 * 3. Requested
 * 4. Responded (including 4xx/5xx status, may have sub-states)
 * 5. Error
 *
 * Alphabet
 * 1. REQ (with method)
 * 2. REP (with status code), including SUCCESS, CLIENT-ERROR, SERVER_ERROR
 * 3. SINK (with stream.sink) 
 * 4. SOURCE (with stream.source)
 * 5. ABORT (with error but without status)
 */

const hasOwnProperty = (obj, prop) => 
  Object.prototype.hasOwnProperty.call(obj, prop)

const isErrorStatus = status => 
  Number.isInteger(status) && status >= 400 && status < 600

const isSuccessfulStatus = status =>
  Number.isInteger(status) && status >= 200 && status < 300

const isInvalidStatus = status => 
  (!isErrorStatus(status)) && (!isSuccessfulStatus(status))


/** Base State */
class State {
  /**
   * @param {object} ctx - context object
   */
  constructor (ctx) {
    this.ctx = ctx
  }

  /**
   * @param {function} NextState - constructor of next state
   */
  setState (NextState, ...args) {
    const ctx = this.ctx
    this.exit(NextState, ...args)
    this.ctx = null
    const nextState = new NextState(ctx)
    ctx.state = nextState
    ctx.state.enter(...args)
  }

  /**
   *
   */
  enter (...args) {
    // console.log('entering ' + this.constructor.name)
  }

  /**
   *
   */
  exit (NextState, ...args) {
    // console.log('exiting ' + this.constructor.name)
  }

  /**
   *
   */
  handleMessage (msg) {
    // console.log(this.constructor.name + ' handle message', msg)
  }
}

/**
 * `Handshaking` state request a Sink.
 *
 * `Handshaking` expects a Sink-Reply or Error-Reply. 
 * Other messages are illegal, including flow-control.
 * 
 * At most one operation is buffered, either `write` or `final`.
 * If Sink-Reply arrives,  
 * - if no-op or `write` is buffered, go to Requesting with or without op;
 * - if `final` is buffered, invoke callback and go to Requested;
 *
 * If Error-Reply must be treated as error.
 * If error occurs
 */
class Handshaking extends State {
  handleMessage (msg) {
    super.handleMessage(msg)

    const handleError = err => 
      this.setState(Failed, err, this.buffered && this.buffered.callback)

    if (msg instanceof Error) return handleError(msg)

    const { status, stream, data, chunk } = msg

    if (status) {
      return handleError(new Error('unexpected status reply'))
    }

    if (!stream || !stream.sink) {
      return handleError(new Error('bad sink'))
    }

    this.ctx.sink = stream.sink
    this.setState(Requesting, this.buffered)
  }

  write (msg, encoding, callback) {
    this.buffered = { msg, encoding, callback }
  }

  final (callback) {
    this.buffered = { callback }
  }
}

/**
 * `Requesting` 
 */
class Requesting extends State {
  enter (buffered) {
    super.enter()
    this.paused = false

    if (!buffered) return

    const { msg, encoding, callback } = buffered
    if (msg !== undefined) {
      this.write(msg, encoding, callback)
    } else {
      this.final(callback) 
    } 
  }

  write ({ data, chunk }, encoding, callback) {
    this.ctx._send({ to: this.ctx.sink, data, chunk })
    callback()
  }

  final (callback) {
    this.ctx._send({ to: this.ctx.sink })
    callback()
    this.setState(Requested)
  }

  /**
   * flow-control or abort, others are illegal
   */
  handleMessage (msg) {
    if (msg instanceof Error) {
      this.setState(Failed, err)
    } else {
      // TODO may be flow control
      this.setState(Failed, new Error('illegal message'))
    }
  }
}

/**
 * The request
 */
class Requested extends State {
  /**
   * success response, error, flow-control (out-of-sync)
   */
  handleMessage (msg) {
    super.handleMessage(msg)

    if (msg instanceof Error) {
      this.setState(Failed, msg) 
    } else {
       
    }

    if (Number.isInteger(msg.status)) {
      if (msg.status >= 200 && msg.status < 300) {
        this.setState(Responded, msg)
      } else {
        this.setState(Error, msg)
      }
    }
  }
}

class Responded extends State {
  enter (msg) {
    super.enter(msg)

    const { status, data, chunk, stream } = msg

    if (stream) {
      const rs = new ErrorBufferedReadable({
        objectMode: true,
        read: this.ctx.read.bind(this.ctx),
        destroy: this.ctx.destroy.bind(this.ctx)
      })

      this.ctx.res = { status, data, chunk, stream: Object.assign(rs, stream) }
    } else {
      this.ctx.res = { status, data, chunk }
    }

    this.ctx.req.emit('response', this.ctx.res)
  }

  handleMessage (msg) {
    super.handleMessage(msg)

    if (!this.ctx.res.stream) return

    const { status, error, data, chunk, stream } = msg

    if (status) {
    } else if (error) {

    } else if (data !== undefined || chunk) {
      const msg = { data, chunk }
      this.ctx.res.stream.push(msg)
    } else {
      this.ctx.res.stream.push(null)
    }
  }
}

class Failed extends State {
  /**
   * @param {Error} err
   * @param {function} callback - if provided
   */
  enter (err, callback) {
    if (typeof callback === 'function') {
      callback(err)
    } else {
      // this.
    }
  }
}

/**
 * Initiator is a light-weight class
 */
class Initiator {
  /**
   * @parma {object}    props
   * @param {function}  props.send - write to underlying connection
   * @param {string}    props.to - target path
   * @param {string}    props.path - source path
   * @param {string}    props.method
   * @param {object}    [props.stream]
   * @param {*}         [props.data]
   * @param {buffer}    [props.chunk]
   */
  constructor ({ send, to, path, method, data, chunk, stream }) {
    this._send = send
    this.req = { to, path, method }
    this.res = undefined

    this._send({ to, from: path, method, data, chunk, stream })

    const write = this.write.bind(this)
    const final = this.final.bind(this)
    const destroy = this.destroy.bind(this)

    if (stream) {
      this.req = new Writable({ objectMode: true, write, final, destroy })
      this.state = new Handshaking(this)
    } else {
      this.req = Object.assign(new Emitter(), { destroy })
      this.state = new Requested(this)
    }
  }

  /**
   * Besides type and range, 
   * 1. a successful status should not have error
   * 2. an error or error status message should not have stream, data, chunk 
   *
   * @param {object} msg
   * @param {number} [msg.status] - if provided, must be integer in range
   * @param {object} [msg.error] - non-null object
   * @param {object} [msg.stream] - non-null object
   * @param {*}      [msg.data] - any JS value that could be encoded in JSON
   * @param {buffer} [msg.chunk] - node Buffer
   */
  handleMessage ({ status, error, stream, data, chunk }) {

    // TODO validate

    if (error || isErrorStatus(status)) {
      const err = Object.assign(new Error(), error)
      if (status) {
        err.message = err.message || 'failed' 
        err.code = 'EFAIL'
        err.status = status
      } else {
        err.message = err.message || 'aborted'
        err.code = 'EABORT'
      }

      this.state.handleMessage(err) 
    } else {
      this.state.handleMessage({ status, stream, data, chunk })
    }
  }

  /**
   *
   */
  write (chunk, encoding, callback) {
    try {
      this.state.write(chunk, encoding, callback)
    } catch (e) {
      console.log(e)
    }
  }

  /**
   *
   */
  final (callback) {
    try {
      this.state.final(callback)
    } catch (e) {
      console.log(e)
    }
  }

  read (size) {
  }

  destroy (err) {
  }
}

Initiator.States = {
  Handshaking, 
  Requesting,
  Requested,
  Responded,
  Failed
}

module.exports = Initiator
