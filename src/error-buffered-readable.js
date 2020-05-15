const { Readable } = require('stream')

/**
 * A DeferrableReadable buffers ALL data, end, and error events until
 * the stream is consumed by `resume()`. This keeps the order of all
 * events, not only data. Thus it could be safely pass to consumer 
 * asynchronously.
 */
class DeferrableReadable extends Readable {
  constructor (options) {
    super(options)
    this.deferred = []
  }

  /**
   * Activates the stream by this method
   */
  resume () {
    // schedule undefer
    this.deferred && process.nextTick(() => this.undefer())  
    super.resume()
  }

  /** @internal */
  undefer () {
    if (this.deferred) {
      const buf = this.deferred
      this.deferred = ''
      for (let i = 0; i < buf.length; i++) {
        const arg0 = buf[i][0]
        if (arg0 instanceof Error) {
          this.destroy(arg0)
          break
        } else {
          this.push(...buf[i])
          if (arg0 === null || arg0 === undefined) break
        }
      }
    }
  }

  /**
   * destroy
   */
  destroy (err) {
    if (this.deferred) {
      this.deferred.push(err)
    } else {
      super.destroy(err)
    }
  } 

  /**
   *
   */
  push (chunk, encoding) {
    if (this.deferred) {
      this.deferred.push([chunk, encoding])
    } else {
      super.push(chunk, encoding)
    }
  }
}

module.exports = DeferrableReadable
