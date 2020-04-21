const path = require('path')

const uuid = require('uuid')

const chai = require('chai')
const expect = chai.expect

const ResponseSource = require('src/response-source')

describe(path.basename(__filename), () => {

  const id = uuid.v4()
  const msgbuf = []
  const ids = []

  const to = '/path/to/target'
  const from = '/path/from/me'

  const send = (msg, callback) => { 
    msgbuf.push(msg) 
    if (callback) process.nextTick(() => callback())
  }

  const streamTerminated = (id, callback) => {
    ids.push(id) 
    if (callback) callback()
  }

  beforeEach(() => {
    msgbuf.splice(0)
    ids.splice(0)
  })  

  describe('constructor', () => {
    it('stream should send CONTINUE message', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      expect(msgbuf).to.deep.equal([
        { to, status: 100, body: { data: from } }
      ])
      done()
    })
  })

  describe('direct destroy', () => {
    it('destroy should respond 500 with error message', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.destroy()

      expect(msgbuf.length).to.equal(2)
      const msg = msgbuf[1]
      expect(msg.to).to.equal(to)
      expect(msg.status).to.equal(500)
      expect(msg.body.error.message).to.be.a('string')

      done()
    })
  })

  describe('internal error', () => {
    it('stream should emit TypeError', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      let error
      rs.on('error', err => error = err)
      rs.write('hello')
      rs.end()
      expect(error).to.be.an.instanceof(TypeError)
      done()
    })

    it('stream should respond 500 error', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.write('hello')
      rs.end()
      expect(msgbuf.length).to.equal(2)
      const msg = msgbuf[1]
      expect(msg.to).to.equal(to)
      expect(msg.status).to.equal(500)
      expect(msg.body.error.message).to.include('internal error')
      done()
    })

    it('stream should terminate', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.write('hello')
      rs.end()
      expect(ids).to.deep.equal([id])
      done()
    })

    it('stream should be destroyed', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.write('hello')
      expect(rs._writableState.destroyed).to.equal(true)
      done()
    })

    it('stream should emit close', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.on('close', () => done())
      rs.write('hello')
    })
  })

  describe('handle DELETE', () => {
    it('stream should emit abort (before close)', done => {
      const xs = []
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.on('abort', () => xs.push('abort'))
      rs.on('close', () => {
        xs.push('close') 
        expect(xs).to.deep.equal(['abort', 'close'])
        done()
      })
      rs.handle({ to: from, method: 'DELETE' })
    })

    it('calling destroy in abort handler should NOT throw', done => {
      const es = []
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.on('abort', () => rs.destroy())
      rs.on('error', err => es.push(err))
      rs.on('close', () => {
        expect(es).to.deep.equal([])
        done()
      })

      rs.handle({ to: from, method: 'DELETE' })
    })

    it('stream should terminate', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.handle({ to: from, method: 'DELETE' })
      expect(ids).to.deep.equal([id])
      done()
    })

    it('stream should NOT send error message', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated }) 
      rs.handle({ to: from, method: 'DELETE' })
      expect(msgbuf.length).to.equal(1)
      done()
    })

    it('stream should be destroyed', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.handle({ to: from, method: 'DELETE' })
      expect(rs._writableState.destroyed).to.equal(true)
      done()
    })

    it('stream should emit close', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.on('close', () => done())
      rs.handle({ to: from, method: 'DELETE' })
    })
  })

  describe('end', () => {
    it('immediate end without body should respond 200 without body', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.end(() => {
        expect(msgbuf.length).to.equal(2)
        const msg = msgbuf[1]
        expect(msg.to).to.equal(to)
        expect(msg.status).to.equal(200)
        expect(msg.body).to.be.undefined
        done()
      })
    })

    it('immediate end with body should respond 200 with body', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.end({ data: 'hello' }, () => {
        const msg = msgbuf[1]
        expect(msg.to).to.equal(to)
        expect(msg.status).to.equal(200)
        expect(msg.body).to.deep.equal({ data: 'hello' })
        done()
      })
    })

    it('immediate end should terminate stream', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.end(() => {
        expect(ids).to.deep.equal([id])
        done()
      })
    })

    it('immediate end should destroy stream', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.end(() => {
        expect(rs._writableState.destroyed).to.equal(true)
        done()
      })
    })

    it('immediate end should close stream (after finish)', done => {
      const xs = []
      const rs = new ResponseSource({ id, to, from, send, streamTerminated })
      rs.on('finish', () => xs.push('finish'))
      rs.on('close', () => {
        xs.push('close')
        expect(xs).to.deep.equal(['finish', 'close'])
        done()
      })
      rs.end()
    })

    it('ending with body should terminate stream', done => {
      const rs = new ResponseSource({ id, to, from, send, streamTerminated }) 
      rs.end({ data: 'hello' }, () => {
        expect(ids).to.deep.equal([id])
        done()  
      })
    })

  })
})
