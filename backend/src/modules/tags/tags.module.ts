import { Module } from '@nestjs/common';
import { TagsService } from './tags.service';
import { AdminTagsController } from './admin-tags.controller';
import { TagsController, FileTagsController } from './tags.controller';

@Module({
  providers: [TagsService],
  controllers: [AdminTagsController, TagsController, FileTagsController],
  exports: [TagsService],
})
export class TagsModule {}
