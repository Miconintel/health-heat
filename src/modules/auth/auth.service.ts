import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 5;
const DUMMY_HASH =
  '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';

interface TokenSubject {
  id: string;
  organizationId: string;
  role: string;
  workerId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Login ID + PIN. After MAX_ATTEMPTS wrong PINs the account is locked for
   * LOCK_MINUTES; the response never says whether the ID exists or is locked.
   */
  async login(loginId: string, pin: string) {
    const user = await this.users.findForLogin(loginId);
    // Compare even when the user is missing so response time doesn't reveal which IDs exist.
    const ok = await bcrypt.compare(pin, user?.pinHash ?? DUMMY_HASH);
    const fail = () => new UnauthorizedException('Invalid ID or PIN');
    if (!user || !user.isActive) throw fail();

    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > now) throw fail();

    if (!ok) {
      const count = user.failedLoginCount + 1;
      const locked =
        count >= MAX_ATTEMPTS ? new Date(now + LOCK_MINUTES * 60_000) : null;
      // After a lock, the next round of attempts starts from zero.
      await this.users.recordLoginFailure(user.id, locked ? 0 : count, locked);
      throw fail();
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.users.recordLoginSuccess(user.id);
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException();
    const user = await this.users.findById(payload.sub);
    if (!user.isActive) throw new UnauthorizedException();
    return this.issueTokens(user);
  }

  private async issueTokens(user: TokenSubject) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        org: user.organizationId,
        role: user.role,
        wid: user.workerId,
        typ: 'access',
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_ACCESS_TTL'),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_REFRESH_TTL'),
      },
    );
    return { accessToken, refreshToken };
  }
}
