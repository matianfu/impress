const { Writable, Readable } = require('stream')

class Agent {
  constructor (props) {
    this._send = props.send
    this._onClose = props.onClose

    this.id = props.id
    this.to = props.to
    this.path = props.path
    this.method = props.method
  }
} 
