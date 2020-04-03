const EventEmitter = require('events')
const uuid = require('uuid')

const { flatten } = require('array-flatten')

const Router = require('./router')

class Impress extends EventEmitter {
  constructor (conn) {
    super()

    this.conn = conn

    this.bufs = []
    this.message = null

    this.requestMap = new Map()

    if (conn) { this.conn.on('data', data => this.decode(data)) }
  }

  handle (req, res, callback) {
    var router = this._router
    var done = callback || finalhandler(req, res, {})

    if (!router) {
      done()
      return
    }

    router.handle(req, res, done)
  }

  lazyrouter () {
    if (!this._router) {
      this._router = new Router({
        caseSensitive: true, // this.enabled('case sensitive routing'),
        strict: true // this.enabled('strict routing')
      })

      // this._router.use(query(this.get('query parser fn')))
      // this._router.use(middleware.init(this))
    }
  }

  /**
   * app.use([path], callback [,callback...])
   * path may be
   * - a path string
   * - a path pattern
   * - a regex
   * - an array of combinations of any of the above
   *
   * path defaults to '/'
   *
   * callback can be:
   * - middleware function
   * - multiple middlware functions
   * - an array of middleware functions
   * - a combination of all of the above
   *
   * see http://expressjs.com/en/4x/api.html#middleware-callback-function-examples
   */
  use (fn) {
    var offset = 0
    var path = '/'

    if (typeof fn !== 'function') {
      var arg = fn

      // nested allowed ???
      while (Array.isArray(arg) && arg.length !== 0) {
        arg = arg[0]
      }

      if (typeof arg !== 'function') {
        offset = 1
        path = fn
      }
    }

    var fns = flatten(Array.prototype.slice.call(arguments, offset))

    if (fns.length === 0) {
      throw new TypeError('app.use() requires a middleware function')
    }

    this.lazyrouter()
    var router = this._router

    console.log('======')
    console.log(router)
    console.log('======')

    fns.forEach(function (fn) {
      if (!fn || !fn.handle || !fn.set) {
        return router.use(path, fn)
      }

      fn.mountpath = path
      fn.parent = this

      router.use(path, function mounted_app (req, res, next) {
        var orig = req.app
        fn.handle(req, res, function (err) {
          setPrototypeOf(req, orig.request)
          setPrototypeOf(res, orig.response)
          next(err)
        })
      })

      fn.emit('mount', this)
    })

    return this
  }
}

module.exports = Impress
