import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import swaggerUi from 'swagger-ui-express'
import { specs } from './config/swagger'
import routes from './routes'
import { errorHandler, notFoundHandler } from './middleware/error.middleware'
import { requestIdMiddleware } from './middleware/request-id.middleware'

const app: express.Application = express()

// Request ID must run before access logs and routes so every downstream
// log line and response can correlate on the same identifier.
app.use(requestIdMiddleware)

app.use(express.json())
app.use(
  cors({
    // Browser clients cannot read X-Request-Id unless it is explicitly exposed.
    exposedHeaders: ['X-Request-Id'],
  }),
)
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for Swagger UI to work correctly
}))

morgan.token('id', (req) => (req as express.Request).requestId ?? '-')
app.use(morgan(':id :method :url :status :response-time ms - :res[content-length]'))

// API routes
app.use('/api', routes)

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs))

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404 handler - must be after all routes
app.use(notFoundHandler)

// Global error handler - must be last
app.use(errorHandler)

export default app
