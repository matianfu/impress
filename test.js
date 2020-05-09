const chai = require('chai')
const expect = chai.expect

const hello = new require('stream').Writable({
  autoDestroy: true,

  

  destroy (err, callback) {
    console.log('6 before callback in _destroy')
    process.nextTick(() => console.log('i. before _destory callback nextTick'))
    callback(err)
    console.log('7 after callback in _destory')
    process.nextTick(() => console.log('iii. after _destory callback nextTick'))
  },

  final (callback) {
    console.log('4 before callback in _final')
    callback()
    console.log('8 after callback in _final')
  }
}).on('error', err => console.log('error'))
  .on('finish', () => console.log('5 finish'))
  .on('close', () => console.log('ii. close'))

console.log('1 before end')
process.nextTick(() => console.log('3 before end nextTicked'))

hello.end()

console.log('2 after end')
process.nextTick(() => console.log('9 after end nextTicked'))

/**
 * ```
 * $ node test.js
 * 1 before end
 * 2 after end
 * 3 before end nextTicked
 * 4 before callback in _final
 * 5 finish
 * 6 before callback in _destroy
 * 7 after callback in _destory
 * 8 after callback in _final
 * 9 after end nextTicked
 * i. before _destory callback nextTick
 * ii. close
 * iii. after _destory callback nextTick
 * ```
 *  
 * 1. _final is invoked in end() via nextTick
 * 2. finish is emitted in _final's callback
 * 3. _destroy is invoked in _final's callback
 * 4. close is emitted in callback of _destroy via nextTick
 */


