import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Role } from '../../common/enums';
import { User } from './entities/user.entity';
import { Worker } from '../workers/entities/worker.entity';
import { CreateUserDto } from './dto/create-user.dto';

export const normaliseLoginId = (id: string) => id.trim().toUpperCase();

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
  ) {}

  async create(organizationId: string, dto: CreateUserDto) {
    let loginId = dto.loginId ? normaliseLoginId(dto.loginId) : null;

    if (dto.role === Role.WORKER) {
      if (!dto.workerId)
        throw new BadRequestException(
          'workerId is required for worker accounts',
        );
      const worker = await this.workers.findOneBy({
        id: dto.workerId,
        organizationId,
      });
      if (!worker) throw new NotFoundException('Worker not found');
      loginId ??= normaliseLoginId(worker.employeeCode);
    } else if (dto.workerId) {
      throw new BadRequestException(
        'Only worker accounts may be linked to a worker',
      );
    }
    if (!loginId) throw new BadRequestException('loginId is required');

    if (await this.users.existsBy({ loginId }))
      throw new ConflictException('Login ID already in use');
    const email = dto.email?.toLowerCase() ?? null;
    if (email && (await this.users.existsBy({ email })))
      throw new ConflictException('Email already in use');

    const saved = await this.users.save(
      this.users.create({
        organizationId,
        loginId,
        email,
        pinHash: await bcrypt.hash(dto.pin, 12),
        role: dto.role,
        workerId: dto.workerId ?? null,
      }),
    );
    return this.toView(saved);
  }

  /** Admin: set a new PIN and clear any lockout. */
  async resetPin(organizationId: string, userId: string, pin: string) {
    const user = await this.users.findOneBy({ id: userId, organizationId });
    if (!user) throw new NotFoundException();
    await this.users.update(
      { id: userId },
      {
        pinHash: await bcrypt.hash(pin, 12),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    );
    return { reset: true };
  }

  async findById(id: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException();
    return this.toView(user);
  }

  async list(organizationId: string) {
    const rows = await this.users.find({
      where: { organizationId },
      order: { loginId: 'ASC' },
    });
    return rows.map((u) => this.toView(u));
  }

  /** Includes the PIN hash and lockout state – for authentication only. */
  findForLogin(loginId: string) {
    return this.users
      .createQueryBuilder('u')
      .addSelect(['u.pinHash', 'u.failedLoginCount', 'u.lockedUntil'])
      .where('u.loginId = :loginId', { loginId: normaliseLoginId(loginId) })
      .getOne();
  }

  recordLoginFailure(
    id: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
  ) {
    return this.users.update({ id }, { failedLoginCount, lockedUntil });
  }

  recordLoginSuccess(id: string) {
    return this.users.update(
      { id },
      { failedLoginCount: 0, lockedUntil: null },
    );
  }

  private toView(u: User) {
    return {
      id: u.id,
      organizationId: u.organizationId,
      loginId: u.loginId,
      email: u.email,
      role: u.role,
      workerId: u.workerId,
      isActive: u.isActive,
    };
  }
}
