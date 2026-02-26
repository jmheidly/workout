import { Dialog as DialogPrimitive } from 'bits-ui'

export { default as DialogContent } from './dialog-content.svelte'
export { default as DialogOverlay } from './dialog-overlay.svelte'

export const DialogRoot = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description
export const DialogClose = DialogPrimitive.Close
