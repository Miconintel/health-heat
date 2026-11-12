import { Global, Module } from '@nestjs/common';
import { EngineClient } from './engine.client';
import { EngineKeepAlive } from './engine.keepalive';

@Global()
@Module({
  providers: [EngineClient, EngineKeepAlive],
  exports: [EngineClient],
})
export class AiEngineModule {}
