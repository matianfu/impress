const { Writable } = require('stream')

/**
 * A Source Stream does not respond to 
 */ 


class SourceStream extends Writable {
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

    this.usePiggybackedEof = props.usePiggybackedEof === false ? false : true

    const { id, to, from, send, streamTerminated } = props 

    this.id = id    
    this.to = to
    this.from = from
    this.send = send
    this.streamTerminated = streamTerminated

    /**
     * `Destroy()` is the only way putting stream into destroyed state. If
     * triggered by user, a message should be sent to the peer. This flag
     * skips the message if destroy is called internally when such as message
     * is unnecessary (abort) or unapplicable (connection failed)  
     */
    this.skipMessageInDestroy = false

    /**
     * `end` may set this function
     */
    this.eofPiggybacked = false

    this.destroyError = { message: 'internal error' }

    this.once('error', err => this.destroy())

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
    if (!this.eofPiggybacked) {
      this.send({ to: this.to, from: this.from, body: { error: null } })
    }

    this.skipMessageInDestroy = true
    this.destroy()
    callback()
  }

  /**
   * All code path terminating the stream will call destroy and there is no way
   * to pass 
   */
  _destroy (err, callback) {
    if (!this.skipMessageInDestroy) {
      this.send({
        to: this.to,
        from: this.from,
        body: { error: { message: 'unexpected error' } }
      })
    }
    this.streamTerminated(this.id)
    if (callback) callback(err)
  }

  /**
   * override end to support eof-piggybacked message
   */
  end (body, encoding, callback) {
    if (body === undefined || typeof body === 'function' || !this.usePiggybackedEof) {
      super.end(body, callback)
    } else {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = null
      }

      body.error = null

      this.write(body, encoding, err => {
        if (err) {
          this.emit(err)
        } else {
          this.eofPiggybacked = true
          super.end(callback)
        }
      })
    }
  }

  /**
   * The only message source-stream handles is the DELETE
   */
  handle (msg) {
    if (msg.method !== 'DELETE') return
    this.skipMessageInDestroy = true
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
}

module.exports = SourceStream
