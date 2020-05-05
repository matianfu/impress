# ClientRequest





```javascript
peer.get('/hello', (err, { data, chunk, stream }) => {
	if (err) { 
        // request error, or server responded error
        // status code
    } else if (stream) {
        // response is a stream
        stream.on('error', err => {
            // response error
        })
        stream.on('data', data => {})
        stream.on('close', () => {})
    } else {
        // response is not a stream
        // data or chunk or nothing
    }
})
```



