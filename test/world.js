const path = require('path')
const fs = require('fs')
const net = require('net')
const stream = require('stream')
const { Readable, Writable } = stream

const uuid = require('uuid')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const expect = require('chai').expect

// const Response = require('src/response')
const impress = require('src/index') 

describe(path.basename(__filename), () => {

  let alice, bob

  beforeEach(done => {
    rimraf('/run/impress', done) 
    alice = impress()
    bob = impress()
  })

  afterEach(() => alice.close()) 

  it.only('GET /hello', done => {
    alice.get('/hello', (msg, peer) => 
      peer.respond(msg, 200, { data: 'world' }))

    // 404 equivalent
    alice.use((msg, peer, next) => {
      const err = new Error('no handler')
      next(err)
    })

    // 500 equivalent
    alice.use((err, msg, peer, next) => {
      console.log(err)
    })

    alice.listen('/run/impress')

    const peer = bob.connect('/run/impress')

    peer.get('/hello', (err, { data, chunk, readable }) => {
      expect(err).to.equal(null)
      expect(data).to.equal('world')
      expect(chunk).to.be.undefined
      expect(readable).to.be.undefined
      done()
    })
  })

  /**
   * 
   */
  it('GET /hello stream', done => {
    const alice = impress()
    alice.get('/hello', (msg, peer) => {
      const id = uuid.v4()
      const source = `/hello/#sources/${peer.id}/${id}`
      peer.respond(msg, 200, { meta: { source } })
      peer.write({ to: msg.from, body: { data: 'hello' } })
      peer.write({ to: msg.from, body: { data: 'world' } })
      peer.write({ to: msg.from, body: {} })
    })

    alice.push('/hello/#sources/:peerId/:id', (msg, peer) => {
      // peer.push(
    })

/**
    alice.get('/hello', (msg, peer) => {
      const id = uuid.v4()
      const from = `/hello/#sources/${peer.id}/${id}`
      const source = new Response({ 
        id, 
        type: 'source', 
        to: msg.from, from, 
        send: (...args) => peer.write(...args),
        streamTerminated: (id) => {
          peer.responses.delete(id)
        }
      }) 
      peer.responses.set(id, source)
      
      source.write({ data: 'hello' })
      source.end({ data: 'world' })
      // peer.write({ to: msg.from, body: { data: 'world', error: null } })
    })
*/

    // 404 equivalent
    alice.use((msg, peer, next) => {
      console.log('404 no handler, msg', msg)
      const err = new Error('no handler')
      next(err)
    })

    // 500 equivalent
    alice.use((err, msg, peer, next) => {
      console.log('500 internal error', err, msg)
    })

    alice.listen('/run/impress')

    const bob = impress()
    const peer = bob.connect('/run/impress') 

    peer.get('/hello', (err, rs) => {
      expect(err).to.equal(null)
      expect(rs instanceof Readable).to.equal(true)
      const buf = []
      rs.on('data', data => buf.push(data))
      rs.on('end', () => {
        expect(buf).to.deep.equal([
          { data: 'hello' },
          { data: 'world' }
        ])
        done()
      })
    })
  })

  /**
   * /hello create a sink and respond with path
   *
   * sink {
   *   id, method, a readable stream
   * }
   */

  it('POST /hello stream', done => {
    const alice = impress()
    alice.posts('/hello', (msg, peer) => {
      const id = uuid.v4()
      const path = `/hello/#sinks/${peer.id}/${id}`
      const readable = new Readable({ objectMode: true, read () {} })
      const sink = { id, readable }
      peer.sinks.set(id, sink)
      peer.respond(msg, 201, { data: path })
    })
    .push('/hello/#sinks/:peerId/:id', (msg, peer) => {
      const { peerId, id } = msg.params 
      const sink = peer.sinks.get(id)
      if (sink && sink.readable && msg.body) {
        sink.readable.push(msg.body)
      }
    })
    .delete('/hello/#sinks/:peerId/:id', (msg, peer) => {
      const { peerId, id } = msg.params
      const sink = peer.sinks.get(id)
      if (sink) {
        peer.sinks.delete(id)
        sink.readable.push(null)
      }

      const readable = sink.readable
      const buf = []
      readable.on('data', data => buf.push(data))
      readable.on('end', () => {
        peer.respond(msg, 200, {})
      })
    })

    alice.listen('/run/impress')

    const bob = impress()
    const peer = bob.connect('/run/impress')

    peer.tag = 'bob'

    const ws = peer.posts('/hello')
    ws.write({ data: 'hello' })
    ws.write({ data: 'world' })
    ws.end((err, body) => {
      expect(err).to.equal(null)
      done()
    })
  })
})
