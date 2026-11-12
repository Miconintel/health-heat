import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/** Requires the docker-compose Postgres and a populated .env. */
describe('HeatGuard API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public and reports the database', () =>
    request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', database: 'up' }));

  it('protected routes reject requests without a token', () =>
    request(app.getHttpServer()).get('/sites').expect(401));

  it('rejects bad credentials', () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ loginId: 'NOBODY-1', pin: '0000' })
      .expect(401));
});
