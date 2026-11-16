import { EventEmitter } from 'node:events'
import type { AppEvent } from '../shared/types'

export const bus = new EventEmitter()

export function emitEvent(event: AppEvent): void {
  bus.emit('app-event', event)
}