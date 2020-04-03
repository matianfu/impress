const Impress = require('./src/index') 

const app = new Impress() 

app.use('/', function(req, res, next) {
})

app.use('/hello', function (req, res, next) {
})

const req = {
  method: 'get',
  url: '/hello'
}
const res = {}

app.handle(req, res, () => {})
