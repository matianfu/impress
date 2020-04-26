const path = require('path')

const uuid = require('uuid')

const chai = require('chai')
const expect = chai.expect

const Response = require('src/response')

/**
 *
 * | step | request              |    | response                | response state |
 * |------|----------------------|----|-------------------------|----------------|
 * | 1    | uri, method, [auth]  | -> |                         |                |
 * | 2    |                      | <- | 404 not found           |                |
 * |      |                      |    | 405 method not allowed  |                |
 * |      |                      |    | 401 unauthorized        |                |
 * |      |                      |    | 100 continue            | sink           |
 * | 3    | request data (close) | -> |                         |                |
 * |      |                      | <- | 400 bad request         |                |
 * |      |                      |    | 403 forbidden           |                |
 * |      |                      |    | 500 internal error      |                |
 * |      |                      |    | 503 unavailable         |                |
 * | 4    |                      | <- | 200 success             | source         |
 * | 5    | (close)              | <- | response data (close)   |                |
 *
 *
 * source is created at step 4, test:
 * 1) handle request error close
 * 2) handle internal error 
 * 3) properly close (end) response stream
 *
 * sink is created at step 4, test:
 * 1) handle request data
 * 2) handle request close
 *
 */

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
    /**
     * return 200 success with meta.source
     */
    it.only('source should send status 200', done => {
      const source = new Response({ id, type: 'source', to, from, send, streamTerminated })
      expect(msgbuf).to.deep.equal([ { to, status: 200, body: { meta: { source: from } } } ])
      done()
    })

    /**
     * return 100 continue with meta.sink
     */
    it('sink should send CONTINUE message', done => {
      const sink = new Response({ id, type: 'sink', to, from, send, streamTerminated })
      expect(msgbuf).to.deep.equal([ { to, status: 100, body: { meta: { sink: from  } } } ])
      done()
    })
  })

  describe('direct destroy', () => {
    /**
     * { to, [from], error }
     */
    it('destroy source should respond 500 with error message', done => {
      const rs = new Response({ id, type: 'source', to, from, send, streamTerminated })
      rs.destroy()
      expect(msgbuf.length).to.equal(2)
      const msg = msgbuf[1]
      expect(msg.to).to.equal(to)
      expect(msg.method).to.equal(undefined)
      expect(msg.status).to.equal(undefined)
      expect(msg.body.error.message).to.be.a('string')
      done()
    })

    /**
     * { to, [from], status: 500, error }
     */
    it('destroy sink should respond 500 with error message', done => {
      const rs = new Response({ id, type: 'sink', to, from, send, streamTerminated })
      rs.destroy()
      expect(msgbuf.length).to.equal(2)
      const msg = msgbuf[1]
      expect(msg.to).to.equal(to)
      expect(msg.method).to.equal(undefined)
      expect(msg.status).to.equal(500)
      expect(msg.body.error.message).to.be.a('string')
      done()
    })
  })

  describe('internal error', () => {
    const type = 'source'

    it('source should emit TypeError', done => {
      const rs = new Response({ id, type: 'source', to, from, send, streamTerminated })
      let error
      rs.on('error', err => error = err)
      rs.write('hello')
      // rs.end()
      expect(error).to.be.an.instanceof(TypeError)
      done()
    })

    it('stream should NOT respond status', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.write('hello')
      rs.end()
      expect(msgbuf.length).to.equal(2)
      const msg = msgbuf[1]
      expect(msg.to).to.equal(to)
      expect(msg.method).to.equal(undefined)
      expect(msg.status).to.equal(undefined)
      expect(msg.body.error.message).to.include('internal error')
      done()
    })

    it('stream should terminate', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.write('hello')
      rs.end()
      expect(ids).to.deep.equal([id])
      done()
    })

    it('stream should be destroyed', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.write('hello')
      expect(rs._writableState.destroyed).to.equal(true)
      done()
    })

    it('stream should emit close', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.on('close', () => done())
      rs.write('hello')
    })
  })

  describe('source handle Error', () => {
    const type = 'source'

    it('stream should emit abort (before close)', done => {
      const xs = []
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.on('abort', () => xs.push('abort'))
      rs.on('close', () => {
        xs.push('close') 
        expect(xs).to.deep.equal(['abort', 'close'])
        done()
      })

//      rs.handle({ to: from, method: 'DELETE' })
      rs.handle({ to: from, error })
    })

    it('calling destroy in abort handler should NOT throw', done => {
      const es = []
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.on('abort', () => rs.destroy())
      rs.on('error', err => es.push(err))
      rs.on('close', () => {
        expect(es).to.deep.equal([])
        done()
      })

      rs.handle({ to: from, method: 'DELETE' })
    })

    it('stream should terminate', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.handle({ to: from, method: 'DELETE' })
      expect(ids).to.deep.equal([id])
      done()
    })

    it('stream should NOT send error message', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated }) 
      rs.handle({ to: from, method: 'DELETE' })
      expect(msgbuf.length).to.equal(1)
      done()
    })

    it('stream should be destroyed', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.handle({ to: from, method: 'DELETE' })
      expect(rs._writableState.destroyed).to.equal(true)
      done()
    })

    it('stream should emit close', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.on('close', () => done())
      rs.handle({ to: from, method: 'DELETE' })
    })
  })

  describe('end', () => {
    const type = 'source'

    it('immediate end without body should DELETE sink', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
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
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.end({ data: 'hello' }, () => {
        const msg = msgbuf[1]
        expect(msg.to).to.equal(to)
        expect(msg.status).to.equal(200)
        expect(msg.body).to.deep.equal({ data: 'hello' })
        done()
      })
    })

    it('immediate end should terminate stream', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.end(() => {
        expect(ids).to.deep.equal([id])
        done()
      })
    })

    it('immediate end should destroy stream', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.end(() => {
        expect(rs._writableState.destroyed).to.equal(true)
        done()
      })
    })

    it('immediate end should close stream (after finish)', done => {
      const xs = []
      const rs = new Response({ id, type, to, from, send, streamTerminated })
      rs.on('finish', () => xs.push('finish'))
      rs.on('close', () => {
        xs.push('close')
        expect(xs).to.deep.equal(['finish', 'close'])
        done()
      })
      rs.end()
    })

    it('ending with body should terminate stream', done => {
      const rs = new Response({ id, type, to, from, send, streamTerminated }) 
      rs.end({ data: 'hello' }, () => {
        expect(ids).to.deep.equal([id])
        done()  
      })
    })

  })

  describe('sink', () => {
    it('ping pong (ending with data)', done => {
      const imsgbuf = []
      const sink = new Response({ id, type: 'sink', to, from, send, streamTerminated })
      sink.handle({ 
        to: from,
        from: to,
        method: 'PUSH',
        body: { data: 'ping', error: null }
      })

      sink.on('data', ({ data }) => imsgbuf.push(data))
      sink.on('end', () => 
        sink.end({ data: 'pong' }, () => {
          expect(imsgbuf).to.deep.equal(['ping'])
          expect(msgbuf.length).to.equal(2)
          const msg = msgbuf[1]
          expect(msg).to.deep.equal({ to, from, status: 200, body: { data: 'pong' } })
          done()
        }))
    })

    it('ping pong (ending separately)', done => {
      const imsgbuf = []
      const sink = new Response({ id, type: 'sink', to, from, send, streamTerminated })
      sink.handle({ 
        to: from,
        from: to,
        method: 'PUSH',
        body: { data: 'ping' }
      })

      sink.handle({ 
        to: from,
        from: to,
        method: 'PUSH',
        body: { error: null }
      })

      sink.on('data', ({ data }) => imsgbuf.push(data))
      sink.on('end', () => 
        sink.end({ data: 'pong' }, () => {
          expect(imsgbuf).to.deep.equal(['ping'])
          expect(msgbuf.length).to.equal(2)
          const msg = msgbuf[1]
          expect(msg).to.deep.equal({ to, from, status: 200, body: { data: 'pong' } })
          done()
        }))
    })
  })
})
