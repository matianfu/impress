const stream = require('stream')

class Dup extends stream.Duplex {
  constructor (props = {}) {
    props.allowHalfOpen = true
    props.autoDestroy = true
    super(props)  
  }

  _write (chunk, encoding, callback) {
    callback()
  }

  _final (callback) {
    callback()
  }

  _destroy(err, callback) {
    callback()
  }

  _read (size) {
  }
}

const dup = new Dup()

dup.on('data', data => console.log('data', data))

dup.on('error', err => console.log('error---', err))
dup.on('end', () => console.log('end'))
dup.on('finish', () => console.log('finish'))
dup.on('close', () => console.log('close'))

/**
dup.end()
dup.push('world')
dup.push(null)
*/

dup.destroy(new Error('stack'))

// dup.push(null)
// dup.end()
