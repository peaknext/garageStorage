import { Controller, Sse, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EventsService } from './events.service';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@ApiTags('admin-events')
@Controller('admin/events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Sse('stream')
  @ApiOperation({ summary: 'Subscribe to real-time server events (SSE)' })
  stream(): Observable<MessageEvent> {
    return this.eventsService.getEventStream().pipe(
      map((event) => ({
        data: JSON.stringify(event),
        type: event.type,
        retry: 15000,
      })),
    );
  }
}
