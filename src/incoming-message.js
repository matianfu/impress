const path = require('path')
const stream = require('stream')

/**
 * 
 */
class IncomingMessage extends stream.Readable {
  /**
   * @param {object} props
   * @param {string} props.id
   * @param {string} props.path
   */
  constructor (props, msg) {
    super(Object.assign({}, props, { objectMode: true }))

    this.id = props.id
    this.path = props.path
    this._send = props.send

    this.to = msg.to
    this.from = msg.from
    this.method = msg.method
    this.status = msg.status
    this.error = msg.error
    this.stream = msg.stream
    this.data = msg.data
    this.blob = msg.blob 

    this.sinkReplied = false
  }

  _read () {
  }

  resume () {
    if (!this.sinkReplied) {
      this._send({ to: this.from, stream: { sink: this.path } })
      this.sinkReplied = true
    }
    super.resume()
  }

  handleMessage ({ data, blob }) {
    if (data !== undefined || blob) {
      const msg = {}
      if (data !== undefined) msg.data = data
      if (blob) msg.blob = blob
      this.push(msg)
    } else {
      this.push(null)  
    }
  }
}

module.exports = IncomingMessage
