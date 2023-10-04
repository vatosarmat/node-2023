require('dotenv/config')
const express = require('express')
const { Client } = require('pg')
const { builtins, getTypeParser } = require('pg-types')

const { Service } = require('./service')

const client = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  types: {
    getTypeParser: (oid, format) => {
      switch (oid) {
        case builtins.DATE:
          if (format === 'text') {
            return v => v
          }
      }
      return getTypeParser(oid, format)
    },
  },
})

const main = async () => {
  await client.connect()
  const service = new Service(client)

  const app = express()

  app.get('/', async (req, res) => {
    console.log(req.query)
    res.json(await service.getLessons(req.query))
  })

  app.post('/lessons', async (req, res) => {
    console.log(req.body)
    res.json(await service.addLessons(req.body))
  })

  app.listen(process.env.PORT, () => {
    console.log(`listening ${process.env.PORT}`)
  })
}

main()
