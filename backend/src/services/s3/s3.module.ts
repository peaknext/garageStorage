import { Global, Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { GarageAdminService } from './garage-admin.service';

@Global()
@Module({
  providers: [S3Service, GarageAdminService],
  exports: [S3Service, GarageAdminService],
})
export class S3Module {}
