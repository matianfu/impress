const Path = require('path') 
const fs = require('fs')

const chai = require('chai')
const uuid = require('uuid')

const Initiator = require('src/initiator')

describe(Path.basename(__filename), () => {


  describe('constructing', () => {
    const msgbuf = []
    const send = m => msgbuf.push(m) 
    const to = '/path/to/destination'
    const path = '/#requests/1234'

    it('constructing a initiator with hello', done => {
      const initor = new Initiator({
        send, to, path,
        method: 'GET',
        data: 'hello'
      })

      setImmediate(() => {
        console.log(msgbuf)
        done()
      })
    })  
  })
})
