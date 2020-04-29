const stream = require('stream')

/**
 *
 */

/**
 * Request is a duplex stream.
 * Request is a thenable.
 * Request does NOT support builder pattern.
 *
 * Request is HEAVY for non-stream request/response round-trip.
 *
 *
 */
class Request extends stream.Duplex {
  /**
   * If props.stream is provided, Requests act as a writable to upload
   * If props.stream is not provided, Request use { data, buffer } as body
   *
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
    /** mandatory duplex stream */
    props.objectMode = true
    props.allowHalfOpen = true
    props.autoDestroy = true

    super(props)

    this._send = props.send
    this._onTerminated = props.onTerminated

    this.id = props.id
    this.to = props.to
    this.from = props.from
    this.method = props.method

    this.promise = new Promise((resolve, reject) => {
      this.thenable = { resolve, reject }
    })

    const { data, chunk, stream } = props

    /** outgoing stream setting */
    this._stream = null

    if (stream && typeof stream === 'object' && !Array.isArray(stream)) {
      this._stream = stream
    } else if (stream === true) {
      this._stream = {}
    }

    if (this._stream) {
      // send stream packet
      this._send({
        to: this.to,
        from: this.from,
        method: this.method,
        stream: this._stream
      })
    } else {
      // finish listener is executed in nextTick
      this.end(() => this._send({
        to: this.to,
        from: this.from,
        method: this.method,
        data, 
        chunk
      }))
    }

    this.once('error', err => this.destroy(err))
  }

  /**
   * stream.Writable's internal _write method
   */
  _write (chunk, encoding, callback) {
    if (this._stream) {
      callback()
    } else {
      callback()
    }
  }

  /**
   * stream.Writable's internal _final method
   */
  _final (callback) {
    if (this._stream) {
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

  /**
   *
   */
  handleResponse (msg) {
    /** this is not a good status code, use flow control instead */
    if (msg.status === 100) {

    } else {
      if (msg.status >= 200 && msg.status < 300) {
        const { data, chunk, stream } = msg

        console.log('msg', msg)

        if (stream) {
          this.sourcePath = stream.source
        }

        this.thenable.resolve({ data, chunk })
      }
    }
  }

  handleRaw (msg) {
  }

  handleConnectionLost () {
  }

  /**
   * thenable
   */
  then (...args) {
    return this.promise.then(...args)
  }
}

module.exports = Request
