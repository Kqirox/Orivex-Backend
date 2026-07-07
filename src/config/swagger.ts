import swaggerJsdoc from 'swagger-jsdoc'


const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Orivex API Documentation',
      version: '1.0.0',
      description: 'Comprehensive API documentation for Orivex - a decentralized learn-to-earn platform on Stellar',
      contact: {
        name: 'Orivex-Backend Contributors',
        url: 'https://github.com/Kqirox/Orivex-Backend',
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

