import swaggerJsdoc from 'swagger-jsdoc'


const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Learnault API Documentation',
      version: '1.0.0',
      description: 'Comprehensive API documentation for Learnault - a decentralized learn-to-earn platform on Stellar',
      contact: {
        name: 'Learnault Contributors',
        url: 'https://github.com/learnault/learnault',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'Main API base path',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/controllers/**/*.ts', './src/docs/*.ts'], // Path to the API docs
}

export const specs = swaggerJsdoc(options)

