/**
 * Interaction kit (ADR 0026, docs/ui.md §8–12). Import app-level UI feedback from here:
 * `import { Button, StateView } from "@/components/kit";`
 */
export { Button, type ButtonState, type KitButtonProps } from "./button";
export {
  AnimatedIcon,
  DrawCheck,
  type AnimatedIconProps,
  type IconAnimation,
} from "./animated-icon";
export {
  StateView,
  SpotPlaceholder,
  type AccessReason,
  type StateAction,
  type StateViewProps,
  type UIState,
} from "./state-view";
export { TxTracker, type TxStatus, type TxTrackerProps } from "./tx-tracker";
export { ErrorBoundary, type ErrorBoundaryPreset, type ErrorBoundaryProps } from "./error-boundary";
export { InlineAlert, type InlineAlertProps, type InlineAlertTone } from "./inline-alert";
export { Details } from "./details";
export { Toaster } from "./toaster";
export { GlobalErrorHandlers } from "./global-error-handlers";
