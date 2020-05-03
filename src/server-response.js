const stream = require('stream')

const IncomingMessage = require('./incoming-message')

const Mixin = Base => class extends Base {
  constructor (props) {
    props.objectMode = true
    props.allowHalfOpen = true
    props.autoDestroy = true

    super(props)

    this._send = props.send
    this._onClose = props.onClose

    this.id = props.id 
    this.to = props.to
    this.from = props.from
  }

  _write (chunk, encoding, callback) {
    const { data, blob } = chunk
    this._send({
      to: this.to,
      from: this.from,
      data,
      blob 
    })
    callback && callback()
  }

  _final (callback) {
    this._send({
      to: this.to,
      from: this.from
    })
    callback()
  }

  _read () {
  }

  handleResponse () {
    // ERROR TODO
    console.log('response fdsafas')
  }

  handleRaw (msg) {
    const { data, blob } = msg
    if (data !== undefined || blob) {
      const msg = {}
      if (data !== undefined) msg.data = data
      if (blob) msg.blob = blob
      this.push({ data, blob })
    } else {
      this.push(null)
    }
  }

  respond () {
    console.log('hello')
  }
}

class Duplex extends Mixin(stream.Duplex) {
  constructor (props) {
    super(props)
    this._send({ 
      to: this.to, 
      pipe: { sink: this.from }
    })
  }
}

class Writable extends Mixin(stream.Writable) {
  constructor (props) {
    super(props)
    this._send({ 
      to: this.to, 
      status: 200,
      pipe: { source: this.from }
    })
  }
}

class ServerResponse extends stream.Writable {
  /**
   *
   * @param {object}      props
   * @param {function}    props.send - function to send a message
   * @param {string}      props.path
   */
  constructor (props, msg) {

    props.objectMode = true

    super(props)
    
    this.id = props.id
    this.path = props.path

    this._send = props.send

    this.to = msg.from
 
    if (msg.pipe) {
      this.req = new IncomingMessage(props, msg)
//      this._send({ to: this.to, pipe: { sink: this.path } })
    } else {
      this.req = msg
    }

    this.requested = false
    this.responded = false

    this.statusCode = 200   
  }

  _write (chunk, encoding, callback) {
    if (!this.responded) {
      this.stream() 
    }

    const { data, blob } = chunk
    this._send({ to: this.to, data, blob })
    callback()
  }

  _final (callback) {
    this._send({ to: this.to })
    callback()
  }

  stream (pipe = {}) {
    if (!this.responded) {
      pipe.source = this.path
      this._send({ to: this.to, status: this.statusCode, pipe })
      this.responded = true
    }
  }

  status (code) {
    this.statusCode = code
    return this
  }

  send (msg) {
    if (this.req instanceof stream) this.req.destroy()
  
    const { error, data, blob } = msg 
    const to = this.to
    const status = this.statusCode

    if (this.statusCode >= 200 && this.statusCode < 300) {
      this._send({ to, status, data, blob })
    } else {
      this._send({ to, status, error }) 
    }
  } 

  handleMessage (msg) {
    if (!this.requested) {
      this.req.handleMessage(msg)
    }
  }
} 

module.exports = ServerResponse
