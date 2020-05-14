const Emitter = require('events')
const { Writable, Readable } = require('stream')
const DeferrableReadable = require('./deferrable-readable')

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
 * States:
 * 
 * 1. Handshaking (stream)
 * 2. Requesting (stream)
 * 3. Requested
 * 4. Responded (including 4xx/5xx status, may have sub-states)
 * 5. Error
 *
 */

/** base state */
class State {
  /** @param {object} ctx - context object */
  constructor (ctx) {
    this.ctx = ctx 
  }

  /**
   * @param {function} NextState - constructor of next state
   *
   */
  setState(NextState, ...args) {
    const ctx = this.ctx
    this.exit()
    this.ctx = null
    const nextState = new NextState(ctx)
    ctx.state = nextState
    ctx.state.enter(...args)
  }

  enter () {
    // console.log('entering ' + this.constructor.name)
  }

  exit () {
    // console.log('exiting ' + this.constructor.name)
  }

  handleMessage (msg) {
    // console.log(this.constructor.name + ' handle message', msg)
  }
}

/**
 * Handshaking state is specific to streaming request
 * 
 * Expecting Sink Message or Error Status, Other message are illegal
 */
class Handshaking extends State {
  handleMessage (msg) {
    super.handleMessage(msg)
    const { status, error, stream, data, chunk } = msg
  
    if (status) {
      if (status >= 400 && status < 600) {
      
      } else {
        throw new Error('illegal message')
      }
    } else if (error) {
      throw new Error('illegal message') 
    } else if (stream) {
      if (stream.sink) {
        this.ctx.sink = stream.sink
        this.setState(Requesting, this.deferred)
      } else {
      }
    }
  } 

  write (chunk, encoding, callback) {
    this.deferred = { chunk, encoding, callback }
  }

  final (callback) {
    this.deferred = { callback }
  }
}

/**
 * specific to uploading request
 */
class Requesting extends State {
  enter (deferred) {
    super.enter()
    if (!deferred) return
    const { data, chunk } = deferred.chunk
    this.ctx._send({ to: this.ctx.sink, data, chunk })
    deferred.callback()
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
}

/**
 * The request 
 *
 */
class Requested extends State {
  /**
   * response, error, flow-control (out-of-sync)
   */
  handleMessage(msg) {
    super.handleMessage(msg)
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
      const rs = new DeferrableReadable({
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

class Error extends State {
  enter (msg) {
  }
}

/**
 * Initiator is a light-weight class 
 */
class Initiator {
  /**
   * @parma {object} props
   * @param {function} props.send - write to underlying connection
   * @param {function} props.onResponse - 
   * @param {function} props.onClose -
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

  handleMessage (msg) {
    try {
      this.state.handleMessage(msg, () => {})
    } catch (e) {
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

module.exports = Initiator
