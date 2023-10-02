require('dotenv/config')
const express = require('express')
const { Client } = require('pg')

const client = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

const app = express()

app.get('/', (req, res) => res.redirect('/teachers'))

app.get('/teachers', async (req, res) => {
  const result = await client.query('SELECT * from teachers')
  res.json(result.rows)
})

app.get('/students', async (req, res) => {
  const result = await client.query('SELECT * from students')
  res.json(result.rows)
})

const run = async () => {
  await client.connect()

  app.listen(process.env.PORT, () => {
    console.log(`listening ${process.env.PORT}`)
  })
}

run()
