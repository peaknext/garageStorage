import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ProcessingService } from './processing.service';
import { ThumbnailProcessor } from './processors/thumbnail.processor';
import { AdminProcessingController } from './admin-processing.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'thumbnail',
    }),
  ],
  providers: [ProcessingService, ThumbnailProcessor],
  controllers: [AdminProcessingController],
  exports: [ProcessingService],
})
export class ProcessingModule {}
