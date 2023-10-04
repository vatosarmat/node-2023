const dedent = require('dedent')
const { Client } = require('pg')
const {
  hasValue,
  numericRange,
  formatDate,
  uniqueSort,
  isValidDate,
  isInteger,
} = require('./utils')

class LessonsQueryBuilder {
  queryParams = []

  refined = {}

  placeholders = {}

  scalar(key) {
    this.queryParams.push(this.refined[key])
    const ph = '$' + this.queryParams.length
    this.placeholders[key] = ph
    return ph
  }

  vector(key, sep = ',', transform = v => v) {
    const values = this.refined[key]
    const placeholders = numericRange(this.queryParams.length + 1, values.length)
      .map(ph => transform('$' + ph.toString()))
      .join(sep)

    this.placeholders[key] = placeholders
    this.queryParams.push(...values)
    return placeholders
  }
}

class AddQueryBuilder extends LessonsQueryBuilder {
  refineTeacherIds(body) {
    if (hasValue(body, 'teacherIds')) {
      const { teacherIds } = body
      if (!Array.isArray(teacherIds)) {
        throw new Error('"teacherIds" must be array')
      }

      if (teacherIds.length > 0 && teacherIds.some(item => !isInteger(item, 1))) {
        throw new Error('"teacherIds" must be positive integers array')
      }

      this.refined.teacherIds = uniqueSort(teacherIds)
    } else {
      this.refined.teacherIds = []
    }
  }

  refineDaysAndFirstDate(body) {
    if (
      !(
        hasValue(body, 'days') &&
        Array.isArray(body.days) &&
        body.days.length > 0 &&
        body.days.every(item => isInteger(item, 0, 6))
      )
    ) {
      throw new Error('"days" missing or invalid')
    }

    const firstDate = new Date(body.firstDate)
    if (!(hasValue(body, 'firstDate') && !isNaN(firstDate))) {
      throw new Error('"firstDate" missing or invalid')
    }

    const days = uniqueSort(body.days)
    const firstDow = firstDate.getUTCDay()

    const dayShifts = Array(days.length)
    let actualFirstDate = null
    for (let i = 0; i < days.length; i++) {
      if (!actualFirstDate) {
        if (firstDow <= days[i]) {
          firstDate.setUTCDate(firstDate.getUTCDate() + days[i] - firstDow)
          actualFirstDate = formatDate(firstDate)
        }
      }

      dayShifts[i] = days[(i + 1) % days.length] - days[i]
      if (dayShifts[i] <= 0) {
        dayShifts[i] += 7
      }
    }

    this.refined.firstDate = actualFirstDate
    this.refined.dayShifts = dayShifts
    this.refines.dowsCount = dayShifts.length
  }

  refineLessonsCountAndLastDate(body) {
    if (hasValue(body, 'lessonsCount') && hasValue(body, 'lastDate')) {
      throw new Error(`"lessonsCount" and "lastDate" are mutually exclusive`)
    }

    if (hasValue(body, 'lessonsCount')) {
      const { lessonsCount } = body
      if (!isInteger(lessonsCount, 1)) {
        throw new Error(`"lessonsCount" has invalid value`)
      }
      this.refines.lessonsCount = lessonsCount
    } else {
      this.refined.lessonsCount = 300
    }

    if (hasValue(body, 'lastDate')) {
      const lastDate = new Date(body.lastDate)
      if (isNaN(lastDate)) {
        throw new Error(`"lastDate" has invalid value`)
      }

      if (lastDate.valueOf() <= new Date(this.refined.actualFirstDate).valueOf()) {
        throw new Error(`"lastDate" must be after "firstDate"(with considering "days")`)
      }

      this.refined.lastDate = formatDate(lastDate)
    } else {
      const date = new Date(this.refined.firstDate)
      date.setUTCFullYear(date.getUTCFullYear() + 1)
      this.refined.lastDate = formatDate(date)
    }
  }

  /**
   * @param {Record<string, string|number|(string|number)[]>} body
   */
  constructor(body) {
    if (!body) {
      throw new Error('Body expected')
    }

    if (hasValue(body, 'title')) {
      this.refined.title = body.title.toString().trim()
    } else {
      this.refined.title = null
    }

    this.refineTeacherIds(body)
    this.refineDaysAndFirstDate(body)
    this.refineLessonsCountAndLastDate(body)
  }

  get firstDate() {
    return this.scalar('firstDate')
  }

  get title() {
    return this.scalar('title')
  }

  get dayShifts() {
    return this.vector('dayShifts')
  }

  get dowsCount() {
    return this.scalar('dowsCount')
  }

  get lessonsCount() {
    return this.scalar('lessonsCount')
  }

  get teacherIds() {
    return this.vector('teacherIds', ',', t => `(${t})`)
  }

  lastTable = 'lessons_inserted'

  get insertLT() {
    if (this.refined.teacherIds.length > 0) {
      this.lastTable = 'lt_inserted'
      return dedent`
      ,
      lt_inserted AS (
        INSERT
          INTO lesson_teachers (lesson_id, teacher_id)
        (
        SELECT
          L.id as lesson_id, T.id as teacher_id
        FROM
          lessons_inserted L
          CROSS JOIN (VALUES ${this.teacherIds}) T(id)
        )
        RETURNING lesson_id
      )
`
    }

    return ''
  }

  build() {
    return dedent`
      WITH
      RECURSIVE lessons_input(n, date, title) AS (
        VALUES (0, ${this.firstDate}::date, ${this.title})
        UNION ALL
        SELECT
          n + 1,
          date + (array[${this.dayShifts}])[(n % ${this.dowsCount})+1],
          title
        FROM
          lessons_input
        WHERE
          date + (array[${this.placeholders[dayShifts]}])[(n % ${this.placeholders[dowsCount]})+1] <= lastDate
      ),
      lessons_inserted AS (
        INSERT
          INTO lessons(date,title)
        (
          SELECT
            lessons_input.date, lessons_input.title
          FROM
            lessons_input
          LIMIT ${this.lessonsCount}
        )
        RETURNING id AS lesson_id
      )${this.insertLT}
      SELECT
        DISTINCT lesson_id
      FROM
        ${this.lastTable}
      ORDER BY lesson_id
`
  }
}

class GetQueryBuilder extends LessonsQueryBuilder {
  refineDate(urlQuery) {
    if (hasValue(urlQuery, 'date')) {
      const date = urlQuery.date.split(',')
      if (
        (date.length === 1 && isValidDate(date[0])) ||
        (date.length === 2 && isValidDate(date[0]) && isValidDate(date[1]))
      ) {
        this.refined.date = date
      } else {
        throw new Error('Invalid "date" format')
      }
    }
  }

  refineStatus(urlQuery) {
    if (hasValue(urlQuery, 'status')) {
      const status = parseInt(urlQuery.status)
      if (urlQuery.status === 0 || urlQuery.status === 1) {
        this.refined.status = urlQuery.status
      } else {
        throw new Error('Invalid "status" format')
      }
    }
  }

  refineTeacherIds(urlQuery) {
    if (hasValue(urlQuery, 'teacherIds')) {
      const teacherIds = urlQuery.teacherIds.split(',').map(id => parseInt(id))

      if (teacherIds.length === 0) {
        this.refined.teacherIds = null
        return
      }

      if (teacherIds.some(item => !isInteger(item, 1))) {
        throw new Error('"teacherIds" must be positive integers array')
      }

      this.refined.teacherIds = uniqueSort(teacherIds)
    }
  }

  refineStudentsCount(urlQuery) {
    if (hasValue(urlQuery, 'studentsCount')) {
      const studentsCount = urlQuery.studentsCount.split(',').map(c => parseInt(c))
      if (
        (studentsCount.length === 1 && isInteger(studentsCount[0], 0)) ||
        (studentsCount.length === 2 &&
          isInteger(studentsCount[0], 0) &&
          isInteger(studentsCount[1], 0))
      ) {
        this.refined.studentsCount = studentsCount
      } else {
        throw new Error('Invalid "studentsCount" format')
      }
    }
  }

  refinePagination(urlQuery) {
    if (hasValue(urlQuery, 'page')) {
      const page = parseInt(urlQuery.page)
      if (isInteger(page, 1)) {
        if (page > 1) {
          this.refined.page = page
        }
      } else {
        throw new Error('"page" must be positive integer')
      }
    }

    if (hasValue(urlQuery, 'lessonsPerPage')) {
      const lessonsPerPage = parseInt(urlQuery.lessonsPerPage)
      if (isInteger(lessonsPerPage, 1)) {
        this.refined.lessonsPerPage = lessonsPerPage
      } else {
        throw new Error('"lessonsPerPage" must be positive integer')
      }
    } else {
      this.refined.lessonsPerPage = 5
    }
  }

  /**
   * @param {Record<string, string>} urlQuery
   */
  constructor(urlQuery) {
    if (urlQuery) {
      this.refineDate(urlQuery)
      this.refineStatus(urlQuery)
      this.refineTeacherIds(urlQuery)
      this.refineStudentsCount(urlQuery)
      this.refinePagination(urlQuery)
    }
  }

  get whereL() {
    const conditions = []
    if (hasValue(this.refined, 'date')) {
      const { date } = this.refined
      if (date.length === 1) {
        conditions.push(`L.date=${this.vector('date')}`)
      } else if (date.length === 2) {
        conditions.push(`L.date between symmetric ${this.vector('date', ' and ')}`)
      }
    }

    if (hasValue(this.refined, 'status')) {
      conditions.push(`L.status=${this.scalar('status')}`)
    }

    if (conditions.length > 0) {
      return `WHERE ${conditions.map(c => `(${c})`).join(' and ')}`
    }

    return ''
  }

  get havingL() {
    if (hasValue(this.refined, 'studentsCount')) {
      const { studentsCount } = this.refined
      if (studentsCount.length === 1) {
        return `HAVING count(S.id)=${this.vector('studentsCount')}`
      } else if (studentsCount.length === 2) {
        return `HAVING count(S.id) between symmetric ${this.vector('studentsCount', ' and ')}`
      }
    }

    return ''
  }

  get havingLL() {
    if (hasValue(this.refined, 'teacherIds')) {
      const { teacherIds } = this.refined
      return (
        'HAVING coalesce(array_agg(LT.teacher_id) filter (where LT.teacher_id is not null), array[]::integer[]) && ' +
        `array[${this.vector('teacherIds')}]::integer[]`
      )
    }

    return ''
  }

  get limit() {
    return this.scalar('lessonsPerPage')
  }

  get offset() {
    if (hasValue(this.refined, 'page')) {
      return `OFFSET ${(this.scalar('page') - 1) * this.refined.lessonsPerPage}`
    }

    return ''
  }

  build() {
    return dedent`
      SELECT
        LL.id, LL.date, LL.title, LL.status,
        "visitCount",
        students,
        coalesce(
          jsonb_agg(json_build_object('id', T.id, 'name', T.name)) filter (where T.id is not null),
          jsonb_build_array()
        ) AS teachers
      FROM (
        SELECT
          L.id AS id,
          L.date AS date,
          L.title AS title,
          L.status AS status,
          count(S.id) filter(WHERE LS.visit) AS "visitCount",
          coalesce(
            jsonb_agg(json_build_object('id', S.id, 'name', S.name, 'visit', LS.visit)) filter (where S.id is NOT NULL),
            jsonb_build_array()
          ) AS students
        FROM
          lessons L
          LEFT JOIN lesson_students LS ON L.id=LS.lesson_id
          LEFT JOIN students S ON S.id=LS.student_id
        ${this.whereL}
        GROUP BY L.id
        ${this.havingL}
        ) AS LL
        LEFT JOIN lesson_teachers LT ON LL.id=LT.lesson_id
        LEFT JOIN teachers T ON T.id=LT.teacher_id
      GROUP BY LL.id, LL.date, LL.title, LL.status, LL."visitCount", LL.students
      ${this.havingLL}
      ORDER BY LL.id
      LIMIT ${this.limit}
      ${this.offset}
`
  }
}

class Service {
  /**
   * @type Client
   */
  client

  constructor(client) {
    this.client = client
  }

  async addLessons(body) {
    const builder = new AddQueryBuilder(body)
    const query = builder.build()
    const params = builder.queryParams

    console.log(query)
    console.log(params)

    return (await this.client.query(query, params)).rows
  }

  async getLessons(filter) {
    const builder = new GetQueryBuilder(body)
    const query = builder.build()
    const params = builder.queryParams

    console.log(query)
    console.log(params)

    return (await this.client.query(query, params)).rows
  }
}

exports.Service = Service
