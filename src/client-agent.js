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
 * Request is a duplex stream and a thenable.
 * Request does NOT support builder pattern.
 *
 * Request is HEAVY for non-stream request/response round-trip.
 */

/**
 * States: init, handshaking, requesting, 
 *
 * init - send request or handshake a stream
 * handshaking - expect message from 
 * 
 */

class State {
  /**
   *
   */
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

class Requested extends State {
  /**
   * response, error, flow-control
   */
  handleMessage(msg) {
    if (msg.status) {
      this.ctx.handleResponse(msg)
      if (this.ctx.res.stream) {
        this.setState(Responding)
      } else {
        this.setState(Responded)
      }
    } else if (msg.error) {
    } else {
    } 
  } 
}

/**
 * Responding state is specific to streaming response
 */
class Responding extends State {
  /**
   * non-status data or error, flow-control
   */
  handleMessage({ status, error, stream, data, chunk }) {
    if (status) {
    } else if (error) {
      
    } else if (data !== undefined || chunk) {
      const msg = { data, chunk }      
      this.ctx.res.stream.push(msg)
    } else {
      this.ctx.res.stream.push(null)
      this.setState(Responded) 
    }
  }
}

class Responded extends State {
}

class Failed extends State {
}

/**
 * Agent is a light-weight class 
 */
class Agent {
  /**
   *
   */
  constructor ({ 
    send, onResponse, onClose,
    to, path, method, 
    data, chunk, stream
  }) {
    this._send = send
    this._onClose = onClose
    this._onResponse = onResponse

    this.req = { to, path, method }
    this.res = undefined

    if (stream) {
      const options = { 
        objectMode: true,
        write: this.write.bind(this),
        final: this.final.bind(this),
        destroy: this.destroy.bind(this)
      }
      this.req.stream = new Writable(options)
      this._send({ to, from: path, method, data, chunk, stream })
      this.state = new Handshaking(this)
    } else {
      this._send({ to, from: path, method, data, chunk })
      this.state = new Requested(this)
    }

    this.state.enter()
  }

  /** this is an internal method */
  handleResponse ({ status, error, stream, data, chunk }) {
    if (status >= 200 && status < 300) {
      if (stream) {
        this.res = {
          status, data, chunk,
          stream: Object.assign(new DeferrableReadable({
            objectMode: true,
            read: this.read.bind(this),
            destroy: this.destroy.bind(this)
          }), stream)
        }
      } else {
        this.res = { status, data, chunk }
      }
    }
    this._onResponse(null, this.res)
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

module.exports = Agent
