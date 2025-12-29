import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { AdminFilesController } from './admin-files.controller';
import { AdminOrphanController } from './admin-orphan.controller';
import { OrphanService } from './orphan.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  providers: [FilesService, OrphanService],
  controllers: [FilesController, AdminFilesController, AdminOrphanController],
  exports: [FilesService, OrphanService],
})
export class FilesModule {}
