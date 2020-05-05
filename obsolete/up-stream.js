const { Writable } = require('stream')

/**
 * state
 *
 * 1. handshaking, may be rejected 
 * 2. streaming 
 * 3. finalizing
 * 4. finanlized
 */

/**
 * UpStream understands the first message
 */

class UpStream extends Writable {
  constructor (peer, to, method, body) {
    super({ objectMode: true })
    this.peer = peer

    this.id = uuid.v4()

    this.to = to
    this.from = path.join('/#requests', peer.id, this.id)

    this.method = method

    this.state = 'handshake'
    this.sink = null

    this.peer.write({ to, from, method, body })
  }

  _write (body, _, callback) {
    if (this.sink) {
      this.peer.write({ to: this.sink, body })
      callback()
    } else {
      this.pending = { body, callback }
    }
  }

  _final (callback) {
    this.peer.delete(this.sink, (err, body) => {
      this.endRes = { err, body }
      callback()
    })
  }

  end (callback) {
    super.end(() => {
      const { err, body } = this.endRes
      callback(err, body)
    })
  }

  /**
   * 1. handshake response, success or failure
   * 2. in-band final response after end (optional)
   * 3. in-band error 
   */
  handle (msg) {
    
  }
}
