/**
 * Open the Dispatch panel from anywhere: the header, ⌘K, a client page, My Clients, a task.
 * The panel listens for this event (it is mounted once, in the app shell).
 */

export const DISPATCH_OPEN_EVENT = "foundry:dispatch";

export interface OpenDispatchDetail {
  /** The client the chat is about. */
  clientSlug?: string;
  /** The task it was opened from: offers the task quick actions and names it to Dispatch. */
  taskId?: string;
  /** Text to put in the box (not sent). */
  prompt?: string;
}

export function openDispatch(detail: OpenDispatchDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenDispatchDetail>(DISPATCH_OPEN_EVENT, { detail }));
}
