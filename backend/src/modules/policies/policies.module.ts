import { Module } from '@nestjs/common';
import { PoliciesService } from './policies.service';
import { PolicyExecutorService } from './policy-executor.service';
import { AdminPoliciesController } from './admin-policies.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  providers: [PoliciesService, PolicyExecutorService],
  controllers: [AdminPoliciesController],
  exports: [PoliciesService],
})
export class PoliciesModule {}
