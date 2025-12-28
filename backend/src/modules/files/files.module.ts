import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { AdminFilesController } from './admin-files.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  providers: [FilesService],
  controllers: [FilesController, AdminFilesController],
  exports: [FilesService],
})
export class FilesModule {}
