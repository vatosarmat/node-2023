require('dotenv/config')

const { App } = require('./app')

const app = new App()
app.setup().then(() => app.listen())
