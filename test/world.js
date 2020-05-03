const path = require('path')
const fs = require('fs')
const net = require('net')
const stream = require('stream')
const { Readable, Writable, Duplex } = stream

const uuid = require('uuid')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const expect = require('chai').expect

const ServerResponse = require('src/server-response')
const impress = require('src/index') 

describe(path.basename(__filename), () => {

  let alice, bob

  beforeEach(done => {
    rimraf('/run/impress', done) 
    alice = impress()
    bob = impress()
  })

  afterEach(() => alice.close()) 

  /**
   * bob: { 
   *   to: '/hello', 
   *   from: '/#requests/...', 
   *   method: 'GET'
   * }
   * alice: { 
   *   to: '/#requests/...', 
   *   status: 200, 
   *   data: 'world' 
   * }
   */
  it('GET /hello', done => {
    alice.get('/hello', (req, res) => res.status(200).send({ data: 'world'}))

    // 404 equivalent
    alice.use((msg, peer, next) => next(new Error('no handler')))
    // 500 equivalent
    alice.use((err, msg, peer, next) => console.log(err))

    alice.listen('/run/impress')

    const peer = bob.connect('/run/impress')
    peer.get('/hello', (err, { data, blob, readable }) => {
      expect(err).to.equal(null)
      expect(data).to.equal('world')
      expect(blob).to.be.undefined
      expect(readable).to.be.undefined
      done()
    })
  })

  /**
   * bob: { 
   *   to: '/hello', 
   *   from: '/#requests/alice/4321', 
   *   method: 'GET' 
   * }
   * alice: { 
   *   to: '/#requests/alice/4321', 
   *   status: 200, 
   *   pipe: { 
   *     source: '/hello/#pipes/bob/1234' // source path
   *   } 
   * }
   * alice: {
   *   to: '/#requests/...',
   *   from: '/hello/#pipes/bob/1234', // optional
   *   data: 'hello'
   * }
   * alice: {
   *   to: '/#requests/...',
   *   from: '/hello/#pipes/bob/1234', // optional
   *   data: 'world'
   * }
   * alice: { 
   *   to: '/#requests/...',
   *   from: '/hello/#pipes/bob/1234', // optional
   * }
   */
  it.only('GET /hello (downstream)', done => {
    alice.get('/hello', (req, res) => {
      res.write({ data: 'hello' })
      setTimeout(() => { 
        res.write({ data: 'world' })
        res.end()
      }, 500)
    })

    // 404 equivalent
    alice.use((msg, peer, next) => next(new Error('no handler')))
    // 500 equivalent
    alice.use((err, msg, peer, next) => console.log(err))

    alice.listen('/run/impress')

    const peer = bob.connect('/run/impress')
    peer.get('/hello', (err, { data, blob, stream }) => {
      expect(err).to.equal(null)
      expect(data).to.be.undefined
      expect(blob).to.be.undefined

      const read = []
      stream.on('data', data => read.push(data))
      stream.on('close', () => {
        expect(read).to.deep.equal([
          { data: 'hello' },
          { data: 'world' }
        ])
        done()
      })

    })    
  })

  /**
   * bob: {
   *   to: '/hello',
   *   from: '/#requests/alice/123',
   *   method: 'GET',
   *   pipe: {}
   * }
   * alice: {
   *   to: '/#requests/alice/123',
   *   pipe: {
   *     sink: '/hello/#pipes/bob/456'
   *   }
   * }
   * bob: {
   *   to: '/hello/#pipes/bob/456',
   *   data: 'hello'
   * }
   * bob: {
   *   to: '/hello/#pipes/bob/456',
   *   data: 'world'
   * }
   * bob: {
   *   to: '/hello/#pipes/bob/456
   * }
   * alice: {
   *   status: 200,
   *   data: 'foobar'
   * }
   */
  it('GET /hello (upstream)', done => {
    alice.get('/hello', (req, res) => {
      const collection = []
      req.on('data', data => collection.push(data))
      req.on('end', () => res.send({ data: 'foobar' }))
    })

    // 404 equivalent
    alice.use((msg, peer, next) => next(new Error('no handler')))
    // 500 equivalent
    alice.use((err, msg, peer, next) => console.log(err))

    alice.listen('/run/impress')

    const peer = bob.connect('/run/impress')
    const req = peer.get('/hello', { pipe: {} })

    req
      .then(res => {
        expect(res).to.deep.equal({ data: 'foobar' })
        done()
      })
      .catch(e => done(e))

    req.write({ data: 'hello' })
    req.write({ data: 'world' })
    req.end()
  })

  /**
   * this is a fictionary test
   */
  it('GET /hello (upstream & downstream)', done => {

    alice.get('/hello', (req, res) => {
      const collection = []
      req.on('data', data => collection.push(data))
      req.on('end', () => {
        res.write({ data: 'foo' })
        res.write({ data: 'bar' })
        res.end()
      })
    })

    // 404 equivalent
    alice.use((msg, peer, next) => next(new Error('no handler')))
    // 500 equivalent
    alice.use((err, msg, peer, next) => console.log(err))

    alice.listen('/run/impress')

    const peer = bob.connect('/run/impress')
    const req = peer.get('/hello', { pipe: {} })

    req
      .then(({ data, blob, readable }) => {
        expect(data).to.be.undefined
        expect(blob).to.be.undefined

        const collection = []
        readable.on('data', data => collection.push(data))
        readable.on('end', () => {
          expect(collection).to.deep.equal([
            { data: 'foo' },
            { data: 'bar' }
          ])
          done()
        })
      })
      .catch(e => done(e))

    req.write({ data: 'hello' })
    req.write({ data: 'world' })
    req.end()
  })
})
