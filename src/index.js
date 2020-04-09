const EventEmitter = require('events')
const uuid = require('uuid')

const { flatten } = require('array-flatten')

const Router = require('./router')

const finalhandler = () => {}

class Impress extends EventEmitter {
  /**
   * @param {object} conn - a connection
   */
  constructor (conn, role) {
    super()

    this.conn = conn
    this.role = role

    /**
     * buffer header or body fragments
     */
    this.bufs = []

    /**
     * buffer incomplete message
     */
    this.message = null

    /**
     * outgoing request, aka, as a client
     */
    this.requestMap = new Map()

    /**
     *
     */
    this.sources = new Map()

    /**
     * root router
     */
    this.router = Router({
      caseSensitive: true, // this.enabled('case sensitive routing'),
      strict: true // this.enabled('strict routing')
    })

    // this.router.use(query(this.get('query parser fn')))
    // this.router.use(middleware.init(this))

    this.router.route('/requests/:uuid')
      .nop(msg => {
        const path = msg.url
        const req = this.requestMap.get(path)
        
        if (req) {
          this.requestMap.delete(path)
          if (msg.status === 200) {
            req.callback(null, msg.body)
          } else if (msg.status === 201) {

            new stream.Readable({
            
            })
            
          } else {
            const err = new Error()
            req.callback(err)
          }
        }
      })

    if (conn) {
      this.conn.on('data', data => this.receive(data))
    }
  }

  send ({ to, from, method, status, body }) {
    let brief, data
    if (Buffer.isBuffer(body)) {
      if (body.length === 0) throw new Error('body length must not be zero')

      data = body
      brief = {
        type: 'binary',
        length: data.length
      }
    } else if (body !== undefined) {
      data = JSON.stringify(body)
      brief = {
        type: 'json',
        length: data.length
      }
    }

    const header = { to, from, method, status, body: brief }
    this.conn.write(JSON.stringify(header))
    this.conn.write('\n')

    if (data) {
      this.conn.write(data)
      this.conn.write('\n')
    }

    return { header, body }
  }

  /**
   * Decode generate message from incoming data
   */
  receive (data) {
    while (data.length) {
      if (this.message) { // expecting body
        const len = this.bufs.reduce((sum, c) => sum + c.length, 0)

        if (len + data.length > this.message.body.length) {
          const msg = this.message
          this.message = null
          const { type, length } = msg.body

          const body = Buffer.concat([...this.bufs, data.slice(0, length - len)])
          this.bufs = []
          data = data.slice(length - len + 1)

          if (type === 'json') {
            msg.body = JSON.parse(body)
          } else if (type === 'binary') {
            msg.body = body
          }

          switch (type) {
            case 'binary':
              msg.body = body
            case 'json':
              msg.body = JSON.parse(body)
            default:
              msg.body = JSON.parse(body)
          }

          this.handleMessage(msg)
        } else {
          this.bufs.push(data)
          data = data.slice(data.length)
        }
      } else {
        // expecting header
        const idx = data.indexOf('\n')
        if (idx === -1) {
          this.bufs.push(data.slice(0, data.length))
          data = data.slice(data.length)
        } else {
          const msg = JSON.parse(Buffer.concat([...this.bufs, data.slice(0, idx)]))
          this.bufs = []
          data = data.slice(idx + 1)
          if (msg.body) {
            this.message = msg
          } else {
            this.handleMessage(msg)
          }
        }
      }
    }
  }

  /**
   * all messages are handled via routing, no hacking
   * not all messages have methods, messages without method will be set to 'NOP' 
   */
  handleMessage (msg) {
    msg.url = msg.to
    msg.method = msg.method || 'NOP'
    msg.role = this.role
    msg.app = this

    this.handle(msg)
  }

  /**
   * callback is used to override default finalhandler (404)
   */
  handle (req, res, callback) {
    const router = this.router
    let done = callback || finalhandler(req, res, {})

    if (!router) {
      done()
      return
    }

    router.handle(req, this, done)
  }

  request (to, method, body, callback) {
    const id = uuid.v4()
    const from = `/requests/${id}`
    const req = this.send({ to, from, method: 'GET', body })
    req.callback = callback
    this.requestMap.set(from, req)
  }

  /**
   * GET may get an object or a stream
   */
  get (to, body, callback) {
    if (typeof body === 'function') {
      callback = body
      body = undefined
    }

    this.request(to, 'GET', body, callback)
  }
}

const impress = (conn, role) => new Impress(conn, role)
impress.Router = Router

module.exports = impress
