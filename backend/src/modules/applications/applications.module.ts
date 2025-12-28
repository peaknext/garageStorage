import { Module } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { AdminApplicationsController } from './admin-applications.controller';

@Module({
  providers: [ApplicationsService],
  controllers: [ApplicationsController, AdminApplicationsController],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
