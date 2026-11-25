import { EventEmitter } from 'node:events';

const updates = new EventEmitter();
updates.setMaxListeners(0);

export function publishApplicationUpdate(ownerId) {
  updates.emit(String(ownerId));
}

export function subscribeApplicationUpdates(ownerId, listener) {
  const key = String(ownerId);
  updates.on(key, listener);
  return () => updates.off(key, listener);
}

export function publishPresence(ownerId) {
  updates.emit(`presence:${ownerId}`);
}

export function subscribePresence(ownerId, listener) {
  const key = `presence:${ownerId}`;
  updates.on(key, listener);
  return () => updates.off(key, listener);
}
