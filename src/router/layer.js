/*!
 * express/impress
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * Copyright(c) 2020 Tianfu Ma (matianfu@gmail.com)
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */
const { pathToRegexp } = require('path-to-regexp')
const debug = require('debug')('express:router:layer')

/**
 * Module variables.
 * @private
 */
class Layer {
  /**
   * @param {string} path
   * @param {object} options
   * @param {function} fn
   */
  constructor (path, options, fn) {
    debug('new %o', path)

    const opts = options || {}

    this.handle = fn
    this.name = fn.name || '<anonymous>'
    this.params = undefined
    this.path = undefined
    this.regexp = pathToRegexp(path, this.keys = [], opts)

    // set fast path flags
    this.regexp.fast_star = path === '*'
    this.regexp.fast_slash = path === '/' && opts.end === false
  }

  /**
   * Handle the error for the layer.
   *
   * @param {Error} error
   * @param {Request} req
   * @param {Response} res
   * @param {function} next
   * @api private
   */
  handle_error (error, req, res, next) {
    const fn = this.handle

    if (fn.length !== 4) {
      // not a standard error handler
      return next(error)
    }

    try {
      fn(error, req, res, next)
    } catch (err) {
      next(err)
    }
  }

  /**
   * Handle the request for the layer.
   *
   * @param {Request} req
   * @param {Response} res
   * @param {function} next
   * @api private
   */
  handle_request (req, res, next) {
    const fn = this.handle

    if (fn.length > 3) {
      // not a standard request handler
      return next()
    }

    try {
      fn(req, res, next)
    } catch (err) {
      next(err)
    }
  }

  /**
   * Check if this route matches `path`, if so
   * populate `.params`.
   *
   * @param {String} path
   * @return {Boolean}
   * @api private
   */
  match (path) {
    let match

    // TODO !== ???
    if (path != null) {
      // fast path non-ending match for / (any path matches)
      if (this.regexp.fast_slash) {
        this.params = {}
        this.path = ''
        return true
      }

      // fast path for * (everything matched in a param)
      if (this.regexp.fast_star) {
        this.params = { 0: path }
        this.path = path
        return true
      }

      // match the path
      match = this.regexp.exec(path)
    }

    if (!match) {
      this.params = undefined
      this.path = undefined
      return false
    }

    // store values
    this.params = {}
    this.path = match[0]

    for (let i = 1; i < match.length; i++) {
      const key = this.keys[i - 1]
      const prop = key.name
      const val = match[i]

      if (val !== undefined || !(Object.prototype.hasOwnProperty.call(this.params, prop))) {
        this.params[prop] = val
      }
    }

    return true
  }
}

/**
 * Module exports.
 * @public
 */
module.exports = Layer
