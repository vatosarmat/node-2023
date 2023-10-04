require('dotenv/config')
const {} = require('jest')
const path = require('path')
const qs = require('querystring')
const { execSync } = require('node:child_process')
const request = require('supertest')

const { App } = require('../src/app')
const { formatDate } = require('../src/utils')

const LESSONS_PER_PAGE = parseInt(process.env.LESSONS_PER_PAGE)
const MAX_LESSONS = parseInt(process.env.MAX_LESSONS)

/** @type {request.SuperTest<request.Test>}*/
let R

/** @type {App}*/
let app

beforeEach(async () => {
  //throws in case of fail
  const manageBin = path.join(__dirname, '..', 'scripts', 'manage')
  execSync(`${manageBin} db-reset && ${manageBin} db-seed`)

  app = new App()
  await app.setup()

  client = app.client

  R = request(app.express)
})

afterEach(async () => {
  await app.client.end()
})

describe('only get lessons', () => {
  test('No filters', async () => {
    const response = await R.get('/')
    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject([
      {
        id: 1,
      },
      {
        id: 2,
      },
      {
        id: 3,
      },
      {
        id: 4,
      },
      {
        id: 5,
      },
    ])
  })

  test('All filters', async () => {
    const urlQuery = qs.stringify({
      //1,3,4,6,8,9
      status: 1,
      //1,3,6,8,9
      date: '2019-05-15,2019-09-03',
      //1,8
      teacherIds: '1,2,4',
      //1,8
      studentsCount: '3',
      //8
      page: 2,
      lessonsPerPage: 1,
    })
    console.log(urlQuery)
    const response = await R.get(`/?${urlQuery}`)
    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject([
      {
        id: 8,
        visitCount: 2,
        students: [{ id: 1 }, { id: 2 }, { id: 4 }],
        teachers: [{ id: 2 }, { id: 3 }, { id: 4 }],
      },
    ])
  })

  test('Invalid query', async () => {
    const urlQuery = qs.stringify({
      status: 1,
      date: '2019-05-15,2019-09-03',
      teacherIds: 'lorem',
      studentsCount: '3',
      page: 2,
      lessonsPerPage: 1,
    })
    console.log(urlQuery)
    const response = await R.get(`/?${urlQuery}`)
    expect(response.statusCode).toBe(400)
  })
})

describe('add and get lessons', () => {
  test('add by lessonsCount', async () => {
    const body = {
      teacherIds: [2],
      title: 'Lorem ipsium',
      days: [1],
      firstDate: '2023-10-05',
      lessonsCount: 300,
    }

    console.log(JSON.stringify(body))
    const response = await R.post('/lessons').send(body)
    expect(response.statusCode).toBe(200)
    expect(response.body).toBeArrayOfSize(52)

    console.log(response.body)

    const urlQuery = qs.stringify({
      date: '2023-10-05,2024-10-05',
      teacherIds: '2',
      studentsCount: '0',
      lessonsPerPage: 100,
    })
    console.log(urlQuery)
    const response2 = await R.get(`/?${urlQuery}`)
    expect(response2.statusCode).toBe(200)
    expect(response2.body).toMatchObject(
      response.body.map(id => ({
        id,
      }))
    )
  })

  test('add by lastDate', async () => {
    const firstDate = '2023-10-05'
    const body = {
      teacherIds: [2],
      title: 'Lorem ipsium',
      days: [1, 2, 3, 4, 0, 5, 6],
      firstDate,
      lastDate: '2024-10-05',
    }

    console.log(JSON.stringify(body))
    const response = await R.post('/lessons').send(body)
    expect(response.statusCode).toBe(200)
    expect(response.body).toBeArrayOfSize(MAX_LESSONS)

    console.log(response.body)

    const urlQuery = qs.stringify({
      date: firstDate + ',2024-10-05',
      teacherIds: '2',
      studentsCount: '0',
      lessonsPerPage: 500,
    })
    console.log(urlQuery)
    const response2 = await R.get(`/?${urlQuery}`)
    expect(response2.statusCode).toBe(200)
    const lastCreated = new Date(firstDate)
    lastCreated.setUTCDate(lastCreated.getUTCDate() + MAX_LESSONS - 1)
    expect(response2.body[MAX_LESSONS - 1].date).toBe(formatDate(lastCreated))
  })

  test('Invalid body', async () => {
    const firstDate = '2023-10-05'
    const body = {
      teacherIds: [2],
      title: 'Lorem ipsium',
      days: [1, 2, 7],
      firstDate,
      lastDate: '2024-10-05',
    }

    console.log(JSON.stringify(body))
    const response = await R.post('/lessons').send(body)
    expect(response.statusCode).toBe(400)
  })
})
