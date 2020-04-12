const path = require('path')
const fs = require('fs')
const net = require('net')
const stream = require('stream')
const { Readable, Writable } = stream

const uuid = require('uuid')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const expect = require('chai').expect

const impress = require('src/index') 

describe(path.basename(__filename), () => {
  beforeEach(done => rimraf('/run/impress', done))

  it('GET /hello', done => {
    const server = net.createServer(c => {
      const sapp = impress(c, 'server')
      sapp.get('/hello', (msg, app) => 
        app.send({ to: msg.from, status: 200, body: { data: 'cold' } }))

    })

    server.on('error', err => console.log(err))
    server.listen('/run/impress')

    const client = net.createConnection('/run/impress', () => {
      const app = impress(client, 'client')
      app.request.get('/hello', (err, body) => {
        expect(err).to.equal(null)
        expect(body).to.deep.equal({ data: 'cold' })
        client.end()
        client.on('close', () => {
          server.close()
          done()
        })
      })
    })
  })

  it('GET /hello stream', done => {
    const server = net.createServer(c => {
      const peer = impress(c, 'server') 
      peer.get('/hello', (msg, app) => {
        const id = uuid.v4() 
        const source = `/hello/#/sources/${id}`
    
        peer.send({
          to: msg.from,
          status: 201,
          body: { data: source }
        })   

        peer.send({
          to: msg.from,
          body: { data: 'hello' }
        })

        peer.send({
          to: msg.from,
          body: { data: 'world' },
          eof: true
        })
      })
    })

    server.on('error', err => console.log(err))
    server.listen('/run/impress')

    const client = net.createConnection('/run/impress', () => {
      const app = impress(client, 'client')
      app.request.get('/hello', (err, body) => {
        expect(err).to.equal(null)
        expect(body instanceof Readable).to.equal(true)
        
        const buf = []

        body.on('data', data => buf.push(data))
        body.on('end', () => {
          expect(buf).to.deep.equal([
            { data: 'hello' },
            { data: 'world' }
          ])

          done()
        })
      })
    })
  })


})
