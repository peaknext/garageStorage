import { Module } from '@nestjs/common';
import { TagsService } from './tags.service';
import { AdminTagsController } from './admin-tags.controller';

@Module({
  providers: [TagsService],
  controllers: [AdminTagsController],
  exports: [TagsService],
})
export class TagsModule {}
