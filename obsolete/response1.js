const stream = require('stream')

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

class Response {
  constructor (props) {
    if (props.duplex) {
      return new Duplex(props)
    } else {
      return new Writable(props)
    }
  } 
}

module.exports = Response
