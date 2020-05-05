
peer.get('/hello', (err, { data, blob, res }) => {
    if (res) {
      res.on('error', err => {
        // response streaming error or connection error
      })
      res.on('data', data => {})
      res.on('close', () => {})
    } else {
       
    }
  })

peer
  .get('/hello')
  .on('error', err => {
    // all sorts of error
  }) 
  .on('response', ({ data, blob }) => {
  })
  .on('data', data => {})
  .on('close', () => {})

peer
  .get('/hello')
  .then(err, ({ data, blob, res }) => {
    // all sorts of error
  })
  .on('data', data => {})
  .on('close', () => {})

