const { Writable } = require('stream')

/**
 * A ResponseSource is a Writable stream at the responder side.
 *
 * It is modelled as a stream of fragmented response. 
 *
 * The user could use a standard Writable interface. This is different that of `express`, which
 * has it's own set of method. 
 *
 * Responding with an error does NOT necessarily mean the stream object must 
 * execute an error handling code path. Set up the status code with `status()` method, 
 * then trigger `end()` with an optional error argument is OK. There is no need to call
 * `destroy` directly.
 */ 
class ResponseSource extends Writable {
  /**
   * @param {object} props
   * @param {string} props.id
   * @param {string} props.to
   * @param {string} props.from
   * @param {function} props.send - send a message
   * @param {function} props.streamTerminated - signal peer this stream is terminated
   */
  constructor (props) {

    props.objectMode = true

    /**
     * don't use autoDestroy, error may be suppressed.
     */
    super(props)

    const { id, to, from, send, streamTerminated } = props 
    Object.assign(this, { id, to, from, send, streamTerminated })

    /**
     * `Destroy()` is the only way putting stream into destroyed state. If
     * triggered by user, a message should be sent to the peer. This flag
     * skips the message if destroy is called internally when such as message
     * is unnecessary (abort) or unapplicable (connection failed)  
     */
    this.skipResponse = false

    this.statusCode = 0

    // response body
    this.body = undefined

    this.once('error', err => {
      this.statusCode = 500
      this.body = { error: { message: 'internal error' } }
      this.destroy()
    })

    this.send({ to, status: 100, body: { data: from } }) 
  }

  /**
   * implements stream.Writable's _write method
   * 
   * @param {object} body - message body, must be non-null object
   */
  _write (body, encoding, callback) {
    if (typeof body !== 'object' || body === null) {
      const err = new TypeError('body not an non-null object')   
      return callback(err)
    }

    this.send({ to: this.to, from: this.from, body }, callback)
  }

  /**
   *
   */
  _final (callback) {
    this.destroy()
    callback()
  }

  /**
   * All code path terminating the stream will call this function
   */
  _destroy (err, callback) {
    if (!this.skipResponse) {
      const { to, from, statusCode } = this

      if (statusCode >= 200 && statusCode < 300) {
        let body
        if (this.body) {
          body = {}
          if (this.body.data !== undefined) body.data = this.body.data
          if (this.body.chunk !== undefined) body.chunk = this.body.chunk
        }

        this.send({ to, from, status: statusCode, body })
      } else {
        let body
        if (this.body && 
          typeof this.body === 'object' &&
          this.body.error &&
          typeof this.body.error === 'object' &&
          typeof this.body.error.message === 'string') {

          body = {
            error: {
              message: this.body.error.message,
              code: this.body.error.code
            }
          }
        }

        this.send({ to, from, status: statusCode, body })
      }
    }
    this.streamTerminated(this.id)
    if (callback) callback(err)
  }

  /**
   * User should not call this function directly.
   */
  destroy (err) {
    if (!this.statusCode) {
      this.statusCode = 500
      this.body = {
        error: (err && err.message) 
          ? { message: err.message, code: err.code }
          : { message: 'explicitly destroyed' }
      }
    }

    // TODO to support err, error handler should be removed first.
    super.destroy()
  } 

  /**
   * If status code is not set, defaults to 200 
   */
  end (body, encoding, callback) {
    if (!this.statusCode) this.statusCode = 200

    if (typeof body === 'function') {
      super.end(body)
    } else {
      this.body = body 
      super.end(typeof encoding === 'function' ? encoding : callback)
    }
  }

  /**
   * The only message source-stream handles is the DELETE
   */
  handle (msg) {
    if (msg.method !== 'DELETE') return
    this.skipResponse = true
    this.destroy()

    // this abort do emit before close, see test
    this.emit('abort') 
  }

  /**    
   * connection finished, ended by the other side, or disconnected abruptly
   * no idea whether the user want to know the detail
   * if there is a socket error, the error is passed
   * otherwise an error is constructed 
   * 
   * @param {error|string} err - a socket error, 'finish', 'end', 'close'
   */
  disconnect (err) {
    if (typeof err === 'string') {
      switch (err) {
        case 'finish':
          err = new Error('peer is finished')
          err.code = 'ERR_PEER_FINISHED'
          break
        case 'end':
          err = new Error('peer is ended')
          err.code = 'ERR_PEER_ENDED'
          break
        case 'close':
          err = new Error('peer is closed')
          err.code = 'ERR_PEER_CLOSED'
          break
        default:
          err = new Error('peer error')
          err.code = 'ERR_PEER_ERROR'
          break
      }
    }

    this.emit(err)
  }

  /**
   * set status code
   */
  status (code) {
    this.statusCode = code
    return this
  }
}

module.exports = ResponseSource
