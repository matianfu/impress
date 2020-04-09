const path = require('path')
const fs = require('fs')
const net = require('net')
const stream = require('stream')

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
      sapp.router.get('/hello', (msg, app) => {
        app.send({ 
          to: msg.from, 
          status: 200,
          body: 'cold'
        })
      })

/**  
      sapp.router.get('/hello', msg => {
        const id = uuid.v4()
        const source = `/hello/~/sources/${id}`

        sapp.send({
          to: msg.from,
          status: 201,
          source
        })

        sapp.send({
          to: msg.from,
          from: source,
          body: { value: 'foo' }
        })

        sapp.send({
          to: msg.from,
          from: source,
          body: null
        })
      })
*/
    })

    server.on('error', err => { })
    server.listen('/run/impress')

    const client = net.createConnection('/run/impress', () => {
      const capp = impress(client, 'client')

      capp.get('/hello', (err, body) => {
        expect(err).to.equal(null)
        expect(body).to.equal('cold')
        done() 
      })

    })
  })
})
