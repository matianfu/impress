const path = require('path')

const uuid = require('uuid')

const chai = require('chai')
const expect = chai.expect


const SourceStream = require('src/source-stream')

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
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      expect(msgbuf).to.deep.equal([
        { to, status: 100, body: { data: from } }
      ])
      done()
    })
  })

  describe('destroy', () => {
    it('destroy should send eof message with error', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.destroy()

      expect(msgbuf.length).to.equal(2)
      const msg = msgbuf[1]
      expect(msg.to).to.equal(to)
      expect(msg.body.error.message).to.be.a('string')
      done()
    })
  })

  describe('internal error', () => {
    it('stream should emit TypeError', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      let error
      ss.on('error', err => error = err)
      ss.write('hello')
      ss.end()
      expect(error).to.be.an.instanceof(TypeError)
      done()
    })

    it('stream should send error message', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.write('hello')
      ss.end()
      expect(msgbuf.length).to.equal(2)
      const last = msgbuf.pop()
      expect(last.to).to.equal(to)
      expect(last.body).to.have.property('error')
      expect(last.body.error).to.be.an('object')
      expect(last.body.error).to.not.equal(null)
      done()
    })

    it('stream should terminate', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.write('hello')
      ss.end()
      expect(ids).to.deep.equal([id])
      done()
    })

    it('stream should be destroyed', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.write('hello')
      expect(ss._writableState.destroyed).to.equal(true)
      done()
    })

    it('stream should emit close', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.on('close', () => done())
      ss.write('hello')
    })
  })

  describe('handle DELETE', () => {
    it('stream should emit abort (before close)', done => {
      const xs = []
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.on('abort', () => xs.push('abort'))
      ss.on('close', () => {
        xs.push('close') 
        expect(xs).to.deep.equal(['abort', 'close'])
        done()
      })
      ss.handle({ to: from, method: 'DELETE' })
    })

    it('calling destroy in abort handler should NOT throw', done => {
      const es = []
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.on('abort', () => ss.destroy())
      ss.on('error', err => es.push(err))
      ss.on('close', () => {
        expect(es).to.deep.equal([])
        done()
      })

      ss.handle({ to: from, method: 'DELETE' })
    })

    it('stream should terminate', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.handle({ to: from, method: 'DELETE' })
      expect(ids).to.deep.equal([id])
      done()
    })

    it('stream should NOT send error message', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated }) 
      ss.handle({ to: from, method: 'DELETE' })
      expect(msgbuf.length).to.equal(1)
      done()
    })

    it('stream should be destroyed', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.handle({ to: from, method: 'DELETE' })
      expect(ss._writableState.destroyed).to.equal(true)
      done()
    })

    it('stream should emit close', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.on('close', () => done())
      ss.handle({ to: from, method: 'DELETE' })
    })
  })

  describe('end', () => {
    it('immediate end should send eof message', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.end(() => {
        const bye = msgbuf[1]
        expect(bye.to).to.equal(to)
        expect(bye.body.error).to.equal(null)
        done()
      })
    })

    it('immediate end should terminate stream', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.end(() => {
        expect(ids).to.deep.equal([id])
        done()
      })
    })

    it('immediate end should destroy stream', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.end(() => {
        expect(ss._writableState.destroyed).to.equal(true)
        done()
      })
    })

    it('immediate end should close stream (after finish)', done => {
      const xs = []
      const ss = new SourceStream({ id, to, from, send, streamTerminated })
      ss.on('finish', () => xs.push('finish'))
      ss.on('close', () => {
        xs.push('close')
        expect(xs).to.deep.equal(['finish', 'close'])
        done()
      })
      ss.end()
    })

    it('ending with body should send eof-piggybacked message', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated }) 
      ss.end({ data: 'hello' }, () => {
        expect(msgbuf.length).to.equal(2)
        const msg = msgbuf[1]   
        expect(msg.to).to.equal(to)
        expect(msg.body).to.deep.equal({
          data: 'hello',
          error: null
        })
        done()  
      })
    })

    it('ending with body should terminate stream', done => {
      const ss = new SourceStream({ id, to, from, send, streamTerminated }) 
      ss.end({ data: 'hello' }, () => {
        expect(ids).to.deep.equal([id])
        done()  
      })
    })

  })
})
