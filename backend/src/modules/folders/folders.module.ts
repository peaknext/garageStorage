import { Module } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { AdminFoldersController } from './admin-folders.controller';
import { FoldersController } from './folders.controller';

@Module({
  providers: [FoldersService],
  controllers: [AdminFoldersController, FoldersController],
  exports: [FoldersService],
})
export class FoldersModule {}
