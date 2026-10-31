'use client';

import { Button, type ButtonProps } from '@/components/ui/button';
import { busyProps } from '@/lib/forms/mainButton';

export interface MainButtonProps extends Omit<ButtonProps, 'variant' | 'disabled'> {
  // Work is in flight: the button stays solid, says it is busy and ignores taps (lib/forms/mainButton.ts).
  busy?: boolean;
  // The button's own busy word ("Saving…"); the label stays as it is without one.
  busyLabel?: string;
}

// The solid accent button of a screen: never disabled and never faded (MOM-145).
export function MainButton({ busy = false, busyLabel, children, onClick, ...props }: MainButtonProps) {
  return (
    <Button {...props} {...busyProps<HTMLButtonElement>(busy, onClick)}>
      {busy && busyLabel ? busyLabel : children}
    </Button>
  );
}
