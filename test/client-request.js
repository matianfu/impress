const Path = require('path')

const expect = require('chai').expect

const ClientRequest = require('src/client-request')

const { SimpleRequest, StreamRequest } = ClientRequest

describe(Path.basename(__filename), () => {
  const msgs = []
  const send = msg => msgs.push(msg)
  const onClose = (id, path) => {}
  const to = '/foo'
  const path = '/bar'
  const method = 'GET'
  const data = 'hello'

  beforeEach(() => {
    msgs.splice(0)
  })

  it('initialized at INIT state', done => {
    const req = new SimpleRequest({ send, onClose, to, path, method, data })
    expect(req.state).to.equal('INIT')
    done()
  })

  it('immediately changes to REQUESTED state after INIT', done => {
    const req = new SimpleRequest({ send, onClose, to, path, method, data })
    setImmediate(() => {
      expect(req.state).to.equal('REQUESTED')
      done()
    })
  })

  it('immediately send message after INIT', done => {
    const req = new SimpleRequest({ send, onClose, to, path, method, data })
    setImmediate(() => {
      expect(msgs).to.deep.equal([{ to, from: path, method, data }])
      done()
    })
  })

  describe('destroyed at REQUESTED state', () => {
    let req

    beforeEach(() => {
      req = new SimpleRequest({ send, onClose, to, path, method, data })    
    })

    afterEach(() => {
      req.removeAllListeners()
      req.on('error', err => {})
    })

    it('should NOT emit close in the same tick', done => {
      req.on('close', () => done(new Error())) 
      req.destroy()
      req.removeAllListeners('close')
      done()
    })

    it('should emit close in next tick', done => {
      let closed = false
      const handleClose = () => { closed = true }
      process.nextTick(() => req.once('close', handleClose))
      req.destroy()
      process.nextTick(() => {
        expect(closed).to.equal(true)
        done()
      }) 
    })

    it('should NOT emit error in the same tick', done => {
      const err = new Error()
      req.on('error', err => done(err)) 
      req.destroy(err)
      req.removeAllListeners('error')
      req.on('error', err => {})
      done()
    })

    it('should emit error in the next tick', done => {
      let error = null 
      const handleError = err => { error = err }
      process.nextTick(() => req.once('error', handleError))
      req.destroy(new Error('foo'))
      process.nextTick(() => {
        expect(error).to.be.an('Error')
        done()
      })
    })

    it('should emit close after error', done => {
      let x = ''
      const handleError = err => x = x + 'foo'
      const handleClose = () => x = x + 'bar'
      process.nextTick(() => {
        req.once('error', handleError)
        req.once('close', handleClose)
      })
      req.destroy(new Error('foo'))
      process.nextTick(() => {
        expect(x).to.equal('foobar')
        done()
      })
    })
  })

})
