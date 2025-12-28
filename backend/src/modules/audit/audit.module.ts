import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AdminAuditController } from './admin-audit.controller';

@Global()
@Module({
  providers: [AuditService],
  controllers: [AdminAuditController],
  exports: [AuditService],
})
export class AuditModule {}
