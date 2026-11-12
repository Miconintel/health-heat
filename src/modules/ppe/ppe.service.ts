import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { WorkersService } from '../workers/workers.service';
import { RiskEngineService } from '../risk-engine/risk-engine.service';
import { PpeItem } from './entities/ppe-item.entity';
import { WorkerPpe } from './entities/worker-ppe.entity';
import { AssignPpeDto, CreatePpeItemDto } from './dto/ppe.dto';

@Injectable()
export class PpeService {
  constructor(
    @InjectRepository(PpeItem) private readonly items: Repository<PpeItem>,
    @InjectRepository(WorkerPpe)
    private readonly assigned: Repository<WorkerPpe>,
    private readonly workers: WorkersService,
    private readonly risk: RiskEngineService,
  ) {}

  listCatalogue(organizationId: string) {
    return this.items.find({
      where: [{ organizationId: IsNull() }, { organizationId }],
      order: { category: 'ASC', name: 'ASC' },
    });
  }

  createItem(organizationId: string, dto: CreatePpeItemDto) {
    return this.items.save(
      this.items.create({
        ...dto,
        engineClass: dto.engineClass ?? null,
        engineAddon: dto.engineAddon ?? null,
        organizationId,
      }),
    );
  }

  async listForWorker(user: AuthUser, workerId: string) {
    await this.workers.getAccessible(user, workerId);
    return this.assigned.find({ where: { workerId } });
  }

  async assign(user: AuthUser, workerId: string, dto: AssignPpeDto) {
    await this.workers.getAccessible(user, workerId);
    const catalogue = await this.items.find({
      where: [
        { id: In(dto.ppeItemIds), organizationId: IsNull() },
        { id: In(dto.ppeItemIds), organizationId: user.organizationId },
      ],
    });
    if (catalogue.length !== dto.ppeItemIds.length)
      throw new BadRequestException('Unknown PPE item');

    await this.assigned.manager.transaction(async (tx) => {
      await tx.delete(WorkerPpe, { workerId });
      await tx.insert(
        WorkerPpe,
        dto.ppeItemIds.map((ppeItemId) => ({ workerId, ppeItemId })),
      );
    });
    // Clothing changed: reassess now (engine guide §7). Runs in the background.
    this.risk.reassessWorkerInBackground(user.organizationId, workerId);
    return this.assigned.find({ where: { workerId } });
  }
}
