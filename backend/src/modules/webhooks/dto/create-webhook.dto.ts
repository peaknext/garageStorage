import { IsString, IsArray, IsUrl, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({
    description: 'Webhook URL',
    example: 'https://example.com/webhooks/storage',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'Events to subscribe to',
    example: ['file.uploaded', 'file.deleted'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events: string[];
}
