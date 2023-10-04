const express = require('express')
const compression = require('compression')

const { Client, types } = require('pg')
const { builtins } = require('pg-types')

const { Service } = require('./service')
const { toAppError, AppError } = require('./error')

types.setTypeParser(builtins.DATE, v => v)

const catchErrors = handler => (req, res, next) => {
  handler(req, res, next).catch(error => {
    return next(error)
  })
}

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }
  const appError = toAppError(err)
  res.status(appError.code).json(appError.toObject())
}

const notFoundHandler = (req, res) => {
  res.status(404).json({ code: 404, message: 'No such resource' })
}

class App {
  /** @type {Service} */
  service

  /** @type {Client} */
  client

  constructor() {
    this.express = express()
    this.client = new Client({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    })
  }

  async setup() {
    await this.client.connect()
    this.service = new Service(this.client)

    if (process.env.NODE_ENV !== 'test') {
      this.express.use(compression())
    }

    this.express.use(express.json())

    this.express.get(
      '/',
      catchErrors(async (req, res) => {
        console.log(req.query)
        res.json(await this.service.getLessons(req.query))
      })
    )

    this.express.post(
      '/lessons',
      catchErrors(async (req, res) => {
        console.log(req.body)
        res.json(await this.service.addLessons(req.body))
      })
    )

    this.express.use(notFoundHandler)
    this.express.use(errorHandler)
  }

  listen() {
    this.express.listen(process.env.PORT, () => {
      console.log(`listening ${process.env.PORT}`)
    })
  }
}

exports.App = App
