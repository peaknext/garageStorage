import { Module, forwardRef } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController, FilesSearchController } from './files.controller';
import { AdminFilesController } from './admin-files.controller';
import { AdminOrphanController } from './admin-orphan.controller';
import { OrphanService } from './orphan.service';
import { RecycleBinService } from './recycle-bin.service';
import { RecycleBinController, BucketRecycleBinController } from './recycle-bin.controller';
import { AdminRecycleBinController, AdminBucketRecycleBinController } from './admin-recycle-bin.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ProcessingModule } from '../processing/processing.module';

@Module({
  imports: [WebhooksModule, forwardRef(() => ProcessingModule)],
  providers: [FilesService, OrphanService, RecycleBinService],
  controllers: [
    FilesController,
    FilesSearchController,
    AdminFilesController,
    AdminOrphanController,
    RecycleBinController,
    BucketRecycleBinController,
    AdminRecycleBinController,
    AdminBucketRecycleBinController,
  ],
  exports: [FilesService, OrphanService, RecycleBinService],
})
export class FilesModule {}
