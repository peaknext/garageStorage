import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject } from 'rxjs';

export interface ServerEvent {
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

@Injectable()
export class EventsService {
  private events$ = new Subject<ServerEvent>();

  getEventStream() {
    return this.events$.asObservable();
  }

  private emit(type: string, data: Record<string, any>) {
    this.events$.next({
      type,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent('file.uploaded')
  handleFileUploaded(payload: any) {
    this.emit('file.uploaded', payload);
  }

  @OnEvent('file.deleted')
  handleFileDeleted(payload: any) {
    this.emit('file.deleted', payload);
  }

  @OnEvent('file.restored')
  handleFileRestored(payload: any) {
    this.emit('file.restored', payload);
  }

  @OnEvent('thumbnail.generated')
  handleThumbnailGenerated(payload: any) {
    this.emit('thumbnail.generated', payload);
  }

  @OnEvent('policy.executed')
  handlePolicyExecuted(payload: any) {
    this.emit('policy.executed', payload);
  }

  @OnEvent('quota.warning')
  handleQuotaWarning(payload: any) {
    this.emit('quota.warning', payload);
  }

  @OnEvent('quota.critical')
  handleQuotaCritical(payload: any) {
    this.emit('quota.critical', payload);
  }
}
