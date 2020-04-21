const { Readable } = require('stream')

/**
 * SinkStream accepts a POSTS/PUTS/PATCHS stream.
 *
 * 
 */
class SinkStream extends Readable {

  /**
   * @param {object} props
   *
   */
  constructor (props) {

    props.objectMode = true

    super(props)

    const { id, to, from, send, streamTerminated } = props
    
    this.id = id
    this.to = to
    this.from = from
    this.send = send
    this.streamTerminated = streamTerminated

    this.once('error', err => this.destroy()) 
  }

  read (size) {
  }

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

  handle (msg) {
  }

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

  /** is respond an equivalent to cancel stream ? */
  respond (status, body) {

  }
}


