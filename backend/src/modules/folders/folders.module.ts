import { Module } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { AdminFoldersController } from './admin-folders.controller';

@Module({
  providers: [FoldersService],
  controllers: [AdminFoldersController],
  exports: [FoldersService],
})
export class FoldersModule {}
