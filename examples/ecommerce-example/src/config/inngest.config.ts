import { registerAs } from '@nestjs/config';

export default registerAs('inngest', () => ({
  appId: process.env.INNGEST_APP_ID || 'ecommerce-example',
  signingKey: process.env.INNGEST_SIGNING_KEY,
  eventKey: process.env.INNGEST_EVENT_KEY,
  devServerUrl: process.env.INNGEST_DEV_SERVER_URL || 'http://localhost:8288',
}));