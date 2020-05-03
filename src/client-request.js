const EventEmitter = require('events')
const { Readable, Writable } = require('stream')

/**
 * INIT (first message sent)
 * writable -> expecting error response or message with stream.sink
 * emitter -> expecting error or success response
 */

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
   * @param {object}          [props.stream] - object
   */
  constructor (props) {
    super(props)

    this._send = props.send
    this._onClose = props.onClose

    this.id = props.id
    this.to = props.to
    this.from = props.from
    this.path = props.path

    /** for upload data */
    this.sink = undefined
   
 
    this.method = props.method

    this.response = null

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

      // this.thenable = { resolve, reject }
    })

    this.once('error', err => this.destroy(err))

    this.once('close', () => this._onClose(this.id, this.from))

    this.state = 'INIT'
  }

  /**
   * stream.Writable's internal _final method
   */
  _final (callback) {
    if (this._stream) {
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
    if (this._stream) {
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

    console.log('....')

    if (msg.status) {
      this.handleResponse(msg)
    } else { 
      this.handleRaw(msg)
    }
  }

  /**
   *
   */
  handleResponse ({ status, data, blob, stream }) {

    console.log('client-request writable handle response')

    if (status >= 200 && status < 300) {
      if (stream) {
        if (stream.source) {
          this.source = stream.source
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
  handleRaw ({ error, stream, data, blob }) {

    console.log('client-request writable handle response')
    // 
    if (stream && stream.sink) {
      this.sink = stream.sink
      if (this.pendingWrite) {
        const { chunk, encoding, callback } = this.pendingWrite
        delete this.pendingWrite
        const { data, blob } = chunk
        this._send({ to: this.sink, from: this.from, data, blob})
        callback()
      }
      return
    }

    if (stream && stream.source) {
      throw new Error('stream.source should be set via response message')
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

class StreamRequest extends Mixin(Writable) {
  constructor (props) {
    props.objectMode = true
    props.autoDestroy = true
    super(props)

    const { data, blob, stream } = props
    this.stream = stream
    this._send({
      to: this.to,
      from: this.from,
      method: this.method,
      data, blob, stream
    })
  }

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

class SimpleRequest extends Mixin(EventEmitter) {
  constructor(props) {
    super(props)
    const { to, from, path, method, data, blob } = props
    this._send({
      to: this.to,
      from: this.from,
      path: this.path,
      method, data, blob
    })
  }

  handleMessage ({ status, error, stream, data, blob }) {
    
    if (this.state === 'INIT') {
      // TODO error if status not set or invalid
     
      const res = {} 
      if (status >= 200 && status < 300) {
        if (stream) {
          res.stream = Object.assign(new Readable({
            objectMode: true,
            autoDestroy: true,
            read (size) {}
          }), stream)
        } else {
          if (data !== undefined) res.data = data 
          if (blob) res.blob = blob
        }
      } else {
        // TODO accept string 
        if (error) res.error = error 
      } 

      this.response = res
      this.state = 'RESPONDED'
      this.emit('response', res)
    } else {
      
      // no more response

      const msg = {}
      if (data !== undefined) msg.data = data
      if (blob) msg.blob = blob

      console.log(Object.keys(msg))

      if (Object.keys(msg).length) {
        this.response.stream.push(msg)
      } else {
        this.response.stream.push(null)
      }
    }
  }
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
    if (props.stream) {
      return new StreamRequest(props)
    } else {
      return new SimpleRequest(props)
    }
  }
}

module.exports = ClientRequest
