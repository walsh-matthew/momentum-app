import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

// The shadcn/ui Button (base-nova), ported from the wireframe onto this repo's tokens. The wireframe's copy sits
// on @base-ui/react's Button primitive; this one is a native <button>, which is all it did. Sizes keep the 44px
// touch target the app already used (min-h-11) for the default and large sizes.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground primary-hover',
        outline: 'border-input bg-foreground/[0.03] text-foreground hover:bg-foreground/[0.07]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-foreground hover:bg-foreground/[0.07]',
        destructive: 'bg-destructive/15 text-danger hover:bg-destructive/25',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-4',
        sm: 'min-h-9 px-3 text-[0.8rem]',
        lg: 'min-h-12 px-5',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

// type defaults to "button" so a Button inside a form never submits it by accident.
export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
