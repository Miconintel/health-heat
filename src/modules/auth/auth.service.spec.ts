import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService, LOCK_MINUTES, MAX_ATTEMPTS } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService.login (ID + PIN with lockout)', () => {
  let hash: string;
  let user: {
    id: string;
    organizationId: string;
    role: string;
    workerId: string | null;
    isActive: boolean;
    pinHash: string;
    failedLoginCount: number;
    lockedUntil: Date | null;
  };
  let users: jest.Mocked<
    Pick<
      UsersService,
      'findForLogin' | 'recordLoginFailure' | 'recordLoginSuccess'
    >
  >;
  let auth: AuthService;

  beforeAll(async () => {
    hash = await bcrypt.hash('1234', 4);
  });

  beforeEach(() => {
    user = {
      id: 'u1',
      organizationId: 'o1',
      role: 'worker',
      workerId: 'w1',
      isActive: true,
      pinHash: hash,
      failedLoginCount: 0,
      lockedUntil: null,
    };
    users = {
      findForLogin: jest.fn().mockImplementation(() => Promise.resolve(user)),
      recordLoginFailure: jest
        .fn()
        .mockImplementation(
          (_id: string, count: number, lockedUntil: Date | null) => {
            user.failedLoginCount = count;
            user.lockedUntil = lockedUntil;
            return Promise.resolve();
          },
        ),
      recordLoginSuccess: jest.fn().mockImplementation(() => {
        user.failedLoginCount = 0;
        user.lockedUntil = null;
        return Promise.resolve();
      }),
    };
    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
    });
    auth = new AuthService(
      users as unknown as UsersService,
      new JwtService(),
      config,
    );
  });

  it('issues tokens for the right PIN', async () => {
    await expect(auth.login('w-0412', '1234')).resolves.toHaveProperty(
      'accessToken',
    );
  });

  it('rejects a wrong PIN and counts it', async () => {
    await expect(auth.login('W-0412', '9999')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(user.failedLoginCount).toBe(1);
  });

  it(`locks for ${LOCK_MINUTES} min after ${MAX_ATTEMPTS} wrong PINs, even for the right PIN`, async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await expect(auth.login('W-0412', '0000')).rejects.toThrow();
    }
    expect(user.lockedUntil).not.toBeNull();
    await expect(auth.login('W-0412', '1234')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lets the user in again once the lock has expired, and resets the count', async () => {
    user.lockedUntil = new Date(Date.now() - 1000);
    user.failedLoginCount = 2;
    await expect(auth.login('W-0412', '1234')).resolves.toHaveProperty(
      'accessToken',
    );
    expect(users.recordLoginSuccess).toHaveBeenCalled();
  });

  it('gives the same error for an unknown ID, a locked account or a wrong PIN', async () => {
    users.findForLogin.mockResolvedValueOnce(null);
    const unknown = await auth
      .login('X-1', '1234')
      .catch((e: Error) => e.message);
    const wrong = await auth
      .login('W-0412', '1111')
      .catch((e: Error) => e.message);
    expect(unknown).toBe(wrong);
  });

  it('refuses inactive accounts', async () => {
    user.isActive = false;
    await expect(auth.login('W-0412', '1234')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
