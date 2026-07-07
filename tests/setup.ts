import { config } from 'dotenv'

config({ path: '.env.test' })

process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/orivex'