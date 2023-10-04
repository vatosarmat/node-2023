const toAppError = err => {
  if (Array.isArray(err)) {
    err = err[0]
  }

  if (err instanceof AppError) {
    return err
  }

  let code = 500
  let message = 'Internal server error'
  let data = undefined
  // if (err instanceof ValidationError) {
  //   code = 400
  //   message = `Property "${err.property}" validation failed`
  //   data = err.constraints
  // } else if (err instanceof JsonWebTokenError) {
  //   code = 401
  //   message = `Invalid authorization token`
  // } else if (err instanceof MError) {
  //   if (err instanceof MError.ValidationError) {
  //     code = 400
  //     message = err.message
  //   }
  // }

  if (code === 500) {
    console.log('Original error:')
    console.log(err)
  }

  return new AppError(code, message, data)
}

class AppError extends Error {
  constructor(code, message, data) {
    super(message)
    this.code = code
    this.message = message
    this.data = data
  }

  toObject() {
    const ret = { code: this.code, message: this.message }
    if (this.data) {
      ret.data = this.data
    }

    return ret
  }
}

exports.AppError = AppError
exports.toAppError = toAppError
