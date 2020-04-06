/*!
 * express/impress
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * Copyright(c) 2020 Tianfu Ma
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */
const Route = require('./route')
const Layer = require('./layer')
const methods = require('./methods')

const mixin = require('utils-merge')
const debug = require('debug')('express:router')
const deprecate = require('depd')('express')
const { flatten } = require('array-flatten')
const parseUrl = require('parseurl')

/**
 * Module variables.
 * @private
 */
const objectRegExp = /^\[object (\S+)\]$/
const slice = Array.prototype.slice
const toString = Object.prototype.toString

// append methods to a list of methods
function appendMethods (list, addition) {
  for (let i = 0; i < addition.length; i++) {
    const method = addition[i]
    if (list.indexOf(method) === -1) {
      list.push(method)
    }
  }
}

// get pathname of request
function getPathname (req) {
  try {
    return parseUrl(req).pathname
  } catch (err) {
    return undefined
  }
}

// get type for error message
function gettype (obj) {
  const type = typeof obj

  if (type !== 'object') {
    return type
  }

  // inspect [[Class]] for objects
  return toString.call(obj)
    .replace(objectRegExp, '$1')
}

/**
 * Match path to a layer.
 *
 * @param {Layer} layer
 * @param {string} path
 * @private
 */

function matchLayer (layer, path) {
  try {
    return layer.match(path)
  } catch (err) {
    return err
  }
}

// merge params with parent params
function mergeParams (params, parent) {
  if (typeof parent !== 'object' || !parent) {
    return params
  }

  // make copy of parent for base
  const obj = mixin({}, parent)

  // simple non-numeric merging
  if (!(0 in params) || !(0 in parent)) {
    return mixin(obj, params)
  }

  let i = 0
  let o = 0

  // determine numeric gaps
  while (i in params) {
    i++
  }

  while (o in parent) {
    o++
  }

  // offset numeric indices in params before merge
  for (i--; i >= 0; i--) {
    params[i + o] = params[i]

    // create holes for the merge when necessary
    if (i < o) {
      delete params[i]
    }
  }

  return mixin(obj, params)
}

// restore obj props after function
function restore (fn, obj) {
  const props = new Array(arguments.length - 2)
  const vals = new Array(arguments.length - 2)

  for (let i = 0; i < props.length; i++) {
    props[i] = arguments[i + 2]
    vals[i] = obj[props[i]]
  }

  return function () {
    // restore vals
    for (let i = 0; i < props.length; i++) {
      obj[props[i]] = vals[i]
    }

    return fn.apply(this, arguments)
  }
}

/**
 * A Router is a callable
 * 
 * see: https://hackernoon.com/creating-callable-objects-in-javascript-d21l3te1
 */
class Router extends Function {

  /**
   * Constructs a Router instance
   *
   * @param {object} opts - options
   */
  constructor (opts = {}) {
    super()

    this.params = {}
    this._params = []
    this.caseSensitive = opts.caseSensitive
    this.mergeParams = opts.mergeParams
    this.strict = opts.strict
    this.stack = []

    return new Proxy(this, {
      apply: (target, thisArg, args) => target.handle(...args)
    })
  }

  /**
   * Map the given param placeholder `name`(s) to the given callback.
   *
   * Parameter mapping is used to provide pre-conditions to routes
   * which use normalized placeholders. For example a _:user_id_ parameter
   * could automatically load a user's information from the database without
   * any additional code,
   *
   * The callback uses the same signature as middleware, the only difference
   * being that the value of the placeholder is passed, in this case the _id_
   * of the user. Once the `next()` function is invoked, just like middleware
   * it will continue on to execute the route, or subsequent parameter functions.
   *
   * Just like in middleware, you must either respond to the request or call next
   * to avoid stalling the request.
   *
   *  app.param('user_id', function(req, res, next, id){
   *    User.find(id, function(err, user){
   *      if (err) {
   *        return next(err);
   *      } else if (!user) {
   *        return next(new Error('failed to load user'));
   *      }
   *      req.user = user;
   *      next();
   *    });
   *  });
   *
   * @param {String} name
   * @param {Function} fn
   * @return {app} for chaining
   * @public
   */
  param (name, fn) {
    // param logic
    if (typeof name === 'function') {
      throw new Error('function without name not supported')
    }

    if (name[0] === ':') {
      throw new Error('name started with colon not supported')
    }

    // ensure we end up with a
    // middleware function
    if (typeof fn !== 'function') {
      throw new Error('invalid param() call for ' + name + ', got ' + fn)
    }

    // apply param functions
    const params = this._params
    const len = params.length
    let ret

    for (let i = 0; i < len; ++i) {
      if (ret = params[i](name, fn)) {
        fn = ret
      }
    }

    (this.params[name] = this.params[name] || []).push(fn)
    return this
  }

  /**
   * Dispatch a req, res into the router.
   * @private
   */
  handle (req, res, out) {
    const next = (err) => {
      let layerError = err === 'route' ? null : err

      // remove added slash
      if (slashAdded) {
        req.url = req.url.substr(1)
        slashAdded = false
      }

      // restore altered req.url
      if (removed.length !== 0) {
        req.baseUrl = parentUrl
        req.url = removed + req.url
        removed = ''
      }

      // signal to exit router
      if (layerError === 'router') {
        setImmediate(done, null)
        return
      }

      // no more matching layers
      if (idx >= this.stack.length) {
        setImmediate(done, layerError)
        return
      }

      // get pathname of request
      const path = getPathname(req)

      if (path == null) {
        return done(layerError)
      }

      // find next matching layer
      let layer
      let match
      let route

      while (match !== true && idx < this.stack.length) {
        layer = this.stack[idx++]
        match = matchLayer(layer, path)
        route = layer.route

        if (typeof match !== 'boolean') {
          // hold on to layerError
          layerError = layerError || match
        }

        if (match !== true) {
          continue
        }

        if (!route) {
          // process non-route handlers normally
          continue
        }

        if (layerError) {
          // routes do not match with a pending error
          match = false
          continue
        }

        const method = req.method
        const has_method = route._handles_method(method)

        // build up automatic options response
        if (!has_method && method === 'OPTIONS') {
          appendMethods(options, route._options())
        }

        // don't even bother matching route
        if (!has_method && method !== 'HEAD') {
          match = false
          continue
        }
      }

      // no match
      if (match !== true) {
        return done(layerError)
      }

      // store route for dispatch on change
      if (route) {
        req.route = route
      }

      // Capture one-time layer values
      req.params = this.mergeParams
        ? mergeParams(layer.params, parentParams)
        : layer.params

      const layerPath = layer.path

      // this should be done for the layer
      this.process_params(layer, paramcalled, req, res, err => {
        if (err) {
          return next(layerError || err)
        }

        if (route) {
          return layer.handle_request(req, res, next)
        }

        trim_prefix(layer, layerError, layerPath, path)
      })
    }

    const trim_prefix = (layer, layerError, layerPath, path) => {
      if (layerPath.length !== 0) {
        // Validate path breaks on a path separator
        const c = path[layerPath.length]
        if (c && c !== '/' && c !== '.') return next(layerError)

        // Trim off the part of the url that matches the route
        // middleware (.use stuff) needs to have the path stripped
        debug('trim prefix (%s) from url %s', layerPath, req.url)
        removed = layerPath
        req.url = req.url.substr(removed.length)

        // Ensure leading slash
        if (req.url[0] !== '/') {
          req.url = '/' + req.url
          slashAdded = true
        }

        // Setup base URL (no trailing slash)
        req.baseUrl = parentUrl + (removed[removed.length - 1] === '/'
          ? removed.substring(0, removed.length - 1)
          : removed)
      }

      debug('%s %s : %s', layer.name, layerPath, req.originalUrl)

      if (layerError) {
        layer.handle_error(layerError, req, res, next)
      } else {
        layer.handle_request(req, res, next)
      }
    }

    debug('dispatching %s %s', req.method, req.url)

    let idx = 0
    let removed = ''
    let slashAdded = false
    const paramcalled = {}

    // manage inter-router variables
    const parentParams = req.params
    const parentUrl = req.baseUrl || ''
    let done = restore(out, req, 'baseUrl', 'next', 'params')

    // setup next layer
    req.next = next

    // setup basic req values
    req.baseUrl = parentUrl
    req.originalUrl = req.originalUrl || req.url

    next()
  }

  /**
   * Process any parameters for the layer.
   * @private
   */
  process_params (layer, called, req, res, done) {
    const params = this.params

    // captured parameters from the layer, keys and values
    const keys = layer.keys

    // fast track
    if (!keys || keys.length === 0) {
      return done()
    }

    let i = 0
    let name
    let paramIndex = 0
    let key
    let paramVal
    let paramCallbacks
    let paramCalled

    // process params in order
    // param callbacks can be async
    function param (err) {
      if (err) {
        return done(err)
      }

      if (i >= keys.length) {
        return done()
      }

      paramIndex = 0
      key = keys[i++]
      name = key.name
      paramVal = req.params[name]
      paramCallbacks = params[name]
      paramCalled = called[name]

      if (paramVal === undefined || !paramCallbacks) {
        return param()
      }

      // param previously called with same value or error occurred
      if (paramCalled && (paramCalled.match === paramVal ||
        (paramCalled.error && paramCalled.error !== 'route'))) {
        // restore value
        req.params[name] = paramCalled.value

        // next param
        return param(paramCalled.error)
      }

      called[name] = paramCalled = {
        error: null,
        match: paramVal,
        value: paramVal
      }

      paramCallback()
    }

    // single param callbacks
    function paramCallback (err) {
      const fn = paramCallbacks[paramIndex++]

      // store updated value
      paramCalled.value = req.params[key.name]

      if (err) {
        // store error
        paramCalled.error = err
        param(err)
        return
      }

      if (!fn) return param()

      try {
        fn(req, res, paramCallback, paramVal, key.name)
      } catch (e) {
        paramCallback(e)
      }
    }

    param()
  }

  /**
   * Use the given middleware function, with optional path, defaulting to "/".
   *
   * Use (like `.all`) will run for any http METHOD, but it will not add
   * handlers for those methods so OPTIONS requests will not consider `.use`
   * functions even if they could respond.
   *
   * The other difference is that _route_ path is stripped and not visible
   * to the handler function. The main effect of this feature is that mounted
   * handlers can operate without any code changes regardless of the "prefix"
   * pathname.
   *
   * @public
   */
  use (fn) {
    let offset = 0
    let path = '/'

    // default path to '/'
    // disambiguate router.use([fn])
    if (typeof fn !== 'function') {
      let arg = fn

      while (Array.isArray(arg) && arg.length !== 0) {
        arg = arg[0]
      }

      // first arg is the path
      if (typeof arg !== 'function') {
        offset = 1
        path = fn
      }
    }

    const callbacks = flatten(slice.call(arguments, offset))

    if (callbacks.length === 0) {
      throw new TypeError('Router.use() requires a middleware function')
    }

    for (let i = 0; i < callbacks.length; i++) {
      const fn = callbacks[i]

      if (typeof fn !== 'function') {
        throw new TypeError('Router.use() requires a middleware function but got a ' + gettype(fn))
      }

      // add the middleware
      debug('use %o %s', path, fn.name || '<anonymous>')

      const layer = new Layer(path, {
        sensitive: this.caseSensitive,
        strict: false,
        end: false
      }, fn)

      layer.route = undefined

      this.stack.push(layer)
    }

    return this
  }

  /**
   * Create a new Route for the given path.
   *
   * Each route contains a separate middleware stack and VERB handlers.
   *
   * See the Route api documentation for details on adding handlers
   * and middleware to routes.
   *
   * @param {String} path
   * @return {Route}
   * @public
   */
  route (path) {
    const route = new Route(path)

    const layer = new Layer(path, {
      sensitive: this.caseSensitive,
      strict: this.strict,
      end: true
    }, route.dispatch.bind(route))

    layer.route = route

    this.stack.push(layer)
    return route
  }
}

// create Router#VERB functions
methods.concat('all').forEach(function (method) {
  Router.prototype[method] = function (path) {
    const route = this.route(path)
    route[method].apply(route, slice.call(arguments, 1))
    return this
  }
})

/**
 * Initialize a new `Router` with the given `options`.
 *
 * @param {Object} [options]
 * @return {Router} which is an callable function
 * @public
 */
module.exports = options => new Router(options)
