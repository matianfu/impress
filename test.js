const impress = require('./src/index') 

const app = impress() 

app.use('/', function(req, res, next) {
  console.log('pig pig')
  next()
})

const router = impress.Router()
router.get('/bar', function (req, res, next) {
  console.log('bling bling')
})

app.use('/foo', router)

const req = {
  method: 'GET',
  url: '/foo/bar'
}

const res = {}

app.handle(req, res, () => {})
