import Redis from 'ioredis';

if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
  throw new Error("REDIS_HOST and REDIS_PORT are required");
}
const redis = new Redis(Number(process.env.REDIS_PORT), process.env.REDIS_HOST, {
  password: process.env.REDIS_PASSWORD,
});

export default redis;